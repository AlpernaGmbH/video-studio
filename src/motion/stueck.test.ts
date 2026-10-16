import { describe, expect, it } from "vitest";
import { MARKEN_VARIABLEN, Stueck, erzeugeDeklaration, loeseVariablen, markeZuVariablen, pruefeWert } from "./stueck";
import { marke, stueckVerlauf, stueckZahl } from "../testing/fixtures";

const rohZahl = () => JSON.parse(JSON.stringify(stueckZahl())) as Record<string, unknown>;

describe("Stueck (Datenblatt)", () => {
  it("nimmt ein vollständiges Datenblatt an", () => {
    expect(stueckZahl().id).toBe("zahl-zaehler");
  });

  it("verlangt min ≤ standard ≤ max bei der Dauer", () => {
    expect(Stueck.safeParse({ ...rohZahl(), dauer: { standard: 6, min: 1, max: 5 } }).success).toBe(false);
  });

  it("verbietet reservierte und doppelte Parameter-IDs", () => {
    const p = (id: string) => ({ id, typ: "string", label: "x", beschreibung: "irgendein Text" });
    expect(Stueck.safeParse({ ...rohZahl(), parameter: [p("markeBg")] }).success).toBe(false);
    expect(Stueck.safeParse({ ...rohZahl(), parameter: [p("dauer")] }).success).toBe(false);
    expect(Stueck.safeParse({ ...rohZahl(), ausloeser: { typen: ["vergleich"], beschreibung: "Zwei Dinge gegenüber." }, parameter: [p("titel"), p("titel")] }).success).toBe(false);
  });

  it("ein Stück darf nur Signale versprechen, die es mit Parametern zeigen kann", () => {
    const ohneReihe = Stueck.safeParse({ ...rohZahl(), ausloeser: { typen: ["verlauf"], beschreibung: "Ein Verlauf über Messungen." } });
    expect(ohneReihe.success).toBe(false);
    if (!ohneReihe.success) expect(ohneReihe.error.issues[0]?.message).toContain("zahlenreihe");
    expect(Stueck.safeParse({ ...rohZahl(), ausloeser: { typen: ["aufzaehlung"], beschreibung: "Eine Aufzählung von Punkten." } }).success).toBe(false);
  });

  it("Defaults müssen zur Definition passen", () => {
    const e = Stueck.safeParse({ ...rohZahl(), parameter: [{ id: "wert", typ: "number", label: "W", beschreibung: "Der Wert", min: 0, max: 10, default: 99 }] });
    expect(e.success).toBe(false);
    const o = Stueck.safeParse({ ...rohZahl(), parameter: [{ id: "position", typ: "enum", label: "P", beschreibung: "Die Position", optionen: [{ wert: "a", label: "A" }, { wert: "b", label: "B" }], default: "c" }] });
    expect(o.success).toBe(false);
  });

  it("ab «geprueft» braucht es Einsatzangaben, «aktiv» braucht eine Freigabe", () => {
    expect(Stueck.safeParse({ ...rohZahl(), status: "geprueft", einsatz: undefined, freigabe: undefined }).success).toBe(false);
    expect(Stueck.safeParse({ ...rohZahl(), status: "gebaut", einsatz: undefined, freigabe: undefined }).success).toBe(true);
    expect(Stueck.safeParse({ ...rohZahl(), status: "aktiv", freigabe: undefined }).success).toBe(false);
  });

  it("Overlay und Basisvideo schliessen sich aus, Komposition verlangt es", () => {
    expect(Stueck.safeParse({ ...rohZahl(), braucht: ["basisvideo"] }).success).toBe(false);
    expect(Stueck.safeParse({ ...rohZahl(), ausgabe: "komposition", braucht: ["nichts"] }).success).toBe(false);
    expect(Stueck.safeParse({ ...rohZahl(), ausgabe: "komposition", braucht: ["basisvideo"] }).success).toBe(true);
  });
});

describe("pruefeWert", () => {
  const reihe = stueckVerlauf().parameter[0]!;
  it("prüft Zahlenreihen auf Anzahl, Typ und Bereich", () => {
    expect(pruefeWert(reihe, [97, 80, 60])).toBeNull();
    expect(pruefeWert(reihe, [97])).toContain("hat 1 Werte");
    expect(pruefeWert(reihe, [1, 2, 3, 4, 5, 6, 7, 8, 9])).toContain("hat 9 Werte");
    expect(pruefeWert(reihe, [97, "x"])).toContain("Liste von Zahlen");
    expect(pruefeWert(reihe, [97, 120])).toContain("über 100");
    expect(pruefeWert(reihe, [97, NaN])).toContain("Liste von Zahlen");
  });
  it("prüft Texte auf Länge", () => {
    const suffix = stueckZahl().parameter[1]!;
    expect(pruefeWert(suffix, " von 10")).toBeNull();
    expect(pruefeWert(suffix, "x".repeat(11))).toContain("11 Zeichen");
    expect(pruefeWert(suffix, 5)).toContain("Text");
  });
});

