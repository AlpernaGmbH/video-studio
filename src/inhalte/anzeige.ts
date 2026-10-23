/**
 * Der Entwurf einer Anzeige (Format «Anzeige»: Bild-, Karussell- und Textanzeigen; Video-Anzeigen sind Reels mit der Plattform «Anzeigen») besteht aus Varianten für drei Teile:
 * Hook, Körper und Aufruf. Der Entwurf ist Markdown mit je einer Überschrift pro Teil, darunter eine Liste oder je Variante ein Absatz:
 *
 *   ## Hook
 *   - Erste Variante
 *   - Zweite Variante
 *   ## Körper
 *   …
 *   ## Aufruf
 *   …
 */

export const ANZEIGE_TEILE = ["hook", "koerper", "aufruf"] as const;
export type AnzeigenTeil = (typeof ANZEIGE_TEILE)[number];

export const ANZEIGE_NAMEN: Record<AnzeigenTeil, string> = { hook: "Hook", koerper: "Körper", aufruf: "Aufruf" };

export interface AnzeigenVarianten {
  hook: string[];
  koerper: string[];
  aufruf: string[];
  /** Die Teile, deren Überschrift im Entwurf steht, auch wenn darunter nichts steht. */
  gefunden: AnzeigenTeil[];
}

const UEBERSCHRIFT = /^\s{0,3}#{1,4}\s*(hook|körper|koerper|aufruf)\b.*$/iu;
const LISTENPUNKT = /^\s*(?:[-*•]|\d+[.)])\s+(.*\S)\s*$/u;

const teilVonName = (n: string): AnzeigenTeil => {
  const k = n.toLowerCase();
  return k === "hook" ? "hook" : k === "aufruf" ? "aufruf" : "koerper";
};

/** Zerlegt den Text eines Teils in Varianten: Listenpunkte, sonst ein Absatz je Variante. */
function varianten(zeilen: string[]): string[] {
  const punkte: string[] = [];
  let offen: string | null = null;
  for (const z of zeilen) {
    const m = LISTENPUNKT.exec(z);
    if (m) {
      if (offen !== null) punkte.push(offen);
      offen = m[1]!.trim();
    } else if (offen !== null && /^\s+\S/.test(z)) {
      offen += ` ${z.trim()}`;
    } else if (offen !== null && !z.trim()) {
      punkte.push(offen);
      offen = null;
    }
  }
  if (offen !== null) punkte.push(offen);
  if (punkte.length) return punkte.filter(Boolean);
  return zeilen
    .join("\n")
    .split(/\n\s*\n/)
    .map((a) => a.trim().replace(/\s*\n\s*/g, " "))
    .filter(Boolean);
}

export function leseAnzeige(text: string): AnzeigenVarianten {
  const aus: AnzeigenVarianten = { hook: [], koerper: [], aufruf: [], gefunden: [] };
  const sammlung: Record<AnzeigenTeil, string[]> = { hook: [], koerper: [], aufruf: [] };
  let aktuell: AnzeigenTeil | null = null;
  for (const z of text.split(/\r?\n/)) {
    const m = UEBERSCHRIFT.exec(z);
    if (m) {
      aktuell = teilVonName(m[1]!);
      if (!aus.gefunden.includes(aktuell)) aus.gefunden.push(aktuell);
      continue;
    }
    // eine andere Überschrift beendet den Teil
    if (/^\s{0,3}#{1,4}\s/.test(z)) {
      aktuell = null;
      continue;
    }
    if (aktuell) sammlung[aktuell].push(z);
  }
  for (const t of ANZEIGE_TEILE) aus[t] = varianten(sammlung[t]);
  return aus;
}
