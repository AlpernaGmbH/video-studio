import { describe, expect, it } from "vitest";
import { addiere, fcpZeit, fpsBruch, frameZeit, inFrames, kuerze, rastere } from "./raster";

describe("fpsBruch", () => {
  it("ganze Raten bleiben ganz", () => {
    expect(fpsBruch(25)).toEqual({ n: 25, d: 1 });
    expect(fpsBruch(50)).toEqual({ n: 50, d: 1 });
  });
  it("NTSC-Raten werden zu x000/1001", () => {
    expect(fpsBruch(29.97)).toEqual({ n: 30000, d: 1001 });
    expect(fpsBruch(23.976)).toEqual({ n: 24000, d: 1001 });
    expect(fpsBruch(59.94)).toEqual({ n: 60000, d: 1001 });
  });
  it("eine geratene gebrochene Rate wird abgelehnt", () => {
    expect(() => fpsBruch(27.3)).toThrow(/NTSC/);
    expect(() => fpsBruch(0)).toThrow();
  });
});

describe("Frames und Zeiten", () => {
  it("rundet auf das nächste Frame", () => {
    expect(inFrames(1.0, 25)).toBe(25);
    expect(inFrames(1.019, 25)).toBe(25);
    expect(inFrames(1.021, 25)).toBe(26);
  });
  it("29,97 fps: 30 Sekunden sind 899 Frames, nicht 900 (sonst driftet jeder lange Schnitt)", () => {
    expect(inFrames(30, 29.97)).toBe(899);
    expect(frameZeit(899, 29.97)).toEqual({ n: 899 * 1001, d: 30000 });
  });
  it("rastere legt Sekunden auf das Raster", () => {
    expect(rastere(2.07, 25)).toBeCloseTo(2.08, 10);
  });
});

describe("FCPXML-Zeit", () => {
  it("kürzt Brüche und schreibt ganze Sekunden ohne Nenner", () => {
    expect(fcpZeit(frameZeit(0, 25))).toBe("0s");
    expect(fcpZeit(frameZeit(25, 25))).toBe("1s");
    expect(fcpZeit(frameZeit(5, 25))).toBe("1/5s");
    expect(fcpZeit(frameZeit(1, 29.97))).toBe("1001/30000s");
  });
  it("addiert exakt", () => {
    expect(addiere(kuerze(1, 3), kuerze(1, 6))).toEqual({ n: 1, d: 2 });
  });
});
