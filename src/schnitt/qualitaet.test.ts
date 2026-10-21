import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Markenprofil } from "../core/schemas";
import type { Messung } from "../presets/export";
import { findePreset, ladePresets } from "../presets/lader";
import { leseSchnittplan } from "./plan";
import { bewerteQualitaet, kennzahlenAusPlan, messeQualitaet, messeSchnitte, qualitaetZeilen, stilleKennzahlen, zaehleSzenenwechsel, type Qualitaet } from "./qualitaet";
import { beispielPlan } from "./testdaten";

const hatFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
const root = path.resolve(import.meta.dirname, "..", "..");
const profil = Markenprofil.parse(JSON.parse(fs.readFileSync(path.join(root, "marken", "alperna.json"), "utf8"))).schnittprofil!;
const presets = ladePresets(path.join(root, "presets"));
const exportPreset = findePreset(presets, "export", "reel");
const audioPreset = findePreset(presets, "audio", "standard");

const messung = (x: Partial<Messung> = {}): Messung => ({ breite: 1080, hoehe: 1920, fps: 25, videoCodec: "h264", pixFmt: "yuv420p", dauer: 30, gigabyte: 0.03, audioCodec: "aac", audioKbit: 160, audioRate: 48000, videoMbit: 9, lufs: -14, truePeak: -2, farbe: { primaries: "bt709" }, ...x });
const qualitaet = (x: Partial<Qualitaet> = {}): Qualitaet => ({
  datei: "/x.mp4",
  gemessen: "2026-10-21T12:00:00.000Z",
  messung: messung(),
  dauer: 30,
  breite: 1080,
  hoehe: 1920,
  fps: 25,
  videoMbit: 9,
  lufs: -14,
  truePeak: -2,
  schnitte: { anzahl: 10, proMinute: 20, quelle: "plan" },
  zooms: { anzahl: 1, proMinute: 2, },
  farbe: { saettigung: 0.2, yLow: 0.1, yHigh: 0.8, spanne: 0.7 },
  stille: { anteil: 0.05, laengste: 0.3 },
  ersteAussage: { sekunden: 0.3, quelle: "plan" },
  ...x,
});

describe("zaehleSzenenwechsel", () => {
  it("zählt die Zeilen mit einem Szenenwert", () => {
    const text = "frame:0 pts:25 pts_time:1\nlavfi.scene_score=0.512\nframe:1 pts:90 pts_time:3.6\nlavfi.scene_score=0.9\n";
    expect(zaehleSzenenwechsel(text)).toBe(2);
    expect(zaehleSzenenwechsel("")).toBe(0);
  });
});

describe("kennzahlenAusPlan", () => {
  it("Beispielplan: zwei Schnitte zwischen drei Clips, ein Zoom, Anteil von Grafik und B-Roll, erste Aussage nach 0,12 s (auf das Bildraster gerundet)", () => {
    const k = kennzahlenAusPlan(beispielPlan());
    expect(k.schnitte).toBe(2);
    expect(k.zooms).toBe(1);
    expect(k.dauer).toBeCloseTo(5.44, 6);
    expect(k.grafikAnteil).toBeCloseTo(2 / 5.44, 6);
    expect(k.brollAnteil).toBeCloseTo(1 / 5.44, 6);
    expect(k.ersteAussage).toBeCloseTo(0.12, 6);
  });

  it("ein Clip, der dort weiterläuft, wo der vorige aufhörte (Zoom-Teilung), ist kein Schnitt", () => {
    const p = beispielPlan({
      clips: [
        { id: "k01", quelle: "sprache", von: 2, bis: 3 },
        { id: "k01-s1", quelle: "sprache", von: 3, bis: 4, zoom: 1.1 },
        { id: "k01-s2", quelle: "sprache", von: 4, bis: 5 },
        { id: "k02", quelle: "sprache", von: 8, bis: 9 },
      ],
    });
    const k = kennzahlenAusPlan(p);
    expect(k.schnitte).toBe(1);
    expect(k.zooms).toBe(1);
  });

  it("überlappende Grafiken zählen die Zeit nur einmal, und ein Anteil über das Ende hinaus wird abgeschnitten", () => {
    const p = beispielPlan({
      overlays: [
        { datei: "renders/a.webm", effekt: "x", t: 1, dauer: 2, begruendung: "Grafik eins" },
        { datei: "renders/b.webm", effekt: "x", t: 2, dauer: 2, begruendung: "Grafik zwei" },
        { datei: "renders/c.webm", effekt: "x", t: 5, dauer: 3, begruendung: "Grafik drei am Ende" },
      ],
    });
    // Zeit mit Grafik: 1 bis 4 (3 s) und 5 bis 5,44 (0,44 s)
    expect(kennzahlenAusPlan(p).grafikAnteil).toBeCloseTo(3.44 / 5.44, 6);
  });

  it("ohne Wörter gibt es keine erste Aussage", () => {
    expect(kennzahlenAusPlan(beispielPlan({ woerter: [] })).ersteAussage).toBeUndefined();
  });
});

