import { describe, expect, it } from "vitest";
import { Schnittprofil } from "../core/schemas";
import { normalisiereZahl, textBestanden, textpruefung, type TextPruefOptionen } from "./textpruefung";

const verboten = ["viral", "Synergien", "ganzheitlich", "Mehrwert", "lass uns", "tauche ein"];
const pruefe = (o: Partial<TextPruefOptionen>) => textpruefung({ text: "", beleg: "", verboteneWoerter: verboten, ...o });
const codes = (o: Partial<TextPruefOptionen>) => pruefe(o).map((b) => b.code);

describe("Textprüfung: ein sauberer Text besteht", () => {
  it("Zahlen aus dem Beleg, Schweizer Format, keine verbotenen Wörter", () => {
    const b = pruefe({ text: "BC Trogen hatte 74'300 Aufrufe in 3 Monaten. Das sind 8,1 % mehr als im Vorjahr.", beleg: "74300 Aufrufe in 3 Monaten, Plus 8.1 % zum Vorjahr" });
    expect(b).toEqual([]);
    expect(textBestanden(b)).toBe(true);
  });
});

describe("Textprüfung: verbotene Wörter", () => {
  it("trifft das Wort mit Endung, gross oder klein", () => {
    expect(codes({ text: "Ein viraler Post ist kein Plan." })).toContain("verbotenes_wort");
    expect(codes({ text: "Das Ergebnis ist GANZHEITLICH gedacht." })).toContain("verbotenes_wort");
  });

  it("trifft Wendungen aus mehreren Wörtern, aber nicht mitten in einem anderen Wort", () => {
    expect(codes({ text: "Lass uns starten." })).toContain("verbotenes_wort");
    expect(codes({ text: "Das Glass uns nicht." })).not.toContain("verbotenes_wort");
    expect(codes({ text: "Die Aviral-Studie ist etwas anderes." })).not.toContain("verbotenes_wort");
  });

  it("nennt das gefundene Wort, damit man es streichen kann", () => {
    expect(pruefe({ text: "Mehrwerte für alle." }).find((x) => x.code === "verbotenes_wort")?.text).toContain("Mehrwerte");
  });

  it("leere Einträge in der Liste lösen nichts aus", () => {
    expect(codes({ text: "Alles gut.", verboteneWoerter: ["", "  "] })).toEqual([]);
  });
});

describe("Textprüfung: Schreibweise", () => {
  it("«ß» ist ein Fehler", () => {
    expect(codes({ text: "Wir grüssen und schließen." })).toContain("eszett");
    expect(codes({ text: "Wir grüssen und schliessen." })).not.toContain("eszett");
  });

  it("Gedankenstriche sind ein Fehler, Zahlenbereiche nicht", () => {
    expect(codes({ text: "Das Ziel — und der Weg." })).toContain("gedankenstrich");
    expect(codes({ text: "Das Ziel – und der Weg." })).toContain("gedankenstrich");
    expect(codes({ text: "Das Ziel -- und der Weg." })).toContain("gedankenstrich");
    expect(codes({ text: "Zwei bis drei Wörter, 2–3 Stück." })).not.toContain("gedankenstrich");
  });

  it("Bindestrich mit Leerzeichen ist eine Warnung", () => {
    const b = pruefe({ text: "Das Ziel - und der Weg." });
    expect(b.find((x) => x.code === "bindestrich_als_strich")?.stufe).toBe("warnung");
    expect(textBestanden(b)).toBe(true);
  });

  it("Prozent ohne Leerzeichen ist eine Warnung", () => {
    expect(pruefe({ text: "Plus 8% mehr.", beleg: "8%" }).find((x) => x.code === "prozent")?.stufe).toBe("warnung");
  });
});

describe("Textprüfung: Zahlen", () => {
  it("eine Zahl, die nicht im Beleg steht, ist ein Fehler", () => {
    const b = pruefe({ text: "Wir betreuen 17 Partner.", beleg: "Wir betreuen Partner in der Ostschweiz." });
    expect(b.find((x) => x.code === "zahl_ohne_beleg")?.text).toContain("17");
    expect(textBestanden(b)).toBe(false);
  });

  it("dieselbe Zahl in anderer Schreibweise gilt als gleich", () => {
    expect(codes({ text: "Es waren 1'000 Besucher.", beleg: "1000 Besucher" })).not.toContain("zahl_ohne_beleg");
    expect(codes({ text: "Plus 8,1 %.", beleg: "8.1 %" })).not.toContain("zahl_ohne_beleg");
    expect(normalisiereZahl("1 000")).toBe("1000");
    expect(normalisiereZahl("8,1")).toBe("8.1");
  });

  it("einstellige Zahlen ohne Einheit sind keine Behauptung, mit Einheit schon", () => {
    expect(codes({ text: "Drei Tipps und ein Beispiel: 3 Wege.", beleg: "" })).not.toContain("zahl_ohne_beleg");
    expect(codes({ text: "Das bringt 7 %.", beleg: "" })).toContain("zahl_ohne_beleg");
    expect(codes({ text: "Das kostet CHF 9.", beleg: "" })).toContain("zahl_ohne_beleg");
  });

  it("Jahreszahlen und Daten zählen nicht, jede fehlende Zahl wird nur einmal gemeldet", () => {
    expect(codes({ text: "Am 03.10.2026 war es 2026.", beleg: "" })).not.toContain("zahl_ohne_beleg");
    expect(pruefe({ text: "Es sind 42, ja 42 Stück.", beleg: "" }).filter((x) => x.code === "zahl_ohne_beleg")).toHaveLength(1);
  });

  it("Tausender ohne Trenner und mit Punkt oder Komma sind Warnungen mit dem richtigen Vorschlag", () => {
    const a = pruefe({ text: "Es gab 74300 Aufrufe.", beleg: "74300" }).find((x) => x.code === "zahlenformat");
    expect(a?.text).toContain("74'300");
    const b = pruefe({ text: "Es gab 1.000 Aufrufe.", beleg: "1000" }).find((x) => x.code === "zahlenformat");
    expect(b?.text).toContain("1'000");
    expect(pruefe({ text: "Es gab 1,5 Aufrufe.", beleg: "1,5" }).some((x) => x.code === "zahlenformat")).toBe(false);
  });
});

describe("Textprüfung: Länge und leerer Text", () => {
  const profil = Schnittprofil.parse({ laengstePause: 0.25, laengsteEinstellung: 1.5, woerterJeUntertitel: { min: 2, max: 3 }, hookMaxSekunden: 2, zoomTempo: "mittel", textlaengen: { "LinkedIn-Post": { min: 20, max: 60 } } });

  it("hält die Länge je Format ein, wenn das Schnittprofil eine vorgibt", () => {
    expect(codes({ text: "Kurz.", format: "LinkedIn-Post", schnittprofil: profil })).toContain("zu_kurz");
    expect(codes({ text: "x".repeat(80), format: "LinkedIn-Post", schnittprofil: profil })).toContain("zu_lang");
    expect(codes({ text: "Ein Satz, der genau passend lang ist.", format: "LinkedIn-Post", schnittprofil: profil })).toEqual([]);
    expect(codes({ text: "Kurz.", format: "Blog", schnittprofil: profil })).toEqual([]);
  });

  it("ein leerer Text besteht nicht", () => {
    expect(codes({ text: "  \n " })).toEqual(["leer"]);
  });
});
