import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Markenprofil } from "../core/schemas";
import type { Farbmessung, Farburteil } from "./farbe";
import { belichtungsHinweis, bestimmeFarbe, findeLuts, LUT_DATEIEN, lutOrdner, schreibeLuts } from "./farbe-ablauf";
import { vlogZuRec709, linearZuVlog } from "./vlog";
import { leseCube, wendeCubeAn } from "./lut";
import { leseSchnittplan } from "./plan";

const echt = Markenprofil.parse(JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "..", "..", "marken", "alperna.json"), "utf8")));
/** Die Marke mit der Näherung aus Zahlen (generisches Log). Das echte Profil nimmt V-Log; dafür gibt es den eigenen Abschnitt unten. */
const alperna = Markenprofil.parse({ ...echt, farbe: { ...echt.farbe, logProfil: "generisch" } });
const messung = (x: Partial<Farbmessung> = {}): Farbmessung => ({ saettigung: 0.03, yLow: 0.25, yHigh: 0.55, bilder: 5, ...x });
const urteil = (farbe: "log" | "rec709", sicher = false): Farburteil => ({ farbe, sicher, grund: "Grund" });

describe("bestimmeFarbe", () => {
  const videos = [{ id: "a", datei: "/m/a.mov", dauer: 10 }, { id: "b", datei: "/m/b.mov", dauer: 10 }];

  it("übernimmt das Urteil je Video, merkt die Messung und meldet unsichere Urteile mit dem Weg zur Änderung", async () => {
    const r = await bestimmeFarbe({ videos, erkenne: async (d) => (d.includes("a.mov") ? { urteil: urteil("log"), messung: messung() } : { urteil: urteil("rec709", true), messung: messung({ saettigung: 0.3 }) }) });
    expect(r.farbart.get("a")).toBe("log");
    expect(r.farbart.get("b")).toBe("rec709");
    expect(r.messungen.get("a")!.saettigung).toBe(0.03);
    expect(r.meldungen[0]).toContain("sieht nach Log (flach) aus, unsicher");
    expect(r.meldungen[0]).toContain("--farbe rec709");
    expect(r.meldungen[1]).toBe("Farbe: b: normal (Rec. 709). Grund");
  });

  it("von Hand gesetzt gilt für alle und wird bei Log trotzdem gemessen (für den Weisspunkt), bei normal nicht", async () => {
    const gemessen: string[] = [];
    const erkenne = async (d: string) => (gemessen.push(d), { urteil: urteil("rec709", true), messung: messung() });
    const log = await bestimmeFarbe({ videos, vorgabe: "log", erkenne });
    expect([...log.farbart]).toEqual([["a", "log"], ["b", "log"]]);
    expect(log.messungen.size).toBe(2);
    expect(log.meldungen[0]).toContain("von Hand, --farbe");
    gemessen.length = 0;
    const normal = await bestimmeFarbe({ videos, vorgabe: "rec709", erkenne });
    expect([...normal.farbart]).toEqual([["a", "rec709"], ["b", "rec709"]]);
    expect(gemessen).toEqual([]);
  });

  it("ein Video, das sich nicht messen lässt, wird gemeldet und bleibt ohne Farbart (kein Abbruch)", async () => {
    const r = await bestimmeFarbe({
      videos,
      erkenne: async (d) => {
        if (d.includes("a.mov")) throw new Error("kaputt");
        return undefined;
      },
    });
    expect(r.farbart.size).toBe(0);
    expect(r.meldungen).toEqual(["Farbe: a: nicht gemessen (kaputt)", "Farbe: b: nicht gemessen (keine Bilder lesbar)"]);
  });
});

