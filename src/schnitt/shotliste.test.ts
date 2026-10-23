import { describe, expect, it } from "vitest";
import type { KatalogEintrag } from "../core/schemas";
import { baueGeruest, gesamtDauer, kachelKopf, MAX_EINSTELLUNGEN, PLATZHALTER, pruefeShotliste, schlageVor, Shotliste, shotlisteText, suchwoerter, umbrich, vorschauKandidaten } from "./shotliste";

const eintrag = (schluessel: string, o: Partial<KatalogEintrag> = {}): KatalogEintrag => ({
  schluessel,
  art: "video",
  pfad: `rohmaterial/${schluessel}.mov`,
  titel: "Werkstatt_Gossau_Hände_Pinsel_2026",
  beschreibung: "Hände führen einen Pinsel über eine Holzleiste",
  tags: ["hände", "pinsel", "werkstatt"],
  zeitlupe: false,
  log: false,
  personen: false,
  freigabe: "alles erlaubt",
  sicherheit: "hoch",
  ...o,
});

const KATALOG: KatalogEintrag[] = [
  eintrag("k-0001"),
  eintrag("k-0002", { art: "foto", titel: "Fassade_Herisau_Gerüst_2026", beschreibung: "Fassade mit Gerüst im Morgenlicht", tags: ["fassade", "gerüst", "morgenlicht"] }),
  eintrag("k-0003", { art: "sound", titel: "Pinselstrich_Ton_2026", beschreibung: "Geräusch eines Pinsels", tags: ["pinsel", "ton"] }),
  eintrag("k-0004", { titel: "Team_Gossau_Besprechung_2026", beschreibung: "Zwei Personen am Tisch", tags: ["team", "besprechung"], personen: true }),
];

const SKRIPT = `# Fassade streichen ohne Stress

Die meisten Fassaden werden im falschen Monat gestrichen. Das kostet Jahre.
Wir sagen dir, wann es sich lohnt.
Erstens: Die Temperatur muss stimmen. Zweitens: Der Untergrund muss trocken sein.
Melde dich bei uns.
`;

function gueltig(): Shotliste {
  return {
    schema: 1,
    inhalt: "c-0007",
    titel: "Fassade streichen",
    einstellungen: [
      { nr: 1, abschnitt: "Hook", sprechtext: "Die meisten Fassaden werden im falschen Monat gestrichen.", bild: "Nahaufnahme Hände mit Pinsel", groesse: "nah", dauer: 4, beispiel: "k-0001" },
      { nr: 2, bild: "Fassade im Morgenlicht, Gerüst steht", groesse: "totale", dauer: 3, beispiel: "k-0002" },
      { nr: 3, bild: "Handy mit Wetter-App in der Hand", dauer: 2 },
    ],
  };
}

