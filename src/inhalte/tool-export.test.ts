import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FORMATE } from "./inhalt";
import { zeileZuMarke } from "./marken";
import { IMPORT_MAX_INHALTE, IMPORT_MAX_MARKEN, IMPORT_MAX_PLATTFORMEN, IMPORT_SCHEMA, IMPORT_STATI, ImportDateiSchema, TOOL_PLATTFORMEN, baueImport, importText } from "./tool-export";
import { inhalt } from "./testdaten";

const JETZT = "2026-10-22T09:00:00.000Z";
const SEITE = "3fc6be186e9b81df9141ebe5778a86ff";
const offen = { entscheid: "offen" as const, grund: "", von: "", am: "" };

/** Ein Archivbeitrag, wie ihn der Import aus dem Cockpit in Notion angelegt hat. */
const archiv = (p: Parameters<typeof inhalt>[0] = {}) =>
  inhalt({ id: "c-0004", titel: "Warum Wartezeit teuer ist", format: "LinkedIn-Post", status: "Ausgewertet", seite: SEITE, torI: offen, torP: offen, winkel: "Pillar: B Gruender-Journey · Hook-Muster: Curiosity Gap · CTA: keiner", ...p });
const marke = (p: Record<string, unknown> = {}) =>
  zeileZuMarke({ Typ: "Eigene", "Gate 0": "offen", "Gate 0 von": "", "Marken-ID": "alperna", Name: "Alperna", url: "https://app.notion.com/p/3fc6be186e9b81df9141ebe5778a86ff", ...p });

const vertrag = JSON.parse(fs.readFileSync(path.join(__dirname, "../../docs/studio/vertrag.json"), "utf8")) as {
  import: {
    schema: number;
    grenzen: { max_inhalte: number; max_marken: number; plattformen: string[]; plattformen_max: number; stati: string[]; titel: { min: number; max: number }; markenname: { min: number; max: number }; muster_max: number; inhaltstyp_max: number };
    gueltig: { name: string; datei: unknown }[];
    ungueltig: { name: string; datei: unknown }[];
  };
};

describe("Vertrag mit dem Tool: Importdatei", () => {
  it.each(vertrag.import.gueltig)("gültig: $name", ({ datei }) => {
    expect(ImportDateiSchema.safeParse(datei).success).toBe(true);
  });
  it.each(vertrag.import.ungueltig)("ungültig: $name", ({ datei }) => {
    expect(ImportDateiSchema.safeParse(datei).success).toBe(false);
  });
  it("die Grenzen sind die des Vertrags", () => {
    const g = vertrag.import.grenzen;
    expect(vertrag.import.schema).toBe(IMPORT_SCHEMA);
    expect([...IMPORT_STATI]).toEqual(g.stati);
    expect(IMPORT_MAX_INHALTE).toBe(g.max_inhalte);
    expect(IMPORT_MAX_MARKEN).toBe(g.max_marken);
    expect([...TOOL_PLATTFORMEN]).toEqual(g.plattformen);
    expect(IMPORT_MAX_PLATTFORMEN).toBe(g.plattformen_max);
  });
  it("ein Beitrag mit 200 Zeichen im Titel geht, mit 201 nicht; Muster und Pillar mit 60 gehen, mit 61 nicht", () => {
    const f = vertrag.import.gueltig[1]!.datei as { contents: Record<string, unknown>[] };
    const mit = (o: Record<string, unknown>) => ImportDateiSchema.safeParse({ ...f, contents: [{ ...f.contents[0], ...o }] }).success;
    expect(mit({ title: "t".repeat(vertrag.import.grenzen.titel.max) })).toBe(true);
    expect(mit({ title: "t".repeat(vertrag.import.grenzen.titel.max + 1) })).toBe(false);
    expect(mit({ pattern: "m".repeat(vertrag.import.grenzen.muster_max) })).toBe(true);
    expect(mit({ pattern: "m".repeat(vertrag.import.grenzen.muster_max + 1) })).toBe(false);
    expect(mit({ content_type: "p".repeat(vertrag.import.grenzen.inhaltstyp_max) })).toBe(true);
    expect(mit({ content_type: "p".repeat(vertrag.import.grenzen.inhaltstyp_max + 1) })).toBe(false);
  });
  it("500 Beiträge gehen, 501 nicht; 100 Marken gehen, 101 nicht; Marken: Name mit 80 Zeichen geht, mit 81 nicht", () => {
    const f = vertrag.import.gueltig[1]!.datei as { contents: unknown[]; brands: Record<string, unknown>[] };
    const viele = (n: number) => Array.from({ length: n }, () => f.contents[0]);
    const marken = (n: number) => Array.from({ length: n }, (_, i) => ({ ...f.brands[0], key: `m${i}` }));
    expect(ImportDateiSchema.safeParse({ ...f, contents: viele(IMPORT_MAX_INHALTE) }).success).toBe(true);
    expect(ImportDateiSchema.safeParse({ ...f, contents: viele(IMPORT_MAX_INHALTE + 1) }).success).toBe(false);
    expect(ImportDateiSchema.safeParse({ ...f, brands: marken(IMPORT_MAX_MARKEN) }).success).toBe(true);
    expect(ImportDateiSchema.safeParse({ ...f, brands: marken(IMPORT_MAX_MARKEN + 1) }).success).toBe(false);
    const name = (n: number) => ImportDateiSchema.safeParse({ ...f, brands: [{ ...f.brands[0], name: "n".repeat(n) }] }).success;
    expect(name(vertrag.import.grenzen.markenname.max)).toBe(true);
    expect(name(vertrag.import.grenzen.markenname.max + 1)).toBe(false);
  });
});

