import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Markenprofil } from "../core/schemas";
import type { Messung } from "../presets/export";
import { messeKlangpegel, pegelAusEbur128 } from "../presets/messen";
import { TIEFENANTEIL_MAX } from "./klang";
import { bewerteQualitaet, messeQualitaet, messeTiefenanteil, qualitaetZeilen, rmsAusAstats, tiefenanteilAusPegeln, type Qualitaet } from "./qualitaet";

const hatFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
const root = path.resolve(import.meta.dirname, "..", "..");
const profil = Markenprofil.parse(JSON.parse(fs.readFileSync(path.join(root, "marken", "alperna.json"), "utf8"))).schnittprofil!;

const messung = (x: Partial<Messung> = {}): Messung => ({ breite: 1080, hoehe: 1920, fps: 25, videoCodec: "h264", pixFmt: "yuv420p", dauer: 30, gigabyte: 0.03, audioCodec: "aac", audioKbit: 160, audioRate: 48000, videoMbit: 9, lufs: -14, truePeak: -2, farbe: { primaries: "bt709" }, ...x });
const qualitaet = (x: Partial<Qualitaet> = {}): Qualitaet => ({
  datei: "/x.mp4",
  gemessen: "2026-10-24T12:00:00.000Z",
  messung: messung(),
  dauer: 30,
  breite: 1080,
  hoehe: 1920,
  fps: 25,
  lufs: -14,
  truePeak: -2,
  schnitte: { anzahl: 8, proMinute: 16, quelle: "plan" },
  farbe: { saettigung: 0.3, yLow: 0.1, yHigh: 0.8, spanne: 0.7 },
  stille: { anteil: 0.05, laengste: 0.3 },
  ersteAussage: { sekunden: 0.5, quelle: "plan" },
  ...x,
});

describe("Auswertung der Ausgaben von ffmpeg", () => {
  const astats = `[Parsed_astats_0 @ 0x1] Channel: 1
[Parsed_astats_0 @ 0x1] RMS level dB: -30.000000
[Parsed_astats_0 @ 0x1] Overall
[Parsed_astats_0 @ 0x1] DC offset: 0.000000
[Parsed_astats_0 @ 0x1] Peak level dB: -24.065186
[Parsed_astats_0 @ 0x1] RMS level dB: -27.073789
[Parsed_astats_0 @ 0x1] RMS peak dB: -27.058061`;

  it("rmsAusAstats liest den Pegel des Abschnitts «Overall», nicht den eines Kanals", () => {
    expect(rmsAusAstats(astats)).toBe(-27.073789);
    expect(rmsAusAstats("Overall\nRMS level dB: -inf")).toBeUndefined();
    expect(rmsAusAstats("nichts")).toBeUndefined();
  });

  it("tiefenanteilAusPegeln: gleicher Pegel ist alles, zehn dB weniger ist ein Zehntel, nie mehr als alles", () => {
    expect(tiefenanteilAusPegeln(-20, -20)).toBe(1);
    expect(tiefenanteilAusPegeln(-20, -30)).toBeCloseTo(0.1, 9);
    expect(tiefenanteilAusPegeln(-20, -23.0103)).toBeCloseTo(0.5, 3);
    expect(tiefenanteilAusPegeln(-20, -18)).toBe(1);
  });

  const ebur = (i: string, p: string) => `Summary:\n\n  Integrated loudness:\n    I:         ${i} LUFS\n    Threshold: -37.8 LUFS\n\n  True peak:\n    Peak:      ${p} dBFS\n`;
  it("pegelAusEbur128: Lautheit und Spitze; der Boden des Messtors (−70) und «-inf» gelten als nicht gemessen", () => {
    expect(pegelAusEbur128(ebur("-27.8", "-24.1"))).toEqual({ lufs: -27.8, truePeak: -24.1 });
    expect(pegelAusEbur128(ebur("-70.0", "-18.1"))).toEqual({ truePeak: -18.1 });
    expect(pegelAusEbur128(ebur("-inf", "-inf"))).toEqual({});
    expect(pegelAusEbur128("")).toEqual({});
  });
});

describe("bewerteQualitaet: Tiefenanteil", () => {
  const codes = (q: Qualitaet) => bewerteQualitaet(q, profil).hinweise.map((h) => h.code);

  it("meldet einen Anteil über der Schwelle als Hinweis (nie als Abweichung) und schweigt darunter und ohne Messung", () => {
    expect(codes(qualitaet({ tiefenanteil: TIEFENANTEIL_MAX + 0.05 }))).toContain("ton-tiefen");
    expect(codes(qualitaet({ tiefenanteil: TIEFENANTEIL_MAX }))).not.toContain("ton-tiefen");
    expect(codes(qualitaet({ tiefenanteil: 0.1 }))).not.toContain("ton-tiefen");
    expect(codes(qualitaet())).not.toContain("ton-tiefen");
    expect(bewerteQualitaet(qualitaet({ tiefenanteil: 0.9 }), profil).abweichungen).toEqual([]);
  });

  it("der Hinweis nennt die Prozent, die Schwelle und dass sie eine Annahme ist", () => {
    const h = bewerteQualitaet(qualitaet({ tiefenanteil: 0.55 }), profil).hinweise.find((x) => x.code === "ton-tiefen")!;
    expect(h.text).toContain("55 Prozent");
    expect(h.text).toContain("ab 40 Prozent");
    expect(h.text).toContain("Annahme");
  });

  it("die Zusammenfassung zeigt den Anteil neben Lautheit und Spitze", () => {
    expect(qualitaetZeilen(qualitaet({ tiefenanteil: 0.234 })).find((z) => z.startsWith("Ton:"))).toContain("23 Prozent der Energie unter 200 Hz");
    expect(qualitaetZeilen(qualitaet()).find((z) => z.startsWith("Ton:"))).not.toContain("200 Hz");
  });
});

