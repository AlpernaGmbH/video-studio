import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseArgs } from "../args";
import { Markenprofil } from "../core/schemas";
import { umgebung, type Umgebung } from "../motion/werkstatt";
import { schnittBefehl } from "./befehle";
import { leseSchnittplan } from "./plan";
import { pruefeSchnittplan } from "./pruefung";
import { testSatz } from "./testdaten";
import type { Segment } from "./transkript";

const hatFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
const root = path.resolve(import.meta.dirname, "..", "..");
const beispiel = JSON.parse(fs.readFileSync(path.join(root, "prompts", "beispiele", "schnittplan.json"), "utf8")) as Record<string, any>;
const alperna = Markenprofil.parse(JSON.parse(fs.readFileSync(path.join(root, "marken", "alperna.json"), "utf8")));

let tmp: string;
let env: Umgebung;
let ausgabe: string[];
let fehlerAusgabe: string[];

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "studio-schnitt-"));
  env = { ...umgebung(root), datenDir: path.join(tmp, "daten") };
  ausgabe = [];
  fehlerAusgabe = [];
  vi.spyOn(console, "log").mockImplementation((...x: unknown[]) => void ausgabe.push(x.join(" ")));
  vi.spyOn(console, "error").mockImplementation((...x: unknown[]) => void fehlerAusgabe.push(x.join(" ")));
  vi.stubEnv("STUDIO_HOME", path.join(tmp, "Studio"));
  vi.stubEnv("STUDIO_MEDIEN", path.join(tmp, "Medien"));
  vi.stubEnv("STUDIO_CONFIG", path.join(tmp, "keine-config.json"));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const lauf = (...argv: string[]): Promise<number> => schnittBefehl(argv[1]!, parseArgs(argv), env);
const schreibe = (name: string, inhalt: unknown): string => {
  const d = path.join(tmp, name);
  fs.writeFileSync(d, typeof inhalt === "string" ? inhalt : JSON.stringify(inhalt));
  return d;
};
const legeDateienAn = (plan: any): void => {
  for (const rel of [...plan.quellen.map((q: any) => q.pfad), ...(plan.overlays ?? []).map((o: any) => o.datei)] as string[]) {
    const wurzel = /^(rohmaterial|renders|inspiration)\//.test(rel) ? "Medien" : "Studio";
    const p = path.join(tmp, wurzel, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, "x");
  }
};

describe("Beispielplan", () => {
  it("ist ein gültiger Schnittplan ohne Fehler und ohne Hinweise zum Schnittprofil der Marke Alperna", () => {
    const plan = leseSchnittplan(beispiel);
    expect(pruefeSchnittplan(plan, { profil: alperna.schnittprofil })).toEqual([]);
  });
  it("«schnitt beispiel» gibt ihn aus", async () => {
    expect(await lauf("schnitt", "beispiel")).toBe(0);
    expect(JSON.parse(ausgabe.join("\n"))).toEqual(beispiel);
  });
});

describe("schnitt pruefe", () => {
  it("Regel 3: der Beispielplan nennt zahl-zaehler, das noch nicht «aktiv» ist: Fehler, mit --entwurf erlaubt", async () => {
    const plan = schreibe("plan.json", beispiel);
    expect(await lauf("schnitt", "pruefe", "--plan", plan)).toBe(1);
    expect(ausgabe.join("\n")).toContain("effekt-nicht-aktiv");
    ausgabe.length = 0;
    expect(await lauf("schnitt", "pruefe", "--plan", plan, "--entwurf")).toBe(0);
    expect(ausgabe.join("\n")).toContain("0 Fehler");
  });

  it("ein kaputter Plan wird mit dem Pfad zur Stelle abgelehnt", async () => {
    const plan = schreibe("plan.json", { ...beispiel, clips: [] });
    await expect(lauf("schnitt", "pruefe", "--plan", plan)).rejects.toThrow(/clips/);
  });
});

