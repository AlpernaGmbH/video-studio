import { describe, expect, it } from "vitest";
import {
  LICHTER_KNIE,
  VGAMUT_ZU_REC709,
  VLOG,
  blendenUeberGrau,
  lichterSchulter,
  linearZuVlog,
  rec709Oetf,
  vgamutZuRec709,
  vlogZuLinear,
  vlogZuRec709,
} from "./vlog";

const grau = (v: number) => ({ r: v, g: v, b: v });
const schritte = (n: number, von = 0, bis = 1): number[] => Array.from({ length: n + 1 }, (_, i) => von + ((bis - von) * i) / n);

describe("V-Log (Panasonic Reference Manual Rev. 1.0)", () => {
  it("die Anker des Handbuchs: 0 % = Code 128, 18 % = 433, 90 % = 602 (10 Bit)", () => {
    expect(Math.round(linearZuVlog(0) * 1023)).toBe(128);
    expect(Math.round(linearZuVlog(0.18) * 1023)).toBe(433);
    expect(Math.round(linearZuVlog(0.9) * 1023)).toBe(602);
  });

  it("die Konstanten sind die des Handbuchs", () => {
    expect(VLOG).toMatchObject({ cut1: 0.01, cut2: 0.181, b: 0.00873, c: 0.241514, d: 0.598206, steigung: 5.6, versatz: 0.125 });
  });

  it("der volle Code 1023 trägt rund 46fach Weiss, so weit reicht V-Log nach oben", () => {
    expect(vlogZuLinear(1)).toBeGreaterThan(45.9);
    expect(vlogZuLinear(1)).toBeLessThan(46.2);
  });

  it("Hin und zurück ergibt dasselbe, auf der Geraden und im Logarithmus", () => {
    for (const x of [0, 0.001, 0.005, 0.05, 0.18, 0.5, 0.9, 1, 5, 20, 46]) {
      expect(vlogZuLinear(linearZuVlog(x))).toBeCloseTo(x, 9);
    }
    // An der Naht (0,01) lassen die auf sechs Stellen gerundeten Konstanten des Handbuchs einen Sprung von rund 6e-8: Das ist die Vorgabe, kein Fehler
    for (const x of [0.00999, 0.01, 0.0101]) expect(vlogZuLinear(linearZuVlog(x))).toBeCloseTo(x, 6);
    for (const v of schritte(200)) expect(linearZuVlog(vlogZuLinear(v))).toBeCloseTo(v, 9);
  });

  it("die Kennlinie ist an beiden Grenzen stetig (Gerade bei 0,01 und 0,181)", () => {
    const eps = 1e-9;
    expect(Math.abs(linearZuVlog(VLOG.cut1 - eps) - linearZuVlog(VLOG.cut1 + eps))).toBeLessThan(5e-6);
    expect(Math.abs(vlogZuLinear(VLOG.cut2 - eps) - vlogZuLinear(VLOG.cut2 + eps))).toBeLessThan(5e-5);
    // Grenze der Umkehrung = Wert der Vorwärts-Kennlinie an ihrer Grenze (0,181)
    expect(linearZuVlog(VLOG.cut1)).toBeCloseTo(VLOG.cut2, 5);
  });

  it("die Kennlinie steigt streng, in beide Richtungen", () => {
    let vorher = -Infinity;
    for (const x of schritte(2000, 0, 3)) {
      const v = linearZuVlog(x);
      expect(v).toBeGreaterThan(vorher);
      vorher = v;
    }
    vorher = -Infinity;
    for (const v of schritte(2000)) {
      const l = vlogZuLinear(v);
      expect(l).toBeGreaterThan(vorher);
      vorher = l;
    }
  });

  it("Werte unter dem Schwarzpunkt (Rauschen) ergeben negatives Licht, nicht NaN", () => {
    const l = vlogZuLinear(0.1);
    expect(l).toBeLessThan(0);
    expect(Number.isFinite(l)).toBe(true);
  });

  it("blendenUeberGrau: 18 % Grau = 0, eine Blende heller = +1, dunkler = -1", () => {
    expect(blendenUeberGrau(linearZuVlog(0.18))).toBeCloseTo(0, 9);
    expect(blendenUeberGrau(linearZuVlog(0.36))).toBeCloseTo(1, 9);
    expect(blendenUeberGrau(linearZuVlog(0.09))).toBeCloseTo(-1, 9);
    expect(blendenUeberGrau(0.1)).toBe(Number.NEGATIVE_INFINITY);
  });
});

describe("V-Gamut → Rec. 709", () => {
  it("Weiss bleibt Weiss und Grau bleibt Grau (Zeilensumme je 1)", () => {
    for (const zeile of VGAMUT_ZU_REC709) expect(zeile[0] + zeile[1] + zeile[2]).toBeCloseTo(1, 6);
    for (const v of [0, 0.02, 0.18, 0.9, 5]) {
      const o = vgamutZuRec709(grau(v));
      expect(o.r).toBeCloseTo(v, 6);
      expect(o.g).toBeCloseTo(v, 6);
      expect(o.b).toBeCloseTo(v, 6);
    }
  });

  it("die Matrix ist die des Handbuchs (die Zahlen sind genau diese)", () => {
    expect(VGAMUT_ZU_REC709).toEqual([
      [1.806576, -0.695697, -0.110879],
      [-0.17009, 1.305955, -0.135865],
      [-0.025206, -0.154468, 1.179674],
    ]);
  });

  it("eine gesättigte V-Gamut-Farbe liegt ausserhalb von Rec. 709: Die Matrix gibt negative Anteile", () => {
    const o = vgamutZuRec709({ r: 0.5, g: 0.02, b: 0.02 });
    expect(o.r).toBeGreaterThan(0.5);
    expect(o.g).toBeLessThan(0);
  });
});

