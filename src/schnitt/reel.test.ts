import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseArgs } from "../args";
import { rendereStueck, umgebung, type Umgebung } from "../motion/werkstatt";
import { leseSchnittplan } from "./plan";
import { listeAufnahmen, naechsterSchritt, pruefeInhaltId, quellenId, reelBefehl, reelPfade, skriptTitel, wendeTonAn, type ReelGeraete, type ReelZustand } from "./reel";
import { testSatz } from "./testdaten";
import type { Segment } from "./transkript";

vi.mock("../motion/werkstatt", async (orig) => {
  const m = await orig<typeof import("../motion/werkstatt")>();
  return { ...m, rendereStueck: vi.fn(m.rendereStueck) };
});

const hatFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
const root = path.resolve(import.meta.dirname, "..", "..");

/* ---------- reine Helfer ---------- */

describe("pruefeInhaltId", () => {
  it("nimmt Kennungen wie c-0007 und lehnt alles ab, was einen Pfad verlassen könnte", () => {
    expect(pruefeInhaltId("c-0007")).toBe("c-0007");
    expect(pruefeInhaltId("Reel_2")).toBe("Reel_2");
    for (const schlecht of ["../x", "a/b", "a\\b", "-x", ".versteckt", "mit leer", "ü", "x".repeat(65)]) expect(() => pruefeInhaltId(schlecht), schlecht).toThrow(/gültige Inhalt-ID/);
    expect(() => pruefeInhaltId(undefined)).toThrow(/ID fehlt/);
    expect(() => pruefeInhaltId("")).toThrow(/ID fehlt/);
  });
});

describe("reelPfade", () => {
  it("legt Skript und Ergebnisse in den Studio-Ordner, die Aufnahmen in den Medien-Ordner", () => {
    const p = reelPfade({ pfad: "/s", quelle: "config", medien: "/m" }, "c-0007");
    expect(p.skript).toBe("/s/inhalte/c-0007/skript.md");
    expect(p.plan).toBe("/s/inhalte/c-0007/ergebnis/plan.json");
    expect(p.resolve).toBe("/s/inhalte/c-0007/ergebnis/resolve");
    expect(p.aufnahmen).toBe("/m/rohmaterial/c-0007");
    expect(reelPfade({ pfad: "/s", quelle: "config" }, "c-0007").aufnahmen).toBe("/s/rohmaterial/c-0007");
  });
});

describe("skriptTitel, quellenId", () => {
  it("nimmt die erste Überschrift, sonst den Rückfall", () => {
    expect(skriptTitel("# Küche Gossau\nText", "c-0007")).toBe("Küche Gossau");
    expect(skriptTitel("Text\n## Zweite", "c-0007")).toBe("c-0007");
    expect(skriptTitel("Text", "c-0007")).toBe("c-0007");
  });
  it("macht aus Dateinamen eindeutige Kennungen", () => {
    const v = new Set<string>();
    expect(quellenId("Sprache 01.MOV", v)).toBe("sprache-01");
    expect(quellenId("sprache_01.mp4", v)).toBe("sprache-01-2");
    expect(quellenId("sprache-01.m4v", v)).toBe("sprache-01-3");
    expect(quellenId("***.mp4", v)).toBe("aufnahme");
  });
});

describe("listeAufnahmen", () => {
  let tmp: string;
  beforeEach(() => void (tmp = fs.mkdtempSync(path.join(os.tmpdir(), "studio-reel-liste-"))));
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const lege = (...namen: string[]): void => namen.forEach((n) => fs.writeFileSync(path.join(tmp, n), "x"));

  it("sortiert natürlich, überspringt versteckte Dateien, Nicht-Videos und Ordner", () => {
    lege("clip 10.mov", "clip 2.mov", "clip 1.MP4", ".DS_Store", "._clip 3.mov", "notiz.txt", "ton.wav");
    fs.mkdirSync(path.join(tmp, "unterordner.mov"));
    expect(listeAufnahmen(tmp)).toEqual(["clip 1.MP4", "clip 2.mov", "clip 10.mov"]);
  });
  it("meldet einen fehlenden Ordner und einen ohne Video mit dem Pfad", () => {
    expect(() => listeAufnahmen(path.join(tmp, "gibt-es-nicht"))).toThrow(/Ordner mit den Aufnahmen fehlt: .*gibt-es-nicht/);
    lege("notiz.txt");
    expect(() => listeAufnahmen(tmp)).toThrow(/kein Video/);
  });
});

