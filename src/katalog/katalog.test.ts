import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KatalogEintrag } from "../core/schemas";
import { fuegeBeschreibungenEin, ladeKatalog, ladeOffen, markiereGenutzt, naechsterSchluessel, OffenerEintrag, projektKennung, speichereKatalog, speichereOffen, sucheKatalog } from "./katalog";

const offen = (o: Record<string, unknown> = {}) =>
  OffenerEintrag.parse({ schluessel: "k-0001", art: "video", pfad: "rohmaterial/bib/a.mov", dauer: 8, bildrate: 25, orientierung: "hoch", zeitlupe: false, log: false, ...o });
const beschreibung = (o: Record<string, unknown> = {}) => ({ schluessel: "k-0001", titel: "Intern_Gossau_Laptop", beschreibung: "Hände auf dem Laptop", tags: ["Laptop"], sicherheit: "hoch", ...o });

describe("naechsterSchluessel", () => {
  it("zählt nach dem höchsten vergebenen weiter, auch mit Lücken", () => {
    const n = naechsterSchluessel(["k-0001", "k-0007", "k-0003"]);
    expect([n(), n()]).toEqual(["k-0008", "k-0009"]);
  });
  it("beginnt bei k-0001", () => {
    expect(naechsterSchluessel([])()).toBe("k-0001");
  });
  it("wächst über vier Stellen hinaus", () => {
    expect(naechsterSchluessel(["k-9999"])()).toBe("k-10000");
  });
});

describe("fuegeBeschreibungenEin", () => {
  it("macht aus Scan und Beschreibung einen Katalog-Eintrag und nimmt die Datei aus den offenen", () => {
    const e = fuegeBeschreibungenEin([offen()], [], [beschreibung({ besteSekunden: { von: 1.2, bis: 5 }, personen: true })]);
    expect(e.fehler).toEqual([]);
    expect(e.neu).toEqual(["k-0001"]);
    expect(e.offen).toEqual([]);
    expect(e.katalog[0]).toMatchObject({ schluessel: "k-0001", art: "video", pfad: "rohmaterial/bib/a.mov", dauer: 8, bildrate: 25, orientierung: "hoch", titel: "Intern_Gossau_Laptop", personen: true, besteSekunden: { von: 1.2, bis: 5 }, freigabe: "alles erlaubt" });
  });

  it("nimmt Zeitlupe aus dem Scan und Log aus der Bildanalyse von Claude", () => {
    const e = fuegeBeschreibungenEin([offen({ zeitlupe: true })], [], [beschreibung({ log: true })]);
    expect(e.katalog[0]).toMatchObject({ zeitlupe: true, log: true });
  });

  it("überschreibt einen vorhandenen Eintrag (Korrektur) und behält die Werte aus dem Scan", () => {
    const alt = KatalogEintrag.parse({ ...beschreibung(), art: "video", pfad: "rohmaterial/bib/a.mov", dauer: 8, zeitlupe: true });
    const e = fuegeBeschreibungenEin([], [alt], [beschreibung({ titel: "Intern_Speicher_Laptop" })]);
    expect(e.ueberschrieben).toEqual(["k-0001"]);
    expect(e.neu).toEqual([]);
    expect(e.katalog).toHaveLength(1);
    expect(e.katalog[0]).toMatchObject({ titel: "Intern_Speicher_Laptop", zeitlupe: true, dauer: 8 });
  });

  it("lehnt Ungültiges mit Grund ab, lässt die Datei offen und nimmt die übrigen an", () => {
    const e = fuegeBeschreibungenEin(
      [offen({ schluessel: "k-0001" }), offen({ schluessel: "k-0002", pfad: "rohmaterial/bib/b.mov" }), offen({ schluessel: "k-0003", pfad: "rohmaterial/bib/c.mov" })],
      [],
      [beschreibung({ schluessel: "k-0001", tags: [] }), beschreibung({ schluessel: "k-0002" }), beschreibung({ schluessel: "k-0003", besteSekunden: { von: 2, bis: 20 } }), beschreibung({ schluessel: "k-0099" }), { kein: "eintrag" }],
    );
    expect(e.neu).toEqual(["k-0002"]);
    expect(e.offen.map((o) => o.schluessel)).toEqual(["k-0001", "k-0003"]);
    const gruende = Object.fromEntries(e.fehler.map((f) => [f.schluessel, f.grund]));
    expect(gruende["k-0001"]).toMatch(/tags/);
    expect(gruende["k-0003"]).toContain("reichen bis 20 s, die Datei ist 8 s lang");
    expect(gruende["k-0099"]).toContain("weder offen noch im Katalog");
    expect(gruende["Eintrag 5"]).toMatch(/schluessel/);
  });

  it("verändert die Eingaben nicht", () => {
    const o = [offen()];
    fuegeBeschreibungenEin(o, [], [beschreibung()]);
    expect(o).toHaveLength(1);
  });
});

