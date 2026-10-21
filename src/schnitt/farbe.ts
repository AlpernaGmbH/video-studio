import type { Farblook } from "../core/schemas";
import { lauf } from "../presets/messen";

/**
 * Farbe des Materials (Plan v4, 1.4): Ist ein Video flaches Log-Material, das einen Look braucht, oder ist es schon normal (Rec. 709)?
 * Kameras schreiben das selten sauber in die Datei. Darum zwei Quellen: das Etikett der Datei (`color_transfer`, wenn es eines gibt) und eine Messung
 * an wenigen Bildern (mittlere Sättigung und Spanne der Helligkeit). Flaches Material hat kaum Sättigung und eine schmale Spanne.
 * Die Schwellen der Messung sind **Vermutungen** und gehören an echtem Material geprüft (Test T10): Darum ist das Urteil nach der Messung «unsicher» und ein Mensch kann es mit `--farbe` setzen.
 */

export type Farbart = "log" | "rec709";

export interface Farbmessung {
  /** `color_transfer` aus ffprobe, wenn die Datei eines trägt. */
  transfer?: string;
  /** Mittlere Sättigung, 0 bis etwa 0,7 (SATAVG durch den Wertebereich). */
  saettigung: number;
  /** 10. und 90. Perzentil der Helligkeit, 0 bis 1 über den Bereich 16 bis 235 (Video-Pegel). */
  yLow: number;
  yHigh: number;
  /** Anzahl der gemessenen Bilder. */
  bilder: number;
}

export interface Farburteil {
  farbe: Farbart;
  /** Etikett der Datei oder Messung eindeutig? Nach der Messung allein: false. */
  sicher: boolean;
  grund: string;
}

/** Eindeutig normales Material laut Etikett. */
const NORMAL = new Set(["bt709", "smpte170m", "bt470bg", "iec61966-2-1", "bt470m"]);
/** HDR-Material (HLG, PQ) sieht ohne Umrechnung flach aus und braucht dieselbe Behandlung. */
const HDR = new Set(["arib-std-b67", "smpte2084"]);
const LOG_NAMEN = /log/i;

/** Sättigung unter dieser Zahl und Spanne unter der anderen gelten als flach (Vermutung). */
export const FLACH_SAETTIGUNG = 0.08;
export const FLACH_SPANNE = 0.45;

const f2 = (n: number): string => n.toFixed(2).replace(".", ",");

export function urteileFarbe(m: Farbmessung): Farburteil {
  const t = m.transfer?.toLowerCase();
  if (t && NORMAL.has(t)) return { farbe: "rec709", sicher: true, grund: `Die Datei sagt «${t}»: normales Material` };
  if (t && (HDR.has(t) || LOG_NAMEN.test(t))) return { farbe: "log", sicher: true, grund: `Die Datei sagt «${t}»: flaches oder HDR-Material` };
  const spanne = m.yHigh - m.yLow;
  const flach = m.saettigung < FLACH_SAETTIGUNG && spanne < FLACH_SPANNE;
  return {
    farbe: flach ? "log" : "rec709",
    sicher: false,
    grund: `Die Datei trägt kein Etikett; gemessen: Sättigung ${f2(m.saettigung)}, Helligkeitsspanne ${f2(spanne)} (flach heisst unter ${f2(FLACH_SAETTIGUNG)} und ${f2(FLACH_SPANNE)}). [Vermutung] ${flach ? "sieht nach Log aus" : "sieht normal aus"}`,
  };
}

/** Liest die Zeilen von `signalstats,metadata=print` und gibt Mittelwerte zurück. Chroma und Luma sind durch den Wertebereich der Bittiefe geteilt. */
export function parseSignalstats(text: string): { saettigung: number; yLow: number; yHigh: number; bilder: number } | undefined {
  const lesen = (name: string): number[] => [...text.matchAll(new RegExp(`lavfi\\.signalstats\\.${name}=(-?\\d+(?:\\.\\d+)?)`, "g"))].map((m) => Number(m[1]));
  const sat = lesen("SATAVG");
  const low = lesen("YLOW");
  const high = lesen("YHIGH");
  const bits = lesen("YBITDEPTH");
  const n = Math.min(sat.length, low.length, high.length);
  if (!n) return undefined;
  let s = 0;
  let l = 0;
  let h = 0;
  for (let i = 0; i < n; i++) {
    const bereich = 2 ** (bits[i] ?? 8);
    s += sat[i]! / bereich;
    // Video-Pegel 16 bis 235 (bei 8 Bit) auf 0 bis 1
    const voll = (y: number): number => Math.min(1, Math.max(0, ((y / (bereich - 1)) * 255 - 16) / 219));
    l += voll(low[i]!);
    h += voll(high[i]!);
  }
  return { saettigung: s / n, yLow: l / n, yHigh: h / n, bilder: n };
}

