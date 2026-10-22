import fs from "node:fs";
import path from "node:path";
import type { Markenprofil } from "../core/schemas";
import { bereichsHinweis, erkenneFarbe, loeseLook, schlageLevelsVor, type Bereich, type Farbart, type Farbmessung, type Farburteil, type LogProfil } from "./farbe";
import { baueCube } from "./lut";
import type { SchnittQuelle } from "./plan";
import { baueVlogCube } from "./vlog-lut";
import { blendenUeberGrau } from "./vlog";

/**
 * Der Ablauf für Farbe in `reel vorbereiten` (Plan v4, 1.4): Farbart der Videos feststellen, aus dem Look der Marke und dem Material LUTs bauen,
 * und für Vorschau und Übergabe wiederfinden. Die LUTs liegen je Inhalt unter `ergebnis/lut/`, weil Schwarz- und Weisspunkt am Material gemessen sind.
 */

export const LUT_DATEIEN = { log: "farbe-log.cube", angleich: "farbe-angleich.cube" } as const;
export interface LutPfade {
  log?: string;
  angleich?: string;
}

export const lutOrdner = (ergebnis: string): string => path.join(ergebnis, "lut");

/** Die LUTs, die zu diesem Ergebnisordner gehören (nur die, die es gibt). */
export function findeLuts(ergebnis: string): LutPfade {
  const dir = lutOrdner(ergebnis);
  const aus: LutPfade = {};
  for (const art of ["log", "angleich"] as const) {
    const datei = path.join(dir, LUT_DATEIEN[art]);
    if (fs.existsSync(datei)) aus[art] = datei;
  }
  return aus;
}

const f2 = (n: number): string => n.toFixed(2).replace(".", ",");
const f1 = (n: number): string => n.toFixed(1).replace(".", ",");

export interface FarbeErgebnis {
  /** Farbart je Videoquelle. Fehlt eine, ließ sich nichts messen. */
  farbart: Map<string, Farbart>;
  messungen: Map<string, Farbmessung>;
  meldungen: string[];
}

/**
 * Stellt die Farbart jedes Videos fest. `vorgabe` (von Hand, `--farbe`) gilt für alle und wird nicht gemessen.
 * Unsichere Urteile werden gemeldet mit dem Weg, sie zu ändern.
 */
export async function bestimmeFarbe(o: {
  videos: { id: string; datei: string; dauer: number }[];
  vorgabe?: Farbart;
  /** Das Log-Profil der Marke oder des Inhalts: «vlog» lässt bei einem Widerspruch zwischen Etikett und Bild die Marke entscheiden und meldet zu Log-Material den Datenbereich. */
  profil?: LogProfil;
  /** Der von Hand gesetzte Datenbereich (`--bereich`), nur für die Hinweise. */
  bereich?: Bereich;
  erkenne?: (datei: string, dauer: number, profil?: LogProfil) => Promise<{ urteil: Farburteil; messung: Farbmessung } | undefined>;
}): Promise<FarbeErgebnis> {
  const farbart = new Map<string, Farbart>();
  const messungen = new Map<string, Farbmessung>();
  const meldungen: string[] = [];
  const erkenne = o.erkenne ?? erkenneFarbe;
  /** Die Hinweise zu V-Log-Material: Datenbereich und Belichtung. Nur mit dem Profil «vlog» und nur für Log. */
  const logHinweise = (id: string, m: Farbmessung | undefined): void => {
    if (o.profil !== "vlog" || !m) return;
    const b = bereichsHinweis(m, o.bereich);
    if (b) meldungen.push(`Farbe: ${id}: ${b}`);
    const bl = belichtungsHinweis(m, o.bereich);
    if (bl) meldungen.push(`Farbe: ${id}: ${bl}`);
  };
  for (const v of o.videos) {
    if (o.vorgabe) {
      farbart.set(v.id, o.vorgabe);
      meldungen.push(`Farbe: ${v.id}: ${o.vorgabe === "log" ? "Log" : "normal (Rec. 709)"} (von Hand, --farbe)`);
      // Der Weisspunkt und die Hinweise brauchen trotzdem die Messung, wenn es Log ist
      if (o.vorgabe === "log") {
        const r = await erkenne(v.datei, v.dauer, o.profil).catch(() => undefined);
        if (r) {
          messungen.set(v.id, r.messung);
          logHinweise(v.id, r.messung);
        }
      }
      continue;
    }
    let r: Awaited<ReturnType<typeof erkenneFarbe>>;
    try {
      r = await erkenne(v.datei, v.dauer, o.profil);
    } catch (e) {
      meldungen.push(`Farbe: ${v.id}: nicht gemessen (${(e as Error).message})`);
      continue;
    }
    if (!r) {
      meldungen.push(`Farbe: ${v.id}: nicht gemessen (keine Bilder lesbar)`);
      continue;
    }
    farbart.set(v.id, r.urteil.farbe);
    messungen.set(v.id, r.messung);
    const name = r.urteil.farbe === "log" ? "Log (flach)" : "normal (Rec. 709)";
    meldungen.push(r.urteil.sicher ? `Farbe: ${v.id}: ${name}. ${r.urteil.grund}` : `Farbe: ${v.id}: sieht nach ${name} aus, unsicher. ${r.urteil.grund}. Stimmt das nicht: «--farbe ${r.urteil.farbe === "log" ? "rec709" : "log"}»`);
    if (r.urteil.farbe === "log") logHinweise(v.id, r.messung);
  }
  return { farbart, messungen, meldungen };
}

