import { describe, expect, it } from "vitest";
import { ausrichten, ordneZu, skriptWoerterMitZeit, skriptZeilen, STOCKEN, type QuelleTranskript } from "./zuordnung";
import { transkriptWoerter, type Segment } from "./transkript";
import { testSatz } from "./testdaten";

const satz = testSatz;
const quelle = (id: string, ...segmente: Segment[]): QuelleTranskript => ({ quelle: id, segmente });

const Z1 = "Wir haben diese Woche eine Küche komplett umgebaut.";
const Z2 = "Der Kunde wollte mehr Stauraum.";
const Z3 = "Das Ergebnis siehst du hier.";
const skript = [Z1, Z2, Z3];

describe("skriptZeilen", () => {
  it("lässt Überschriften, Kommentare und Zitate weg und trennt Sätze", () => {
    const z = skriptZeilen("# Reel Küche\n<!-- Hook -->\nWir bauen um. Das dauert fünf Tage.\n> Notiz\n\nZum Schluss: danke.");
    expect(z).toEqual(["Wir bauen um.", "Das dauert fünf Tage.", "Zum Schluss: danke."]);
  });
  it("trennt nicht nach Abkürzungen und Dezimalzahlen", () => {
    expect(skriptZeilen("Das kostet z. B. 2.5 Mio. Franken.")).toHaveLength(1);
  });
});

describe("ausrichten", () => {
  it("findet die gemeinsame Teilfolge und überspringt Eingeschobenes", () => {
    const p = ausrichten(["wir", "bauen", "um"], ["wir", "ähm", "bauen", "wirklich", "um"]);
    expect(p).toEqual([{ s: 0, w: 0 }, { s: 1, w: 2 }, { s: 2, w: 4 }]);
  });
  it("nimmt unscharfe Treffer und Zahlwörter", () => {
    const p = ausrichten(["fünf", "küchen", "umgebaut"], ["5", "küche", "umgebaute"]);
    expect(p).toHaveLength(3);
  });
  it("gibt bei fehlender Übereinstimmung nichts zurück", () => {
    expect(ausrichten(["a1", "b2"], ["x", "y"])).toEqual([]);
  });
});

describe("ordneZu: Take-Auswahl", () => {
  const material = quelle(
    "a",
    satz(1, "Wir haben diese Woche ähm eine Küche komplett umgebaut."), // Füllwort
    satz(6, "Moment nochmal von vorne."), // Gespräch
    satz(9, Z1), // sauber
    satz(14, "Der Kunde wollte"), // abgebrochen
    satz(17, Z2), // sauber
    satz(21, "So das war es kurz zum Trinken."), // Gespräch ohne Skriptbezug
  );
  const z = ordneZu(skript, [material]);

  it("wählt den sauberen späteren Take und nicht den mit Füllwort", () => {
    const e = z.zeilen[0]!;
    expect(e.status).toBe("ok");
    expect(e.takes).toHaveLength(2);
    expect(e.gewaehlt!.von).toBeCloseTo(9, 6);
    expect(e.zweitbester!.von).toBeCloseTo(1, 6);
    expect(e.zweitbester!.fuellwoerter.map((f) => f.text)).toEqual(["ähm"]);
    expect(e.zweitbester!.ausgeschieden.join()).toMatch(/Füllwort/);
  });

  it("wählt den vollständigen Take statt des abgebrochenen", () => {
    const e = z.zeilen[1]!;
    expect(e.status).toBe("ok");
    expect(e.gewaehlt!.von).toBeCloseTo(17, 6);
    const abgebrochen = e.takes.find((t) => t.von < 15);
    expect(abgebrochen).toBeDefined();
    expect(abgebrochen!.ausgeschieden.join()).toMatch(/unvollständig/);
  });

  it("meldet eine Zeile ohne Treffer als «fehlt im Material»", () => {
    const e = z.zeilen[2]!;
    expect(e.status).toBe("fehlt");
    expect(e.takes).toEqual([]);
    expect(e.gewaehlt).toBeUndefined();
    expect(e.hinweise).toContain("fehlt im Material");
  });

  it("verwirft Segmente ohne Bezug zum Skript, aber keine belegten", () => {
    const texte = z.verworfen.map((v) => v.text);
    expect(texte).toContain("Moment nochmal von vorne.");
    expect(texte).toContain("So das war es kurz zum Trinken.");
    expect(texte).not.toContain(Z1);
    expect(texte).not.toContain(Z2);
  });

  it("legt die Nachbarwörter fest, damit der Schnitt nichts anschneidet", () => {
    const e = z.zeilen[0]!.gewaehlt!;
    expect(e.vorWortBis).toBeDefined();
    expect(e.vorWortBis!).toBeLessThan(e.von);
    expect(e.nachWortVon!).toBeGreaterThan(e.bis);
  });
});

