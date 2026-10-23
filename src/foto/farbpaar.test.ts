import { describe, expect, it } from "vitest";
import { Farbpaar, farbpaarStufe, hexZuRgb } from "./farbpaar";
import type { Rgb } from "../schnitt/lut";

const grau = (v: number): Rgb => ({ r: v, g: v, b: v });
const luma = (c: Rgb): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

describe("Farbpaar", () => {
  const rotBlau = { schatten: "#FF0000", lichter: "#0000FF", staerke: 0.4 };

  it("liest Hex-Farben", () => {
    expect(hexZuRgb("#FF8000")).toEqual({ r: 1, g: 128 / 255, b: 0 });
  });

  it("Stärke 0 lässt jedes Bild unverändert", () => {
    const stufe = farbpaarStufe({ ...rotBlau, staerke: 0 });
    for (const c of [grau(0), grau(0.3), grau(1), { r: 0.2, g: 0.7, b: 0.4 }]) expect(stufe(c)).toEqual(c);
  });

  it("färbt die Schatten zum Schattenton und die Lichter zum Lichterton", () => {
    const stufe = farbpaarStufe(rotBlau);
    const dunkel = stufe(grau(0.1));
    const hell = stufe(grau(0.9));
    // Schatten: mehr Rot als Blau; Lichter: mehr Blau als Rot
    expect(dunkel.r).toBeGreaterThan(dunkel.b);
    expect(hell.b).toBeGreaterThan(hell.r);
    // und umgekehrt wäre es falsch: die Gewichte dürfen nicht vertauscht sein
    expect(dunkel.r - dunkel.b).toBeGreaterThan(hell.r - hell.b);
  });

  it("verändert die Helligkeit (Luma) nicht", () => {
    const stufe = farbpaarStufe(rotBlau);
    for (const y of [0.05, 0.2, 0.5, 0.8, 0.95]) expect(luma(stufe(grau(y)))).toBeCloseTo(y, 9);
  });

  it("wirkt in der Mitte schwächer als an den Rändern", () => {
    const stufe = farbpaarStufe(rotBlau);
    const abweichung = (y: number): number => Math.abs(stufe(grau(y)).r - y) + Math.abs(stufe(grau(y)).b - y);
    expect(abweichung(0.5)).toBeLessThan(abweichung(0.05));
    expect(abweichung(0.5)).toBeLessThan(abweichung(0.95));
  });

  it("Schema: Stärke höchstens 0,4, nur Hex-Farben", () => {
    expect(Farbpaar.safeParse(rotBlau).success).toBe(true);
    expect(Farbpaar.safeParse({ ...rotBlau, staerke: 0.41 }).success).toBe(false);
    expect(Farbpaar.safeParse({ ...rotBlau, schatten: "rot" }).success).toBe(false);
  });
});