describe("messeQualitaet: Tiefenanteil", () => {
  const ersatz = (extra: Record<string, unknown> = {}) => ({
    datei: "/x.mp4",
    messeDatei: async () => messung(),
    messeSchnitte: async () => 15,
    messeBilder: async () => ({ saettigung: 0.2, yLow: 0.1, yHigh: 0.8, bilder: 8 }),
    findeStille: async () => [],
    jetzt: () => new Date("2026-10-24T12:00:00Z"),
    ...extra,
  });

  it("nimmt den gemessenen Anteil in die Messung, und ohne Tonspur wird nichts gemessen", async () => {
    expect((await messeQualitaet(ersatz({ messeTiefen: async () => 0.31 }))).tiefenanteil).toBe(0.31);
    let aufgerufen = false;
    const stumm = await messeQualitaet(ersatz({ messeDatei: async () => messung({ audioCodec: undefined, lufs: undefined, truePeak: undefined }), messeTiefen: async () => ((aufgerufen = true), 0.5) }));
    expect(aufgerufen).toBe(false);
    expect(stumm.tiefenanteil).toBeUndefined();
  });

  it("eine Messung, die nicht gelingt, lässt das Feld weg, statt zu scheitern", async () => {
    expect((await messeQualitaet(ersatz({ messeTiefen: async () => undefined }))).tiefenanteil).toBeUndefined();
  });
});

describe.skipIf(!hatFfmpeg)("mit echtem ffmpeg", () => {
  let tmp: string;
  beforeEach(() => void (tmp = fs.mkdtempSync(path.join(os.tmpdir(), "studio-tiefen-"))));
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const ff = (...a: string[]): void => void expect(spawnSync("ffmpeg", ["-loglevel", "error", "-y", ...a]).status, a.join(" ")).toBe(0);

  it("ein tiefer Ton (80 Hz) liegt fast ganz unter 200 Hz, ein hoher (3 kHz) fast gar nicht, die Mischung dazwischen", async () => {
    ff("-f", "lavfi", "-i", "sine=frequency=80:duration=2", path.join(tmp, "tief.wav"));
    ff("-f", "lavfi", "-i", "sine=frequency=3000:duration=2", path.join(tmp, "hoch.wav"));
    ff("-f", "lavfi", "-i", "sine=frequency=80:duration=2", "-f", "lavfi", "-i", "sine=frequency=3000:duration=2", "-filter_complex", "[0:a][1:a]amix=inputs=2:normalize=0", path.join(tmp, "mix.wav"));
    const tief = (await messeTiefenanteil(path.join(tmp, "tief.wav")))!;
    const hoch = (await messeTiefenanteil(path.join(tmp, "hoch.wav")))!;
    const mix = (await messeTiefenanteil(path.join(tmp, "mix.wav")))!;
    expect(tief).toBeGreaterThan(0.9);
    expect(hoch).toBeLessThan(0.05);
    expect(mix).toBeGreaterThan(0.3);
    expect(mix).toBeLessThan(0.7);
  }, 60_000);

  it("eine fehlende Datei und eine Datei ohne Ton ergeben keinen Wert, keinen Fehler", async () => {
    expect(await messeTiefenanteil(path.join(tmp, "gibt-es-nicht.wav"))).toBeUndefined();
    ff("-f", "lavfi", "-i", "testsrc2=size=64x64:rate=5:duration=1", path.join(tmp, "stumm.mp4"));
    expect(await messeTiefenanteil(path.join(tmp, "stumm.mp4"))).toBeUndefined();
  }, 60_000);

  it("messeKlangpegel: Spitze und Lautheit einer Audiodatei; bei einem Klang unter 0,4 s nur die Spitze", async () => {
    ff("-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-af", "volume=-6dB", path.join(tmp, "lang.wav"));
    ff("-f", "lavfi", "-i", "sine=frequency=440:duration=0.1", path.join(tmp, "kurz.wav"));
    const lang = await messeKlangpegel(path.join(tmp, "lang.wav"));
    expect(lang.lufs).toBeLessThan(-20);
    expect(lang.truePeak).toBeLessThan(-20);
    const kurz = await messeKlangpegel(path.join(tmp, "kurz.wav"));
    expect(kurz.lufs).toBeUndefined();
    expect(kurz.truePeak).toBeLessThan(0);
    await expect(messeKlangpegel(path.join(tmp, "fehlt.wav"))).rejects.toThrow(/Datei fehlt/);
  }, 60_000);
});