describe("schnitt resolve", () => {
  it("schreibt den Ordner und nennt den nächsten Schritt", async () => {
    const plan = { ...beispiel, overlays: [{ ...beispiel["overlays"][0], datei: "renders/c-0007/zahl-7.mov" }] };
    legeDateienAn(plan);
    const datei = schreibe("plan.json", plan);
    const code = await lauf("schnitt", "resolve", "--plan", datei, "--entwurf");
    expect(code).toBe(0);
    const ordner = path.join(tmp, "Studio", "inhalte", "c-0007", "ergebnis", "resolve");
    expect(fs.readdirSync(ordner).sort()).toEqual(["LIESMICH.md", "plan.json", "timeline.fcpxml", "timeline.otio", "untertitel.srt"]);
    expect(ausgabe.join("\n")).toContain("LIESMICH.md");
  });

  it("verweigert fehlende Dateien, solange nicht --nicht-strikt gesetzt ist", async () => {
    const plan = { ...beispiel, overlays: [] };
    const datei = schreibe("plan.json", plan);
    await expect(lauf("schnitt", "resolve", "--plan", datei, "--aus", path.join(tmp, "aus"))).rejects.toThrow(/fehlen/);
    expect(await lauf("schnitt", "resolve", "--plan", datei, "--aus", path.join(tmp, "aus"), "--nicht-strikt")).toBe(0);
    expect(ausgabe.join("\n")).toContain("datei-fehlt");
  });

  it("ohne eingerichteten Studio-Ordner ein klarer Fehler", async () => {
    vi.stubEnv("STUDIO_HOME", "");
    const datei = schreibe("plan.json", beispiel);
    await expect(lauf("schnitt", "resolve", "--plan", datei)).rejects.toThrow(/studio init/);
  });
});

describe.skipIf(!hatFfmpeg)("schnitt export-pruefen und sondiere", () => {
  it("sondiere liefert Quellen mit Pfad relativ zum Medien-Ordner, ausserhalb ein Hinweis und Exit-Code 1", async () => {
    const dir = path.join(tmp, "Medien", "rohmaterial");
    fs.mkdirSync(dir, { recursive: true });
    const datei = path.join(dir, "Sprache 01.mp4");
    const q = spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=320x568:rate=25:duration=1", "-f", "lavfi", "-i", "sine=duration=1", "-shortest", datei]);
    expect(q.status).toBe(0);
    expect(await lauf("schnitt", "sondiere", datei)).toBe(0);
    const r = JSON.parse(ausgabe.join("\n"));
    expect(r[0]).toMatchObject({ id: "sprache-01", pfad: "rohmaterial/Sprache 01.mp4", art: "video", fps: 25, breite: 320, hoehe: 568, hatAudio: true });
    ausgabe.length = 0;
    const draussen = path.join(tmp, "irgendwo.mp4");
    fs.copyFileSync(datei, draussen);
    expect(await lauf("schnitt", "sondiere", draussen)).toBe(1);
    expect(ausgabe.join("\n")).toContain("ausserhalb");
  }, 60_000);

  it("export-pruefen: ein kleines Testvideo weicht vom Reel-Preset ab (Exit-Code 1), die Abweichungen stehen im JSON", async () => {
    const datei = path.join(tmp, "klein.mp4");
    spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=320x568:rate=30:duration=1", "-f", "lavfi", "-i", "sine=duration=1", "-shortest", datei]);
    expect(await lauf("schnitt", "export-pruefen", datei)).toBe(1);
    const r = JSON.parse(ausgabe.join("\n"));
    expect(r.abweichungen.map((x: any) => x.code)).toEqual(expect.arrayContaining(["groesse", "fps", "zu-kurz"]));
  }, 60_000);
});

/* ---------- schnitt zuordnen ---------- */

const whisper = (...s: Segment[]) => ({
  segments: s.map((x) => ({ start: x.von, end: x.bis, text: ` ${x.text}`, words: x.woerter!.map((w) => ({ word: ` ${w.text}`, start: w.von, end: w.bis })) })),
});
const Z1 = "Wir haben diese Woche eine Küche komplett umgebaut.";
const Z2 = "Der Kunde wollte mehr Stauraum.";
const Z3 = "Das Ergebnis siehst du hier.";
const videoQuelle = (id: string, pfad = `rohmaterial/${id}.mp4`) => ({ id, pfad, art: "video", dauer: 60, fps: 25, breite: 1080, hoehe: 1920, hatAudio: true });

