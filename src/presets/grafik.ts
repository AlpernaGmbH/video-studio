import type { Markenprofil, Overlay } from "../core/schemas";
import { SICHERHEITSRAND } from "../motion/render";
import { loeseVariablen, type Stueck } from "../motion/stueck";
import type { GrafikPreset, UntertitelPreset } from "./schema";
import { CaptionPreset } from "../core/schemas";

export interface Flaeche {
  x: number;
  y: number;
  breite: number;
  hoehe: number;
}

/** Die Fläche, in der Grafiken stehen dürfen: das Bild ohne Sicherheitsrand (oben, unten, links, rechts, siehe `SICHERHEITSRAND`). */
export function sicherheitsflaeche(breite: number, hoehe: number): Flaeche {
  const x = breite * SICHERHEITSRAND.links;
  const y = hoehe * SICHERHEITSRAND.oben;
  return { x, y, breite: breite * (1 - SICHERHEITSRAND.links - SICHERHEITSRAND.rechts), hoehe: hoehe * (1 - SICHERHEITSRAND.oben - SICHERHEITSRAND.unten) };
}

export interface Platzierung {
  /** Ankerpunkt in Pixeln (obere linke Ecke des Bildes ist 0/0). */
  x: number;
  y: number;
  /** Grösste Breite der Grafik in Pixeln. */
  maxBreite: number;
  /** Ausrichtung des Inhalts am Ankerpunkt. */
  ausrichtung: "links" | "mitte" | "rechts";
}

/** Wo eine Grafik steht: Ankerpunkt auf dem Rand beziehungsweise in der Mitte der Sicherheitsfläche und die grösste Breite. */
export function platzierung(p: Pick<GrafikPreset, "anker" | "breiteAnteil">, breite: number, hoehe: number): Platzierung {
  const f = sicherheitsflaeche(breite, hoehe);
  const [zeile, spalte] = p.anker === "mitte" ? ["mitte", "mitte"] : (p.anker.split("-") as [string, string]);
  const x = spalte === "links" ? f.x : spalte === "rechts" ? f.x + f.breite : f.x + f.breite / 2;
  const y = zeile === "oben" ? f.y : zeile === "unten" ? f.y + f.hoehe : f.y + f.hoehe / 2;
  return { x, y, maxBreite: f.breite * p.breiteAnteil, ausrichtung: spalte === "links" ? "links" : spalte === "rechts" ? "rechts" : "mitte" };
}

export interface OverlayEingabe {
  /** Beginn in Timeline-Sekunden. */
  t: number;
  /** Fehlt sie, gilt die Standarddauer des Presets. */
  dauer?: number;
  /** Inhalte des Stücks (Text, Zahl) und eigene Abweichungen von den Werten des Presets. */
  werte: Record<string, unknown>;
  /** Eigene Begründung. Fehlt sie, gilt der Mustertext des Presets. */
  begruendung?: string;
}

export type OverlayErgebnis = { ok: true; overlay: Overlay } | { ok: false; fehler: string[] };

const woerter = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;

/**
 * Macht aus einem Grafik-Preset und dem Inhalt einen Eintrag fürs Storyboard. Prüft die Dauer, die Textgrenzen des Presets und danach das
 * Datenblatt des Stücks (Pflichtparameter, Wertebereiche). Ein Preset ohne Stück ergibt nie ein Overlay.
 */
export function presetZuOverlay(p: GrafikPreset, e: OverlayEingabe, stuecke: Stueck[]): OverlayErgebnis {
  const fehler: string[] = [];
  if (!p.stueck) return { ok: false, fehler: [`Das Preset «${p.id}» hat noch kein Stück. Es entsteht über die Motion-Werkstatt (Idee, drei Looks, Abnahme)`] };
  const stueck = stuecke.find((s) => s.id === p.stueck);
  if (!stueck) return { ok: false, fehler: [`Das Stück «${p.stueck}» gibt es in der Bibliothek nicht`] };

  const dauer = e.dauer ?? p.dauer.standard;
  if (dauer < p.dauer.min - 1e-9 || dauer > p.dauer.max + 1e-9) fehler.push(`Dauer ${dauer} s liegt ausserhalb von ${p.dauer.min} bis ${p.dauer.max} s (Preset «${p.id}»)`);

  const werte = { ...p.werte, ...e.werte };
  for (const [feld, grenze] of Object.entries(p.text)) {
    const v = werte[feld];
    if (typeof v !== "string") continue;
    if (grenze.maxZeichen !== undefined && v.length > grenze.maxZeichen) fehler.push(`«${feld}» hat ${v.length} Zeichen, das Preset erlaubt ${grenze.maxZeichen}`);
    if (grenze.maxWoerter !== undefined && woerter(v) > grenze.maxWoerter) fehler.push(`«${feld}» hat ${woerter(v)} Wörter, das Preset erlaubt ${grenze.maxWoerter}`);
  }

  const r = loeseVariablen(stueck, werte, { dauer, ohneMarke: true });
  if (!r.ok) fehler.push(...r.fehler);
  if (fehler.length) return { ok: false, fehler };
  return { ok: true, overlay: { effekt: stueck.id, t: e.t, dauer, params: werte, begruendung: e.begruendung ?? p.begruendung } };
}

/** Übersetzt ein Untertitel-Preset in das Caption-Preset der Marke (Schrift aus dem Markenprofil). Ein Vorschlag, den ein Mensch bei Gate 0 übernimmt. */
export function captionFuerMarke(p: UntertitelPreset, marke: Pick<Markenprofil, "schriften">): CaptionPreset {
  return CaptionPreset.parse({
    schrift: p.schriftRolle === "titel" ? marke.schriften.titel : marke.schriften.fliesstext,
    groesse: p.groesse,
    position: p.position,
    animation: p.animation,
    hervorhebung: p.hervorhebung,
    grossschreibung: p.grossschreibung,
    kasten: p.kasten,
  });
}
