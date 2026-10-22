import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Markenprofil } from "../core/schemas";
import { findePreset, ladePresets } from "../presets/lader";
import type { StudioHome } from "../setup";
import { erzeugeUebergabe, freierOrdner, loesePfad, webmZuProRes } from "./uebergabe";
import { beispielPlan, beispielPlanMitTon } from "./testdaten";

const presets = ladePresets(path.resolve(__dirname, "../../presets"));
const exportPreset = findePreset(presets, "export", "reel");
const audio = findePreset(presets, "audio", "standard");
const alperna = Markenprofil.parse(JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../marken/alperna.json"), "utf8")));

/** Ein Studio-Ordner und ein Medien-Ordner mit leeren Dateien für alles, was der Beispielplan braucht. */
function werkstatt(opt: { overlay?: "mov" | "webm" } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "uebergabe-"));
  const home: StudioHome = { pfad: path.join(root, "Studio"), quelle: "STUDIO_HOME", medien: path.join(root, "Medien") };
  const plan = beispielPlan({
    overlays: [{ datei: `renders/c-0007/zahl.${opt.overlay ?? "mov"}`, effekt: "zahl-zaehler", t: 2.6, dauer: 2, begruendung: "Die Zahl im Satz soll hängen bleiben" }],
  });
  for (const rel of [...plan.quellen.map((q) => q.pfad), ...plan.overlays.map((o) => o.datei)]) {
    const p = loesePfad(home, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, "x");
  }
  return { root, home, plan };
}

const lauf = (w: ReturnType<typeof werkstatt>, extra: Partial<Parameters<typeof erzeugeUebergabe>[0]> = {}) =>
  erzeugeUebergabe({ plan: w.plan, home: w.home, aus: path.join(w.root, "aus"), profil: alperna.schnittprofil, export: exportPreset, audio, ...extra });

describe("loesePfad", () => {
  const home: StudioHome = { pfad: "/Studio", quelle: "STUDIO_HOME", medien: "/Medien" };
  it("Rohmaterial, Renders und Inspiration liegen im Medien-Ordner, alles andere im Studio-Ordner", () => {
    expect(loesePfad(home, "rohmaterial/a/b.mov")).toBe("/Medien/rohmaterial/a/b.mov");
    expect(loesePfad(home, "renders/c-0007/x.mov")).toBe("/Medien/renders/c-0007/x.mov");
    expect(loesePfad(home, "daten/x.json")).toBe("/Studio/daten/x.json");
  });
  it("ohne Medien-Ordner liegt alles im Studio-Ordner", () => {
    expect(loesePfad({ pfad: "/Studio", quelle: "config" }, "rohmaterial/a.mov")).toBe("/Studio/rohmaterial/a.mov");
  });
  it("lehnt absolute Pfade und Ausbrüche ab", () => {
    expect(() => loesePfad(home, "/etc/passwd")).toThrow();
    expect(() => loesePfad(home, "rohmaterial/../../etc/passwd")).toThrow();
  });
});

