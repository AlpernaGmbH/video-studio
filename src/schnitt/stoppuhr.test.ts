import { describe, expect, it } from "vitest";
import { dauerText, stoppuhr, type SchrittEreignis } from "./stoppuhr";

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

  describe("Beobachter", () => {
    it("hört Beginn und Ende jedes Schritts, mit Nummer und Dauer", async () => {
      const u = uhr();
      const e: SchrittEreignis[] = [];
      const s = stoppuhr(u.jetzt, (x) => e.push(x));
      await s.messe("Sondieren", async () => u.vor(300));
      await s.messe("Whisper", async () => u.vor(90_000));
      expect(e).toEqual([
        { nr: 1, name: "Sondieren", zustand: "start" },
        { nr: 1, name: "Sondieren", zustand: "ok", ms: 300 },
        { nr: 2, name: "Whisper", zustand: "start" },
        { nr: 2, name: "Whisper", zustand: "ok", ms: 90_000 },
      ]);
    });

    it("meldet einen Fehler mit Dauer und Meldung und wirft ihn weiter", async () => {
      const u = uhr();
      const e: SchrittEreignis[] = [];
      const s = stoppuhr(u.jetzt, (x) => e.push(x));
      await expect(
        s.messe("Kaputt", async () => {
          u.vor(2000);
          throw new Error("nein");
        }),
      ).rejects.toThrow("nein");
      expect(e.at(-1)).toEqual({ nr: 1, name: "Kaputt", zustand: "error", ms: 2000, fehler: "nein" });
    });

    it("ein Beobachter, der wirft, ändert weder das Ergebnis noch die Liste noch den Fehler", async () => {
      const u = uhr();
      const s = stoppuhr(u.jetzt, () => {
        throw new Error("Beobachter kaputt");
      });
      expect(await s.messe("a", async () => (u.vor(10), 42))).toBe(42);
      await expect(
        s.messe("b", async () => {
          throw new Error("echt");
        }),
      ).rejects.toThrow("echt");
      expect(s.schritte().map((x) => x.name)).toEqual(["a", "b"]);
    });

    it("ohne Beobachter ändert sich nichts", async () => {
      const s = stoppuhr(uhr().jetzt);
      expect(await s.messe("a", async () => 1)).toBe(1);
    });

    it("verschachtelte Schritte zählen weiter, Beginn und Ende gehören zusammen", async () => {
      const e: SchrittEreignis[] = [];
      const s = stoppuhr(undefined, (x) => e.push(x));
      await s.messe("aussen", async () => {
        await s.messe("innen", async () => undefined);
      });
      expect(e.map((x) => `${x.nr}:${x.name}:${x.zustand}`)).toEqual(["1:aussen:start", "2:innen:start", "2:innen:ok", "1:aussen:ok"]);
    });
  });
});
