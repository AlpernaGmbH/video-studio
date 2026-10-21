import { describe, expect, it } from "vitest";
import { pruefeSchnittplan, REEL_MAX_SEKUNDEN, SPRECHTEMPO_MAX, verlangeGueltig } from "./pruefung";
import { beispielPlan } from "./testdaten";
import { Markenprofil, type KatalogEintrag } from "../core/schemas";
import { PlanFehler } from "./plan";
import fs from "node:fs";
import path from "node:path";

const alperna = Markenprofil.parse(JSON.parse(fs.readFileSync(path.join(__dirname, "../../marken/alperna.json"), "utf8")));
const profil = alperna.schnittprofil!;
const codes = (b: { code: string }[]) => b.map((x) => x.code);

describe("pruefeSchnittplan: Fehler", () => {
  it("der Beispielplan hat keinen Fehler", () => {
    expect(pruefeSchnittplan(beispielPlan()).filter((b) => b.stufe === "fehler")).toEqual([]);
  });

  it("ein Clip über das Ende der Quelle ist ein Fehler", () => {
    const b = pruefeSchnittplan(beispielPlan({ clips: [{ id: "k01", quelle: "sprache", von: 28, bis: 31 }] }));
    expect(codes(b)).toContain("clip-ueber-ende");
  });

  it("eine unbekannte Quelle ist ein Fehler und bricht die weitere Prüfung ab", () => {
    const b = pruefeSchnittplan(beispielPlan({ clips: [{ id: "k01", quelle: "fehlt", von: 0, bis: 1 }] }));
    expect(codes(b)).toEqual(["quelle-fehlt"]);
  });

  it("doppelte Clip-IDs sind ein Fehler", () => {
    const b = pruefeSchnittplan(beispielPlan({ clips: [{ id: "k01", quelle: "sprache", von: 0, bis: 1 }, { id: "k01", quelle: "sprache", von: 2, bis: 3 }] }));
    expect(codes(b)).toContain("doppelte-id");
  });

  it("B-Roll aus einer Audioquelle oder über das Ende der Quelle ist ein Fehler", () => {
    expect(codes(pruefeSchnittplan(beispielPlan({ broll: [{ quelle: "musik-1", katalog: "k-0001", t: 1, dauer: 1, begruendung: "Weil es passt" }] })))).toContain("quelle-art");
    expect(codes(pruefeSchnittplan(beispielPlan({ broll: [{ quelle: "empfang", katalog: "k-0142", t: 1, dauer: 5, von: 10, begruendung: "Empfang zeigen" }] })))).toContain("broll-ueber-ende");
  });

  it("Grafik oder B-Roll hinter dem Ende des Videos ist ein Fehler", () => {
    const b = pruefeSchnittplan(beispielPlan({ overlays: [{ datei: "renders/x.webm", effekt: "zahl-zaehler", t: 5, dauer: 3, begruendung: "Zahl hervorheben" }] }));
    expect(codes(b)).toContain("overlay-ueber-timeline");
  });

  it("eine MP4-Grafik hat keine Transparenz und wird abgelehnt, WebM und MOV sind erlaubt", () => {
    const mit = (datei: string) => pruefeSchnittplan(beispielPlan({ overlays: [{ datei, effekt: "zahl-zaehler", t: 1, dauer: 1, begruendung: "Zahl hervorheben" }] }));
    expect(codes(mit("renders/x.mp4"))).toContain("overlay-format");
    expect(codes(mit("renders/x.webm"))).not.toContain("overlay-format");
    expect(codes(mit("renders/x.mov"))).not.toContain("overlay-format");
  });

  it("mit Katalog: ein unbekannter Schlüssel und ein Sound als Bild sind Fehler (Regel 3)", () => {
    const katalog = [{ schluessel: "k-0142", art: "sound" }] as KatalogEintrag[];
    expect(codes(pruefeSchnittplan(beispielPlan(), { katalog }))).toContain("katalog-sound");
    expect(codes(pruefeSchnittplan(beispielPlan(), { katalog: [] }))).toContain("katalog-unbekannt");
  });

  it("verlangeGueltig wirft bei Fehlern, nicht bei Hinweisen", () => {
    expect(() => verlangeGueltig([{ stufe: "hinweis", code: "x", text: "y" }])).not.toThrow();
    expect(() => verlangeGueltig([{ stufe: "fehler", code: "x", text: "y" }])).toThrow(PlanFehler);
  });
});