describe("erzeugeUebergabe", () => {
  it("schreibt Timeline, OTIO, Untertitel, Plan und Anleitung", () => {
    const w = werkstatt();
    const r = lauf(w);
    expect(r.dateien.sort()).toEqual(["LIESMICH.md", "plan.json", "timeline.fcpxml", "timeline.otio", "untertitel.srt"]);
    for (const d of r.dateien) expect(fs.existsSync(path.join(r.ordner, d)), d).toBe(true);
    expect(r.dauer).toBeCloseTo(5.44, 6);
    expect(r.untertitel).toBeGreaterThan(0);
  });

  it("die Pfade in der Timeline zeigen auf die echten Dateien dieses Rechners (Medien-Ordner)", () => {
    const w = werkstatt();
    const r = lauf(w);
    const xml = fs.readFileSync(path.join(r.ordner, "timeline.fcpxml"), "utf8");
    expect(xml).toContain(`file://${w.root}/Medien/rohmaterial/praxis-hofer/sprache-01.mov`);
    expect(xml).toContain(`file://${w.root}/Medien/renders/c-0007/zahl.mov`);
  });

  it("legt nie über ein vorhandenes Resolve-Projekt, sondern in resolve-v2", () => {
    const w = werkstatt();
    const erste = lauf(w);
    const zweite = lauf(w);
    expect(zweite.ordner).toBe(`${erste.ordner}-v2`);
    expect(lauf(w).ordner).toBe(`${erste.ordner}-v3`);
    expect(freierOrdner(path.join(w.root, "gibts-nicht"))).toBe(path.join(w.root, "gibts-nicht"));
  });

  it("ohne --aus gilt Studio/inhalte/<Inhalt-ID>/ergebnis/resolve, ohne Inhalt-ID ist der Zielordner Pflicht", () => {
    const w = werkstatt();
    const r = erzeugeUebergabe({ plan: w.plan, home: w.home, export: exportPreset, audio });
    expect(r.ordner).toBe(path.join(w.home.pfad, "inhalte", "c-0007", "ergebnis", "resolve"));
    const ohne = { ...w.plan, projekt: { ...w.plan.projekt, inhalt: undefined } };
    expect(() => erzeugeUebergabe({ plan: ohne, home: w.home, export: exportPreset, audio })).toThrow(/Zielordner/);
  });

  it("fehlende Quelldateien: Fehler mit Liste, oder nur Hinweis mit strikt=false", () => {
    const w = werkstatt();
    fs.rmSync(loesePfad(w.home, "rohmaterial/praxis-hofer/empfang-01.mov"));
    expect(() => lauf(w)).toThrow(/empfang-01\.mov/);
    expect(fs.existsSync(path.join(w.root, "aus"))).toBe(false);
    const r = lauf(w, { strikt: false });
    expect(r.fehlendeDateien).toEqual(["rohmaterial/praxis-hofer/empfang-01.mov"]);
    expect(r.befunde.map((b) => b.code)).toContain("datei-fehlt");
  });

  it("ein Plan mit Fehlern schreibt nichts", () => {
    const w = werkstatt();
    const kaputt = { ...w.plan, clips: [{ ...w.plan.clips[0]!, bis: 99 }] };
    expect(() => lauf(w, { plan: kaputt })).toThrow(/clip-ueber-ende/);
    expect(fs.existsSync(path.join(w.root, "aus"))).toBe(false);
  });

  it("ohne Wörter gibt es keine SRT", () => {
    const w = werkstatt();
    const r = lauf(w, { plan: { ...w.plan, woerter: [] } });
    expect(r.dateien).not.toContain("untertitel.srt");
    expect(r.untertitel).toBe(0);
  });

  it("WebM-Grafiken werden umgewandelt, die Timeline zeigt auf die MOV-Datei im Übergabeordner", () => {
    const w = werkstatt({ overlay: "webm" });
    const aufrufe: [string, string][] = [];
    const r = lauf(w, { konvertiere: (ein, aus) => { aufrufe.push([ein, aus]); fs.writeFileSync(aus, "mov"); } });
    expect(aufrufe).toEqual([[path.join(w.root, "Medien/renders/c-0007/zahl.webm"), path.join(r.ordner, "overlays/zahl.mov")]]);
    expect(r.umgewandelt).toEqual(["overlays/zahl.mov"]);
    expect(fs.readFileSync(path.join(r.ordner, "timeline.fcpxml"), "utf8")).toContain(`file://${r.ordner}/overlays/zahl.mov`);
    expect(fs.readFileSync(path.join(r.ordner, "timeline.otio"), "utf8")).toContain(`file://${r.ordner}/overlays/zahl.mov`);
  });

  it("MOV-Grafiken bleiben, wo sie sind", () => {
    const w = werkstatt({ overlay: "mov" });
    let gerufen = false;
    const r = lauf(w, { konvertiere: () => { gerufen = true; } });
    expect(gerufen).toBe(false);
    expect(r.umgewandelt).toEqual([]);
  });

  it("die Anleitung nennt Bildrate, Export-Preset, Ton und die Stellen, die auffielen", () => {
    const w = werkstatt();
    const lang = { ...w.plan, clips: [{ ...w.plan.clips[0]!, von: 0, bis: 7 }], broll: [], overlays: [], woerter: [] };
    const r = lauf(w, { plan: lang });
    const text = fs.readFileSync(path.join(r.ordner, "LIESMICH.md"), "utf8");
    expect(text).toContain("1080×1920");
    expect(text).toContain("25");
    expect(text).toContain("Preset «reel»");
    expect(text).toContain("-14 LUFS");
    expect(text).toContain("kein Bildwechsel".replace("kein", "keinen"));
    expect(text).toContain("Nicht in Resolve geprüft");
    expect(text).toContain("schnitt export-pruefen");
  });
});