describe("ordneZu: gelb", () => {
  it("ist gelb, wenn nur ein Take mit Füllwort da ist, und lässt das Füllwort aus den Skriptwörtern", () => {
    const z = ordneZu([Z1], [quelle("a", satz(1, "Wir haben diese Woche ähm eine Küche komplett umgebaut."))]);
    const e = z.zeilen[0]!;
    expect(e.status).toBe("gelb");
    expect(e.gewaehlt!.fuellwoerter).toHaveLength(1);
    expect(e.hinweise.join()).toMatch(/Kein sauberer Take/);
    expect(e.woerter!.map((w) => w.text)).toEqual(Z1.split(" "));
    expect(e.woerter!.some((w) => /äh/i.test(w.text))).toBe(false);
  });

  it("ist gelb bei einem Neustart direkt nach dem Take", () => {
    const z = ordneZu([Z2], [quelle("a", satz(1, "Der Kunde wollte mehr Stauraum nochmal"))]);
    const e = z.zeilen[0]!;
    expect(e.status).toBe("gelb");
    expect(e.gewaehlt!.neustart).toBe(true);
  });

  it("zählt «nochmal» im Skript nicht als Neustart", () => {
    const z = ordneZu(["Wir bauen es nochmal um."], [quelle("a", satz(1, "Wir bauen es nochmal um."))]);
    expect(z.zeilen[0]!.status).toBe("ok");
    expect(z.zeilen[0]!.gewaehlt!.neustart).toBe(false);
  });

  it("zählt ein Füllwort, das im Skript steht, nicht als Füllwort", () => {
    const z = ordneZu(["Also bauen wir die Küche um."], [quelle("a", satz(1, "Also bauen wir die Küche um."))]);
    expect(z.zeilen[0]!.status).toBe("ok");
    expect(z.zeilen[0]!.gewaehlt!.fuellwoerter).toEqual([]);
  });

  it("zählt «nochmal» am Anfang der nächsten Skriptzeile nicht als Neustart der vorigen", () => {
    const zeilen = ["Wir bauen die Küche um.", "Nochmal prüfen wir alles genau."];
    const z = ordneZu(zeilen, [quelle("a", satz(1, zeilen[0]!), satz(2.8, zeilen[1]!))]);
    expect(z.zeilen[0]!.status).toBe("ok");
    expect(z.zeilen[0]!.gewaehlt!.neustart).toBe(false);
    expect(z.zeilen[1]!.status).toBe("ok");
  });

  it("meldet ein Stottern mit einem Wort, das auch im Skript steht, als Füllwort", () => {
    const z = ordneZu(["Wir bauen also die Küche um."], [quelle("a", satz(1, "Wir bauen also also die Küche um."))]);
    expect(z.zeilen[0]!.status).toBe("gelb");
    expect(z.zeilen[0]!.gewaehlt!.fuellwoerter).toHaveLength(1);
  });

  it("ist gelb, wenn das letzte Wort der Zeile fehlt", () => {
    const z = ordneZu([Z1], [quelle("a", satz(1, "Wir haben diese Woche eine Küche komplett"))]);
    expect(z.zeilen[0]!.status).toBe("gelb");
    expect(z.zeilen[0]!.gewaehlt!.ausgeschieden.join()).toMatch(/letzte Wort/);
  });

  it("ist gelb, wenn das erste Wort der Zeile fehlt", () => {
    const z = ordneZu([Z1], [quelle("a", satz(1, "haben diese Woche eine Küche komplett umgebaut."))]);
    expect(z.zeilen[0]!.status).toBe("gelb");
    expect(z.zeilen[0]!.gewaehlt!.ausgeschieden.join()).toMatch(/erste Wort/);
  });
});

