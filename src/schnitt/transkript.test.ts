import { describe, expect, it } from "vitest";
import { gleichesWort, leseTranskript, MAX_SEGMENT, normiere, rohWoerter, teileLange, TranskriptFehler, transkriptWoerter, verteile, type Segment } from "./transkript";

describe("leseTranskript", () => {
  it("liest openai-whisper mit Wortzeiten", () => {
    const s = leseTranskript({
      segments: [
        { start: 0, end: 2, text: " Hallo zusammen.", words: [{ word: " Hallo", start: 0.1, end: 0.6 }, { word: " zusammen.", start: 0.7, end: 1.4 }] },
        { start: 2, end: 3, text: "  " },
      ],
    });
    expect(s).toHaveLength(1);
    expect(s[0]!.text).toBe("Hallo zusammen.");
    expect(s[0]!.woerter).toHaveLength(2);
    expect(s[0]!.woerter![0]).toEqual({ text: " Hallo", von: 0.1, bis: 0.6 });
  });

  it("liest whisper.cpp (Millisekunden)", () => {
    const s = leseTranskript({ transcription: [{ offsets: { from: 1500, to: 3250 }, text: " Wir bauen um." }] });
    expect(s).toEqual([{ von: 1.5, bis: 3.25, text: "Wir bauen um." }]);
  });

  it("liest das einfache Format und ordnet nach Zeit", () => {
    const s = leseTranskript({ segmente: [{ von: 5, bis: 6, text: "zweitens" }, { von: 1, bis: 2, text: "erstens" }] });
    expect(s.map((x) => x.text)).toEqual(["erstens", "zweitens"]);
  });

  it("wirft bei unbekanntem Format und lässt Segmente ohne Dauer weg", () => {
    expect(() => leseTranskript({ foo: 1 })).toThrow(TranskriptFehler);
    expect(leseTranskript({ segmente: [{ von: 2, bis: 2, text: "nichts" }] })).toEqual([]);
  });
});

describe("normiere und rohWoerter", () => {
  it("entfernt Satzzeichen, macht klein und ersetzt ß", () => {
    expect(normiere("Umgebaut.")).toBe("umgebaut");
    expect(normiere("«Grüezi»,")).toBe("grüezi");
    expect(normiere("Straße")).toBe("strasse");
  });
  it("entfernt Tausendertrenner in Zahlen", () => {
    expect(normiere("1'000")).toBe("1000");
    expect(normiere("1.000")).toBe("1000");
  });
  it("trennt an Leerraum", () => {
    expect(rohWoerter("  Wir   bauen\num. ")).toEqual(["Wir", "bauen", "um."]);
  });
});

describe("gleichesWort", () => {
  it("gleich ist gleich, leer ist nie gleich", () => {
    expect(gleichesWort("küche", "küche")).toBe(true);
    expect(gleichesWort("", "")).toBe(false);
  });
  it("lässt bei längeren Wörtern kleine Abweichungen zu", () => {
    expect(gleichesWort("umgebaut", "umgebaute")).toBe(true);
    expect(gleichesWort("komplett", "komplet")).toBe(true);
  });
  it("lässt bei kurzen Wörtern keine Abweichung zu", () => {
    expect(gleichesWort("der", "die")).toBe(false);
    expect(gleichesWort("im", "um")).toBe(false);
  });
  it("lehnt verschiedene lange Wörter ab", () => {
    expect(gleichesWort("küche", "kunde")).toBe(false);
    expect(gleichesWort("stauraum", "stadtrat")).toBe(false);
  });
  it("hält Zahl und Zahlwort für dasselbe, aber nicht Zahl und Wort", () => {
    expect(gleichesWort("5", "fünf")).toBe(true);
    expect(gleichesWort("fünf", "5")).toBe(true);
    expect(gleichesWort("5", "küche")).toBe(false);
  });
});

describe("verteile", () => {
  it("nimmt echte Wortzeiten, wenn Whisper sie liefert", () => {
    const w = verteile({ von: 0, bis: 2, text: "a b", woerter: [{ text: "a", von: 0.2, bis: 0.5 }, { text: "b", von: 0.9, bis: 1.5 }] });
    expect(w.map((x) => [x.von, x.bis, x.echt])).toEqual([[0.2, 0.5, true], [0.9, 1.5, true]]);
  });
  it("verteilt sonst nach Zeichenzahl über das ganze Segment", () => {
    const w = verteile({ von: 10, bis: 14, text: "ab abcdef" });
    expect(w[0]!.von).toBe(10);
    expect(w[1]!.bis).toBe(14);
    expect(w[0]!.bis).toBeCloseTo(11, 6); // 2 von 8 Zeichen = 1 s
    expect(w[0]!.bis).toBe(w[1]!.von);
    expect(w.every((x) => !x.echt)).toBe(true);
  });
  it("gibt bei leerem Text nichts zurück", () => {
    expect(verteile({ von: 0, bis: 1, text: "   " })).toEqual([]);
  });
});

