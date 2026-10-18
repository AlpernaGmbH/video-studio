import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { schreibeFcpxml } from "./fcpxml";
import { schreibeOtio } from "./otio";
import { beispielPlan, testLoeser } from "./testdaten";

/**
 * Gegenproben mit fremden Werkzeugen. Sie laufen nur, wenn das Werkzeug da ist, und sind damit kein Teil von `npm run check` auf jedem Rechner:
 *
 *   STUDIO_FCPXML_DTD=/pfad/FCPXMLv1_8.dtd   (Apples DTD, Urheberrecht Apple: nicht ins Repo legen) und `xmllint`
 *   STUDIO_OTIO_PYTHON=/pfad/python          (Python mit `OpenTimelineIO`)
 *
 * Der Ablauf steht in docs/plan/editing-blueprint.md. Am 18.10.2026 liefen beide ohne Fehler (siehe STATUS.md).
 */

const dtd = process.env["STUDIO_FCPXML_DTD"];
const python = process.env["STUDIO_OTIO_PYTHON"];
const hatXmllint = spawnSync("xmllint", ["--version"], { encoding: "utf8" }).status !== null;

const tmp = (name: string, inhalt: string): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "schnitt-"));
  const datei = path.join(dir, name);
  fs.writeFileSync(datei, inhalt);
  return datei;
};

describe.skipIf(!dtd || !hatXmllint)("FCPXML gegen Apples DTD 1.8", () => {
  it("der Beispielplan ist gültig", () => {
    const datei = tmp("t.fcpxml", schreibeFcpxml(beispielPlan(), testLoeser));
    const r = spawnSync("xmllint", ["--noout", "--dtdvalid", dtd!, datei], { encoding: "utf8" });
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
  });

  it("ein Plan ohne B-Roll, Grafik und Musik ist gültig", () => {
    const datei = tmp("t.fcpxml", schreibeFcpxml(beispielPlan({ broll: [], overlays: [], musik: undefined }), testLoeser));
    const r = spawnSync("xmllint", ["--noout", "--dtdvalid", dtd!, datei], { encoding: "utf8" });
    expect(r.stderr).toBe("");
  });
});

describe.skipIf(!python)("OTIO gegen OpenTimelineIO", () => {
  const SKRIPT = `
import json, sys, opentimelineio as otio
t = otio.adapters.read_from_file(sys.argv[1], adapter_name="otio_json")
print(json.dumps({"dauer": t.duration().to_seconds(), "spuren": [[tr.name, tr.kind, [round(c.duration().to_seconds(), 3) for c in tr]] for tr in t.tracks]}))
`;
  it("liest die Datei und sieht dieselben Spuren und Längen", () => {
    const datei = tmp("t.otio", schreibeOtio(beispielPlan(), testLoeser));
    const r = spawnSync(python!, ["-I", "-c", SKRIPT, datei], { encoding: "utf8" });
    expect(r.stderr).toBe("");
    const erg = JSON.parse(r.stdout) as { dauer: number; spuren: [string, string, number[]][] };
    expect(erg.dauer).toBeCloseTo(5.44, 6);
    expect(erg.spuren.map((s) => s[0])).toEqual(["V1", "V2", "V3", "A1", "A2"]);
    expect(erg.spuren[0]![2]).toEqual([2.04, 1.8, 1.6]);
    expect(erg.spuren[1]![2]).toEqual([1.2, 1]);
    expect(erg.spuren[2]![2]).toEqual([2.6, 2]);
  });
});
