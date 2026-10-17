import fs from "node:fs";
import path from "node:path";
import type { Markenprofil } from "./core/schemas";
import type { Bibliothek, GeladenesStueck } from "./motion/bibliothek";
import type { NotionZiel } from "./notion/ziel";

/**
 * Daten für den Prüfplatz (Artifact). Die Seite liest Ideen live aus Notion. Bibliothek und Marke stehen als Stand
 * in der Seite selbst: Sie ändern sich nur, wenn Claude Code ein Stück aktiviert oder die Marke anpasst, und dann
 * wird die Seite neu gebaut und veröffentlicht (`studio pruefplatz bauen`).
 */

export interface BibEintrag {
  id: string;
  name: string;
  version: string;
  status: string;
  zweck: string;
  ausloeser: string;
  dauer: { standard: number; min: number; max: number };
  wann: string[];
  wannNicht: string[];
  parameter: { label: string; pflicht: boolean }[];
  beispiele: string[];
  /** Standbild als data:-Adresse. Die Seite darf nichts von aussen laden, ausser Schriften. */
  vorschau: string | null;
}

export interface PruefplatzDaten {
  notion: { ansicht: string };
  bibliothek: BibEintrag[];
  marke: Pick<Markenprofil, "name" | "status" | "farben" | "schriften" | "tonalitaet" | "look"> | null;
  erzeugt: string;
}

/** Das Standbild mit dem meisten Inhalt (die grösste Datei) aus `vorschau/`, falls vorhanden. */
export function vorschauAlsDatenAdresse(stueckDir: string): string | null {
  const dir = path.join(stueckDir, "vorschau");
  if (!fs.existsSync(dir)) return null;
  const bilder = fs.readdirSync(dir).filter((f) => f.endsWith(".png")).sort();
  const wahl = bilder.sort((a, b) => fs.statSync(path.join(dir, b)).size - fs.statSync(path.join(dir, a)).size)[0];
  if (!wahl) return null;
  return `data:image/png;base64,${fs.readFileSync(path.join(dir, wahl)).toString("base64")}`;
}

function eintrag(g: GeladenesStueck): BibEintrag {
  const s = g.stueck;
  return {
    id: s.id,
    name: s.name,
    version: s.version,
    status: s.status,
    zweck: s.zweck,
    ausloeser: s.ausloeser.beschreibung,
    dauer: s.dauer,
    wann: s.einsatz?.wann ?? [],
    wannNicht: s.einsatz?.wannNicht ?? [],
    parameter: s.parameter.map((p) => ({ label: p.label, pflicht: p.pflicht })),
    beispiele: (s.einsatz?.beispiele ?? []).map((b) => b.satz),
    vorschau: vorschauAlsDatenAdresse(g.dir),
  };
}

export function baueDaten(opt: { bibliothek: Bibliothek; marke: Markenprofil | null; notion: NotionZiel; jetzt: string }): PruefplatzDaten {
  const m = opt.marke;
  return {
    notion: { ansicht: opt.notion.ideen.ansicht },
    // Aktive zuerst; Entwürfe und Veraltetes erscheinen, damit niemand ein «fehlendes» Stück sucht
    bibliothek: opt.bibliothek.stuecke.map(eintrag).sort((a, b) => Number(b.status === "aktiv") - Number(a.status === "aktiv") || a.name.localeCompare(b.name, "de")),
    marke: m ? { name: m.name, status: m.status, farben: m.farben, schriften: m.schriften, tonalitaet: m.tonalitaet, look: m.look } : null,
    erzeugt: opt.jetzt,
  };
}

const DATEN_BLOCK = /(<script type="application\/json" id="daten">)[\s\S]*?(<\/script>)/;

/** JSON für ein script-Element: «<» und die Zeilentrenner U+2028 und U+2029 werden maskiert, damit nichts aus dem Block ausbrechen kann. */
export function jsonFuerScript(daten: unknown): string {
  return JSON.stringify(daten)
    .replace(/</g, "\\u003c")
    .split(String.fromCharCode(0x2028)).join("\\u2028")
    .split(String.fromCharCode(0x2029)).join("\\u2029");
}

export function setzeDatenEin(vorlage: string, daten: PruefplatzDaten): string {
  if (!DATEN_BLOCK.test(vorlage)) throw new Error("Die Vorlage hat keinen Block <script type=\"application/json\" id=\"daten\">");
  return vorlage.replace(DATEN_BLOCK, (_m, a: string, b: string) => `${a}${jsonFuerScript(daten)}${b}`);
}
