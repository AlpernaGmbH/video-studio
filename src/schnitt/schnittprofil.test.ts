import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Markenprofil, schnittTempo, Schnittprofil } from "../core/schemas";
import { ladePresets } from "../presets/lader";
import { SCHNITT_FORMATE, SchnittprofilPreset } from "../presets/schema";
import { ProfilFehler, schnittprofilFuer, wahlAusOptionen, wendeProfilAn } from "./schnittprofil";

const root = path.resolve(import.meta.dirname, "..", "..");
const alperna = Markenprofil.parse(JSON.parse(fs.readFileSync(path.join(root, "marken", "alperna.json"), "utf8")));
const presets = ladePresets(path.join(root, "presets"));
const mitTextlaengen = Markenprofil.parse({ ...alperna, schnittprofil: { ...alperna.schnittprofil, textlaengen: { "linkedin-post": { min: 400, max: 1300 } } } });

describe("Schnittprofil-Presets (M9)", () => {
  it("lädt ohne Befund, je Format genau eines", () => {
    expect(presets.befunde).toEqual([]);
    expect(presets.schnittprofil.map((p) => p.format).sort()).toEqual([...SCHNITT_FORMATE].sort());
  });

  it("nur «werbung» ist schnell; alle anderen sind ruhig, so wie die Marke Alperna", () => {
    expect(presets.schnittprofil.filter((p) => p.tempo === "schnell").map((p) => p.id)).toEqual(["werbung"]);
    expect(schnittTempo(alperna.schnittprofil!)).toBe("ruhig");
  });

  it("jedes Preset sagt ehrlich, woher es stammt: Annahme oder unbelegt, nie «entschieden»", () => {
    for (const p of presets.schnittprofil) expect(["annahme", "unbelegt"], p.id).toContain(p.herkunft.stand);
  });

  it("das Tempo muss zu den Werten passen: ein schnelles Profil darf sich nicht «ruhig» nennen", () => {
    const werbung = presets.schnittprofil.find((p) => p.id === "werbung")!;
    expect(SchnittprofilPreset.safeParse({ ...werbung, tempo: "ruhig" }).success).toBe(false);
    const talking = presets.schnittprofil.find((p) => p.id === "talking-head")!;
    expect(SchnittprofilPreset.safeParse({ ...talking, tempo: "schnell" }).success).toBe(false);
    expect(SchnittprofilPreset.safeParse(talking).success).toBe(true);
  });

  it("jede Schwelle von schnittTempo wirkt einzeln", () => {
    const ruhig = { laengsteEinstellung: 5, laengstePause: 0.4, zoomTempo: "mittel" as const, minClip: 0.7 };
    expect(schnittTempo(ruhig)).toBe("ruhig");
    expect(schnittTempo({ ...ruhig, laengsteEinstellung: 3.9 })).toBe("schnell");
    expect(schnittTempo({ ...ruhig, laengstePause: 0.29 })).toBe("schnell");
    expect(schnittTempo({ ...ruhig, zoomTempo: "schnell" })).toBe("schnell");
    expect(schnittTempo({ ...ruhig, minClip: 0.59 })).toBe("schnell");
  });
});

