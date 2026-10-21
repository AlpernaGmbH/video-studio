import { describe, expect, it } from "vitest";
import { ALPERNA_KINO, leseCube, linearZuVlog, lookFunktion, schreibeCube, VGAMUT_ZU_REC709, vlogZuLinear, type Rgb } from "./look";

describe("V-Log", () => {
  it("rechnet Code in Licht und zurück, an der Knickstelle stetig", () => {
    for (const x of [0, 0.005, 0.01, 0.18, 0.9, 5]) expect(vlogZuLinear(linearZuVlog(x))).toBeCloseTo(x, 6);
    expect(vlogZuLinear(0.181)).toBeCloseTo(0.01, 4);
    expect(linearZuVlog(0.01)).toBeCloseTo(0.181, 4);
  });
  it("trifft die Eckwerte der Panasonic-Beschreibung: 18 % Grau bei 0,423, 90 % Weiss bei 0,588", () => {
    expect(linearZuVlog(0.18)).toBeCloseTo(0.423, 2);
    expect(linearZuVlog(0.9)).toBeCloseTo(0.588, 2);
    expect(linearZuVlog(0)).toBeCloseTo(0.125, 3);
  });
});

describe("V-Gamut nach Rec.709", () => {
  it("die gerechnete Matrix stimmt mit der veröffentlichten überein und lässt Grau grau", () => {
    const soll = [[1.806576, -0.695697, -0.110879], [-0.17009, 1.305955, -0.135865], [-0.025206, -0.154468, 1.179674]];
    soll.forEach((z, i) => z.forEach((v, j) => expect(VGAMUT_ZU_REC709[i]![j]!, `${i}${j}`).toBeCloseTo(v, 3)));
    for (const zeile of VGAMUT_ZU_REC709) expect(zeile[0]! + zeile[1]! + zeile[2]!).toBeCloseTo(1, 4);
  });
});

describe("Look Alperna Kino", () => {
  const f = lookFunktion(ALPERNA_KINO);
  const grau = (v: number): Rgb => f([v, v, v]);

  it("hält Schwarz dunkel und Weiss hell, und die Grauachse steigt stetig", () => {
    expect(Math.max(...grau(0.125))).toBeLessThan(0.1);
    expect(grau(0.598)[1]).toBeGreaterThan(0.8);
    let vor = -1;
    for (let i = 0; i <= 40; i++) {
      const y = grau(0.125 + (i / 40) * 0.6)[1];
      expect(y).toBeGreaterThanOrEqual(vor);
      vor = y;
    }
  });

  it("macht die Schatten kühl und lässt die Haut warm (Rot vor Grün vor Blau)", () => {
    const schatten = grau(0.2);
    expect(schatten[2]).toBeGreaterThan(schatten[0]);
    const haut = f([0.511, 0.47, 0.455]);
    expect(haut[0]).toBeGreaterThan(haut[1]);
    expect(haut[1]).toBeGreaterThan(haut[2]);
  });

  it("entsättigt leicht, aber nicht zu Schwarzweiss", () => {
    const ohne = lookFunktion({ ...ALPERNA_KINO, saettigung: 1 })([0.511, 0.47, 0.455]);
    const mit = f([0.511, 0.47, 0.455]);
    expect(mit[0]! - mit[2]!).toBeLessThan(ohne[0]! - ohne[2]!);
    expect(mit[0]! - mit[2]!).toBeGreaterThan(0.05);
  });

  it("bleibt im Bereich 0 bis 1, auch bei Eckwerten", () => {
    for (const r of [0, 1]) for (const g of [0, 1]) for (const b of [0, 1]) for (const c of f([r, g, b])) expect(c).toBeGreaterThanOrEqual(0), expect(c).toBeLessThanOrEqual(1);
  });
});

describe("schreibeCube und leseCube", () => {
  it("schreibt 33³ Einträge mit Rot als schnellster Achse", () => {
    const text = schreibeCube(([r, g, b]) => [r, g, b], "Identität", 5);
    const l = leseCube(text);
    expect(l.groesse).toBe(5);
    expect(l.werte).toHaveLength(125);
    // Eintrag 1 ist Rot = 0,25 bei Grün 0 und Blau 0, Eintrag 5 ist Grün = 0,25
    expect(l.werte[1]).toEqual([0.25, 0, 0]);
    expect(l.werte[5]).toEqual([0, 0.25, 0]);
    expect(l.werte[25]).toEqual([0, 0, 0.25]);
    expect(text).toContain('TITLE "Identität"');
    expect(leseCube(schreibeCube(lookFunktion(ALPERNA_KINO), "x")).werte).toHaveLength(33 ** 3);
  });
  it("lehnt eine Datei mit falscher Anzahl ab", () => {
    expect(() => leseCube("LUT_3D_SIZE 2\n0 0 0\n")).toThrow(/erwartet 8/);
    expect(() => leseCube("nichts")).toThrow(/Keine 3D-LUT/);
  });
});