describe("Gerüst aus dem Skript", () => {
  it("fasst Sätze zu Einstellungen von mindestens drei Sekunden (geschätzt) zusammen und lässt Überschriften weg", () => {
    const g = baueGeruest(SKRIPT, "c-0007", "Fassade streichen ohne Stress");
    expect(g.inhalt).toBe("c-0007");
    expect(g.schema).toBe(1);
    const alle = g.einstellungen.map((e) => e.sprechtext).join(" ");
    expect(alle).toContain("Die meisten Fassaden werden im falschen Monat gestrichen.");
    expect(alle).toContain("Melde dich bei uns.");
    expect(alle).not.toContain("Fassade streichen ohne Stress");
    expect(g.einstellungen.map((e) => e.nr)).toEqual(g.einstellungen.map((_, i) => i + 1));
    for (const e of g.einstellungen.slice(0, -1)) expect((e.dauer ?? 0) >= 3 - 1e-9 || e.sprechtext!.split(" ").length / 2.5 >= 3).toBe(true);
  });

  it("jeder Satz des Skripts steht wörtlich in genau einer Einstellung, in der Reihenfolge des Skripts", () => {
    const g = baueGeruest(SKRIPT, "c-0007", "t");
    const zusammen = g.einstellungen.map((e) => e.sprechtext).join(" ");
    const erwartet = "Die meisten Fassaden werden im falschen Monat gestrichen. Das kostet Jahre. Wir sagen dir, wann es sich lohnt. Erstens: Die Temperatur muss stimmen. Zweitens: Der Untergrund muss trocken sein. Melde dich bei uns.";
    expect(zusammen).toBe(erwartet);
  });

  it("die erste Einstellung heisst Hook, die letzte Aufruf; bei nur einer Einstellung nur Hook", () => {
    const g = baueGeruest(SKRIPT, "c-0007", "t");
    expect(g.einstellungen[0]!.abschnitt).toBe("Hook");
    expect(g.einstellungen.at(-1)!.abschnitt).toBe("Aufruf");
    const eine = baueGeruest("Ein kurzer Satz.", "c-0007", "t");
    expect(eine.einstellungen).toHaveLength(1);
    expect(eine.einstellungen[0]!.abschnitt).toBe("Hook");
  });

  it("die Beschreibung des Bildes bleibt ein Platzhalter, damit die Prüfung «nicht ausgefüllt» meldet", () => {
    const g = baueGeruest(SKRIPT, "c-0007", "t");
    for (const e of g.einstellungen) expect(e.bild).toBe(PLATZHALTER);
    const r = pruefeShotliste(g, KATALOG, "c-0007");
    expect(r.liste).toBeUndefined();
    expect(r.fehler.join(" ")).toContain("Nicht ausgefüllt");
  });

  it("die Dauer ist aus der Wortzahl geschätzt (2,5 Wörter je Sekunde), mindestens eine Sekunde", () => {
    const g = baueGeruest("Eins zwei drei vier fünf sechs sieben acht. Neun zehn.", "c-0007", "t");
    expect(g.einstellungen).toHaveLength(1);
    expect(g.einstellungen[0]!.dauer).toBe(4);
    expect(baueGeruest("Hallo.", "c-0007", "t").einstellungen[0]!.dauer).toBe(1);
  });

  it("ein kurzer Rest hängt an der letzten Einstellung", () => {
    const g = baueGeruest("Eins zwei drei vier fünf sechs sieben acht neun. Zehn.", "c-0007", "t");
    expect(g.einstellungen).toHaveLength(1);
  });

  it("ein leeres Skript und ein zu langes Skript werden benannt", () => {
    expect(() => baueGeruest("# nur eine Überschrift\n", "c-0007", "t")).toThrow(/keine Sätze/);
    const lang = Array.from({ length: (MAX_EINSTELLUNGEN + 1) * 2 }, (_, i) => `Das ist der Satz mit der Nummer ${i} und noch einigen Wörtern dazu.`).join("\n");
    expect(() => baueGeruest(lang, "c-0007", "t")).toThrow(/erlaubt sind 40/);
  });

  it("der Titel trägt keinen Pfad", () => {
    expect(baueGeruest("Ein Satz.", "c-0007", "/Users/andrej/OneDrive/Kunde Müller/skript").titel).not.toContain("/Users");
  });
});

