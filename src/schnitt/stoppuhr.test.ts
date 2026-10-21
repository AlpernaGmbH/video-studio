import { describe, expect, it } from "vitest";
import { dauerText, stoppuhr } from "./stoppuhr";

describe("dauerText", () => {
  it("Millisekunden, Sekunden mit Komma, Minuten", () => {
    expect(dauerText(12)).toBe("12 ms");
    expect(dauerText(999)).toBe("999 ms");
    expect(dauerText(1000)).toBe("1,0 s");
    expect(dauerText(1500)).toBe("1,5 s");
    expect(dauerText(59_940)).toBe("59,9 s");
    expect(dauerText(60_000)).toBe("1 min 0 s");
    expect(dauerText(125_400)).toBe("2 min 5 s");
  });
});

describe("stoppuhr", () => {
  const uhr = () => {
    let t = 1000;
    return { jetzt: () => t, vor: (ms: number) => void (t += ms) };
  };

  it("misst jeden Schritt, gibt das Ergebnis der Funktion zurück und führt die Summe", async () => {
    const u = uhr();
    const s = stoppuhr(u.jetzt);
    expect(await s.messe("Sondieren", async () => (u.vor(300), "a"))).toBe("a");
    await s.messe("Transkription", async () => u.vor(125_000));
    expect(s.schritte()).toEqual([{ name: "Sondieren", ms: 300 }, { name: "Transkription", ms: 125_000 }]);
    expect(s.zeilen()).toEqual(["  Sondieren      300 ms", "  Transkription  2 min 5 s", "  Summe          2 min 5 s"]);
  });

  it("ein Schritt, der wirft, steht trotzdem in der Liste, und der Fehler geht weiter", async () => {
    const u = uhr();
    const s = stoppuhr(u.jetzt);
    await expect(
      s.messe("Kaputt", async () => {
        u.vor(2000);
        throw new Error("nein");
      }),
    ).rejects.toThrow("nein");
    expect(s.schritte()).toEqual([{ name: "Kaputt", ms: 2000 }]);
  });

  it("ohne Schritte gibt es keine Zeilen", () => {
    expect(stoppuhr().zeilen()).toEqual([]);
  });

  it("schritte() gibt eine Kopie zurück", async () => {
    const s = stoppuhr();
    await s.messe("a", async () => undefined);
    s.schritte().pop();
    expect(s.schritte()).toHaveLength(1);
  });
});