describe("baueImport: Plattformen", () => {
  const plattformen = (p: Parameters<typeof archiv>[0]) => baueImport([archiv(p)], [marke()], JETZT).datei.contents[0]!.platforms;

  it("die Plattformen aus Notion werden zu den Schlüsseln des Tools (Blog wird Website)", () => {
    expect(plattformen({ plattformen: ["LinkedIn"] })).toEqual(["linkedin"]);
    expect(plattformen({ plattformen: ["Instagram", "LinkedIn"] })).toEqual(["instagram", "linkedin"]);
    expect(plattformen({ plattformen: ["Blog", "Google"] })).toEqual(["website", "google"]);
  });

  it("«weitere» hat keinen Schlüssel: Die Plattform fällt weg und es gibt einen Hinweis", () => {
    const r = baueImport([archiv({ plattformen: ["LinkedIn", "weitere"] })], [marke()], JETZT);
    expect(r.datei.contents[0]!.platforms).toEqual(["linkedin"]);
    expect(r.hinweise.some((h) => h.includes("c-0004") && h.includes("weitere"))).toBe(true);
  });

  it("ohne Plattform in Notion bleibt die Liste leer: Aus dem Format wird nichts geraten (ein Carousel ist nicht automatisch Instagram)", () => {
    for (const format of ["Carousel", "Reel", "LinkedIn-Post", "Blog"] as const) expect(plattformen({ format, plattformen: [] }), format).toEqual([]);
  });

  it("Zeilen ohne Plattform stehen gesammelt in einem Hinweis, mit den ersten Codes", () => {
    const zeilen = Array.from({ length: 7 }, (_, i) => archiv({ id: `c-00${10 + i}`, seite: String(i).repeat(32), plattformen: [] }));
    const hinweise = baueImport(zeilen, [marke()], JETZT).hinweise.filter((h) => h.includes("ohne Plattform"));
    expect(hinweise).toHaveLength(1);
    expect(hinweise[0]).toContain("7 Zeilen");
    expect(hinweise[0]).toContain("c-0010");
    expect(hinweise[0]).toContain("…");
    expect(baueImport([archiv({ plattformen: ["LinkedIn"] })], [marke()], JETZT).hinweise.filter((h) => h.includes("ohne Plattform"))).toEqual([]);
  });

  it("doppelte Plattformen in Notion werden einmal geschrieben, und die Datei bleibt gültig", () => {
    const r = baueImport([archiv({ plattformen: ["LinkedIn", "LinkedIn"] })], [marke()], JETZT);
    expect(r.datei.contents[0]!.platforms).toEqual(["linkedin"]);
    expect(ImportDateiSchema.safeParse(r.datei).success).toBe(true);
  });

  it("die Plattformen stehen in der Datei, wie das Tool sie liest", () => {
    const text = importText(baueImport([archiv({ plattformen: ["LinkedIn"] })], [marke()], JETZT).datei);
    expect(JSON.parse(text).contents[0].platforms).toEqual(["linkedin"]);
  });
});

