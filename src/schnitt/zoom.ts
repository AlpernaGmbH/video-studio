import { inFrames } from "./raster";
import { leseSchnittplan, platziere, type SchnittClip, type Schnittplan } from "./plan";

/**
 * Zooms am Schluss (Plan v4). Es gibt keinen Zoom-Automatismus: Das Storyboard setzt einen Zoom auf ein betontes Wort, und dieser Code legt ihn in den Plan.
 * Ein Zoom ist ein Punch-In wie im Handwerk: Der Clip wird an Anfang und Ende des Zooms getrennt, das Mittelstück bekommt den Zoom. Es geht keine Zeit verloren,
 * Bild und Ton laufen durch. Schnitte näher als eine Viertelsekunde an einer vorhandenen Grenze entfallen, statt Mikro-Clips zu erzeugen.
 */

export interface ZoomEinsatz {
  /** Beginn in Sekunden der Timeline. */
  t: number;
  dauer: number;
  /** Zoom-Faktor, 1,1 = 10 Prozent grösser. */
  stufe: number;
  begruendung: string;
}

const ZOOM_NOTIZ = /(?:; )?Zoom [\d,.]+-fach: [^;]*$/;
const TEIL_ID = /^(.*)-s\d+$/;

const runde = (x: number): number => Math.round(x * 1e6) / 1e6;
const f2 = (n: number): string => n.toFixed(2).replace(".", ",");

/** Macht frühere Zooms rückgängig: Teilstücke desselben Clips werden wieder zusammengesetzt, der Zoom entfällt. */
export function entferneZooms(plan: Schnittplan): Schnittplan {
  const aus: SchnittClip[] = [];
  for (const c of plan.clips) {
    const m = TEIL_ID.exec(c.id);
    const vor = aus[aus.length - 1];
    const notiz = c.notiz.replace(ZOOM_NOTIZ, "");
    if (m && vor && vor.quelle === c.quelle && Math.abs(vor.bis - c.von) < 1e-5 && (vor.id === m[1] || TEIL_ID.exec(vor.id)?.[1] === m[1])) {
      vor.bis = c.bis;
      vor.id = m[1]!;
      if (!vor.notiz && notiz) vor.notiz = notiz;
      continue;
    }
    aus.push({ ...c, zoom: 1, notiz, id: m ? m[1]! : c.id });
  }
  return leseSchnittplan({ ...plan, clips: aus });
}

export function wendeZoomsAn(planIn: Schnittplan, zooms: ZoomEinsatz[]): Schnittplan {
  const plan = entferneZooms(planIn);
  if (!zooms.length) return plan;
  const fps = plan.projekt.fps;
  const bereiche = zooms.map((z) => ({ von: inFrames(z.t, fps), bis: inFrames(z.t + z.dauer, fps), z })).sort((a, b) => a.von - b.von);
  const mindest = Math.max(1, Math.round(0.25 * fps));
  const zeit = platziere(plan);
  const clips: SchnittClip[] = [];
  for (const pc of zeit.clips) {
    const c = pc.clip;
    const start = pc.startFrame;
    const ende = start + pc.frames;
    const punkte = [...new Set(bereiche.flatMap((b) => [b.von, b.bis]))]
      .filter((p) => p - start >= mindest && ende - p >= mindest)
      .sort((a, b) => a - b);
    const grenzen = [start, ...punkte, ende];
    for (let i = 0; i < grenzen.length - 1; i++) {
      const von = grenzen[i]!;
      const bis = grenzen[i + 1]!;
      const mitte = (von + bis) / 2;
      const b = bereiche.find((x) => mitte >= x.von && mitte < x.bis);
      const notiz = [c.notiz, b ? `Zoom ${f2(b.z.stufe)}-fach: ${b.z.begruendung}` : ""].filter(Boolean).join("; ");
      clips.push({
        ...c,
        id: grenzen.length === 2 ? c.id : `${c.id}-s${i + 1}`,
        von: i === 0 ? c.von : runde(c.von + (von - start) / fps),
        bis: i === grenzen.length - 2 ? c.bis : runde(c.von + (bis - start) / fps),
        zoom: b ? b.z.stufe : 1,
        notiz: i === 0 || b ? notiz : c.notiz,
      });
    }
  }
  return leseSchnittplan({ ...plan, clips });
}