describe("schnittprofilFuer: eine Stelle für das gültige Profil", () => {
  it("ohne Wahl gilt genau das Profil der Marke (nie ein Preset von selbst)", () => {
    expect(schnittprofilFuer(alperna, undefined, presets)).toBe(alperna.schnittprofil);
  });

  it("mit Wahl liegt das Preset über der Marke, die Textlängen der Marke bleiben", () => {
    const p = schnittprofilFuer(mitTextlaengen, { id: "dokumentation" }, presets)!;
    expect(p.laengstePause).toBe(0.8);
    expect(p.laengsteEinstellung).toBe(10);
    expect(p.zoom).toEqual({ modus: "aus", maxProMinute: 0 });
    expect(p.textlaengen).toEqual({ "linkedin-post": { min: 400, max: 1300 } });
    expect(() => Schnittprofil.parse(p)).not.toThrow();
  });

  it("eine unbekannte ID nennt die vorhandenen", () => {
    expect(() => schnittprofilFuer(alperna, { id: "gibt-es-nicht" }, presets)).toThrow(/talking-head/);
    expect(() => schnittprofilFuer(alperna, { id: "gibt-es-nicht" }, presets)).toThrow(ProfilFehler);
  });

  it("ein schnelles Profil weist ohne ausdrücklichen Wunsch ab und gilt mit ihm", () => {
    expect(() => schnittprofilFuer(alperna, { id: "werbung" }, presets)).toThrow(/--schnell/);
    expect(() => schnittprofilFuer(alperna, { id: "werbung", schnell: false }, presets)).toThrow(/ausdrücklichen Wunsch/);
    const p = schnittprofilFuer(alperna, { id: "werbung", schnell: true }, presets)!;
    expect(p.laengsteEinstellung).toBe(3);
    expect(p.zoomTempo).toBe("schnell");
  });

  it("wendeProfilAn hängt die Prüfung des schnellen Profils nicht an die ID, sondern an das Tempo des Presets", () => {
    const werbung = presets.schnittprofil.find((x) => x.id === "werbung")!;
    expect(() => wendeProfilAn(alperna, { ...werbung, id: "etwas-anderes" }, false)).toThrow(/--schnell/);
  });
});

describe("wahlAusOptionen", () => {
  it("ohne Option keine Wahl; die frühere bleibt bestehen", () => {
    expect(wahlAusOptionen({})).toBeUndefined();
    expect(wahlAusOptionen({}, { id: "erklaervideo" })).toEqual({ id: "erklaervideo" });
    expect(wahlAusOptionen({}, { id: "werbung", schnell: true })).toEqual({ id: "werbung", schnell: true });
  });

  it("--schnittprofil <id> wählt, --schnell bestätigt, «standard» hebt die Wahl auf", () => {
    expect(wahlAusOptionen({ schnittprofil: "werbung" })).toEqual({ id: "werbung" });
    expect(wahlAusOptionen({ schnittprofil: "werbung", schnell: true })).toEqual({ id: "werbung", schnell: true });
    expect(wahlAusOptionen({ schnittprofil: "standard" }, { id: "werbung", schnell: true })).toBeUndefined();
  });

  it("--schnell allein ist ein Fehler, ausser eine frühere Wahl ist da", () => {
    expect(() => wahlAusOptionen({ schnell: true })).toThrow(/gehört zu --schnittprofil/);
    expect(wahlAusOptionen({ schnell: true }, { id: "werbung" })).toEqual({ id: "werbung", schnell: true });
  });

  it("ein leerer oder ein bool-Wert für --schnittprofil ist ein Fehler", () => {
    expect(() => wahlAusOptionen({ schnittprofil: true })).toThrow(/erwartet die ID/);
    expect(() => wahlAusOptionen({ schnittprofil: " " })).toThrow(/erwartet die ID/);
  });
});

/**
 * Wächter: Das Profil der Marke wird nur an den Stellen gelesen, die hier stehen. Jede andere Stelle muss über `ladeSchnittprofil` gehen,
 * sonst gilt eine Wahl (M9) in der Prüfung, im Storyboard oder in der Qualitätsmessung nicht.
 */
describe("Wächter: kein Zugriff am Schnittprofil vorbei", () => {
  const ERLAUBT = new Set([
    "src/core/schemas.ts", // Gate 0 prüft, ob die Marke ein Profil hat
    "src/schnitt/schnittprofil.ts", // die Auflösung selbst
    "src/schnitt/zuordnen.ts", // ohne Wahl nimmt die Zuordnung das Profil der Marke (die Wahl kommt als aufgelöstes Profil von aussen)
    "src/inhalte/befehle.ts", // Textprüfung: nur die Textlängen der Marke, die ein Format-Profil nie ändert
  ]);
  const quellen = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return quellen(p);
      return /\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name) ? [p] : [];
    });

  it("liest marke.schnittprofil nur an den erlaubten Stellen", () => {
    const funde = quellen(path.join(root, "src"))
      .filter((f) => /\bmarke\??\.schnittprofil\b/.test(fs.readFileSync(f, "utf8")))
      .map((f) => path.relative(root, f).split(path.sep).join("/"))
      .sort();
    expect(funde).toEqual([...ERLAUBT].sort());
  });
});
