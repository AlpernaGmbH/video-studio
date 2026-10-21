import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Zwischenspeicher für Transkripte (Plan v4, 1.7). Whisper large-v3 braucht auf der CPU mehrere Minuten je Video: Dasselbe Video soll nie zweimal transkribiert werden,
 * auch wenn die Datei neu kopiert wurde (neue Änderungszeit), in einem anderen Inhalt liegt oder OneDrive sie angefasst hat.
 * Der Schlüssel ist ein Fingerabdruck des Inhalts (Grösse, Anfang und Ende der Datei), das Modell und die Sprache.
 */

const STUECK = 2 * 1024 * 1024;

/**
 * Ein schneller Fingerabdruck einer Datei: Grösse und SHA-1 über die ersten und letzten 2 MB. Eine ganze Datei von mehreren Gigabyte zu lesen dauert länger als der Gewinn.
 * Zwei verschiedene Dateien gleicher Länge mit gleichem Anfang und Ende wären ein Treffer: bei Kameradateien praktisch ausgeschlossen (Zeitstempel und Rauschen im Anfang).
 */
export function fingerabdruck(datei: string): string {
  const fd = fs.openSync(datei, "r");
  try {
    const groesse = fs.fstatSync(fd).size;
    const h = createHash("sha1");
    const lies = (pos: number, n: number): void => {
      const buf = Buffer.alloc(n);
      const gelesen = fs.readSync(fd, buf, 0, n, pos);
      h.update(buf.subarray(0, gelesen));
    };
    lies(0, Math.min(STUECK, groesse));
    if (groesse > STUECK) lies(Math.max(STUECK, groesse - STUECK), Math.min(STUECK, groesse - STUECK));
    return `${groesse}-${h.digest("hex").slice(0, 20)}`;
  } finally {
    fs.closeSync(fd);
  }
}

export interface TranskriptStand {
  /** Fingerabdruck der Datei, die Whisper hörte. */
  fp: string;
  modell: string;
  sprache: string;
}

export const cacheDatei = (cacheDir: string, s: TranskriptStand): string => path.join(cacheDir, `${s.fp}-${s.modell.replace(/[^A-Za-z0-9._-]/g, "_")}-${s.sprache}.json`);
