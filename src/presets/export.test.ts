import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ffmpegExportArgs, pruefeAudio, pruefeExport, type Messung } from "./export";
import { findePreset, ladePresets } from "./lader";
import { lautheitAusEbur128, messeDatei, messungAusProbe, sondiere, sondierungAusProbe, timecodeZuSekunden } from "./messen";

const lib = ladePresets(path.resolve(__dirname, "../../presets"));
const reel = findePreset(lib, "export", "reel");
const standard = findePreset(lib, "audio", "standard");

const gut: Messung = {
  breite: 1080, hoehe: 1920, fps: 25, videoCodec: "h264", pixFmt: "yuv420p", videoMbit: 9, dauer: 30, gigabyte: 0.04,
  audioCodec: "aac", audioKbit: 160, audioRate: 48000, farbe: { primaries: "bt709", transfer: "bt709", matrix: "bt709" }, lufs: -14, truePeak: -2,
};
const codes = (m: Partial<Messung>, p = reel) => pruefeExport({ ...gut, ...m }, p).map((a) => a.code);

describe("pruefeExport", () => {
  it("eine Datei nach Preset hat keine Abweichung", () => {
    expect(pruefeExport(gut, reel)).toEqual([]);
  });

  it("meldet jede Abweichung einzeln", () => {
    expect(codes({ breite: 1920, hoehe: 1080 })).toEqual(["groesse"]);
    expect(codes({ fps: 30 })).toEqual(["fps"]);
    expect(codes({ videoCodec: "hevc" })).toEqual(["codec"]);
    expect(codes({ pixFmt: "yuv444p" })).toEqual(["pixfmt"]);
    expect(codes({ videoMbit: 14 })).toEqual(["bitrate"]);
    expect(codes({ videoMbit: 4 })).toEqual(["bitrate"]);
    expect(codes({ audioCodec: "mp3" })).toEqual(["audio-codec"]);
    expect(codes({ audioRate: 44100 })).toEqual(["audio-rate"]);
    expect(codes({ audioKbit: 320 })).toEqual(["audio-bitrate"]);
    expect(codes({ dauer: 120 })).toEqual(["zu-lang"]);
    expect(codes({ dauer: 2 })).toEqual(["zu-kurz"]);
    expect(codes({ gigabyte: 1.5 })).toEqual(["zu-gross"]);
  });

  it("fehlende Tonspur, fehlende und falsche Farbangabe", () => {
    expect(codes({ audioCodec: undefined, audioKbit: undefined, audioRate: undefined })).toEqual(["kein-audio"]);
    expect(codes({ farbe: {} })).toEqual(["farbe-fehlt"]);
    expect(codes({ farbe: { primaries: "bt2020", transfer: "bt709", matrix: "bt709" } })).toEqual(["farbe"]);
  });

  it("eine nicht messbare Bitrate ist eine Abweichung, kein stilles Bestehen", () => {
    expect(codes({ videoMbit: undefined })).toEqual(["bitrate-unbekannt"]);
  });

  it("das Blueprint-Preset verlangt 14 Mbit/s und AAC 320k: unser Standardwert fällt dort durch", () => {
    const b = findePreset(lib, "export", "reel-blueprint");
    expect(pruefeExport(gut, b).map((a) => a.code).sort()).toEqual(["audio-bitrate", "bitrate"]);
    expect(pruefeExport({ ...gut, videoMbit: 14, audioKbit: 320 }, b)).toEqual([]);
  });
});

