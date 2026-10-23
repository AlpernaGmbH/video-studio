import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { grauMass, type BildMass } from "./messen";

/**
 * Alles, was der Foto-Batch an Programmen aufruft: ffmpeg und ffprobe, lokal, nie ein Netz (Regel 5: Kundenbilder gehen nicht an externe Dienste).
 * Die Funktionen nehmen die Aufrufer als Parameter, damit Tests einen Ersatz einsetzen können.
 */

export interface LaufErgebnis {
  code: number | null;
  stdout: Buffer;
  stderr: string;
}

export interface FotoWerkzeuge {
  ffmpeg(args: string[]): Promise<LaufErgebnis>;
  ffprobe(args: string[]): Promise<LaufErgebnis>;
}

const ZEITLIMIT_MS = 180_000;

function lauf(cmd: string, args: string[]): Promise<LaufErgebnis> {
  return new Promise((resolve, reject) => {
    const c = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    const aus: Buffer[] = [];
    let err = "";
    const uhr = setTimeout(() => c.kill("SIGKILL"), ZEITLIMIT_MS);
    c.stdout.on("data", (d: Buffer) => aus.push(d));
    c.stderr.on("data", (d: Buffer) => {
      if (err.length < 20_000) err += d.toString();
    });
    c.on("error", (e) => {
      clearTimeout(uhr);
      reject(e);
    });
    c.on("close", (code) => {
      clearTimeout(uhr);
      resolve({ code, stdout: Buffer.concat(aus), stderr: err });
    });
  });
}

export const echteWerkzeuge: FotoWerkzeuge = {
  ffmpeg: (args) => lauf("ffmpeg", args),
  ffprobe: (args) => lauf("ffprobe", args),
};

const letzteZeilen = (s: string): string => s.trim().split("\n").slice(-3).join(" | ");

/** Pfad für einen ffmpeg-Filter (lut3d, drawtext): Schrägstriche, Doppelpunkt und Hochkomma werden geschützt. */
export const filterPfad = (p: string): string => p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\\\\\'");

/** Ein JPEG, dem eine Drehung nach EXIF (Orientation 1 bis 8) eingesetzt wird, direkt hinter den Dateianfang. Für den Selbsttest und die Tests. */
export function jpegMitDrehung(jpeg: Buffer, orientierung: number): Buffer {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error("Das ist kein JPEG");
  if (!Number.isInteger(orientierung) || orientierung < 1 || orientierung > 8) throw new Error("Orientation ist 1 bis 8");
  const tiff = Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, 0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientierung, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  const nutz = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]);
  const laenge = Buffer.alloc(2);
  laenge.writeUInt16BE(nutz.length + 2);
  return Buffer.concat([jpeg.subarray(0, 2), Buffer.from([0xff, 0xe1]), laenge, nutz, jpeg.subarray(2)]);
}

/** Beide Läufe, die der Batch braucht, mit denselben Argumenten für Selbsttest und Betrieb. */
const AUSGABE_QUALITAET = "2";

export interface LookAufruf {
  eingang: string;
  ausgang: string;
  /** Pfad der .cube-Datei, oder undefined für «nur kopieren und neu codieren» (zum Beispiel Standard-Profil ohne Look). */
  cube?: string;
  /** Korn, 0 bis 1. */
  korn?: number;
  /** Beim Verkleinern: längste Seite in Pixel. Ohne Angabe bleibt die Grösse. */
  laengsteSeite?: number;
  /** Metadaten (EXIF, auch Ort) behalten. Standard: alles entfernen. */
  exifBehalten?: boolean;
}

/** Kleine Zahl aus einem Namen, damit das Korn je Foto anders fällt und doch bei jedem Lauf gleich. */
export function kornSaat(name: string): number {
  let h = 2166136261;
  for (const ch of name) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return (h % 2_000_000_000) + 1;
}

/** Die Argumente für ffmpeg (rein, damit Tests sie ohne ffmpeg prüfen). */
export function lookArgumente(o: LookAufruf): string[] {
  const kette: string[] = [];
  if (o.laengsteSeite) kette.push(`scale=${o.laengsteSeite}:${o.laengsteSeite}:force_original_aspect_ratio=decrease:flags=lanczos`);
  kette.push("format=rgb24");
  if (o.cube) kette.push(`lut3d=file='${filterPfad(o.cube)}':interp=tetrahedral`);
  kette.push("format=yuvj420p");
  if (o.korn && o.korn > 0) kette.push(`noise=alls=${Math.max(1, Math.round(o.korn * 18))}:allf=u:all_seed=${kornSaat(path.basename(o.eingang))}`);
  return ["-loglevel", "error", "-y", "-i", o.eingang, "-vf", kette.join(","), ...(o.exifBehalten ? [] : ["-map_metadata", "-1"]), "-frames:v", "1", "-q:v", AUSGABE_QUALITAET, o.ausgang];
}