describe("sucheKatalog", () => {
  const k = [
    KatalogEintrag.parse({ ...beschreibung(), art: "video", pfad: "a.mov", tags: ["Laptop", "Büro"] }),
    KatalogEintrag.parse({ ...beschreibung({ schluessel: "k-0002", titel: "Intern_Speicher_Dorfplatz", beschreibung: "Der Dorfplatz von Speicher", tags: ["Platz"] }), art: "foto", pfad: "b.jpg" }),
  ];
  it("verlangt alle Begriffe, ohne auf Gross- und Kleinschreibung zu achten", () => {
    expect(sucheKatalog(k, "laptop BÜRO").map((x) => x.schluessel)).toEqual(["k-0001"]);
    expect(sucheKatalog(k, "laptop dorfplatz")).toEqual([]);
    expect(sucheKatalog(k, "speicher").map((x) => x.schluessel)).toEqual(["k-0002"]);
  });
  it("filtert nach Art und gibt ohne Begriff alle der Art zurück", () => {
    expect(sucheKatalog(k, "", { art: "foto" }).map((x) => x.schluessel)).toEqual(["k-0002"]);
    expect(sucheKatalog(k, "platz", { art: "video" })).toEqual([]);
  });
});

describe("markiereGenutzt", () => {
  const k = [
    KatalogEintrag.parse({ ...beschreibung({ schluessel: "k-0001" }), art: "video", pfad: "a.mov", zuletztGenutzt: { datum: "2026-09-01", projekt: "Alt [alperna]" } }),
    KatalogEintrag.parse({ ...beschreibung({ schluessel: "k-0002" }), art: "video", pfad: "b.mov" }),
    KatalogEintrag.parse({ ...beschreibung({ schluessel: "k-0003" }), art: "video", pfad: "c.mov" }),
  ];
  it("vermerkt Datum und Projekt, ersetzt einen früheren Vermerk und lässt die übrigen unberührt", () => {
    const r = markiereGenutzt(k, ["k-0001", "k-0002"], { datum: "2026-10-20", projekt: projektKennung("Küche", "alperna") });
    expect(r.markiert).toEqual(["k-0001", "k-0002"]);
    expect(r.katalog[0]!.zuletztGenutzt).toEqual({ datum: "2026-10-20", projekt: "Küche [alperna]" });
    expect(r.katalog[1]!.zuletztGenutzt).toEqual({ datum: "2026-10-20", projekt: "Küche [alperna]" });
    expect(r.katalog[2]!.zuletztGenutzt).toBeUndefined();
    expect(k[0]!.zuletztGenutzt!.projekt).toBe("Alt [alperna]");
  });
  it("nennt Schlüssel, die es nicht gibt", () => {
    const r = markiereGenutzt(k, ["k-0002", "k-0999"], { datum: "2026-10-20", projekt: "x" });
    expect(r.markiert).toEqual(["k-0002"]);
    expect(r.unbekannt).toEqual(["k-0999"]);
  });
});

describe("Dateien", () => {
  let dir: string;
  beforeEach(() => (dir = fs.mkdtempSync(path.join(os.tmpdir(), "katalog-"))));
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("Katalog und offene Einträge gehen hin und zurück, der Katalog ist nach Schlüssel sortiert, es bleibt keine Temporärdatei", () => {
    const a = KatalogEintrag.parse({ ...beschreibung({ schluessel: "k-0002" }), art: "video", pfad: "a.mov" });
    const b = KatalogEintrag.parse({ ...beschreibung({ schluessel: "k-0001" }), art: "video", pfad: "b.mov" });
    speichereKatalog(dir, [a, b]);
    speichereOffen(dir, [offen()]);
    expect(ladeKatalog(dir).map((k) => k.schluessel)).toEqual(["k-0001", "k-0002"]);
    expect(ladeOffen(dir)).toHaveLength(1);
    expect(fs.readdirSync(dir).sort()).toEqual(["katalog-offen.json", "katalog.json"]);
  });
  it("fehlende Dateien sind leere Listen, eine kaputte Datei wirft mit dem Grund", () => {
    expect(ladeKatalog(dir)).toEqual([]);
    expect(ladeOffen(dir)).toEqual([]);
    fs.writeFileSync(path.join(dir, "katalog.json"), JSON.stringify([{ schluessel: "x" }]));
    expect(() => ladeKatalog(dir)).toThrow(/schluessel/);
  });
});
