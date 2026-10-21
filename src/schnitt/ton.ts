import fs from "node:fs";
import path from "node:path";
import { lauf, lautheitAusEbur128 } from "../presets/messen";
import type { AudioPreset } from "../presets/schema";
import type { Schnittplan } from "./plan";

/**
 * Ton verbessern (Plan v2, Kap. 3.8 «Ton»): Die Sprache des Schnitts wird entrauscht, im Klang geformt, leicht verdichtet und auf die Zielllautheit des Audio-Presets
 * gebracht. Das Video bleibt unberührt: `-c copy` für Bild und Zeitcode, nur die Tonspur wird neu geschrieben (PCM 24 Bit wie das Original).
 *
 * Die Lautheit wird an dem gemessen, was im Video wirklich zu hören ist: an den Clips des Schnittplans, nicht an der ganzen Aufnahme mit Zurufen und Pausen.
 * Daraus folgt eine feste Verstärkung für die ganze Datei. Gemessen wird vorher und nachher, damit die Zahl nicht nur behauptet wird.
 *
 * Grenzen: Die Kette ist auf Sprache mit einem Mikrofon in einem ruhigen Raum eingestellt (Rauschboden rund 20 dB unter der Sprache). Sie hört nichts: Ob die
 * Stimme gut klingt, entscheidet ein Mensch. Die Zahlen sind Messwerte, kein Urteil über den Klang.
 */

/** Die Kette für Sprache. Reihenfolge: Rumpeln weg, Rauschen mindern, Dröhnen und Präsenz formen, Zischlaute zähmen, verdichten. */
export const TON_KETTE = [
  "highpass=f=70",
  "afftdn=nr=12:nf=-52:tn=1",
  "equalizer=f=220:t=q:w=1.2:g=-2",
  "equalizer=f=3000:t=q:w=1.0:g=2.5",
  "equalizer=f=9500:t=h:w=0.7:g=1.5",
  "deesser=i=0.35:m=0.5:f=0.5",
  "acompressor=threshold=-26dB:ratio=3:attack=12:release=200:makeup=3",
].join(",");

/** Linearer Wert für dB. */
const lin = (db: number): number => Math.pow(10, db / 20);

/**
 * Filtergraph für den Ton der Clips einer Quelle, hintereinander wie im Schnitt (ohne die Pausen dazwischen). `davor` und `danach` stehen vor und nach dem Zusammenfügen.
 * Der Eingang ist die Quelldatei als Eingang 0.
 */
export function schnittTonFilter(plan: Schnittplan, quelleId: string, opt: { kette?: string; danach?: string } = {}): string {
  const clips = plan.clips.filter((c) => c.quelle === quelleId);
  if (!clips.length) throw new Error(`Die Quelle «${quelleId}» hat keinen Clip im Plan`);
  const teile = clips.map((c, i) => `[0:a]atrim=start=${c.von.toFixed(3)}:end=${c.bis.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`);
  const verbinden = `${clips.map((_, i) => `[a${i}]`).join("")}concat=n=${clips.length}:v=0:a=1`;
  const kette = [opt.kette, opt.danach].filter(Boolean).join(",");
  return `${teile.join(";")};${verbinden}${kette ? `,${kette}` : ""}[aus]`;
}

export interface LautheitMessung {
  lufs: number;
  truePeak: number;
}

/** Misst Lautheit und True Peak des Tons der Clips einer Quelle, mit oder ohne Kette. */
export async function messeSchnittTon(datei: string, plan: Schnittplan, quelleId: string, opt: { kette?: string; danach?: string } = {}): Promise<LautheitMessung> {
  const graph = schnittTonFilter(plan, quelleId, opt).replace(/\[aus\]$/, ",ebur128=peak=true[aus]");
  const r = await lauf("ffmpeg", ["-nostats", "-hide_banner", "-i", datei, "-vn", "-filter_complex", graph, "-map", "[aus]", "-f", "null", "-"]);
  const l = lautheitAusEbur128(r.stderr);
  if (r.code !== 0 || !l) throw new Error(`Lautheit nicht messbar (${datei}): ${r.stderr.trim().split("\n").pop()}`);
  return { lufs: l.lufs, truePeak: l.truePeak };
}

