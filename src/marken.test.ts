import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Markenprofil, markeFuerExportFreigegeben } from "./core/schemas";
import { stageStueck } from "./motion/staging";

const root = path.resolve(import.meta.dirname, "..");
const dateien = fs.readdirSync(path.join(root, "marken")).filter((f) => f.endsWith(".json"));

describe("marken/*.json", () => {
  it("es gibt mindestens das Profil Alperna", () => {
    expect(dateien).toContain("alperna.json");
  });

  describe.each(dateien)("%s", (datei) => {
    const marke = Markenprofil.parse(JSON.parse(fs.readFileSync(path.join(root, "marken", datei), "utf8")));

    it("der Dateiname ist der Schlüssel", () => {
      expect(`${marke.schluessel}.json`).toBe(datei);
    });

    it("alle Schriften des Profils gibt es als Datei (kein stiller Rückfall auf sans-serif)", () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "studio-marke-"));
      try {
        fs.mkdirSync(path.join(tmp, "stueck"));
        fs.writeFileSync(path.join(tmp, "stueck", "index.html"), "<html></html>");
        const r = stageStueck({ stueckDir: path.join(tmp, "stueck"), zielDir: path.join(tmp, "stage"), schriftenDir: path.join(root, "assets", "fonts"), marke });
        expect(r.fehler).toEqual([]);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("ein Profil ohne Freigabe sperrt den finalen Export (Gate 0)", () => {
      const gate = markeFuerExportFreigegeben(marke);
      expect(gate.ok).toBe(marke.status === "freigegeben" && !!marke.freigabe);
    });
  });
});

describe("Alperna entspricht dem Alperna Design System (gedämpftes Blau)", () => {
  const m = Markenprofil.parse(JSON.parse(fs.readFileSync(path.join(root, "marken", "alperna.json"), "utf8")));
  it("Farben: Alpenblau als Karte, Off White als Text, Gold als einziger Akzent, Höhenblau für feine Ränder", () => {
    expect(m.farben).toEqual({ hintergrund: "#26324A", text: "#FDFBFB", akzent1: "#FFD700", akzent2: "#2B3A5A" });
  });
  it("Poppins für Titel und Zahlen, Montserrat für Text, Radius 15 px, keine harten Schatten", () => {
    expect(m.schriften).toEqual({ titel: "Poppins", fliesstext: "Montserrat" });
    expect(m.effektStil).toMatchObject({ eckenradius: 15, schatten: false });
  });
  it("ruhig: keine Soundeffekte (Produktions-Standard: keine harten Sound-Effects)", () => {
    expect(m.ton.sfxDichte).toBe(0);
  });
});