describe("schnitt zuordnen", () => {
  const vorbereiten = (skript: string, segmente: Segment[], quellen: unknown[] = [videoQuelle("sprache")]) => ({
    skript: schreibe("skript.md", skript),
    transkript: schreibe("t.json", whisper(...segmente)),
    quellen: schreibe("quellen.json", quellen),
    aus: path.join(tmp, "plan.json"),
  });

  it("schreibt einen gültigen Plan in Skriptreihenfolge und berichtet Take, Abweichung und fehlende Zeile", async () => {
    const v = vorbereiten(`# Küche\n${Z1} ${Z2}\n${Z3}`, [
      testSatz(1, "Wir haben diese Woche ähm eine Küche komplett umgebaut."),
      testSatz(6, "Moment nochmal von vorne."),
      testSatz(9, Z1),
      testSatz(30, "Der Kunde wollte mehr Platz und Stauraum."),
    ]);
    const code = await lauf("schnitt", "zuordnen", "--skript", v.skript, "--transkript", v.transkript, "--quellen", v.quellen, "--marke", "alperna", "-o", v.aus, "--ohne-pegel", "--inhalt", "c-0007");
    expect(code).toBe(0);
    const plan = leseSchnittplan(JSON.parse(fs.readFileSync(v.aus, "utf8")));
    expect(plan.projekt).toMatchObject({ name: "skript", marke: "alperna", inhalt: "c-0007" });
    expect([...new Set(plan.clips.map((c) => c.zeile))]).toEqual([1, 2]);
    const text = ausgabe.join("\n");
    expect(text).toContain("3 Skriptzeilen: 2 gefunden");
    expect(text).toMatch(/Zeile 1 ok/);
    expect(text).toMatch(/Zweitbester sprache 1,0 bis [\d,]+ s.*Füllwort «ähm»/);
    expect(text).toMatch(/Zeile 3 FEHLT/);
    expect(text).toContain("Verworfene Segmente");
    expect(text).toContain("Moment nochmal von vorne.");
    expect(text).toContain("Energie nicht gemessen (--ohne-pegel)");
    expect(text).toContain("schnitt resolve");
  });

  it("nimmt ein Transkript ohne Kennung, wenn es genau eine Videoquelle gibt", async () => {
    const v = vorbereiten(Z2, [testSatz(2, Z2)]);
    expect(await lauf("schnitt", "zuordnen", "--skript", v.skript, "--transkript", v.transkript, "--quellen", v.quellen, "--marke", "alperna", "-o", v.aus, "--ohne-pegel")).toBe(0);
    expect(leseSchnittplan(JSON.parse(fs.readFileSync(v.aus, "utf8"))).clips[0]!.quelle).toBe("sprache");
  });

  it("verlangt bei mehreren Videoquellen die Kennung und kennt nur Videoquellen", async () => {
    const v = vorbereiten(Z2, [testSatz(2, Z2)], [videoQuelle("a"), videoQuelle("b")]);
    const basis = ["--skript", v.skript, "--quellen", v.quellen, "--marke", "alperna", "-o", v.aus, "--ohne-pegel"];
    await expect(lauf("schnitt", "zuordnen", "--transkript", v.transkript, ...basis)).rejects.toThrow(/Kennung/);
    await expect(lauf("schnitt", "zuordnen", "--transkript", `x=${v.transkript}`, ...basis)).rejects.toThrow(/«x»/);
    expect(await lauf("schnitt", "zuordnen", "--transkript", `b=${v.transkript}`, ...basis)).toBe(0);
    expect(leseSchnittplan(JSON.parse(fs.readFileSync(v.aus, "utf8"))).clips[0]!.quelle).toBe("b");
  });

  it("richtet sich nach dem Schnittprofil der Marke (hier: Zoom-Tempo «langsam» heisst kein Zoom-Punch und keine Teilung)", async () => {
    const markenDir = path.join(tmp, "marken");
    fs.mkdirSync(markenDir);
    fs.writeFileSync(path.join(markenDir, "ruhig.json"), JSON.stringify({ ...alperna, schluessel: "ruhig", schnittprofil: { ...alperna.schnittprofil, zoomTempo: "langsam" } }));
    env = { ...env, markenDir };
    const v = vorbereiten(`${Z1} ${Z2}`, [testSatz(2, Z1), testSatz(10, Z2)]);
    expect(await lauf("schnitt", "zuordnen", "--skript", v.skript, "--transkript", v.transkript, "--quellen", v.quellen, "--marke", "ruhig", "-o", v.aus, "--ohne-pegel")).toBe(0);
    const plan = leseSchnittplan(JSON.parse(fs.readFileSync(v.aus, "utf8")));
    expect(plan.clips).toHaveLength(2);
    expect(plan.clips.every((c) => c.zoom === 1)).toBe(true);
    expect(plan.projekt.marke).toBe("ruhig");
  });

  it("verlangt die Marke ausdrücklich", async () => {
    const v = vorbereiten(Z2, [testSatz(2, Z2)]);
    await expect(lauf("schnitt", "zuordnen", "--skript", v.skript, "--transkript", v.transkript, "--quellen", v.quellen, "-o", v.aus)).rejects.toThrow(/--marke fehlt/);
  });

  it("schreibt auf Wunsch den gesprochenen Text in die Untertitel und den vollen Bericht als JSON", async () => {
    const v = vorbereiten(Z1, [testSatz(2, "Wir haben diese Woche eine Küche komplett neu umgebaut.")]);
    const bericht = path.join(tmp, "bericht.json");
    expect(await lauf("schnitt", "zuordnen", "--skript", v.skript, "--transkript", v.transkript, "--quellen", v.quellen, "--marke", "alperna", "-o", v.aus, "--ohne-pegel", "--gesprochen", "1", "--bericht", bericht)).toBe(0);
    const plan = leseSchnittplan(JSON.parse(fs.readFileSync(v.aus, "utf8")));
    expect(plan.woerter.map((w) => w.text)).toContain("neu");
    const b = JSON.parse(fs.readFileSync(bericht, "utf8"));
    expect(b.zuordnung.zeilen[0].abweichung.zusaetzlich).toEqual(["neu"]);
    expect(b.markierungen.map((m: any) => m.art)).toEqual(expect.arrayContaining(["abweichung", "gesprochen"]));
  });

  it("bricht mit klarer Meldung ab, wenn keine Zeile gefunden wird", async () => {
    const v = vorbereiten(Z2, [testSatz(2, "Etwas völlig anderes ohne Bezug.")]);
    await expect(lauf("schnitt", "zuordnen", "--skript", v.skript, "--transkript", v.transkript, "--quellen", v.quellen, "--marke", "alperna", "-o", v.aus, "--ohne-pegel")).rejects.toThrow(/kein einziger Clip/);
    expect(fs.existsSync(v.aus)).toBe(false);
  });

  it("meldet, wenn die Energie nicht gemessen werden kann, weil das Material fehlt", async () => {
    const v = vorbereiten(Z2, [testSatz(2, Z2)]);
    expect(await lauf("schnitt", "zuordnen", "--skript", v.skript, "--transkript", v.transkript, "--quellen", v.quellen, "--marke", "alperna", "-o", v.aus)).toBe(0);
    expect(ausgabe.join("\n")).toMatch(/Energie nicht gemessen: Datei fehlt/);
  });

  it.skipIf(!hatFfmpeg)("misst die Energie am echten Material und zieht den lauteren früheren Take vor", async () => {
    const dir = path.join(tmp, "Medien", "rohmaterial");
    fs.mkdirSync(dir, { recursive: true });
    const q = spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=320x568:rate=25:duration=12", "-f", "lavfi", "-i", "sine=frequency=440:duration=12", "-af", "volume=enable='lt(t,6)':volume=0.5,volume=enable='gte(t,6)':volume=0.05", "-shortest", path.join(dir, "sprache.mp4")]);
    expect(q.status).toBe(0);
    // zwei gleich saubere Takes derselben Zeile: der frühere (1 bis 3 s) ist 20 dB lauter als der spätere (8 bis 10 s)
    const v = vorbereiten(Z2, [testSatz(1, Z2), testSatz(8, Z2)], [{ ...videoQuelle("sprache"), dauer: 12 }]);
    expect(await lauf("schnitt", "zuordnen", "--skript", v.skript, "--transkript", v.transkript, "--quellen", v.quellen, "--marke", "alperna", "-o", v.aus)).toBe(0);
    const plan = leseSchnittplan(JSON.parse(fs.readFileSync(v.aus, "utf8")));
    expect(plan.clips[0]!.von).toBeLessThan(2);
    expect(ausgabe.join("\n")).toMatch(/Bester\s+sprache 1,\d bis [\d,]+ s, Punkte [\d,]+, -\d+,\d dB/);
  }, 60_000);
});