/** Schreibt über eine Zwischendatei und benennt sie am Ende um: Ein abgebrochener Lauf lässt nie ein halbes Foto zurück. */
export async function wendeLookAn(w: FotoWerkzeuge, o: LookAufruf): Promise<void> {
  fs.mkdirSync(path.dirname(o.ausgang), { recursive: true });
  const zwischen = `${o.ausgang}.teil.jpg`;
  const r = await w.ffmpeg(lookArgumente({ ...o, ausgang: zwischen }));
  if (r.code !== 0 || !fs.existsSync(zwischen)) {
    fs.rmSync(zwischen, { force: true });
    throw new Error(`ffmpeg schlug fehl bei ${path.basename(o.eingang)}: ${letzteZeilen(r.stderr)}`);
  }
  fs.renameSync(zwischen, o.ausgang);
}

/** Misst ein Foto an einem kleinen Graubild (64 mal 64 Punkte). */
export async function messeFoto(w: FotoWerkzeuge, abs: string, rel: string): Promise<BildMass> {
  const r = await w.ffmpeg(["-loglevel", "error", "-i", abs, "-vf", "scale=64:64:flags=area,format=gray", "-frames:v", "1", "-f", "rawvideo", "-"]);
  if (r.code !== 0 || r.stdout.length !== 64 * 64) throw new Error(`Das Foto lässt sich nicht lesen: ${rel}${r.stderr ? ` (${letzteZeilen(r.stderr)})` : ""}`);
  return grauMass(rel, r.stdout);
}

/**
 * Prüft vor dem ersten Foto, was der Batch braucht: ffmpeg mit dem Filter lut3d, und dass ffmpeg Fotos nach ihrer EXIF-Drehung aufrichtet.
 * Ohne das Zweite kämen Hochformat-Fotos gedreht heraus, weil die Metadaten beim Schreiben entfernt werden.
 */
