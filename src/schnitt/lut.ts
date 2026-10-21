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

/** Der Look als Text einer .cube-Datei. Reihenfolge der Einträge: Rot läuft am schnellsten, dann Grün, dann Blau. */
export function baueCube(titel: string, p: Farblook & { schwarz: number; weiss: number }, groesse = 33): string {
  if (!Number.isInteger(groesse) || groesse < 2 || groesse > 65) throw new Error(`LUT-Grösse ${groesse} ist nicht zulässig (2 bis 65)`);
  const zeilen: string[] = [`TITLE "${titel.replace(/"/g, "'")}"`, `LUT_3D_SIZE ${groesse}`, "DOMAIN_MIN 0.0 0.0 0.0", "DOMAIN_MAX 1.0 1.0 1.0"];
  const schritt = 1 / (groesse - 1);
  const f = (x: number): string => x.toFixed(6);
  for (let b = 0; b < groesse; b++) {
    for (let g = 0; g < groesse; g++) {
      for (let r = 0; r < groesse; r++) {
        const o = rechneFarbe({ r: r * schritt, g: g * schritt, b: b * schritt }, p);
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
