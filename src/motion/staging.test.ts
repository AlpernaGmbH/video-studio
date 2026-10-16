import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { marke } from "../testing/fixtures";
import { benoetigteFamilien, stageStueck } from "./staging";

const schriften = path.resolve(import.meta.dirname, "../../assets/fonts");
let dir: string;
let stueck: string;
let ziel: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-stage-"));
  stueck = path.join(dir, "stueck");
  ziel = path.join(dir, "stage");
  fs.mkdirSync(path.join(stueck, "assets"), { recursive: true });
  fs.writeFileSync(path.join(stueck, "index.html"), "<html></html>");
  fs.writeFileSync(path.join(stueck, "assets", "logo.svg"), "<svg/>");
  fs.writeFileSync(path.join(stueck, "piece.json"), "{}");
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("stageStueck", () => {
  it("kopiert index.html und assets, ergänzt lokales GSAP, nimmt piece.json nicht mit", () => {
    const r = stageStueck({ stueckDir: stueck, zielDir: ziel, schriftenDir: schriften });
    expect(r.fehler).toEqual([]);
    expect(fs.existsSync(path.join(ziel, "index.html"))).toBe(true);
    expect(fs.existsSync(path.join(ziel, "assets", "logo.svg"))).toBe(true);
    expect(fs.existsSync(path.join(ziel, "piece.json"))).toBe(false);
    expect(fs.statSync(path.join(ziel, "assets", "vendor", "gsap.min.js")).size).toBeGreaterThan(10_000);
  });

  it("schreibt @font-face für die Schriften der Marke und kopiert die Dateien", () => {
    const r = stageStueck({ stueckDir: stueck, zielDir: ziel, schriftenDir: schriften, marke: marke() });
    expect(r.fehler).toEqual([]);
    const css = fs.readFileSync(path.join(ziel, "assets", "brand.css"), "utf8");
    expect(css).toContain('font-family: "Poppins"; font-weight: 700');
    expect(css).toContain('font-family: "Montserrat"; font-weight: 500');
    expect(fs.existsSync(path.join(ziel, "assets", "fonts", "poppins-latin-700-normal.woff2"))).toBe(true);
  });

  it("eine Schrift, die es nicht gibt, ist ein Fehler und kein stiller Rückfall auf sans-serif", () => {
    const r = stageStueck({ stueckDir: stueck, zielDir: ziel, schriftenDir: schriften, marke: marke({ schriften: { titel: "Comic Sans", fliesstext: "Montserrat" } }) });
    expect(r.fehler).toEqual([expect.stringContaining("«Comic Sans» ist nicht in fonts.json")]);
  });

  it("fehlende fonts.json oder fehlende Schriftdatei werden gemeldet", () => {
    expect(stageStueck({ stueckDir: stueck, zielDir: ziel, schriftenDir: path.join(dir, "leer") }).fehler.join(" ")).toContain("fonts.json fehlt");
    const kaputt = path.join(dir, "fonts");
    fs.mkdirSync(kaputt);
    fs.writeFileSync(path.join(kaputt, "fonts.json"), JSON.stringify({ schriften: [{ family: "Poppins", weight: 700, style: "normal", file: "gibt-es-nicht.woff2" }] }));
    expect(stageStueck({ stueckDir: stueck, zielDir: ziel, schriftenDir: kaputt }).fehler.join(" ")).toContain("gibt-es-nicht.woff2");
  });

  it("warnt bei einem Platzhalter-Profil", () => {
    const r = stageStueck({ stueckDir: stueck, zielDir: ziel, schriftenDir: schriften, marke: marke({ status: "platzhalter" }) });
    expect(r.warnungen[0]).toContain("Platzhalter");
  });

  it("räumt ein altes Staging weg", () => {
    stageStueck({ stueckDir: stueck, zielDir: ziel, schriftenDir: schriften });
    fs.writeFileSync(path.join(ziel, "alt.txt"), "x");
    stageStueck({ stueckDir: stueck, zielDir: ziel, schriftenDir: schriften });
    expect(fs.existsSync(path.join(ziel, "alt.txt"))).toBe(false);
  });

  it("meldet ein Stück ohne index.html", () => {
    fs.rmSync(path.join(stueck, "index.html"));
    expect(stageStueck({ stueckDir: stueck, zielDir: ziel, schriftenDir: schriften }).fehler[0]).toContain("index.html fehlt");
  });
});

describe("benoetigteFamilien", () => {
  it("nimmt ohne Marke die Standardschriften, mit Marke deren Titel und Text (ohne Doppelte)", () => {
    expect(benoetigteFamilien()).toEqual(["Poppins", "Montserrat"]);
    expect(benoetigteFamilien(marke({ schriften: { titel: "Poppins", fliesstext: "Poppins" } }))).toEqual(["Poppins"]);
  });
});
