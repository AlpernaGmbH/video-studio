import { z } from "zod";
import { ZAHLWOERTER } from "../motion/signale";

/**
 * Transkript einer Quelldatei (Bauplan v2, Kap. 3.2). Whisper gibt Schweizerdeutsch als Hochdeutsch wieder und formuliert um, die Wortzeiten sind unsicher.
 * Darum zählen die **Segmentzeiten**: Jedes Segment bekommt Wortzeiten (echte, wenn Whisper sie liefert, sonst verteilt nach Zeichenzahl), Segmente über
 * 4 Sekunden werden vorher geteilt. Aufgenommen wird die JSON-Ausgabe von openai-whisper (`--output_format json`, mit `--word_timestamps True` auch die Wörter),
 * von whisper.cpp (`-oj`) oder eine einfache Liste `{"segmente": [{"von", "bis", "text"}]}`.
 */

export interface TWort {
  text: string;
  von: number;
  bis: number;
  /** Echte Wortzeit von Whisper (true) oder nach Zeichenzahl über das Segment verteilt (false). */
  echt: boolean;
}

export interface Segment {
  von: number;
  bis: number;
  text: string;
  woerter?: { text: string; von: number; bis: number }[];
}

/** Längste Dauer eines Segments, bevor es geteilt wird (Bauplan v2, Kap. 3.2). */
export const MAX_SEGMENT = 4;

const Whisper = z.object({
  segments: z.array(
    z.object({
      start: z.number(),
      end: z.number(),
      text: z.string(),
      words: z.array(z.object({ word: z.string(), start: z.number(), end: z.number() })).optional(),
    }),
  ),
});
const WhisperCpp = z.object({
  transcription: z.array(z.object({ offsets: z.object({ from: z.number(), to: z.number() }), text: z.string() })),
});
const Einfach = z.object({ segmente: z.array(z.object({ von: z.number(), bis: z.number(), text: z.string(), woerter: z.array(z.object({ text: z.string(), von: z.number(), bis: z.number() })).optional() })) });

export class TranskriptFehler extends Error {}

/** Liest die JSON-Ausgabe von Whisper in Segmente. Leere Segmente und Segmente mit negativer Dauer fallen weg. */
export function leseTranskript(roh: unknown): Segment[] {
  const w = Whisper.safeParse(roh);
  if (w.success) {
    return bereinige(w.data.segments.map((s) => ({ von: s.start, bis: s.end, text: s.text, ...(s.words?.length ? { woerter: s.words.map((x) => ({ text: x.word, von: x.start, bis: x.end })) } : {}) })));
  }
  const c = WhisperCpp.safeParse(roh);
  if (c.success) return bereinige(c.data.transcription.map((s) => ({ von: s.offsets.from / 1000, bis: s.offsets.to / 1000, text: s.text })));
  const e = Einfach.safeParse(roh);
  if (e.success) return bereinige(e.data.segmente);
  throw new TranskriptFehler("Das Transkript hat kein bekanntes Format (openai-whisper: «segments», whisper.cpp: «transcription», einfach: «segmente»)");
}

function bereinige(s: Segment[]): Segment[] {
  return s
    .map((x) => ({ ...x, text: x.text.trim() }))
    .filter((x) => x.text.length > 0 && x.bis > x.von)
    .sort((a, b) => a.von - b.von);
}

/* ---------- Wörter und Normalisierung ---------- */

/** Wörter eines Textes, wie sie geschrieben stehen (Satzzeichen bleiben am Wort: «umgebaut.»). */
export const rohWoerter = (text: string): string[] => text.trim().split(/\s+/).filter(Boolean);