describe("Prüfung der Shotliste", () => {
  it("eine gültige Liste besteht; Einstellungen ohne Beispielbild sind ein Hinweis, kein Fehler", () => {
    const r = pruefeShotliste(gueltig(), KATALOG, "c-0007");
    expect(r.fehler).toEqual([]);
    expect(r.liste).toBeDefined();
    expect(r.hinweise).toEqual([expect.stringContaining("Einstellung 3 hat kein Beispielbild")]);
  });

  it("ein Schlüssel, den es im Katalog nicht gibt, ist ein Fehler (Beispielbilder nur aus dem eigenen Katalog)", () => {
    const l = gueltig();
    l.einstellungen[0]!.beispiel = "k-9999";
    const r = pruefeShotliste(l, KATALOG, "c-0007");
    expect(r.liste).toBeUndefined();
    expect(r.fehler).toEqual([expect.stringContaining("«k-9999» gibt es nicht")]);
  });

  it("ein Sound ist kein Beispielbild", () => {
    const l = gueltig();
    l.einstellungen[0]!.beispiel = "k-0003";
    expect(pruefeShotliste(l, KATALOG, "c-0007").fehler).toEqual([expect.stringContaining("ist ein Sound, kein Bild")]);
  });

  it("dasselbe Beispielbild zweimal und Personen auf dem Bild sind Hinweise", () => {
    const l = gueltig();
    l.einstellungen[1]!.beispiel = "k-0001";
    l.einstellungen[2]!.beispiel = "k-0004";
    const r = pruefeShotliste(l, KATALOG, "c-0007");
    expect(r.fehler).toEqual([]);
    expect(r.hinweise.join("\n")).toContain("Einstellung 2 zeigt dasselbe Beispielbild wie Einstellung 1");
    expect(r.hinweise.join("\n")).toContain("Auf «k-0004» sind Personen zu sehen");
  });

  it("die Liste muss zum geprüften Inhalt gehören", () => {
    expect(pruefeShotliste(gueltig(), KATALOG, "c-0008").fehler).toEqual([expect.stringContaining("gehört zu c-0007, geprüft wird c-0008")]);
  });

  it("die Nummern müssen 1, 2, 3 … ohne Lücke sein", () => {
    const l = gueltig();
    l.einstellungen[1]!.nr = 5;
    expect(pruefeShotliste(l, KATALOG, "c-0007").fehler).toEqual([expect.stringContaining("Stelle 2 hat die Nummer 5")]);
  });

  it.each([
    ["ein unbekanntes Feld (Tippfehler)", (l: Record<string, unknown>) => ((l["einstellungen"] as Record<string, unknown>[])[0]!["beispeil"] = "k-0001")],
    ["ein Schlüssel ohne die Form k-0142", (l: Record<string, unknown>) => ((l["einstellungen"] as Record<string, unknown>[])[0]!["beispiel"] = "0001")],
    ["eine Beschreibung unter acht Zeichen", (l: Record<string, unknown>) => ((l["einstellungen"] as Record<string, unknown>[])[0]!["bild"] = "Hände")],
    ["eine Grösse, die es nicht gibt", (l: Record<string, unknown>) => ((l["einstellungen"] as Record<string, unknown>[])[0]!["groesse"] = "riesig")],
    ["eine negative Dauer", (l: Record<string, unknown>) => ((l["einstellungen"] as Record<string, unknown>[])[0]!["dauer"] = -2)],
    ["eine leere Liste", (l: Record<string, unknown>) => (l["einstellungen"] = [])],
    ["eine falsche Schemaversion", (l: Record<string, unknown>) => (l["schema"] = 2)],
  ])("%s ist ein Fehler", (_n, mach) => {
    const l = JSON.parse(JSON.stringify(gueltig())) as Record<string, unknown>;
    mach(l);
    const r = pruefeShotliste(l, KATALOG, "c-0007");
    expect(r.liste).toBeUndefined();
    expect(r.fehler.length).toBeGreaterThan(0);
  });

  it("mehr als 40 Einstellungen sind ein Fehler", () => {
    const l = gueltig();
    l.einstellungen = Array.from({ length: MAX_EINSTELLUNGEN + 1 }, (_, i) => ({ nr: i + 1, bild: "Hände mit Pinsel am Holz" }));
    expect(pruefeShotliste(l, KATALOG, "c-0007").liste).toBeUndefined();
  });

  it.each([
    "Datei C:\\Users\\a\\Kunde\\IMG_0042.mov zeigen",
    "Siehe /Users/andrej/OneDrive/Kunde/clip.mov",
    "Aufnahme IMG_0042.MOV nehmen",
    "Hände und/oder Pinsel zeigen",
  ])("Text mit Pfad oder Dateinamen wird abgewiesen, nicht still verändert: %s", (bild) => {
    const l = gueltig();
    l.einstellungen[0]!.bild = bild;
    const r = pruefeShotliste(l, KATALOG, "c-0007");
    expect(r.liste).toBeUndefined();
    expect(r.fehler.join(" ")).toContain("Pfad oder Dateinamen");
  });

  it("gewöhnliche Sätze mit Zahlen, Satzzeichen und Umlauten sind kein Pfad", () => {
    const l = gueltig();
    l.einstellungen[0]!.bild = "Nahaufnahme: Hände (links) streichen 12 cm breit, ruhig – ohne Wackeln.";
    l.einstellungen[0]!.hinweis = "Licht von links, 10:30 Uhr.";
    expect(pruefeShotliste(l, KATALOG, "c-0007").fehler).toEqual([]);
  });

  it("zu einer Einstellung ohne Bild kommen Vorschläge aus dem Katalog, nie übernommen", () => {
    const l = gueltig();
    l.einstellungen[2]!.bild = "Gerüst an der Fassade im Morgenlicht";
    const r = pruefeShotliste(l, KATALOG, "c-0007");
    expect(r.vorschlaege).toEqual([{ nr: 3, schluessel: ["k-0002"] }]);
    expect(r.liste!.einstellungen[2]!.beispiel).toBeUndefined();
  });
});

