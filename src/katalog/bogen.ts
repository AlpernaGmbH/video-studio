import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { lauf } from "../presets/messen";
import type { OffenerEintrag } from "./katalog";

/**
 * Bögen zum Beschreiben: Die offenen Clips als Bilder mit der Nummer des Katalogs darauf, vier Clips pro Bild, je Clip drei Vorschaubilder (Anfang, Mitte, Ende).
 * Ein Mensch zieht das Bild in den Chat, Claude beschreibt die Clips danach und nennt die Schlüssel, die auf dem Bild stehen.
 */

export const ZELLE = { breite: 300, hoehe: 400 };
export const ZEILE_HOEHE = ZELLE.hoehe + 44;
export const BOGEN_BREITE = ZELLE.breite * 3;
export const CLIPS_PRO_BOGEN = 4;

const SCHRIFTEN = [
  process.env["STUDIO_FONT"],
  "/System/Library/Fonts/Supplemental/Arial.ttf",
  "/Library/Fonts/Arial.ttf",
  "/System/Library/Fonts/Helvetica.ttc",
  "/System/Library/Fonts/Geneva.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
  "/usr/share/fonts/opentype/inter/Inter-Regular.otf",
];

/** Eine Schrift, die ffmpeg für die Beschriftung nehmen kann, oder undefined. */
export const findeSchrift = (kandidaten: (string | undefined)[] = SCHRIFTEN): string | undefined => kandidaten.find((p): p is string => !!p && fs.existsSync(p));

const sek = (n: number): string => n.toFixed(1).replace(".", ",");

/** Die Zeile über den Bildern eines Clips: Nummer, Art, Länge, Format, Ordner. */
export function beschriftung(o: OffenerEintrag): string {
  const teile = [
    o.schluessel,
    o.art,
    o.dauer ? `${sek(o.dauer)} s` : "",
    o.orientierung ?? "",
    o.bildrate ? `${Math.round(o.bildrate)}p` : "",
    o.zeitlupe ? "Zeitlupe" : "",
    o.ordnerHinweis.length ? o.ordnerHinweis.join("/") : "",
    path.basename(o.pfad),
  ].filter(Boolean);
  return teile.join("  ");
}

export interface BogenPlan {
  /** Clips je Bogen, jeder mit seinen Vorschaubildern (relativ zum Datenordner). */
  boegen: OffenerEintrag[][];
  /** Offene Einträge ohne Vorschaubild (Sounds oder fehlgeschlagene Bilder): stehen nicht auf einem Bogen. */
  ohneBild: OffenerEintrag[];
}

/** Verteilt die offenen Einträge auf Bögen zu je vier Clips (rein). */
export function planeBoegen(offen: OffenerEintrag[], proBogen = CLIPS_PRO_BOGEN): BogenPlan {
  const mitBild = offen.filter((o) => o.vorschau.length > 0);
  const boegen: OffenerEintrag[][] = [];
  for (let i = 0; i < mitBild.length; i += proBogen) boegen.push(mitBild.slice(i, i + proBogen));
  return { boegen, ohneBild: offen.filter((o) => o.vorschau.length === 0) };
}