describe("pruefeAudio", () => {
  it("Lautheit im Toleranzbereich und True Peak unter der Grenze bestehen", () => {
    expect(pruefeAudio({ lufs: -14.8, truePeak: -1.2 }, standard)).toEqual([]);
  });
  it("zu laut, zu leise und zu hohe Spitze werden gemeldet", () => {
    expect(pruefeAudio({ lufs: -11, truePeak: -2 }, standard).map((a) => a.code)).toEqual(["lautheit"]);
    expect(pruefeAudio({ lufs: -18, truePeak: -2 }, standard).map((a) => a.code)).toEqual(["lautheit"]);
    expect(pruefeAudio({ lufs: -14, truePeak: 0.3 }, standard).map((a) => a.code)).toEqual(["spitze"]);
  });
  it("ohne Messung kein stilles Bestehen", () => {
    expect(pruefeAudio({}, standard).map((a) => a.code)).toEqual(["nicht-gemessen"]);
  });
});

describe("Messung aus ffprobe und ebur128", () => {
  const probe = {
    streams: [
      { codec_type: "video", codec_name: "h264", width: 1080, height: 1920, pix_fmt: "yuv420p", avg_frame_rate: "25/1", bit_rate: "9100000", color_primaries: "bt709", color_transfer: "bt709", color_space: "bt709" },
      { codec_type: "audio", codec_name: "aac", sample_rate: "48000", bit_rate: "192000", channels: 2 },
    ],
    format: { duration: "30.04", size: "34500000", bit_rate: "9300000" },
  };
  it("liest Grösse, Bildrate, Bitraten, Farbe und Dauer", () => {
    const m = messungAusProbe(probe);
    expect(m).toMatchObject({ breite: 1080, hoehe: 1920, fps: 25, videoCodec: "h264", dauer: 30.04, audioCodec: "aac", audioRate: 48000, farbe: { primaries: "bt709" } });
    expect(m.videoMbit).toBeCloseTo(9.1, 6);
    expect(m.audioKbit).toBe(192);
  });
  it("ohne Bitrate am Videostrom gilt Container minus Audio", () => {
    const v = { ...probe, streams: [{ ...probe.streams[0]!, bit_rate: undefined }, probe.streams[1]!] };
    expect(messungAusProbe(v).videoMbit).toBeCloseTo((9_300_000 - 192_000) / 1e6, 6);
  });
  it("29,97 fps aus «30000/1001»", () => {
    const v = { ...probe, streams: [{ ...probe.streams[0]!, avg_frame_rate: "30000/1001" }, probe.streams[1]!] };
    expect(messungAusProbe(v).fps).toBeCloseTo(29.97, 2);
  });
  it("eine Datei ohne Videospur wird abgelehnt", () => {
    expect(() => messungAusProbe({ streams: [probe.streams[1]!], format: {} })).toThrow(/Videospur/);
  });
  it("liest Lautheit und True Peak aus der Zusammenfassung von ebur128 (nur die letzte, nicht die laufenden Zeilen)", () => {
    const err = `[Parsed_ebur128_0 @ 0x1] t: 0.1  M: -20.0 S: -120.7     I: -70.0 LUFS     LRA:   0.0 LU  FTPK: -9.0 -9.0 dBFS  TPK: -9.0 -9.0 dBFS
[Parsed_ebur128_0 @ 0x1] Summary:

  Integrated loudness:
    I:         -14.2 LUFS
    Threshold: -24.2 LUFS

  Loudness range:
    LRA:         3.0 LU

  True peak:
    Peak:        -1.3 dBFS
`;
    expect(lautheitAusEbur128(err)).toEqual({ lufs: -14.2, truePeak: -1.3 });
    expect(lautheitAusEbur128("keine Zusammenfassung")).toBeNull();
  });
});

