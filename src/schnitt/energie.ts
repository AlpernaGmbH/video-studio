import { lauf } from "../presets/messen";
import { ordneZu, type QuelleTranskript, type Zuordnung, type ZuordnungOptionen } from "./zuordnung";

/**
 * Energie eines Takes (Bauplan v2, Kap. 3.3): «Lautstärke und Betonung im Vergleich zu den anderen Takes». Gemessen wird nur die Lautstärke, als mittlerer Pegel
 * der Stelle (ffmpeg `volumedetect`, dB). Die Betonung kann dieses System nicht hören: Darum zeigt die Freigabe pro Zeile den besten und den zweitbesten Take.
 */

export type PegelMesser = (quelle: string, von: number, bis: number) => Promise<number | undefined>;

/** Liest «mean_volume» aus der Ausgabe von `volumedetect`. */
export function pegelAusVolumedetect(stderr: string): number | undefined {
  const m = /mean_volume:\s*(-?\d+(?:\.\d+)?|-inf)\s*dB/.exec(stderr);
  if (!m || m[1] === "-inf") return undefined;
  return Number(m[1]);
}

/** Mittlerer Pegel (dB) zwischen `von` und `bis` Sekunden einer Datei. `undefined`, wenn nichts zu messen ist (Stille, keine Tonspur). */
export async function messePegel(datei: string, von: number, bis: number): Promise<number | undefined> {
  if (!(bis > von)) return undefined;
  const r = await lauf("ffmpeg", ["-nostats", "-hide_banner", "-ss", String(von), "-t", String(bis - von), "-i", datei, "-vn", "-af", "volumedetect", "-f", "null", "-"]);
  if (r.code !== 0) throw new Error(`ffmpeg schlug bei der Pegelmessung fehl: ${r.stderr.trim().split("\n").pop()}`);
  return pegelAusVolumedetect(r.stderr);
}

const schluessel = (quelle: string, von: number, bis: number): string => `${quelle}|${von}|${bis}`;

/**
 * Ordnet zu und misst dazu die Takes. Zuerst läuft die Zuordnung ohne Energie, um die Takes zu finden (ihre Zeiten hängen nicht von der Energie ab),
 * dann wird nur dort gemessen, wo es mehr als einen Take gibt, und die Zuordnung läuft mit den Pegeln erneut.
 */
export async function ordneZuMitPegel(zeilen: string[], transkripte: QuelleTranskript[], messe: PegelMesser, opt: Omit<ZuordnungOptionen, "energie"> & { parallel?: number } = {}): Promise<Zuordnung> {
  const { parallel = 4, ...rest } = opt;
  const vorab = ordneZu(zeilen, transkripte, rest);
  const bereiche = new Map<string, { quelle: string; von: number; bis: number }>();
  for (const e of vorab.zeilen) {
    if (e.takes.length < 2) continue;
    for (const t of e.takes) bereiche.set(schluessel(t.quelle, t.von, t.bis), { quelle: t.quelle, von: t.von, bis: t.bis });
  }
  const pegel = new Map<string, number | undefined>();
  const warteschlange = [...bereiche.entries()];
  const arbeiter = Array.from({ length: Math.max(1, Math.min(parallel, warteschlange.length)) }, async () => {
    for (let n = warteschlange.shift(); n; n = warteschlange.shift()) {
      const [key, b] = n;
      pegel.set(key, await messe(b.quelle, b.von, b.bis));
    }
  });
  await Promise.all(arbeiter);
  return ordneZu(zeilen, transkripte, { ...rest, energie: (q, v, b) => pegel.get(schluessel(q, v, b)) });
}
