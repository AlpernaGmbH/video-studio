import { spawn } from "node:child_process";
import fs from "node:fs";
import { z } from "zod";
import type { Messung } from "./export";

/** Misst ein fertiges Video mit ffprobe (Format, Codec, Bitrate, Farbe) und ffmpeg `ebur128` (Lautheit, True Peak). Beides liegt auf jedem Rechner mit ffmpeg. */

const Strom = z.object({
  codec_type: z.string().optional(),
  codec_name: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  pix_fmt: z.string().optional(),
  avg_frame_rate: z.string().optional(),
  r_frame_rate: z.string().optional(),
  bit_rate: z.string().optional(),
  sample_rate: z.string().optional(),
  channels: z.number().optional(),
  color_primaries: z.string().optional(),
  color_transfer: z.string().optional(),
  color_space: z.string().optional(),
  duration: z.string().optional(),
  tags: z.record(z.string()).optional(),
});
const Probe = z.object({
  streams: z.array(Strom),
  format: z.object({ duration: z.string().optional(), size: z.string().optional(), bit_rate: z.string().optional(), tags: z.record(z.string()).optional() }),
});

const bruch = (s: string | undefined): number | undefined => {
  if (!s) return undefined;
  const [n, d] = s.split("/").map(Number);
  return n !== undefined && d ? n / d : n;
};

/** Wandelt die JSON-Ausgabe von `ffprobe -show_streams -show_format` in eine Messung (ohne Lautheit). */
export function messungAusProbe(roh: unknown): Messung {
  const p = Probe.parse(roh);
  const v = p.streams.find((s) => s.codec_type === "video");
  if (!v) throw new Error("Die Datei hat keine Videospur");
  const a = p.streams.find((s) => s.codec_type === "audio");
  const dauer = Number(p.format.duration ?? v.duration ?? 0);
  const videoBit = v.bit_rate ? Number(v.bit_rate) : undefined;
  const audioBit = a?.bit_rate ? Number(a.bit_rate) : undefined;
  // MP4 mit H.264 meldet die Bitrate oft nur am Container: dann gilt Container minus Audio
  const gesamtBit = p.format.bit_rate ? Number(p.format.bit_rate) : undefined;
  const mbit = videoBit ?? (gesamtBit !== undefined ? gesamtBit - (audioBit ?? 0) : undefined);
  const m: Messung = {
    breite: v.width ?? 0,
    hoehe: v.height ?? 0,
    fps: bruch(v.avg_frame_rate) ?? bruch(v.r_frame_rate) ?? 0,
    videoCodec: v.codec_name ?? "?",
    pixFmt: v.pix_fmt ?? "?",
    dauer,
    gigabyte: Number(p.format.size ?? 0) / 1024 ** 3,
    farbe: { primaries: v.color_primaries, transfer: v.color_transfer, matrix: v.color_space },
  };
  if (mbit !== undefined) m.videoMbit = mbit / 1_000_000;
  if (a) {
    m.audioCodec = a.codec_name;
    if (audioBit !== undefined) m.audioKbit = audioBit / 1000;
    if (a.sample_rate) m.audioRate = Number(a.sample_rate);
  }
  return m;
}

/** Liest «I: -14.0 LUFS» und «Peak: -1.2 dBFS» (True Peak, wenn `peak=true`) aus der Zusammenfassung von ffmpeg `ebur128`. */
export function lautheitAusEbur128(stderr: string): { lufs: number; truePeak: number } | null {
  const teil = stderr.slice(stderr.lastIndexOf("Summary:"));
  const i = /^\s*I:\s+(-?\d+(?:\.\d+)?|-inf)\s+LUFS/m.exec(teil);
  const p = /^\s*Peak:\s+(-?\d+(?:\.\d+)?|-inf)\s+dBFS/m.exec(teil);
  if (!i || !p || i[1] === "-inf") return null;
  return { lufs: Number(i[1]), truePeak: p[1] === "-inf" ? Number.NEGATIVE_INFINITY : Number(p[1]) };
}

export function lauf(cmd: string, args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const c = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    c.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    c.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    c.on("error", reject);
    c.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

export async function messeDatei(datei: string, opt: { lautheit?: boolean } = {}): Promise<Messung> {
  if (!fs.existsSync(datei)) throw new Error(`Datei fehlt: ${datei}`);
  const probe = await lauf("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", datei]);
  if (probe.code !== 0) throw new Error(`ffprobe schlug fehl: ${probe.stderr.trim().split("\n").pop()}`);
  const m = messungAusProbe(JSON.parse(probe.stdout));
  if (opt.lautheit !== false && m.audioCodec) {
    const e = await lauf("ffmpeg", ["-nostats", "-hide_banner", "-i", datei, "-vn", "-filter:a", "ebur128=peak=true", "-f", "null", "-"]);
    const l = lautheitAusEbur128(e.stderr);
    if (l) {
      m.lufs = l.lufs;
      m.truePeak = l.truePeak;
    }
  }
  return m;
}

/** Eine Quelle für den Schnittplan: Länge, Bildrate, Grösse, Audio und Timecode-Beginn, aus ffprobe. */
export interface Sondierung {
  art: "video" | "audio";
  dauer: number;
  fps?: number;
  breite?: number;
  hoehe?: number;
  hatAudio: boolean;
  audioKanaele?: number;
  audioRate?: number;
  /** Beginn-Timecode in Sekunden, wenn die Datei einen trägt. */
  start: number;
}

const TC = /^(\d{2}):(\d{2}):(\d{2})[:;](\d{2})$/;
/** «01:00:00:00» → Sekunden bei `fps`. */
export function timecodeZuSekunden(tc: string, fps: number): number | undefined {
  const m = TC.exec(tc);
  if (!m) return undefined;
  const [h, mi, s, fr] = m.slice(1).map(Number) as [number, number, number, number];
  return h * 3600 + mi * 60 + s + fr / Math.round(fps);
}

export function sondierungAusProbe(roh: unknown): Sondierung {
  const p = Probe.parse(roh);
  const v = p.streams.find((s) => s.codec_type === "video");
  const a = p.streams.find((s) => s.codec_type === "audio");
  const dauer = Number(p.format.duration ?? v?.duration ?? a?.duration ?? 0);
  if (!v && !a) throw new Error("Die Datei hat weder Video- noch Audiospur");
  const fps = v ? (bruch(v.avg_frame_rate) ?? bruch(v.r_frame_rate)) : undefined;
  const tc = p.streams.map((s) => s.tags?.["timecode"]).find((t): t is string => !!t) ?? p.format.tags?.["timecode"];
  const start = tc && fps ? (timecodeZuSekunden(tc, fps) ?? 0) : 0;
  return {
    art: v ? "video" : "audio",
    dauer,
    ...(v ? { fps, breite: v.width, hoehe: v.height } : {}),
    hatAudio: !!a,
    ...(a ? { audioKanaele: a.channels ?? 2, audioRate: a.sample_rate ? Number(a.sample_rate) : 48000 } : {}),
    start,
  };
}

export async function sondiere(datei: string): Promise<Sondierung> {
  if (!fs.existsSync(datei)) throw new Error(`Datei fehlt: ${datei}`);
  const r = await lauf("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", datei]);
  if (r.code !== 0) throw new Error(`ffprobe schlug fehl: ${r.stderr.trim().split("\n").pop()}`);
  return sondierungAusProbe(JSON.parse(r.stdout));
}
