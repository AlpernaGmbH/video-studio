import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { relPath } from "../core/paths";
import { drehung, lauf } from "../presets/messen";
import { type OffenerEintrag } from "./katalog";

/**
 * Scan eines Ordners für den Katalog (Bauplan v2, Kap. 3.7, Schritt 1): Metadaten mit ffprobe und drei Vorschaubilder (Anfang, Mitte, Ende) mit ffmpeg.
 * Beschrieben wird später, in einer Sitzung, nach den Vorschaubildern. Der Scan ändert keine Originaldatei.
 */

const ENDUNGEN: Record<OffenerEintrag["art"], string[]> = {
  video: [".mov", ".mp4", ".m4v", ".mxf", ".avi", ".mkv"],
  foto: [".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"],
  sound: [".wav", ".mp3", ".aif", ".aiff", ".m4a", ".flac"],
};

export function artVonDatei(name: string): OffenerEintrag["art"] | undefined {
  const e = path.extname(name).toLowerCase();
  return (Object.keys(ENDUNGEN) as OffenerEintrag["art"][]).find((a) => ENDUNGEN[a].includes(e));
}

/** Alle Dateien einer bekannten Art unter einem Ordner, sortiert. Versteckte Dateien und Ordner (Punkt am Anfang, `._` von macOS) fallen weg. */
export function findeDateien(wurzel: string): string[] {
  const aus: string[] = [];
  const geh = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith(".")) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) geh(p);
      else if (e.isFile() && artVonDatei(e.name)) aus.push(p);
    }
  };
  geh(wurzel);
  return aus.sort((a, b) => a.localeCompare(b));
}

const Strom = z.object({
  codec_type: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  avg_frame_rate: z.string().optional(),
  r_frame_rate: z.string().optional(),
  color_transfer: z.string().optional(),
  duration: z.string().optional(),
  tags: z.record(z.string()).optional(),
  side_data_list: z.array(z.object({ rotation: z.number().optional() }).passthrough()).optional(),
});
const Probe = z.object({ streams: z.array(Strom), format: z.object({ duration: z.string().optional(), tags: z.record(z.string()).optional() }) });

const bruch = (s: string | undefined): number | undefined => {
  if (!s) return undefined;
  const [n, d] = s.split("/").map(Number);
  const v = n !== undefined && d ? n / d : n;
  return v && Number.isFinite(v) ? v : undefined;
};

/** «+47.3769+008.5417/» (ISO 6709, wie iPhones es schreiben) als «47.3769, 8.5417». */
export function gpsAusIso6709(s: string | undefined): string | undefined {
  const m = s ? /^([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)/.exec(s) : null;
  return m ? `${Number(m[1])}, ${Number(m[2])}` : undefined;
}

export type Metadaten = Omit<OffenerEintrag, "schluessel" | "pfad" | "ordnerHinweis" | "vorschau">;

/** Wandelt die JSON-Ausgabe von `ffprobe -show_streams -show_format` in die Angaben des Katalogs (rein, ohne Dateizugriff). */
export function metadatenAusProbe(roh: unknown, art: OffenerEintrag["art"]): Metadaten {
  const p = Probe.parse(roh);
  const v = p.streams.find((s) => s.codec_type === "video");
  const a = p.streams.find((s) => s.codec_type === "audio");
  const tags = { ...(p.format.tags ?? {}), ...(v?.tags ?? {}) };
  const aufnahme = tags["creation_time"];
  const kamera = [tags["com.apple.quicktime.make"] ?? tags["make"], tags["com.apple.quicktime.model"] ?? tags["model"]].filter(Boolean).join(" ") || undefined;
  const gps = gpsAusIso6709(tags["com.apple.quicktime.location.ISO6709"] ?? tags["location"]);
  const dauer = Number(p.format.duration ?? v?.duration ?? 0);
  const m: Metadaten = { art, zeitlupe: false, hatTon: !!a, log: false };
  if (art !== "foto" && dauer > 0) m.dauer = dauer;
  if (v) {
    const dreh = drehung(v as never);
    const quer = dreh === 90 || dreh === 270;
    const breite = quer ? v.height : v.width;
    const hoehe = quer ? v.width : v.height;
    if (breite && hoehe) {
      m.breite = breite;
      m.hoehe = hoehe;
      m.orientierung = breite > hoehe ? "quer" : breite < hoehe ? "hoch" : "quadrat";
    }
    if (art === "video") {
      const fps = bruch(v.avg_frame_rate) ?? bruch(v.r_frame_rate);
      if (fps) {
        m.bildrate = Math.round(fps * 1000) / 1000;
        // 50p und 60p sind Zeitlupen-Material (Plan 3.7)
        m.zeitlupe = fps >= 49.5;
      }
      // HLG ist kein Log; Kameras, die Log schreiben, melden das selten im Container: die Bildanalyse (Claude) setzt es
      m.log = false;
    }
  }
  if (aufnahme) m.aufnahme = aufnahme;
  if (kamera) m.kamera = kamera;
  if (gps) m.gps = gps;
  return m;
}

/** Zeitpunkte der drei Vorschaubilder: 5, 50 und 95 Prozent der Dauer. */
export const vorschauZeiten = (dauer: number): number[] => [0.05, 0.5, 0.95].map((f) => Math.round(f * dauer * 100) / 100);

export interface ScanWerkzeuge {
  probe: (datei: string) => Promise<unknown>;
  /** Schreibt ein Vorschaubild. `zeit` fehlt bei Fotos. */
  vorschau: (datei: string, zeit: number | undefined, ziel: string) => Promise<void>;
}

export const echteWerkzeuge: ScanWerkzeuge = {
  async probe(datei) {
    const r = await lauf("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", datei]);
    if (r.code !== 0) throw new Error(`ffprobe: ${r.stderr.trim().split("\n").pop()}`);
    return JSON.parse(r.stdout);
  },
  async vorschau(datei, zeit, ziel) {
    fs.mkdirSync(path.dirname(ziel), { recursive: true });
    const args = ["-loglevel", "error", "-y", ...(zeit !== undefined ? ["-ss", String(zeit)] : []), "-i", datei, "-frames:v", "1", "-vf", "scale=480:-2", "-q:v", "4", ziel];
    const r = await lauf("ffmpeg", args);
    if (r.code !== 0 || !fs.existsSync(ziel)) throw new Error(`ffmpeg: ${r.stderr.trim().split("\n").pop() || "kein Bild"}`);
  },
};

