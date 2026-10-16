import type { Markenprofil } from "../core/schemas";
import { Stueck } from "../motion/stueck";
import { Pitch, type Idee, type IdeeEntwurf, type Looks } from "../motion/idee";
import { neueIdee } from "../motion/idee";

export const JETZT = "2026-10-16T12:00:00.000Z";
export const SPAETER = "2026-10-16T13:00:00.000Z";
export const MENSCH = { typ: "mensch", name: "Andrej" } as const;
export const SYSTEM = { typ: "system", name: "claude" } as const;

const einsatz = {
  wann: ["Der Satz nennt eine einzelne Kennzahl, die die Aussage trägt."],
  wannNicht: ["Der Satz beschreibt eine Entwicklung über mehrere Messwerte."],
  beispiele: [{ satz: "Sieben von zehn laden zu langsam.", variablen: { wert: 7, dauer: 2.6 } }],
  kombinierbarMit: [],
  hinweise: [],
};

/** Ein gültiges Stück, das einzelne Kennzahlen zeigt (wie der echte Zahl-Zähler). */
export function stueckZahl(over: Record<string, unknown> = {}): Stueck {
  return Stueck.parse({
    schema: 1,
    id: "zahl-zaehler",
    name: "Zahl-Zähler",
    version: "1.0.0",
    status: "aktiv",
    welle: 1,
    zweck: "Hebt eine einzelne Kennzahl hervor: Die Zahl läuft hoch.",
    ausloeser: { typen: ["zahl", "anteil"], beschreibung: "Eine Zahl im Satz, ein Anteil oder ein Betrag." },
    parameter: [
      { id: "wert", typ: "number", label: "Endwert", beschreibung: "Die Kennzahl, auf die der Zähler hinläuft.", pflicht: true, min: 0, max: 999999, default: 7 },
      { id: "suffix", typ: "string", label: "Suffix", beschreibung: "Text nach der Zahl, zum Beispiel « von 10».", maxLaenge: 10, default: "" },
      { id: "position", typ: "enum", label: "Position", beschreibung: "Wo die Karte steht im Bild.", optionen: [{ wert: "mitte", label: "Mitte" }, { wert: "oben", label: "Oben" }], default: "mitte" },
    ],
    dauer: { standard: 2.6, min: 1.4, max: 5 },
    markenvariablen: ["markeBg", "markeText", "markeAkzent1", "markeFontTitel", "markeFontText", "markeRadius", "markeTempo"],
    passtZu: ["erklaervideo"],
    aufwand: "klein",
    abnahme: "Render 1080×1920 mit Alpha, genau so lang wie die Dauer.",
    einsatz,
    freigabe: { wer: "Andrej", wann: JETZT },
    ...over,
  });
}

/** Ein gültiges Stück, das Verläufe über 2 bis 8 Werte zeigt. */
export function stueckVerlauf(over: Record<string, unknown> = {}): Stueck {
  return Stueck.parse({
    schema: 1,
    id: "wert-verlauf",
    name: "Wert-Verlauf",
    version: "1.0.0",
    status: "aktiv",
    welle: "wachstum",
    zweck: "Zeigt, wie sich ein Wert über mehrere Messungen entwickelt.",
    ausloeser: { typen: ["verlauf"], beschreibung: "Ein Wert verändert sich über mehrere Messungen oder Zeitpunkte." },
    parameter: [
      { id: "werte", typ: "zahlenreihe", label: "Werte", beschreibung: "Die gemessenen Werte in zeitlicher Reihenfolge.", pflicht: true, minAnzahl: 2, maxAnzahl: 8, min: 0, max: 100, default: [97, 80, 60] },
      { id: "titel", typ: "string", label: "Titel", beschreibung: "Worum es bei den Werten geht.", maxLaenge: 40, default: "" },
    ],
    dauer: { standard: 3, min: 2, max: 6 },
    markenvariablen: ["markeBg", "markeText", "markeAkzent1"],
    passtZu: ["erklaervideo", "talking-head"],
    aufwand: "mittel",
    abnahme: "Linie läuft vom ersten zum letzten Wert, Endwert steht lesbar im Bild.",
    einsatz: { ...einsatz, beispiele: [{ satz: "Der Score fiel von 97 auf 60.", variablen: { werte: [97, 80, 60], dauer: 3 } }] },
    freigabe: { wer: "Andrej", wann: JETZT },
    ...over,
  });
}

