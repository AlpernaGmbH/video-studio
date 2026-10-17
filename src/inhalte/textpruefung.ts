import type { Schnittprofil } from "../core/schemas";
import type { Format } from "./inhalt";

/**
 * Textprüfung vor Tor P (Plan v3, 7.2). Deterministisch und ohne Claude-Aufruf. Sie prüft, was sich prüfen lässt:
 * verbotene Wörter der Marke, ss statt ß, keine Gedankenstriche, Schweizer Zahlenformat, keine Zahl ohne Beleg, Länge.
 * Das Urteil über Inhalt und Ton bleibt bei Claude und bei den Menschen.
 */

export interface TextBefund {
  stufe: "fehler" | "warnung";
  code: string;
  text: string;
}

export interface TextPruefOptionen {
  text: string;
  /** Der Beleg der Idee: Jede Zahl im Text muss dort stehen. */
  beleg: string;
  format?: Format;
  verboteneWoerter: string[];
  schnittprofil?: Schnittprofil;
}

const maskiere = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Wörter und Wendungen der Marke, mit Endungen («viral» trifft «viralen»), ohne Treffer mitten in einem Wort. */
function verbotenRegex(wort: string): RegExp {
  const einzeln = !/\s/.test(wort.trim());
  return new RegExp(`(?<![\\p{L}\\p{N}])${maskiere(wort.trim())}${einzeln ? "\\p{L}*" : ""}(?![\\p{L}\\p{N}])`, "giu");
}

/** Vereinheitlichte Zahl: ohne Tausendertrenner und Leerzeichen, Dezimalkomma als Punkt. «1'000», «1 000» und «1000» sind dieselbe Zahl. */
export function normalisiereZahl(s: string): string {
  return s.replace(/['’  \s]/g, "").replace(",", ".");
}

/** Zahlen im Text samt Stelle. Daten wie 03.10.2026 und Jahreszahlen zählen nicht. */
function zahlen(text: string): { roh: string; norm: string; mitEinheit: boolean }[] {
  const ohneDaten = text.replace(/\b\d{1,2}\.\d{1,2}\.\d{2,4}\b/g, " ");
  const out: { roh: string; norm: string; mitEinheit: boolean }[] = [];
  const re = /(?<![\p{L}\p{N}])(?:\d{1,3}(?:['’]\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)(?![\p{L}\p{N}])/gu;
  for (const m of ohneDaten.matchAll(re)) {
    const roh = m[0];
    const rest = ohneDaten.slice((m.index ?? 0) + roh.length, (m.index ?? 0) + roh.length + 6);
    const mitEinheit = /^\s?(%|Prozent|CHF|Fr\.)/i.test(rest);
    const vorher = ohneDaten.slice(Math.max(0, (m.index ?? 0) - 5), m.index ?? 0);
    const chf = /CHF\s?$/i.test(vorher);
    const norm = normalisiereZahl(roh);
    const jahr = /^\d{4}$/.test(norm) && Number(norm) >= 1900 && Number(norm) <= 2100;
    if (jahr) continue;
    out.push({ roh, norm, mitEinheit: mitEinheit || chf });
  }
  return out;
}

export function textpruefung(o: TextPruefOptionen): TextBefund[] {
  const b: TextBefund[] = [];
  const add = (stufe: TextBefund["stufe"], code: string, text: string) => b.push({ stufe, code, text });
  const t = o.text;

  if (!t.trim()) {
    add("fehler", "leer", "Der Text ist leer");
    return b;
  }

  for (const w of o.verboteneWoerter) {
    if (!w.trim()) continue;
    const treffer = t.match(verbotenRegex(w));
    if (treffer) add("fehler", "verbotenes_wort", `Verbotenes Wort der Marke: «${treffer[0]}»`);
  }

  if (/ß/.test(t)) add("fehler", "eszett", "«ß» gibt es in der Schweizer Rechtschreibung nicht: ss schreiben");

  if (/—/.test(t) || /\s–\s/.test(t) || /--/.test(t)) {
    add("fehler", "gedankenstrich", "Gedankenstrich als Satzzeichen: Punkt oder Komma setzen");
  } else if (/\s-\s/.test(t)) {
    add("warnung", "bindestrich_als_strich", "Bindestrich mit Leerzeichen sieht wie ein Gedankenstrich aus");
  }

  const belegZahlen = new Set(zahlen(o.beleg).map((z) => z.norm));
  const gemeldet = new Set<string>();
  for (const z of zahlen(t)) {
    const roh = z.roh;
    if (/^\d{4,}$/.test(roh)) add("warnung", "zahlenformat", `«${roh}» ohne Tausendertrenner: ${roh.replace(/\B(?=(\d{3})+(?!\d))/g, "'")} schreiben`);
    else if (/^\d{1,3}[.,]\d{3}$/.test(roh)) add("warnung", "zahlenformat", `«${roh}» sieht wie ein Tausenderpunkt aus: Schweizer Schreibweise ist ${roh.replace(/[.,]/, "'")}`);
    const bedeutsam = z.norm.replace(".", "").length >= 2 || z.mitEinheit;
    if (bedeutsam && !belegZahlen.has(z.norm) && !gemeldet.has(z.norm)) {
      gemeldet.add(z.norm);
      add("fehler", "zahl_ohne_beleg", `Die Zahl «${roh}» steht nicht im Beleg: keine Zahl ohne Quelle`);
    }
  }
  if (/\d%/.test(t)) add("warnung", "prozent", "Prozent mit Leerzeichen schreiben: 70 %, nicht 70%");

  const l = o.format ? o.schnittprofil?.textlaengen[o.format] : undefined;
  if (l) {
    const n = [...t].length;
    if (n < l.min) add("fehler", "zu_kurz", `${n} Zeichen, verlangt sind mindestens ${l.min} für ${o.format}`);
    if (n > l.max) add("fehler", "zu_lang", `${n} Zeichen, erlaubt sind höchstens ${l.max} für ${o.format}`);
  }
  return b;
}

export const textBestanden = (b: TextBefund[]): boolean => !b.some((x) => x.stufe === "fehler");
