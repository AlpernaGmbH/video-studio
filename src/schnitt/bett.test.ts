import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { duckKurve, mischeBett, rmsDb, SAMPLERATE, schreibeWav, spitzeDb, synthMusik, synthSfx, synthSfxSpur, wavBytes, type SfxArt, type Stereo } from "./bett";
import { bettEreignisse } from "./bett-befehle";
import { leseSchnittplan, platziere } from "./plan";

const hatFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
const sr = SAMPLERATE;

/** RMS (dB) eines Abschnitts. */
const abschnitt = (s: Stereo, von: number, bis: number): number => rmsDb({ l: s.l.slice(Math.round(von * sr), Math.round(bis * sr)), r: s.r.slice(Math.round(von * sr), Math.round(bis * sr)) });

describe("synthMusik", () => {
  const m = synthMusik(6);
  it("hat die verlangte Länge, bleibt unter 0 dBFS und ist nicht still", () => {
    expect(m.l.length).toBe(6 * sr);
    expect(m.r.length).toBe(6 * sr);
    expect(spitzeDb(m)).toBeLessThan(0);
    expect(spitzeDb(m)).toBeGreaterThan(-24);
    expect(rmsDb(m)).toBeGreaterThan(-40);
    expect(m.l.every(Number.isFinite) && m.r.every(Number.isFinite)).toBe(true);
  });
  it("beginnt und endet leise (weich ein- und ausgeblendet)", () => {
    expect(Math.abs(m.l[0]!)).toBeLessThan(1e-3);
    expect(abschnitt(m, 5.9, 6)).toBeLessThan(abschnitt(m, 2, 3) - 12);
    expect(abschnitt(m, 0, 0.1)).toBeLessThan(abschnitt(m, 2, 3) - 12);
  });
  it("ist deterministisch: gleiche Eingabe, gleiche Bytes", () => {
    const b = synthMusik(6);
    expect(Buffer.from(b.l.buffer).equals(Buffer.from(m.l.buffer))).toBe(true);
    expect(Buffer.from(synthMusik(6, sr, 8).l.buffer).equals(Buffer.from(m.l.buffer))).toBe(false);
  });
  it("hat links und rechts nicht dasselbe Signal (Breite)", () => {
    let gleich = 0;
    for (let i = 0; i < m.l.length; i += 97) if (Math.abs(m.l[i]! - m.r[i]!) < 1e-6) gleich++;
    expect(gleich / (m.l.length / 97)).toBeLessThan(0.2);
  });
});

describe("synthSfx", () => {
  const arten: SfxArt[] = ["whoosh", "impact", "tick", "pop", "riser", "sweep"];
  it("jede Art liefert ein endliches Signal mit Spitze zwischen -30 und -3 dBFS", () => {
    for (const art of arten) {
      const s = synthSfx({ t: 0, art });
      expect(s.l.length, art).toBeGreaterThan(sr * 0.05);
      expect(s.l.every(Number.isFinite), art).toBe(true);
      expect(spitzeDb(s), art).toBeLessThan(-3);
      expect(spitzeDb(s), art).toBeGreaterThan(-30);
    }
  });
  it("der Pegel verschiebt die Spitze um genau so viele dB", () => {
    const a = spitzeDb(synthSfx({ t: 0, art: "pop" }));
    const b = spitzeDb(synthSfx({ t: 0, art: "pop", pegelDb: -6 }));
    expect(a - b).toBeCloseTo(6, 3);
  });
  it("der Whoosh hat seinen Höhepunkt in der Mitte, der Einschlag am Anfang", () => {
    const w = synthSfx({ t: 0, art: "whoosh", dauer: 0.8 });
    expect(abschnitt(w, 0.3, 0.5)).toBeGreaterThan(abschnitt(w, 0, 0.05) + 6);
    const e = synthSfx({ t: 0, art: "impact" });
    expect(abschnitt(e, 0, 0.2)).toBeGreaterThan(abschnitt(e, 1.0, 1.3) + 10);
  });
  it("die Spur legt jedes Ereignis an seine Zeit", () => {
    const spur = synthSfxSpur([{ t: 1, art: "tick" }, { t: 2.5, art: "tick" }], 4);
    expect(abschnitt(spur, 1, 1.06)).toBeGreaterThan(-40);
    expect(abschnitt(spur, 1.5, 2.4)).toBeLessThan(-100);
    expect(abschnitt(spur, 2.5, 2.56)).toBeGreaterThan(-40);
  });
});