describe("stilleKennzahlen", () => {
  it("summiert die Stille, nennt die längste und das Ende einer Stille am Anfang", () => {
    const r = stilleKennzahlen([{ von: 0, bis: 1.5 }, { von: 5, bis: 5.5 }, { von: 9, bis: 12 }], 10);
    expect(r.anteil).toBeCloseTo((1.5 + 0.5 + 1) / 10, 9);
    expect(r.laengste).toBe(1.5);
    expect(r.anfang).toBe(1.5);
  });
  it("ohne Stille am Anfang ist die erste Aussage bei 0", () => {
    expect(stilleKennzahlen([{ von: 3, bis: 4 }], 10).anfang).toBe(0);
    expect(stilleKennzahlen([], 10)).toEqual({ anteil: 0, laengste: 0, anfang: 0 });
  });
});

describe("messeQualitaet (mit Ersatz-Messern)", () => {
  const ersatz = (extra: Record<string, unknown> = {}) => ({
    datei: "/x.mp4",
    messeDatei: async () => messung({ dauer: 30 }),
    messeSchnitte: async () => 15,
    messeBilder: async () => ({ saettigung: 0.2, yLow: 0.1, yHigh: 0.8, bilder: 8 }),
    findeStille: async () => [{ von: 0, bis: 0.8 }, { von: 10, bis: 10.5 }],
    jetzt: () => new Date("2026-10-21T12:00:00Z"),
    ...extra,
  });

  it("ohne Plan werden die Schnitte aus dem Bild gezählt und die erste Aussage aus dem Ton gelesen", async () => {
    const q = await messeQualitaet(ersatz());
    expect(q.schnitte).toEqual({ anzahl: 15, proMinute: 30, quelle: "bild" });
    expect(q.zooms).toBeUndefined();
    expect(q.ersteAussage).toEqual({ sekunden: 0.8, quelle: "ton" });
    expect(q.stille.anteil).toBeCloseTo(1.3 / 30, 9);
    expect(q.farbe.spanne).toBeCloseTo(0.7, 9);
    expect(q.gemessen).toBe("2026-10-21T12:00:00.000Z");
    expect(q.lufs).toBe(-14);
  });

  it("mit Plan kommen die genauen Zahlen aus dem Plan und das Bild wird nicht auf Szenenwechsel durchsucht", async () => {
    let gezaehlt = false;
    const q = await messeQualitaet(ersatz({ plan: beispielPlan(), messeSchnitte: async () => ((gezaehlt = true), 99), messeDatei: async () => messung({ dauer: 5.44 }) }));
    expect(gezaehlt).toBe(false);
    expect(q.schnitte.quelle).toBe("plan");
    expect(q.schnitte.anzahl).toBe(2);
    expect(q.zooms!.anzahl).toBe(1);
    expect(q.grafikAnteil).toBeGreaterThan(0.3);
    expect(q.ersteAussage).toEqual({ sekunden: expect.closeTo(0.12, 6), quelle: "plan" });
  });

  it("ein Plan, der nicht zur Länge der Datei passt (in Resolve geschnitten), wird nicht benutzt und der Grund steht in der Messung", async () => {
    const q = await messeQualitaet(ersatz({ plan: beispielPlan(), messeDatei: async () => messung({ dauer: 30 }) }));
    expect(q.schnitte).toEqual({ anzahl: 15, proMinute: 30, quelle: "bild" });
    expect(q.zooms).toBeUndefined();
    expect(q.planHinweis).toContain("passt nicht zum Video (30,0 s)");
    expect(qualitaetZeilen(q)[0]).toContain("Hinweis: Der Plan (5,4 s) passt nicht");
    // innerhalb einer halben Sekunde gilt der Plan
    const ok = await messeQualitaet(ersatz({ plan: beispielPlan(), messeDatei: async () => messung({ dauer: 5.8 }) }));
    expect(ok.planHinweis).toBeUndefined();
    expect(ok.schnitte.quelle).toBe("plan");
  });

  it("ein Video ohne Tonspur gilt als ganz still, und ohne lesbare Bilder bricht die Messung ab", async () => {
    const q = await messeQualitaet(ersatz({ messeDatei: async () => messung({ audioCodec: undefined, lufs: undefined, truePeak: undefined }) }));
    expect(q.stille.anteil).toBe(1);
    expect(q.lufs).toBeUndefined();
    await expect(messeQualitaet(ersatz({ messeBilder: async () => undefined }))).rejects.toThrow(/keine Bilder/);
  });
});