describe("baueImport: was ins Archiv gehört", () => {
  it("Ausgewertet, Veröffentlicht und Verworfen kommen mit dem passenden Status", () => {
    const r = baueImport(
      [archiv({ id: "c-0004", status: "Ausgewertet" }), archiv({ id: "c-0005", status: "Veröffentlicht", seite: "a".repeat(32) }), archiv({ id: "c-0006", status: "Verworfen", seite: "b".repeat(32) })],
      [marke()],
      JETZT,
    );
    expect(r.uebersprungen).toEqual([]);
    expect(r.datei.contents.map((c) => [c.code, c.status])).toEqual([
      ["c-0004", "evaluated"],
      ["c-0005", "published"],
      ["c-0006", "discarded"],
    ]);
  });

  it("ein Beitrag wird auf Titel, Medium, Marke, Notion-Seite, Muster und Pillar zurückgeführt, mehr nicht", () => {
    const r = baueImport([archiv()], [marke()], JETZT);
    expect(r.datei.contents).toEqual([
      { code: "c-0004", title: "Warum Wartezeit teuer ist", medium: "linkedin_post", brand: "alperna", status: "evaluated", notion_id: SEITE, pattern: "Curiosity Gap", content_type: "B Gruender-Journey", platforms: ["instagram"] },
    ]);
    expect(r.datei.schema).toBe(1);
    expect(r.datei.created_at).toBe(JETZT);
  });

  it.each(["Neu", "Pitch bereit", "In Produktion", "Entwurf fertig", "Freigegeben", "Geplant", "Pausiert", ""] as const)("laufende Arbeit (Status «%s») kommt nicht mit, mit Grund", (status) => {
    const r = baueImport([archiv({ status })], [marke()], JETZT);
    expect(r.datei.contents).toEqual([]);
    expect(r.uebersprungen).toHaveLength(1);
    expect(r.uebersprungen[0]!.grund).toContain("Laufende Arbeit");
    expect(r.uebersprungen[0]!.grund).toContain("einzige Schreiber");
  });

  it.each(["Beispiel: Wert-Verlauf", "beispiel Wert", "  Beispiel – Hook"])("die Beispielzeile «%s» kommt nicht mit", (titel) => {
    const r = baueImport([archiv({ titel })], [marke()], JETZT);
    expect(r.datei.contents).toEqual([]);
    expect(r.uebersprungen[0]!.grund).toBe("Beispielzeile");
  });

  it("ein Titel, der nur mit «Beispiele» beginnt, ist keine Beispielzeile", () => {
    expect(baueImport([archiv({ titel: "Beispiele aus dem Alltag" })], [marke()], JETZT).datei.contents).toHaveLength(1);
  });

  it.each([
    ["Tor I freigegeben", { torI: { ...offen, entscheid: "freigegeben" as const, von: "Andrej" } }],
    ["Tor I abgelehnt", { torI: { ...offen, entscheid: "abgelehnt" as const } }],
    ["Tor I Rückfrage", { torI: { ...offen, entscheid: "Rückfrage" as const } }],
    ["Tor P freigegeben", { torP: { ...offen, entscheid: "freigegeben" as const } }],
    ["Tor P Änderung", { torP: { ...offen, entscheid: "Änderung" as const } }],
  ])("%s: Das Tool übernimmt keine Entscheide, die Zeile kommt nicht mit", (_n, p) => {
    const r = baueImport([archiv(p)], [marke()], JETZT);
    expect(r.datei.contents).toEqual([]);
    expect(r.uebersprungen[0]!.grund).toContain("Entscheide");
  });

  it("offene oder leere Tore stehen dem Import nicht im Weg", () => {
    const leer = { entscheid: "" as const, grund: "", von: "", am: "" };
    expect(baueImport([archiv({ torI: leer, torP: leer })], [marke()], JETZT).datei.contents).toHaveLength(1);
    expect(baueImport([archiv({ torI: offen, torP: offen })], [marke()], JETZT).datei.contents).toHaveLength(1);
  });

  it("eine ID, die mehrfach vorkommt, bringt beide Zeilen zu Fall", () => {
    const r = baueImport([archiv({ id: "c-0004" }), archiv({ id: "c-0004", seite: "a".repeat(32) }), archiv({ id: "c-0005", seite: "b".repeat(32) })], [marke()], JETZT);
    expect(r.datei.contents.map((c) => c.code)).toEqual(["c-0005"]);
    expect(r.uebersprungen.filter((u) => u.grund.includes("mehrfach"))).toHaveLength(2);
  });

  it.each([
    ["ID ohne Form", { id: "c-12" }, "Form"],
    ["ID leer", { id: "" }, "Form"],
    ["Seite fehlt", { seite: "" }, "Notion-Adresse"],
    ["Seite zu kurz", { seite: "abc" }, "Notion-Adresse"],
    ["Titel mit einem Zeichen", { titel: "x" }, "Titel"],
    ["Titel leer", { titel: "  " }, "Titel"],
    ["Titel mit 201 Zeichen", { titel: "t".repeat(201) }, "Titel"],
  ])("%s: Die Zeile kommt nicht mit", (_n, p, wort) => {
    const r = baueImport([archiv(p)], [marke()], JETZT);
    expect(r.datei.contents).toEqual([]);
    expect(r.uebersprungen[0]!.grund).toContain(wort);
  });

  it("ein Titel mit 200 Zeichen kommt mit, Leerraum am Rand fällt weg", () => {
    const r = baueImport([archiv({ titel: `  ${"t".repeat(200)}\n` })], [marke()], JETZT);
    expect(r.datei.contents[0]!.title).toBe("t".repeat(200));
  });

  it("das Medium folgt dem Format; ohne Format ist es «unclear»", () => {
    const erwartet: Record<string, string> = { Reel: "reel", Carousel: "carousel", "LinkedIn-Post": "linkedin_post", Blog: "blog", "Google-Maps-Beitrag": "google_post", Story: "story", Sonstiges: "other", ungeklärt: "unclear" };
    expect(Object.keys(erwartet).sort()).toEqual([...FORMATE].sort());
    for (const f of FORMATE) expect(baueImport([archiv({ format: f })], [marke()], JETZT).datei.contents[0]!.medium, f).toBe(erwartet[f]);
    expect(baueImport([archiv({ format: undefined })], [marke()], JETZT).datei.contents[0]!.medium).toBe("unclear");
  });
});