describe("webmZuProRes", () => {
  it("benutzt den VP9-Decoder von libvpx (sonst geht der Alphakanal verloren) und ProRes 4444 mit Alpha", () => {
    const a = webmZuProRes("e.webm", "a.mov");
    expect(a.indexOf("libvpx-vp9")).toBeLessThan(a.indexOf("-i"));
    expect(a).toContain("yuva444p10le");
    expect(a).toContain("prores_ks");
  });
});

const hatFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
describe.skipIf(!hatFfmpeg)("Umwandlung mit echtem ffmpeg", () => {
  it("die Transparenz bleibt erhalten: linke Hälfte deckend, rechte Hälfte durchsichtig", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "alpha-"));
    const webm = path.join(dir, "o.webm");
    const mov = path.join(dir, "o.mov");
    const q = spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=black@0.0:s=216x384:r=25:d=1,format=yuva420p,drawbox=x=0:y=0:w=108:h=384:color=red@1.0:t=fill:replace=1", "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", webm], { encoding: "utf8" });
    expect(q.status, q.stderr).toBe(0);
    const c = spawnSync("ffmpeg", webmZuProRes(webm, mov), { encoding: "utf8" });
    expect(c.status, c.stderr).toBe(0);
    const probe = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,pix_fmt", "-of", "csv=p=0", mov], { encoding: "utf8" });
    // ffprobe meldet das Pixelformat des ProRes-Decoders (12 Bit mit Alpha), das Kodieren lief mit yuva444p10le
    expect(probe.stdout.trim()).toMatch(/^prores,yuva444p1[02]le$/);
    const alpha = (x0: number): number => {
      const r = spawnSync("ffmpeg", ["-loglevel", "error", "-i", mov, "-vf", `alphaextract,crop=40:40:${x0}:100,format=gray`, "-frames:v", "1", "-f", "rawvideo", "-"], { maxBuffer: 1 << 20 });
      expect(r.status).toBe(0);
      const b = r.stdout;
      return b.reduce((a, v) => a + v, 0) / b.length;
    };
    expect(alpha(10)).toBeGreaterThan(240);
    expect(alpha(150)).toBeLessThan(15);
  }, 60_000);
});

describe("erzeugeUebergabe mit Look (LUT)", () => {
  const lutDatei = (root: string, name: string) => {
    const p = path.join(root, "luts", name);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, "LUT_3D_SIZE 2\n");
    return p;
  };

  it("kopiert die LUTs nach lut/, nennt sie in der Tabelle und erklärt, wohin sie gehören (nie auf die Grafiken)", () => {
    const w = werkstatt();
    w.plan.quellen.find((q) => q.id === "sprache")!.farbe = "log";
    const r = lauf(w, { luts: { log: lutDatei(w.root, "farbe-log.cube"), angleich: lutDatei(w.root, "farbe-angleich.cube") } });
    expect(fs.existsSync(path.join(r.ordner, "lut", "farbe-log.cube"))).toBe(true);
    expect(fs.existsSync(path.join(r.ordner, "lut", "farbe-angleich.cube"))).toBe(true);
    const liesmich = fs.readFileSync(path.join(r.ordner, "LIESMICH.md"), "utf8");
    expect(liesmich).toContain("| `lut/` | 2 LUTs für den Look (.cube) |");
    expect(liesmich).toContain("`lut/farbe-log.cube` für Clips aus Log-Quellen (sprache)");
    expect(liesmich).toContain("`lut/farbe-angleich.cube` für alle anderen Videoclips und die B-Roll");
    expect(liesmich).toContain("nie auf die Grafiken (V3)");
    expect(liesmich).toContain("keine Kamera-LUT");
  });

  it("eine V-Log-LUT bekommt die Anleitung dazu: ohne Farbmanagement, Datenpegel prüfen, Belichtung; und sagt nicht mehr «Näherung»", () => {
    const w = werkstatt();
    w.plan.quellen.find((q) => q.id === "sprache")!.farbe = "log";
    const vlog = path.join(w.root, "luts", "farbe-log.cube");
    fs.mkdirSync(path.dirname(vlog), { recursive: true });
    fs.writeFileSync(vlog, 'TITLE "Alperna V-Log"\nLUT_3D_SIZE 2\n');
    const r = lauf(w, { luts: { log: vlog, angleich: lutDatei(w.root, "farbe-angleich.cube") } });
    const liesmich = fs.readFileSync(path.join(r.ordner, "LIESMICH.md"), "utf8");
    expect(liesmich).toContain("Umrechnung von V-Log nach Rec. 709 mit der Kurve von Panasonic");
    expect(liesmich).toContain("ohne Farbmanagement");
    expect(liesmich).toContain("Code 128 (voll) oder 173 (begrenzt)");
    expect(liesmich).toContain("[Vermutung]");
    expect(liesmich).toContain("--bereich voll");
    expect(liesmich).toContain("--belichtung");
    expect(liesmich).toContain("ein Entwurf");
    expect(liesmich).not.toContain("keine Kamera-LUT");
    expect(liesmich).toContain("nie auf die Grafiken (V3)");
  });

  it("eine LUT «log» ohne V-Log im Titel (die Näherung aus Zahlen) bekommt die V-Log-Anleitung nicht", () => {
    const w = werkstatt();
    w.plan.quellen.find((q) => q.id === "sprache")!.farbe = "log";
    const generisch = path.join(w.root, "luts", "farbe-log.cube");
    fs.mkdirSync(path.dirname(generisch), { recursive: true });
    fs.writeFileSync(generisch, 'TITLE "Alperna Log"\nLUT_3D_SIZE 2\n');
    const liesmich = fs.readFileSync(path.join(lauf(w, { luts: { log: generisch } }).ordner, "LIESMICH.md"), "utf8");
    expect(liesmich).not.toContain("ohne Farbmanagement");
    expect(liesmich).toContain("keine Kamera-LUT");
  });

  it("ohne LUT sagt die Anleitung, dass keine beiliegt, und es gibt keinen Ordner lut/", () => {
    const w = werkstatt();
    const r = lauf(w);
    expect(fs.existsSync(path.join(r.ordner, "lut"))).toBe(false);
    const liesmich = fs.readFileSync(path.join(r.ordner, "LIESMICH.md"), "utf8");
    expect(liesmich).toContain("Eine LUT liegt nicht bei");
    expect(liesmich).not.toContain("| `lut/` |");
  });

  it("nur die LUT «angleich»: kein Satz über Log-Quellen", () => {
    const w = werkstatt();
    const r = lauf(w, { luts: { angleich: lutDatei(w.root, "farbe-angleich.cube") } });
    const liesmich = fs.readFileSync(path.join(r.ordner, "LIESMICH.md"), "utf8");
    expect(liesmich).toContain("farbe-angleich.cube");
    expect(liesmich).not.toContain("für Clips aus Log-Quellen");
    expect(liesmich).toContain("| `lut/` | 1 LUT für den Look (.cube) |");
  });
});