export interface TonBericht {
  quelle: string;
  /** Lautheit der Clips im Original. */
  vorher: LautheitMessung;
  /** Lautheit der Clips nach der Kette, vor der Verstärkung. */
  nachKette: LautheitMessung;
  /** Feste Verstärkung in dB, die auf die Zielllautheit führt. */
  gainDb: number;
  /** Lautheit der Clips in der fertigen Datei. */
  nachher: LautheitMessung;
  ausgabe: string;
}

/**
 * Verstärkung, die die Lautheit auf das Ziel bringt, ohne den True Peak des Presets zu überschreiten. Liegt der Peak danach darüber, begrenzt der Limiter,
 * die Verstärkung bleibt aber gleich (die Lautheit sinkt dann leicht). Gibt die Verstärkung und die erwartete Spitze zurück.
 */
export function berechneGain(nachKette: LautheitMessung, preset: Pick<AudioPreset, "zielLufs" | "spitzeDbtp">): { gainDb: number; spitzeDb: number } {
  const gainDb = preset.zielLufs - nachKette.lufs;
  return { gainDb, spitzeDb: nachKette.truePeak + gainDb };
}

export async function verbessereTon(o: {
  eingang: string;
  ausgabe: string;
  plan: Schnittplan;
  quelleId: string;
  preset: Pick<AudioPreset, "zielLufs" | "spitzeDbtp" | "toleranzLu">;
}): Promise<TonBericht> {
  const { eingang, ausgabe, plan, quelleId, preset } = o;
  if (!fs.existsSync(eingang)) throw new Error(`Datei fehlt: ${eingang}`);
  const vorher = await messeSchnittTon(eingang, plan, quelleId);
  const nachKette = await messeSchnittTon(eingang, plan, quelleId, { kette: TON_KETTE });
  const { gainDb } = berechneGain(nachKette, preset);

  fs.mkdirSync(path.dirname(ausgabe), { recursive: true });
  const tmp = `${ausgabe}.teil`;
  // Limiter ein wenig unter dem Ziel-Peak, weil der Limiter Abtastwerte begrenzt und der True Peak etwas darüber liegen kann
  const limit = lin(preset.spitzeDbtp - 0.6).toFixed(4);
  const af = `${TON_KETTE},volume=${gainDb.toFixed(2)}dB,alimiter=limit=${limit}:level=false`;
  const r = await lauf("ffmpeg", ["-y", "-nostats", "-hide_banner", "-i", eingang, "-map", "0", "-c", "copy", "-c:a", "pcm_s24be", "-af", af, "-f", "mov", tmp]);
  if (r.code !== 0) {
    fs.rmSync(tmp, { force: true });
    throw new Error(`ffmpeg schlug beim Schreiben von ${ausgabe} fehl: ${r.stderr.trim().split("\n").pop()}`);
  }
  fs.renameSync(tmp, ausgabe);
  const nachher = await messeSchnittTon(ausgabe, plan, quelleId);
  return { quelle: quelleId, vorher, nachKette, gainDb, nachher, ausgabe };
}

/** Ob die fertige Datei im Rahmen des Presets liegt (Lautheit innerhalb der Toleranz, True Peak nicht darüber). */
export function imRahmen(nachher: LautheitMessung, preset: Pick<AudioPreset, "zielLufs" | "toleranzLu" | "spitzeDbtp">): { lautheit: boolean; spitze: boolean } {
  return { lautheit: Math.abs(nachher.lufs - preset.zielLufs) <= preset.toleranzLu, spitze: nachher.truePeak <= preset.spitzeDbtp + 0.05 };
}
