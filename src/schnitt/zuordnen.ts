import fs from "node:fs";
import type { Markenprofil } from "../core/schemas";
import type { StudioHome } from "../setup";
import { messePegel, ordneZuMitPegel } from "./energie";
import { bauePlan, type Markierung } from "./planbau";
import type { Schnittplan, SchnittQuelle } from "./plan";
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
  /** Zeilen, deren Untertitel den gesprochenen statt den Skripttext nehmen. */
  gesprochen?: number[];
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
    const dateien = new Map(videos.map((q) => [q.id, loesePfad(home, q.pfad)]));
    const fehlt = e.transkripte.map((t) => dateien.get(t.quelle)!).filter((d) => !fs.existsSync(d));
    if (fehlt.length) pegelNotiz = `Energie nicht gemessen: Datei fehlt auf diesem Rechner (${fehlt[0]})`;
    else messe = (q, von, bis) => messePegel(dateien.get(q)!, von, bis);
  }
  const zuordnung = messe ? await ordneZuMitPegel(zeilen, e.transkripte, messe) : ordneZu(zeilen, e.transkripte);

  const { plan, markierungen } = bauePlan(zuordnung, {
    projekt: { name: e.name, ...(e.inhalt ? { inhalt: e.inhalt } : {}), marke: e.marke.schluessel },
    quellen: e.quellen,
    ...(e.marke.schnittprofil ? { profil: e.marke.schnittprofil } : {}),
    gesprochen: e.gesprochen ?? [],
  });
  return { plan, zuordnung, markierungen, pegelNotiz };
}