describe("baueImport: Marke, Muster und Pillar", () => {
  it("eine nicht aufgelöste Marke gibt einen Hinweis, die Zeile kommt ohne Marke", () => {
    const r = baueImport([archiv({ marke: "", markeUrls: ["https://app.notion.com/p/x"] })], [], JETZT);
    expect(r.datei.contents[0]!.brand).toBeNull();
    expect(r.hinweise.join("\n")).toContain("c-0004");
    expect(r.hinweise.join("\n")).toContain("auflösen");
  });
  it("ohne Marke und ohne Verknüpfung: kein Hinweis", () => {
    const r = baueImport([archiv({ marke: "", markeUrls: [] })], [], JETZT);
    expect(r.datei.contents[0]!.brand).toBeNull();
    expect(r.hinweise).toEqual([]);
  });
  it("ein Marken-Schlüssel, den das Tool nicht zulässt, fällt mit Hinweis weg", () => {
    const r = baueImport([archiv({ marke: "Alperna GmbH" })], [], JETZT);
    expect(r.datei.contents[0]!.brand).toBeNull();
    expect(r.hinweise.join("\n")).toContain("nicht zulässig");
  });
  it("Muster und Pillar kommen aus dem Winkel; fehlen sie, sind sie null", () => {
    const r = baueImport([archiv({ winkel: "Ein Praxisteam zeigt etwas" })], [marke()], JETZT);
    expect(r.datei.contents[0]).toMatchObject({ pattern: null, content_type: null });
    expect(r.hinweise).toEqual([]);
  });
  it("Muster und Pillar mit genau 60 Zeichen kommen mit, mit 61 fallen sie mit Hinweis weg", () => {
    const ok = baueImport([archiv({ winkel: `Pillar: ${"p".repeat(60)} · Hook-Muster: ${"m".repeat(60)}` })], [marke()], JETZT);
    expect(ok.datei.contents[0]).toMatchObject({ pattern: "m".repeat(60), content_type: "p".repeat(60) });
    const zu = baueImport([archiv({ winkel: `Pillar: ${"p".repeat(61)} · Hook-Muster: ${"m".repeat(61)}` })], [marke()], JETZT);
    expect(zu.datei.contents[0]).toMatchObject({ pattern: null, content_type: null });
    expect(zu.hinweise).toHaveLength(2);
  });
});