describe("Sondierung für den Schnittplan", () => {
  it("liest Dauer, Bildrate, Grösse, Audio und den Timecode-Beginn", () => {
    const s = sondierungAusProbe({
      streams: [
        { codec_type: "video", width: 1920, height: 1080, avg_frame_rate: "25/1", tags: { timecode: "01:00:00:12" } },
        { codec_type: "audio", sample_rate: "48000", channels: 2 },
      ],
      format: { duration: "12.5" },
    });
    expect(s).toMatchObject({ art: "video", dauer: 12.5, fps: 25, breite: 1920, hoehe: 1080, hatAudio: true, audioKanaele: 2, audioRate: 48000 });
    expect(s.start).toBeCloseTo(3600 + 12 / 25, 9);
  });
  it("meldet die Grösse, wie sie angezeigt wird: ein iPhone-Video mit Drehung ±90 ist hochkant", () => {
    const probe = (side: unknown, tags?: Record<string, string>) => ({ streams: [{ codec_type: "video", width: 1920, height: 1080, avg_frame_rate: "30/1", ...(side ? { side_data_list: [side] } : {}), ...(tags ? { tags } : {}) }], format: { duration: "3" } });
    expect(sondierungAusProbe(probe({ side_data_type: "Display Matrix", rotation: -90 }))).toMatchObject({ breite: 1080, hoehe: 1920 });
    expect(sondierungAusProbe(probe({ side_data_type: "Display Matrix", rotation: 90 }))).toMatchObject({ breite: 1080, hoehe: 1920 });
    expect(sondierungAusProbe(probe(undefined, { rotate: "270" }))).toMatchObject({ breite: 1080, hoehe: 1920 });
    expect(sondierungAusProbe(probe({ side_data_type: "Display Matrix", rotation: 180 }))).toMatchObject({ breite: 1920, hoehe: 1080 });
    expect(sondierungAusProbe(probe(undefined))).toMatchObject({ breite: 1920, hoehe: 1080 });
  });
  it("Audiodatei ohne Videospur", () => {
    expect(sondierungAusProbe({ streams: [{ codec_type: "audio", sample_rate: "44100", channels: 1 }], format: { duration: "60" } })).toMatchObject({ art: "audio", hatAudio: true, audioKanaele: 1, audioRate: 44100, start: 0 });
  });
  it("Timecode mit Semikolon (Drop-Frame) und ungültige Angaben", () => {
    expect(timecodeZuSekunden("00:00:01;00", 29.97)).toBeCloseTo(1, 9);
    expect(timecodeZuSekunden("kein timecode", 25)).toBeUndefined();
  });
});

const hatFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;
describe.skipIf(!hatFfmpeg)("mit echtem ffmpeg", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "export-"));
  const quelle = path.join(dir, "quelle.mp4");
  const aus = path.join(dir, "aus.mp4");

  it("ein Video nach Preset kodieren und die Messung besteht die Prüfung", async () => {
    const q = spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=1080x1920:rate=25:duration=3", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=3", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", quelle], { encoding: "utf8" });
    expect(q.status, q.stderr).toBe(0);
    const e = spawnSync("ffmpeg", ["-loglevel", "error", ...ffmpegExportArgs(quelle, aus, reel, standard)], { encoding: "utf8" });
    expect(e.status, e.stderr).toBe(0);
    const m = await messeDatei(aus);
    expect(pruefeExport(m, reel)).toEqual([]);
    expect(pruefeAudio(m, standard)).toEqual([]);
    expect(m.lufs).toBeCloseTo(-14, 0);
  }, 120_000);

  it("dasselbe Video fällt durch das Blueprint-Preset und durch ein anderes Format", async () => {
    const m = await messeDatei(aus, { lautheit: false });
    expect(pruefeExport(m, findePreset(lib, "export", "reel-blueprint")).length).toBeGreaterThan(0);
    expect(pruefeExport(m, findePreset(lib, "export", "vorschau")).map((a) => a.code)).toContain("groesse");
  });

  it("sondiere liest Format und Dauer der echten Datei", async () => {
    const s = await sondiere(aus);
    expect(s).toMatchObject({ art: "video", fps: 25, breite: 1080, hoehe: 1920, hatAudio: true });
    expect(s.dauer).toBeGreaterThan(2.9);
  });

  it("ffmpegExportArgs verweigert ProRes", () => {
    expect(() => ffmpegExportArgs("a", "b", { ...reel, videoCodec: "prores" })).toThrow(/H.264/);
  });
});
