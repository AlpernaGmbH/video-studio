import fs from "node:fs";
import type { Markenprofil } from "../core/schemas";
import type { StudioHome } from "../setup";
import { messePegel, ordneZuMitPegel } from "./energie";
import { bauePlan, type Markierung } from "./planbau";
import type { Stille } from "./stille";
import { externerTon, type Schnittplan, type SchnittQuelle } from "./plan";
import type { Segment } from "./transkript";
import { loesePfad } from "./uebergabe";
import { ordneZu, skriptZeilen, type Zuordnung } from "./zuordnung";

/**
 * Skript und Whisper-Transkripte zu einem Schnittplan. Das ist der Kern von `schnitt zuordnen`; `reel vorbereiten` ruft ihn auch auf.
 * Die Energie (Pegel) wird nur gemessen, wenn das Material auf diesem Rechner liegt: sonst steht der Grund in `pegelNotiz`.
 */

export interface ZuordnenEingabe {
  marke: Markenprofil;
  skriptText: string;
  /** Nur für die Fehlermeldung bei einem leeren Skript. */
  skriptQuelle: string;
  quellen: SchnittQuelle[];
  transkripte: { quelle: string; segmente: Segment[] }[];
  name: string;
  inhalt?: string;
  /** Zeilen, deren Untertitel den gesprochenen Text nehmen, auch wenn `untertitel` «skript» ist. */
  gesprochen?: number[];
  /** Untertitel nach dem Gehörten (Standard) oder nach dem Skript. */
  untertitel?: "gehoert" | "skript";
  /** Stille je Quelle (ffmpeg silencedetect), damit Schnitte in der Stille landen. */
  stille?: ReadonlyMap<string, Stille[]>;
  home?: StudioHome;
  ohnePegel?: boolean;
}

export interface ZuordnenErgebnis {
  plan: Schnittplan;
  zuordnung: Zuordnung;
  markierungen: Markierung[];
  pegelNotiz: string;
}

export async function fuehreZuordnungAus(e: ZuordnenEingabe): Promise<ZuordnenErgebnis> {
  const zeilen = skriptZeilen(e.skriptText);
  if (!zeilen.length) throw new Error(`Das Skript ${e.skriptQuelle} enthält keinen Satz`);
  const videos = e.quellen.filter((q) => q.art === "video");

  let messe: ((q: string, von: number, bis: number) => Promise<number | undefined>) | null = null;
  let pegelNotiz = "";
  if (e.ohnePegel === true) pegelNotiz = "Energie nicht gemessen (--ohne-pegel)";
  else if (!e.home) pegelNotiz = "Energie nicht gemessen: Der Studio-Ordner ist auf diesem Rechner nicht eingerichtet";
  else {
    const home = e.home;
    // Mit getrenntem Ton misst der Pegel die Tonaufnahme an der um den Versatz verschobenen Stelle, nicht die Kameraspur
    const nachId = new Map(e.quellen.map((q) => [q.id, q]));
    const messquelle = new Map(
      videos.map((q) => {
        const ton = externerTon(q, nachId);
        return [q.id, { datei: loesePfad(home, (ton?.audio ?? q).pfad), versatz: ton?.versatz ?? 0 }] as const;
      }),
    );
    const fehlt = e.transkripte.map((t) => messquelle.get(t.quelle)!.datei).filter((d) => !fs.existsSync(d));
    if (fehlt.length) pegelNotiz = `Energie nicht gemessen: Datei fehlt auf diesem Rechner (${fehlt[0]})`;
    else
      messe = (q, von, bis) => {
        const m = messquelle.get(q)!;
        return messePegel(m.datei, Math.max(0, von + m.versatz), Math.max(0, bis + m.versatz));
      };
  }
  const zuordnung = messe ? await ordneZuMitPegel(zeilen, e.transkripte, messe) : ordneZu(zeilen, e.transkripte);

  const { plan, markierungen } = bauePlan(zuordnung, {
    projekt: { name: e.name, ...(e.inhalt ? { inhalt: e.inhalt } : {}), marke: e.marke.schluessel },
    quellen: e.quellen,
    ...(e.marke.schnittprofil ? { profil: e.marke.schnittprofil } : {}),
    gesprochen: e.gesprochen ?? [],
    ...(e.untertitel ? { untertitel: e.untertitel } : {}),
    ...(e.stille ? { stille: e.stille } : {}),
  });
  return { plan, zuordnung, markierungen, pegelNotiz };
}