describe("baueImport: Marken", () => {
  it("Art und Gate 0 aus Notion, sortiert nach Schlüssel", () => {
    const r = baueImport(
      [],
      [
        marke({ "Marken-ID": "zebra", Name: "Zebra AG", Typ: "Kunde" }),
        marke({ "Gate 0": "freigegeben", "Gate 0 von": "Andrej Good" }),
        marke({ "Marken-ID": "mittel", Name: "Mittel", Typ: "Kunde", "Gate 0": "Änderung" }),
      ],
      JETZT,
    );
    expect(r.datei.brands).toEqual([
      { key: "alperna", name: "Alperna", kind: "own", notion_gate0: "approved" },
      { key: "mittel", name: "Mittel", kind: "client", notion_gate0: "change" },
      { key: "zebra", name: "Zebra AG", kind: "client", notion_gate0: "open" },
    ]);
  });
  it("eine Freigabe ohne Menschen mit Namen gilt wie in Notion als offen", () => {
    expect(baueImport([], [marke({ "Gate 0": "freigegeben", "Gate 0 von": "" })], JETZT).datei.brands[0]!.notion_gate0).toBe("open");
    expect(baueImport([], [marke({ "Gate 0": "freigegeben", "Gate 0 von": "Claude" })], JETZT).datei.brands[0]!.notion_gate0).toBe("open");
  });
  it.each([
    ["Schlüssel mit Grossbuchstaben", { "Marken-ID": "Alperna" }, "Schlüssel"],
    ["Typ fehlt", { Typ: "" }, "Typ"],
    ["Name mit einem Zeichen", { Name: "A" }, "Name"],
  ])("%s: Die Marke fällt mit Hinweis weg", (_n, p, wort) => {
    const r = baueImport([], [marke(p)], JETZT);
    expect(r.datei.brands).toEqual([]);
    expect(r.hinweise.join("\n")).toContain(wort);
  });
  it("eine Marke ohne Schlüssel wird still übergangen, ein doppelter Schlüssel nur einmal gezählt", () => {
    const r = baueImport([], [marke({ "Marken-ID": "" }), marke(), marke({ Name: "Alperna zwei" })], JETZT);
    expect(r.datei.brands.map((b) => b.name)).toEqual(["Alperna"]);
    expect(r.hinweise).toEqual(["Marke «alperna»: Der Schlüssel kommt mehrfach vor, die erste gilt"]);
  });
});

