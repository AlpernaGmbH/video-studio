import type { Farblook } from "../core/schemas";
import { baueCube, type Nachstufe } from "./lut";
import { vlogZuRec709, type VlogBasis } from "./vlog";

/**
 * Die V-Log-LUT: Umrechnung nach Rec. 709 (`vlog.ts`) und darüber der Look der Marke. Eingang V-Log-Code 0 bis 1 (voller Bereich), Ausgang Rec. 709.
 *
 * Grösse 65 statt 33: V-Log ist am unteren Ende steil, und ein 33er-Gitter lässt auf der Grauachse bis 2,4 von 255 Abstufungen neben der exakten Kurve (gemessen, Test
 * `vlog-lut.test.ts`); das gibt sichtbare Stufen in glatten Verläufen wie Himmel und Wänden. Mit 65 sind es 0,6.
 * Die Datei ist rund 6,6 MB gross, Resolve und ffmpeg laden sie ohne Mühe.
 */
export const VLOG_LUT_GROESSE = 65;

export function baueVlogCube(titel: string, look: Farblook | undefined, o: VlogBasis & { groesse?: number; nachstufe?: Nachstufe } = {}): string {
  const ohneLook: Farblook = { gamma: 1, kontrast: 0, saettigung: 1, kuehle: 0 };
  const aufgeloest = { ...(look ?? ohneLook), schwarz: look?.schwarz ?? 0, weiss: look?.weiss ?? 1 };
  return baueCube(titel, aufgeloest, o.groesse ?? VLOG_LUT_GROESSE, (c) => vlogZuRec709(c, { belichtung: o.belichtung, knie: o.knie }), o.nachstufe);
}