describe("schreibeLuts", () => {
  let dir: string;
  beforeEach(() => void (dir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-lut-"))));
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
  const quellen = (...farben: ("log" | "rec709" | undefined)[]) =>
    leseSchnittplan({
      version: 1,
      projekt: { name: "T", marke: "alperna" },
      quellen: farben.map((f, i) => ({ id: `q${i + 1}`, pfad: `rohmaterial/q${i + 1}.mov`, art: "video", dauer: 10, fps: 25, breite: 1080, hoehe: 1920, ...(f ? { farbe: f } : {}) })),
      clips: [{ id: "c1", quelle: "q1", von: 0, bis: 1 }],
    }).quellen;
  const ms = (...ids: string[]) => new Map(ids.map((i) => [i, messung()]));

  it("Log-Material bekommt die LUT «log» mit gemessenem Schwarz- und Weisspunkt, normales Material die LUT «angleich»", () => {
    const r = schreibeLuts({ ergebnis: dir, marke: alperna, quellen: quellen("log", "rec709"), messungen: ms("q1") });
    expect(Object.keys(r.pfade).sort()).toEqual(["angleich", "log"]);
    expect(path.basename(r.pfade.log!)).toBe(LUT_DATEIEN.log);
    const log = leseCube(fs.readFileSync(r.pfade.log!, "utf8"));
    expect(log.groesse).toBe(33);
    // gemessen 0,25 bis 0,55: Das 10. Perzentil wird etwa 0,12 hell (nach Gamma und Kontrast, daher nur eine Spanne): Der Wert 0,25 ist dunkel, 0,55 hell
    const grau = (v: number) => log.werte[Math.round(v * 32) * (1 + 33 + 33 * 33)]!;
    expect(grau(0.25).g).toBeLessThan(0.2);
    expect(grau(0.55).g).toBeGreaterThan(0.7);
    expect(r.meldungen.join("\n")).toMatch(/farbe-log\.cube für q1 \(Schwarzpunkt 0,\d\d, Weisspunkt 0,\d\d, am Material gemessen\)/);
    expect(r.meldungen.join("\n")).toContain("farbe-angleich.cube für normales Material und B-Roll");
  });

  it("ohne Log-Quelle gibt es keine LUT «log», und eine alte aus einem früheren Lauf wird gelöscht", () => {
    schreibeLuts({ ergebnis: dir, marke: alperna, quellen: quellen("log"), messungen: ms("q1") });
    expect(fs.existsSync(path.join(lutOrdner(dir), LUT_DATEIEN.log))).toBe(true);
    const r = schreibeLuts({ ergebnis: dir, marke: alperna, quellen: quellen("rec709"), messungen: ms("q1") });
    expect(r.pfade.log).toBeUndefined();
    expect(fs.existsSync(path.join(lutOrdner(dir), LUT_DATEIEN.log))).toBe(false);
    expect(findeLuts(dir)).toEqual({ angleich: path.join(lutOrdner(dir), LUT_DATEIEN.angleich) });
  });

  it("feste Punkte der Marke gelten vor der Messung", () => {
    const marke = Markenprofil.parse({ ...alperna, farbe: { log: { schwarz: 0.1, weiss: 0.7, gamma: 1, kontrast: 0, saettigung: 1, kuehle: 0 } } });
    const r = schreibeLuts({ ergebnis: dir, marke, quellen: quellen("log"), messungen: ms("q1") });
    expect(r.meldungen.join("\n")).toContain("Schwarzpunkt 0,10, Weisspunkt 0,70)");
    const cube = leseCube(fs.readFileSync(r.pfade.log!, "utf8"));
    // Identisch bis auf die Punkte: 0,1 wird 0, 0,7 wird 1
    expect(cube.werte[Math.round(0.1 * 32) * (1 + 33 + 33 * 33)]!.g).toBeCloseTo(0, 1);
    expect(cube.werte[Math.round(0.7 * 32) * (1 + 33 + 33 * 33)]!.g).toBeCloseTo(0.98, 1);
  });

  it("ohne Messung gilt der volle Bereich und die Meldung sagt es", () => {
    const r = schreibeLuts({ ergebnis: dir, marke: alperna, quellen: quellen("log"), messungen: new Map() });
    expect(r.meldungen.join("\n")).toContain("keine Messung: voller Bereich");
  });

  it("ein Markenprofil ohne Look schreibt keine LUT und sagt, warum", () => {
    const marke = Markenprofil.parse({ ...alperna, farbe: undefined });
    const r = schreibeLuts({ ergebnis: dir, marke, quellen: quellen("log"), messungen: ms("q1") });
    expect(r.pfade).toEqual({});
    expect(r.meldungen[0]).toContain("keinen Look in Zahlen");
    expect(findeLuts(dir)).toEqual({});
  });

  it("Log-Material, aber die Marke kennt nur den Angleich: Hinweis, keine LUT «log»", () => {
    const marke = Markenprofil.parse({ ...alperna, farbe: { angleich: alperna.farbe!.angleich } });
    const r = schreibeLuts({ ergebnis: dir, marke, quellen: quellen("log"), messungen: ms("q1") });
    expect(r.pfade.log).toBeUndefined();
    expect(r.meldungen.join("\n")).toContain("hat keinen Look «log»");
  });
});

describe("V-Log (Marke mit logProfil «vlog»)", () => {
  let dir: string;
  beforeEach(() => void (dir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-vlog-"))));
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
  const quellen = (...farben: ("log" | "rec709" | undefined)[]) =>
    leseSchnittplan({
      version: 1,
      projekt: { name: "T", marke: "alperna" },
      quellen: farben.map((f, i) => ({ id: `q${i + 1}`, pfad: `rohmaterial/q${i + 1}.mov`, art: "video", dauer: 10, fps: 25, breite: 1080, hoehe: 1920, ...(f ? { farbe: f } : {}) })),
      clips: [{ id: "c1", quelle: "q1", von: 0, bis: 1 }],
    }).quellen;
  const lut = (r: ReturnType<typeof schreibeLuts>) => leseCube(fs.readFileSync(r.pfade.log!, "utf8"));

  it("das echte Markenprofil geht von V-Log aus und hat einen Look darüber (Entwurf)", () => {
    expect(echt.farbe?.logProfil).toBe("vlog");
    expect(echt.farbe?.vlog).toMatchObject({ gamma: 1, kontrast: 0.3 });
  }, 60_000);

  it("die LUT «log» ist die Umrechnung des Herstellers mit 65 Punkten, nicht die Näherung aus Zahlen", () => {
    const r = schreibeLuts({ ergebnis: dir, marke: echt, quellen: quellen("log", "rec709"), messungen: new Map() });
    const cube = lut(r);
    expect(cube.groesse).toBe(65);
    // 18 % Grau (V-Log-Code 433) landet bei der Rec.-709-Mitte (0,409) mit dem Look darüber: nahe, aber der Look verschiebt es leicht
    const mitte = wendeCubeAn(cube, { r: linearZuVlog(0.18), g: linearZuVlog(0.18), b: linearZuVlog(0.18) });
    expect(mitte.g).toBeGreaterThan(0.3);
    expect(mitte.g).toBeLessThan(0.45);
    // und genau die Kette: Umrechnung, dann Look (keine Messung der Pegel: Schwarz- und Weisspunkt bleiben 0 und 1)
    const code = { r: 0.5, g: 0.5, b: 0.5 };
    const basis = vlogZuRec709(code);
    expect(wendeCubeAn(cube, code).g).not.toBeCloseTo(basis.g, 3); // der Look wirkt
    expect(r.meldungen.join("\n")).toContain("V-Log nach Rec. 709, Umrechnung von Panasonic, Belichtung +0,0 Blenden, mit dem Look der Marke darüber) für q1");
    expect(Object.keys(r.pfade).sort()).toEqual(["angleich", "log"]);
  }, 60_000);

  it("die LUT «log» wird bei V-Log immer geschrieben, auch wenn noch kein Clip Log ist (B-Roll aus der Kamera kommt später)", () => {
    const r = schreibeLuts({ ergebnis: dir, marke: echt, quellen: quellen("rec709"), messungen: new Map() });
    expect(r.pfade.log).toBeDefined();
    expect(r.meldungen.join("\n")).toContain("Log-Material, das noch dazukommt");
  }, 60_000);

  it("die Belichtung hellt die LUT auf: aus der Marke, überschrieben vom Aufruf", () => {
    const hell = (o: { belichtung?: number; marke?: typeof echt }) => wendeCubeAn(lut(schreibeLuts({ ergebnis: dir, marke: o.marke ?? echt, quellen: quellen("log"), messungen: new Map(), ...(o.belichtung !== undefined ? { belichtung: o.belichtung } : {}) })), { r: 0.42, g: 0.42, b: 0.42 }).g;
    const basis = hell({});
    expect(hell({ belichtung: 1 })).toBeGreaterThan(basis + 0.05);
    expect(hell({ belichtung: -1 })).toBeLessThan(basis - 0.05);
    const markeMit = Markenprofil.parse({ ...echt, farbe: { ...echt.farbe, belichtung: 1 } });
    expect(hell({ marke: markeMit })).toBeCloseTo(hell({ belichtung: 1 }), 6);
    expect(hell({ marke: markeMit, belichtung: 0 })).toBeCloseTo(basis, 6);
  }, 60_000);

  it("ohne Look der Marke bleibt es bei der reinen Umrechnung, und das steht in der Meldung", () => {
    const marke = Markenprofil.parse({ ...echt, farbe: { logProfil: "vlog" } });
    const r = schreibeLuts({ ergebnis: dir, marke, quellen: quellen("log"), messungen: new Map() });
    expect(r.meldungen.join("\n")).toContain("ohne Look der Marke, nur die Umrechnung");
    const c = { r: 0.42, g: 0.42, b: 0.42 };
    expect(wendeCubeAn(lut(r), c).g).toBeCloseTo(vlogZuRec709(c).g, 2);
    // keine Marke mit «farbe» und kein Profil: weiter keine LUT
    expect(schreibeLuts({ ergebnis: dir, marke: Markenprofil.parse({ ...echt, farbe: undefined }), quellen: quellen("log"), messungen: new Map() }).pfade).toEqual({});
  }, 60_000);

  it("das Profil lässt sich je Inhalt überstimmen: «generisch» schreibt die Näherung aus Zahlen, «vlog» die Umrechnung für eine Marke ohne Profil", () => {
    const generisch = schreibeLuts({ ergebnis: dir, marke: echt, quellen: quellen("log"), messungen: new Map(), profil: "generisch" });
    expect(lut(generisch).groesse).toBe(33);
    const ohneProfil = Markenprofil.parse({ ...echt, farbe: { log: echt.farbe!.log } });
    expect(lut(schreibeLuts({ ergebnis: dir, marke: ohneProfil, quellen: quellen("log"), messungen: new Map() })).groesse).toBe(33);
    expect(lut(schreibeLuts({ ergebnis: dir, marke: ohneProfil, quellen: quellen("log"), messungen: new Map(), profil: "vlog" })).groesse).toBe(65);
  }, 60_000);
});

describe("bestimmeFarbe mit V-Log: Hinweise zu Datenbereich und Belichtung", () => {
  const videos = [{ id: "a", datei: "/m/a.mov", dauer: 10 }];
  const log = (m: Partial<Farbmessung>) => async () => ({ urteil: urteil("log", true), messung: messung(m) });

  it("meldet bei Log-Material den dunkelsten Pixel und die Belichtung, mit Profil «vlog»", async () => {
    const r = await bestimmeFarbe({ videos, profil: "vlog", erkenne: log({ yMinCode: 131, yMittelCode: 433, bereichEtikett: "voll" }) });
    const text = r.meldungen.join("\n");
    expect(text).toContain("dunkelster Pixel bei Code 131 (10 Bit)");
    expect(text).toContain("mittlere Helligkeit genau bei 18 % Grau (Bereich voll)");
  });

  it("ohne Profil oder bei normalem Material gibt es diese Hinweise nicht", async () => {
    const ohne = await bestimmeFarbe({ videos, erkenne: log({ yMinCode: 131, yMittelCode: 433 }) });
    expect(ohne.meldungen.join("\n")).not.toContain("dunkelster Pixel");
    const normal = await bestimmeFarbe({ videos, profil: "vlog", erkenne: async () => ({ urteil: urteil("rec709", true), messung: messung({ yMinCode: 131, yMittelCode: 433 }) }) });
    expect(normal.meldungen.join("\n")).not.toContain("dunkelster Pixel");
  });

  it("der Aufruf reicht das Profil an die Erkennung weiter und der von Hand gesetzte Bereich geht in die Hinweise ein", async () => {
    const gesehen: (string | undefined)[] = [];
    const r = await bestimmeFarbe({ videos, profil: "vlog", bereich: "begrenzt", erkenne: async (_d, _t, profil) => (gesehen.push(profil), { urteil: urteil("log", true), messung: messung({ yMinCode: 175, yMittelCode: 433 }) }) });
    expect(gesehen).toEqual(["vlog"]);
    expect(r.meldungen.join("\n")).toContain("von Hand «begrenzt»");
    // auch bei «--farbe log» von Hand bekommt der Mensch die Hinweise
    const hand = await bestimmeFarbe({ videos, profil: "vlog", vorgabe: "log", erkenne: log({ yMinCode: 131, yMittelCode: 433 }) });
    expect(hand.meldungen.join("\n")).toContain("dunkelster Pixel");
  });
});

describe("belichtungsHinweis", () => {
  it("rechnet die mittlere Helligkeit in Blenden zu 18 % Grau (V-Log-Code 433), mit Bereich", () => {
    expect(belichtungsHinweis({ yMittelCode: 433, bereichEtikett: "voll" })).toContain("genau bei 18 % Grau");
    const dunkel = belichtungsHinweis({ yMittelCode: Math.round(linearZuVlog(0.045) * 1023), bereichEtikett: "voll" })!; // zwei Blenden unter Grau
    expect(dunkel).toContain("2,0 Blenden unter 18 % Grau");
    expect(dunkel).toContain("--belichtung 2.0");
    const hell = belichtungsHinweis({ yMittelCode: Math.round(linearZuVlog(0.36) * 1023), bereichEtikett: "voll" })!;
    expect(hell).toContain("1,0 Blenden über 18 % Grau");
    expect(hell).toContain("--belichtung -1.0");
  });

  it("kleine Abweichungen bekommen keinen Vorschlag; der gewählte Bereich schlägt das Etikett; ohne Messung kein Hinweis", () => {
    expect(belichtungsHinweis({ yMittelCode: 450, bereichEtikett: "voll" })).not.toContain("--belichtung");
    const voll = belichtungsHinweis({ yMittelCode: 500, bereichEtikett: "begrenzt" }, "voll")!;
    const begrenzt = belichtungsHinweis({ yMittelCode: 500, bereichEtikett: "voll" }, "begrenzt")!;
    expect(voll).toContain("(Bereich voll)");
    expect(begrenzt).toContain("(Bereich begrenzt)");
    expect(belichtungsHinweis({})).toBeUndefined();
    expect(belichtungsHinweis({ yMittelCode: 10, bereichEtikett: "voll" })).toBeUndefined(); // unter Schwarz: keine Zahl, die nichts bedeutet
  });

  it("bleibt eine Anregung, keine Automatik: Der Text sagt, dass helle oder dunkle Flächen den Mittelwert verschieben", () => {
    expect(belichtungsHinweis({ yMittelCode: 300, bereichEtikett: "voll" })).toContain("Nur ein Anhaltspunkt");
  });
});
