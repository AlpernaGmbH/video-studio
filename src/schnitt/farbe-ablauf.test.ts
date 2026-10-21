import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Markenprofil } from "../core/schemas";
import type { Farbmessung, Farburteil } from "./farbe";
import { bestimmeFarbe, findeLuts, LUT_DATEIEN, lutOrdner, schreibeLuts } from "./farbe-ablauf";
import { leseCube } from "./lut";
import { leseSchnittplan } from "./plan";

const alperna = Markenprofil.parse(JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "..", "..", "marken", "alperna.json"), "utf8")));
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
