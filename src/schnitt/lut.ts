import type { Farblook } from "../core/schemas";

/**
 * Ein Look als 3D-LUT (.cube), aus wenigen Zahlen gerechnet. Resolve und ffmpeg (`lut3d`) lesen das Format.
 * Das ist eine **Näherung** für flaches Material, keine Kamera-LUT: Sie spannt die Tonwerte (Schwarz- und Weisspunkt), hebt die Mitten, gibt Kontrast über eine S-Kurve,
 * stellt die Sättigung ein und kühlt die Schatten. Die Umrechnung von Log in Rec. 709 mit den Daten des Herstellers (Sony S-Log3, Canon C-Log, Apple Log) ersetzt sie nicht.
 * Hauttöne richtet ein Mensch am Vectorscope aus (Hautlinie).
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const klemme = (x: number): number => Math.min(1, Math.max(0, x));
const LUMA = { r: 0.2126, g: 0.7152, b: 0.0722 } as const;

/** Der Look für ein Pixel: Eingang und Ausgang je 0 bis 1. `schwarz` und `weiss` müssen aufgelöst sein (Zahlen). */
export function rechneFarbe(rgb: Rgb, p: Farblook & { schwarz: number; weiss: number }): Rgb {
  const spanne = Math.max(1e-6, p.weiss - p.schwarz);
  const kanal = (x: number): number => {
    const l = klemme((x - p.schwarz) / spanne);
    const g = Math.pow(l, 1 / p.gamma);
    // S-Kurve: Überblendung zwischen der Geraden und smoothstep, k = Stärke
    const s = g * g * (3 - 2 * g);
    return klemme(g + p.kontrast * (s - g));
  };
  let r = kanal(rgb.r);
  let g = kanal(rgb.g);
  let b = kanal(rgb.b);
  const y = LUMA.r * r + LUMA.g * g + LUMA.b * b;
  r = y + (r - y) * p.saettigung;
  g = y + (g - y) * p.saettigung;
  b = y + (b - y) * p.saettigung;
  // Kühle: in den Schatten und Mitten weniger Rot und mehr Blau, in den Lichtern kaum etwas
  const w = (1 - y) * p.kuehle * 0.05;
  r -= w;
  b += w;
  return { r: klemme(r), g: klemme(g), b: klemme(b) };
}

/** Eine Umrechnung vor dem Look, zum Beispiel von Log nach Rec. 709 (`vlogZuRec709`). Eingang und Ausgang je 0 bis 1. */
export type Vorstufe = (rgb: Rgb) => Rgb;

/**
 * Der Look als Text einer .cube-Datei. Reihenfolge der Einträge: Rot läuft am schnellsten, dann Grün, dann Blau.
 * Mit `vorstufe` wird jedes Gitterpunkt-Pixel zuerst umgerechnet und erst dann mit dem Look versehen.
 */
export function baueCube(titel: string, p: Farblook & { schwarz: number; weiss: number }, groesse = 33, vorstufe?: Vorstufe): string {
  if (!Number.isInteger(groesse) || groesse < 2 || groesse > 65) throw new Error(`LUT-Grösse ${groesse} ist nicht zulässig (2 bis 65)`);
  const zeilen: string[] = [`TITLE "${titel.replace(/"/g, "'")}"`, `LUT_3D_SIZE ${groesse}`, "DOMAIN_MIN 0.0 0.0 0.0", "DOMAIN_MAX 1.0 1.0 1.0"];
  const schritt = 1 / (groesse - 1);
  const f = (x: number): string => x.toFixed(6);
  for (let b = 0; b < groesse; b++) {
    for (let g = 0; g < groesse; g++) {
      for (let r = 0; r < groesse; r++) {
        const eingang = { r: r * schritt, g: g * schritt, b: b * schritt };
        const o = rechneFarbe(vorstufe ? vorstufe(eingang) : eingang, p);
        zeilen.push(`${f(o.r)} ${f(o.g)} ${f(o.b)}`);
      }
    }
  }
  return `${zeilen.join("\n")}\n`;
}

