import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lauf } from "../presets/messen";
import { leseSchnittplan } from "./plan";
import { berechneGain, imRahmen, messeSchnittTon, schnittTonFilter, TON_KETTE, verbessereTon } from "./ton";

const hatFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
const preset = { zielLufs: -14, toleranzLu: 1, spitzeDbtp: -1 };

const plan = (clips: [number, number][]) =>
  leseSchnittplan({
    version: 1,
    projekt: { name: "Test", marke: "alperna", fps: 25, breite: 1080, hoehe: 1920 },
    quellen: [{ id: "a", pfad: "rohmaterial/t/a.mov", art: "video", dauer: 12, fps: 25, breite: 320, hoehe: 240, hatAudio: true }],
    clips: clips.map(([von, bis], i) => ({ id: `k${i}`, quelle: "a", von, bis, zeile: 1 })),
  });

describe("schnittTonFilter", () => {
  it("schneidet jeden Clip aus der Tonspur und fügt sie hintereinander, mit Kette dahinter", () => {
    const g = schnittTonFilter(plan([[1, 2.5], [6, 7]]), "a", { kette: "volume=3dB" });
    expect(g).toContain("[0:a]atrim=start=1.000:end=2.500,asetpts=PTS-STARTPTS[a0]");
    expect(g).toContain("[0:a]atrim=start=6.000:end=7.000,asetpts=PTS-STARTPTS[a1]");
    expect(g).toContain("[a0][a1]concat=n=2:v=0:a=1,volume=3dB[aus]");
  });
  it("meldet eine Quelle ohne Clip", () => {
    expect(() => schnittTonFilter(plan([[1, 2]]), "b")).toThrow(/keinen Clip/);
  });
  it("die Kette enthält Rumpelfilter, Entrauschen, Zischlaut und Verdichter", () => {
    for (const teil of ["highpass", "afftdn", "deesser", "acompressor"]) expect(TON_KETTE).toContain(teil);
  });
});

describe("berechneGain und imRahmen", () => {
  it("führt die Lautheit auf das Ziel und sagt, wo die Spitze danach liegt", () => {
    const r = berechneGain({ lufs: -30, truePeak: -12 }, preset);
    expect(r.gainDb).toBe(16);
    expect(r.spitzeDb).toBe(4);
  });
  it("prüft Toleranz und True Peak getrennt", () => {
    expect(imRahmen({ lufs: -14.6, truePeak: -1.2 }, preset)).toEqual({ lautheit: true, spitze: true });
    expect(imRahmen({ lufs: -16, truePeak: -1.2 }, preset).lautheit).toBe(false);
    expect(imRahmen({ lufs: -14, truePeak: -0.2 }, preset).spitze).toBe(false);
  });
});

describe.skipIf(!hatFfmpeg)("verbessereTon mit echtem ffmpeg", () => {
  let tmp: string;
  let quelle: string;
  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ton-"));
    quelle = path.join(tmp, "a.mov");
    // 12 s Bild, Ton: leiser Sinus (Sprache-Ersatz) plus Rauschen, dazwischen 3 s fast Stille (kommt im Schnitt nicht vor)
    const r = await lauf("ffmpeg", [
      "-y", "-hide_banner", "-f", "lavfi", "-i", "testsrc2=size=320x240:rate=25:duration=12",
      "-f", "lavfi", "-i", "sine=frequency=220:sample_rate=48000:duration=12,volume=-30dB",
      "-f", "lavfi", "-i", "anoisesrc=color=pink:amplitude=0.004:sample_rate=48000:duration=12",
      "-filter_complex", "[1:a][2:a]amix=inputs=2:normalize=0,aformat=channel_layouts=stereo[a]", "-map", "0:v", "-map", "[a]",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "pcm_s24be", "-timecode", "00:05:18:06", quelle,
    ]);
    expect(r.code, r.stderr).toBe(0);
  }, 60_000);
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("bringt die Clips auf die Ziellautheit, hält den True Peak ein und lässt das Bild unberührt", async () => {
    const p = plan([[1, 4], [6, 9]]);
    const aus = path.join(tmp, "ton", "a.mov");
    const vorher = await messeSchnittTon(quelle, p, "a");
    expect(vorher.lufs).toBeLessThan(-26);

    const b = await verbessereTon({ eingang: quelle, ausgabe: aus, plan: p, quelleId: "a", preset });
    expect(b.gainDb).toBeGreaterThan(8);
    expect(Math.abs(b.nachher.lufs - preset.zielLufs)).toBeLessThanOrEqual(1);
    expect(b.nachher.truePeak).toBeLessThanOrEqual(preset.spitzeDbtp + 0.05);
    expect(imRahmen(b.nachher, preset)).toEqual({ lautheit: true, spitze: true });

    // Bild: gleicher Codec, gleiche Länge, Zeitcode bleibt; Ton: PCM 24 Bit
    const probe = await lauf("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", aus]);
    const j = JSON.parse(probe.stdout) as { streams: { codec_type: string; codec_name: string; tags?: { timecode?: string } }[]; format: { duration: string } };
    const v = j.streams.find((s) => s.codec_type === "video")!;
    const a = j.streams.find((s) => s.codec_type === "audio")!;
    expect(v.codec_name).toBe("h264");
    expect(a.codec_name).toBe("pcm_s24be");
    expect(v.tags?.timecode).toBe("00:05:18:06");
    expect(Math.abs(Number(j.format.duration) - 12)).toBeLessThan(0.1);
    // Bild unverändert: derselbe Hash der Bildpakete wie in der Quelle
    const hash = async (f: string) => (await lauf("ffmpeg", ["-v", "error", "-i", f, "-map", "0:v", "-c", "copy", "-f", "md5", "-"])).stdout.trim();
    expect(await hash(aus)).toBe(await hash(quelle));
  }, 120_000);

  it("ohne die Verstärkung läge die Lautheit weit daneben (Gegenprobe)", async () => {
    const p = plan([[1, 4]]);
    const nurKette = await messeSchnittTon(quelle, p, "a", { kette: TON_KETTE });
    expect(Math.abs(nurKette.lufs - preset.zielLufs)).toBeGreaterThan(6);
  }, 60_000);

  it("meldet eine fehlende Datei", async () => {
    await expect(verbessereTon({ eingang: path.join(tmp, "gibt-es-nicht.mov"), ausgabe: path.join(tmp, "x.mov"), plan: plan([[1, 2]]), quelleId: "a", preset })).rejects.toThrow(/Datei fehlt/);
  });
});