describe("erzeugeUebergabe mit getrenntem Ton", () => {
  const mitTon = () => {
    const w = werkstatt();
    w.plan = beispielPlanMitTon(5.5, { overlays: w.plan.overlays });
    const p = loesePfad(w.home, "rohmaterial/praxis-hofer/ton-01.wav");
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, "x");
    return w;
  };

  it("die Timeline trägt die Tonaufnahme als Audio-Clips und die Anleitung nennt Versatz und Ort", () => {
    const w = mitTon();
    const r = lauf(w);
    const fcpxml = fs.readFileSync(path.join(r.ordner, "timeline.fcpxml"), "utf8");
    expect(fcpxml).toContain("ton-01.wav");
    expect(fcpxml).toContain('name="ton-k01"');
    const liesmich = fs.readFileSync(path.join(r.ordner, "LIESMICH.md"), "utf8");
    expect(liesmich).toContain("## Ton von der Tonaufnahme");
    expect(liesmich).toContain("- sprache: ton-1, Versatz +5,50 s");
    expect(liesmich).toContain("--versatz");
  });

  it("ohne getrennten Ton fehlt der Abschnitt", () => {
    const w = werkstatt();
    const r = lauf(w);
    expect(fs.readFileSync(path.join(r.ordner, "LIESMICH.md"), "utf8")).not.toContain("## Ton von der Tonaufnahme");
  });

  it("die Datei der Tonaufnahme fehlt auf diesem Rechner: die Übergabe bricht ab und nennt sie", () => {
    const w = mitTon();
    fs.rmSync(loesePfad(w.home, "rohmaterial/praxis-hofer/ton-01.wav"));
    expect(() => lauf(w)).toThrow(/ton-01\.wav/);
  });

  it("ein Ton, der den Clip nicht deckt, ist ein Fehler, und die Übergabe schreibt nichts", () => {
    const w = mitTon();
    w.plan = beispielPlanMitTon(-3, { overlays: w.plan.overlays });
    expect(() => lauf(w)).toThrow(/ton-vor-beginn/);
    expect(fs.existsSync(path.join(w.root, "aus"))).toBe(false);
  });
});
