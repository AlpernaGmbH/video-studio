import { describe, expect, it } from "vitest";
import { erkenneProfil, FLACH, grauMass, istFlach, waehleMuster, type BildMass } from "./messen";

const mass = (pfad: string, mittel: number, p2 = 0.02, p98 = 0.98): BildMass => ({ pfad, mittel, p2, p98 });
const flach = (pfad: string): BildMass => mass(pfad, 0.35, 0.14, 0.6);
const kontrastreich = (pfad: string): BildMass => mass(pfad, 0.45, 0.01, 0.97);

describe("grauMass", () => {
  it("Mittelwert und Perzentile eines bekannten Bildes", () => {
    // 100 Pixel: 50 mal 0 und 50 mal 255
    const px = new Uint8Array(100);
    px.fill(255, 50);
    const m = grauMass("a.jpg", px);
    expect(m.mittel).toBeCloseTo(0.5, 6);
    expect(m.p2).toBe(0);
    expect(m.p98).toBe(1);
  });

  it("ein einfarbiges Bild hat überall denselben Wert", () => {
    const px = new Uint8Array(4096).fill(102);
    const m = grauMass("b.jpg", px);
    expect([m.mittel, m.p2, m.p98]).toEqual([0.4, 0.4, 0.4]);
  });

  it("ein Verlauf von 40 bis 150 hat Ränder nahe 40 und 150", () => {
    const px = Uint8Array.from({ length: 4096 }, (_, i) => 40 + Math.floor((110 * i) / 4095));
    const m = grauMass("c.jpg", px);
    expect(m.p2 * 255).toBeGreaterThanOrEqual(40);
    expect(m.p2 * 255).toBeLessThan(45);
    expect(m.p98 * 255).toBeGreaterThan(145);
    expect(m.p98 * 255).toBeLessThanOrEqual(150);
  });

  it("ohne Pixel ist es ein Fehler", () => {
    expect(() => grauMass("d.jpg", new Uint8Array(0))).toThrow(/Kein Bild/);
  });
});

describe("erkenneProfil", () => {
  it("ein Ordner mit flachen Fotos ist V-Log", () => {
    expect(erkenneProfil([flach("a"), flach("b"), flach("c"), flach("d"), flach("e")]).profil).toBe("vlog");
  });

  it("ein Ordner mit kontrastreichen Fotos ist Standard", () => {
    expect(erkenneProfil([kontrastreich("a"), kontrastreich("b"), kontrastreich("c")]).profil).toBe("standard");
  });

  it("die Hälfte flach, die Hälfte nicht: unklar (der Mensch muss das Profil angeben)", () => {
    expect(erkenneProfil([flach("a"), flach("b"), kontrastreich("c"), kontrastreich("d")]).profil).toBe("unklar");
  });

  it("ein einziges Foto zählt ganz", () => {
    expect(erkenneProfil([flach("a")]).profil).toBe("vlog");
    expect(erkenneProfil([kontrastreich("a")]).profil).toBe("standard");
  });

  it("die Grenzen: genau am Schwarz- und Weisspunkt gilt noch als flach, knapp daneben nicht", () => {
    expect(istFlach(mass("a", 0.3, FLACH.schwarzMin, FLACH.lichterMax))).toBe(true);
    expect(istFlach(mass("a", 0.3, FLACH.schwarzMin - 0.01, 0.6))).toBe(false);
    expect(istFlach(mass("a", 0.3, 0.14, FLACH.lichterMax + 0.01))).toBe(false);
  });

  it("meldet den Anteil und die mittleren Ränder", () => {
    const e = erkenneProfil([flach("a"), kontrastreich("b")]);
    expect(e.flach).toBe(0.5);
    expect(e.p2).toBeCloseTo(0.075, 6);
    expect(e.p98).toBeCloseTo(0.785, 6);
  });

  it("ohne Fotos ist es ein Fehler", () => {
    expect(() => erkenneProfil([])).toThrow(/Keine Fotos/);
  });
});

describe("waehleMuster", () => {
  const reihe = Array.from({ length: 11 }, (_, i) => mass(`f${String(i).padStart(2, "0")}.jpg`, i / 10));

  it("nimmt ein dunkles, ein mittleres und ein helles Foto", () => {
    const m = waehleMuster(reihe, 3);
    expect(m.map((x) => x.pfad)).toEqual(["f01.jpg", "f05.jpg", "f09.jpg"]);
  });

  it("ist unabhängig von der Reihenfolge der Eingabe", () => {
    const a = waehleMuster(reihe, 3).map((x) => x.pfad);
    const b = waehleMuster([...reihe].reverse(), 3).map((x) => x.pfad);
    expect(b).toEqual(a);
  });

  it("bei gleicher Helligkeit entscheidet der Pfad, und kein Foto kommt doppelt vor", () => {
    const gleich = ["d", "b", "e", "a", "c", "f"].map((p) => mass(`${p}.jpg`, 0.5));
    const m = waehleMuster(gleich, 3);
    expect(new Set(m.map((x) => x.pfad)).size).toBe(3);
    expect(m.map((x) => x.pfad)).toEqual([...m.map((x) => x.pfad)].sort());
  });

  it("bei weniger Fotos als gewünscht kommen alle, nach Helligkeit sortiert", () => {
    expect(waehleMuster([mass("b.jpg", 0.8), mass("a.jpg", 0.2)], 3).map((x) => x.pfad)).toEqual(["a.jpg", "b.jpg"]);
    expect(waehleMuster([], 3)).toEqual([]);
  });

  it("n gleich 1 nimmt das mittlere Foto", () => {
    expect(waehleMuster(reihe, 1).map((x) => x.pfad)).toEqual(["f05.jpg"]);
  });

  it("lehnt eine ungültige Zahl ab", () => {
    expect(() => waehleMuster(reihe, 0)).toThrow(/ganze Zahl/);
    expect(() => waehleMuster(reihe, 1.5)).toThrow(/ganze Zahl/);
  });
});