describe("Vorschläge", () => {
  it("Suchwörter: ab vier Buchstaben, ohne Füllwörter, höchstens vier, ohne Doppelte", () => {
    expect(suchwoerter("Die Hände mit dem Pinsel und der Pinsel auf Holz, Nahaufnahme im Morgenlicht")).toEqual(["hände", "pinsel", "holz", "nahaufnahme"]);
  });
  it("Sounds werden nie vorgeschlagen, die meisten Treffer zuerst, höchstens drei", () => {
    expect(schlageVor("Pinsel und Hände in der Werkstatt", KATALOG)).toEqual(["k-0001"]);
    expect(schlageVor("Pinsel", KATALOG)).not.toContain("k-0003");
    expect(schlageVor("x", KATALOG)).toEqual([]);
    const viele = Array.from({ length: 6 }, (_, i) => eintrag(`k-01${i}0`));
    expect(schlageVor("Pinsel", viele)).toHaveLength(3);
  });
});

describe("Vorschaubild", () => {
  it("ein Foto hat nur das Bild a, ein Video die Mitte zuerst", () => {
    expect(vorschauKandidaten({ schluessel: "k-0002", art: "foto" })).toEqual(["katalog/vorschau/k-0002-a.jpg"]);
    expect(vorschauKandidaten({ schluessel: "k-0001", art: "video" })).toEqual(["katalog/vorschau/k-0001-b.jpg", "katalog/vorschau/k-0001-a.jpg", "katalog/vorschau/k-0001-c.jpg"]);
  });
});

