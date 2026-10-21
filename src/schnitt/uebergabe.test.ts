import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Markenprofil } from "../core/schemas";
import { findePreset, ladePresets } from "../presets/lader";
import type { StudioHome } from "../setup";
import { erzeugeUebergabe, formatHinweis, freierOrdner, liesmich, loesePfad, webmZuProRes } from "./uebergabe";
import { beispielPlan } from "./testdaten";

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

describe("erzeugeUebergabe mit Look", () => {
  it("legt die LUT in den Ordner look/, nennt sie in der Anleitung und meldet eine fehlende LUT", () => {
    const w = werkstatt();
    const lutRel = "renders/c-0007/look/alperna-kino.cube";
    const mit = { ...w, plan: { ...w.plan, look: { lut: lutRel, name: "Alperna Kino" } } };
    const abs = loesePfad(w.home, lutRel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, "LUT_3D_SIZE 2\n");
    const r = lauf(mit);
    expect(r.dateien).toContain("look/alperna-kino.cube");
    expect(fs.readFileSync(path.join(r.ordner, "look", "alperna-kino.cube"), "utf8")).toBe("LUT_3D_SIZE 2\n");
    const anleitung = fs.readFileSync(path.join(r.ordner, "LIESMICH.md"), "utf8");
    expect(anleitung).toContain("`look/alperna-kino.cube` ist die 3D-LUT «Alperna Kino»");
    expect(anleitung).toContain("V-Log");
    expect(anleitung).not.toContain("Eine LUT liegt noch nicht vor");
    // ohne LUT-Datei: Fehler wie bei jeder fehlenden Quelle
    fs.rmSync(abs);
    expect(() => lauf(mit, { aus: path.join(w.root, "aus2") })).toThrow(/renders\/c-0007\/look\/alperna-kino.cube/);
    // ohne Look bleibt der alte Satz
    const ohne = lauf(w, { aus: path.join(w.root, "aus3") });
    expect(fs.readFileSync(path.join(ohne.ordner, "LIESMICH.md"), "utf8")).toContain("Eine LUT liegt noch nicht vor");
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
    const lang = { ...w.plan, clips: [{ ...w.plan.clips[0]!, von: 0, bis: 4 }], broll: [], overlays: [], woerter: [] };
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

describe("liesmich zum Ton", () => {
  const mitMusik = (pfad: string) => {
    const plan = beispielPlan();
    return {
      ...plan,
      quellen: [...plan.quellen.filter((q) => q.id !== "musik-1"), { id: "musik-1", pfad, art: "audio" as const, dauer: 36, start: 0, audioRate: 48000, audioKanaele: 2, hatAudio: true }],
      musik: { quelle: "musik-1", t: 0, von: 0, pegelDb: 0 },
    };
  };
  const text = (plan: ReturnType<typeof beispielPlan>) => liesmich({ plan, dauer: 5, seiten: 0, befunde: [], export: exportPreset, audio: { ...audio, musikPegelDb: -20 }, umgewandelt: [], dateien: ["plan.json"] });

  it("mit dem fertigen Bett aus schnitt bett steht nicht der Musikpegel des Presets, sondern was im Bett steckt", () => {
    const t = text(mitMusik("renders/c-9001/ton/bett.wav"));
    expect(t).toContain("fertiges Bett auf A2");
    expect(t).toContain("renders/c-9001/ton/bett.wav");
    expect(t).toContain("musik.wav");
    expect(t).not.toContain("Die Musik liegt auf -20 dB");
  });
  it("mit eigener Musik gilt weiter der Pegel aus dem Audio-Preset", () => {
    const t = text(mitMusik("musik/lied.wav"));
    expect(t).toContain("Die Musik liegt auf -20 dB");
    expect(t).not.toContain("fertiges Bett");
  });
});

describe("webmZuProRes", () => {
  it("benutzt den VP9-Decoder von libvpx (sonst geht der Alphakanal verloren) und ProRes 4444 mit Alpha", () => {
    const a = webmZuProRes("e.webm", "a.mov");
    expect(a.indexOf("libvpx-vp9")).toBeLessThan(a.indexOf("-i"));
    expect(a).toContain("yuva444p10le");
    expect(a).toContain("prores_ks");
  });
  it("schreibt den Alphakanal mit 8 Bit, wie die Quelle", () => {
    const a = webmZuProRes("e.webm", "a.mov");
    expect(a[a.indexOf("-alpha_bits") + 1]).toBe("8");
  });
  it("legt die Quantisierung fest, statt das hohe Standard-Bitbudget von prores_ks zu nehmen", () => {
    const a = webmZuProRes("e.webm", "a.mov");
    expect(a[a.indexOf("-qscale:v") + 1]).toBe("6");
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

  it("ein Overlay mit weichem Verlauf über das ganze Bild wird mit 8-Bit-Alpha kleiner als mit 16 Bit und behält den Verlauf", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "alpha-"));
    const webm = path.join(dir, "v.webm");
    const mov8 = path.join(dir, "v8.mov");
    const mov16 = path.join(dir, "v16.mov");
    // Verlauf von durchsichtig (links) bis deckend (rechts) über das ganze Bild, 20 Bilder
    const q = spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=0x26324A:s=432x768:r=25:d=0.8,format=yuva420p,geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='255*X/W'", "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", webm], { encoding: "utf8" });
    expect(q.status, q.stderr).toBe(0);
    expect(spawnSync("ffmpeg", webmZuProRes(webm, mov8), { encoding: "utf8" }).status).toBe(0);
    const ohne = webmZuProRes(webm, mov16).filter((x, i, l) => x !== "-alpha_bits" && l[i - 1] !== "-alpha_bits");
    expect(spawnSync("ffmpeg", ohne, { encoding: "utf8" }).status).toBe(0);
    expect(fs.statSync(mov8).size).toBeLessThan(fs.statSync(mov16).size);
    const alpha = (x0: number): number => {
      const r = spawnSync("ffmpeg", ["-loglevel", "error", "-i", mov8, "-vf", `alphaextract,crop=20:20:${x0}:300,format=gray`, "-frames:v", "1", "-f", "rawvideo", "-"], { maxBuffer: 1 << 20 });
      expect(r.status).toBe(0);
      return r.stdout.reduce((a, v) => a + v, 0) / r.stdout.length;
    };
    expect(alpha(10)).toBeLessThan(25);
    expect(alpha(210)).toBeGreaterThan(100);
    expect(alpha(210)).toBeLessThan(155);
    expect(alpha(400)).toBeGreaterThan(230);
  }, 60_000);
});

describe("formatHinweis", () => {
  it("nennt Quellen mit anderem Seitenverhältnis als die Timeline und die Resolve-Einstellung dazu", () => {
    const plan = beispielPlan();
    // «empfang» ist 1920×1080 in einer 1080×1920-Timeline
    const h = formatHinweis(plan);
    expect(h).toMatch(/empfang \(1920×1080\)/);
    expect(h).toMatch(/Scale full frame with crop/);
    expect(h).not.toMatch(/sprache \(/);
    const text = liesmich({ plan, dauer: 5, seiten: 0, befunde: [], export: exportPreset, audio, umgewandelt: [], dateien: ["plan.json"] });
    expect(text).toContain("Format der Quelle passt nicht zur Timeline");
  });

  it("schweigt, wenn alle Quellen zur Timeline passen", () => {
    const plan = beispielPlan();
    const passend = { ...plan, quellen: plan.quellen.map((q) => (q.id === "empfang" ? { ...q, breite: 1080, hoehe: 1920 } : q)) };
    expect(formatHinweis(passend)).toBe("");
  });
});