describe("Rec.-709-Kennlinie und Lichter-Schulter", () => {
  it("18 % Grau → 0,409, Weiss → 1, Schwarz → 0, nichts unter 0", () => {
    expect(rec709Oetf(0.18)).toBeCloseTo(0.409, 3);
    expect(rec709Oetf(1)).toBeCloseTo(1, 6);
    expect(rec709Oetf(0)).toBe(0);
    expect(rec709Oetf(-0.5)).toBe(0);
  });

  it("die Kennlinie ist an der Grenze 0,018 fast stetig (die Norm lässt 2e-4 Sprung zu) und steigt streng", () => {
    expect(Math.abs(rec709Oetf(0.018 - 1e-9) - rec709Oetf(0.018 + 1e-9))).toBeLessThan(5e-4);
    let vorher = -1;
    for (const x of schritte(1000, 0, 1)) {
      expect(rec709Oetf(x)).toBeGreaterThanOrEqual(vorher);
      vorher = rec709Oetf(x);
    }
  });

  it("die Schulter ändert unter dem Knie nichts, ist am Knie stetig und in der Steigung stetig", () => {
    for (const x of [0, 0.1, 0.5, LICHTER_KNIE]) expect(lichterSchulter(x)).toBe(x);
    const e = 1e-7;
    expect(lichterSchulter(LICHTER_KNIE + e) - LICHTER_KNIE).toBeCloseTo(e, 9);
    const steigung = (lichterSchulter(LICHTER_KNIE + 2e-6) - lichterSchulter(LICHTER_KNIE + 1e-6)) / 1e-6;
    expect(steigung).toBeCloseTo(1, 3);
  });

  it("die Schulter steigt streng, bleibt unter 1 (auch bei 46fachem Weiss) und gibt für 1,0 weniger als 1", () => {
    let vorher = -1;
    for (const x of schritte(2000, 0, 50)) {
      const y = lichterSchulter(x);
      expect(y).toBeGreaterThanOrEqual(vorher);
      expect(y).toBeLessThanOrEqual(1);
      vorher = y;
    }
    expect(lichterSchulter(1)).toBeLessThan(1);
    expect(lichterSchulter(46)).toBeGreaterThan(0.999);
  });
});

describe("V-Log → Rec. 709 (die Basis vor dem Look)", () => {
  it("Schwarz bleibt Schwarz, 18 % Grau landet bei 0,409, 90 % Weiss knapp unter Weiss", () => {
    const schwarz = vlogZuRec709(grau(128 / 1023));
    expect(schwarz.g).toBeLessThan(0.002);
    const mitte = vlogZuRec709(grau(linearZuVlog(0.18)));
    expect(mitte.r).toBeCloseTo(0.409, 2);
    expect(mitte.g).toBeCloseTo(mitte.r, 6);
    expect(mitte.b).toBeCloseTo(mitte.r, 6);
    const weiss = vlogZuRec709(grau(602 / 1023));
    expect(weiss.g).toBeGreaterThan(0.9);
    expect(weiss.g).toBeLessThan(0.96);
  });

  it("Grau bleibt Grau über den ganzen Bereich", () => {
    for (const v of schritte(100)) {
      const o = vlogZuRec709(grau(v));
      expect(o.r).toBeCloseTo(o.g, 9);
      expect(o.g).toBeCloseTo(o.b, 9);
    }
  });

  it("jeder mögliche Code, auch gesättigt und unter Schwarz, gibt endliche Werte in 0 bis 1", () => {
    const stufen = schritte(16);
    for (const r of stufen) for (const g of stufen) for (const b of stufen) {
      const o = vlogZuRec709({ r, g, b });
      for (const k of [o.r, o.g, o.b]) {
        expect(Number.isFinite(k)).toBe(true);
        expect(k).toBeGreaterThanOrEqual(0);
        expect(k).toBeLessThanOrEqual(1);
      }
    }
  });

  it("die Helligkeit steigt mit dem Code (auf der Grauachse streng, bis die Schulter sich 1 nähert)", () => {
    let vorher = -1;
    for (const v of schritte(300, 0.1, 0.8)) {
      const g = vlogZuRec709(grau(v)).g;
      expect(g).toBeGreaterThanOrEqual(vorher);
      vorher = g;
    }
  });

  it("Belichtung: eine Blende hellere Einstellung gibt ein helleres Bild, minus eine ein dunkleres, 0 ändert nichts", () => {
    const code = grau(linearZuVlog(0.18));
    const basis = vlogZuRec709(code).g;
    expect(vlogZuRec709(code, { belichtung: 0 }).g).toBe(basis);
    expect(vlogZuRec709(code, { belichtung: 1 }).g).toBeCloseTo(rec709Oetf(0.36), 6);
    expect(vlogZuRec709(code, { belichtung: -1 }).g).toBeCloseTo(rec709Oetf(0.09), 6);
  });

  it("die Schulter fängt Licht über Weiss ab: Weiss mit +2 Blenden bleibt unter 1 und verliert keine Zeichnung (Werte stehen noch auseinander)", () => {
    const hell = (v: number) => vlogZuRec709(grau(v), { belichtung: 2 }).g;
    expect(hell(linearZuVlog(0.9))).toBeLessThan(1);
    expect(hell(linearZuVlog(1.5))).toBeGreaterThan(hell(linearZuVlog(0.9)));
  });

  it("ein anderes Knie verschiebt, wo die Lichter einknicken", () => {
    const code = grau(linearZuVlog(0.9));
    expect(vlogZuRec709(code, { knie: 0.5 }).g).toBeLessThan(vlogZuRec709(code, { knie: 0.9 }).g);
  });
});
