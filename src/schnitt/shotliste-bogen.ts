import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { filterPfad, type FotoWerkzeuge } from "../foto/werkzeug";

/**
 * Der Bogen zur Shotliste: ein Bild mit einer Kachel je Einstellung, drei Kacheln nebeneinander. Oben das Beispielbild aus dem Katalog (Hochformat), darunter ein Streifen
 * mit der Nummer, der Grösse, der Dauer, dem Katalog-Schlüssel und den ersten Worten der Beschreibung. Fehlt das Beispielbild, steht das in der Kachel: eine Lücke im Katalog,
 * keine stille Auslassung. Alles läuft lokal mit ffmpeg (Regel 5).
 */

export const SPALTEN = 3;
export const KACHEL = { breite: 320, bild: 400, text: 124 } as const;
export const KACHEL_HOEHE = KACHEL.bild + KACHEL.text;
export const TEXT_ZEILEN = 5;
/**
 * Zeichen je Zeile im Streifen bei Schriftgrösse 16. Gemessen an der breitesten der Schriften, die der Befehl nimmt (DejaVu Sans: gut 9 Pixel je Zeichen);
 * Arial auf dem Mac ist schmaler. 30 Zeichen belegen höchstens 290 der 310 Pixel neben dem Rand.
 */
export const ZEICHEN_JE_ZEILE = 30;

export interface Kachel {
  /** Absoluter Pfad des Beispielbilds, oder keiner. */
  bild?: string;
  /** Was in der Kachel steht, wenn es kein Bild gibt («Kein Beispielbild», «Vorschaubild fehlt»). */
  platzhalter: string;
  /** Text im Streifen darunter (mehrzeilig). */
  text: string;
}

const FARBE = { bild: "0x1c1c1c", streifen: "0x0d0d0d", leer: "0x2a2a2a" } as const;

/**
 * Der Filtergraph (rein). `kacheln` bestimmt die Reihenfolge; Bilder sind Eingänge 0, 1, 2 … in der Reihenfolge der Kacheln mit Bild.
 * `textDateien` hält je Kachel die Datei für den Streifen und für den Platzhalter. `expansion=none`: ffmpeg wertet sonst Zeichen im Text aus,
 * ein «%» lässt den Streifen leer erscheinen, ohne Fehlermeldung.
 */
export function bogenGraph(kacheln: { hatBild: boolean }[], textDateien: { streifen: string; platzhalter: string }[], schrift: string): string {
  if (kacheln.length === 0) throw new Error("Der Bogen hat keine Kacheln");
  if (textDateien.length !== kacheln.length) throw new Error("Zu jeder Kachel gehören zwei Textdateien");
  const { breite: B, bild: H, text: T } = KACHEL;
  const f: string[] = [];
  const text = (datei: string, hoehe: number, farbe: string, x: string, y: string, name: string): string =>
    `color=c=${farbe}:s=${B}x${hoehe}:d=1,drawtext=fontfile='${filterPfad(schrift)}':textfile='${filterPfad(datei)}':expansion=none:fontcolor=white:fontsize=16:line_spacing=4:x=${x}:y=${y}[${name}]`;
  let eingang = 0;
  kacheln.forEach((k, i) => {
    if (k.hatBild) {
      f.push(`[${eingang}:v]scale=${B}:${H}:force_original_aspect_ratio=decrease,pad=${B}:${H}:(ow-iw)/2:(oh-ih)/2:color=${FARBE.bild}[b${i}]`);
      eingang += 1;
    } else {
      f.push(text(textDateien[i]!.platzhalter, H, FARBE.leer, "(w-text_w)/2", "(h-text_h)/2", `b${i}`));
    }
    f.push(text(textDateien[i]!.streifen, T, FARBE.streifen, "10", "8", `s${i}`));
    f.push(`[b${i}][s${i}]vstack=inputs=2[z${i}]`);
  });
  const zeilen = Math.ceil(kacheln.length / SPALTEN);
  const reihen: string[] = [];
  for (let r = 0; r < zeilen; r++) {
    const zellen: string[] = [];
    for (let c = 0; c < SPALTEN; c++) {
      const i = r * SPALTEN + c;
      if (i < kacheln.length) zellen.push(`[z${i}]`);
      else {
        f.push(`color=c=${FARBE.streifen}:s=${B}x${KACHEL_HOEHE}:d=1[l${i}]`);
        zellen.push(`[l${i}]`);
      }
    }
    f.push(`${zellen.join("")}hstack=inputs=${SPALTEN}[r${r}]`);
    reihen.push(`[r${r}]`);
  }
  f.push(reihen.length === 1 ? `${reihen[0]}null[aus]` : `${reihen.join("")}vstack=inputs=${reihen.length}[aus]`);
  return f.join(";");
}

export interface BogenAuftrag {
  kacheln: Kachel[];
  schrift: string;
  ausgang: string;
}

const letzteZeilen = (s: string): string => s.trim().split("\n").slice(-3).join(" | ");

/** Schreibt den Bogen. Ein Fehler lässt keine halbe Datei und ein vorhandener Bogen bleibt unangetastet. */
export async function schreibeBogen(w: FotoWerkzeuge, a: BogenAuftrag): Promise<void> {
  if (a.kacheln.length === 0) throw new Error("Der Bogen hat keine Kacheln");
  const filter = await w.ffmpeg(["-hide_banner", "-filters"]);
  if (!/\sdrawtext\s/.test(filter.stdout.toString())) throw new Error("Dieses ffmpeg hat keinen Filter «drawtext» (libfreetype). Mit «brew reinstall ffmpeg» neu installieren");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "studio-shotliste-"));
  try {
    const dateien = a.kacheln.map((k, i) => {
      const streifen = path.join(tmp, `s${i}.txt`);
      const platzhalter = path.join(tmp, `p${i}.txt`);
      fs.writeFileSync(streifen, k.text);
      fs.writeFileSync(platzhalter, k.platzhalter);
      return { streifen, platzhalter };
    });
    const eingaben = a.kacheln.flatMap((k) => (k.bild ? ["-i", k.bild] : []));
    const zwischen = path.join(tmp, "bogen.jpg");
    const r = await w.ffmpeg(["-loglevel", "error", "-y", ...eingaben, "-filter_complex", bogenGraph(a.kacheln.map((k) => ({ hatBild: k.bild !== undefined })), dateien, a.schrift), "-map", "[aus]", "-frames:v", "1", "-q:v", "3", zwischen]);
    if (r.code !== 0 || !fs.existsSync(zwischen)) throw new Error(`ffmpeg schlug beim Bogen der Shotliste fehl: ${letzteZeilen(r.stderr)}`);
    fs.mkdirSync(path.dirname(a.ausgang), { recursive: true });
    // über eine Zwischendatei im Zielordner, damit ein Abbruch nie einen halben Bogen hinterlässt
    const nebenan = `${a.ausgang}.neu`;
    fs.copyFileSync(zwischen, nebenan);
    fs.renameSync(nebenan, a.ausgang);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
