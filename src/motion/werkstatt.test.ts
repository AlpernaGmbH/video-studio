import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Markenprofil } from "../core/schemas";
import { extrahiereJson, gespeicherterRender, renderMarker, renderSchluessel, umgebung, type RenderErgebnis, type Umgebung } from "./werkstatt";

describe("extrahiereJson", () => {
  it("liest das JSON und ignoriert Logzeilen davor und danach", () => {
    const text = 'Linting …\n{\n  "ok": true,\n  "lint": { "findings": [] }\n}\n [hyperframes] browserGpuMode probe → software\n';
    expect(extrahiereJson(text)).toEqual({ ok: true, lint: { findings: [] } });
  });
  it("kommt mit Klammern und Anführungszeichen in Texten zurecht", () => {
    expect(extrahiereJson('{"text":"a } b { \\" c","n":1} Ende {nicht}')).toEqual({ text: 'a } b { " c', n: 1 });
  });
  it("wirft bei fehlendem oder unvollständigem JSON", () => {
    expect(() => extrahiereJson("nur Text")).toThrow("Keine JSON-Ausgabe");
    expect(() => extrahiereJson('{"a": {"b": 1}')).toThrow("unvollständig");
  });
});

describe("renderSchluessel und gespeicherterRender (Zwischenspeicher der Grafiken)", () => {
  const root = path.resolve(import.meta.dirname, "..", "..");
  const marke = Markenprofil.parse(JSON.parse(fs.readFileSync(path.join(root, "marken", "alperna.json"), "utf8")));
  let tmp: string;
  let env: Umgebung;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "studio-render-"));
    fs.cpSync(path.join(root, "library", "motion"), path.join(tmp, "lib"), { recursive: true });
    env = { ...umgebung(root), bibliothek: path.join(tmp, "lib") };
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const schluessel = (opt: Parameters<typeof renderSchluessel>[2] = {}) => renderSchluessel(env, "zahl-zaehler", { werte: { wert: 3, label: "Wochen" }, dauer: 2, marke, ...opt });

  it("dieselbe Eingabe gibt denselben Schlüssel, unabhängig von der Reihenfolge der Werte", () => {
    expect(schluessel()).toBe(schluessel());
    expect(schluessel({ werte: { label: "Wochen", wert: 3 } })).toBe(schluessel({ werte: { wert: 3, label: "Wochen" } }));
  });

  it("jede Eingabe, die das Bild ändert, ändert den Schlüssel: Werte, Dauer, Marke, final", () => {
    const basis = schluessel();
    expect(schluessel({ werte: { wert: 4, label: "Wochen" } })).not.toBe(basis);
    expect(schluessel({ werte: { wert: 3, label: "Tage" } })).not.toBe(basis);
    expect(schluessel({ dauer: 3 })).not.toBe(basis);
    expect(schluessel({ marke: { ...marke, farben: { ...marke.farben, akzent1: "#FF0000" } } })).not.toBe(basis);
    expect(schluessel({ final: true })).not.toBe(basis);
    expect(schluessel({ marke: undefined })).not.toBe(basis);
  });

  it("jede Datei des Stücks zählt (Komposition, Datenblatt), die Vorschaubilder nicht", () => {
    const basis = schluessel();
    const dir = path.join(tmp, "lib", "zahl-zaehler");
    fs.mkdirSync(path.join(dir, "vorschau"), { recursive: true });
    fs.writeFileSync(path.join(dir, "vorschau", "neu.png"), "x");
    expect(schluessel()).toBe(basis);
    fs.appendFileSync(path.join(dir, "index.html"), "\n<!-- geändert -->\n");
    const nachHtml = schluessel();
    expect(nachHtml).not.toBe(basis);
    fs.appendFileSync(path.join(dir, "piece.json"), " ");
    expect(schluessel()).not.toBe(nachHtml);
  });

  it("ein unbekanntes Stück ist ein Fehler", () => {
    expect(() => renderSchluessel(env, "gibt-es-nicht", {})).toThrow();
  });

  const ergebnis = (datei: string): RenderErgebnis => ({ datei, dauer: 2, variablen: { wert: 3 }, pruefung: { bestanden: true, befunde: [] } as never, renderMs: 4321, warnungen: ["Hinweis"] });
  const marker = (datei: string, schluesselWert: string): void => fs.writeFileSync(renderMarker(datei), JSON.stringify({ schluessel: schluesselWert, ergebnis: ergebnis(datei) }));

  it("gespeicherterRender gibt das Ergebnis mit Renderzeit 0 zurück, wenn Ausgabe und Schlüssel stimmen", () => {
    const datei = path.join(tmp, "g.webm");
    fs.writeFileSync(datei, "x");
    marker(datei, "abc");
    expect(gespeicherterRender(datei, "abc")).toMatchObject({ datei, dauer: 2, renderMs: 0, zwischengespeichert: true, warnungen: ["Hinweis"] });
  });

  it("ein anderer Schlüssel, eine fehlende Ausgabe, ein fehlender oder kaputter Marker gelten nicht", () => {
    const datei = path.join(tmp, "g.webm");
    fs.writeFileSync(datei, "x");
    marker(datei, "abc");
    expect(gespeicherterRender(datei, "anders")).toBeUndefined();
    fs.rmSync(datei);
    expect(gespeicherterRender(datei, "abc")).toBeUndefined();
    fs.writeFileSync(datei, "x");
    fs.writeFileSync(renderMarker(datei), "{kaputt");
    expect(gespeicherterRender(datei, "abc")).toBeUndefined();
    fs.rmSync(renderMarker(datei));
    expect(gespeicherterRender(datei, "abc")).toBeUndefined();
  });
});
