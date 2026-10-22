import type { Rgb } from "./lut";

/**
 * Panasonic V-Log / V-Gamut (Lumix S1IIE, S5II) nach Rec. 709: die Umrechnung des Herstellers statt einer Näherung aus Zahlen.
 *
 * Quelle: Panasonic, «V-Log/V-Gamut Reference Manual», Rev. 1.0. Dort stehen die Kennlinie und die Matrix; hier sind sie nachgerechnet:
 * 0 % Reflexion = Code 128, 18 % = 433, 90 % = 602 (10 Bit). Die Tests prüfen genau diese Anker und die Matrix (Zeilensumme je 1).
 *
 * Die Kette (alles auf 0 bis 1 normiert, Code geteilt durch 1023):
 *   V-Log-Code → linear (Kamera-Gamut V-Gamut) → Matrix nach Rec. 709 → Belichtung (Blenden) → Lichter-Schulter → Rec.-709-Kennlinie.
 * Danach kommt der Look der Marke (`rechneFarbe` in lut.ts). Die Basis ist bewusst neutral: Mitten bei 18 % Grau → 0,409, keine S-Kurve, keine Farbstimmung.
 *
 * Nicht belegt, weil es dafür echtes Material braucht (Plan v4, Test T11): wie die MOV-Dateien der beiden Kameras den Datenbereich
 * (voll oder begrenzt) und die Etiketten schreiben. Darum ist der Bereich ein Parameter und keine Annahme in der Kurve.
 */

export const VLOG = {
  /** Grenze zwischen Gerade und Logarithmus, linear (Eingang der Kamera-Kennlinie). */
  cut1: 0.01,
  /** Dieselbe Grenze am Ausgang (Code geteilt durch 1023). */
  cut2: 0.181,
  b: 0.00873,
  c: 0.241514,
  d: 0.598206,
  /** Gerade unterhalb von cut1: out = 5,6 · in + 0,125. */
  steigung: 5.6,
  versatz: 0.125,
} as const;

/** Lineares Licht (0,18 = 18 % Grau) nach V-Log, 0 bis 1 (mal 1023 ist der 10-Bit-Code). */
export function linearZuVlog(x: number): number {
  return x < VLOG.cut1 ? VLOG.steigung * x + VLOG.versatz : VLOG.c * Math.log10(x + VLOG.b) + VLOG.d;
}

/** V-Log (0 bis 1, Code geteilt durch 1023) nach linearem Licht. Unter Code 185 ist die Kennlinie eine Gerade, darunter sind auch Werte unter 0 möglich (Rauschen). */
export function vlogZuLinear(v: number): number {
  return v < VLOG.cut2 ? (v - VLOG.versatz) / VLOG.steigung : Math.pow(10, (v - VLOG.d) / VLOG.c) - VLOG.b;
}

/** Wie viele Blenden ein V-Log-Wert über (plus) oder unter (minus) 18 % Grau liegt. Für den Belichtungshinweis, nicht für die Rechnung. */
export function blendenUeberGrau(v: number): number {
  const lin = vlogZuLinear(v);
  return lin > 0 ? Math.log2(lin / 0.18) : Number.NEGATIVE_INFINITY;
}

/** V-Gamut → Rec. 709 (Primärfarben, linear), Zeilen: Rot, Grün, Blau. Weiss bleibt Weiss (Zeilensumme je 1). */
export const VGAMUT_ZU_REC709 = [
  [1.806576, -0.695697, -0.110879],
  [-0.17009, 1.305955, -0.135865],
  [-0.025206, -0.154468, 1.179674],
] as const;

export function vgamutZuRec709(c: Rgb): Rgb {
  const m = VGAMUT_ZU_REC709;
  return {
    r: m[0][0] * c.r + m[0][1] * c.g + m[0][2] * c.b,
    g: m[1][0] * c.r + m[1][1] * c.g + m[1][2] * c.b,
    b: m[2][0] * c.r + m[2][1] * c.g + m[2][2] * c.b,
  };
}

/** Rec.-709-Kennlinie (Kamera-Gamma, ITU-R BT.709): linear → Signal. Unter 0 gibt es 0. */
export function rec709Oetf(l: number): number {
  if (l <= 0) return 0;
  return l < 0.018 ? 4.5 * l : 1.099 * Math.pow(l, 0.45) - 0.099;
}

/** Wo die Lichter-Schulter beginnt (linear). Darunter bleibt alles unverändert. */
export const LICHTER_KNIE = 0.75;

/**
 * Sanfte Schulter für die Lichter: bis `knie` unverändert, darüber eine Kurve, die sich 1 nähert, ohne sie zu erreichen. Stetig, in der Steigung stetig (am Knie 1), streng steigend.
 * V-Log trägt Licht weit über Weiss (Code 1023 sind rund 46fach); ohne Schulter würde alles über 1 hart abgeschnitten.
 */
export function lichterSchulter(x: number, knie = LICHTER_KNIE): number {
  if (x <= knie) return x;
  const rest = 1 - knie;
  return knie + rest * (1 - Math.exp(-(x - knie) / rest));
}

export interface VlogBasis {
  /** Belichtung in Blenden (plus = heller), auf das lineare Licht. Standard 0. */
  belichtung?: number;
  /** Beginn der Lichter-Schulter, linear. Standard `LICHTER_KNIE`. */
  knie?: number;
}

/**
 * Ein V-Log-Pixel (Code 0 bis 1 je Kanal) als Rec.-709-Bild (0 bis 1), vor dem Look.
 * Negatives Licht (unter Schwarz, ausserhalb des Gamuts) gibt 0: Die Rec.-709-Kennlinie setzt es auf 0, sonst entstünden ungültige Werte (NaN) in der LUT.
 */
export function vlogZuRec709(code: Rgb, o: VlogBasis = {}): Rgb {
  const faktor = Math.pow(2, o.belichtung ?? 0);
  const lin = vgamutZuRec709({ r: vlogZuLinear(code.r), g: vlogZuLinear(code.g), b: vlogZuLinear(code.b) });
  const aus = (x: number): number => rec709Oetf(lichterSchulter(x * faktor, o.knie));
  return { r: aus(lin.r), g: aus(lin.g), b: aus(lin.b) };
}