/**
 * Wie weit die mittlere Helligkeit des Bildes von 18 % Grau (V-Log-Code 433) entfernt liegt, in Blenden, als Hinweis zur Belichtung. Keine Automatik: Ein Bild mit grossen hellen oder
 * dunklen Flächen liegt im Mittel anders, ohne falsch belichtet zu sein. Gerechnet wird mit dem Datenbereich, der gilt (von Hand, sonst Etikett, sonst begrenzt wie bei jedem Video).
 */
export function belichtungsHinweis(m: Pick<Farbmessung, "yMittelCode" | "bereichEtikett">, gewaehlt?: Bereich): string | undefined {
  if (m.yMittelCode === undefined) return undefined;
  const bereich: Bereich = gewaehlt ?? m.bereichEtikett ?? "begrenzt";
  const v = bereich === "voll" ? m.yMittelCode / 1023 : (m.yMittelCode - 64) / 876;
  const blenden = blendenUeberGrau(v);
  if (!Number.isFinite(blenden)) return undefined;
  const r = Math.round(blenden * 10) / 10;
  const text = r === 0 ? "genau bei 18 % Grau" : `${f1(Math.abs(r))} Blenden ${r > 0 ? "über" : "unter"} 18 % Grau`;
  const vorschlag = Math.abs(r) >= 0.5 ? ` Zum Ausgleichen: «--belichtung ${(-r).toFixed(1)}» (Blenden, plus = heller). Nur ein Anhaltspunkt: Ein Bild mit vielen hellen oder dunklen Flächen liegt im Mittel anders, ohne falsch belichtet zu sein.` : "";
  return `mittlere Helligkeit ${text} (Bereich ${bereich}).${vorschlag}`;
}

/**
 * Schreibt die LUTs für diesen Inhalt: «log» für Quellen mit Log (Schwarz- und Weisspunkt aus der Messung, wenn die Marke sie nicht fest vorgibt) und «angleich» für alles andere
 * (normales Material, B-Roll). Ohne Look in der Marke gibt es keine LUT. Nicht mehr nötige LUTs werden gelöscht, damit eine alte nicht in die Übergabe gerät.
 */
export function schreibeLuts(o: { ergebnis: string; marke: Markenprofil; quellen: SchnittQuelle[]; messungen: ReadonlyMap<string, Farbmessung>; profil?: LogProfil; belichtung?: number }): { pfade: LutPfade; meldungen: string[] } {
  const dir = lutOrdner(o.ergebnis);
  const pfade: LutPfade = {};
  const meldungen: string[] = [];
  const look = o.marke.farbe;
  const profil: LogProfil = o.profil ?? look?.logProfil ?? "generisch";
  for (const art of ["log", "angleich"] as const) fs.rmSync(path.join(dir, LUT_DATEIEN[art]), { force: true });
  if (!look && profil !== "vlog") {
    meldungen.push(`Look: Das Markenprofil «${o.marke.schluessel}» hat keinen Look in Zahlen (Feld «farbe»): keine LUT, das Material bleibt unverändert`);
    return { pfade, meldungen };
  }
  const logQuellen = o.quellen.filter((q) => q.art === "video" && q.farbe === "log");
  fs.mkdirSync(dir, { recursive: true });
  if (profil === "vlog") {
    // Bei V-Log wird die LUT immer geschrieben, auch ohne Log-Clip: Die B-Roll aus der Kamera kommt erst mit dem Storyboard dazu.
    const belichtung = o.belichtung ?? look?.belichtung ?? 0;
    const datei = path.join(dir, LUT_DATEIEN.log);
    fs.writeFileSync(datei, baueVlogCube(`${o.marke.name} V-Log`, look?.vlog, { belichtung }));
    pfade.log = datei;
    meldungen.push(
      `Look: ${LUT_DATEIEN.log} (V-Log nach Rec. 709, Umrechnung von Panasonic, Belichtung ${belichtung >= 0 ? "+" : "−"}${f1(Math.abs(belichtung))} Blenden, ${look?.vlog ? "mit dem Look der Marke darüber" : "ohne Look der Marke, nur die Umrechnung"}) für ${logQuellen.length ? logQuellen.map((q) => q.id).join(", ") : "Log-Material, das noch dazukommt (B-Roll aus der Kamera)"}`,
    );
  } else if (look && logQuellen.length && look.log) {
    const gemessen = schlageLevelsVor(logQuellen.map((q) => o.messungen.get(q.id)).filter((m): m is Farbmessung => !!m));
    const aufgeloest = loeseLook(look.log, gemessen);
    const datei = path.join(dir, LUT_DATEIEN.log);
    fs.writeFileSync(datei, baueCube(`${o.marke.name} Log`, aufgeloest));
    pfade.log = datei;
    meldungen.push(`Look: ${LUT_DATEIEN.log} für ${logQuellen.map((q) => q.id).join(", ")} (Schwarzpunkt ${f2(aufgeloest.schwarz)}, Weisspunkt ${f2(aufgeloest.weiss)}${look.log.schwarz === undefined && look.log.weiss === undefined ? (gemessen ? ", am Material gemessen" : ", keine Messung: voller Bereich") : ""})`);
  } else if (logQuellen.length) meldungen.push(`Look: ${logQuellen.map((q) => q.id).join(", ")} ist Log, aber das Markenprofil hat keinen Look «log»: keine LUT für diese Videos`);
  if (look?.angleich && o.quellen.some((q) => q.art === "video")) {
    const datei = path.join(dir, LUT_DATEIEN.angleich);
    fs.writeFileSync(datei, baueCube(`${o.marke.name} Angleich`, loeseLook(look.angleich)));
    pfade.angleich = datei;
    meldungen.push(`Look: ${LUT_DATEIEN.angleich} für normales Material und B-Roll`);
  }
  return { pfade, meldungen };
}
