import { describe, expect, it } from "vitest";
import { erkenneSignale, parseZahl, splitSaetze } from "./signale";

const typen = (s: string) => erkenneSignale(s).map((x) => x.typ);

describe("parseZahl", () => {
  it.each([
    ["97", 97],
    ["7,5", 7.5],
    ["7.5", 7.5],
    ["1'000", 1000],
    ["1’200", 1200],
    ["1.000", 1000],
    ["1.000,50", 1000.5],
    ["fünf", 5],
    ["Zwölf", 12],
    ["dreissig", 30],
  ])("%s → %s", (roh, soll) => {
    expect(parseZahl(roh)).toBe(soll);
  });
  it("gibt undefined für Unsinn", () => {
    expect(parseZahl("viele")).toBeUndefined();
  });
});

describe("erkenneSignale: Verlauf", () => {
  it("erkennt das Beispiel der Läuferin: über fünf Scans von 97 auf 60", () => {
    const [s, ...rest] = erkenneSignale("Die Läuferin fiel über fünf Scans von 97 auf 60.");
    expect(rest).toEqual([]);
    expect(s).toMatchObject({ typ: "verlauf", von: 97, auf: 60, schritte: 5, schrittEinheit: "scans", richtung: "fallend", sicherheit: "hoch" });
    expect(s?.text).toContain("fünf Scans");
  });

  it("erkennt Alperna-Fälle: Score über Messungen", () => {
    expect(erkenneSignale("Dein Score ist in 4 Messungen von 62 auf 91 gestiegen.")[0]).toMatchObject({ typ: "verlauf", von: 62, auf: 91, schritte: 4, richtung: "steigend" });
  });

  it("erkennt Prozentwerte: von 8,1 Prozent auf 3,4 Prozent", () => {
    expect(erkenneSignale("Die Absprungrate sank von 8,1 Prozent auf 3,4 Prozent.")[0]).toMatchObject({ typ: "verlauf", von: 8.1, auf: 3.4, richtung: "fallend" });
  });

  it("erkennt «stieg um 12 Prozent» als Verlauf mit Delta, mittlere Sicherheit, auch im Plural", () => {
    expect(erkenneSignale("Der Umsatz stieg um 12 Prozent.")[0]).toMatchObject({ typ: "verlauf", delta: 12, richtung: "steigend", sicherheit: "mittel" });
    expect(erkenneSignale("Die Anfragen stiegen um 12 Prozent.")[0]).toMatchObject({ typ: "verlauf", delta: 12, richtung: "steigend" });
    expect(erkenneSignale("Die Kosten sind um 8 Prozent gesunken.")[0]).toMatchObject({ typ: "verlauf", richtung: "fallend" });
  });

  it("findet Wörter mit Umlaut am Anfang («Über», «über»), die \\b nie träfe", () => {
    expect(erkenneSignale("Über fünf Messungen fiel der Wert von 97 auf 60.")[0]).toMatchObject({ typ: "verlauf", schritte: 5 });
  });

  it("nur Messschritte ohne Werte und mit Trendverb: niedrige Sicherheit", () => {
    const [s] = erkenneSignale("Über fünf Messungen hat sich der Wert verschlechtert.");
    expect(s).toMatchObject({ typ: "verlauf", schritte: 5, sicherheit: "niedrig" });
  });
});

