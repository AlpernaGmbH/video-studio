import fs from "node:fs";
import path from "node:path";
import type { Markenprofil } from "../core/schemas";
import { erkenneFarbe, loeseLook, schlageLevelsVor, type Farbart, type Farbmessung, type Farburteil } from "./farbe";
import { baueCube } from "./lut";
import type { SchnittQuelle } from "./plan";

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
export async function bestimmeFarbe(o: { videos: { id: string; datei: string; dauer: number }[]; vorgabe?: Farbart; erkenne?: (datei: string, dauer: number) => Promise<{ urteil: Farburteil; messung: Farbmessung } | undefined> }): Promise<FarbeErgebnis> {
  const farbart = new Map<string, Farbart>();
  const messungen = new Map<string, Farbmessung>();
  const meldungen: string[] = [];
  const erkenne = o.erkenne ?? erkenneFarbe;
  for (const v of o.videos) {
    if (o.vorgabe) {
      farbart.set(v.id, o.vorgabe);
      meldungen.push(`Farbe: ${v.id}: ${o.vorgabe === "log" ? "Log" : "normal (Rec. 709)"} (von Hand, --farbe)`);
      // Der Weisspunkt braucht trotzdem die Messung, wenn es Log ist
      if (o.vorgabe === "log") {
        const r = await erkenne(v.datei, v.dauer).catch(() => undefined);
        if (r) messungen.set(v.id, r.messung);
      }
      continue;
    }
    let r: Awaited<ReturnType<typeof erkenneFarbe>>;
    try {
      r = await erkenne(v.datei, v.dauer);
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
  }
  return { farbart, messungen, meldungen };
}

/**
 * Schreibt die LUTs für diesen Inhalt: «log» für Quellen mit Log (Schwarz- und Weisspunkt aus der Messung, wenn die Marke sie nicht fest vorgibt) und «angleich» für alles andere
 * (normales Material, B-Roll). Ohne Look in der Marke gibt es keine LUT. Nicht mehr nötige LUTs werden gelöscht, damit eine alte nicht in die Übergabe gerät.
 */
export function schreibeLuts(o: { ergebnis: string; marke: Markenprofil; quellen: SchnittQuelle[]; messungen: ReadonlyMap<string, Farbmessung> }): { pfade: LutPfade; meldungen: string[] } {
  const dir = lutOrdner(o.ergebnis);
  const pfade: LutPfade = {};
  const meldungen: string[] = [];
  const look = o.marke.farbe;
  for (const art of ["log", "angleich"] as const) fs.rmSync(path.join(dir, LUT_DATEIEN[art]), { force: true });
  if (!look) {
    meldungen.push(`Look: Das Markenprofil «${o.marke.schluessel}» hat keinen Look in Zahlen (Feld «farbe»): keine LUT, das Material bleibt unverändert`);
    return { pfade, meldungen };
  }
  const logQuellen = o.quellen.filter((q) => q.art === "video" && q.farbe === "log");
  fs.mkdirSync(dir, { recursive: true });
  if (logQuellen.length && look.log) {
    const gemessen = schlageLevelsVor(logQuellen.map((q) => o.messungen.get(q.id)).filter((m): m is Farbmessung => !!m));
    const aufgeloest = loeseLook(look.log, gemessen);
    const datei = path.join(dir, LUT_DATEIEN.log);
    fs.writeFileSync(datei, baueCube(`${o.marke.name} Log`, aufgeloest));
    pfade.log = datei;
    meldungen.push(`Look: ${LUT_DATEIEN.log} für ${logQuellen.map((q) => q.id).join(", ")} (Schwarzpunkt ${f2(aufgeloest.schwarz)}, Weisspunkt ${f2(aufgeloest.weiss)}${look.log.schwarz === undefined && look.log.weiss === undefined ? (gemessen ? ", am Material gemessen" : ", keine Messung: voller Bereich") : ""})`);
  } else if (logQuellen.length) meldungen.push(`Look: ${logQuellen.map((q) => q.id).join(", ")} ist Log, aber das Markenprofil hat keinen Look «log»: keine LUT für diese Videos`);
  if (look.angleich && o.quellen.some((q) => q.art === "video")) {
    const datei = path.join(dir, LUT_DATEIEN.angleich);
    fs.writeFileSync(datei, baueCube(`${o.marke.name} Angleich`, loeseLook(look.angleich)));
    pfade.angleich = datei;
    meldungen.push(`Look: ${LUT_DATEIEN.angleich} für normales Material und B-Roll`);
  }
  return { pfade, meldungen };
}