describe("baueImport: Datei", () => {
  it("die Beiträge sind nach Nummer sortiert, auch über unterschiedlich lange Codes", () => {
    const r = baueImport([archiv({ id: "c-10000", seite: "a".repeat(32) }), archiv({ id: "c-0009", seite: "b".repeat(32) }), archiv({ id: "c-9999", seite: "c".repeat(32) })], [], JETZT);
    expect(r.datei.contents.map((c) => c.code)).toEqual(["c-0009", "c-9999", "c-10000"]);
  });
  it("mehr als 500 Beiträge sind ein Fehler mit Hinweis auf zwei Dateien", () => {
    const viele = Array.from({ length: 501 }, (_, i) => archiv({ id: `c-${String(i + 1).padStart(4, "0")}`, seite: i.toString(16).padStart(32, "0") }));
    expect(() => baueImport(viele, [], JETZT)).toThrow(/zwei Dateien/);
    expect(baueImport(viele.slice(0, 500), [], JETZT).datei.contents).toHaveLength(500);
  });
  it("mehr als 100 Marken sind ein Fehler, 100 gehen", () => {
    const viele = Array.from({ length: 101 }, (_, i) => marke({ "Marken-ID": `m${i}`, Name: `Marke ${i}` }));
    expect(() => baueImport([], viele, JETZT)).toThrow(/Mehr als 100 Marken/);
    expect(baueImport([], viele.slice(0, 100), JETZT).datei.brands).toHaveLength(100);
  });
  it("die Datei besteht ihr eigenes Schema, auch wenn sie leer ist", () => {
    expect(ImportDateiSchema.safeParse(baueImport([], [], JETZT).datei).success).toBe(true);
    expect(ImportDateiSchema.safeParse(baueImport([archiv()], [marke()], JETZT).datei).success).toBe(true);
  });
  it("kein Text der Beiträge geht in die Datei: weder Hook noch Beleg noch Winkel noch Dateien noch Notizen", () => {
    const r = baueImport(
      [archiv({ hook: "GEHEIMER HOOK TEXT", beleg: "GEHEIMER BELEG", winkel: "GEHEIMER WINKEL · Pillar: P1 · Hook-Muster: M1", dateien: "Footage: GEHEIMER-PFAD/clip.mov", statusGrund: "GEHEIMER GRUND", referenz: "GEHEIMER LINK", ziel: "GEHEIMES ZIEL" })],
      [marke({ Raum: "GEHEIMER RAUM", Kundenfreigabe: "GEHEIM" })],
      JETZT,
    );
    const text = importText(r.datei);
    expect(text).not.toContain("GEHEIM");
    expect(text).toContain("P1");
    expect(text).toContain("M1");
  });
  it("der Text ist eingerückt, endet mit einem Zeilenumbruch und ist bei gleicher Eingabe gleich", () => {
    const eingabe = () => baueImport([archiv()], [marke()], JETZT).datei;
    const a = importText(eingabe());
    expect(a.endsWith("}\n")).toBe(true);
    expect(a).toContain('\n  "contents": [');
    expect(a).toBe(importText(eingabe()));
    expect(JSON.parse(a)).toEqual(eingabe());
  });
  it("die Eingabe wird nicht verändert", () => {
    const i = [archiv()];
    const kopie = JSON.stringify(i);
    baueImport(i, [marke()], JETZT);
    expect(JSON.stringify(i)).toBe(kopie);
  });
});
