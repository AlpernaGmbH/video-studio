import { describe, expect, it } from "vitest";
import { Farblook } from "../core/schemas";
import { baueCube, leseCube, rechneFarbe } from "./lut";

const look = (x: Partial<Farblook> = {}) => ({ schwarz: 0, weiss: 1, ...Farblook.parse({ ...x }), ...(x.schwarz !== undefined ? { schwarz: x.schwarz } : {}), ...(x.weiss !== undefined ? { weiss: x.weiss } : {}) });
const grau = (v: number) => ({ r: v, g: v, b: v });

describe("rechneFarbe", () => {
  it("die Grundeinstellung ändert nichts", () => {
    for (const c of [{ r: 0, g: 0, b: 0 }, { r: 1, g: 1, b: 1 }, { r: 0.2, g: 0.5, b: 0.8 }, { r: 0.9, g: 0.1, b: 0.4 }]) {
      const o = rechneFarbe(c, look());
      expect(o.r).toBeCloseTo(c.r, 9);
      expect(o.g).toBeCloseTo(c.g, 9);
      expect(o.b).toBeCloseTo(c.b, 9);
    }
  });

  it("Schwarz- und Weisspunkt spannen den Bereich auf: darunter wird Schwarz, darüber Weiss, dazwischen linear", () => {
    const l = look({ schwarz: 0.2, weiss: 0.6 });
    expect(rechneFarbe(grau(0.1), l).g).toBe(0);
    expect(rechneFarbe(grau(0.2), l).g).toBeCloseTo(0, 9);
    expect(rechneFarbe(grau(0.4), l).g).toBeCloseTo(0.5, 9);
    expect(rechneFarbe(grau(0.6), l).g).toBeCloseTo(1, 9);
    expect(rechneFarbe(grau(0.9), l).g).toBe(1);
  });

  it("Gamma über 1 hellt die Mitten auf, unter 1 dunkelt sie ab, Schwarz und Weiss bleiben", () => {
    expect(rechneFarbe(grau(0.5), look({ gamma: 1.4 })).g).toBeGreaterThan(0.5);
    expect(rechneFarbe(grau(0.5), look({ gamma: 0.7 })).g).toBeLessThan(0.5);
    expect(rechneFarbe(grau(0), look({ gamma: 1.4 })).g).toBe(0);
    expect(rechneFarbe(grau(1), look({ gamma: 1.4 })).g).toBeCloseTo(1, 9);
  });

  it("Kontrast ist eine S-Kurve: Schatten dunkler, Lichter heller, die Mitte bleibt", () => {
    const l = look({ kontrast: 0.8 });
    expect(rechneFarbe(grau(0.25), l).g).toBeLessThan(0.25);
    expect(rechneFarbe(grau(0.75), l).g).toBeGreaterThan(0.75);
    expect(rechneFarbe(grau(0.5), l).g).toBeCloseTo(0.5, 9);
  });

  it("Sättigung 0 ergibt Grau in der Helligkeit des Pixels; 2 verdoppelt den Abstand zum Grau", () => {
    const c = { r: 0.6, g: 0.4, b: 0.3 };
    const y = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    const grauer = rechneFarbe(c, look({ saettigung: 0 }));
    expect([grauer.r, grauer.g, grauer.b].map((x) => Math.round(x * 1e6))).toEqual([y, y, y].map((x) => Math.round(x * 1e6)));
    const doppelt = rechneFarbe(c, look({ saettigung: 2 }));
    expect(doppelt.r - y).toBeCloseTo(2 * (c.r - y), 9);
    expect(doppelt.b - y).toBeCloseTo(2 * (c.b - y), 9);
  });

  it("Kühle nimmt Rot und gibt Blau, in den Schatten mehr als in den Lichtern, im reinen Weiss gar nichts; negativ ist es umgekehrt", () => {
    const dunkel = rechneFarbe(grau(0.2), look({ kuehle: 1 }));
    expect(dunkel.b).toBeGreaterThan(dunkel.r);
    const hell = rechneFarbe(grau(0.8), look({ kuehle: 1 }));
    expect(hell.b - hell.r).toBeLessThan(dunkel.b - dunkel.r);
    expect(rechneFarbe(grau(1), look({ kuehle: 1 }))).toEqual({ r: 1, g: 1, b: 1 });
    const warm = rechneFarbe(grau(0.2), look({ kuehle: -1 }));
    expect(warm.r).toBeGreaterThan(warm.b);
  });

  it("ein Verlauf von Schwarz nach Weiss bleibt mit jedem Look steigend (keine Umkehr der Tonwerte)", () => {
    for (const l of [look({ schwarz: 0.1, weiss: 0.7, gamma: 1.3, kontrast: 1, saettigung: 1.5, kuehle: 0.5 }), look({ gamma: 0.5, kontrast: 1 }), look({ gamma: 2.4, kontrast: 0.3 })]) {
      let vorher = -1;
      for (let i = 0; i <= 100; i++) {
        const y = rechneFarbe(grau(i / 100), l).g;
        expect(y).toBeGreaterThanOrEqual(vorher - 1e-9);
        vorher = y;
      }
    }
  });

  it("das Ergebnis bleibt immer zwischen 0 und 1", () => {
    const l = look({ saettigung: 2, kuehle: 1, kontrast: 1, gamma: 2.5 });
    for (const c of [{ r: 1, g: 0, b: 0 }, { r: 0, g: 1, b: 0 }, { r: 0, g: 0, b: 1 }, { r: 1, g: 1, b: 0 }, { r: 0, g: 0, b: 0 }]) {
      const o = rechneFarbe(c, l);
      for (const x of [o.r, o.g, o.b]) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("baueCube und leseCube", () => {
  it("schreibt Kopf, Grösse³ Zeilen, Rot läuft am schnellsten, dann Grün, dann Blau", () => {
    const text = baueCube("Test", look(), 5);
    expect(text.split("\n").slice(0, 4)).toEqual(['TITLE "Test"', "LUT_3D_SIZE 5", "DOMAIN_MIN 0.0 0.0 0.0", "DOMAIN_MAX 1.0 1.0 1.0"]);
    const { groesse, werte } = leseCube(text);
    expect(groesse).toBe(5);
    expect(werte).toHaveLength(125);
    // Eintrag 1: Rot einen Schritt weiter; Eintrag 5: Grün einen Schritt; Eintrag 25: Blau einen Schritt
    expect(werte[1]).toEqual({ r: 0.25, g: 0, b: 0 });
    expect(werte[5]).toEqual({ r: 0, g: 0.25, b: 0 });
    expect(werte[25]).toEqual({ r: 0, g: 0, b: 0.25 });
    expect(werte[124]).toEqual({ r: 1, g: 1, b: 1 });
  });

  it("jeder Eintrag der LUT ist der Look für seine Farbe", () => {
    const l = look({ schwarz: 0.1, weiss: 0.8, gamma: 1.2, kontrast: 0.5, saettigung: 1.3, kuehle: 0.4 });
    const { werte } = leseCube(baueCube("x", l, 9));
    const f = (i: number) => i / 8;
    for (const [r, g, b] of [[2, 5, 7], [8, 0, 3], [4, 4, 4]] as const) {
      const soll = rechneFarbe({ r: f(r), g: f(g), b: f(b) }, l);
      const ist = werte[r + 9 * g + 81 * b]!;
      expect(ist.r).toBeCloseTo(soll.r, 5);
      expect(ist.g).toBeCloseTo(soll.g, 5);
      expect(ist.b).toBeCloseTo(soll.b, 5);
    }
  });

  it("nimmt keine unsinnige Grösse und macht aus Anführungszeichen im Titel keine kaputte Zeile", () => {
    expect(() => baueCube("x", look(), 1)).toThrow(/nicht zulässig/);
    expect(() => baueCube("x", look(), 200)).toThrow(/nicht zulässig/);
    expect(baueCube('a "b"', look(), 2).split("\n")[0]).toBe(`TITLE "a 'b'"`);
  });

  it("leseCube lehnt falsche Anzahl, fehlende Grösse und unlesbare Zeilen ab", () => {
    expect(() => leseCube("LUT_3D_SIZE 2\n0 0 0\n")).toThrow(/erwartet 8/);
    expect(() => leseCube("0 0 0\n")).toThrow(/LUT_3D_SIZE/);
    expect(() => leseCube("LUT_3D_SIZE 2\nabc\n")).toThrow(/Unlesbare Zeile/);
  });
});

describe("Farblook (Schema)", () => {
  it("füllt Grundwerte und verlangt einen Weisspunkt über dem Schwarzpunkt", () => {
    expect(Farblook.parse({})).toEqual({ gamma: 1, kontrast: 0, saettigung: 1, kuehle: 0 });
    expect(Farblook.safeParse({ schwarz: 0.3, weiss: 0.35 }).success).toBe(false);
    expect(Farblook.safeParse({ schwarz: 0.1, weiss: 0.7 }).success).toBe(true);
    expect(Farblook.safeParse({ saettigung: 3 }).success).toBe(false);
  });
});
