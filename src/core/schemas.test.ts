import { describe, expect, it } from "vitest";
import { marke, JETZT } from "../testing/fixtures";
import { Ereignis, KatalogEintrag, MAX_AKTIVE_REGELN, Markenprofil, Regel, markeFuerExportFreigegeben, pruefeRegelLimit } from "./schemas";

const katalog = {
  schluessel: "k-0142",
  art: "video",
  pfad: "Bibliothek/B-Roll/2026-09/A7C_0412.mov",
  titel: "Intern_Gossau_Laptop_Tippen_2026-09-12",
  beschreibung: "Nahaufnahme Hände auf Laptop-Tastatur, warmes Licht.",
  tags: ["Laptop", "Tippen"],
  dauer: 8.4,
  bildrate: 50,
  orientierung: "quer",
  zeitlupe: true,
  log: true,
  besteSekunden: { von: 1.2, bis: 5.0 },
  personen: false,
  sicherheit: "hoch",
};

describe("KatalogEintrag", () => {
  it("nimmt das Beispiel A2 aus dem Bauplan an und setzt «alles erlaubt»", () => {
    const k = KatalogEintrag.parse(katalog);
    expect(k.freigabe).toBe("alles erlaubt");
  });
  it("lehnt absolute Pfade ab", () => {
    expect(KatalogEintrag.safeParse({ ...katalog, pfad: "/Users/x/a.mov" }).success).toBe(false);
  });
  it("lehnt beste Sekunden mit bis ≤ von ab", () => {
    expect(KatalogEintrag.safeParse({ ...katalog, besteSekunden: { von: 5, bis: 5 } }).success).toBe(false);
  });
  it("verlangt einen Schlüssel wie k-0142", () => {
    expect(KatalogEintrag.safeParse({ ...katalog, schluessel: "142" }).success).toBe(false);
  });
});

describe("Regel", () => {
  const basis = { id: "r-001", text: "Bei Zahlen den Zahl-Zähler statt Keyword-Pop nutzen.", typ: "handwerk", status: "vorschlag", beleg: { anzahl: 5, verweise: ["P-014"] } };
  it("Handwerk gilt überall und trägt keine Marke", () => {
    expect(Regel.safeParse(basis).success).toBe(true);
    expect(Regel.safeParse({ ...basis, marke: "alperna" }).success).toBe(false);
  });
  it("Optik braucht eine Marke", () => {
    expect(Regel.safeParse({ ...basis, typ: "optik" }).success).toBe(false);
    expect(Regel.safeParse({ ...basis, typ: "optik", marke: "alperna" }).success).toBe(true);
  });
  it("eine aktive Regel braucht eine Freigabe", () => {
    expect(Regel.safeParse({ ...basis, status: "aktiv" }).success).toBe(false);
    expect(Regel.safeParse({ ...basis, status: "aktiv", freigabe: { wer: "Andrej", wann: JETZT } }).success).toBe(true);
  });
  it("begrenzt die aktiven Regeln auf 30", () => {
    const aktiv = Array.from({ length: MAX_AKTIVE_REGELN + 1 }, (_, i) =>
      Regel.parse({ ...basis, id: `r-${String(i + 1).padStart(3, "0")}`, status: "aktiv", freigabe: { wer: "A", wann: JETZT } }),
    );
    expect(pruefeRegelLimit(aktiv.slice(0, 30)).ok).toBe(true);
    expect(pruefeRegelLimit(aktiv).ok).toBe(false);
  });
});

describe("Markenprofil und Gate 0", () => {
  it("ein Platzhalter-Profil ist für den Export gesperrt", () => {
    const m = Markenprofil.parse(marke({ status: "platzhalter", freigabe: undefined }));
    const g = markeFuerExportFreigegeben(m);
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.grund).toContain("Gate 0");
  });
  it("ein freigegebenes Profil mit Freigabe ist offen", () => {
    expect(markeFuerExportFreigegeben(Markenprofil.parse(marke())).ok).toBe(true);
  });
  it("«freigegeben» ohne Freigabe (wer, wann) ist trotzdem gesperrt", () => {
    expect(markeFuerExportFreigegeben(Markenprofil.parse(marke({ freigabe: undefined }))).ok).toBe(false);
  });
  it("die SFX-Dichte ist auf höchstens einen Effekt pro 2 Sekunden begrenzt", () => {
    expect(Markenprofil.safeParse(marke({ ton: { sfxDichte: 0.6, musik: false } })).success).toBe(false);
  });
});

describe("Ereignis", () => {
  it("kennt «unveraendert» als Lernsignal", () => {
    const e = Ereignis.parse({ projekt: "P-023", stufe: "storyboard", art: "unveraendert", zeit: JETZT, wer: { typ: "mensch", name: "Andrej" } });
    expect(e.detail).toEqual({});
  });
  it("lehnt unbekannte Stufen ab", () => {
    expect(Ereignis.safeParse({ projekt: "x", stufe: "unbekannt", art: "notiz", zeit: JETZT, wer: { typ: "system", name: "claude" } }).success).toBe(false);
  });
});
