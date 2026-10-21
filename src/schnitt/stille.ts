import { lauf } from "../presets/messen";

/**
 * Stille in einer Tonspur (ffmpeg `silencedetect`). Whisper beendet Wörter oft zu früh und beginnt sie zu früh: Wer Clips an den Wortzeiten schneidet,
 * schneidet Silben ab oder lässt Atem stehen. Mit der echten Stille rasten Anfang und Ende des Clips dort ein, wo wirklich nichts gesprochen wird (`rasteEin` in planbau.ts).
 */

export interface Stille {
  von: number;
  bis: number;
}

/** Liest die Zeilen «silence_start: 1.23» und «silence_end: 1.8 | silence_duration: 0.57» aus der Ausgabe von silencedetect. Eine Stille ohne Ende reicht bis `dauer`. */
export function parseSilencedetect(stderr: string, dauer?: number): Stille[] {
  const aus: Stille[] = [];
  let offen: number | undefined;
  for (const zeile of stderr.split("\n")) {
    const a = /silence_start:\s*(-?\d+(?:\.\d+)?)/.exec(zeile);
    if (a) offen = Math.max(0, Number(a[1]));
    const e = /silence_end:\s*(-?\d+(?:\.\d+)?)/.exec(zeile);
    if (e && offen !== undefined) {
      aus.push({ von: offen, bis: Number(e[1]) });
      offen = undefined;
    }
  }
  if (offen !== undefined && dauer !== undefined && dauer > offen) aus.push({ von: offen, bis: dauer });
  return aus;
}

/** Misst die Stille einer Datei. `schwelleDb` ist der Pegel, unter dem es still ist (Standard −38 dB), `mindestdauer` die kürzeste Stille in Sekunden. */
export async function findeStille(datei: string, opt: { schwelleDb?: number; mindestdauer?: number; dauer?: number } = {}): Promise<Stille[]> {
  const r = await lauf("ffmpeg", ["-nostats", "-hide_banner", "-i", datei, "-vn", "-af", `silencedetect=n=${opt.schwelleDb ?? -38}dB:d=${opt.mindestdauer ?? 0.08}`, "-f", "null", "-"]);
  if (r.code !== 0) throw new Error(`ffmpeg schlug bei der Stille-Messung fehl: ${r.stderr.trim().split("\n").pop()}`);
  return parseSilencedetect(r.stderr, opt.dauer);
}
