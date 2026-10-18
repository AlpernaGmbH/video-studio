import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseArgs } from "../args";
import { umgebung, type Umgebung } from "../motion/werkstatt";
import { presetsBefehl } from "./befehle";

const root = path.resolve(import.meta.dirname, "..", "..");
const env: Umgebung = umgebung(root);
let ausgabe: string[];
let fehler: string[];
beforeEach(() => {
  ausgabe = [];
  fehler = [];
  vi.spyOn(console, "log").mockImplementation((...x: unknown[]) => void ausgabe.push(x.join(" ")));
  vi.spyOn(console, "error").mockImplementation((...x: unknown[]) => void fehler.push(x.join(" ")));
});
afterEach(() => vi.restoreAllMocks());
const lauf = (...argv: string[]): number => presetsBefehl(argv[1]!, parseArgs(argv), env);

describe("studio presets", () => {
  it("liste zeigt Herkunft und fehlende Stücke", () => {
    expect(lauf("presets", "liste")).toBe(0);
    const t = ausgabe.join("\n");
    expect(t).toContain("reel");
    expect(t).toContain("unbelegt");
    expect(t).toMatch(/hook-karte.*Stück fehlt/);
    expect(t).toMatch(/zahl-gross.*Stück zahl-zaehler/);
  });

  it("lint besteht ohne Fehler und nennt die fünf Lücken", () => {
    expect(lauf("presets", "lint")).toBe(0);
    expect(ausgabe.join("\n")).toContain("0 Fehler, 5 Lücken");
  });

  it("overlay: ein gültiger Eintrag fürs Storyboard", () => {
    expect(lauf("presets", "overlay", "zahl-gross", "--t", "3.2", "--set", "wert=7", "--set", "label=laden zu langsam")).toBe(0);
    expect(JSON.parse(ausgabe.join("\n"))).toMatchObject({ effekt: "zahl-zaehler", t: 3.2, dauer: 2.6, params: { wert: 7, label: "laden zu langsam", position: "mitte" } });
  });

  it("overlay: Fehler gehen auf stderr und der Exit-Code ist 1", () => {
    expect(lauf("presets", "overlay", "zahl-gross", "--t", "3.2", "--set", "wert=7")).toBe(1);
    expect(fehler.join("\n")).toContain("Pflichtparameter «label» fehlt");
    expect(lauf("presets", "overlay", "hook-karte", "--t", "0")).toBe(1);
    expect(fehler.join("\n")).toContain("Motion-Werkstatt");
  });

  it("platz und caption", () => {
    expect(lauf("presets", "platz", "lower-third")).toBe(0);
    expect(JSON.parse(ausgabe.join("\n"))).toMatchObject({ ausrichtung: "links" });
    ausgabe.length = 0;
    expect(lauf("presets", "caption", "pop-akzent")).toBe(0);
    const r = JSON.parse(ausgabe.join("\n"));
    expect(r.captionPreset).toMatchObject({ schrift: "Poppins", position: "mitte", grossschreibung: true });
    expect(r.hinweis).toContain("gibt ein Mensch".replace("gibt ein Mensch", "tut ein Mensch"));
  });

  it("ein unbekanntes Preset nennt die vorhandenen", () => {
    expect(() => lauf("presets", "zeigen", "export", "gibts-nicht")).toThrow(/reel/);
    expect(() => lauf("presets", "zeigen", "foto", "x")).toThrow(/Art/);
  });
});
