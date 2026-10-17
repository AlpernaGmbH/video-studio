import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Markenprofil, Schnittprofil, gate0Luecken, markeFuerExportFreigegeben } from "./core/schemas";
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

describe("Schnittprofil (Plan v3, 9.1)", () => {
  const alperna = () => Markenprofil.parse(JSON.parse(fs.readFileSync(path.join(root, "marken", "alperna.json"), "utf8")));

  it("Alperna: Optik ruhig, Schnitt schnell, so wie im Plan (Pause 0,25 s, Einstellung 1,5 s, 2 bis 3 Wörter, Hook 2 s, Zoom mittel)", () => {
    expect(alperna().schnittprofil).toMatchObject({ laengstePause: 0.25, laengsteEinstellung: 1.5, woerterJeUntertitel: { min: 2, max: 3 }, hookMaxSekunden: 2, zoomTempo: "mittel" });
    expect(alperna().ton.sfxDichte).toBe(0);
    expect(alperna().effektStil.bewegungstempo).toBe(1);
  });

  it("verweigert widersprüchliche Werte statt sie still zu übernehmen", () => {
    const gut = { laengstePause: 0.25, laengsteEinstellung: 1.5, woerterJeUntertitel: { min: 2, max: 3 }, hookMaxSekunden: 2, zoomTempo: "mittel" };
    expect(Schnittprofil.safeParse(gut).success).toBe(true);
    expect(Schnittprofil.safeParse({ ...gut, woerterJeUntertitel: { min: 4, max: 2 } }).success).toBe(false);
    expect(Schnittprofil.safeParse({ ...gut, laengstePause: 0 }).success).toBe(false);
    expect(Schnittprofil.safeParse({ ...gut, zoomTempo: "rasend" }).success).toBe(false);
    expect(Schnittprofil.safeParse({ ...gut, textlaengen: { blog: { min: 900, max: 100 } } }).success).toBe(false);
  });

  it("Gate 0 nennt, was dem Profil noch fehlt (Alperna hat noch kein Logo, kein Caption-Preset, keine Schlusskarte)", () => {
    expect(gate0Luecken(alperna())).toEqual(["Logo (helle oder dunkle Datei)", "Caption-Preset", "Schlusskarte"]);
  });

  it("ohne Schnittprofil fehlt es in der Liste, ein vollständiges Profil hat keine Lücken", () => {
    const ohne = { ...alperna(), schnittprofil: undefined };
    expect(gate0Luecken(ohne)).toContain("Schnittprofil");
    const voll = Markenprofil.parse({
      ...alperna(),
      logo: { hell: "marken/alperna/logo-hell.svg" },
      captionPreset: { schrift: "Poppins", groesse: 64, position: "mitte", animation: "fade", hervorhebung: "akzent", grossschreibung: false, kasten: false },
      schlusskarte: { text: "Partner für deinen digitalen Auftritt", handle: "@alperna.ch" },
    });
    expect(gate0Luecken(voll)).toEqual([]);
  });
});