describe("duckKurve und mischeBett", () => {
  // Sprache: Rauschen von 1 s bis 2 s, sonst Stille
  const sprache = new Float32Array(4 * sr);
  for (let i = sr; i < 2 * sr; i++) sprache[i] = (Math.sin(i * 0.31) + Math.sin(i * 0.77)) * 0.1;
  const g = duckKurve(sprache, sr);
  const db = (t: number): number => 20 * Math.log10(g[Math.round(t * sr)]!);

  it("senkt unter der Sprache um rund 10 dB ab und kommt danach zurück", () => {
    expect(db(0.5)).toBeGreaterThan(-0.5);
    expect(db(1.6)).toBeLessThan(-8);
    expect(db(1.6)).toBeGreaterThan(-12);
    expect(db(3.8)).toBeGreaterThan(-1.5);
  });
  it("geht schnell hinein und langsam heraus", () => {
    expect(db(1.12)).toBeLessThan(-6); // 120 ms nach dem Einsatz schon unten
    expect(db(2.1)).toBeLessThan(-4); // 100 ms nach dem Ende noch nicht oben
  });
  it("die Musik im Bett ist unter der Sprache leiser als ohne Sprache, die SFX bleiben gleich laut", () => {
    const mit = mischeBett({ dauer: 4, sfx: [{ t: 1.5, art: "pop" }], sprache });
    const ohne = mischeBett({ dauer: 4, sfx: [{ t: 1.5, art: "pop" }] });
    expect(abschnitt(mit.bett, 1.05, 1.4)).toBeLessThan(abschnitt(ohne.bett, 1.05, 1.4) - 7);
    expect(abschnitt(mit.sfx, 1.5, 1.6)).toBeCloseTo(abschnitt(ohne.sfx, 1.5, 1.6), 6);
    // Musik- und SFX-Spur einzeln bleiben unverändert, das Absenken gilt nur im Bett
    expect(abschnitt(mit.musik, 1.05, 1.4)).toBeCloseTo(abschnitt(ohne.musik, 1.05, 1.4), 6);
  });
});

describe("wavBytes", () => {
  it("schreibt einen gültigen 24-Bit-Stereo-Kopf und rechnet Werte richtig um", () => {
    const b = wavBytes({ l: Float32Array.from([0, 0.5, -0.5]), r: Float32Array.from([1, -1, 0.25]) });
    expect(b.toString("ascii", 0, 4)).toBe("RIFF");
    expect(b.toString("ascii", 8, 12)).toBe("WAVE");
    expect(b.readUInt16LE(22)).toBe(2);
    expect(b.readUInt32LE(24)).toBe(48000);
    expect(b.readUInt16LE(34)).toBe(24);
    expect(b.readUInt32LE(40)).toBe(3 * 6);
    expect(b.readIntLE(44 + 6, 3)).toBe(Math.round(0.5 * 8388607));
    expect(b.readIntLE(44 + 3, 3)).toBe(8388607);
    expect(b.readIntLE(44 + 9, 3)).toBe(-8388607);
  });
  it.skipIf(!hatFfmpeg)("ffprobe liest die Datei als pcm_s24le, 48 kHz, 2 Kanäle, mit der richtigen Länge", () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "bett-"));
    try {
      const f = path.join(d, "x.wav");
      schreibeWav(f, synthSfxSpur([{ t: 0, art: "tick" }], 1.5));
      const j = JSON.parse(spawnSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", f]).stdout.toString());
      expect(j.streams[0]).toMatchObject({ codec_name: "pcm_s24le", sample_rate: "48000", channels: 2 });
      expect(Number(j.format.duration)).toBeCloseTo(1.5, 2);
    } finally {
      fs.rmSync(d, { recursive: true, force: true });
    }
  });
});