describe("bewerteQualitaet", () => {
  const codes = (q: Qualitaet) => bewerteQualitaet(q, profil, exportPreset, audioPreset).hinweise.map((h) => h.code);

  it("ein sauberes Video hat weder Hinweise noch Abweichungen", () => {
    const r = bewerteQualitaet(qualitaet(), profil, exportPreset, audioPreset);
    expect(r.hinweise).toEqual([]);
    expect(r.abweichungen).toEqual([]);
  });

  it("flaches Bild: Sättigung und Spanne klein", () => {
    expect(codes(qualitaet({ farbe: { saettigung: 0.02, yLow: 0.3, yHigh: 0.55, spanne: 0.25 } }))).toContain("bild-flach");
    expect(codes(qualitaet({ farbe: { saettigung: 0.02, yLow: 0.05, yHigh: 0.9, spanne: 0.85 } }))).not.toContain("bild-flach");
  });

  it("zu viele Zooms gegen das Schnittprofil (Toleranz eine halbe Zoom je Minute)", () => {
    expect(codes(qualitaet({ zooms: { anzahl: 20, proMinute: 40 } }))).toContain("zu-viele-zooms");
    expect(codes(qualitaet({ zooms: { anzahl: 2, proMinute: profil.zoom.maxProMinute + 0.4 } }))).not.toContain("zu-viele-zooms");
    expect(codes(qualitaet({ zooms: undefined }))).not.toContain("zu-viele-zooms");
  });

  it("Zooms bei Zoom «aus»", () => {
    const aus = { ...profil, zoom: { modus: "aus" as const, maxProMinute: 4 } };
    expect(bewerteQualitaet(qualitaet({ zooms: { anzahl: 3, proMinute: 6 } }), aus).hinweise.map((h) => h.code)).toContain("zoom-trotz-aus");
    expect(bewerteQualitaet(qualitaet({ zooms: { anzahl: 0, proMinute: 0 } }), aus).hinweise).toEqual([]);
  });

  it("erste Aussage zu spät und zu lange Pause gegen den Hook und die Pausen des Profils", () => {
    expect(codes(qualitaet({ ersteAussage: { sekunden: 3.5, quelle: "ton" } }))).toContain("hook-zu-spaet");
    expect(codes(qualitaet({ ersteAussage: { sekunden: profil.hookMaxSekunden + 0.1, quelle: "ton" } }))).not.toContain("hook-zu-spaet");
    expect(codes(qualitaet({ stille: { anteil: 0.2, laengste: 2.5 } }))).toContain("lange-pause");
  });

  it("Abweichungen vom Export- und Audio-Preset: Bitrate 4,8 Mbit/s und Lautheit (wie im Testexport)", () => {
    const r = bewerteQualitaet(qualitaet({ messung: messung({ videoMbit: 4.8, lufs: -9, truePeak: 1 }), videoMbit: 4.8, lufs: -9, truePeak: 1 }), profil, exportPreset, audioPreset);
    expect(r.abweichungen.map((a) => a.code)).toEqual(expect.arrayContaining(["bitrate", "lautheit", "spitze"]));
  });

  it("ohne Profil und Presets gibt es nur den Hinweis auf ein flaches Bild", () => {
    const r = bewerteQualitaet(qualitaet({ zooms: { anzahl: 50, proMinute: 100 } }));
    expect(r).toEqual({ abweichungen: [], hinweise: [] });
  });
});