describe("Text der Shotliste", () => {
  const jetzt = new Date(2026, 9, 23, 10, 0, 0);
  const text = shotlisteText(gueltig(), KATALOG, jetzt);

  it("Kopf mit Datum nach Schweizer Schreibweise, Anzahl und Gesamtdauer", () => {
    expect(text).toContain("# Shotliste c-0007: Fassade streichen");
    expect(text).toContain("Stand 23.10.2026 · 3 Einstellungen · zusammen etwa 9 s");
    expect(gesamtDauer(gueltig())).toBe(9);
  });
  it("die Dauer ist als Annahme bezeichnet (Regel 7)", () => {
    expect(text).toContain("Annahme: 150 Wörter je Minute");
  });
  it("jede Einstellung: Nummer, Abschnitt, Grösse, Dauer, Bild, Sprechtext wörtlich, Beispielbild mit Schlüssel und Titel", () => {
    expect(text).toContain("## 1. Hook · Nah · 4 s");
    expect(text).toContain("Bild: Nahaufnahme Hände mit Pinsel");
    expect(text).toContain("Sprechtext: «Die meisten Fassaden werden im falschen Monat gestrichen.»");
    expect(text).toContain("Beispielbild: k-0001 «Werkstatt_Gossau_Hände_Pinsel_2026»");
    expect(text).toContain("## 2. Totale · 3 s");
  });
  it("eine Einstellung ohne Beispielbild sagt es: Lücke im Katalog", () => {
    expect(text).toContain("Beispielbild: keines (Lücke im Katalog)");
  });
  it("kein Pfad im Text, auch wenn der Katalog-Titel einen trägt", () => {
    const k = [eintrag("k-0001", { titel: "Ordner/Unterordner/Titel_Datei" })];
    const l = gueltig();
    l.einstellungen = [l.einstellungen[0]!];
    const t = shotlisteText(l, k, jetzt);
    expect(t).not.toContain("Ordner/Unterordner");
    expect(t).toContain("<pfad>");
  });
  it("endet mit genau einem Zeilenumbruch", () => {
    expect(text.endsWith("\n")).toBe(true);
    expect(text.endsWith("\n\n")).toBe(false);
  });
});

describe("Kachelkopf und Umbruch", () => {
  it("Kachelkopf: Nummer, Grösse, Dauer", () => {
    expect(kachelKopf({ nr: 3, bild: "x".repeat(8), groesse: "halbtotale", dauer: 10.5 })).toBe("3 · Halbtotale · 10,5 s");
    expect(kachelKopf({ nr: 7, bild: "x".repeat(8) })).toBe("7");
  });
  it("umbrich bricht an Wortgrenzen, kürzt mit «…» und zerlegt zu lange Wörter", () => {
    expect(umbrich("Nahaufnahme Hände mit Pinsel am Holz", 21, 3)).toEqual(["Nahaufnahme Hände mit", "Pinsel am Holz"]);
    const l = umbrich("eins zwei drei vier fünf sechs sieben acht neun zehn", 10, 2);
    expect(l).toHaveLength(2);
    expect(l[1]!.endsWith("…")).toBe(true);
    expect(l.every((z) => z.length <= 10)).toBe(true);
    expect(umbrich("Donaudampfschifffahrt", 8, 5)).toEqual(["Donaudam", "pfschiff", "fahrt"]);
    // ist die letzte Zeile schon voll, muss das «…» Platz bekommen: ein Wort weniger, nicht ein halbes
    expect(umbrich("aaaa bbbb cccc dddd eeee ffff", 9, 2)).toEqual(["aaaa bbbb", "cccc…"]);
    // ein einzelnes zu langes Wort wird gekürzt, bleibt aber in der Breite
    expect(umbrich("Donaudampfschifffahrtsgesellschaft", 8, 2)).toEqual(["Donaudam", "pfschif…"]);
    // gekürzt wird an einer Wortgrenze, nicht mitten im Wort
    expect(umbrich("Hände führen ruhig einen breiten Pinsel über die Holzleiste, Licht von links", 30, 3)).toEqual(["Hände führen ruhig einen", "breiten Pinsel über die", "Holzleiste, Licht von links"]);
    expect(umbrich("Hände führen ruhig einen breiten Pinsel über die Holzleiste, Licht von links dazu noch mehr Text", 30, 3)).toEqual(["Hände führen ruhig einen", "breiten Pinsel über die", "Holzleiste, Licht von links…"]);
    expect(umbrich("", 10, 3)).toEqual([]);
  });
});

describe("Schema", () => {
  it("lehnt unbekannte Felder auf jeder Ebene ab", () => {
    expect(Shotliste.safeParse({ ...gueltig(), zusatz: 1 }).success).toBe(false);
  });
});