/** Das Etikett `color_transfer` der Videospur, oder undefined. */
export async function liesTransfer(datei: string): Promise<string | undefined> {
  const r = await lauf("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=color_transfer", "-of", "csv=p=0", datei]);
  if (r.code !== 0) return undefined;
  const t = r.stdout.trim();
  return t && t !== "unknown" && t !== "unspecified" ? t : undefined;
}

/** Misst Sättigung und Helligkeit an bis zu `bilder` Bildern, gleichmässig über die Dauer verteilt (nicht am Anfang und Ende, wo oft Schwarz ist). */
export async function messeBilder(datei: string, dauer: number, bilder = 5): Promise<{ saettigung: number; yLow: number; yHigh: number; bilder: number } | undefined> {
  const zeiten = Array.from({ length: bilder }, (_, i) => Math.round(dauer * ((i + 1) / (bilder + 1)) * 100) / 100);
  const proben: ReturnType<typeof parseSignalstats>[] = [];
  for (const t of zeiten) {
    const r = await lauf("ffmpeg", ["-v", "error", "-ss", String(t), "-i", datei, "-vf", "signalstats,metadata=print:file=-", "-frames:v", "1", "-f", "null", "-"]);
    if (r.code !== 0) continue;
    const p = parseSignalstats(r.stdout);
    if (p) proben.push(p);
  }
  if (!proben.length) return undefined;
  const mittel = (k: "saettigung" | "yLow" | "yHigh"): number => proben.reduce((a, p) => a + p![k], 0) / proben.length;
  return { saettigung: mittel("saettigung"), yLow: mittel("yLow"), yHigh: mittel("yHigh"), bilder: proben.length };
}

/** Erkennt die Farbart einer Videodatei: Etikett und Messung. `undefined`, wenn sich nichts messen liess. */
export async function erkenneFarbe(datei: string, dauer: number): Promise<{ urteil: Farburteil; messung: Farbmessung } | undefined> {
  const [transfer, m] = await Promise.all([liesTransfer(datei), messeBilder(datei, dauer)]);
  if (!m) return undefined;
  const messung: Farbmessung = { ...(transfer ? { transfer } : {}), ...m };
  return { urteil: urteileFarbe(messung), messung };
}

/**
 * Schwarz- und Weisspunkt für flaches Material aus den Messungen (Mittel über die Quellen): Das 10. Perzentil wird zu 0,12 und das 90. zu 0,82 des Ausgangs.
 * So füllt das Bild den Bereich, ohne dass Tiefen absaufen. Eingang auf 0 bis 1, Grenzen so, dass der Look nicht kippt.
 */
export function schlageLevelsVor(messungen: Pick<Farbmessung, "yLow" | "yHigh">[]): { schwarz: number; weiss: number } | undefined {
  if (!messungen.length) return undefined;
  const mittel = (k: "yLow" | "yHigh"): number => messungen.reduce((a, m) => a + m[k], 0) / messungen.length;
  const low = mittel("yLow");
  const high = mittel("yHigh");
  if (high - low < 0.05) return undefined;
  const steigung = 0.7 / (high - low);
  const schwarz = Math.min(0.5, Math.max(0, low - 0.12 / steigung));
  const weiss = Math.min(1, Math.max(schwarz + 0.2, schwarz + 1 / steigung));
  return { schwarz: Math.round(schwarz * 1000) / 1000, weiss: Math.round(weiss * 1000) / 1000 };
}

/** Der Look mit aufgelösten Punkten: feste Werte der Marke zuerst, sonst die gemessenen, sonst der ganze Bereich. */
export function loeseLook(look: Farblook, gemessen?: { schwarz: number; weiss: number }): Farblook & { schwarz: number; weiss: number } {
  return { ...look, schwarz: look.schwarz ?? gemessen?.schwarz ?? 0, weiss: look.weiss ?? gemessen?.weiss ?? 1 };
}