describe("bettEreignisse", () => {
  const plan = leseSchnittplan({
    version: 1,
    projekt: { name: "Test", marke: "alperna", fps: 25, breite: 1080, hoehe: 1920 },
    quellen: [{ id: "a", pfad: "rohmaterial/t/a.mov", art: "video", dauer: 60, fps: 25, breite: 320, hoehe: 240, hatAudio: true }],
    clips: [{ id: "k0", quelle: "a", von: 0, bis: 4 }, { id: "k1", quelle: "a", von: 10, bis: 14 }, { id: "k2", quelle: "a", von: 20, bis: 24 }],
    overlays: [
      { datei: "renders/x/hook.webm", effekt: "hook-titelschlag", t: 0, dauer: 1.9, begruendung: "Hook als Titel" },
      { datei: "renders/x/liste.webm", effekt: "stichwort-liste", t: 5, dauer: 3.4, begruendung: "Drei Dinge" },
      { datei: "renders/x/zeit.webm", effekt: "zeitraum-leiste", t: 9, dauer: 2.8, begruendung: "Der Zeitraum" },
      { datei: "renders/x/ut.webm", effekt: "untertitel-pop", t: 0, dauer: 12, begruendung: "Untertitel" },
    ],
  });
  const zeit = platziere(plan);
  const sb = [
    { effekt: "stichwort-liste", t: 5, params: { stichwoerter: ["a", "b", "c", "d"], abstand: 0.9 } },
    { effekt: "zeitraum-leiste", t: 9, params: { laufzeit: 1.5 } },
  ];
  const e = bettEreignisse(plan, zeit, sb);

  it("legt einen leisen Whoosh vor jeden Schnitt (nicht vor den Anfang) und lässt Untertitel still", () => {
    const schnitte = e.filter((x) => x.art === "whoosh" && x.pegelDb === -16);
    expect(schnitte.map((x) => x.t)).toEqual([3.8, 7.8]);
    expect(schnitte.map((x) => x.richtung)).toEqual(["auf", "ab"]);
    expect(e.some((x) => x.t >= 11.9 && x.pegelDb === undefined && x.art === "tick")).toBe(false);
  });
  it("der Hook-Titel bekommt Whoosh und Einschlag", () => {
    expect(e.filter((x) => x.art === "impact").map((x) => x.t)).toEqual([0.35]);
    expect(e.some((x) => x.art === "whoosh" && x.t === 0.05 && x.dauer === 0.9)).toBe(true);
  });
  it("die Stichwort-Liste tickt je Zeile im Abstand aus dem Storyboard, ohne Storyboard drei Mal je 0,5 s", () => {
    expect(e.filter((x) => x.art === "tick" && x.t > 5 && x.t < 9).map((x) => Number(x.t.toFixed(2)))).toEqual([5.1, 6, 6.9, 7.8]);
    const ohne = bettEreignisse(plan, zeit);
    expect(ohne.filter((x) => x.art === "tick" && x.t > 5 && x.t < 6.5).map((x) => Number(x.t.toFixed(2)))).toEqual([5.1, 5.6, 6.1]);
  });
  it("die Zeitraum-Leiste bekommt einen Sweep über die Laufzeit und am Ende einen Tick", () => {
    const sweep = e.find((x) => x.art === "sweep")!;
    expect(sweep).toMatchObject({ t: 9.25, dauer: 1.5 });
    expect(e.some((x) => x.art === "tick" && Math.abs(x.t - 10.75) < 1e-9)).toBe(true);
  });
  it("ist nach Zeit geordnet", () => {
    for (let i = 1; i < e.length; i++) expect(e[i]!.t).toBeGreaterThanOrEqual(e[i - 1]!.t);
  });
});
