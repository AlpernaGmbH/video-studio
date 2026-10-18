import type { AudioPreset, ExportPreset } from "./schema";

/**
 * Prüfung eines fertigen Videos gegen ein Export-Preset und ein Audio-Preset. Die Messung selbst steht in `messen.ts` (ffprobe, ffmpeg),
 * hier wird nur verglichen. So lässt sich die Prüfung ohne Datei testen.
 */

export interface Messung {
  breite: number;
  hoehe: number;
  fps: number;
  videoCodec: string;
  /** Pixelformat, zum Beispiel yuv420p. */
  pixFmt: string;
  /** Video-Bitrate in Mbit/s, wenn bekannt. */
  videoMbit?: number;
  dauer: number;
  gigabyte: number;
  audioCodec?: string;
  audioKbit?: number;
  audioRate?: number;
  farbe: { primaries?: string; transfer?: string; matrix?: string };
  /** Integrierte Lautheit in LUFS. */
  lufs?: number;
  /** True Peak in dBTP. */
  truePeak?: number;
}

export interface Abweichung {
  code: string;
  text: string;
}

const CODEC: Record<ExportPreset["videoCodec"], string> = { h264: "h264", prores: "prores" };
const zahl = (n: number, stellen = 1): string => n.toFixed(stellen).replace(".", ",");

export function pruefeExport(m: Messung, p: ExportPreset): Abweichung[] {
  const a: Abweichung[] = [];
  const f = (code: string, text: string) => a.push({ code, text });
  if (m.breite !== p.breite || m.hoehe !== p.hoehe) f("groesse", `Grösse ${m.breite}×${m.hoehe}, erwartet ${p.breite}×${p.hoehe}`);
  if (Math.abs(m.fps - p.fps) > 0.01) f("fps", `Bildrate ${zahl(m.fps, 2)}, erwartet ${p.fps}`);
  if (m.videoCodec !== CODEC[p.videoCodec]) f("codec", `Video-Codec ${m.videoCodec}, erwartet ${CODEC[p.videoCodec]}`);
  if (p.videoCodec === "h264" && m.pixFmt !== "yuv420p") f("pixfmt", `Pixelformat ${m.pixFmt}, erwartet yuv420p (4:2:0)`);
  if (m.videoMbit === undefined) f("bitrate-unbekannt", "Die Video-Bitrate liess sich nicht messen");
  else if (m.videoMbit < p.bitrateMbit.min * 0.95 || m.videoMbit > p.bitrateMbit.max * 1.05) f("bitrate", `Video-Bitrate ${zahl(m.videoMbit)} Mbit/s, erwartet ${p.bitrateMbit.min} bis ${p.bitrateMbit.max} Mbit/s`);
  if (!m.audioCodec) f("kein-audio", "Das Video hat keine Tonspur");
  else {
    if (m.audioCodec !== p.audioCodec) f("audio-codec", `Audio-Codec ${m.audioCodec}, erwartet ${p.audioCodec}`);
    if (m.audioRate !== undefined && m.audioRate !== p.audioRate) f("audio-rate", `Abtastrate ${m.audioRate} Hz, erwartet ${p.audioRate} Hz`);
    if (m.audioKbit !== undefined && (m.audioKbit < p.audioKbit.min * 0.95 || m.audioKbit > p.audioKbit.max * 1.05)) {
      f("audio-bitrate", `Audio-Bitrate ${Math.round(m.audioKbit)} kbit/s, erwartet ${p.audioKbit.min} bis ${p.audioKbit.max} kbit/s`);
    }
  }
  const { primaries, transfer, matrix } = m.farbe;
  if (!primaries && !transfer && !matrix) f("farbe-fehlt", "Das Video trägt keine Farbangabe (bt709). Player raten dann, und Farben können abweichen");
  else if ([primaries, transfer, matrix].some((x) => x && x !== "bt709")) f("farbe", `Farbangabe ${primaries ?? "?"}/${transfer ?? "?"}/${matrix ?? "?"}, erwartet bt709`);
  if (p.minSekunden !== undefined && m.dauer < p.minSekunden) f("zu-kurz", `Dauer ${zahl(m.dauer)} s, mindestens ${p.minSekunden} s`);
  if (p.maxSekunden !== undefined && m.dauer > p.maxSekunden + 0.05) f("zu-lang", `Dauer ${zahl(m.dauer)} s, höchstens ${p.maxSekunden} s`);
  if (p.maxGigabyte !== undefined && m.gigabyte > p.maxGigabyte) f("zu-gross", `Dateigrösse ${zahl(m.gigabyte, 2)} GB, höchstens ${p.maxGigabyte} GB`);
  return a;
}

export function pruefeAudio(m: Pick<Messung, "lufs" | "truePeak">, p: AudioPreset): Abweichung[] {
  const a: Abweichung[] = [];
  if (m.lufs === undefined || m.truePeak === undefined) return [{ code: "nicht-gemessen", text: "Lautheit und True Peak liessen sich nicht messen" }];
  if (Math.abs(m.lufs - p.zielLufs) > p.toleranzLu) a.push({ code: "lautheit", text: `Lautheit ${zahl(m.lufs)} LUFS, Ziel ${p.zielLufs} ±${p.toleranzLu} LU` });
  if (m.truePeak > p.spitzeDbtp) a.push({ code: "spitze", text: `True Peak ${zahl(m.truePeak)} dBTP, erlaubt höchstens ${p.spitzeDbtp} dBTP` });
  return a;
}

/**
 * ffmpeg-Argumente, mit denen ein fertiger Schnitt (zum Beispiel aus Resolve als hochwertige Zwischendatei) in dieses Preset kodiert wird.
 * Der Weg «ohne App» des Blueprints. Die Lautheit passt `loudnorm` in einem Durchgang an (grob, die Messung danach zeigt, ob es reicht).
 */
export function ffmpegExportArgs(eingabe: string, ausgabe: string, p: ExportPreset, audio?: AudioPreset): string[] {
  if (p.videoCodec !== "h264") throw new Error(`ffmpeg-Export ist nur für H.264 vorgesehen (Preset «${p.id}» ist ${p.videoCodec})`);
  const ziel = (p.bitrateMbit.min + p.bitrateMbit.max) / 2;
  const kbit = Math.round(ziel * 1000);
  const video = ["-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p", "-b:v", `${kbit}k`];
  if (p.bitrateModus === "cbr") video.push("-minrate", `${kbit}k`, "-maxrate", `${kbit}k`, "-bufsize", `${kbit * 2}k`);
  else video.push("-maxrate", `${Math.round(p.bitrateMbit.max * 1000)}k`, "-bufsize", `${Math.round(p.bitrateMbit.max * 2000)}k`);
  const filter = [`scale=${p.breite}:${p.hoehe}:flags=lanczos`, "setsar=1"].join(",");
  const af = audio ? ["-af", `loudnorm=I=${audio.zielLufs}:TP=${audio.spitzeDbtp}:LRA=11`] : [];
  return [
    "-y", "-i", eingabe,
    "-vf", filter, "-r", String(p.fps),
    ...video,
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
    "-c:a", "aac", "-b:a", `${p.audioKbit.max}k`, "-ar", String(p.audioRate), ...af,
    "-movflags", "+faststart",
    ausgabe,
  ];
}