export async function pruefeWerkzeug(w: FotoWerkzeuge): Promise<void> {
  let filter: LaufErgebnis;
  try {
    filter = await w.ffmpeg(["-hide_banner", "-filters"]);
  } catch {
    throw new Error("ffmpeg fehlt. Auf dem Mac: brew install ffmpeg");
  }
  if (!/\slut3d\s/.test(filter.stdout.toString())) throw new Error("Dieses ffmpeg hat keinen Filter «lut3d». Mit «brew reinstall ffmpeg» neu installieren");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "studio-foto-test-"));
  try {
    const basis = path.join(tmp, "basis.jpg");
    const erzeugt = await w.ffmpeg(["-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=gray:s=64x32:d=1", "-frames:v", "1", basis]);
    if (erzeugt.code !== 0 || !fs.existsSync(basis)) throw new Error(`ffmpeg kann kein Testbild schreiben: ${letzteZeilen(erzeugt.stderr)}`);
    const gedreht = path.join(tmp, "gedreht.jpg");
    fs.writeFileSync(gedreht, jpegMitDrehung(fs.readFileSync(basis), 6));
    const ziel = path.join(tmp, "ziel.jpg");
    await wendeLookAn(w, { eingang: gedreht, ausgang: ziel });
    const probe = await w.ffprobe(["-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", ziel]);
    if (probe.stdout.toString().trim() !== "32,64") {
      throw new Error("Dein ffmpeg richtet Fotos nach ihrer EXIF-Drehung nicht auf (Hochformat käme gedreht heraus). Mit «brew upgrade ffmpeg» aktualisieren");
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** Eine Kachel für den Bogen: das Foto verkleinert, mit oder ohne Look. */
export async function schreibeKachel(w: FotoWerkzeuge, o: Omit<LookAufruf, "laengsteSeite" | "exifBehalten"> & { seite: number }): Promise<void> {
  await wendeLookAn(w, { ...o, laengsteSeite: o.seite });
}

// ---------- Der Bogen ----------

export const KACHEL = { breite: 360, hoehe: 360, streifen: 40 } as const;

/** Grenzen der Zellenhöhe: ein sehr breites Panorama und ein sehr hohes Foto sollen den Bogen nicht sprengen. */
export const KACHEL_HOEHE = { min: 200, max: 640 } as const;

/**
 * Die Höhe einer Zelle aus den Seitenverhältnissen (Höhe geteilt durch Breite) der Musterfotos: der Mittelwert der mittleren Verhältnisse, gerundet auf gerade Pixel.
 * So füllt ein Hochformat-Foto seine Zelle, statt in einem Quadrat zu schwimmen. Ohne Angaben bleibt es beim Quadrat.
 */
export function kachelHoehe(aspekte: number[]): number {
  const gut = aspekte.filter((a) => Number.isFinite(a) && a > 0).sort((a, b) => a - b);
  if (gut.length === 0) return KACHEL.hoehe;
  const mitte = gut[Math.floor((gut.length - 1) / 2)]!;
  const h = Math.round((KACHEL.breite * mitte) / 2) * 2;
  return Math.min(KACHEL_HOEHE.max, Math.max(KACHEL_HOEHE.min, h));
}

export interface BogenZeile {
  /** Beschriftung der Zeile (Name des Musterfotos). */
  name: string;
  /** Kacheln in der Reihenfolge der Spalten. */
  kacheln: string[];
}

export interface BogenAuftrag {
  /** Beschriftung der Spalten (Basis, Looks). */
  spalten: string[];
  zeilen: BogenZeile[];
  /** Schrift für ffmpeg `drawtext`, oder undefined: Dann bleibt der Bogen ohne Beschriftung, die Legende steht in muster.md. */
  schrift?: string;
  /** Höhe einer Zelle (`kachelHoehe`); Standard: quadratisch. */
  hoehe?: number;
  ausgang: string;
}

/** Der Filtergraph für den Bogen (rein). `textDateien` liegen in der Reihenfolge Spalten, dann Zeilen vor. */
/**
 * `expansion=none`: ffmpeg wertet sonst Zeichen im Text aus. Ein «%» (zum Beispiel «Helligkeit 23 %») lässt den ganzen Streifen leer erscheinen, ohne Fehlermeldung (an echten
 * Bögen gesehen). Die Beschriftung kommt aus Dateinamen und darf darum beliebige Zeichen enthalten.
 */
export function bogenGraph(spalten: number, zeilen: number, textDateien?: string[], schrift?: string, hoehe: number = KACHEL.hoehe): string {
  const f: string[] = [];
  const { breite: B, streifen: S } = KACHEL;
  const H = hoehe;
  const text = (datei: string, breite: number, name: string): string =>
    `color=c=0x0d0d0d:s=${breite}x${S}:d=1,drawtext=fontfile='${filterPfad(schrift!)}':textfile='${filterPfad(datei)}':expansion=none:fontcolor=white:fontsize=22:x=10:y=9[${name}]`;
  let i = 0;
  const reihen: string[] = [];
  for (let r = 0; r < zeilen; r++) {
    const zellen: string[] = [];
    for (let k = 0; k < spalten; k++) {
      f.push(`[${i}:v]scale=${B}:${H}:force_original_aspect_ratio=decrease,pad=${B}:${H}:(ow-iw)/2:(oh-ih)/2:color=0x1c1c1c[c${r}_${k}]`);
      zellen.push(`[c${r}_${k}]`);
      i += 1;
    }
    f.push(spalten === 1 ? `${zellen[0]}null[h${r}]` : `${zellen.join("")}hstack=inputs=${spalten}[h${r}]`);
  }
  if (textDateien && schrift) {
    const kopf: string[] = [];
    for (let k = 0; k < spalten; k++) {
      f.push(text(textDateien[k]!, B, `k${k}`));
      kopf.push(`[k${k}]`);
    }
    f.push(spalten === 1 ? `${kopf[0]}null[kopf]` : `${kopf.join("")}hstack=inputs=${spalten}[kopf]`);
    reihen.push("[kopf]");
    for (let r = 0; r < zeilen; r++) {
      f.push(text(textDateien[spalten + r]!, B * spalten, `z${r}`));
      reihen.push(`[z${r}]`, `[h${r}]`);
    }
  } else {
    for (let r = 0; r < zeilen; r++) reihen.push(`[h${r}]`);
  }
  f.push(reihen.length === 1 ? `${reihen[0]}null[aus]` : `${reihen.join("")}vstack=inputs=${reihen.length}[aus]`);
  return f.join(";");
}

export async function schreibeBogen(w: FotoWerkzeuge, a: BogenAuftrag): Promise<void> {
  if (a.zeilen.length === 0) throw new Error("Der Bogen hat keine Zeilen");
  for (const z of a.zeilen) if (z.kacheln.length !== a.spalten.length) throw new Error(`Die Zeile «${z.name}» hat ${z.kacheln.length} Kacheln, es sind ${a.spalten.length} Spalten`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "studio-foto-bogen-"));
  try {
    let texte: string[] | undefined;
    if (a.schrift) {
      const filter = await w.ffmpeg(["-hide_banner", "-filters"]);
      if (!/\sdrawtext\s/.test(filter.stdout.toString())) throw new Error("Dieses ffmpeg hat keinen Filter «drawtext» (libfreetype). Mit «brew reinstall ffmpeg» neu installieren");
      texte = [...a.spalten, ...a.zeilen.map((z) => z.name)].map((t, n) => {
        const datei = path.join(tmp, `t${n}.txt`);
        fs.writeFileSync(datei, t);
        return datei;
      });
    }
    const eingaben = a.zeilen.flatMap((z) => z.kacheln.flatMap((k) => ["-i", k]));
    const r = await w.ffmpeg(["-loglevel", "error", "-y", ...eingaben, "-filter_complex", bogenGraph(a.spalten.length, a.zeilen.length, texte, a.schrift, a.hoehe), "-map", "[aus]", "-frames:v", "1", "-q:v", "3", a.ausgang]);
    if (r.code !== 0 || !fs.existsSync(a.ausgang)) throw new Error(`ffmpeg schlug beim Bogen fehl: ${letzteZeilen(r.stderr)}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
