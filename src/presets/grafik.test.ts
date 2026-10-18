import path from "node:path";
import { describe, expect, it } from "vitest";
import { ladeBibliothek } from "../motion/bibliothek";
import { SICHERHEITSRAND } from "../motion/render";
import { Markenprofil } from "../core/schemas";
import fs from "node:fs";
import { captionFuerMarke, platzierung, presetZuOverlay, sicherheitsflaeche } from "./grafik";
import { findePreset, ladePresets } from "./lader";
import { ANKER } from "./schema";

const lib = ladePresets(path.resolve(__dirname, "../../presets"));
const stuecke = ladeBibliothek(path.resolve(__dirname, "../../library/motion")).stuecke.map((g) => g.stueck);
const alperna = Markenprofil.parse(JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../marken/alperna.json"), "utf8")));

describe("Sicherheitsfläche", () => {
  it("lässt den Sicherheitsrand frei (oben 8 %, unten 20 %, links 5 %, rechts 20 %)", () => {
    const f = sicherheitsflaeche(1080, 1920);
    expect(f.x).toBeCloseTo(1080 * SICHERHEITSRAND.links, 9);
    expect(f.y).toBeCloseTo(1920 * SICHERHEITSRAND.oben, 9);
    expect(f.x + f.breite).toBeCloseTo(1080 * (1 - SICHERHEITSRAND.rechts), 9);
    expect(f.y + f.hoehe).toBeCloseTo(1920 * (1 - SICHERHEITSRAND.unten), 9);
  });
});

describe("Platzierung", () => {
  it("jeder Anker liegt innerhalb der Sicherheitsfläche und die grösste Breite passt hinein", () => {
    const f = sicherheitsflaeche(1080, 1920);
    for (const anker of ANKER) {
      const p = platzierung({ anker, breiteAnteil: 1 }, 1080, 1920);
      expect(p.x, anker).toBeGreaterThanOrEqual(f.x - 1e-9);
      expect(p.x, anker).toBeLessThanOrEqual(f.x + f.breite + 1e-9);
      expect(p.y, anker).toBeGreaterThanOrEqual(f.y - 1e-9);
      expect(p.y, anker).toBeLessThanOrEqual(f.y + f.hoehe + 1e-9);
      expect(p.maxBreite).toBeLessThanOrEqual(f.breite + 1e-9);
    }
  });

  it("unten-links sitzt am linken und unteren Rand der Fläche, mitte in der Mitte", () => {
    const f = sicherheitsflaeche(1080, 1920);
    expect(platzierung({ anker: "unten-links", breiteAnteil: 0.5 }, 1080, 1920)).toMatchObject({ x: f.x, y: f.y + f.hoehe, ausrichtung: "links" });
    expect(platzierung({ anker: "mitte", breiteAnteil: 0.5 }, 1080, 1920)).toMatchObject({ x: f.x + f.breite / 2, y: f.y + f.hoehe / 2, ausrichtung: "mitte" });
  });

  it("alle Presets des Repos halten sich an den Sicherheitsrand", () => {
    const f = sicherheitsflaeche(1080, 1920);
    for (const g of lib.grafik) {
      const p = platzierung(g, 1080, 1920);
      expect(p.maxBreite, g.id).toBeLessThanOrEqual(f.breite + 1e-9);
      expect(p.x, g.id).toBeLessThanOrEqual(1080 * (1 - SICHERHEITSRAND.rechts) + 1e-9);
    }
  });
});

describe("presetZuOverlay", () => {
  const zahl = findePreset(lib, "grafik", "zahl-gross");

  it("macht aus Preset und Inhalt ein Storyboard-Overlay mit den Werten des Presets", () => {
    const r = presetZuOverlay(zahl, { t: 3.2, werte: { wert: 7, label: "laden zu langsam" } }, stuecke);
    expect(r).toEqual({ ok: true, overlay: { effekt: "zahl-zaehler", t: 3.2, dauer: 2.6, params: { position: "mitte", zahlfarbe: "akzent", wert: 7, label: "laden zu langsam" }, begruendung: "Die Zahl im Satz soll hängen bleiben." } });
  });

  it("eigene Werte überschreiben das Preset", () => {
    const r = presetZuOverlay(zahl, { t: 1, dauer: 3, werte: { wert: 7, label: "laden zu langsam", position: "oben" } }, stuecke);
    expect(r.ok && r.overlay.params["position"]).toBe("oben");
    expect(r.ok && r.overlay.dauer).toBe(3);
  });

  it("lehnt eine Dauer ausserhalb des Presets ab", () => {
    const r = presetZuOverlay(zahl, { t: 1, dauer: 9, werte: { wert: 7, label: "x lang genug" } }, stuecke);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.fehler.join(" ")).toContain("Dauer");
  });

  it("lehnt Text über der Grenze des Presets ab (Zeichen und Wörter)", () => {
    const eng = { ...zahl, text: { label: { maxZeichen: 12, maxWoerter: 2 } } };
    const r = presetZuOverlay(eng, { t: 1, werte: { wert: 7, label: "laden ist viel zu langsam" } }, stuecke);
    expect(!r.ok && r.fehler.join(" ")).toMatch(/Zeichen/);
    expect(!r.ok && r.fehler.join(" ")).toMatch(/Wörter/);
  });

  it("verlangt die Pflichtparameter des Stücks (Preset liefert nie Inhalt)", () => {
    const r = presetZuOverlay(zahl, { t: 1, werte: {} }, stuecke);
    expect(!r.ok && r.fehler.join(" ")).toMatch(/Pflichtparameter/);
  });

  it("ein Preset ohne Stück ergibt nie ein Overlay und verweist auf die Motion-Werkstatt", () => {
    const r = presetZuOverlay(findePreset(lib, "grafik", "hook-karte"), { t: 0, werte: { titel: "Drei Fehler" } }, stuecke);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.fehler[0]).toContain("Motion-Werkstatt");
  });
});

describe("captionFuerMarke", () => {
  it("setzt die Schrift der Marke ein und ergibt ein gültiges Caption-Preset", () => {
    const titel = captionFuerMarke(findePreset(lib, "untertitel", "pop-akzent"), alperna);
    expect(titel.schrift).toBe("Poppins");
    const text = captionFuerMarke(findePreset(lib, "untertitel", "ruhig-unten"), alperna);
    expect(text.schrift).toBe("Montserrat");
    expect(Markenprofil.shape.captionPreset.safeParse(titel).success).toBe(true);
  });
});