describe("erkenneSignale: Zahl und Anteil", () => {
  it("«7 von 10» ist ein Anteil, kein Verlauf", () => {
    const s = erkenneSignale("Sieben von zehn Websites laden zu langsam.");
    expect(s).toEqual([]); // Zahlwörter vor «von» werden nicht geraten, nur Ziffern
    expect(erkenneSignale("7 von 10 Websites laden zu langsam.")[0]).toMatchObject({ typ: "anteil", zaehler: 7, nenner: 10 });
  });

  it("Brüche in Worten sind Anteile", () => {
    expect(typen("Jeder dritte Besucher springt sofort ab.")).toEqual(["anteil"]);
    expect(typen("Die Hälfte aller KMU hat keine Strategie.")).toEqual(["anteil"]);
  });

  it("Beträge und Prozentwerte sind Zahlen mit Einheit", () => {
    expect(erkenneSignale("Das spart dir CHF 1'200 im Jahr.")[0]).toMatchObject({ typ: "zahl", wert: 1200, einheit: "CHF" });
    expect(erkenneSignale("43 Prozent der Anfragen kommen über Google.")[0]).toMatchObject({ typ: "zahl", wert: 43, einheit: "%" });
    expect(erkenneSignale("Wir haben 300 Anfragen bekommen.")[0]).toMatchObject({ typ: "zahl", wert: 300, einheit: "anfragen" });
  });

  it("zählt dieselbe Zahl nicht doppelt (von … auf … belegt die Zahlen)", () => {
    expect(typen("Der Score fiel von 97 auf 60 Prozent.")).toEqual(["verlauf"]);
  });

  it("eine Jahreszahl ist keine Kennzahl", () => {
    expect(typen("Wir sind 2019 gestartet.")).toEqual([]);
  });
});

describe("erkenneSignale: Vergleich, Aufzählung, Prozess, Zeitraum", () => {
  it("erkennt Vergleichsmarker", () => {
    expect(erkenneSignale("Das ist schneller als jede Agentur.")[0]).toMatchObject({ typ: "vergleich", marker: "schneller als" });
    expect(erkenneSignale("Vorher war die Seite langsam, nachher ist sie schnell.")[0]).toMatchObject({ typ: "vergleich", marker: "vorher", sicherheit: "mittel" });
  });

  it("«mehr als 100» ist eine Schwelle und kein Vergleich", () => {
    expect(typen("Wir haben mehr als 100 Kunden.")).toEqual(["zahl"]);
    expect(typen("Das ist mehr als genug.")).toEqual(["vergleich"]);
  });

  it("erkennt Aufzählungen mit Anzahl", () => {
    expect(erkenneSignale("Drei Fehler kosten dich Kunden.")[0]).toMatchObject({ typ: "aufzaehlung", anzahl: 3, sicherheit: "hoch" });
    expect(erkenneSignale("Erstens fehlt das Impressum.")[0]).toMatchObject({ typ: "aufzaehlung", sicherheit: "mittel" });
  });

  it("erkennt Prozesse", () => {
    expect(typen("So funktioniert die Anmeldung beim Verein.")).toEqual(["prozess"]);
    expect(typen("Zuerst prüfst du das Profil, danach den Eintrag.")).toEqual(["prozess"]);
  });

  it("erkennt Zeiträume, trennt sie aber von Messreihen", () => {
    expect(erkenneSignale("Innert 3 Tagen war alles online.")[0]).toMatchObject({ typ: "zeitraum" });
    expect(typen("Seit 2019 betreuen wir Vereine.")).toEqual(["zeitraum"]);
    expect(erkenneSignale("Nach 5 Messungen war klar, woran es liegt.")[0]).toMatchObject({ typ: "zahl", wert: 5, einheit: "messungen", sicherheit: "mittel" });
  });

  it("findet nichts in einem Satz ohne Anker", () => {
    expect(erkenneSignale("Wir freuen uns, dass du dabei bist.")).toEqual([]);
  });
});

describe("splitSaetze", () => {
  it("trennt Sätze, schützt Kürzel und Dezimalzahlen", () => {
    expect(splitSaetze("Das kostet ca. 8.5 Prozent mehr. Z. B. bei Vereinen. Und Nr. 3 fehlt.")).toEqual(["Das kostet ca. 8.5 Prozent mehr.", "Z. B. bei Vereinen.", "Und Nr. 3 fehlt."]);
  });
  it("trennt an Zeilenumbrüchen", () => {
    expect(splitSaetze("Erste Zeile\nZweite Zeile")).toEqual(["Erste Zeile", "Zweite Zeile"]);
  });
});