describe("naechsterSchritt", () => {
  const z = (x: Partial<ReelZustand>): ReelZustand => ({ skript: true, aufnahmen: 1, plan: true, auftrag: true, storyboard: true, planStoryboard: true, vorschau: true, resolve: false, ...x });
  it("führt der Reihe nach durch den Ablauf", () => {
    expect(naechsterSchritt("c-1", z({ skript: false }))).toMatch(/reel neu c-1 --zwischenablage/);
    expect(naechsterSchritt("c-1", z({ aufnahmen: 0 }))).toMatch(/rohmaterial\/c-1\/.*reel vorbereiten c-1/);
    expect(naechsterSchritt("c-1", z({ plan: false }))).toBe("«./studio reel vorbereiten c-1»");
    expect(naechsterSchritt("c-1", z({ storyboard: false, planStoryboard: false }))).toMatch(/reel storyboard c-1 --zwischenablage/);
    expect(naechsterSchritt("c-1", z({ planStoryboard: false }))).toBe("«./studio reel storyboard c-1»");
    expect(naechsterSchritt("c-1", z({}))).toMatch(/reel uebergabe c-1/);
    expect(naechsterSchritt("c-1", z({ resolve: true }))).toMatch(/Resolve importieren/);
  });
});

/* ---------- der Ablauf auf der Platte ---------- */

const whisperJson = (...s: Segment[]) => ({
  segments: s.map((x) => ({ start: x.von, end: x.bis, text: ` ${x.text}`, words: x.woerter!.map((w) => ({ word: ` ${w.text}`, start: w.von, end: w.bis })) })),
});
const Z1 = "Wir haben diese Woche eine Küche komplett umgebaut.";
const Z2 = "Der Kunde wollte mehr Stauraum.";
const Z3 = "Das Ergebnis siehst du hier.";
const SKRIPT = `# Küche Gossau\n${Z1}\n${Z2}\n${Z3}\n`;

let tmp: string;
let env: Umgebung;
let ausgabe: string[];
let zwischenablage: string;
let kopiert: string[];
let geoeffnet: string[];
let geraete: ReelGeraete;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "studio-reel-"));
  env = { ...umgebung(root), datenDir: path.join(tmp, "daten") };
  ausgabe = [];
  kopiert = [];
  geoeffnet = [];
  zwischenablage = "";
  geraete = { liesZwischenablage: () => zwischenablage, schreibeZwischenablage: (t) => void kopiert.push(t), oeffne: (p) => void geoeffnet.push(p) };
  vi.spyOn(console, "log").mockImplementation((...x: unknown[]) => void ausgabe.push(x.join(" ")));
  vi.spyOn(console, "error").mockImplementation((...x: unknown[]) => void ausgabe.push(x.join(" ")));
  vi.stubEnv("STUDIO_HOME", path.join(tmp, "Studio"));
  vi.stubEnv("STUDIO_MEDIEN", path.join(tmp, "Medien"));
  vi.stubEnv("STUDIO_CONFIG", path.join(tmp, "keine-config.json"));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const lauf = (...argv: string[]): Promise<number> => reelBefehl(argv[1]!, parseArgs(argv), env, geraete);
const studio = (...teile: string[]): string => path.join(tmp, "Studio", ...teile);
const medien = (...teile: string[]): string => path.join(tmp, "Medien", ...teile);
const text = (): string => ausgabe.join("\n");
const ff = (...a: string[]): void => void expect(spawnSync("ffmpeg", ["-loglevel", "error", "-y", ...a]).status, a.join(" ")).toBe(0);

/** Ersatz-Whisper als Skript: legt das vorbereitete Transkript unter dem Namen der Aufnahme ab und zählt seine Aufrufe. */
function ersatzWhisper(json: unknown): { aufrufe: () => number } {
  const quelle = path.join(tmp, "transkript-vorlage.json");
  const zaehler = path.join(tmp, "aufrufe.txt");
  const bin = path.join(tmp, "whisper-ersatz");
  fs.writeFileSync(quelle, JSON.stringify(json));
  fs.writeFileSync(bin, `#!/usr/bin/env node\nconst fs = require("node:fs"), path = require("node:path");\nconst a = process.argv.slice(2);\nfs.appendFileSync(${JSON.stringify(zaehler)}, "x");\nfs.copyFileSync(${JSON.stringify(quelle)}, path.join(a[a.indexOf("--output_dir") + 1], path.basename(a[0], path.extname(a[0])) + ".json"));\n`);
  fs.chmodSync(bin, 0o755);
  vi.stubEnv("STUDIO_WHISPER_BIN", bin);
  return { aufrufe: () => (fs.existsSync(zaehler) ? fs.readFileSync(zaehler, "utf8").length : 0) };
}