/** Der Filtergraph für einen Bogen (rein, ohne Dateizugriff). `eingaenge` sind die Bilder in der Reihenfolge der Zeilen und Zellen, `textDateien` je Zeile die Beschriftung. */
export function bogenFilter(zeilen: { bilder: number; textDatei: string }[], schrift: string): string {
  const f: string[] = [];
  let i = 0;
  const reihen: string[] = [];
  zeilen.forEach((z, r) => {
    const zellen: string[] = [];
    for (let k = 0; k < z.bilder; k++) {
      f.push(`[${i}:v]scale=${ZELLE.breite}:${ZELLE.hoehe}:force_original_aspect_ratio=decrease,pad=${ZELLE.breite}:${ZELLE.hoehe}:(ow-iw)/2:(oh-ih)/2:color=0x1c1c1c[c${r}_${k}]`);
      zellen.push(`[c${r}_${k}]`);
      i += 1;
    }
    // fehlende Zellen der Zeile bleiben dunkel, damit alle Zeilen gleich breit sind
    f.push(z.bilder === 1 ? `${zellen[0]}null[h${r}]` : `${zellen.join("")}hstack=inputs=${z.bilder}[h${r}]`);
    f.push(`[h${r}]pad=${BOGEN_BREITE}:${ZELLE.hoehe}:0:0:color=0x1c1c1c[p${r}]`);
    f.push(`color=c=0x0d0d0d:s=${BOGEN_BREITE}x44:d=1,drawtext=fontfile='${schrift.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\\\\\'")}':textfile='${z.textDatei.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\\\\\'")}':fontcolor=white:fontsize=24:x=12:y=10[t${r}]`);
    reihen.push(`[t${r}][p${r}]`);
  });
  f.push(`${reihen.join("")}vstack=inputs=${zeilen.length * 2}[aus]`);
  return f.join(";");
}

export interface BogenErgebnis {
  dateien: string[];
  ohneBild: OffenerEintrag[];
  /** Offene Einträge je Bogen, in der Reihenfolge der Dateien. */
  inhalt: string[][];
}

/** Erzeugt die Bögen unter `<ziel>/bogen-01.jpg` …, alte Bögen werden vorher gelöscht. */
export async function erzeugeBoegen(offen: OffenerEintrag[], datenDir: string, ziel: string, opt: { schrift?: string; kandidaten?: string[] } = {}): Promise<BogenErgebnis> {
  const schrift = opt.schrift ?? findeSchrift(opt.kandidaten);
  if (!schrift) throw new Error("Für die Beschriftung der Bögen fehlt eine Schrift. Mit STUDIO_FONT=/Pfad/zur/Schrift.ttf eine angeben");
  const pruefe = await lauf("ffmpeg", ["-hide_banner", "-filters"]);
  if (!/\sdrawtext\s/.test(pruefe.stdout)) throw new Error("Dieses ffmpeg hat keinen Filter «drawtext» (libfreetype). Mit «brew reinstall ffmpeg» neu installieren");
  const plan = planeBoegen(offen);
  fs.mkdirSync(ziel, { recursive: true });
  for (const alt of fs.readdirSync(ziel)) if (/^bogen-\d+\.jpg$/.test(alt)) fs.rmSync(path.join(ziel, alt));
  const dateien: string[] = [];
  const inhalt: string[][] = [];
  for (const [n, clips] of plan.boegen.entries()) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "studio-bogen-"));
    try {
      const eingaben: string[] = [];
      const zeilen = clips.map((c, r) => {
        const textDatei = path.join(tmp, `t${r}.txt`);
        fs.writeFileSync(textDatei, beschriftung(c));
        const bilder = c.vorschau.slice(0, 3).map((v) => path.join(datenDir, v)).filter((p) => fs.existsSync(p));
        for (const b of bilder) eingaben.push("-i", b);
        return { bilder: bilder.length, textDatei };
      });
      const gueltig = zeilen.filter((z) => z.bilder > 0);
      if (!gueltig.length) continue;
      const aus = path.join(ziel, `bogen-${String(n + 1).padStart(2, "0")}.jpg`);
      const r = await lauf("ffmpeg", ["-loglevel", "error", "-y", ...eingaben, "-filter_complex", bogenFilter(gueltig, schrift), "-map", "[aus]", "-frames:v", "1", "-q:v", "3", aus]);
      if (r.code !== 0 || !fs.existsSync(aus)) throw new Error(`ffmpeg schlug beim Bogen ${n + 1} fehl: ${r.stderr.trim().split("\n").slice(-3).join(" | ")}`);
      dateien.push(aus);
      inhalt.push(clips.map((c) => c.schluessel));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }
  return { dateien, ohneBild: plan.ohneBild, inhalt };
}
