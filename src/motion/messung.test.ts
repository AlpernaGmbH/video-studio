import { describe, expect, it } from "vitest";
import { gerade } from "./messung";

describe("gerade (T1b)", () => {
  it("findet festen Anteil und Steigung aus exakten Punkten", () => {
    const g = gerade([1.4, 2.6, 5].map((x) => ({ x, y: 8 + 2 * x })));
    expect(g.fest).toBeCloseTo(8, 9);
    expect(g.je).toBeCloseTo(2, 9);
  });

  it("mittelt verrauschte Wiederholungen", () => {
    const g = gerade([{ x: 1, y: 10 }, { x: 1, y: 12 }, { x: 3, y: 14 }, { x: 3, y: 16 }]);
    expect(g.je).toBeCloseTo(2, 9);
    expect(g.fest).toBeCloseTo(9, 9);
  });

  it("verweigert eine Gerade durch einen einzigen x-Wert", () => {
    expect(() => gerade([{ x: 2, y: 5 }, { x: 2, y: 6 }])).toThrow(/mindestens zwei/);
    expect(() => gerade([])).toThrow();
  });
});