const legeVideoAn = (name = "Sprache 01.mp4", dauer = 45): string => {
  fs.mkdirSync(medien("rohmaterial", "c-0007"), { recursive: true });
  const ziel = medien("rohmaterial", "c-0007", name);
  ff("-f", "lavfi", "-i", `testsrc2=size=320x568:rate=25:duration=${dauer}`, "-f", "lavfi", "-i", `sine=frequency=300:duration=${dauer}`, "-shortest", ziel);
  return ziel;
};

describe("reel neu", () => {
  it("legt Skript, Aufnahmen- und Ergebnisordner an, merkt sich die Marke und öffnet den Aufnahmenordner", async () => {
    zwischenablage = SKRIPT;
    expect(await lauf("reel", "neu", "c-0007", "--marke", "alperna", "--zwischenablage")).toBe(0);
    expect(fs.readFileSync(studio("inhalte", "c-0007", "skript.md"), "utf8")).toBe(SKRIPT);
    expect(fs.statSync(medien("rohmaterial", "c-0007")).isDirectory()).toBe(true);
    expect(JSON.parse(fs.readFileSync(studio("inhalte", "c-0007", "reel.json"), "utf8"))).toEqual({ schema: 1, id: "c-0007", marke: "alperna" });
    expect(geoeffnet).toEqual([medien("rohmaterial", "c-0007")]);
    expect(text()).toContain("(3 Zeilen)");
    expect(text()).toContain("./studio reel vorbereiten c-0007");
  });

  it("nimmt die einzige Marke, wenn es nur eine gibt, und kennt --nicht-oeffnen", async () => {
    zwischenablage = SKRIPT;
    expect(await lauf("reel", "neu", "c-0007", "--zwischenablage", "--nicht-oeffnen")).toBe(0);
    expect(JSON.parse(fs.readFileSync(studio("inhalte", "c-0007", "reel.json"), "utf8")).marke).toBe("alperna");
    expect(geoeffnet).toEqual([]);
  });

  it("verlangt bei mehreren Marken die Angabe und nennt die vorhandenen", async () => {
    const markenDir = path.join(tmp, "marken");
    fs.mkdirSync(markenDir);
    for (const k of ["alperna", "kunde"]) fs.copyFileSync(path.join(root, "marken", "alperna.json"), path.join(markenDir, `${k}.json`));
    env = { ...env, markenDir };
    await expect(lauf("reel", "neu", "c-0007")).rejects.toThrow(/--marke fehlt.*alperna, kunde/);
  });

  it("überschreibt kein anderes Skript, ausser mit --ueberschreiben; dasselbe Skript nochmal ist harmlos", async () => {
    zwischenablage = SKRIPT;
    await lauf("reel", "neu", "c-0007", "--zwischenablage");
    expect(await lauf("reel", "neu", "c-0007", "--zwischenablage")).toBe(0);
    zwischenablage = `${SKRIPT}Noch ein Satz.\n`;
    await expect(lauf("reel", "neu", "c-0007", "--zwischenablage")).rejects.toThrow(/schon ein anderes Skript.*--ueberschreiben/);
    expect(fs.readFileSync(studio("inhalte", "c-0007", "skript.md"), "utf8")).toBe(SKRIPT);
    expect(await lauf("reel", "neu", "c-0007", "--zwischenablage", "--ueberschreiben")).toBe(0);
    expect(fs.readFileSync(studio("inhalte", "c-0007", "skript.md"), "utf8")).toContain("Noch ein Satz.");
  });

  it("nimmt das Skript auch aus einer Datei und lehnt leere und fehlende Quellen ab", async () => {
    const datei = path.join(tmp, "s.md");
    fs.writeFileSync(datei, "Ein Satz ohne Zeilenumbruch.");
    expect(await lauf("reel", "neu", "c-0007", "--skript", datei)).toBe(0);
    expect(fs.readFileSync(studio("inhalte", "c-0007", "skript.md"), "utf8")).toBe("Ein Satz ohne Zeilenumbruch.\n");
    zwischenablage = "  \n";
    await expect(lauf("reel", "neu", "c-0008", "--zwischenablage")).rejects.toThrow(/Zwischenablage ist leer/);
    await expect(lauf("reel", "neu", "c-0008", "--skript", path.join(tmp, "fehlt.md"))).rejects.toThrow(/Skript-Datei fehlt/);
    expect(fs.existsSync(studio("inhalte", "c-0008"))).toBe(false);
  });

  it("ohne Skript legt er nur die Ordner an und sagt, was fehlt; ungültige ID und fehlender Studio-Ordner sind klare Fehler", async () => {
    expect(await lauf("reel", "neu", "c-0007", "--marke", "alperna")).toBe(0);
    expect(text()).toContain("Skript fehlt noch");
    await expect(lauf("reel", "neu", "../x", "--marke", "alperna")).rejects.toThrow(/gültige Inhalt-ID/);
    vi.stubEnv("STUDIO_HOME", "");
    await expect(lauf("reel", "neu", "c-0009", "--marke", "alperna")).rejects.toThrow(/studio init/);
  });
});

