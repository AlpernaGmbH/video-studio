/** Kleinste Quadrate für y = fest + je × x. Gebraucht von Test T1b (`scripts/t1b-messen.ts`). */
export function gerade(punkte: { x: number; y: number }[]): { fest: number; je: number } {
  const n = punkte.length;
  if (n < 2 || new Set(punkte.map((p) => p.x)).size < 2) throw new Error("Für eine Gerade braucht es mindestens zwei verschiedene x-Werte");
  const sx = punkte.reduce((s, p) => s + p.x, 0);
  const sy = punkte.reduce((s, p) => s + p.y, 0);
  const sxx = punkte.reduce((s, p) => s + p.x * p.x, 0);
  const sxy = punkte.reduce((s, p) => s + p.x * p.y, 0);
  const je = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  return { fest: (sy - je * sx) / n, je };
}