describe("loeseVariablen", () => {
  it("löst Beispiel A1 auf: Parameter, Dauer und Marken-Variablen", () => {
    const r = loeseVariablen(stueckZahl(), { wert: 7, suffix: " von 10" }, { dauer: 2.6, marke: marke() });
    expect(r).toMatchObject({ ok: true, dauer: 2.6 });
    if (r.ok) {
      expect(r.variablen).toMatchObject({ wert: 7, suffix: " von 10", position: "mitte", dauer: 2.6, markeBg: "#FFFFFF", markeFontTitel: "Poppins", markeRadius: 24, markeTempo: 1 });
    }
  });

  it("kodiert Zahlenreihen als JSON-Text (HyperFrames kennt keine Listen)", () => {
    const r = loeseVariablen(stueckVerlauf(), { werte: [97, 88, 75, 70, 60] }, { marke: marke() });
    expect(r.ok && r.variablen["werte"]).toBe("[97,88,75,70,60]");
  });

  it("ein vergessener Pflichtparameter fällt nicht auf den Vorschauwert zurück", () => {
    const r = loeseVariablen(stueckZahl(), {}, { ohneMarke: true });
    expect(r).toEqual({ ok: false, fehler: ["Pflichtparameter «wert» fehlt"] });
  });

  it("lehnt unbekannte Schlüssel, Marken-Variablen und «dauer» in params ab", () => {
    const r = loeseVariablen(stueckZahl(), { wert: 1, farbe: "rot", markeBg: "#000000", dauer: 3 }, { ohneMarke: true });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fehler).toEqual(
        expect.arrayContaining([expect.stringContaining("«farbe»"), expect.stringContaining("«markeBg» kommt aus dem Markenprofil"), expect.stringContaining("«dauer» steht im Overlay")]),
      );
    }
  });

  it("verlangt eine Marke, wenn das Stück Marken-Variablen nutzt, ausser im Selbsttest", () => {
    const ohne = loeseVariablen(stueckZahl(), { wert: 1 }, {});
    expect(ohne.ok).toBe(false);
    expect(loeseVariablen(stueckZahl(), { wert: 1 }, { ohneMarke: true }).ok).toBe(true);
  });

  it("prüft die Dauer gegen den erlaubten Bereich", () => {
    const r = loeseVariablen(stueckZahl(), { wert: 1 }, { dauer: 0.5, ohneMarke: true });
    expect(r.ok).toBe(false);
  });

  it("nimmt die Standarddauer, wenn keine verlangt ist", () => {
    const r = loeseVariablen(stueckZahl(), { wert: 1 }, { ohneMarke: true });
    expect(r.ok && r.dauer).toBe(2.6);
  });
});

describe("erzeugeDeklaration", () => {
  const d = erzeugeDeklaration(stueckZahl());
  it("beginnt mit «dauer» und enthält Parameter und Marken-Variablen", () => {
    expect(d[0]).toMatchObject({ id: "dauer", type: "number", default: 2.6, role: "timing" });
    expect(d.map((v) => v.id)).toEqual(["dauer", "wert", "suffix", "position", "markeBg", "markeText", "markeAkzent1", "markeFontTitel", "markeFontText", "markeRadius", "markeTempo"]);
  });
  it("bildet Enums mit Optionen und Rollen ab", () => {
    expect(d.find((v) => v.id === "position")).toMatchObject({ type: "enum", options: [{ value: "mitte", label: "Mitte" }, { value: "oben", label: "Oben" }] });
    expect(d.find((v) => v.id === "wert")).toMatchObject({ type: "number", role: "content", default: 7 });
  });
  it("kodiert Listen-Defaults als JSON-Text und ergänzt die Beschreibung", () => {
    const v = erzeugeDeklaration(stueckVerlauf()).find((x) => x.id === "werte");
    expect(v).toMatchObject({ type: "string", default: "[97,80,60]" });
    expect(v?.description).toContain("JSON-Liste");
  });
  it("Marken-Variablen tragen den passenden HyperFrames-Typ", () => {
    expect(d.find((v) => v.id === "markeFontTitel")).toMatchObject({ type: "font", default: "Poppins" });
    expect(d.find((v) => v.id === "markeBg")).toMatchObject({ type: "color" });
    expect(d.find((v) => v.id === "markeRadius")).toMatchObject({ type: "number" });
  });
});

describe("markeZuVariablen", () => {
  it("deckt alle Marken-Variablen ab", () => {
    expect(Object.keys(markeZuVariablen(marke())).sort()).toEqual(Object.keys(MARKEN_VARIABLEN).sort());
  });
});
