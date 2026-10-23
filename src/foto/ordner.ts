import fs from "node:fs";
import path from "node:path";

/** Endungen, die der Foto-Batch liest. RAW (RW2, CR3 …) und HEIC kommen später; sie stehen im Bericht als übersprungen. */
const JPEG = /\.(jpe?g)$/i;
const ANDERE_BILDER = /\.(png|tif|tiff|heic|heif|webp|dng|rw2|cr2|cr3|nef|arw|raf|orf)$/i;

/** Ordnernamen, die der Batch nie betritt: Ergebnisse früherer Läufe, versteckte Ordner, Hilfsordner. */
export const ausgabeName = (look: string): string => `bearbeitet-${look}`;
const gesperrterOrdner = (name: string): boolean => name.startsWith(".") || name.startsWith("_") || name.startsWith("bearbeitet-");

const istInnerhalb = (basis: string, ziel: string): boolean => ziel === basis || ziel.startsWith(basis + path.sep);

export interface Wurzel {
  name: "studio" | "medien";
  pfad: string;
}

export interface Aufgeloest {
  /** Absoluter Pfad, Verknüpfungen aufgelöst. */
  abs: string;
  /** In welcher Wurzel der Ordner liegt. */
  wurzel: Wurzel["name"];
  /** Pfad relativ zur Wurzel (NFC, Schrägstriche), «.» für die Wurzel selbst. Nur das wird gespeichert: Die Wurzeln liegen auf jedem Mac woanders. */
  rel: string;
}

const relativ = (basis: string, ziel: string): string => {
  const r = path.relative(basis, ziel).normalize("NFC").replaceAll(path.sep, "/");
  return r === "" ? "." : r;
};

/**
 * Der Fotoordner. Er muss im Studio-Ordner oder im Medien-Ordner liegen (auch nach dem Auflösen von Verknüpfungen) und ein Ordner sein.
 * Relative Angaben gelten zuerst ab dem Studio-Ordner (so nennt sie das Tool: «Ordner im Studio-Ordner»), dann ab dem Medien-Ordner; absolute sind erlaubt, solange sie
 * in einer der beiden Wurzeln liegen. Der Grund: Ein Auftrag aus dem Tool nennt den Ordner, und er darf nie auf Dateien ausserhalb zeigen.
 * Sind beide Wurzeln derselbe Ordner (kein eigener Medien-Ordner), zählt nur «studio».
 */
export function loeseOrdnerAuf(eingabe: string, wurzeln: Wurzel[]): Aufgeloest {
  const roh = eingabe.normalize("NFC").trim();
  if (!roh) throw new Error("Der Fotoordner fehlt");
  const echte: { name: Wurzel["name"]; pfad: string }[] = [];
  for (const w of wurzeln) {
    if (!fs.existsSync(w.pfad)) continue;
    const echt = fs.realpathSync(w.pfad).normalize("NFC");
    if (!echte.some((e) => e.pfad === echt)) echte.push({ name: w.name, pfad: echt });
  }
  if (echte.length === 0) throw new Error(`Weder der Studio-Ordner noch der Medien-Ordner ist da: ${wurzeln.map((w) => w.pfad).join(", ")}`);

  const pruefe = (kandidat: string, w: { name: Wurzel["name"]; pfad: string }): Aufgeloest | "ausserhalb" | "kein-ordner" | undefined => {
    if (!fs.existsSync(kandidat)) return undefined;
    const echt = fs.realpathSync(kandidat).normalize("NFC");
    if (!istInnerhalb(w.pfad, echt)) return "ausserhalb";
    if (!fs.statSync(echt).isDirectory()) return "kein-ordner";
    return { abs: echt, wurzel: w.name, rel: relativ(w.pfad, echt) };
  };

  let ausserhalb = false;
  let keinOrdner = false;
  const kandidaten = path.isAbsolute(roh) ? echte.map((w) => ({ w, k: path.resolve(roh) })) : echte.map((w) => ({ w, k: path.resolve(w.pfad, roh) }));
  for (const { w, k } of kandidaten) {
    const r = pruefe(k, w);
    if (r === "ausserhalb") ausserhalb = true;
    else if (r === "kein-ordner") keinOrdner = true;
    else if (r) return r;
  }
  if (keinOrdner) throw new Error(`Das ist kein Ordner: ${roh}`);
  if (ausserhalb) throw new Error(`Der Fotoordner liegt nicht im Studio- oder Medien-Ordner (${echte.map((w) => w.pfad).join(", ")}): ${roh}`);
  throw new Error(`Fotoordner nicht gefunden: ${roh} (gesucht im ${echte.map((w) => (w.name === "studio" ? "Studio-Ordner" : "Medien-Ordner")).join(" und im ")})`);
}

export interface FotoSammlung {
  /** Pfade relativ zum Fotoordner (NFC, mit Schrägstrichen), sortiert. */
  fotos: string[];
  uebersprungen: { datei: string; grund: string }[];
}

/**
 * Alle JPEG-Fotos im Ordner und in seinen Unterordnern. Nicht betreten werden versteckte Ordner, Ordner, die mit «_» oder «bearbeitet-» beginnen, und Verknüpfungen
 * (sie könnten aus dem Medien-Ordner hinausführen). Andere Bildformate stehen unter «übersprungen» mit dem Grund.
 */
export function sammleFotos(ordner: string): FotoSammlung {
  const fotos: string[] = [];
  const uebersprungen: FotoSammlung["uebersprungen"] = [];
  const gehe = (abs: string, rel: string): void => {
    const eintraege = fs.readdirSync(abs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "de"));
    for (const e of eintraege) {
      const name = e.name.normalize("NFC");
      const relEintrag = rel ? `${rel}/${name}` : name;
      if (e.isSymbolicLink()) {
        if (JPEG.test(name) || ANDERE_BILDER.test(name)) uebersprungen.push({ datei: relEintrag, grund: "Verknüpfung (könnte aus dem Medien-Ordner hinausführen)" });
        continue;
      }
      if (e.isDirectory()) {
        if (!gesperrterOrdner(name)) gehe(path.join(abs, e.name), relEintrag);
        continue;
      }
      if (!e.isFile() || name.startsWith(".")) continue;
      if (JPEG.test(name)) fotos.push(relEintrag);
      else if (ANDERE_BILDER.test(name)) uebersprungen.push({ datei: relEintrag, grund: "Format wird noch nicht gelesen (nur JPEG; RAW und HEIC siehe docs/foto-batch.md)" });
    }
  };
  gehe(ordner, "");
  return { fotos: fotos.sort(), uebersprungen };
}

/** Die Ausgabedatei zu einem Foto: gleicher Name mit der Endung «.jpg» im Ausgabeordner. Zwei Fotos mit demselben Ergebnis sind ein Fehler. */
export function ausgabeDatei(foto: string): string {
  return foto.replace(JPEG, "") + ".jpg";
}

export function pruefeAusgabeNamen(fotos: string[]): void {
  const gesehen = new Map<string, string>();
  for (const f of fotos) {
    const ziel = ausgabeDatei(f).toLowerCase();
    const vorher = gesehen.get(ziel);
    if (vorher) throw new Error(`Zwei Fotos würden dieselbe Datei ergeben: «${vorher}» und «${f}». Eines umbenennen`);
    gesehen.set(ziel, f);
  }
}
