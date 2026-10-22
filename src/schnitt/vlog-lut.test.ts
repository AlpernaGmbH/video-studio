import { describe, expect, it } from "vitest";
import { leseCube, rechneFarbe, wendeCubeAn, type Rgb } from "./lut";
import { VLOG_LUT_GROESSE, baueVlogCube } from "./vlog-lut";
import { linearZuVlog, rec709Oetf, vlogZuRec709 } from "./vlog";

const look = { gamma: 1, kontrast: 0.2, saettigung: 1, kuehle: 0.2 };
const aufgeloest = { ...look, schwarz: 0, weiss: 1 };
const lcg = (start: number) => {
  let s = start;
  return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
};
const abstand = (a: Rgb, b: Rgb): number => Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b)) * 255;
const grau = (v: number): Rgb => ({ r: v, g: v, b: v });

describe("V-Log-LUT", () => {
  const ohne = leseCube(baueVlogCube("Test", undefined));
  const mit = leseCube(baueVlogCube("Test", look));

  it("hat 65 Punkte je Achse und lauter endliche Werte in 0 bis 1 (auch für Farben ausserhalb von Rec. 709 und Werte unter Schwarz)", () => {
    expect(VLOG_LUT_GROESSE).toBe(65);
    for (const c of [ohne, mit]) {
      expect(c.groesse).toBe(65);
      expect(c.werte).toHaveLength(65 ** 3);
      // ausserhalb von 0 bis 1 oder nicht endlich: gezählt statt 800 000 Mal geprüft (sonst dauert der Test eine halbe Minute)
      const ungueltig = c.werte.filter((w) => [w.r, w.g, w.b].some((k) => !Number.isFinite(k) || k < 0 || k > 1)).length;
      expect(ungueltig).toBe(0);
    }
  });

  it("die Köpfe der Datei stimmen (Titel, Grösse, Bereich)", () => {
    const text = baueVlogCube("Alperna V-Log", undefined, { groesse: 5 });
    expect(text.split("\n").slice(0, 4)).toEqual(['TITLE "Alperna V-Log"', "LUT_3D_SIZE 5", "DOMAIN_MIN 0.0 0.0 0.0", "DOMAIN_MAX 1.0 1.0 1.0"]);
  });

  it("die Anker laufen durch die LUT: Schwarz → 0, 18 % Grau → 0,409, 90 % Weiss knapp unter Weiss", () => {
    expect(wendeCubeAn(ohne, grau(128 / 1023)).g).toBeLessThan(0.003);
    expect(wendeCubeAn(ohne, grau(linearZuVlog(0.18))).g).toBeCloseTo(rec709Oetf(0.18), 2);
    const weiss = wendeCubeAn(ohne, grau(602 / 1023)).g;
    expect(weiss).toBeGreaterThan(0.9);
    expect(weiss).toBeLessThan(0.96);
  });

  it("an den Gitterpunkten ist die LUT genau die Kette: Umrechnung, dann Look", () => {
    const i = 1 / 64;
    for (const [r, g, b] of [[20, 30, 40], [10, 10, 10], [50, 40, 30], [64, 64, 64], [0, 0, 0]] as const) {
      const eingang = { r: r * i, g: g * i, b: b * i };
      const erwartet = rechneFarbe(vlogZuRec709(eingang), aufgeloest);
      const gelesen = mit.werte[r + g * 65 + b * 65 * 65]!;
      expect(abstand(gelesen, erwartet)).toBeLessThan(1e-4);
    }
  });

  it("Interpolationsfehler: auf der Grauachse höchstens 1 von 255, und ein 33er-Gitter schafft das nicht (darum 65)", () => {
    const fehler = (cube: { groesse: number; werte: Rgb[] }): number => {
      let m = 0;
      for (let i = 0; i <= 1000; i++) {
        const c = grau(i / 1000);
        m = Math.max(m, abstand(wendeCubeAn(cube, c), vlogZuRec709(c)));
      }
      return m;
    };
    expect(fehler(ohne)).toBeLessThan(1);
    expect(fehler(leseCube(baueVlogCube("t", undefined, { groesse: 33 })))).toBeGreaterThan(1.5);
  });

  it("Interpolationsfehler bei natürlichen Farben (bis +2,5 Blenden über Grau, mässig farbig): p99 höchstens 1,5 von 255, nie über 3", () => {
    const zufall = lcg(777);
    const werte: number[] = [];
    for (let i = 0; i < 20000; i++) {
      const g = 0.13 + zufall() * 0.42;
      const c = { r: g + (zufall() - 0.5) * 0.06, g: g + (zufall() - 0.5) * 0.06, b: g + (zufall() - 0.5) * 0.06 };
      werte.push(abstand(wendeCubeAn(mit, c), rechneFarbe(vlogZuRec709(c), aufgeloest)));
    }
    werte.sort((x, y) => x - y);
    expect(werte[Math.floor(werte.length * 0.99)]!).toBeLessThan(1.5);
    expect(werte.at(-1)!).toBeLessThan(3);
  });

  it("die Belichtung hellt die LUT auf: eine Blende mehr gibt in den Mitten ein helleres Bild", () => {
    const heller = leseCube(baueVlogCube("t", undefined, { belichtung: 1 }));
    const c = grau(linearZuVlog(0.18));
    expect(wendeCubeAn(heller, c).g).toBeCloseTo(rec709Oetf(0.36), 2);
    expect(wendeCubeAn(heller, c).g).toBeGreaterThan(wendeCubeAn(ohne, c).g + 0.05);
  });

  it("der Look wirkt über der Basis: mehr Kontrast macht die dunklen Mitten dunkler und die hellen heller", () => {
    const dunkel = grau(linearZuVlog(0.05));
    const hell = grau(linearZuVlog(0.6));
    expect(wendeCubeAn(mit, dunkel).g).toBeLessThan(wendeCubeAn(ohne, dunkel).g);
    expect(wendeCubeAn(mit, hell).g).toBeGreaterThan(wendeCubeAn(ohne, hell).g);
  });
});