export interface ScanOptionen {
  /** Der Ordner, der gescannt wird, absolut. */
  ordner: string;
  /** Wandelt eine absolute Datei in den Pfad des Katalogs (relativ zum Studio-Ordner oder Medien-Ordner), oder null, wenn sie ausserhalb liegt. */
  relativ: (abs: string) => string | null;
  /** Pfade, die schon im Katalog oder in den offenen Einträgen stehen. */
  bekannt: ReadonlySet<string>;
  naechster: () => string;
  /** Wohin die Vorschaubilder kommen (Datenordner, darunter `katalog/vorschau`). */
  datenDir: string;
  maximal?: number;
  /** Nur diese Dateien statt aller Dateien im Ordner (eine einzelne Datei scannen). */
  dateien?: string[];
  ohneVorschau?: boolean;
  werkzeuge?: ScanWerkzeuge;
}

export interface ScanErgebnis {
  neu: OffenerEintrag[];
  bekannt: number;
  /** Dateien, die ffprobe nicht lesen konnte, und Dateien ausserhalb von Studio- und Medien-Ordner. */
  uebersprungen: { datei: string; grund: string }[];
  /** Dateien, die über das Maximum hinausgingen und beim nächsten Lauf drankommen. */
  zurueckgestellt: number;
}

export async function scanne(o: ScanOptionen): Promise<ScanErgebnis> {
  const w = o.werkzeuge ?? echteWerkzeuge;
  const neu: OffenerEintrag[] = [];
  const uebersprungen: ScanErgebnis["uebersprungen"] = [];
  let bekannt = 0;
  let zurueck = 0;
  for (const datei of o.dateien ?? findeDateien(o.ordner)) {
    const rel = o.relativ(datei);
    if (!rel) {
      uebersprungen.push({ datei, grund: "liegt ausserhalb von Studio- und Medien-Ordner, der Pfad im Katalog muss relativ sein" });
      continue;
    }
    const pfad = relPath(rel);
    if (o.bekannt.has(pfad)) {
      bekannt += 1;
      continue;
    }
    if (o.maximal !== undefined && neu.length >= o.maximal) {
      zurueck += 1;
      continue;
    }
    const art = artVonDatei(datei)!;
    let md: Metadaten;
    try {
      md = metadatenAusProbe(await w.probe(datei), art);
    } catch (e) {
      uebersprungen.push({ datei, grund: (e as Error).message });
      continue;
    }
    const schluessel = o.naechster();
    const vorschau: string[] = [];
    if (!o.ohneVorschau && art !== "sound") {
      const zeiten: (number | undefined)[] = art === "foto" ? [undefined] : vorschauZeiten(md.dauer ?? 0);
      for (const [i, t] of zeiten.entries()) {
        const relVor = path.join("katalog", "vorschau", `${schluessel}-${"abc"[i]}.jpg`);
        try {
          await w.vorschau(datei, t, path.join(o.datenDir, relVor));
          vorschau.push(relVor.split(path.sep).join("/"));
        } catch (e) {
          uebersprungen.push({ datei, grund: `Vorschaubild ${"abc"[i]}: ${(e as Error).message}` });
        }
      }
    }
    const hinweis = path.relative(o.ordner, path.dirname(datei)).split(path.sep).filter(Boolean);
    neu.push({ schluessel, pfad, ...md, ordnerHinweis: hinweis.map((x) => x.normalize("NFC")), vorschau });
  }
  return { neu, bekannt, uebersprungen, zurueckgestellt: zurueck };
}
