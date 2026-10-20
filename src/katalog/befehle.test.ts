import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseArgs } from "../args";
import { umgebung, type Umgebung } from "../motion/werkstatt";
import { katalogBefehl } from "./befehle";
import { ladeKatalog, ladeOffen } from "./katalog";

const root = path.resolve(import.meta.dirname, "..", "..");
const hatFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

let tmp: string;
let env: Umgebung;
let ausgabe: string[];
let fehlerAusgabe: string[];

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "studio-katalog-"));
  env = { ...umgebung(root), datenDir: path.join(tmp, "Studio", "daten") };
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

const lauf = (...argv: string[]): Promise<number> => katalogBefehl(argv[1]!, parseArgs(argv), env);
const bib = () => path.join(tmp, "Medien", "rohmaterial", "bib");
const ff = (...args: string[]) => expect(spawnSync("ffmpeg", ["-loglevel", "error", "-y", ...args]).status).toBe(0);
const legeMaterialAn = () => {
  fs.mkdirSync(path.join(bib(), "kunde-x", "gossau"), { recursive: true });
  ff("-f", "lavfi", "-i", "testsrc2=size=320x568:rate=25:duration=4", "-f", "lavfi", "-i", "sine=duration=4", "-shortest", path.join(bib(), "kunde-x", "gossau", "clip.mp4"));
  ff("-f", "lavfi", "-i", "testsrc2=size=600x400", "-frames:v", "1", path.join(bib(), "kunde-x", "foto.jpg"));
  ff("-f", "lavfi", "-i", "sine=duration=1", path.join(bib(), "whoosh.wav"));
};

describe("katalog ohne Material", () => {
  it("scan verlangt einen Ordner, einen eingerichteten Studio-Ordner und einen Ordner im Studio- oder Medien-Ordner", async () => {
    await expect(lauf("katalog", "scan")).rejects.toThrow(/Aufruf/);
    await expect(lauf("katalog", "scan", path.join(tmp, "gibt-es-nicht"))).rejects.toThrow(/Kein Ordner/);
    fs.mkdirSync(path.join(tmp, "Medien"), { recursive: true });
    vi.stubEnv("STUDIO_HOME", "");
    vi.stubEnv("STUDIO_CONFIG", path.join(tmp, "keine-config.json"));
    await expect(lauf("katalog", "scan", path.join(tmp, "Medien"))).rejects.toThrow(/studio init/);
  });

  it("scan meldet Dateien ausserhalb von Studio- und Medien-Ordner und schreibt nichts", async () => {
    const draussen = path.join(tmp, "irgendwo");
    fs.mkdirSync(draussen);
    fs.writeFileSync(path.join(draussen, "a.mov"), "x");
    expect(await lauf("katalog", "scan", draussen)).toBe(1);
    expect(ausgabe.join("\n")).toContain("ausserhalb");
    expect(ladeOffen(env.datenDir)).toEqual([]);
  });

  it("beschreibe, liste und zeige: Fehler bei falschem Aufruf, leere Liste ohne Katalog", async () => {
    await expect(lauf("katalog", "beschreibe")).rejects.toThrow(/Aufruf/);
    const kaputt = path.join(tmp, "b.json");
    fs.writeFileSync(kaputt, "{}");
    await expect(lauf("katalog", "beschreibe", "--json", kaputt)).rejects.toThrow(/Liste/);
    expect(await lauf("katalog", "liste")).toBe(0);
    expect(ausgabe.join("\n")).toContain("0 von 0 Einträgen");
    await expect(lauf("katalog", "zeige", "k-0001")).rejects.toThrow(/weder im Katalog noch/);
    await expect(lauf("katalog", "liste", "--art", "ton")).rejects.toThrow(/--art/);
  });

  it("ein unbekannter Befehl gibt die Hilfe aus und Exit-Code 2", async () => {
    expect(await lauf("katalog", "quatsch")).toBe(2);
    expect(fehlerAusgabe.join("\n")).toContain("katalog scan");
  });
});