describe("qualitaetZeilen", () => {
  it("fasst die Zahlen in kurze Zeilen mit Komma", () => {
    const z = qualitaetZeilen(qualitaet()).join("\n");
    expect(z).toContain("Dauer 30,0 s, 1080×1920, 25,0 Bilder pro Sekunde, Video 9,0 Mbit/s");
    expect(z).toContain("Schnitte: 10 (20,0 je Minute, aus dem Plan)");
    expect(z).toContain("Zooms: 1 (2,0 je Minute)");
    expect(z).toContain("Ton: -14,0 LUFS");
    expect(z).toContain("Erste Aussage nach 0,3 s (aus dem Plan)");
  });
});

describe.skipIf(!hatFfmpeg)("mit einer echten Datei (ffmpeg)", () => {
  let dir: string;
  beforeEach(() => void (dir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-qualitaet-"))));
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
  const ff = (...a: string[]) => expect(spawnSync("ffmpeg", ["-loglevel", "error", "-y", ...a]).status, a.join(" ")).toBe(0);

  /** 9 s: drei Stücke mit hartem Bildwechsel (Testbild, Rot, Testbild), Ton: 1,5 s Stille, dann ein Dauerton. */
  const video = (): string => {
    const ziel = path.join(dir, "export.mp4");
    ff("-f", "lavfi", "-i", "testsrc2=size=216x384:rate=25:duration=3", "-f", "lavfi", "-i", "color=c=red:size=216x384:rate=25:duration=3", "-f", "lavfi", "-i", "testsrc=size=216x384:rate=25:duration=3", "-f", "lavfi", "-i", "aevalsrc=if(gt(t\\,1.5)\\,0.3*sin(2*PI*300*t)\\,0):s=48000:d=9", "-filter_complex", "[0:v]format=yuv420p[a];[1:v]format=yuv420p[b];[2:v]format=yuv420p[c];[a][b][c]concat=n=3:v=1[v]", "-map", "[v]", "-map", "3:a", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", ziel);
    return ziel;
  };

  it("messeSchnitte zählt die harten Bildwechsel, ein stehendes Bild hat keine", async () => {
    expect(await messeSchnitte(video())).toBe(2);
    ff("-f", "lavfi", "-i", "color=c=blue:size=216x384:rate=25:duration=3", path.join(dir, "still.mp4"));
    expect(await messeSchnitte(path.join(dir, "still.mp4"))).toBe(0);
  }, 60_000);

  it("misst Dauer, Schnitte je Minute, Stille und die erste Aussage aus dem Ton", async () => {
    const q = await messeQualitaet({ datei: video() });
    expect(q.dauer).toBeCloseTo(9, 0);
    expect(q.schnitte.anzahl).toBe(2);
    expect(q.schnitte.proMinute).toBeCloseTo(2 / (q.dauer / 60), 6);
    expect(q.schnitte.quelle).toBe("bild");
    expect(q.ersteAussage.quelle).toBe("ton");
    expect(q.ersteAussage.sekunden).toBeGreaterThan(1.3);
    expect(q.ersteAussage.sekunden).toBeLessThan(1.7);
    expect(q.stille.anteil).toBeGreaterThan(0.12);
    expect(q.stille.anteil).toBeLessThan(0.22);
    expect(q.lufs).toBeDefined();
    expect(q.breite).toBe(216);
  }, 120_000);
});
