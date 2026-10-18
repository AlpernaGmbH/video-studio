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

const hatFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
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
