import type { Schnittprofil } from "../core/schemas";
import { rastere } from "./raster";
import { sekunden, type Schnittplan, type Zeitleiste } from "./plan";

/**
 * Untertitel: Wörter in Quellzeit (Text aus dem Skript, Timing aus Whisper) werden über die Clips auf die Timeline gelegt,
 * in Seiten zu 2 bis 3 Wörtern gruppiert (Schnittprofil, Bauplan v2 Kap. 3.4: «Nach Satzende immer neue Seite») und als SRT geschrieben.
 * Wörter, die in keinem Clip liegen, wurden herausgeschnitten und fallen weg.
 */

export interface TimelineWort {
  text: string;
  /** Timeline-Zeit in Sekunden, auf dem Frame-Raster. */
  von: number;
  bis: number;
}

export interface Untertitel {
  von: number;
  bis: number;
  text: string;
}

/** Satzende: ., !, ?, … oder ein Doppelpunkt am Wortende (auch hinter einem Anführungszeichen). */
const SATZENDE = /[.!?…:]["»«')\]]*$/;

/**
 * Legt die Wörter über die Clips auf die Timeline. Ein Wort gehört zum ersten Clip derselben Quelle, in dem seine Mitte liegt.
 * Reicht es über die Clipgrenze, wird es an die Grenze gekürzt.
 */
export function woerterAufTimeline(plan: Schnittplan, zeit: Zeitleiste): TimelineWort[] {
  const fps = plan.projekt.fps;
  const aus: TimelineWort[] = [];
  for (const w of plan.woerter) {
    const mitte = (w.von + w.bis) / 2;
    const treffer = zeit.clips.find((p) => p.clip.quelle === w.quelle && mitte >= p.clip.von && mitte < p.clip.bis);
    if (!treffer) continue;
    const start = sekunden(treffer.startFrame, fps);
    const ende = start + sekunden(treffer.frames, fps);
    const von = start + (Math.max(w.von, treffer.clip.von) - treffer.clip.von);
    const bis = start + (Math.min(w.bis, treffer.clip.bis) - treffer.clip.von);
    aus.push({ text: w.text, von: rastere(Math.min(von, ende), fps), bis: rastere(Math.min(Math.max(bis, von), ende), fps) });
  }
  return aus.sort((a, b) => a.von - b.von || a.bis - b.bis);
}

/**
 * Seitengrössen für einen Satz mit `n` Wörtern: so gleichmässig wie möglich, höchstens `max` je Seite.
 * 5 Wörter bei 2 bis 3: [3, 2]. 7: [3, 2, 2]. Ein einzelnes Wort bleibt allein.
 */
export function seitenGroessen(n: number, max: number): number[] {
  if (n <= 0) return [];
  const seiten = Math.ceil(n / max);
  const basis = Math.floor(n / seiten);
  const rest = n % seiten;
  return Array.from({ length: seiten }, (_, i) => basis + (i < rest ? 1 : 0));
}

/** Kürzeste Anzeigedauer einer Seite in Sekunden, wenn das nächste Wort später kommt. */
export const MINDEST_ANZEIGE = 0.3;

export function gruppiere(woerter: TimelineWort[], profil: Pick<Schnittprofil, "woerterJeUntertitel">): Untertitel[] {
  const { max } = profil.woerterJeUntertitel;
  // Sätze bilden
  const saetze: TimelineWort[][] = [];
  let aktuell: TimelineWort[] = [];
  for (const w of woerter) {
    aktuell.push(w);
    if (SATZENDE.test(w.text)) {
      saetze.push(aktuell);
      aktuell = [];
    }
  }
  if (aktuell.length) saetze.push(aktuell);

  const seiten: Untertitel[] = [];
  for (const satz of saetze) {
    let i = 0;
    for (const g of seitenGroessen(satz.length, max)) {
      const teil = satz.slice(i, i + g);
      i += g;
      seiten.push({ von: teil[0]!.von, bis: teil[teil.length - 1]!.bis, text: teil.map((w) => w.text).join(" ") });
    }
  }
  // Anzeigedauer: mindestens MINDEST_ANZEIGE, aber nie in die nächste Seite hinein
  return seiten.map((s, i) => {
    const naechster = seiten[i + 1]?.von ?? Number.POSITIVE_INFINITY;
    return { ...s, bis: Math.min(Math.max(s.bis, s.von + MINDEST_ANZEIGE), Math.max(naechster, s.bis)) };
  });
}

function srtZeit(sek: number): string {
  const ms = Math.round(sek * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const r = ms % 1000;
  const z = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${z(h)}:${z(m)}:${z(s)},${z(r, 3)}`;
}

/** SRT mit Windows-unabhängigen Zeilenenden (\n), wie Resolve sie liest. */
export function schreibeSrt(seiten: Untertitel[], fps: number): string {
  return seiten.map((s, i) => `${i + 1}\n${srtZeit(rastere(s.von, fps))} --> ${srtZeit(rastere(s.bis, fps))}\n${s.text}\n`).join("\n");
}