/** Liest eine .cube-Datei (nur 3D): Grösse und Einträge. Für Tests und zum Prüfen. */
export function leseCube(text: string): { groesse: number; werte: Rgb[] } {
  let groesse = 0;
  const werte: Rgb[] = [];
  for (const roh of text.split("\n")) {
    const z = roh.trim();
    if (!z || z.startsWith("#") || z.startsWith("TITLE") || z.startsWith("DOMAIN")) continue;
    const m = /^LUT_3D_SIZE\s+(\d+)$/.exec(z);
    if (m) {
      groesse = Number(m[1]);
      continue;
    }
    const t = z.split(/\s+/).map(Number);
    if (t.length !== 3 || t.some((x) => !Number.isFinite(x))) throw new Error(`Unlesbare Zeile in der LUT: «${z}»`);
    werte.push({ r: t[0]!, g: t[1]!, b: t[2]! });
  }
  if (!groesse) throw new Error("Die LUT hat keine Zeile LUT_3D_SIZE");
  if (werte.length !== groesse ** 3) throw new Error(`Die LUT hat ${werte.length} Einträge, erwartet ${groesse ** 3}`);
  return { groesse, werte };
}

/**
 * Wertet eine LUT an einem Punkt aus, mit tetraedrischer Interpolation (so rechnen ffmpeg `lut3d` und Resolve in der Regel). Für Tests: Wie weit liegt die LUT neben der exakten Funktion?
 */
export function wendeCubeAn(cube: { groesse: number; werte: Rgb[] }, rgb: Rgb): Rgb {
  const n = cube.groesse;
  const pos = (x: number): [number, number] => {
    const p = klemme(x) * (n - 1);
    const i = Math.min(n - 2, Math.floor(p));
    return [i, p - i];
  };
  const [ir, fr] = pos(rgb.r);
  const [ig, fg] = pos(rgb.g);
  const [ib, fb] = pos(rgb.b);
  const punkt = (r: number, g: number, b: number): Rgb => cube.werte[r + g * n + b * n * n]!;
  const c000 = punkt(ir, ig, ib);
  const c111 = punkt(ir + 1, ig + 1, ib + 1);
  // Der Weg durch den Würfel von (0,0,0) nach (1,1,1) hängt von der Reihenfolge der Anteile ab (Tetraeder)
  let p1: Rgb;
  let p2: Rgb;
  let w1: number;
  let w2: number;
  let w0: number;
  if (fr >= fg && fg >= fb) {
    p1 = punkt(ir + 1, ig, ib); p2 = punkt(ir + 1, ig + 1, ib); w0 = 1 - fr; w1 = fr - fg; w2 = fg - fb;
    return mische(c000, p1, p2, c111, w0, w1, w2, fb);
  }
  if (fr >= fb && fb >= fg) {
    p1 = punkt(ir + 1, ig, ib); p2 = punkt(ir + 1, ig, ib + 1); w0 = 1 - fr; w1 = fr - fb; w2 = fb - fg;
    return mische(c000, p1, p2, c111, w0, w1, w2, fg);
  }
  if (fb >= fr && fr >= fg) {
    p1 = punkt(ir, ig, ib + 1); p2 = punkt(ir + 1, ig, ib + 1); w0 = 1 - fb; w1 = fb - fr; w2 = fr - fg;
    return mische(c000, p1, p2, c111, w0, w1, w2, fg);
  }
  if (fg >= fr && fr >= fb) {
    p1 = punkt(ir, ig + 1, ib); p2 = punkt(ir + 1, ig + 1, ib); w0 = 1 - fg; w1 = fg - fr; w2 = fr - fb;
    return mische(c000, p1, p2, c111, w0, w1, w2, fb);
  }
  if (fg >= fb && fb >= fr) {
    p1 = punkt(ir, ig + 1, ib); p2 = punkt(ir, ig + 1, ib + 1); w0 = 1 - fg; w1 = fg - fb; w2 = fb - fr;
    return mische(c000, p1, p2, c111, w0, w1, w2, fr);
  }
  p1 = punkt(ir, ig, ib + 1); p2 = punkt(ir, ig + 1, ib + 1); w0 = 1 - fb; w1 = fb - fg; w2 = fg - fr;
  return mische(c000, p1, p2, c111, w0, w1, w2, fr);
}

function mische(c0: Rgb, c1: Rgb, c2: Rgb, c3: Rgb, w0: number, w1: number, w2: number, w3: number): Rgb {
  return {
    r: w0 * c0.r + w1 * c1.r + w2 * c2.r + w3 * c3.r,
    g: w0 * c0.g + w1 * c1.g + w2 * c2.g + w3 * c3.g,
    b: w0 * c0.b + w1 * c1.b + w2 * c2.b + w3 * c3.b,
  };
}
