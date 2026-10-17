import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ladeStand, leererStand, speichereStand, StandFehler, type Stand } from "./stand";

let dir: string;
let datei: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-stand-"));
  datei = path.join(dir, "daten", "inhalte-stand.json");
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const beispiel = (): Stand => ({
  version: 0,
  inhalte: { "c-0001": { status: "Pitch bereit", torI: { entscheid: "offen", von: "", am: "" }, torP: { entscheid: "offen", von: "", am: "" }, seit: "2026-10-17T09:00:00Z" } },
  pruefungen: { "c-0001": { bestanden: true, am: "2026-10-17T09:00:00Z" } },
});

describe("Stand", () => {
  it("ohne Datei: leerer Stand in Version 0", () => {
    expect(ladeStand(datei)).toEqual(leererStand());
  });

  it("speichert, legt den Ordner an und liest dasselbe wieder", () => {
    const neu = speichereStand(datei, beispiel());
    expect(neu.version).toBe(1);
    expect(ladeStand(datei)).toEqual({ ...beispiel(), version: 1 });
  });

  it("verweigert veraltetes Schreiben", () => {
    const v1 = speichereStand(datei, beispiel());
    speichereStand(datei, v1);
    expect(() => speichereStand(datei, v1)).toThrow(/inzwischen geändert/);
  });

  it("schreibt atomar: keine temporäre Datei bleibt liegen", () => {
    speichereStand(datei, beispiel());
    expect(fs.readdirSync(path.dirname(datei))).toEqual(["inhalte-stand.json"]);
  });

  it("kaputtes JSON und falsches Schema sind ein klarer Fehler, kein stiller leerer Stand", () => {
    fs.mkdirSync(path.dirname(datei), { recursive: true });
    fs.writeFileSync(datei, "{kaputt");
    expect(() => ladeStand(datei)).toThrow(StandFehler);
    fs.writeFileSync(datei, JSON.stringify({ schema: 1, version: 1, inhalte: { "c-0001": { status: "Erfunden" } }, pruefungen: {} }));
    expect(() => ladeStand(datei)).toThrow(/Stand-Schema/);
  });
});
