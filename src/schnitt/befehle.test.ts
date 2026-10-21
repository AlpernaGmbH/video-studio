import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseArgs } from "../args";
import { Markenprofil } from "../core/schemas";
import { umgebung, type Umgebung } from "../motion/werkstatt";
import { katalogBefehl } from "../katalog/befehle";
import { rendereStueck } from "../motion/werkstatt";
import { schnittBefehl } from "./befehle";
import { bauePlan } from "./planbau";
import { ordneZu } from "./zuordnung";
import { leseSchnittplan, platziere } from "./plan";
import { pruefeSchnittplan } from "./pruefung";
import { testSatz } from "./testdaten";
import type { Segment } from "./transkript";

vi.mock("../motion/werkstatt", async (orig) => {
  const m = await orig<typeof import("../motion/werkstatt")>();
  return { ...m, rendereStueck: vi.fn(m.rendereStueck) };
});

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

/* ---------- schnitt auftrag und schnitt storyboard ---------- */

describe("schnitt auftrag und schnitt storyboard", () => {
  const Zeilen = [Z1, Z2, Z3, "Dafür brauchte er nur drei Wochen."];
  const basisPlan = () =>
    bauePlan(ordneZu(Zeilen, [{ quelle: "sprache", segmente: [testSatz(20, Zeilen[0]!), testSatz(3, Zeilen[1]!), testSatz(30, Zeilen[2]!), testSatz(40, Zeilen[3]!)] }]), {
      projekt: { name: "Küche Gossau", inhalt: "c-0007", marke: "alperna" },
      quellen: [videoQuelle("sprache") as never],
    }).plan;
  const planDatei = () => schreibe("plan.json", basisPlan());
  const zahl = (extra: Record<string, unknown> = {}) => ({ effekt: "zahl-zaehler", t: 1, dauer: 2.6, params: { wert: 7, suffix: " von 10", label: "laden zu langsam" }, begruendung: "Kennzahl im Skript, Zahl wirkt stärker als Wort", ...extra });
  const sb = (overlays: unknown[], extra: Record<string, unknown> = {}) => schreibe("sb.json", { hook: "Warum die Küche anders aussieht", overlays, betonung: [5], ...extra });
  const medien = () => path.join(tmp, "Medien");

  it("auftrag: schreibt den Auftrag mit Zeiten und sagt, dass noch kein Stück aktiv ist", async () => {
    const ziel = path.join(tmp, "auftrag.md");
    expect(await lauf("schnitt", "auftrag", "--plan", planDatei(), "-o", ziel)).toBe(0);
    const text = fs.readFileSync(ziel, "utf8");
    expect(text).toContain("# Storyboard-Auftrag: Küche Gossau");
    expect(text).toMatch(/\*\*Zeile 1, 0,0 bis/);
    expect(text).toContain("Keine aktiven Stücke");
    expect(text).toContain("spätestens alle 1,5 s");
    expect(fehlerAusgabe.join("\n")).toContain("Kein Katalog gefunden");
  });

  it("auftrag: nimmt Katalog und Regeln aus Dateien", async () => {
    const katalog = schreibe("katalog.json", [{ schluessel: "k-0142", art: "video", pfad: "rohmaterial/bib/laptop.mov", titel: "Intern_Gossau_Laptop", beschreibung: "Hände auf Laptop", tags: ["Laptop"], dauer: 8.4, sicherheit: "hoch" }]);
    const regeln = schreibe("regeln.json", [{ id: "r-001", text: "Zahlen immer mit Einheit nennen.", typ: "handwerk", status: "aktiv", beleg: { anzahl: 3, verweise: ["x"] }, freigabe: { wer: "Andrej", wann: "2026-10-10T10:00:00.000Z" } }]);
    expect(await lauf("schnitt", "auftrag", "--plan", planDatei(), "--katalog", katalog, "--regeln", regeln)).toBe(0);
    const text = ausgabe.join("\n");
    expect(text).toContain("k-0142");
    expect(text).toContain("r-001 (handwerk)");
  });

  it("storyboard: Regel 3, ein Stück, das nicht «aktiv» ist, wird verworfen, mit --entwurf übernommen", async () => {
    const plan = planDatei();
    const storyboard = sb([zahl()]);
    const aus = path.join(tmp, "plan2.json");
    expect(await lauf("schnitt", "storyboard", "--plan", plan, "--storyboard", storyboard, "-o", aus)).toBe(0);
    expect(ausgabe.join("\n")).toMatch(/Status «geprueft»/);
    expect(leseSchnittplan(JSON.parse(fs.readFileSync(aus, "utf8"))).overlays).toEqual([]);
    ausgabe.length = 0;
    expect(await lauf("schnitt", "storyboard", "--plan", plan, "--storyboard", storyboard, "-o", aus, "--entwurf")).toBe(0);
    const p2 = leseSchnittplan(JSON.parse(fs.readFileSync(aus, "utf8")));
    expect(p2.overlays.map((o) => o.datei)).toEqual(["renders/c-0007/zahl-zaehler-01.webm"]);
    expect(p2.woerter.filter((w) => w.betont)).toHaveLength(1);
    const text = ausgabe.join("\n");
    expect(text).toContain("Übernommen: 1 Grafiken, 0 B-Roll, 1 betonte Wörter");
    expect(text).toMatch(/motion render zahl-zaehler -o \S*renders\/c-0007\/zahl-zaehler-01\.webm --dauer 2\.6 --marke alperna --set wert=7 --set 'suffix= von 10' --set 'label=laden zu langsam'/);
    expect(text).toContain("Entwurf");
  });

  it("storyboard: liest auch eine Antwort mit Text und Codezaun drumherum", async () => {
    const storyboard = schreibe("sb.md", `Hier das Storyboard:\n\n\`\`\`json\n${JSON.stringify({ hook: "x", overlays: [zahl()], betonung: [] })}\n\`\`\`\nViel Erfolg.`);
    const aus = path.join(tmp, "plan2.json");
    expect(await lauf("schnitt", "storyboard", "--plan", planDatei(), "--storyboard", storyboard, "-o", aus, "--entwurf")).toBe(0);
    expect(leseSchnittplan(JSON.parse(fs.readFileSync(aus, "utf8"))).overlays).toHaveLength(1);
  });

  it("storyboard --rendern: rendert jede Grafik an den Zielpfad im Medien-Ordner und meldet das Ergebnis der Prüfung", async () => {
    const mock = vi.mocked(rendereStueck);
    mock.mockReset();
    mock.mockResolvedValue({ datei: "x", dauer: 2.6, variablen: {}, pruefung: { bestanden: true, befunde: [] }, renderMs: 4200, warnungen: [] } as never);
    const aus = path.join(tmp, "plan2.json");
    expect(await lauf("schnitt", "storyboard", "--plan", planDatei(), "--storyboard", sb([zahl(), zahl({ t: 5, params: { wert: 3, label: "Wochen" } })]), "-o", aus, "--entwurf", "--rendern")).toBe(0);
    expect(mock).toHaveBeenCalledTimes(2);
    const [, id, opt] = mock.mock.calls[0]!;
    expect(id).toBe("zahl-zaehler");
    expect(opt).toMatchObject({ werte: { wert: 7, suffix: " von 10", label: "laden zu langsam" }, dauer: 2.6, ausgabe: path.join(medien(), "renders", "c-0007", "zahl-zaehler-01.webm"), final: false });
    expect((opt as { marke?: { schluessel: string } }).marke?.schluessel).toBe("alperna");
    expect(ausgabe.join("\n")).toContain("zahl-zaehler-01: bestanden");
  });

  it("storyboard --rendern: eine nicht bestandene Prüfung macht den Exit-Code 1", async () => {
    const mock = vi.mocked(rendereStueck);
    mock.mockReset();
    mock.mockResolvedValue({ datei: "x", dauer: 2.6, variablen: {}, pruefung: { bestanden: false, befunde: [{ stufe: "fehler", code: "alpha", text: "Kein Alphakanal" }] }, renderMs: 100, warnungen: [] } as never);
    const aus = path.join(tmp, "plan2.json");
    expect(await lauf("schnitt", "storyboard", "--plan", planDatei(), "--storyboard", sb([zahl()]), "-o", aus, "--entwurf", "--rendern")).toBe(1);
    expect(ausgabe.join("\n")).toContain("NICHT bestanden");
    expect(ausgabe.join("\n")).toContain("Kein Alphakanal");
  });

  it("storyboard: ohne --rendern wird nichts gerendert", async () => {
    const mock = vi.mocked(rendereStueck);
    mock.mockReset();
    await lauf("schnitt", "storyboard", "--plan", planDatei(), "--storyboard", sb([zahl()]), "-o", path.join(tmp, "p.json"), "--entwurf");
    expect(mock).not.toHaveBeenCalled();
  });

  it("storyboard: verlangt das Ziel und die Antwort von Claude", async () => {
    await expect(lauf("schnitt", "storyboard", "--plan", planDatei(), "--storyboard", sb([]))).rejects.toThrow(/--o fehlt/);
    await expect(lauf("schnitt", "storyboard", "--plan", planDatei(), "-o", path.join(tmp, "p.json"))).rejects.toThrow(/--storyboard fehlt/);
  });

  it.skipIf(!hatFfmpeg)("storyboard: sondiert B-Roll am Katalogpfad und trägt sie auf V2 ein; fehlt die Datei, steht es in der Ausgabe", async () => {
    const dir = path.join(medien(), "rohmaterial", "bib");
    fs.mkdirSync(dir, { recursive: true });
    const q = spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=320x568:rate=25:duration=6", "-f", "lavfi", "-i", "sine=duration=6", "-shortest", path.join(dir, "laptop.mp4")]);
    expect(q.status).toBe(0);
    const eintrag = (schluessel: string, pfad: string) => ({ schluessel, art: "video", pfad, titel: `Intern_${schluessel}`, beschreibung: "Testmaterial", tags: ["Test"], dauer: 6, besteSekunden: { von: 1, bis: 5 }, sicherheit: "hoch" });
    const katalog = schreibe("katalog.json", [eintrag("k-0142", "rohmaterial/bib/laptop.mp4"), eintrag("k-0143", "rohmaterial/bib/fehlt.mp4")]);
    const b = (key: string, t: number) => ({ effekt: "broll", t, dauer: 1.5, params: { katalog: key }, begruendung: "Zeigt die Aussage, bringt Bildwechsel" });
    const aus = path.join(tmp, "plan2.json");
    expect(await lauf("schnitt", "storyboard", "--plan", planDatei(), "--storyboard", sb([b("k-0142", 2), b("k-0143", 5)]), "--katalog", katalog, "-o", aus)).toBe(0);
    const p2 = leseSchnittplan(JSON.parse(fs.readFileSync(aus, "utf8")));
    expect(p2.broll).toHaveLength(1);
    expect(p2.broll[0]).toMatchObject({ katalog: "k-0142", quelle: "broll-k-0142", von: 1, t: 2 });
    expect(p2.quellen.find((x) => x.id === "broll-k-0142")).toMatchObject({ art: "video", fps: 25, breite: 320, hoehe: 568, hatAudio: true, pfad: "rohmaterial/bib/laptop.mp4" });
    const text = ausgabe.join("\n");
    expect(text).toContain("Übernommen: 0 Grafiken, 1 B-Roll");
    expect(text).toContain("rohmaterial/bib/fehlt.mp4");
    expect(text).toMatch(/nicht sondiert/);
  }, 60_000);
  it.skipIf(!hatFfmpeg)("storyboard: Exit-Code 1, wenn die B-Roll-Datei kürzer ist, als der Katalog behauptet", async () => {
    const dir = path.join(medien(), "rohmaterial", "bib");
    fs.mkdirSync(dir, { recursive: true });
    spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=320x568:rate=25:duration=2", path.join(dir, "kurz.mp4")]);
    const katalog = schreibe("katalog.json", [{ schluessel: "k-0142", art: "video", pfad: "rohmaterial/bib/kurz.mp4", titel: "Intern_kurz", beschreibung: "Zu kurz", tags: ["Test"], dauer: 6, besteSekunden: { von: 1, bis: 5 }, sicherheit: "hoch" }]);
    const b = { effekt: "broll", t: 2, dauer: 1.5, params: { katalog: "k-0142" }, begruendung: "Zeigt die Aussage, bringt Bildwechsel" };
    expect(await lauf("schnitt", "storyboard", "--plan", planDatei(), "--storyboard", sb([b]), "--katalog", katalog, "-o", path.join(tmp, "p.json"))).toBe(1);
    expect(ausgabe.join("\n")).toContain("broll-ueber-ende");
  }, 60_000);
describe("schnitt transkribiere", () => {
  /** Ein Ersatz-Whisper als Skript: schreibt ein Transkript nach --output_dir und merkt sich seine Schalter. */
  const ersatzWhisper = (): { bin: string; merk: string } => {
    const merk = path.join(tmp, "aufruf.json");
    const bin = path.join(tmp, "whisper-ersatz");
    fs.writeFileSync(
      bin,
      `#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path");
const a = process.argv.slice(2);
fs.writeFileSync(${JSON.stringify(merk)}, JSON.stringify(a));
const out = a[a.indexOf("--output_dir") + 1];
const name = path.basename(a[0], path.extname(a[0])) + ".json";
fs.writeFileSync(path.join(out, name), JSON.stringify({ segments: [{ start: 0, end: 3, text: "Hallo zusammen", words: [{ word: " Hallo", start: 0, end: 1 }, { word: " zusammen", start: 1.1, end: 2 }] }, { start: 3, end: 9, text: "Das ist ein langes Segment" }] }));
`,
    );
    fs.chmodSync(bin, 0o755);
    return { bin, merk };
  };

  it("ruft Whisper auf, legt das Transkript unter dem Namen der Aufnahme im Datenordner ab und fasst es zusammen", async () => {
    const { bin, merk } = ersatzWhisper();
    vi.stubEnv("STUDIO_WHISPER_BIN", bin);
    const aufnahme = path.join(tmp, "Sprache 01.mov");
    fs.writeFileSync(aufnahme, "x");
    expect(await lauf("schnitt", "transkribiere", aufnahme)).toBe(0);
    const ziel = path.join(env.datenDir, "transkripte", "sprache-01.json");
    expect(fs.existsSync(ziel)).toBe(true);
    const text = ausgabe.join("\n");
    expect(text).toContain(`${ziel}: 2 Segmente über 9,0 s, 1 mit Wortzeiten, 1 über 4 s (werden geteilt)`);
    expect(text).toContain("1 Segmente ohne Wortzeiten");
    expect(text).toContain("schnitt zuordnen --transkript");
    const args = JSON.parse(fs.readFileSync(merk, "utf8")) as string[];
    expect(args).toEqual([aufnahme, "--model", "large-v3", "--language", "de", "--word_timestamps", "True", "--output_format", "json", "--output_dir", expect.any(String)]);
  });

  it("nimmt Modell, Sprache und Ziel aus den Schaltern, und das Ergebnis lässt sich direkt in «zuordnen» verwenden", async () => {
    const { bin, merk } = ersatzWhisper();
    vi.stubEnv("STUDIO_WHISPER_BIN", bin);
    const aufnahme = path.join(tmp, "a.mp4");
    fs.writeFileSync(aufnahme, "x");
    const ziel = path.join(tmp, "mein.json");
    expect(await lauf("schnitt", "transkribiere", aufnahme, "--modell", "medium", "--sprache", "de", "-o", ziel)).toBe(0);
    expect(JSON.parse(fs.readFileSync(merk, "utf8"))).toEqual(expect.arrayContaining(["--model", "medium"]));
    const skript = schreibe("skript.md", "Hallo zusammen.");
    const quellen = schreibe("quellen.json", [videoQuelle("sprache")]);
    expect(await lauf("schnitt", "zuordnen", "--skript", skript, "--transkript", ziel, "--quellen", quellen, "--marke", "alperna", "-o", path.join(tmp, "plan.json"), "--ohne-pegel")).toBe(0);
  });

  it("fehlt Whisper, steht die Installation in der Meldung", async () => {
    vi.stubEnv("STUDIO_WHISPER_BIN", path.join(tmp, "gibt-es-nicht"));
    const aufnahme = path.join(tmp, "a.mp4");
    fs.writeFileSync(aufnahme, "x");
    await expect(lauf("schnitt", "transkribiere", aufnahme)).rejects.toThrow(/whisper einrichten/);
    await expect(lauf("schnitt", "transkribiere")).rejects.toThrow(/Aufruf/);
  });
});
describe("schnitt kontaktbogen", () => {
  const legeAn = () => {
    const medien = path.join(tmp, "Medien");
    fs.mkdirSync(path.join(medien, "rohmaterial", "bib"), { recursive: true });
    fs.mkdirSync(path.join(medien, "renders", "c-0007"), { recursive: true });
    spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=320x568:rate=25:duration=10", path.join(medien, "rohmaterial", "sprache.mp4")]);
    spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=25:duration=6", path.join(medien, "rohmaterial", "bib", "laptop.mp4")]);
    return medien;
  };
  const plan = (overlayDatei: string) =>
    schreibe("plan.json", {
      version: 1,
      projekt: { name: "Küche Gossau", inhalt: "c-0007", marke: "alperna" },
      quellen: [
        { id: "sprache", pfad: "rohmaterial/sprache.mp4", art: "video", dauer: 10, fps: 25, breite: 320, hoehe: 568, hatAudio: false },
        { id: "broll-k-0001", pfad: "rohmaterial/bib/laptop.mp4", art: "video", dauer: 6, fps: 25, breite: 640, hoehe: 360 },
      ],
      clips: [{ id: "k01", quelle: "sprache", von: 0, bis: 8, zeile: 1 }],
      broll: [{ quelle: "broll-k-0001", katalog: "k-0001", t: 4, dauer: 1.5, von: 1, begruendung: "Zeigt die Aussage" }],
      overlays: [{ datei: overlayDatei, effekt: "zahl-zaehler", t: 1, dauer: 2, begruendung: "Kennzahl im Skript" }],
    });

  it.skipIf(!hatFfmpeg)("schreibt eine HTML-Datei mit einem Standbild je Eintrag", async () => {
    const medien = legeAn();
    spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=red@0.6:s=1080x1920:r=25:d=2,format=yuva420p", "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", path.join(medien, "renders", "c-0007", "zahl-zaehler-01.webm")]);
    const aus = path.join(tmp, "bogen.html");
    expect(await lauf("schnitt", "kontaktbogen", "--plan", plan("renders/c-0007/zahl-zaehler-01.webm"), "-o", aus)).toBe(0);
    const html = fs.readFileSync(aus, "utf8");
    expect(html.match(/data:image\/jpeg;base64,/g)).toHaveLength(2);
    expect(html).toContain("Kontaktbogen Küche Gossau");
    expect(ausgabe.join("\n")).toMatch(/bogen\.html\n\d+ KB, 2 Einträge, 2 mit Standbild/);
  }, 60_000);

  it.skipIf(!hatFfmpeg)("Exit-Code 1 und ein klarer Hinweis, wenn eine Grafik noch nicht gerendert ist", async () => {
    legeAn();
    const aus = path.join(tmp, "bogen.html");
    expect(await lauf("schnitt", "kontaktbogen", "--plan", plan("renders/c-0007/fehlt.webm"), "-o", aus)).toBe(1);
    expect(ausgabe.join("\n")).toContain("Nicht gerendert: Eintrag 1");
    expect(fs.readFileSync(aus, "utf8")).toContain("Grafik noch nicht gerendert: renders/c-0007/fehlt.webm");
  }, 60_000);

  it("verlangt den Plan und einen eingerichteten Studio-Ordner", async () => {
    await expect(lauf("schnitt", "kontaktbogen")).rejects.toThrow(/--plan fehlt/);
    vi.stubEnv("STUDIO_HOME", "");
    await expect(lauf("schnitt", "kontaktbogen", "--plan", plan("renders/x.webm"))).rejects.toThrow(/studio init/);
  });
});
describe("schnitt vorschau", () => {
  const medien = () => path.join(tmp, "Medien");
  const material = () => {
    fs.mkdirSync(path.join(medien(), "rohmaterial"), { recursive: true });
    fs.mkdirSync(path.join(medien(), "renders", "c-0007"), { recursive: true });
    const ff = (...a: string[]) => spawnSync("ffmpeg", ["-loglevel", "error", "-y", ...a]);
    ff("-f", "lavfi", "-i", "color=c=red:s=320x568:r=25:d=3", "-f", "lavfi", "-i", "sine=duration=3", "-shortest", path.join(medien(), "rohmaterial", "sprache.mp4"));
    ff("-f", "lavfi", "-i", "color=c=white@0.7:s=1080x1920:r=25:d=1,format=yuva420p", "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", path.join(medien(), "renders", "c-0007", "grafik.webm"));
  };
  const plan = (grafik = "renders/c-0007/grafik.webm") =>
    schreibe("plan.json", {
      version: 1,
      projekt: { name: "Küche Gossau", inhalt: "c-0007", marke: "alperna" },
      quellen: [{ id: "sprache", pfad: "rohmaterial/sprache.mp4", art: "video", dauer: 3, fps: 25, breite: 320, hoehe: 568, hatAudio: true }],
      clips: [{ id: "k01", quelle: "sprache", von: 0, bis: 2, zeile: 1 }],
      overlays: [{ datei: grafik, effekt: "zahl-zaehler", t: 0.5, dauer: 0.8, begruendung: "Kennzahl im Skript" }],
      woerter: [{ text: "Hallo", quelle: "sprache", von: 0.2, bis: 0.6 }, { text: "zusammen.", quelle: "sprache", von: 0.7, bis: 1.3 }],
    });
  const dauer = (f: string): number => Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).stdout.toString());

  it.skipIf(!hatFfmpeg)("schreibt die Vorschau in den Ergebnisordner des Inhalts und nummeriert weitere Fassungen, ohne etwas zu überschreiben", async () => {
    material();
    expect(await lauf("schnitt", "vorschau", "--plan", plan())).toBe(0);
    const erste = path.join(tmp, "Studio", "inhalte", "c-0007", "ergebnis", "vorschau.mp4");
    expect(dauer(erste)).toBeGreaterThan(1.9);
    expect(ausgabe.join("\n")).toMatch(/vorschau\.mp4\n[\d,]+ MB, 2,0 s/);
    expect(ausgabe.join("\n")).toContain("Eine Näherung");
    const bytes = fs.statSync(erste).size;
    expect(await lauf("schnitt", "vorschau", "--plan", plan(), "--ohne-untertitel")).toBe(0);
    expect(fs.existsSync(path.join(path.dirname(erste), "vorschau-v2.mp4"))).toBe(true);
    expect(fs.statSync(erste).size).toBe(bytes);
    expect(ausgabe.join("\n")).toContain("ohne Untertitel (--ohne-untertitel)");
    // keine Reste der Untertitel-Datei
    expect(fs.readdirSync(path.dirname(erste)).filter((n) => n.endsWith(".srt"))).toEqual([]);
  }, 120_000);

  it.skipIf(!hatFfmpeg)("nimmt ein eigenes Ziel mit -o", async () => {
    material();
    const ziel = path.join(tmp, "mein", "v.mp4");
    expect(await lauf("schnitt", "vorschau", "--plan", plan(), "-o", ziel)).toBe(0);
    expect(fs.existsSync(ziel)).toBe(true);
  }, 120_000);

  it.skipIf(!hatFfmpeg)("nennt fehlende Dateien, bevor ffmpeg läuft, und legt nichts an", async () => {
    material();
    await expect(lauf("schnitt", "vorschau", "--plan", plan("renders/c-0007/fehlt.webm"))).rejects.toThrow(/fehlen Dateien[\s\S]*--rendern[\s\S]*fehlt\.webm/);
    expect(fs.existsSync(path.join(tmp, "Studio", "inhalte"))).toBe(false);
  });

  it("verlangt den Plan und einen eingerichteten Studio-Ordner", async () => {
    await expect(lauf("schnitt", "vorschau")).rejects.toThrow(/--plan fehlt/);
    vi.stubEnv("STUDIO_HOME", "");
    await expect(lauf("schnitt", "vorschau", "--plan", plan())).rejects.toThrow(/studio init/);
  });
});
describe.skipIf(!hatFfmpeg)("ganzer Durchlauf: Zuordnung, Katalog, Storyboard, Kontaktbogen, Vorschau, Resolve", () => {
  it("jeder Schritt nimmt, was der vorige schreibt, und am Ende stimmen Länge, Dateien und Betonung überein", async () => {
    const medien = path.join(tmp, "Medien");
    const ff = (...a: string[]) => expect(spawnSync("ffmpeg", ["-loglevel", "error", "-y", ...a]).status, a.join(" ")).toBe(0);
    fs.mkdirSync(path.join(medien, "rohmaterial", "bib"), { recursive: true });
    // Aufnahme: 45 s mit Ton, Takes an den Stellen des Transkripts
    ff("-f", "lavfi", "-i", "testsrc2=size=320x568:rate=25:duration=45", "-f", "lavfi", "-i", "sine=frequency=300:duration=45", "-shortest", path.join(medien, "rohmaterial", "sprache.mp4"));
    ff("-f", "lavfi", "-i", "color=c=magenta:s=640x360:r=25:d=6", path.join(medien, "rohmaterial", "bib", "laptop.mp4"));

    const Zeilen = [Z1, Z2, Z3];
    const t = schreibe("t.json", whisper(testSatz(1, "Wir haben diese Woche ähm eine Küche komplett umgebaut."), testSatz(6, "Moment nochmal von vorne."), testSatz(10, Z1), testSatz(20, Z2), testSatz(30, Z3)));
    const skript = schreibe("skript.md", Zeilen.join("\n"));
    const quellen = schreibe("quellen.json", [{ ...videoQuelle("sprache"), dauer: 45 }]);
    const plan1 = path.join(tmp, "plan.json");
    expect(await lauf("schnitt", "zuordnen", "--skript", skript, "--transkript", t, "--quellen", quellen, "--marke", "alperna", "--name", "Küche Gossau", "--inhalt", "c-0007", "-o", plan1, "--ohne-pegel")).toBe(0);
    expect(ausgabe.join("\n")).toContain("Zugeordnet: 3 von 3 (100 Prozent");

    // Katalog: scannen, beschreiben
    const mc = (...argv: string[]) => katalogBefehl(argv[1]!, parseArgs(argv), env);
    expect(await mc("katalog", "scan", path.join(medien, "rohmaterial", "bib"))).toBe(0);
    const b = schreibe("beschreibungen.json", [{ schluessel: "k-0001", titel: "Intern_Gossau_Laptop", beschreibung: "Testfarbe", tags: ["Test"], sicherheit: "hoch", besteSekunden: { von: 0.5, bis: 5 } }]);
    expect(await mc("katalog", "beschreibe", "--json", b)).toBe(0);

    // Auftrag, Storyboard (der Render ist ersetzt: eine echte WebM mit Alpha an dem Ort, den der Befehl nennt)
    const auftrag = path.join(tmp, "auftrag.md");
    expect(await lauf("schnitt", "auftrag", "--plan", plan1, "-o", auftrag)).toBe(0);
    expect(fs.readFileSync(auftrag, "utf8")).toContain("k-0001");
    const mock = vi.mocked(rendereStueck);
    mock.mockReset();
    mock.mockImplementation(async (_env, _id, o) => {
      fs.mkdirSync(path.dirname(o.ausgabe), { recursive: true });
      ff("-f", "lavfi", "-i", "color=c=white@0.6:s=1080x1920:r=25:d=3,format=yuva420p", "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", o.ausgabe);
      return { datei: o.ausgabe, dauer: 3, variablen: {}, pruefung: { bestanden: true, befunde: [] }, renderMs: 1, warnungen: [] } as never;
    });
    const sb = schreibe("sb.json", {
      hook: "Warum die Küche anders aussieht",
      overlays: [
        { effekt: "zahl-zaehler", t: 0.5, dauer: 1.5, params: { wert: 3, label: "Wochen" }, begruendung: "Kennzahl im Skript" },
        { effekt: "broll", t: 3, dauer: 1, params: { katalog: "k-0001" }, begruendung: "Zeigt die Aussage, bringt Bildwechsel" },
      ],
      betonung: [5],
    });
    const plan2 = path.join(tmp, "plan2.json");
    expect(await lauf("schnitt", "storyboard", "--plan", plan1, "--storyboard", sb, "-o", plan2, "--entwurf", "--rendern")).toBe(0);
    const p2 = leseSchnittplan(JSON.parse(fs.readFileSync(plan2, "utf8")));
    expect(p2.overlays).toHaveLength(1);
    expect(p2.broll.map((x) => x.katalog)).toEqual(["k-0001"]);
    expect(p2.woerter.filter((w) => w.betont).map((w) => w.text)).toEqual(["Küche"]);

    // Kontaktbogen, Vorschau, Resolve
    const bogen = path.join(tmp, "bogen.html");
    expect(await lauf("schnitt", "kontaktbogen", "--plan", plan2, "-o", bogen)).toBe(0);
    expect(fs.readFileSync(bogen, "utf8").match(/data:image\/jpeg/g)).toHaveLength(2);
    const vorschau = path.join(tmp, "vorschau.mp4");
    expect(await lauf("schnitt", "vorschau", "--plan", plan2, "-o", vorschau)).toBe(0);
    const gesamt = platziere(p2).gesamtFrames / p2.projekt.fps;
    const laenge = Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", vorschau]).stdout.toString());
    expect(Math.abs(laenge - gesamt)).toBeLessThan(0.15);
    expect(await lauf("schnitt", "resolve", "--plan", plan2, "--entwurf")).toBe(0);
    const ordner = path.join(tmp, "Studio", "inhalte", "c-0007", "ergebnis", "resolve");
    expect(fs.readdirSync(ordner).sort()).toEqual(["LIESMICH.md", "overlays", "plan.json", "timeline.fcpxml", "timeline.otio", "untertitel.srt"]);
    expect(fs.readFileSync(path.join(ordner, "LIESMICH.md"), "utf8")).toMatch(/## Betonte Wörter[\s\S]*Küche/);
    expect(fs.readFileSync(path.join(ordner, "timeline.fcpxml"), "utf8")).toContain("broll-k-0001");

    // nach dem Video: B-Roll als genutzt vermerken
    expect(await mc("katalog", "genutzt", "--plan", plan2, "--datum", "2026-10-20")).toBe(0);
    expect(JSON.parse(fs.readFileSync(path.join(env.datenDir, "katalog.json"), "utf8"))[0].zuletztGenutzt).toEqual({ datum: "2026-10-20", projekt: "Küche Gossau [alperna]" });
  }, 240_000);
});
});
