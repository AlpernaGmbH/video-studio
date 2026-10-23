import { Hex } from "../core/schemas";
import type { Nachstufe, Rgb } from "../schnitt/lut";
import { z } from "zod";

/**
 * Ein Farbpaar: eine Farbe in die Schatten, eine andere in die Lichter (Rezeptteil 3 in `docs/inspiration/farbe-und-foto.md`).
 * Gerechnet wird als Verschiebung um den Farbton, ohne die Helligkeit zu verändern: Von jeder Farbe zählt nur, wie weit sie von ihrem eigenen Grau abweicht.
 * `staerke` 0 lässt das Bild unverändert, 0,4 ist die Obergrenze (darüber kippt das Bild in eine Farbe).
 */
export const Farbpaar = z.object({
  schatten: Hex,
  lichter: Hex,
  staerke: z.number().min(0).max(0.4),
});
export type Farbpaar = z.infer<typeof Farbpaar>;

const LUMA = { r: 0.2126, g: 0.7152, b: 0.0722 } as const;
const luma = (c: Rgb): number => LUMA.r * c.r + LUMA.g * c.g + LUMA.b * c.b;

export function hexZuRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

/** Abweichung einer Farbe von ihrem Grau, je Kanal. Die Helligkeit (Luma) der Abweichung ist 0. */
function abweichung(c: Rgb): Rgb {
  const y = luma(c);
  return { r: c.r - y, g: c.g - y, b: c.b - y };
}

/** Das Farbpaar als Nachstufe für die LUT: Schatten zählen mit (1 − Helligkeit)², Lichter mit Helligkeit². */
export function farbpaarStufe(p: Farbpaar): Nachstufe {
  const s = abweichung(hexZuRgb(p.schatten));
  const l = abweichung(hexZuRgb(p.lichter));
  return (c) => {
    const y = luma(c);
    const ws = (1 - y) * (1 - y);
    const wl = y * y;
    return {
      r: c.r + p.staerke * (ws * s.r + wl * l.r),
      g: c.g + p.staerke * (ws * s.g + wl * l.g),
      b: c.b + p.staerke * (ws * s.b + wl * l.b),
    };
  };
}