export function marke(over: Partial<Markenprofil> = {}): Markenprofil {
  return {
    schluessel: "alperna",
    name: "Alperna",
    status: "freigegeben",
    freigabe: { wer: "Andrej", wann: JETZT },
    farben: { hintergrund: "#FFFFFF", text: "#0A0A0A", akzent1: "#FFC629", akzent2: "#4B3FD6" },
    schriften: { titel: "Poppins", fliesstext: "Montserrat" },
    logo: {},
    effektStil: { eckenradius: 24, schatten: false, bewegungstempo: 1 },
    tonalitaet: { anrede: "du", verboteneWoerter: [], hinweise: "" },
    ton: { sfxDichte: 0.3, musik: false },
    hashtags: { fest: [], anzahl: 5 },
    ...over,
  };
}

export const SATZ_LAEUFERIN = "Die Läuferin fiel über fünf Scans von 97 auf 60.";

export function entwurf(over: Partial<IdeeEntwurf> = {}): IdeeEntwurf {
  return {
    titel: "Wert-Verlauf",
    beschreibung: "Zeigt den Verlauf eines Werts über mehrere Messungen als Linie.",
    quelle: { typ: "video", projekt: "P-023", zeile: "z04", t: 14.2, satz: SATZ_LAEUFERIN },
    signale: [{ typ: "verlauf", von: 97, auf: 60, schritte: 5, schrittEinheit: "scans", richtung: "fallend", text: "über fünf Scans von 97 auf 60", sicherheit: "hoch" }],
    warumNichtsPasst: {
      zusammenfassung: "Der Zahl-Zähler zeigt einzelne Kennzahlen, der Satz beschreibt einen Verlauf.",
      geprueft: [{ stueck: "zahl-zaehler", grund: "Zeigt einen einzelnen Wert, keinen Verlauf über fünf Messungen." }],
      bibliothekGroesse: 1,
      geprueftAm: JETZT,
    },
    ...over,
  };
}

export function pitch(over: Record<string, unknown> = {}) {
  return Pitch.parse({
    text: "Ein Wert verändert sich über mehrere Messungen. Das lässt sich in Worten schlecht fassen, als Linie sieht man es sofort.",
    zeigt: "Eine Linie, die über die Messungen vom ersten zum letzten Wert läuft, mit beschriftetem Anfangs- und Endpunkt.",
    parameter: ["Werte der Reihe", "Titel", "Einheit"],
    wiederverwendung: ["Website-Score über mehrere Messungen vor und nach einem Relaunch", "Anfragen pro Monat über ein Quartal"],
    aufwand: "mittel",
    ...over,
  });
}

export function looks(runde = 1): Looks {
  const ids = ["a", "b", "c"] as const;
  return {
    runde,
    briefs: [
      { id: "a", name: "Plakat", leitidee: "Grosse Zahl, Akzentfläche, wenig Beiwerk", typografie: "Poppins 700, sehr gross", farbeinsatz: "Akzent als Fläche", bewegung: "Linie schiesst ein, Zahl springt" },
      { id: "b", name: "Interface", leitidee: "Karte mit feinem Raster wie ein Dashboard", typografie: "Montserrat 500, klein", farbeinsatz: "Akzent nur für die Linie", bewegung: "Linie zeichnet sich ruhig" },
      { id: "c", name: "Editorial", leitidee: "Dünne Linien, viel Weissraum, Beschriftung am Rand", typografie: "Poppins 600, mittel", farbeinsatz: "Schwarz auf transparent", bewegung: "Punkte erscheinen nacheinander" },
    ],
    bilder: ids.map((id) => ({ id, pfad: `looks/${id}.png` })),
    notizen: [],
  };
}

export function ideeNeu(id = "m-001"): Idee {
  return neueIdee(entwurf(), id, SYSTEM, JETZT);
}