describe("teileLange", () => {
  const lang = (text: string, dauer: number): Segment => ({ von: 0, bis: dauer, text });

  it("lässt Segmente bis 4 Sekunden unberührt", () => {
    const s = lang("eins zwei drei", MAX_SEGMENT);
    expect(teileLange([s])).toEqual([s]);
  });

  it("teilt ein 9-Sekunden-Segment so, dass kein Teil über 4 Sekunden dauert", () => {
    const text = "Wir haben diese Woche eine Küche komplett umgebaut und der Kunde wollte mehr Stauraum haben";
    const teile = teileLange([lang(text, 9)]);
    expect(teile.length).toBeGreaterThanOrEqual(3);
    for (const t of teile) expect(t.bis - t.von).toBeLessThanOrEqual(MAX_SEGMENT + 1e-9);
    // nichts geht verloren und die Reihenfolge bleibt
    expect(teile.map((t) => t.text).join(" ")).toBe(text);
    // lückenlos
    for (let i = 1; i < teile.length; i++) expect(teile[i]!.von).toBeCloseTo(teile[i - 1]!.bis, 9);
    expect(teile[0]!.von).toBe(0);
    expect(teile[teile.length - 1]!.bis).toBe(9);
  });

  it("teilt mit echten Wörtern an der grössten Pause nahe der Mitte", () => {
    const woerter = [
      { text: "eins", von: 0, bis: 0.5 },
      { text: "zwei", von: 0.6, bis: 1.1 },
      { text: "drei", von: 1.2, bis: 1.7 },
      { text: "vier", von: 3.4, bis: 3.9 },
      { text: "fünf", von: 4.0, bis: 4.5 },
      { text: "sechs", von: 4.6, bis: 5.1 },
    ];
    const s: Segment = { von: 0, bis: 5.2, text: woerter.map((x) => x.text).join(" "), woerter };
    const teile = teileLange([s]);
    expect(teile).toHaveLength(2);
    expect(teile[0]!.text).toBe("eins zwei drei");
    expect(teile[1]!.text).toBe("vier fünf sechs");
    // die Grenze liegt mitten in der Pause (1,7 bis 3,4)
    expect(teile[0]!.bis).toBeCloseTo(2.55, 6);
    expect(teile[1]!.von).toBeCloseTo(2.55, 6);
  });

  it("teilt an einer grossen Pause auch dann, wenn sie nicht in der Mitte liegt", () => {
    const woerter = [
      { text: "a", von: 0, bis: 0.5 },
      { text: "b", von: 0.6, bis: 1.1 },
      { text: "c", von: 2.0, bis: 2.5 },
      { text: "d", von: 2.6, bis: 3.1 },
      { text: "e", von: 3.2, bis: 3.7 },
      { text: "f", von: 3.8, bis: 4.3 },
      { text: "g", von: 4.4, bis: 4.9 },
      { text: "h", von: 5.0, bis: 5.5 },
    ];
    const teile = teileLange([{ von: 0, bis: 5.5, text: woerter.map((x) => x.text).join(" "), woerter }]);
    expect(teile.map((t) => t.text)).toEqual(["a b", "c d e f g h"]);
  });

  it("bevorzugt Satzende vor der Mitte, wenn keine echten Wörter da sind", () => {
    const text = "Das ist der erste Satz. Danach kommt der zweite Satz der länger ist als der erste Satz hier";
    const teile = teileLange([lang(text, 7.6)]);
    expect(teile[0]!.text).toBe("Das ist der erste Satz.");
    expect(teile[0]!.bis).toBeGreaterThan(1.5);
    expect(teile[0]!.bis).toBeLessThan(2.2);
    for (const t of teile) expect(t.bis - t.von).toBeLessThanOrEqual(MAX_SEGMENT + 1e-9);
  });
});

describe("teileLange: Herkunft der Wortzeiten", () => {
  it("lässt verteilte Wortzeiten nach dem Teilen verteilt (nicht als gemessen erscheinen)", () => {
    const teile = teileLange([{ von: 0, bis: 9, text: "eins zwei drei vier fünf sechs sieben acht neun zehn elf zwölf" }]);
    expect(teile.length).toBeGreaterThan(1);
    expect(teile.every((t) => t.woerter === undefined)).toBe(true);
    expect(transkriptWoerter(teile).every((w) => !w.echt)).toBe(true);
  });
  it("behält echte Wortzeiten nach dem Teilen", () => {
    const woerter = Array.from({ length: 12 }, (_, i) => ({ text: `wort${i}`, von: i * 0.75, bis: i * 0.75 + 0.5 }));
    const teile = teileLange([{ von: 0, bis: 9, text: woerter.map((x) => x.text).join(" "), woerter }]);
    expect(teile.length).toBeGreaterThan(1);
    expect(transkriptWoerter(teile).every((w) => w.echt)).toBe(true);
  });
});

describe("transkriptWoerter", () => {
  it("liefert Wörter in Zeitfolge, auch über geteilte Segmente", () => {
    const w = transkriptWoerter([
      { von: 0, bis: 8, text: "a bb ccc dddd eeeee ffffff ggggggg hhhhhhhh" },
      { von: 9, bis: 10, text: "ende" },
    ]);
    expect(w.map((x) => x.text).join(" ")).toBe("a bb ccc dddd eeeee ffffff ggggggg hhhhhhhh ende");
    for (let i = 1; i < w.length; i++) expect(w[i]!.von).toBeGreaterThanOrEqual(w[i - 1]!.von - 1e-9);
    expect(w.every((x) => x.bis - x.von <= MAX_SEGMENT)).toBe(true);
  });
});