describe("pruefeSchnittplan: Schnittprofil (Bauplan v2, 3.4)", () => {
  it("ein Video über 90 Sekunden ist zu lang für ein Reel", () => {
    const lang = beispielPlan({ clips: [{ id: "k01", quelle: "sprache", von: 0, bis: 30 }, { id: "k02", quelle: "sprache", von: 0, bis: 30 }, { id: "k03", quelle: "sprache", von: 0, bis: 30 }, { id: "k04", quelle: "sprache", von: 0, bis: 5 }] });
    expect(codes(pruefeSchnittplan(lang))).toContain("zu-lang");
    expect(REEL_MAX_SEKUNDEN).toBe(90);
  });

  it("Einstellung ohne Bildwechsel: bis zur Grenze des Profils erlaubt, darüber nicht", () => {
    const grenze = profil.laengsteEinstellung;
    const lang = beispielPlan({ clips: [{ id: "k01", quelle: "sprache", von: 0, bis: grenze + 2 }], broll: [], overlays: [], woerter: [] });
    expect(codes(pruefeSchnittplan(lang, { profil }))).toContain("einstellung-zu-lang");
    const ok = beispielPlan({ clips: [{ id: "k01", quelle: "sprache", von: 0, bis: grenze - 0.5 }], broll: [], overlays: [], woerter: [] });
    expect(codes(pruefeSchnittplan(ok, { profil }))).not.toContain("einstellung-zu-lang");
  });

  it("ein Zoom ist kein Bildwechsel: Teilstücke desselben Clips, die nahtlos weiterlaufen, beenden die Einstellung nicht", () => {
    const grenze = profil.laengsteEinstellung;
    // ein langer Take, in drei Stücke geteilt (Zoom auf dem mittleren): Quellzeit läuft ohne Sprung durch
    const dritt = (grenze + 2) / 3;
    const geteilt = beispielPlan({
      clips: [
        { id: "k01", quelle: "sprache", von: 0, bis: dritt },
        { id: "k02", quelle: "sprache", von: dritt, bis: 2 * dritt, zoom: 1.1 },
        { id: "k03", quelle: "sprache", von: 2 * dritt, bis: grenze + 2 },
      ],
      broll: [],
      overlays: [],
      woerter: [],
    });
    expect(codes(pruefeSchnittplan(geteilt, { profil }))).toContain("einstellung-zu-lang");
    // mit einem echten Sprung in der Quelle (Jump-Cut) ist es ein Bildwechsel
    const sprung = beispielPlan({
      clips: [
        { id: "k01", quelle: "sprache", von: 0, bis: dritt },
        { id: "k02", quelle: "sprache", von: dritt + 1, bis: 2 * dritt + 1 },
        { id: "k03", quelle: "sprache", von: 2 * dritt + 3, bis: grenze + 5 },
      ],
      broll: [],
      overlays: [],
      woerter: [],
    });
    expect(codes(pruefeSchnittplan(sprung, { profil }))).not.toContain("einstellung-zu-lang");
  });

  it("B-Roll und Grafik zählen als Bildwechsel", () => {
    const plan = beispielPlan({
      clips: [{ id: "k01", quelle: "sprache", von: 0, bis: 3 }],
      broll: [{ quelle: "empfang", katalog: "k-0142", t: 1.4, dauer: 0.5, begruendung: "Empfang zeigen" }],
      overlays: [],
      woerter: [],
    });
    // Schnitt bei 0, B-Roll von 1,4 bis 1,9, Ende bei 3: längste Spanne 1,4 s
    expect(codes(pruefeSchnittplan(plan, { profil }))).not.toContain("einstellung-zu-lang");
  });

  it("der Hook: das erste Wort muss in den ersten 2 Sekunden kommen", () => {
    const spaet = beispielPlan({
      clips: [{ id: "k01", quelle: "sprache", von: 0, bis: 1.5 }, { id: "k02", quelle: "sprache", von: 5, bis: 6.5 }],
      broll: [],
      overlays: [],
      woerter: [{ text: "Hallo", quelle: "sprache", von: 5.2, bis: 5.6 }],
    });
    // Wort liegt im zweiten Clip: Timeline-Zeit 1,5 + 0,2 = 1,7 s, das ist rechtzeitig
    expect(codes(pruefeSchnittplan(spaet, { profil }))).not.toContain("hook-zu-spaet");
    const sehrSpaet = beispielPlan({
      clips: [{ id: "k01", quelle: "sprache", von: 0, bis: 3 }],
      broll: [],
      overlays: [],
      woerter: [{ text: "Hallo", quelle: "sprache", von: 2.6, bis: 2.9 }],
    });
    expect(codes(pruefeSchnittplan(sehrSpaet, { profil }))).toContain("hook-zu-spaet");
  });

  it("Pausen zwischen Wörtern über 0,25 s werden gemeldet, auch über einen Schnitt hinweg", () => {
    const plan = beispielPlan({
      clips: [{ id: "k01", quelle: "sprache", von: 0, bis: 1 }, { id: "k02", quelle: "sprache", von: 5, bis: 6 }],
      broll: [],
      overlays: [],
      woerter: [
        { text: "eins", quelle: "sprache", von: 0.1, bis: 0.3 },
        { text: "zwei", quelle: "sprache", von: 0.4, bis: 0.6 },
        // Ende von «zwei» bei 0,6, nächstes Wort in der Timeline bei 1,0 + 0,5 = 1,5: Pause 0,9 s
        { text: "drei", quelle: "sprache", von: 5.5, bis: 5.8 },
      ],
    });
    const b = pruefeSchnittplan(plan, { profil });
    expect(b.filter((x) => x.code === "pause-zu-lang")).toHaveLength(1);
    expect(b.find((x) => x.code === "pause-zu-lang")!.text).toContain("drei");
  });

  it("Sprechtempo über 4,8 Wörter pro Sekunde wird gemeldet", () => {
    const woerter = Array.from({ length: 20 }, (_, i) => ({ text: `w${i}`, quelle: "sprache", von: i * 0.15, bis: i * 0.15 + 0.14 }));
    const plan = beispielPlan({ clips: [{ id: "k01", quelle: "sprache", von: 0, bis: 3 }], broll: [], overlays: [], woerter });
    expect(codes(pruefeSchnittplan(plan, { profil }))).toContain("sprechtempo");
    expect(SPRECHTEMPO_MAX).toBe(4.8);
  });

  it("ohne Profil gibt es nur die strukturellen Prüfungen", () => {
    const plan = beispielPlan({ clips: [{ id: "k01", quelle: "sprache", von: 0, bis: 9 }], broll: [], overlays: [], woerter: [] });
    expect(codes(pruefeSchnittplan(plan))).not.toContain("einstellung-zu-lang");
  });
});