describe("ordneZu: Zeilen über Segmentgrenzen und lange Segmente", () => {
  it("findet eine Zeile, die Whisper auf zwei Segmente verteilt hat", () => {
    const z = ordneZu([Z1], [quelle("a", satz(2, "Wir haben diese Woche"), satz(3.6, "eine Küche komplett umgebaut."))]);
    const e = z.zeilen[0]!;
    expect(e.status).toBe("ok");
    expect(e.gewaehlt!.text).toBe(Z1.replace("umgebaut.", "umgebaut."));
    expect(z.verworfen).toEqual([]);
  });

  it("teilt ein Segment über 4 Sekunden und ordnet beide Zeilen darin zu", () => {
    // ein einziges 9-Sekunden-Segment ohne Wortzeiten
    const text = `${Z1} ${Z2}`;
    const lang: Segment = { von: 10, bis: 19, text };
    const z = ordneZu([Z1, Z2], [quelle("a", lang)]);
    const [a, b] = z.zeilen;
    expect(a!.status).toBe("ok");
    expect(b!.status).toBe("ok");
    expect(a!.gewaehlt!.bis).toBeLessThanOrEqual(b!.gewaehlt!.von + 1e-9);
    expect(a!.gewaehlt!.von).toBeGreaterThanOrEqual(10);
    expect(b!.gewaehlt!.bis).toBeLessThanOrEqual(19 + 1e-9);
    // Wortzeiten sind verteilt, nicht gemessen
    expect(a!.gewaehlt!.fluessigGemessen).toBe(false);
  });
});

describe("ordneZu: Konflikte", () => {
  it("lässt eine Stelle nur einer Zeile gehören", () => {
    const z = ordneZu(["Wir bauen die Küche um.", "Wir bauen das Bad um."], [quelle("a", satz(1, "Wir bauen die Küche um."))]);
    expect(z.zeilen[0]!.status).toBe("ok");
    expect(z.zeilen[1]!.status).toBe("fehlt");
  });

  it("ordnet zwei ähnliche Zeilen den zwei passenden Stellen zu", () => {
    const z = ordneZu(
      ["Wir bauen die Küche um.", "Wir bauen das Bad um."],
      [quelle("a", satz(1, "Wir bauen das Bad um."), satz(5, "Wir bauen die Küche um."))],
    );
    expect(z.zeilen[0]!.gewaehlt!.von).toBeCloseTo(5, 6);
    expect(z.zeilen[1]!.gewaehlt!.von).toBeCloseTo(1, 6);
  });
});

describe("ordneZu: Bewertung", () => {
  const zwei = (energie?: (q: string, von: number, bis: number) => number | undefined) =>
    ordneZu([Z2], [quelle("a", satz(1, Z2), satz(6, Z2))], energie ? { energie } : {});

  it("wählt bei Gleichstand den späteren Take", () => {
    const e = zwei().zeilen[0]!;
    expect(e.gewaehlt!.von).toBeCloseTo(6, 6);
    expect(e.zweitbester!.von).toBeCloseTo(1, 6);
  });

  it("zieht einen deutlich lauteren früheren Take vor, weil Energie mehr zählt als «später»", () => {
    const e = zwei((_q, von) => (von < 3 ? -12 : -26)).zeilen[0]!;
    expect(e.gewaehlt!.von).toBeCloseTo(1, 6);
    expect(e.gewaehlt!.energieDb).toBe(-12);
    expect(e.zweitbester!.energieDb).toBe(-26);
  });

  it("wertet Energie neutral, wenn sie nicht gemessen werden kann", () => {
    const e = zwei(() => undefined).zeilen[0]!;
    expect(e.gewaehlt!.energieDb).toBeUndefined();
    expect(e.gewaehlt!.kriterien.energie).toBe(0.5);
    expect(e.gewaehlt!.von).toBeCloseTo(6, 6);
  });

  it("zieht einen flüssigen früheren Take dem stockenden späteren vor", () => {
    const stocken = 1.0;
    expect(stocken).toBeGreaterThan(STOCKEN);
    const z = ordneZu(
      [Z1],
      [quelle("a", satz(1, Z1), satz(8, Z1, { 2: stocken, 4: stocken, 6: stocken }))],
    );
    const e = z.zeilen[0]!;
    expect(e.gewaehlt!.von).toBeCloseTo(1, 6);
    expect(e.zweitbester!.langePausen).toBe(3);
    expect(e.zweitbester!.kriterien.fluessig).toBeLessThan(e.gewaehlt!.kriterien.fluessig);
  });

  it("zählt Pausen nicht, wenn die Wortzeiten nur verteilt sind", () => {
    const z = ordneZu([Z2], [quelle("a", { von: 1, bis: 3, text: Z2 })]);
    const t = z.zeilen[0]!.gewaehlt!;
    expect(t.fluessigGemessen).toBe(false);
    expect(t.langePausen).toBe(0);
    expect(t.kriterien.fluessig).toBe(0.5);
  });

  it("nimmt Takes aus mehreren Quellen und wertet die spätere Quelle als späteren Take", () => {
    // der Take in «b» liegt zeitlich früher in seiner Datei, gilt aber als der spätere, weil «b» nach «a» kommt
    const z = ordneZu([Z2], [quelle("a", satz(50, Z2)), quelle("b", satz(1, Z2))]);
    const e = z.zeilen[0]!;
    expect(e.takes.map((t) => t.quelle).sort()).toEqual(["a", "b"]);
    expect(e.gewaehlt!.quelle).toBe("b");
    expect(e.zweitbester!.quelle).toBe("a");
  });
});

