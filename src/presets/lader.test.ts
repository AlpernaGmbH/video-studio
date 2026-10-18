import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ladeBibliothek } from "../motion/bibliothek";
import { findePreset, ladePresets, lintGrafikPresets } from "./lader";

const wurzel = path.resolve(__dirname, "../../presets");
const stuecke = ladeBibliothek(path.resolve(__dirname, "../../library/motion")).stuecke.map((g) => g.stueck);

function tmpPresets(dateien: Record<string, unknown>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "presets-"));
  for (const [rel, inhalt] of Object.entries(dateien)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), typeof inhalt === "string" ? inhalt : JSON.stringify(inhalt));
  }
  return dir;
}

describe("Preset-Bibliothek des Repos", () => {
  const lib = ladePresets(wurzel);

  it("lädt ohne Fehler, jeder Dateiname trägt die ID", () => {
    expect(lib.befunde).toEqual([]);
  });

  it("enthält von jeder Art mindestens ein Preset", () => {
    expect(lib.export.length).toBeGreaterThan(0);
    expect(lib.audio.length).toBeGreaterThan(0);
    expect(lib.untertitel.length).toBeGreaterThan(0);
    expect(lib.grafik.length).toBeGreaterThan(0);
  });

  it("das Reel-Preset folgt Bauplan v2, Kap. 3.11 (1080×1920, 25p, 8 bis 10 Mbit/s, AAC 48 kHz, 3 bis 90 s)", () => {
    const r = findePreset(lib, "export", "reel");
    expect(r).toMatchObject({ breite: 1080, hoehe: 1920, fps: 25, videoCodec: "h264", bitrateMbit: { min: 8, max: 10 }, audioRate: 48000, minSekunden: 3, maxSekunden: 90 });
  });

  it("die Blueprint-Werte sind ein eigenes Preset und als unbelegt gekennzeichnet", () => {
    const b = findePreset(lib, "export", "reel-blueprint");
    expect(b.herkunft.stand).toBe("unbelegt");
    expect(findePreset(lib, "audio", "blueprint").herkunft.stand).toBe("unbelegt");
  });

  it("kein Preset gibt sich als entschieden aus, wenn seine Quelle eine Vermutung ist: Audio und Export sind Annahmen oder unbelegt", () => {
    for (const p of [...lib.export, ...lib.audio]) expect(p.herkunft.stand, p.id).not.toBe("entschieden");
  });

  it("Grafik-Presets mit Stück passen zum Datenblatt, ohne Fehler", () => {
    const b = lintGrafikPresets(lib.grafik, stuecke);
    expect(b.filter((x) => x.stufe === "fehler")).toEqual([]);
  });

  it("Grafik-Presets ohne Stück stehen als Lücke in der Liste (Hook-Karte, Lower Third, Keyword-Pop, Schlusskarte, Logo)", () => {
    const luecken = lintGrafikPresets(lib.grafik, stuecke).filter((x) => x.code === "ohne-stueck").map((x) => x.preset).sort();
    expect(luecken).toEqual(["hook-karte", "keyword-pop", "logo-ecke", "lower-third", "schlusskarte"]);
  });

  it("findePreset nennt die vorhandenen IDs, wenn eines fehlt", () => {
    expect(() => findePreset(lib, "export", "gibts-nicht")).toThrow(/reel/);
  });
});

describe("Laden und Prüfen", () => {
  const gut = { art: "audio", id: "a", name: "Name A", beschreibung: "Eine Beschreibung", zielLufs: -14, spitzeDbtp: -1, herkunft: { stand: "annahme", quelle: "Eigene Annahme" } };

  it("meldet einen Dateinamen, der nicht zur ID passt", () => {
    const lib = ladePresets(tmpPresets({ "audio/falsch.json": gut }));
    expect(lib.befunde.map((b) => b.code)).toContain("dateiname");
  });

  it("meldet doppelte IDs", () => {
    const lib = ladePresets(tmpPresets({ "audio/a.json": gut, "audio/a2.json": gut }));
    expect(lib.befunde.map((b) => b.code)).toContain("doppelt");
  });

  it("meldet ungültiges JSON und Schemafehler mit Dateiname", () => {
    const lib = ladePresets(tmpPresets({ "audio/kaputt.json": "{ nicht json", "audio/b.json": { ...gut, id: "b", zielLufs: 3 } }));
    expect(lib.befunde.map((b) => b.code).sort()).toEqual(["json", "schema"]);
    expect(lib.befunde.find((b) => b.code === "schema")!.text).toContain("audio/b.json");
  });

  it("ein Grafik-Preset, das Inhalt (Text) vorgibt oder ausserhalb des Stück-Bereichs liegt, ist ein Fehler", () => {
    const basis = findePreset(ladePresets(wurzel), "grafik", "zahl-gross");
    const inhalt = lintGrafikPresets([{ ...basis, werte: { ...basis.werte, label: "fest vorgegeben" } }], stuecke);
    expect(inhalt.map((b) => b.code)).toContain("inhalt-im-preset");
    const lang = lintGrafikPresets([{ ...basis, dauer: { min: 1.4, standard: 2.6, max: 9 } }], stuecke);
    expect(lang.map((b) => b.code)).toContain("dauer");
    const unbekannt = lintGrafikPresets([{ ...basis, werte: { gibtsNicht: 1 } }], stuecke);
    expect(unbekannt.map((b) => b.code)).toContain("werte");
    const ohneStueck = lintGrafikPresets([{ ...basis, stueck: "gibts-nicht" }], stuecke);
    expect(ohneStueck.map((b) => b.code)).toContain("stueck-unbekannt");
  });
});
