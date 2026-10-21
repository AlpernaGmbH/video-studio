import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseArgs } from "../args";
import { rendereStueck, umgebung, type Umgebung } from "../motion/werkstatt";
import { leseSchnittplan } from "./plan";
import { pruefeSchnittplan } from "./pruefung";
import { schnittBefehl } from "./befehle";
import { findeStille } from "./stille";
import { juengsterExport, listeAufnahmen, naechsterSchritt, pruefeInhaltId, quellenId, reelBefehl, reelPfade, skriptTitel, transkriptMarkdown, type ReelGeraete, type ReelZustand } from "./reel";
import { testSatz } from "./testdaten";
import type { Segment } from "./transkript";

vi.mock("../motion/werkstatt", async (orig) => {
  const m = await orig<typeof import("../motion/werkstatt")>();
  return { ...m, rendereStueck: vi.fn(m.rendereStueck) };
});

vi.mock("./stille", async (orig) => {
  const m = await orig<typeof import("./stille")>();
  return { ...m, findeStille: vi.fn(m.findeStille) };
});

const hatFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
const root = path.resolve(import.meta.dirname, "..", "..");

/* ---------- reine Helfer ---------- */

describe("pruefeInhaltId", () => {
  it("nimmt die Kennung aus «Inhalte» (c-0007) und lehnt alles andere ab, auch was einen Pfad verlassen könnte", () => {
    expect(pruefeInhaltId("c-0007")).toBe("c-0007");
    expect(pruefeInhaltId("c-1234")).toBe("c-1234");
    // der Schnittplan kennt nur diese Form (projekt.inhalt): alles andere scheiterte erst beim Bauen des Plans
    for (const schlecht of ["Reel_2", "c-007", "c-00007", "C-0007", "../x", "a/b", "a\\b", "-x", ".versteckt", "mit leer", "ü", "c-0007/../x"]) expect(() => pruefeInhaltId(schlecht), schlecht).toThrow(/gültige Inhalt-ID/);
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
  const z = (x: Partial<ReelZustand>): ReelZustand => ({ skript: true, aufnahmen: 1, plan: true, gegenlesen: true, auftrag: true, storyboard: true, planStoryboard: true, vorschau: true, resolve: false, ...x });
  it("führt der Reihe nach durch den Ablauf", () => {
    expect(naechsterSchritt("c-1", z({ skript: false }))).toMatch(/reel neu c-1 --zwischenablage/);
    expect(naechsterSchritt("c-1", z({ aufnahmen: 0 }))).toMatch(/rohmaterial\/c-1\/.*reel vorbereiten c-1/);
    expect(naechsterSchritt("c-1", z({ plan: false }))).toBe("«./studio reel vorbereiten c-1»");
    expect(naechsterSchritt("c-1", z({ gegenlesen: false, storyboard: false }))).toMatch(/gegenlesen\.md.*gegenlesen\.json.*reel gegenlesen c-1/);
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
function ersatzWhisper(json: unknown): { aufrufe: () => number; eingaben: () => string[] } {
  const quelle = path.join(tmp, "transkript-vorlage.json");
  const zaehler = path.join(tmp, "aufrufe.txt");
  const eingaben = path.join(tmp, "eingaben.txt");
  const bin = path.join(tmp, "whisper-ersatz");
  fs.writeFileSync(quelle, JSON.stringify(json));
  fs.writeFileSync(bin, `#!/usr/bin/env node\nconst fs = require("node:fs"), path = require("node:path");\nconst a = process.argv.slice(2);\nfs.appendFileSync(${JSON.stringify(zaehler)}, "x");\nfs.appendFileSync(${JSON.stringify(eingaben)}, a[0] + "\\n");\nfs.copyFileSync(${JSON.stringify(quelle)}, path.join(a[a.indexOf("--output_dir") + 1], path.basename(a[0], path.extname(a[0])) + ".json"));\n`);
  fs.chmodSync(bin, 0o755);
  vi.stubEnv("STUDIO_WHISPER_BIN", bin);
  return { aufrufe: () => (fs.existsSync(zaehler) ? fs.readFileSync(zaehler, "utf8").length : 0), eingaben: () => (fs.existsSync(eingaben) ? fs.readFileSync(eingaben, "utf8").split("\n").filter(Boolean) : []) };
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

  /** Wie `vorbereitet`, dazu ein Gegenlesen ohne Befund (Claude hat gelesen und nichts gefunden). */
  const bereit = async (): Promise<{ aufrufe: () => number; video: string }> => {
    const r = await vorbereitet();
    fs.writeFileSync(studio("inhalte", "c-0007", "ergebnis", "gegenlesen.json"), JSON.stringify({ gelesen: true, schnitte: [], woerter: [] }));
    expect(await lauf("reel", "gegenlesen", "c-0007", "--nicht-kopieren")).toBe(0);
    ausgabe.length = 0;
    kopiert.length = 0;
    return r;
  };

  it("vorbereiten: sondiert, transkribiert, ordnet zu und schreibt Plan, Bericht, Gegenlesen und reel.json; Auftrag und Zwischenablage kommen erst nach dem Gegenlesen", async () => {
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
    // das Gegenlesen steht vor dem Storyboard: kein Auftrag, keine Zwischenablage
    expect(fs.existsSync(e("auftrag.md"))).toBe(false);
    expect(kopiert).toEqual([]);
    const lesen = fs.readFileSync(e("gegenlesen.md"), "utf8");
    expect(lesen).toContain("# Gegenlesen: Küche Gossau");
    expect(lesen).toContain(`- Gehört: «${Z1}»`);
    expect(lesen.match(/^## Clip /gm)).toHaveLength(plan.clips.length);
    expect(fs.readFileSync(e("plan-vor-gegenlesen.json"), "utf8")).toBe(fs.readFileSync(e("plan.json"), "utf8"));
    expect(JSON.parse(fs.readFileSync(studio("inhalte", "c-0007", "reel.json"), "utf8"))).toEqual({ schema: 1, id: "c-0007", marke: "alperna", name: "Küche Gossau" });
    const t = text();
    expect(t).toContain("Zugeordnet: 3 von 3 (100 Prozent");
    expect(t).toContain("Transkribiere 1 von 1: Sprache 01.mp4");
    expect(t).toMatch(/Nächster Schritt: Gegenlesen[\s\S]*reel gegenlesen c-0007/);
    // die Dauer jedes Schrittes, damit sichtbar ist, wo die Zeit bleibt
    expect(t).toMatch(/Wo die Zeit blieb:\n\s+Videos sondieren\s+\d[\s\S]*Transkription\s+\d[\s\S]*Farbe messen\s+\d[\s\S]*Stille messen\s+\d[\s\S]*Zuordnen und Plan\s+\d[\s\S]*Summe\s+\d/);
    expect(t).toMatch(/Energie nicht gemessen|Bester/); // Pegel wird mit dem echten Material gemessen, wenn mehrere Takes da sind
  }, 120_000);

  it("vorbereiten: vorhandene Transkripte bleiben, --neu und geänderter Inhalt des Videos erzwingen Whisper, eine neue Änderungszeit allein nicht", async () => {
    const { aufrufe, video } = await vorbereitet();
    ausgabe.length = 0;
    await lauf("reel", "vorbereiten", "c-0007", "--ohne-pegel");
    expect(aufrufe()).toBe(1);
    expect(text()).toContain("Transkript vorhanden: sprache-01");
    await lauf("reel", "vorbereiten", "c-0007", "--ohne-pegel", "--neu");
    expect(aufrufe()).toBe(2);
    // OneDrive oder ein Kopiervorgang fasst die Datei an: neue Änderungszeit, gleicher Inhalt
    const spaeter = new Date(Date.now() + 60_000);
    fs.utimesSync(video, spaeter, spaeter);
    await lauf("reel", "vorbereiten", "c-0007", "--ohne-pegel");
    expect(aufrufe()).toBe(2);
    // anderer Inhalt: Das Video ist ein anderes geworden
    fs.appendFileSync(video, Buffer.alloc(16, 7));
    await lauf("reel", "vorbereiten", "c-0007", "--ohne-pegel");
    expect(aufrufe()).toBe(3);
  }, 180_000);

  it("vorbereiten: dasselbe Video in einem anderen Inhalt wird nicht noch einmal transkribiert (Zwischenspeicher), ein anderes Modell schon", async () => {
    const { aufrufe, video } = await vorbereitet();
    expect(aufrufe()).toBe(1);
    zwischenablage = SKRIPT;
    await lauf("reel", "neu", "c-0008", "--marke", "alperna", "--zwischenablage", "--nicht-oeffnen");
    fs.mkdirSync(medien("rohmaterial", "c-0008"), { recursive: true });
    fs.copyFileSync(video, medien("rohmaterial", "c-0008", "Sprache 01.mp4"));
    ausgabe.length = 0;
    expect(await lauf("reel", "vorbereiten", "c-0008", "--ohne-pegel")).toBe(0);
    expect(aufrufe()).toBe(1);
    expect(text()).toContain("Transkript aus dem Zwischenspeicher: sprache-01");
    expect(fs.existsSync(studio("inhalte", "c-0008", "ergebnis", "transkripte", "sprache-01.json"))).toBe(true);
    // ein anderes Modell ist ein anderes Transkript
    await lauf("reel", "vorbereiten", "c-0007", "--ohne-pegel", "--modell", "medium");
    expect(aufrufe()).toBe(2);
    // zurück zum ersten Modell: wieder aus dem Zwischenspeicher
    ausgabe.length = 0;
    await lauf("reel", "vorbereiten", "c-0007", "--ohne-pegel", "--modell", "large-v3");
    expect(aufrufe()).toBe(2);
    expect(text()).toContain("aus dem Zwischenspeicher");
  }, 240_000);

  it("vorbereiten: ein Transkript aus der Zeit vor dem Zwischenspeicher (ohne Fingerabdruck) wird übernommen, wenn es mit dem Standardmodell nach dem Video entstand", async () => {
    const { aufrufe } = await vorbereitet();
    const stand = studio("inhalte", "c-0007", "ergebnis", "transkripte", "sprache-01.stand.json");
    fs.rmSync(stand);
    fs.rmSync(path.join(env.datenDir, "cache"), { recursive: true, force: true });
    ausgabe.length = 0;
    await lauf("reel", "vorbereiten", "c-0007", "--ohne-pegel");
    expect(aufrufe()).toBe(1);
    expect(text()).toContain("aus einem früheren Lauf übernommen");
    expect(JSON.parse(fs.readFileSync(stand, "utf8"))).toMatchObject({ modell: "large-v3", sprache: "de" });
    // mit einem anderen Modell gilt das alte Transkript nicht
    fs.rmSync(stand);
    await lauf("reel", "vorbereiten", "c-0007", "--ohne-pegel", "--modell", "medium");
    expect(aufrufe()).toBe(2);
  }, 240_000);

  it("vorbereiten: ein altes Transkript, das älter ist als das Video, wird nicht übernommen; eine andere Sprache ist ein anderes Transkript", async () => {
    const { aufrufe, video } = await vorbereitet();
    const stand = studio("inhalte", "c-0007", "ergebnis", "transkripte", "sprache-01.stand.json");
    fs.rmSync(stand);
    fs.rmSync(path.join(env.datenDir, "cache"), { recursive: true, force: true });
    const spaeter = new Date(Date.now() + 120_000);
    fs.utimesSync(video, spaeter, spaeter);
    await lauf("reel", "vorbereiten", "c-0007", "--ohne-pegel");
    expect(aufrufe()).toBe(2);
    await lauf("reel", "vorbereiten", "c-0007", "--ohne-pegel", "--sprache", "en");
    expect(aufrufe()).toBe(3);
    ausgabe.length = 0;
    await lauf("reel", "vorbereiten", "c-0007", "--ohne-pegel", "--sprache", "de");
    expect(aufrufe()).toBe(3);
    expect(text()).toContain("aus dem Zwischenspeicher");
  }, 240_000);

  it("vorbereiten: --gesprochen, --name und --untertitel landen in reel.json und bleiben beim nächsten Lauf; die Untertitel folgen standardmässig dem Gehörten", async () => {
    await vorbereitet();
    const plan = () => leseSchnittplan(JSON.parse(fs.readFileSync(studio("inhalte", "c-0007", "ergebnis", "plan.json"), "utf8")));
    expect(plan().woerter.map((w) => w.text).join(" ")).toBe(`${Z1} ${Z2} ${Z3}`);
    await lauf("reel", "vorbereiten", "c-0007", "--ohne-pegel", "--gesprochen", "1,3", "--name", "Eigener Titel", "--untertitel", "skript");
    expect(JSON.parse(fs.readFileSync(studio("inhalte", "c-0007", "reel.json"), "utf8"))).toMatchObject({ name: "Eigener Titel", gesprochen: [1, 3], untertitel: "skript" });
    expect(plan().projekt.name).toBe("Eigener Titel");
    // ein weiterer Lauf ohne die Schalter behält sie
    await lauf("reel", "vorbereiten", "c-0007", "--ohne-pegel");
    expect(JSON.parse(fs.readFileSync(studio("inhalte", "c-0007", "reel.json"), "utf8"))).toMatchObject({ name: "Eigener Titel", gesprochen: [1, 3], untertitel: "skript" });
    await expect(lauf("reel", "vorbereiten", "c-0007", "--untertitel", "quatsch")).rejects.toThrow(/gehoert.*skript/);
  }, 120_000);

  it("vorbereiten: rastet Anfang und Ende der Clips in die Stille der Tonspur ein; --ohne-stille lässt es", async () => {
    zwischenablage = SKRIPT;
    await lauf("reel", "neu", "c-0007", "--marke", "alperna", "--zwischenablage", "--nicht-oeffnen");
    ersatzWhisper(whisperJson(testSatz(1, Z1), testSatz(10, Z2), testSatz(20, Z3)));
    // Whisper beendet Zeile 1 bei 3,75 s, gesprochen wird bis 3,95 s: danach Stille
    fs.mkdirSync(medien("rohmaterial", "c-0007"), { recursive: true });
    ff("-f", "lavfi", "-i", "testsrc2=size=320x568:rate=25:duration=30", "-f", "lavfi", "-i", "aevalsrc='if(between(t,1,3.95)+between(t,10,11.9)+between(t,20,21.9),0.5*sin(2*PI*300*t),0)':s=48000:d=30", "-shortest", medien("rohmaterial", "c-0007", "Sprache 01.mp4"));
    await lauf("reel", "vorbereiten", "c-0007", "--ohne-pegel");
    const plan = () => leseSchnittplan(JSON.parse(fs.readFileSync(studio("inhalte", "c-0007", "ergebnis", "plan.json"), "utf8")));
    const ende1 = (): number => plan().clips.filter((c) => c.zeile === 1).at(-1)!.bis;
    expect(ende1()).toBeCloseTo(3.95 + 0.14, 1);
    expect(text()).not.toContain("Stille nicht gemessen");
    await lauf("reel", "vorbereiten", "c-0007", "--ohne-pegel", "--ohne-stille");
    expect(ende1()).toBeCloseTo(3.75 + 0.22, 1);
    expect(text()).toContain("Stille nicht gemessen (--ohne-stille)");
  }, 120_000);

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

  it("gegenlesen: schneidet Regie aus dem Plan, schreibt den Auftrag nach dem Gegenlesen und legt ihn in die Zwischenablage", async () => {
    await vorbereitet();
    const e = (n: string): string => studio("inhalte", "c-0007", "ergebnis", n);
    const roh = leseSchnittplan(JSON.parse(fs.readFileSync(e("plan.json"), "utf8")));
    const c = roh.clips[0]!;
    const w = roh.woerter.find((x) => x.text === "Woche")!;
    fs.writeFileSync(e("gegenlesen.json"), JSON.stringify({ gelesen: true, schnitte: [{ quelle: "sprache-01", von: w.von - 0.02, bis: w.bis + 0.02, grund: "Regie: Zwischenruf" }], woerter: [{ quelle: "sprache-01", von: roh.woerter.find((x) => x.text === "Küche")!.von, bis: roh.woerter.find((x) => x.text === "Küche")!.bis, text: "Küchen", grund: "Verhörer: Whisper hörte das so" }] }));
    ausgabe.length = 0;
    expect(await lauf("reel", "gegenlesen", "c-0007")).toBe(0);
    const neu = leseSchnittplan(JSON.parse(fs.readFileSync(e("plan.json"), "utf8")));
    expect(neu.clips.length).toBe(roh.clips.length + 1);
    expect(neu.woerter.map((x) => x.text)).not.toContain("Woche");
    expect(neu.woerter.map((x) => x.text)).toContain("Küchen");
    expect(neu.clips.some((x) => x.von < w.von && x.bis > w.von)).toBe(false);
    expect(c.von).toBe(neu.clips[0]!.von);
    // der Plan vor dem Gegenlesen bleibt, der Auftrag beruht auf dem neuen Plan, die Zwischenablage bekommt ihn
    expect(JSON.parse(fs.readFileSync(e("plan-vor-gegenlesen.json"), "utf8")).clips).toHaveLength(roh.clips.length);
    const auftrag = fs.readFileSync(e("auftrag.md"), "utf8");
    expect(auftrag).toContain("# Storyboard-Auftrag: Küche Gossau");
    expect(auftrag).not.toMatch(/\bWoche\b/);
    expect(kopiert).toEqual([auftrag]);
    expect(text()).toMatch(/Gegenlesen angewendet: 1 Schnitte, 1 Wörter korrigiert/);
    expect(text()).toMatch(/reel storyboard c-0007 --zwischenablage/);
  }, 120_000);

  it("gegenlesen: zweimal ausgeführt ergibt dasselbe, eine geänderte Antwort ersetzt die vorige", async () => {
    await vorbereitet();
    const e = (n: string): string => studio("inhalte", "c-0007", "ergebnis", n);
    const roh = leseSchnittplan(JSON.parse(fs.readFileSync(e("plan.json"), "utf8")));
    const w = roh.woerter.find((x) => x.text === "Woche")!;
    const schnitt = { quelle: "sprache-01", von: w.von - 0.02, bis: w.bis + 0.02, grund: "Regie: Zwischenruf" };
    fs.writeFileSync(e("gegenlesen.json"), JSON.stringify({ gelesen: true, schnitte: [schnitt] }));
    await lauf("reel", "gegenlesen", "c-0007", "--nicht-kopieren");
    const eins = fs.readFileSync(e("plan.json"), "utf8");
    await lauf("reel", "gegenlesen", "c-0007", "--nicht-kopieren");
    expect(fs.readFileSync(e("plan.json"), "utf8")).toBe(eins);
    fs.writeFileSync(e("gegenlesen.json"), JSON.stringify({ gelesen: true }));
    await lauf("reel", "gegenlesen", "c-0007", "--nicht-kopieren");
    expect(fs.readFileSync(e("plan.json"), "utf8")).toBe(fs.readFileSync(e("plan-vor-gegenlesen.json"), "utf8"));
    expect(kopiert).toEqual([]);
  }, 120_000);

  it("gegenlesen: nimmt die Antwort auch aus der Zwischenablage (mit Text und Codezaun) und verlangt «gelesen»", async () => {
    await vorbereitet();
    zwischenablage = "Hier das Ergebnis:\n```json\n" + JSON.stringify({ gelesen: true, schnitte: [], woerter: [] }) + "\n```";
    expect(await lauf("reel", "gegenlesen", "c-0007", "--zwischenablage", "--nicht-kopieren")).toBe(0);
    expect(JSON.parse(fs.readFileSync(studio("inhalte", "c-0007", "ergebnis", "gegenlesen.json"), "utf8")).gelesen).toBe(true);
    zwischenablage = JSON.stringify({ gelesen: false });
    await expect(lauf("reel", "gegenlesen", "c-0007", "--zwischenablage")).rejects.toThrow(/gelesen/);
    zwischenablage = "Kein JSON hier.";
    await expect(lauf("reel", "gegenlesen", "c-0007", "--zwischenablage")).rejects.toThrow(/kein JSON/);
  }, 120_000);

  it("gegenlesen: ohne Plan und ohne Antwort gibt es klare Fehler", async () => {
    await expect(lauf("reel", "gegenlesen", "c-0007")).rejects.toThrow(/zuerst «.\/studio reel vorbereiten c-0007»/);
    await vorbereitet();
    await expect(lauf("reel", "gegenlesen", "c-0007")).rejects.toThrow(/Ergebnis des Gegenlesens fehlt.*gegenlesen\.md/s);
  }, 120_000);

  it("storyboard: verweigert ohne Gegenlesen und wenn der Plan seither neu gebaut wurde; --ohne-gegenlesen ist die ausdrückliche Ausnahme", async () => {
    await vorbereitet();
    zwischenablage = antwort([]);
    await expect(lauf("reel", "storyboard", "c-0007", "--zwischenablage", "--entwurf")).rejects.toThrow(/Gegenlesen fehlt oder gilt nicht mehr.*reel gegenlesen c-0007/s);
    expect(fs.existsSync(studio("inhalte", "c-0007", "ergebnis", "storyboard.json"))).toBe(false);
    // mit Gegenlesen geht es
    fs.writeFileSync(studio("inhalte", "c-0007", "ergebnis", "gegenlesen.json"), JSON.stringify({ gelesen: true }));
    await lauf("reel", "gegenlesen", "c-0007", "--nicht-kopieren");
    mockRender();
    expect(await lauf("reel", "storyboard", "c-0007", "--zwischenablage", "--entwurf", "--ohne-vorschau", "--nicht-oeffnen")).toBe(0);
    // ein neuer Plan entwertet das Gegenlesen
    await lauf("reel", "vorbereiten", "c-0007", "--ohne-pegel");
    await expect(lauf("reel", "storyboard", "c-0007", "--entwurf", "--ohne-vorschau")).rejects.toThrow(/Gegenlesen fehlt oder gilt nicht mehr/);
    // und von Hand geänderte plan.json auch
    expect(await lauf("reel", "storyboard", "c-0007", "--entwurf", "--ohne-vorschau", "--nicht-oeffnen", "--ohne-gegenlesen")).toBe(0);
    expect(text()).toContain("Ohne Gegenlesen (--ohne-gegenlesen)");
  }, 240_000);

  it("transkript: schreibt die Sätze mit Zeiten zum Auswählen, ohne dass ein Skript da sein muss", async () => {
    await lauf("reel", "neu", "c-0007", "--marke", "alperna", "--nicht-oeffnen");
    ersatzWhisper(whisperJson(testSatz(1, "Und Action"), testSatz(3, Z1), testSatz(10, Z2)));
    legeVideoAn("Sprache 01.mp4", 20);
    expect(await lauf("reel", "transkript", "c-0007")).toBe(0);
    const md = fs.readFileSync(studio("inhalte", "c-0007", "ergebnis", "transkript.md"), "utf8");
    expect(md).toContain("# Transkript: c-0007");
    expect(md).toMatch(/1\. \[1,0 bis [\d,]+ s\] Und Action/);
    expect(md).toMatch(/2\. \[3,0 bis [\d,]+ s\] Wir haben diese Woche/);
    expect(md).toContain("wörtlich");
    expect(text()).toMatch(/skript\.md.*reel vorbereiten c-0007/s);
    expect(fs.existsSync(studio("inhalte", "c-0007", "ergebnis", "plan.json"))).toBe(false);
  }, 120_000);

  it("storyboard: Antwort aus der Zwischenablage (mit Text und Codezaun) wird gespeichert, angewendet, gerendert; Kontaktbogen und Vorschau entstehen und öffnen sich", async () => {
    await bereit();
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
    await bereit();
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
    await bereit();
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
    await bereit();
    await expect(lauf("reel", "storyboard", "c-0007")).rejects.toThrow(/Storyboard fehlt.*--zwischenablage/s);
    zwischenablage = "Das ist leider kein JSON.";
    await expect(lauf("reel", "storyboard", "c-0007", "--zwischenablage")).rejects.toThrow(/kein Storyboard als JSON/);
    expect(fs.existsSync(studio("inhalte", "c-0007", "ergebnis", "storyboard.json"))).toBe(false);
    const datei = path.join(tmp, "sb.json");
    fs.writeFileSync(datei, JSON.stringify({ hook: "x", overlays: [], betonung: [] }));
    expect(await lauf("reel", "storyboard", "c-0007", "--datei", datei, "--ohne-vorschau", "--nicht-oeffnen")).toBe(0);
  }, 120_000);

  it("uebergabe: schreibt den Resolve-Ordner; Stücke, die nicht aktiv sind, brauchen --entwurf; ein zweiter Lauf überschreibt nichts", async () => {
    await bereit();
    mockRender();
    zwischenablage = antwort([zahl()]);
    await lauf("reel", "storyboard", "c-0007", "--zwischenablage", "--entwurf", "--ohne-vorschau", "--nicht-oeffnen");
    await expect(lauf("reel", "uebergabe", "c-0007")).rejects.toThrow(/nicht aktiv|aktiv/);
    expect(fs.existsSync(studio("inhalte", "c-0007", "ergebnis", "resolve"))).toBe(false);
    expect(await lauf("reel", "uebergabe", "c-0007", "--entwurf")).toBe(0);
    const ordner = studio("inhalte", "c-0007", "ergebnis", "resolve");
    // das Testbild gilt als normal: Der Angleich der Marke liegt als LUT bei
    expect(fs.readdirSync(ordner).sort()).toEqual(["LIESMICH.md", "lut", "overlays", "plan.json", "timeline.fcpxml", "timeline.otio", "untertitel.srt"]);
    expect(fs.readdirSync(path.join(ordner, "lut"))).toEqual(["farbe-angleich.cube"]);
    expect(fs.readFileSync(path.join(ordner, "LIESMICH.md"), "utf8")).toMatch(/## Betonte Wörter[\s\S]*Küche/);
    expect(await lauf("reel", "uebergabe", "c-0007", "--entwurf")).toBe(0);
    expect(fs.existsSync(`${ordner}-v2`)).toBe(true);
    expect(text()).toContain("LIESMICH.md");
  }, 240_000);

  it("uebergabe: ohne Storyboard geht es mit der Sprache allein und sagt das; ohne Plan ist es ein Fehler", async () => {
    await expect(lauf("reel", "uebergabe", "c-0007")).rejects.toThrow(/zuerst «.\/studio reel vorbereiten c-0007»/);
    await bereit();
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
    expect(text()).toMatch(/Gegenlesen\s+nein/);
    expect(text()).toMatch(/Nächster Schritt: ergebnis\/gegenlesen\.md vollständig lesen/);
    fs.writeFileSync(studio("inhalte", "c-0007", "ergebnis", "gegenlesen.json"), JSON.stringify({ gelesen: true }));
    await lauf("reel", "gegenlesen", "c-0007", "--nicht-kopieren");
    ausgabe.length = 0;
    await lauf("reel", "status", "c-0007");
    expect(text()).toMatch(/Gegenlesen\s+ja/);
    expect(text()).toMatch(/Storyboard\s+nein/);
    ausgabe.length = 0;
    await lauf("reel", "status");
    expect(text()).toMatch(/^c-0007: Den Auftrag/m);
  }, 120_000);
});

describe("transkriptMarkdown", () => {
  it("nummeriert die Sätze über alle Quellen und nennt die Zeiten der Quelldatei", () => {
    const md = transkriptMarkdown("t", [
      { quelle: "a", segmente: [{ von: 1, bis: 2.5, text: "Eins" }, { von: 3, bis: 4, text: "Zwei" }] },
      { quelle: "b", segmente: [{ von: 0, bis: 1, text: "Drei" }] },
    ]);
    expect(md).toContain("## Quelle a");
    expect(md).toContain("1. [1,0 bis 2,5 s] Eins");
    expect(md).toContain("2. [3,0 bis 4,0 s] Zwei");
    expect(md).toContain("## Quelle b");
    expect(md).toContain("3. [0,0 bis 1,0 s] Drei");
  });
});

describe("reel", () => {
  it("ein unbekannter Unterbefehl nennt die Hilfe und gibt 2 zurück", async () => {
    expect(await lauf("reel", "quatsch")).toBe(2);
    expect(text()).toContain("reel vorbereiten <ID>");
  });
});

describe.skipIf(!hatFfmpeg)("reel vorbereiten mit getrenntem Ton", () => {
  /** Ein «Sprach»signal: Rauschen mit unregelmässigen Pausen (60 s). Kamera und Recorder hören dasselbe, jede mit anderem Klang. */
  const welt = (): string => {
    const w = path.join(tmp, "welt.wav");
    ff("-f", "lavfi", "-i", "aevalsrc='(random(0)*2-1)*(between(mod(t,2.3),0,0.7)+between(mod(t,3.7),1,1.6)+0.2*between(mod(t,5.9),2,3))':s=16000:d=60", w);
    return w;
  };
  const fremd = (): string => {
    const w = path.join(tmp, "fremd.wav");
    ff("-f", "lavfi", "-i", "aevalsrc='(random(0)*2-1)*(between(mod(t,1.9),0,0.4)+between(mod(t,4.3),2,3.3))':s=16000:d=60", w);
    return w;
  };
  const kamera = (dauer = 45, mitTon = true): string => {
    fs.mkdirSync(medien("rohmaterial", "c-0007"), { recursive: true });
    const ziel = medien("rohmaterial", "c-0007", "Sprache 01.mp4");
    if (mitTon) ff("-f", "lavfi", "-i", `testsrc2=size=320x568:rate=25:duration=${dauer}`, "-i", welt(), "-t", String(dauer), "-af", "lowpass=f=2500,volume=0.3", "-shortest", ziel);
    else ff("-f", "lavfi", "-i", `testsrc2=size=320x568:rate=25:duration=${dauer}`, ziel);
    return ziel;
  };
  /** Der Recorder lief `vorlauf` Sekunden vor der Kamera. */
  const recorder = (vorlauf: number, name = "Recorder 01.wav"): string => {
    const ziel = medien("rohmaterial", "c-0007", name);
    if (!fs.existsSync(path.join(tmp, "welt.wav"))) welt();
    ff("-i", path.join(tmp, "welt.wav"), "-af", `adelay=${vorlauf * 1000}|${vorlauf * 1000},volume=1.5`, "-t", "60", ziel);
    return ziel;
  };
  const start = async (): Promise<ReturnType<typeof ersatzWhisper>> => {
    zwischenablage = SKRIPT;
    await lauf("reel", "neu", "c-0007", "--marke", "alperna", "--zwischenablage", "--nicht-oeffnen");
    return ersatzWhisper(whisperJson(testSatz(1, Z1), testSatz(10, Z2), testSatz(20, Z3)));
  };
  const planLesen = () => leseSchnittplan(JSON.parse(fs.readFileSync(studio("inhalte", "c-0007", "ergebnis", "plan.json"), "utf8")));

  it("legt die Tonaufnahme im Ordner über das Video: Versatz gemessen, Stück der Aufnahme geschnitten, Whisper hört darauf, der Plan trägt Ton und Versatz und ist gültig", async () => {
    const w = await start();
    kamera();
    recorder(4);
    vi.mocked(findeStille).mockClear();
    expect(await lauf("reel", "vorbereiten", "c-0007", "--ohne-pegel")).toBe(0);
    const plan = planLesen();
    const q = plan.quellen.find((x) => x.id === "sprache-01")!;
    expect(q.ton!.quelle).toBe("recorder-01");
    expect(q.ton!.versatz).toBeCloseTo(4, 1);
    expect(plan.quellen.find((x) => x.id === "recorder-01")).toMatchObject({ art: "audio", pfad: "rohmaterial/c-0007/Recorder 01.wav" });
    expect(text()).toMatch(/Ton: sprache-01 ← recorder-01, Versatz \+4,00 s \(gemessen, Sicherheit (hoch|mittel)/);
    // Whisper hat das Stück der Aufnahme gehört, nicht die Kameraspur
    expect(w.eingaben()).toEqual([studio("inhalte", "c-0007", "ergebnis", "ton", "sprache-01.wav")]);
    const probe = JSON.parse(spawnSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", studio("inhalte", "c-0007", "ergebnis", "ton", "sprache-01.wav")]).stdout.toString());
    expect(Number(probe.streams[0].duration)).toBeCloseTo(45, 0);
    expect(text()).toContain("Ton von Recorder 01.wav mit Versatz +4,00 s");
    // Die Stille wird am Stück der Aufnahme gemessen (Zeit des Videos), nicht an der Kameraspur
    expect(vi.mocked(findeStille).mock.calls.map((c) => c[0])).toEqual([studio("inhalte", "c-0007", "ergebnis", "ton", "sprache-01.wav")]);
    expect(pruefeSchnittplan(plan).filter((b) => b.stufe === "fehler")).toEqual([]);
    // Die Aufnahme ist keine Videoquelle: kein Clip kommt von ihr
    expect(plan.clips.every((c) => c.quelle === "sprache-01")).toBe(true);
    // gemessene Versätze werden nicht in reel.json gemerkt (nur die von Hand)
    expect(JSON.parse(fs.readFileSync(studio("inhalte", "c-0007", "reel.json"), "utf8")).versatz).toBeUndefined();
  }, 180_000);

  it("--ohne-ton-sync lässt den Ton der Kamera gelten: kein Ton im Plan, Whisper hört das Video", async () => {
    const w = await start();
    kamera();
    recorder(4);
    expect(await lauf("reel", "vorbereiten", "c-0007", "--ohne-pegel", "--ohne-ton-sync")).toBe(0);
    const plan = planLesen();
    expect(plan.quellen.map((x) => x.id)).toEqual(["sprache-01"]);
    expect(plan.quellen[0]!.ton).toBeUndefined();
    expect(w.eingaben()).toEqual([medien("rohmaterial", "c-0007", "Sprache 01.mp4")]);
    expect(text()).toContain("--ohne-ton-sync");
  }, 180_000);

  it("eine fremde Aufnahme wird nicht benutzt und der Weg zur Handeingabe wird genannt", async () => {
    await start();
    kamera();
    fremd();
    fs.copyFileSync(path.join(tmp, "fremd.wav"), medien("rohmaterial", "c-0007", "Fremd.wav"));
    expect(await lauf("reel", "vorbereiten", "c-0007", "--ohne-pegel")).toBe(0);
    expect(planLesen().quellen.map((x) => x.id)).toEqual(["sprache-01"]);
    expect(text()).toMatch(/Ton unsicher, nicht benutzt: sprache-01|Kein Ton gefunden für sprache-01/);
    expect(text()).toContain("--versatz sprache-01=<Sekunden>");
  }, 180_000);

  it("--versatz von Hand gilt auch ohne Übereinstimmung, wird in reel.json gemerkt und beim nächsten Lauf wieder benutzt", async () => {
    const w = await start();
    kamera();
    fremd();
    fs.copyFileSync(path.join(tmp, "fremd.wav"), medien("rohmaterial", "c-0007", "Fremd.wav"));
    expect(await lauf("reel", "vorbereiten", "c-0007", "--ohne-pegel", "--versatz", "7.25")).toBe(0);
    expect(planLesen().quellen.find((x) => x.id === "sprache-01")!.ton).toEqual({ quelle: "fremd", versatz: 7.25 });
    expect(JSON.parse(fs.readFileSync(studio("inhalte", "c-0007", "reel.json"), "utf8")).versatz).toEqual({ "sprache-01": { versatz: 7.25 } });
    expect(text()).toContain("Versatz +7,25 s (von Hand)");
    // nächster Lauf ohne Schalter: derselbe Versatz, das Transkript bleibt (gleicher Stand), Whisper läuft nicht nochmal
    ausgabe.length = 0;
    expect(await lauf("reel", "vorbereiten", "c-0007", "--ohne-pegel")).toBe(0);
    expect(planLesen().quellen.find((x) => x.id === "sprache-01")!.ton!.versatz).toBe(7.25);
    expect(w.aufrufe()).toBe(1);
    expect(text()).toContain("Transkript vorhanden: sprache-01");
    // ein anderer Versatz ändert den Stand: Stück neu schneiden und Whisper neu laufen lassen
    await lauf("reel", "vorbereiten", "c-0007", "--ohne-pegel", "--versatz", "sprache-01=8");
    expect(w.aufrufe()).toBe(2);
    expect(planLesen().quellen.find((x) => x.id === "sprache-01")!.ton!.versatz).toBe(8);
    // das Stück der Aufnahme ist neu geschnitten: sein Stand nennt den neuen Versatz
    expect(JSON.parse(fs.readFileSync(studio("inhalte", "c-0007", "ergebnis", "ton", "sprache-01.stand.json"), "utf8")).ton.versatz).toBe(8);
    // ohne Ton-Abgleich: wieder die Kamera, und das Transkript ist neu zu machen, weil es vom Stück der Aufnahme stammte
    await lauf("reel", "vorbereiten", "c-0007", "--ohne-pegel", "--ohne-ton-sync");
    expect(w.aufrufe()).toBe(3);
    expect(planLesen().quellen.map((x) => x.id)).toEqual(["sprache-01"]);
  }, 300_000);

  it("eine Kamera ganz ohne Tonspur geht nur mit Versatz von Hand, und die Stille wird trotzdem an der Aufnahme gemessen", async () => {
    await start();
    kamera(45, false);
    recorder(4);
    vi.mocked(findeStille).mockClear();
    expect(await lauf("reel", "vorbereiten", "c-0007", "--ohne-pegel")).toBe(0);
    expect(planLesen().quellen.find((x) => x.id === "sprache-01")!.ton).toBeUndefined();
    expect(text()).toContain("Kein Ton gefunden für sprache-01");
    expect(vi.mocked(findeStille)).not.toHaveBeenCalled();
    ausgabe.length = 0;
    expect(await lauf("reel", "vorbereiten", "c-0007", "--ohne-pegel", "--versatz", "4")).toBe(0);
    expect(planLesen().quellen.find((x) => x.id === "sprache-01")!.ton).toEqual({ quelle: "recorder-01", versatz: 4 });
    expect(vi.mocked(findeStille).mock.calls.map((c) => c[0])).toEqual([studio("inhalte", "c-0007", "ergebnis", "ton", "sprache-01.wav")]);
    expect(pruefeSchnittplan(planLesen()).map((b) => b.code)).not.toContain("clip-ohne-ton");
  }, 180_000);

  it("ein Versatz, der den Clip vor den Beginn der Aufnahme legt, scheitert in der Prüfung und steht im Bericht als Fehler", async () => {
    await start();
    kamera();
    recorder(4);
    // Versatz −5: Der erste Clip beginnt bei etwa 1 s im Video, das wäre −4 s in der Aufnahme
    expect(await lauf("reel", "vorbereiten", "c-0007", "--ohne-pegel", "--versatz", "-5")).toBe(0);
    expect(text()).toMatch(/FEHLER\s+ton-vor-beginn/);
  }, 180_000);

  it("--versatz mit falscher Schreibweise oder unbekanntem Video bricht vorher ab", async () => {
    await start();
    kamera();
    recorder(4);
    await expect(lauf("reel", "vorbereiten", "c-0007", "--versatz", "fünf")).rejects.toThrow(/nicht lesbar/);
    await expect(lauf("reel", "vorbereiten", "c-0007", "--versatz", "gibt-es-nicht=3")).rejects.toThrow(/keine Videoquelle/);
  }, 120_000);

  it("reel transkript legt den Ton ebenfalls über das Video und schreibt die Quellen mit Ton", async () => {
    await start();
    kamera();
    recorder(4);
    expect(await lauf("reel", "transkript", "c-0007")).toBe(0);
    const quellen = JSON.parse(fs.readFileSync(studio("inhalte", "c-0007", "ergebnis", "quellen.json"), "utf8"));
    expect(quellen.find((x: { id: string }) => x.id === "sprache-01").ton.quelle).toBe("recorder-01");
    expect(quellen.map((x: { id: string }) => x.id)).toEqual(["sprache-01", "recorder-01"]);
  }, 180_000);
});

describe.skipIf(!hatFfmpeg)("reel vorbereiten mit Farbe", () => {
  const start = async (): Promise<void> => {
    zwischenablage = SKRIPT;
    await lauf("reel", "neu", "c-0007", "--marke", "alperna", "--zwischenablage", "--nicht-oeffnen");
    ersatzWhisper(whisperJson(testSatz(1, Z1), testSatz(10, Z2), testSatz(20, Z3)));
  };
  /** `flach`: wenig Kontrast und kaum Farbe wie Log-Material. */
  const video = (flach: boolean, name = "Sprache 01.mp4", dauer = 45): string => {
    fs.mkdirSync(medien("rohmaterial", "c-0007"), { recursive: true });
    const ziel = medien("rohmaterial", "c-0007", name);
    ff("-f", "lavfi", "-i", `testsrc2=size=320x568:rate=25:duration=${dauer}`, "-f", "lavfi", "-i", `sine=frequency=300:duration=${dauer}`, ...(flach ? ["-vf", "eq=contrast=0.35:saturation=0.15,format=yuv420p"] : []), "-shortest", ziel);
    return ziel;
  };
  const planLesen = () => leseSchnittplan(JSON.parse(fs.readFileSync(studio("inhalte", "c-0007", "ergebnis", "plan.json"), "utf8")));
  const lutPfad = (n: string) => studio("inhalte", "c-0007", "ergebnis", "lut", n);

  it("flaches Material wird als Log erkannt, bekommt die LUT «log» mit gemessenen Punkten, der Plan trägt die Farbart", async () => {
    await start();
    video(true);
    expect(await lauf("reel", "vorbereiten", "c-0007", "--ohne-pegel")).toBe(0);
    expect(planLesen().quellen[0]!.farbe).toBe("log");
    expect(text()).toMatch(/Farbe: sprache-01: sieht nach Log \(flach\) aus, unsicher/);
    expect(text()).toMatch(/Look: farbe-log\.cube für sprache-01 \(Schwarzpunkt 0,\d\d, Weisspunkt 0,\d\d, am Material gemessen\)/);
    expect(fs.existsSync(lutPfad("farbe-log.cube"))).toBe(true);
    expect(fs.existsSync(lutPfad("farbe-angleich.cube"))).toBe(true);
  }, 180_000);

  it("normales Material bekommt nur den Angleich", async () => {
    await start();
    video(false);
    expect(await lauf("reel", "vorbereiten", "c-0007", "--ohne-pegel")).toBe(0);
    expect(planLesen().quellen[0]!.farbe).toBe("rec709");
    expect(fs.existsSync(lutPfad("farbe-log.cube"))).toBe(false);
    expect(fs.existsSync(lutPfad("farbe-angleich.cube"))).toBe(true);
  }, 180_000);

  it("--farbe setzt die Farbart von Hand, wird in reel.json gemerkt und gilt beim nächsten Lauf; --farbe auto kehrt zur Messung zurück", async () => {
    await start();
    video(false);
    await lauf("reel", "vorbereiten", "c-0007", "--ohne-pegel", "--farbe", "log");
    expect(planLesen().quellen[0]!.farbe).toBe("log");
    expect(text()).toContain("(von Hand, --farbe)");
    expect(JSON.parse(fs.readFileSync(studio("inhalte", "c-0007", "reel.json"), "utf8")).farbe).toBe("log");
    expect(fs.existsSync(lutPfad("farbe-log.cube"))).toBe(true);
    await lauf("reel", "vorbereiten", "c-0007", "--ohne-pegel");
    expect(planLesen().quellen[0]!.farbe).toBe("log");
    await lauf("reel", "vorbereiten", "c-0007", "--ohne-pegel", "--farbe", "auto");
    expect(planLesen().quellen[0]!.farbe).toBe("rec709");
    expect(JSON.parse(fs.readFileSync(studio("inhalte", "c-0007", "reel.json"), "utf8")).farbe).toBeUndefined();
    expect(fs.existsSync(lutPfad("farbe-log.cube"))).toBe(false);
    await expect(lauf("reel", "vorbereiten", "c-0007", "--farbe", "bunt")).rejects.toThrow(/log.*rec709.*auto/);
  }, 300_000);

  it("--ohne-farbe misst nichts, setzt keine Farbart und entfernt LUTs aus einem früheren Lauf", async () => {
    await start();
    video(true);
    await lauf("reel", "vorbereiten", "c-0007", "--ohne-pegel");
    expect(fs.existsSync(lutPfad("farbe-log.cube"))).toBe(true);
    ausgabe.length = 0;
    await lauf("reel", "vorbereiten", "c-0007", "--ohne-pegel", "--ohne-farbe");
    expect(planLesen().quellen[0]!.farbe).toBeUndefined();
    expect(text()).toContain("--ohne-farbe");
    expect(fs.existsSync(path.join(studio("inhalte", "c-0007", "ergebnis", "lut")))).toBe(false);
  }, 300_000);

  it("die Übergabe nimmt die LUTs des Inhalts mit und nennt sie in der Anleitung; --ohne-look lässt sie weg", async () => {
    await start();
    video(true);
    await lauf("reel", "vorbereiten", "c-0007", "--ohne-pegel");
    fs.writeFileSync(studio("inhalte", "c-0007", "ergebnis", "gegenlesen.json"), JSON.stringify({ gelesen: true, schnitte: [], woerter: [] }));
    await lauf("reel", "gegenlesen", "c-0007", "--nicht-kopieren");
    expect(await lauf("reel", "uebergabe", "c-0007", "--nicht-strikt")).toBe(0);
    const resolve = studio("inhalte", "c-0007", "ergebnis", "resolve");
    expect(fs.readdirSync(path.join(resolve, "lut")).sort()).toEqual(["farbe-angleich.cube", "farbe-log.cube"]);
    expect(fs.readFileSync(path.join(resolve, "LIESMICH.md"), "utf8")).toContain("`lut/farbe-log.cube` für Clips aus Log-Quellen (sprache-01)");
    // eine zweite Fassung ohne Look: neuer Ordner ohne lut/
    const r = await schnittBefehl("resolve", parseArgs(["schnitt", "resolve", "--plan", studio("inhalte", "c-0007", "ergebnis", "plan.json"), "--aus", resolve, "--nicht-strikt", "--ohne-look"]), env);
    expect(r).toBe(0);
    expect(fs.existsSync(path.join(`${resolve}-v2`, "lut"))).toBe(false);
    expect(fs.readFileSync(path.join(`${resolve}-v2`, "LIESMICH.md"), "utf8")).toContain("Eine LUT liegt nicht bei");
  }, 300_000);

  it("die Vorschau über schnitt vorschau findet die LUTs des Inhalts selbst und sagt «mit Look»", async () => {
    await start();
    video(true);
    await lauf("reel", "vorbereiten", "c-0007", "--ohne-pegel");
    ausgabe.length = 0;
    const plan = studio("inhalte", "c-0007", "ergebnis", "plan.json");
    expect(await schnittBefehl("vorschau", parseArgs(["schnitt", "vorschau", "--plan", plan, "--ohne-untertitel", "-o", path.join(tmp, "v.mp4")]), env)).toBe(0);
    expect(text()).toContain("mit Look (LUT)");
    ausgabe.length = 0;
    expect(await schnittBefehl("vorschau", parseArgs(["schnitt", "vorschau", "--plan", plan, "--ohne-untertitel", "--ohne-look", "-o", path.join(tmp, "w.mp4")]), env)).toBe(0);
    expect(text()).toContain("ohne Look");
  }, 300_000);
});

describe("juengsterExport", () => {
  let dir: string;
  beforeEach(() => void (dir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-export-"))));
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
  it("nimmt die Videodatei mit der jüngsten Änderungszeit und überspringt Versteckte, Ordner und Fremdes", () => {
    const lege = (n: string, vor: number) => {
      fs.writeFileSync(path.join(dir, n), "x");
      const t = new Date(Date.now() - vor * 1000);
      fs.utimesSync(path.join(dir, n), t, t);
    };
    lege("alt.mp4", 100);
    lege("neu.MOV", 10);
    lege(".versteckt.mp4", 1);
    lege("notiz.txt", 0);
    fs.mkdirSync(path.join(dir, "ordner.mp4"));
    expect(juengsterExport(dir)).toBe(path.join(dir, "neu.MOV"));
  });
  it("ohne Ordner oder ohne Video gibt es nichts", () => {
    expect(juengsterExport(path.join(dir, "gibt-es-nicht"))).toBeUndefined();
    expect(juengsterExport(dir)).toBeUndefined();
  });
});

describe.skipIf(!hatFfmpeg)("reel messe", () => {
  const start = async (): Promise<void> => {
    zwischenablage = SKRIPT;
    await lauf("reel", "neu", "c-0007", "--marke", "alperna", "--zwischenablage", "--nicht-oeffnen");
  };
  /** Ein «Export» von 6 s mit zwei harten Bildwechseln und Ton ab 1 s. */
  const exportDatei = (ziel: string): string => {
    fs.mkdirSync(path.dirname(ziel), { recursive: true });
    ff("-f", "lavfi", "-i", "testsrc=size=216x384:rate=25:duration=2", "-f", "lavfi", "-i", "color=c=red:size=216x384:rate=25:duration=2", "-f", "lavfi", "-i", "testsrc=size=216x384:rate=25:duration=2", "-f", "lavfi", "-i", "aevalsrc=if(gt(t\\,1)\\,0.3*sin(2*PI*300*t)\\,0):s=48000:d=6", "-filter_complex", "[0:v]format=yuv420p[a];[1:v]format=yuv420p[b];[2:v]format=yuv420p[c];[a][b][c]concat=n=3:v=1[v]", "-map", "[v]", "-map", "3:a", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", ziel);
    return ziel;
  };

  it("ohne Video gibt es einen klaren Fehler mit dem Ablageort", async () => {
    await start();
    await expect(lauf("reel", "messe", "c-0007")).rejects.toThrow(/Export aus Resolve in .*ergebnis\/export.*--video/);
    await expect(lauf("reel", "messe", "c-0007", "--video", path.join(tmp, "fehlt.mp4"))).rejects.toThrow(/Video fehlt/);
  });

  it("misst die jüngste Datei in ergebnis/export, schreibt qualitaet.json mit Abweichungen und Hinweisen und endet mit 1, wenn es Abweichungen gibt", async () => {
    await start();
    exportDatei(studio("inhalte", "c-0007", "ergebnis", "export", "v1.mp4"));
    expect(await lauf("reel", "messe", "c-0007")).toBe(1);
    const q = JSON.parse(fs.readFileSync(studio("inhalte", "c-0007", "ergebnis", "qualitaet.json"), "utf8"));
    expect(q.datei).toBe(studio("inhalte", "c-0007", "ergebnis", "export", "v1.mp4"));
    expect(q.dauer).toBeCloseTo(6, 0);
    expect(q.schnitte).toMatchObject({ anzahl: 2, quelle: "bild" });
    expect(q.ersteAussage.quelle).toBe("ton");
    expect(q.abweichungen.map((a: { code: string }) => a.code)).toEqual(expect.arrayContaining(["groesse", "bitrate"]));
    expect(text()).toContain("Schnitte: 2");
    expect(text()).toContain("Abweichungen vom Export- und Audio-Preset");
    expect(text()).toContain("(ohne Plan)");
  }, 120_000);

  it("mit --video gilt diese Datei, und ein Plan, der nicht zur Länge passt, wird nicht benutzt und genannt", async () => {
    await start();
    ersatzWhisper(whisperJson(testSatz(1, Z1), testSatz(10, Z2), testSatz(20, Z3)));
    legeVideoAn();
    await lauf("reel", "vorbereiten", "c-0007", "--ohne-pegel", "--ohne-farbe");
    ausgabe.length = 0;
    const datei = exportDatei(path.join(tmp, "irgendwo", "mein-export.mp4"));
    await lauf("reel", "messe", "c-0007", "--video", datei);
    expect(text()).toContain("Plan plan.json");
    expect(text()).toContain("passt nicht zum Video");
    const q = JSON.parse(fs.readFileSync(studio("inhalte", "c-0007", "ergebnis", "qualitaet.json"), "utf8"));
    expect(q.planHinweis).toContain("passt nicht zum Video");
    expect(q.schnitte.quelle).toBe("bild");
  }, 180_000);
});
