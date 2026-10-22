import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { speichereToolKonfig, toolDatei, type KonfigOrt, type Schluesselbund } from "./konfig";
import { keinMelder, type Melder } from "./melder";
import { ausgangsordner, beendeMelder, standardMelder, standardOrt } from "./standard";

const TOKEN = `vsd_3f8a1c2e-5b7d-4e90-8a11-0c2d4e6f8a10_${"a".repeat(43)}`;
let tmp: string;
beforeEach(() => void (tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vs-std-"))));
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const bund = (): Schluesselbund => {
  let t: string | undefined;
  return { vorhanden: () => t !== undefined, lies: () => t, schreibe: (x) => ((t = x), true), loesche: () => void (t = undefined) };
};

describe("standardOrt", () => {
  it("liegt neben config.json, also ausserhalb von OneDrive und Repo", () => {
    const o = standardOrt({ STUDIO_CONFIG: path.join(tmp, "x", "config.json") }, "/home/jemand");
    expect(o.dir).toBe(path.join(tmp, "x"));
    expect(ausgangsordner(o)).toBe(path.join(tmp, "x", "ausgang"));
    expect(standardOrt({}, "/home/jemand").dir).toBe("/home/jemand/.config/video-studio");
  });
  it("ohne STUDIO_CONFIG weist der Pfad nicht in den Studio-Ordner (STUDIO_HOME ändert nichts)", () => {
    expect(standardOrt({ STUDIO_HOME: "/OneDrive/Studio" }, "/home/j").dir).toBe("/home/j/.config/video-studio");
  });
});

describe("standardMelder", () => {
  const ort = (s: Schluesselbund = bund(), env: NodeJS.ProcessEnv = {}): KonfigOrt => ({ dir: path.join(tmp, "cfg"), env, schluessel: s });

  it("ohne eingerichtete Verbindung tut er nichts", () => {
    expect(standardMelder(ort())).toBe(keinMelder);
  });

  it("mit Verbindung ist er ein echter Melder, der in den Korb neben tool.json schreibt", () => {
    const o = ort();
    speichereToolKonfig(o, "http://127.0.0.1:1", TOKEN);
    const m = standardMelder(o);
    expect(m).not.toBe(keinMelder);
    expect(m.stand().verbunden).toBe(true);
    m.melde({ step: "a", state: "info" });
    expect(fs.readdirSync(path.join(tmp, "cfg", "ausgang")).filter((n) => n.endsWith(".json")).length).toBeGreaterThanOrEqual(1);
  });

  it("mit den Umgebungsvariablen (Cloud-Sitzung) braucht er keine Datei", () => {
    const m = standardMelder(ort(bund(), { STUDIO_TOOL_URL: "http://127.0.0.1:1", STUDIO_TOOL_TOKEN: TOKEN }));
    expect(m.stand().verbunden).toBe(true);
    expect(fs.existsSync(toolDatei(ort()))).toBe(false);
  });

  it("jeder Fehler beim Lesen der Einstellungen ergibt einen Melder, der nichts tut, nie einen Absturz", () => {
    const o = ort();
    speichereToolKonfig(o, "http://127.0.0.1:1", TOKEN);
    const kaputt: Schluesselbund = { ...bund(), lies: () => { throw new Error("Schlüsselbund gesperrt"); } };
    // Token liegt im Schlüsselbund (nicht in der Datei): Das Lesen wirft
    expect(standardMelder({ ...o, schluessel: kaputt })).toBe(keinMelder);
  });
});

describe("beendeMelder", () => {
  const melder = (o: Partial<Melder>): Melder => ({ ...keinMelder, ...o });

  it("wartet höchstens die genannte Zeit und gibt einen Hinweis genau einmal aus", async () => {
    const meldungen: string[] = [];
    let gewartet = -1;
    let hinweise = ["Token abgelehnt"];
    const m = melder({ leeren: async (ms) => void (gewartet = ms), hinweis: () => hinweise.shift() });
    await beendeMelder(m, 1500, (t) => meldungen.push(t));
    await beendeMelder(m, 1500, (t) => meldungen.push(t));
    expect(gewartet).toBe(1500);
    expect(meldungen).toEqual(["Token abgelehnt"]);
  });

  it("wirft nie, auch wenn der Melder selbst kaputt ist", async () => {
    await expect(
      beendeMelder(melder({ leeren: async () => { throw new Error("kaputt"); } }), 10, () => { throw new Error("auch kaputt"); }),
    ).resolves.toBeUndefined();
    await expect(beendeMelder(melder({ hinweis: () => { throw new Error("kaputt"); } }), 10)).resolves.toBeUndefined();
  });

  it("der Standardwert ist 1,5 Sekunden", async () => {
    let ms = 0;
    await beendeMelder(melder({ leeren: async (x) => void (ms = x) }));
    expect(ms).toBe(1500);
  });
});