describe.skipIf(!hatFfmpeg)("katalog mit echtem ffmpeg", () => {
  it("Ablauf: scannen, offene ansehen, beschreiben, suchen, erneut scannen", async () => {
    legeMaterialAn();
    expect(await lauf("katalog", "scan", bib())).toBe(0);
    expect(ausgabe.join("\n")).toContain("3 neue Dateien, 0 schon bekannt");
    const offen = ladeOffen(env.datenDir);
    // die Reihenfolge ist die der Pfade: kunde-x/foto.jpg, kunde-x/gossau/clip.mp4, whoosh.wav
    expect(offen.map((o) => [o.schluessel, o.art, o.pfad])).toEqual([
      ["k-0001", "foto", "rohmaterial/bib/kunde-x/foto.jpg"],
      ["k-0002", "video", "rohmaterial/bib/kunde-x/gossau/clip.mp4"],
      ["k-0003", "sound", "rohmaterial/bib/whoosh.wav"],
    ]);
    const [foto, video] = [offen[0]!, offen[1]!];
    expect(video).toMatchObject({ dauer: expect.closeTo(4, 0), bildrate: 25, breite: 320, hoehe: 568, orientierung: "hoch", hatTon: true, ordnerHinweis: ["kunde-x", "gossau"] });
    expect(foto).toMatchObject({ orientierung: "quer", ordnerHinweis: ["kunde-x"] });
    expect(video.vorschau).toHaveLength(3);
    expect(foto.vorschau).toHaveLength(1);
    for (const v of [...video.vorschau, ...foto.vorschau]) expect(fs.statSync(path.join(env.datenDir, v)).size).toBeGreaterThan(100);

    // zweiter Scan: nichts Neues
    ausgabe.length = 0;
    expect(await lauf("katalog", "scan", bib())).toBe(0);
    expect(ausgabe.join("\n")).toContain("0 neue Dateien, 3 schon bekannt");
    expect(ladeOffen(env.datenDir)).toHaveLength(3);

    // offen: JSON mit absoluten Pfaden der Vorschaubilder
    ausgabe.length = 0;
    expect(await lauf("katalog", "offen", "--limit", "2")).toBe(0);
    const gezeigt = JSON.parse(ausgabe.join("\n"));
    expect(gezeigt).toHaveLength(2);
    expect(path.isAbsolute(gezeigt[0].vorschau[0])).toBe(true);
    expect(fs.existsSync(gezeigt[0].vorschau[0])).toBe(true);
    expect(fehlerAusgabe.join("\n")).toContain("2 von 3 offenen Dateien");

    // beschreiben: zwei gültig, eine ungültig
    const b = path.join(tmp, "beschreibungen.json");
    fs.writeFileSync(
      b,
      JSON.stringify([
        { schluessel: "k-0002", titel: "KundeX_Gossau_Laptop_Tippen_2026-09", beschreibung: "Hände tippen auf einem Laptop", tags: ["Laptop", "Büro"], sicherheit: "hoch", besteSekunden: { von: 0.5, bis: 3 }, personen: true },
        { schluessel: "k-0001", titel: "KundeX_Gossau_Dorfplatz", beschreibung: "Dorfplatz bei Sonne", tags: ["Platz"], sicherheit: "mittel" },
        { schluessel: "k-0003", titel: "Whoosh_kurz", beschreibung: "Kurzes Whoosh", tags: [], sicherheit: "hoch" },
      ]),
    );
    ausgabe.length = 0;
    expect(await lauf("katalog", "beschreibe", "--json", b)).toBe(1);
    expect(ausgabe.join("\n")).toContain("2 neu im Katalog, 0 überschrieben, 1 abgelehnt; 1 offen, 2 im Katalog");
    expect(ausgabe.join("\n")).toMatch(/k-0003: tags/);
    const katalog = ladeKatalog(env.datenDir);
    expect(katalog.map((k) => k.schluessel)).toEqual(["k-0001", "k-0002"]);
    expect(katalog[1]).toMatchObject({ schluessel: "k-0002", pfad: "rohmaterial/bib/kunde-x/gossau/clip.mp4", orientierung: "hoch", bildrate: 25, personen: true });
    expect(ladeOffen(env.datenDir).map((o) => o.schluessel)).toEqual(["k-0003"]);

    // Korrektur überschreibt
    fs.writeFileSync(b, JSON.stringify([{ schluessel: "k-0001", titel: "KundeX_Gossau_Dorfplatz_Abend", beschreibung: "Dorfplatz am Abend", tags: ["Platz", "Abend"], sicherheit: "mittel" }]));
    ausgabe.length = 0;
    expect(await lauf("katalog", "beschreibe", "--json", b)).toBe(0);
    expect(ausgabe.join("\n")).toContain("0 neu im Katalog, 1 überschrieben");
    expect(ladeKatalog(env.datenDir).find((k) => k.schluessel === "k-0001")!.titel).toBe("KundeX_Gossau_Dorfplatz_Abend");

    // Suche und zeigen
    ausgabe.length = 0;
    expect(await lauf("katalog", "liste", "--suche", "laptop büro")).toBe(0);
    expect(ausgabe.join("\n")).toMatch(/k-0002  video  hoch  2,5 s nutzbar  KundeX_Gossau_Laptop_Tippen_2026-09  \[Laptop, Büro\]/);
    expect(ausgabe.join("\n")).toContain("1 von 2 Einträgen");
    ausgabe.length = 0;
    await lauf("katalog", "liste", "--offen");
    expect(ausgabe.join("\n")).toMatch(/k-0003  sound/);
    ausgabe.length = 0;
    await lauf("katalog", "zeige", "k-0002");
    expect(JSON.parse(ausgabe.join("\n")).tags).toEqual(["Laptop", "Büro"]);
  }, 120_000);

  it("scan --max stellt zurück, ein zweiter Lauf holt den Rest", async () => {
    legeMaterialAn();
    expect(await lauf("katalog", "scan", bib(), "--max", "1", "--ohne-vorschau")).toBe(0);
    expect(ausgabe.join("\n")).toContain("1 neue Dateien, 0 schon bekannt, 2 zurückgestellt");
    expect(ladeOffen(env.datenDir)[0]!.vorschau).toEqual([]);
    ausgabe.length = 0;
    expect(await lauf("katalog", "scan", bib(), "--ohne-vorschau")).toBe(0);
    expect(ausgabe.join("\n")).toContain("2 neue Dateien, 1 schon bekannt");
    expect(ladeOffen(env.datenDir).map((o) => o.schluessel)).toEqual(["k-0001", "k-0002", "k-0003"]);
    await expect(lauf("katalog", "scan", bib(), "--max", "0")).rejects.toThrow(/--max/);
  }, 120_000);

  it("scan lässt eine nicht lesbare Datei liegen und scannt den Rest", async () => {
    legeMaterialAn();
    fs.writeFileSync(path.join(bib(), "kaputt.mov"), "das ist kein Video");
    expect(await lauf("katalog", "scan", bib(), "--ohne-vorschau")).toBe(0);
    expect(ausgabe.join("\n")).toMatch(/übersprungen: .*kaputt\.mov: ffprobe/);
    expect(ladeOffen(env.datenDir)).toHaveLength(3);
  }, 120_000);
});