/** Vergleichsform: klein, ohne Satzzeichen und Tausendertrenner, ß als ss. */
export function normiere(wort: string): string {
  return wort
    .normalize("NFC")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/(?<=\d)[’'.,](?=\d)/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

const istZahl = (n: string): boolean => /^\d+$/.test(n) || ZAHLWOERTER.has(n);

export function abstand(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  let vor = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const jetzt = [i];
    for (let j = 1; j <= n; j++) jetzt[j] = Math.min(vor[j]! + 1, jetzt[j - 1]! + 1, vor[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    vor = jetzt;
  }
  return vor[n]!;
}

/**
 * Sind zwei normierte Wörter «dasselbe» für den unscharfen Textvergleich? Gleich, oder bei Wörtern ab vier Buchstaben höchstens ein Viertel
 * der Buchstaben verschieden (Endungen, Dialektfärbung, kleine Hörfehler). Zahlen und Zahlwörter gelten untereinander als gleich:
 * Whisper schreibt «fünf» oder «5», das Skript das andere.
 */
export function gleichesWort(a: string, b: string): boolean {
  if (a === b) return a.length > 0;
  if (!a || !b) return false;
  if (istZahl(a) && istZahl(b)) return true;
  if (istZahl(a) || istZahl(b)) return false;
  const l = Math.max(a.length, b.length);
  if (Math.min(a.length, b.length) < 4) return false;
  return abstand(a, b) / l <= 0.25;
}

/* ---------- Segmente teilen und mit Wortzeiten versehen ---------- */

/**
 * Teilt Segmente über `max` Sekunden. Mit echten Wörtern wird an der grössten Pause nahe der Mitte geteilt, sonst nach Satzzeichen oder
 * in der Mitte der Wörter (Zeit nach Zeichenzahl verteilt). Wiederholt, bis alle Teile höchstens `max` Sekunden dauern.
 */
export function teileLange(segmente: Segment[], max = MAX_SEGMENT): Segment[] {
  const aus: Segment[] = [];
  const teile = (s: Segment): void => {
    if (s.bis - s.von <= max) return void aus.push(s);
    const echt = !!s.woerter && s.woerter.length >= 2;
    const w = echt ? s.woerter! : verteile(s).map((x) => ({ text: x.text, von: x.von, bis: x.bis }));
    if (w.length < 2) return void aus.push(s);
    const mitte = (s.von + s.bis) / 2;
    let beste = 1;
    let bestePunktzahl = -Infinity;
    for (let k = 1; k < w.length; k++) {
      const luecke = w[k]!.von - w[k - 1]!.bis;
      const satzende = /[.!?;:]$/.test(w[k - 1]!.text) ? 0.5 : /,$/.test(w[k - 1]!.text) ? 0.2 : 0;
      const naehe = 1 - Math.abs((w[k - 1]!.bis + w[k]!.von) / 2 - mitte) / (s.bis - s.von);
      const punkte = luecke * 2 + satzende + naehe;
      if (punkte > bestePunktzahl) {
        bestePunktzahl = punkte;
        beste = k;
      }
    }
    const a = w.slice(0, beste);
    const b = w.slice(beste);
    const grenze = (a[a.length - 1]!.bis + b[0]!.von) / 2;
    // Nur echte Wortzeiten werden weitergereicht; verteilte bleiben verteilt und werden im Teil neu berechnet (sonst sähen sie nach Messung aus).
    const links: Segment = { von: s.von, bis: grenze, text: a.map((x) => x.text).join(" "), ...(echt ? { woerter: a } : {}) };
    const rechts: Segment = { von: grenze, bis: s.bis, text: b.map((x) => x.text).join(" "), ...(echt ? { woerter: b } : {}) };
    teile(links);
    teile(rechts);
  };
  for (const s of segmente) teile(s);
  return aus;
}

/** Wortzeiten eines Segments: die echten von Whisper, sonst über die Segmentdauer verteilt nach Zeichenzahl (Bauplan v2, Kap. 3.2). */
export function verteile(s: Segment): TWort[] {
  if (s.woerter && s.woerter.length > 0) return s.woerter.map((w) => ({ text: w.text.trim(), von: w.von, bis: w.bis, echt: true })).filter((w) => w.text.length > 0);
  const w = rohWoerter(s.text);
  if (w.length === 0) return [];
  const gewicht = w.map((x) => Math.max(1, normiere(x).length));
  const summe = gewicht.reduce((a, b) => a + b, 0);
  const dauer = s.bis - s.von;
  let t = s.von;
  return w.map((text, i) => {
    const bis = i === w.length - 1 ? s.bis : t + (dauer * gewicht[i]!) / summe;
    const wort: TWort = { text, von: t, bis, echt: false };
    t = bis;
    return wort;
  });
}

/** Alle Wörter eines Transkripts in Zeitfolge, Segmente über 4 Sekunden vorher geteilt. */
export function transkriptWoerter(segmente: Segment[]): TWort[] {
  return teileLange(segmente).flatMap(verteile);
}