describe("ordneZu: Abweichung zwischen Skript und Gesprochenem", () => {
  it("meldet zusätzliche Wörter, ohne den Take auszuscheiden", () => {
    const z = ordneZu([Z1], [quelle("a", satz(1, "Wir haben diese Woche eine Küche komplett neu umgebaut."))]);
    const e = z.zeilen[0]!;
    expect(e.status).toBe("ok");
    expect(e.abweichung!.zusaetzlich).toEqual(["neu"]);
    expect(e.abweichung!.fehlend).toEqual([]);
    expect(e.abweichung!.gesprochen).toMatch(/komplett neu umgebaut/);
  });

  it("meldet ausgelassene Wörter und bewahrt trotzdem den Skripttext", () => {
    const z = ordneZu([Z1], [quelle("a", satz(1, "Wir haben diese Woche eine Küche umgebaut."))]);
    const e = z.zeilen[0]!;
    expect(e.status).toBe("ok");
    expect(e.abweichung!.fehlend).toEqual(["komplett"]);
    expect(e.woerter!.map((w) => w.text)).toEqual(Z1.split(" "));
  });

  it("meldet keine Abweichung bei Zahl und Zahlwort", () => {
    const z = ordneZu(["Wir haben 5 Küchen gebaut."], [quelle("a", satz(1, "Wir haben fünf Küchen gebaut."))]);
    expect(z.zeilen[0]!.status).toBe("ok");
    expect(z.zeilen[0]!.abweichung).toBeUndefined();
  });

  it("meldet keine Abweichung bei wörtlicher Wiedergabe", () => {
    const z = ordneZu([Z2], [quelle("a", satz(1, Z2))]);
    expect(z.zeilen[0]!.abweichung).toBeUndefined();
  });
});

describe("skriptWoerterMitZeit", () => {
  const w = transkriptWoerter([satz(2, "Wir haben diese Woche eine Küche umgebaut.")]);

  it("übernimmt die Zeit der wiedergefundenen Wörter und den Text aus dem Skript", () => {
    const s = skriptWoerterMitZeit("Wir haben diese Woche eine Küche umgebaut.", w);
    expect(s.map((x) => x.text)).toEqual(["Wir", "haben", "diese", "Woche", "eine", "Küche", "umgebaut."]);
    expect(s[0]!.von).toBe(w[0]!.von);
    expect(s[6]!.bis).toBe(w[6]!.bis);
  });

  it("verteilt ein ausgelassenes Wort zwischen den Nachbarn nach Zeichenzahl", () => {
    const s = skriptWoerterMitZeit("Wir haben diese Woche eine Küche komplett umgebaut.", w);
    expect(s).toHaveLength(8);
    const komplett = s[6]!;
    expect(komplett.text).toBe("komplett");
    expect(komplett.von).toBeGreaterThanOrEqual(s[5]!.bis - 1e-9);
    expect(komplett.bis).toBeLessThanOrEqual(s[7]!.von + 1e-9);
    expect(komplett.bis).toBeGreaterThanOrEqual(komplett.von);
  });

  it("liefert die Zeiten in aufsteigender Folge auch bei mehreren Lücken", () => {
    const s = skriptWoerterMitZeit("Wir haben letzte und diese Woche eine ganze Küche komplett umgebaut.", w);
    for (let i = 1; i < s.length; i++) {
      expect(s[i]!.von).toBeGreaterThanOrEqual(s[i - 1]!.von - 1e-9);
      expect(s[i]!.bis).toBeGreaterThanOrEqual(s[i]!.von);
    }
    expect(s[0]!.von).toBe(w[0]!.von);
    expect(s[s.length - 1]!.bis).toBe(w[w.length - 1]!.bis);
  });

  it("gibt bei leerem Skript oder leeren Wörtern nichts zurück", () => {
    expect(skriptWoerterMitZeit("", w)).toEqual([]);
    expect(skriptWoerterMitZeit("Hallo", [])).toEqual([]);
  });
});
