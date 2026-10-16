import { describe, expect, it } from "vitest";
import { marke, stueckZahl } from "../testing/fixtures";
import { batchVorbereiten } from "./batch";

describe("batchVorbereiten", () => {
  const s = stueckZahl();

  it("macht aus Zeilen vollständige Variablen mit Name und Dauer, Marke inklusive", () => {
    const r = batchVorbereiten(s, [{ name: "a", werte: { wert: 7, suffix: " von 10" }, dauer: 2.4 }, { name: "b", werte: { wert: 43, suffix: " %" }, dauer: 3.2 }], { marke: marke() });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.zeilen[0]).toMatchObject({ name: "a", wert: 7, suffix: " von 10", dauer: 2.4, markeBg: "#FFFFFF" });
      expect(r.zeilen[1]).toMatchObject({ name: "b", wert: 43, dauer: 3.2 });
      expect(r.dauern).toEqual({ a: 2.4, b: 3.2 });
    }
  });

  it("ein Fehler in einer Zeile stoppt alles und nennt die Zeile", () => {
    const r = batchVorbereiten(s, [{ name: "ok", werte: { wert: 7 } }, { name: "schlecht", werte: { wert: 7, farbe: "rot" } }, { name: "zu-lang", werte: { wert: 1 }, dauer: 9 }], { marke: marke() });
    expect(r).toEqual({ ok: false, fehler: [expect.stringContaining("Zeile 2 («schlecht»): Unbekannter Parameter «farbe»"), expect.stringContaining("Zeile 3 («zu-lang»): Dauer 9")] });
  });

  it("der Name wird zum Dateinamen: nur sichere Zeichen, keine Doppelten (auch nicht in anderer Schreibweise)", () => {
    for (const name of ["", "../x", "a b", "a/b", "-start", "ü"]) {
      expect(batchVorbereiten(s, [{ name, werte: { wert: 1 } }], { marke: marke() }).ok).toBe(false);
    }
    const r = batchVorbereiten(s, [{ name: "Eins", werte: { wert: 1 } }, { name: "eins", werte: { wert: 2 } }], { marke: marke() });
    expect(r).toEqual({ ok: false, fehler: [expect.stringContaining("kommt schon vor")] });
  });

  it("verlangt eine Marke, wenn das Stück Marken-Variablen nutzt, ausser der Aufrufer sagt ausdrücklich «ohneMarke»", () => {
    const ohne = batchVorbereiten(s, [{ name: "a", werte: { wert: 1 } }]);
    expect(ohne).toEqual({ ok: false, fehler: [expect.stringContaining("Zeile 1 («a»): Markenprofil fehlt")] });
    expect(batchVorbereiten(s, [{ name: "a", werte: { wert: 1 } }], { ohneMarke: true }).ok).toBe(true);
  });

  it("leere Zeilenliste ist ein Fehler", () => {
    expect(batchVorbereiten(s, [])).toEqual({ ok: false, fehler: ["Keine Zeilen"] });
  });
});
