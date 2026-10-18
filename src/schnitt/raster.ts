/**
 * Frame-Raster (Editing-Blueprint, Schritt 02: «Jede Schnittgrenze liegt im Frame-Raster der Timeline»).
 * Alle Zeiten im Schnittplan sind Sekunden. Beim Export werden sie auf ganze Frames gerundet und als exakte Brüche geschrieben,
 * damit Resolve keine krummen Zeiten bekommt (kein 0,2s statt 5/25s) und 29,97 fps nicht driftet.
 */

export interface Bruch {
  /** Zähler */
  n: number;
  /** Nenner, immer positiv */
  d: number;
}

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));

export function kuerze(n: number, d: number): Bruch {
  if (!Number.isInteger(n) || !Number.isInteger(d) || d === 0) throw new Error(`Kein ganzzahliger Bruch: ${n}/${d}`);
  const g = gcd(n, d) || 1;
  const s = d < 0 ? -1 : 1;
  return { n: (s * n) / g, d: (s * d) / g };
}

export const addiere = (a: Bruch, b: Bruch): Bruch => kuerze(a.n * b.d + b.n * a.d, a.d * b.d);
export const subtrahiere = (a: Bruch, b: Bruch): Bruch => kuerze(a.n * b.d - b.n * a.d, a.d * b.d);
export const gleichB = (a: Bruch, b: Bruch): boolean => a.n * b.d === b.n * a.d;
export const alsZahl = (a: Bruch): number => a.n / a.d;

/**
 * Bildrate als Bruch. NTSC-Raten (23,976, 29,97, 47,952, 59,94) sind keine ganzen Zahlen, sondern 24000/1001 und so weiter.
 * Andere gebrochene Raten lehnt der Export ab: Eine falsch geratene Rate verschiebt jeden Schnitt.
 */
export function fpsBruch(fps: number): Bruch {
  if (!Number.isFinite(fps) || fps <= 0) throw new Error(`Ungültige Bildrate ${fps}`);
  if (Number.isInteger(fps)) return { n: fps, d: 1 };
  for (const nenner of [24, 30, 48, 60, 120]) {
    if (Math.abs(fps - (nenner * 1000) / 1001) < 0.005) return { n: nenner * 1000, d: 1001 };
  }
  throw new Error(`Bildrate ${fps} ist weder ganzzahlig noch eine NTSC-Rate (23,976, 29,97, 47,952, 59,94, 119,88)`);
}

/** Anzahl ganzer Frames für eine Dauer oder einen Zeitpunkt in Sekunden (rundet auf das nächste Frame). */
export function inFrames(sekunden: number, fps: number): number {
  const f = fpsBruch(fps);
  return Math.round((sekunden * f.n) / f.d);
}

/** Zeit von `frames` Frames bei `fps`, als Bruch in Sekunden. */
export function frameZeit(frames: number, fps: number): Bruch {
  const f = fpsBruch(fps);
  return kuerze(frames * f.d, f.n);
}

/** Auf das Frame-Raster gelegte Sekunden (zum Beispiel für die Untertitel-Datei). */
export function rastere(sekunden: number, fps: number): number {
  return alsZahl(frameZeit(inFrames(sekunden, fps), fps));
}

/** FCPXML-Zeitangabe: «0s», «5s», «1001/30000s». */
export function fcpZeit(b: Bruch): string {
  const k = kuerze(b.n, b.d);
  if (k.n === 0) return "0s";
  return k.d === 1 ? `${k.n}s` : `${k.n}/${k.d}s`;
}