describe.skipIf(!hatFfmpeg)("reel vorbereiten, storyboard, uebergabe", () => {
  const zahl = (extra: Record<string, unknown> = {}) => ({ effekt: "zahl-zaehler", t: 0.5, dauer: 1.5, params: { wert: 3, label: "Wochen" }, begruendung: "Kennzahl im Skript", ...extra });
  const antwort = (overlays: unknown[]) => `Hier das Storyboard:\n\n\`\`\`json\n${JSON.stringify({ hook: "Warum die Küche anders aussieht", overlays, betonung: [5] })}\n\`\`\`\nViel Erfolg.`;
  const mockRender = () => {
    const mock = vi.mocked(rendereStueck);
    mock.mockReset();
    mock.mockImplementation(async (_e, _id, o) => {
      fs.mkdirSync(path.dirname(o.ausgabe), { recursive: true });
      ff("-f", "lavfi", "-i", "color=c=white@0.6:s=1080x1920:r=25:d=3,format=yuva420p", "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", o.ausgabe);
      return { datei: o.ausgabe, dauer: 3, variablen: {}, pruefung: { bestanden: true, befunde: [] }, renderMs: 1, warnungen: [] } as never;
    });
    return mock;
  };
  const vorbereitet = async (): Promise<{ aufrufe: () => number; video: string }> => {
    zwischenablage = SKRIPT;
    await lauf("reel", "neu", "c-0007", "--marke", "alperna", "--zwischenablage");
    const w = ersatzWhisper(whisperJson(testSatz(1, Z1), testSatz(10, Z2), testSatz(20, Z3)));
    const video = legeVideoAn();
    ausgabe.length = 0;
    geoeffnet.length = 0;
    expect(await lauf("reel", "vorbereiten", "c-0007")).toBe(0);
    return { ...w, video };
  };

  it("vorbereiten: sondiert, transkribiert, ordnet zu und schreibt Plan, Bericht, Auftrag und reel.json; der Auftrag liegt in der Zwischenablage", async () => {
    const { aufrufe } = await vorbereitet();
    expect(aufrufe()).toBe(1);
    const e = (n: string): string => studio("inhalte", "c-0007", "ergebnis", n);
    const plan = leseSchnittplan(JSON.parse(fs.readFileSync(e("plan.json"), "utf8")));
    expect(plan.projekt).toMatchObject({ name: "Küche Gossau", marke: "alperna", inhalt: "c-0007" });
    expect(plan.quellen.map((q) => [q.id, q.pfad])).toEqual([["sprache-01", "rohmaterial/c-0007/Sprache 01.mp4"]]);
    expect([...new Set(plan.clips.map((c) => c.zeile))]).toEqual([1, 2, 3]);
    expect(JSON.parse(fs.readFileSync(e("quellen.json"), "utf8"))[0]).toMatchObject({ id: "sprache-01", art: "video", fps: 25, hatAudio: true });
    expect(JSON.parse(fs.readFileSync(e("bericht.json"), "utf8")).zuordnung.zeilen).toHaveLength(3);
    expect(fs.existsSync(e(path.join("transkripte", "sprache-01.json")))).toBe(true);
    expect(fs.readFileSync(e("auftrag.md"), "utf8")).toContain("# Storyboard-Auftrag: Küche Gossau");
    expect(kopiert).toEqual([fs.readFileSync(e("auftrag.md"), "utf8")]);
    expect(JSON.parse(fs.readFileSync(studio("inhalte", "c-0007", "reel.json"), "utf8"))).toEqual({ schema: 1, id: "c-0007", marke: "alperna", name: "Küche Gossau" });
    const t = text();
    expect(t).toContain("Zugeordnet: 3 von 3 (100 Prozent");
    expect(t).toContain("Transkribiere 1 von 1: Sprache 01.mp4");
    expect(t).toMatch(/reel storyboard c-0007 --zwischenablage/);
    expect(t).toMatch(/Energie nicht gemessen|Bester/); // Pegel wird mit dem echten Material gemessen, wenn mehrere Takes da sind
  }, 120_000);

  it("vorbereiten: vorhandene Transkripte bleiben, --neu und ein neueres Video erzwingen Whisper", async () => {
    const { aufrufe, video } = await vorbereitet();
    ausgabe.length = 0;
    await lauf("reel", "vorbereiten", "c-0007", "--ohne-pegel");
    expect(aufrufe()).toBe(1);
    expect(text()).toContain("Transkript vorhanden: sprache-01");
    await lauf("reel", "vorbereiten", "c-0007", "--ohne-pegel", "--neu");
    expect(aufrufe()).toBe(2);
    const spaeter = new Date(Date.now() + 60_000);
    fs.utimesSync(video, spaeter, spaeter);
    await lauf("reel", "vorbereiten", "c-0007", "--ohne-pegel");
    expect(aufrufe()).toBe(3);
  }, 180_000);

  it("vorbereiten: --nicht-kopieren lässt die Zwischenablage in Ruhe; --gesprochen und --name landen in reel.json", async () => {
    await vorbereitet();
    kopiert.length = 0;
    await lauf("reel", "vorbereiten", "c-0007", "--ohne-pegel", "--nicht-kopieren", "--gesprochen", "1,3", "--name", "Eigener Titel");
    expect(kopiert).toEqual([]);
    expect(JSON.parse(fs.readFileSync(studio("inhalte", "c-0007", "reel.json"), "utf8"))).toMatchObject({ name: "Eigener Titel", gesprochen: [1, 3] });
    const plan = leseSchnittplan(JSON.parse(fs.readFileSync(studio("inhalte", "c-0007", "ergebnis", "plan.json"), "utf8")));
    expect(plan.projekt.name).toBe("Eigener Titel");
    // ein weiterer Lauf ohne die Schalter behält sie
    await lauf("reel", "vorbereiten", "c-0007", "--ohne-pegel", "--nicht-kopieren");
    expect(JSON.parse(fs.readFileSync(studio("inhalte", "c-0007", "reel.json"), "utf8"))).toMatchObject({ name: "Eigener Titel", gesprochen: [1, 3] });
  }, 120_000);

  it("vorbereiten: --zoom wird geprüft, kommt in den Plan (kein Zoom) und bleibt in reel.json für den nächsten Lauf", async () => {
    await vorbereitet();
    await expect(lauf("reel", "vorbereiten", "c-0007", "--ohne-pegel", "--nicht-kopieren", "--zoom", "wild")).rejects.toThrow(/--zoom «wild» gibt es nicht.*profil, bei-schnitt, aus/s);
    await lauf("reel", "vorbereiten", "c-0007", "--ohne-pegel", "--nicht-kopieren", "--zoom", "aus");
    const planPfad = studio("inhalte", "c-0007", "ergebnis", "plan.json");
    expect(leseSchnittplan(JSON.parse(fs.readFileSync(planPfad, "utf8"))).clips.every((c) => c.zoom === 1)).toBe(true);
    expect(JSON.parse(fs.readFileSync(studio("inhalte", "c-0007", "reel.json"), "utf8"))).toMatchObject({ zoom: "aus" });
    // ohne Schalter bleibt «aus» gültig
    await lauf("reel", "vorbereiten", "c-0007", "--ohne-pegel", "--nicht-kopieren");
    expect(leseSchnittplan(JSON.parse(fs.readFileSync(planPfad, "utf8"))).clips.every((c) => c.zoom === 1)).toBe(true);
  }, 120_000);

  it("ton: verbessert die Sprache auf das Ziel des Presets, lässt das Bild unberührt und der Plan nimmt danach die Datei in ton/", async () => {
    // Aufnahme mit leisem Ton, damit die Verstärkung messbar ist
    const { video } = await vorbereitet();
    const leise = path.join(tmp, "leise.mp4");
    ff("-i", video, "-map", "0:v", "-c:v", "copy", "-map", "0:a", "-af", "volume=-26dB", "-c:a", "aac", leise);
    fs.copyFileSync(leise, video);
    // der Plan liegt schon; die Quelle ist neu, der Plan bleibt gültig (gleiche Länge)
    ausgabe.length = 0;
    const code = await lauf("reel", "ton", "c-0007");
    expect(code, text()).toBe(0);
    expect(text()).toMatch(/vorher -\d+,\d LUFS.*Verstärkung \d+,\d dB, nachher -1[345],\d LUFS/);
    const aus = medien("rohmaterial", "c-0007", "ton", path.basename(video));
    expect(fs.existsSync(aus)).toBe(true);
    expect(JSON.parse(fs.readFileSync(studio("inhalte", "c-0007", "reel.json"), "utf8"))).toMatchObject({ ton: true });
    // der Ordner ton/ zählt nicht als Aufnahme
    expect(listeAufnahmen(medien("rohmaterial", "c-0007"))).toEqual([path.basename(video)]);

    const planDatei = studio("inhalte", "c-0007", "ergebnis", "plan.json");
    const ersetzt = await wendeTonAn(planDatei, { pfad: studio(), quelle: "STUDIO_HOME", medien: medien() });
    expect(ersetzt).toEqual(["sprache-01"]);
    const plan = leseSchnittplan(JSON.parse(fs.readFileSync(planDatei, "utf8")));
    expect(plan.quellen[0]!.pfad).toBe(`rohmaterial/c-0007/ton/${path.basename(video)}`);
    // ein zweites Mal ändert nichts mehr (die Quelle zeigt schon auf ton/, dort gibt es keine zweite Fassung)
    expect(await wendeTonAn(planDatei, { pfad: studio(), quelle: "STUDIO_HOME", medien: medien() })).toEqual([]);
    expect(leseSchnittplan(JSON.parse(fs.readFileSync(planDatei, "utf8"))).quellen[0]!.pfad).toBe(`rohmaterial/c-0007/ton/${path.basename(video)}`);
    // vorbereiten behält «ton» in reel.json
    await lauf("reel", "vorbereiten", "c-0007", "--ohne-pegel", "--nicht-kopieren");
    expect(JSON.parse(fs.readFileSync(studio("inhalte", "c-0007", "reel.json"), "utf8"))).toMatchObject({ ton: true });
  }, 240_000);

  it("ton: ohne Plan gibt es einen klaren Fehler", async () => {
    await expect(lauf("reel", "ton", "c-0007", "--marke", "alperna")).rejects.toThrow(/noch keinen Plan/);
  });

  it("vorbereiten: klare Fehler für fehlendes Skript, leeren Aufnahmenordner und Dateien ausserhalb von Studio und Medien", async () => {
    await expect(lauf("reel", "vorbereiten", "c-0007", "--marke", "alperna")).rejects.toThrow(/Skript fehlt.*reel neu c-0007 --zwischenablage/s);
    zwischenablage = SKRIPT;
    await lauf("reel", "neu", "c-0007", "--marke", "alperna", "--zwischenablage");
    await expect(lauf("reel", "vorbereiten", "c-0007")).rejects.toThrow(/kein Video[\s\S]*gehören nach .*rohmaterial.c-0007/);
    const draussen = path.join(tmp, "irgendwo");
    fs.mkdirSync(draussen);
    ff("-f", "lavfi", "-i", "testsrc2=size=320x568:rate=25:duration=2", path.join(draussen, "a.mp4"));
    await expect(lauf("reel", "vorbereiten", "c-0007", "--aufnahmen", draussen)).rejects.toThrow(/ausserhalb von Studio- und Medien-Ordner/);
  }, 60_000);

  it("vorbereiten: bricht ab, wenn kein Satz des Skripts im Gesprochenen vorkommt, und schreibt keinen Plan", async () => {
    zwischenablage = SKRIPT;
    await lauf("reel", "neu", "c-0007", "--marke", "alperna", "--zwischenablage");
    ersatzWhisper(whisperJson(testSatz(1, "Etwas völlig anderes ohne Bezug.")));
    legeVideoAn("a.mp4", 10);
    await expect(lauf("reel", "vorbereiten", "c-0007", "--ohne-pegel")).rejects.toThrow(/kein einziger Clip/);
    expect(fs.existsSync(studio("inhalte", "c-0007", "ergebnis", "plan.json"))).toBe(false);
  }, 60_000);

  it("storyboard: Antwort aus der Zwischenablage (mit Text und Codezaun) wird gespeichert, angewendet, gerendert; Kontaktbogen und Vorschau entstehen und öffnen sich", async () => {
    await vorbereitet();
    const mock = mockRender();
    zwischenablage = antwort([zahl()]);
    ausgabe.length = 0;
    expect(await lauf("reel", "storyboard", "c-0007", "--zwischenablage", "--entwurf")).toBe(0);
    const e = (n: string): string => studio("inhalte", "c-0007", "ergebnis", n);
    expect(JSON.parse(fs.readFileSync(e("storyboard.json"), "utf8")).hook).toBe("Warum die Küche anders aussieht");
    expect(mock).toHaveBeenCalledTimes(1);
    expect(mock.mock.calls[0]![2]).toMatchObject({ ausgabe: medien("renders", "c-0007", "zahl-zaehler-01.webm") });
    const p2 = leseSchnittplan(JSON.parse(fs.readFileSync(e("plan-storyboard.json"), "utf8")));
    expect(p2.overlays).toHaveLength(1);
    expect(p2.woerter.filter((w) => w.betont)).toHaveLength(1);
    expect(fs.readFileSync(e("kontaktbogen.html"), "utf8")).toContain("Kontaktbogen Küche Gossau");
    expect(fs.existsSync(e("vorschau.mp4"))).toBe(true);
    expect(geoeffnet).toEqual([e("kontaktbogen.html"), e("vorschau.mp4")]);
    expect(text()).toMatch(/reel uebergabe c-0007 --entwurf/);
  }, 240_000);

  it("storyboard: ein zweites Storyboard ersetzt das erste und hebt das vorige auf; --ohne-vorschau, --ohne-rendern und --nicht-oeffnen werden beachtet", async () => {
    await vorbereitet();
    const mock = mockRender();
    zwischenablage = antwort([zahl()]);
    await lauf("reel", "storyboard", "c-0007", "--zwischenablage", "--entwurf", "--ohne-vorschau", "--nicht-oeffnen");
    const e = (n: string): string => studio("inhalte", "c-0007", "ergebnis", n);
    expect(fs.existsSync(e("vorschau.mp4"))).toBe(false);
    expect(geoeffnet).toEqual([]);
    expect(fs.existsSync(e("storyboard-vorher.json"))).toBe(false);
    zwischenablage = antwort([zahl({ t: 0.5 }), zahl({ t: 4 })]);
    mock.mockClear();
    await lauf("reel", "storyboard", "c-0007", "--zwischenablage", "--entwurf", "--ohne-vorschau", "--ohne-rendern", "--nicht-oeffnen");
    expect(mock).not.toHaveBeenCalled();
    expect(JSON.parse(fs.readFileSync(e("storyboard-vorher.json"), "utf8")).overlays).toHaveLength(1);
    expect(leseSchnittplan(JSON.parse(fs.readFileSync(e("plan-storyboard.json"), "utf8"))).overlays).toHaveLength(2);
  }, 240_000);

  it("storyboard: schlägt ein Schritt fehl, laufen die nächsten trotzdem, und der Exit-Code ist 1 (hier: Grafik nicht gerendert, Vorschau unmöglich)", async () => {
    await vorbereitet();
    mockRender();
    zwischenablage = antwort([zahl()]);
    ausgabe.length = 0;
    expect(await lauf("reel", "storyboard", "c-0007", "--zwischenablage", "--entwurf", "--ohne-rendern", "--nicht-oeffnen")).toBe(1);
    const t = text();
    expect(t).toContain("Nicht gerendert: Eintrag 1");
    expect(t).toMatch(/FEHLER bei Vorschau:[\s\S]*fehlen Dateien/);
    expect(fs.existsSync(studio("inhalte", "c-0007", "ergebnis", "kontaktbogen.html"))).toBe(true);
  }, 120_000);

  it("storyboard: ohne Plan, ohne Storyboard und mit einer Antwort ohne JSON gibt es klare Fehler", async () => {
    await expect(lauf("reel", "storyboard", "c-0007")).rejects.toThrow(/zuerst «.\/studio reel vorbereiten c-0007»/);
    await vorbereitet();
    await expect(lauf("reel", "storyboard", "c-0007")).rejects.toThrow(/Storyboard fehlt.*--zwischenablage/s);
    zwischenablage = "Das ist leider kein JSON.";
    await expect(lauf("reel", "storyboard", "c-0007", "--zwischenablage")).rejects.toThrow(/kein Storyboard als JSON/);
    expect(fs.existsSync(studio("inhalte", "c-0007", "ergebnis", "storyboard.json"))).toBe(false);
    const datei = path.join(tmp, "sb.json");
    fs.writeFileSync(datei, JSON.stringify({ hook: "x", overlays: [], betonung: [] }));
    expect(await lauf("reel", "storyboard", "c-0007", "--datei", datei, "--ohne-vorschau", "--nicht-oeffnen")).toBe(0);
  }, 120_000);

  it("uebergabe: schreibt den Resolve-Ordner; Stücke, die nicht aktiv sind, brauchen --entwurf; ein zweiter Lauf überschreibt nichts", async () => {
    await vorbereitet();
    mockRender();
    zwischenablage = antwort([zahl()]);
    await lauf("reel", "storyboard", "c-0007", "--zwischenablage", "--entwurf", "--ohne-vorschau", "--nicht-oeffnen");
    await expect(lauf("reel", "uebergabe", "c-0007")).rejects.toThrow(/nicht aktiv|aktiv/);
    expect(fs.existsSync(studio("inhalte", "c-0007", "ergebnis", "resolve"))).toBe(false);
    expect(await lauf("reel", "uebergabe", "c-0007", "--entwurf")).toBe(0);
    const ordner = studio("inhalte", "c-0007", "ergebnis", "resolve");
    expect(fs.readdirSync(ordner).sort()).toEqual(["LIESMICH.md", "overlays", "plan.json", "timeline.fcpxml", "timeline.otio", "untertitel.srt"]);
    expect(fs.readFileSync(path.join(ordner, "LIESMICH.md"), "utf8")).toMatch(/## Betonte Wörter[\s\S]*Küche/);
    expect(await lauf("reel", "uebergabe", "c-0007", "--entwurf")).toBe(0);
    expect(fs.existsSync(`${ordner}-v2`)).toBe(true);
    expect(text()).toContain("LIESMICH.md");
  }, 240_000);

  it("uebergabe: ohne Storyboard geht es mit der Sprache allein und sagt das; ohne Plan ist es ein Fehler", async () => {
    await expect(lauf("reel", "uebergabe", "c-0007")).rejects.toThrow(/zuerst «.\/studio reel vorbereiten c-0007»/);
    await vorbereitet();
    ausgabe.length = 0;
    expect(await lauf("reel", "uebergabe", "c-0007")).toBe(0);
    expect(text()).toContain("Es gibt noch kein Storyboard");
    expect(fs.existsSync(studio("inhalte", "c-0007", "ergebnis", "resolve", "timeline.fcpxml"))).toBe(true);
  }, 120_000);

  it("status: zeigt Stand und nächsten Schritt je Inhalt und in der Übersicht", async () => {
    expect(await lauf("reel", "status")).toBe(0);
    expect(text()).toContain("Noch kein Reel angelegt");
    zwischenablage = SKRIPT;
    await lauf("reel", "neu", "c-0007", "--marke", "alperna", "--zwischenablage", "--nicht-oeffnen");
    ausgabe.length = 0;
    await lauf("reel", "status", "c-0007");
    expect(text()).toMatch(/Skript\s+ja/);
    expect(text()).toMatch(/Aufnahmen\s+nein/);
    expect(text()).toMatch(/Nächster Schritt: Videos in den Ordner rohmaterial\/c-0007\//);
    ersatzWhisper(whisperJson(testSatz(1, Z1), testSatz(10, Z2), testSatz(20, Z3)));
    legeVideoAn();
    await lauf("reel", "vorbereiten", "c-0007", "--ohne-pegel");
    ausgabe.length = 0;
    await lauf("reel", "status", "c-0007");
    expect(text()).toMatch(/Aufnahmen\s+1 Videos/);
    expect(text()).toMatch(/Plan\s+ja/);
    expect(text()).toMatch(/Storyboard\s+nein/);
    ausgabe.length = 0;
    await lauf("reel", "status");
    expect(text()).toMatch(/^c-0007: Den Auftrag/m);
  }, 120_000);
});

describe("reel", () => {
  it("ein unbekannter Unterbefehl nennt die Hilfe und gibt 2 zurück", async () => {
    expect(await lauf("reel", "quatsch")).toBe(2);
    expect(text()).toContain("reel vorbereiten <ID>");
  });
});
