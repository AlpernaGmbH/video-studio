import fs from "node:fs";
import path from "node:path";
import { PathError, relPath, resolveInRoot } from "../core/paths";
import { GROSSE_UNTERORDNER } from "../setup";

/**
 * Material an einem Inhalt: Footage, Fotos, Audio, Skripte, Logos und fertige Renders (Plan v3, Auftrag vom 18.10.2026).
 *
 * Material wird nicht in Notion oder den Prüfplatz hochgeladen (Videos sind gross, der Prüfplatz nimmt höchstens 20 MiB je Datei).
 * Es liegt auf OneDrive oder auf dem Medien-Laufwerk und wird im Feld «Dateien» des Inhalts nur verknüpft, eine Zeile je Eintrag:
 *
 *   Footage: rohmaterial/praxis-hofer/empfang-01.mov | Empfang, Totale
 *   Foto: https://…onedrive…/s/abc | Portrait Frau Hofer
 *
 * Ein Eintrag zeigt entweder auf einen Pfad relativ zu `Studio/` (NFC, wie im Katalog) oder auf einen https-Link (zum Beispiel
 * ein OneDrive-Freigabelink). Zeilen ohne bekannte Art bleiben unverändert erhalten, damit nichts verloren geht, was Claude oder
 * ein Mensch früher von Hand ins Feld geschrieben hat.
 *
 * Die Prüfplatz-Seite enthält dieselbe Lese-, Schreib- und Prüflogik zwischen den Marken MATERIAL-START und MATERIAL-ENDE;
 * `material.test.ts` hält beide Fassungen gleich.
 */

export const MATERIAL_ARTEN = ["Footage", "Foto", "Audio", "Skript", "Logo", "Render", "Sonstiges"] as const;
/** Was ein Mensch im Prüfplatz anhängen kann. «Render» schreibt nur der Studio-Code. */
export const MATERIAL_ARTEN_MENSCH = ["Footage", "Foto", "Audio", "Skript", "Logo", "Sonstiges"] as const;
export type MaterialArt = (typeof MATERIAL_ARTEN)[number];

export interface Material {
  /** Leer bei einer Zeile, die nicht dem Format entspricht und unverändert bleibt. */
  art: MaterialArt | "";
  ziel: string;
  notiz: string;
}

/** Notion schneidet Textfelder bei 2000 Zeichen ab. Mehr Material gehört in einen Ordner, auf den ein Eintrag zeigt. */
export const MATERIAL_MAX_ZEICHEN = 1900;
export const MATERIAL_MAX_ZIEL = 400;

const ZEILE = new RegExp(`^(${MATERIAL_ARTEN.join("|")}):\\s*(.+)$`);

export function liesMaterial(text: string): Material[] {
  const liste: Material[] = [];
  for (const roh of (text || "").split("\n")) {
    const z = roh.trim();
    if (!z) continue;
    const m = ZEILE.exec(z);
    if (!m) {
      liste.push({ art: "", ziel: z, notiz: "" });
      continue;
    }
    const rest = m[2]!;
    const i = rest.search(/\s+\|\s+/);
    const ziel = (i < 0 ? rest : rest.slice(0, i)).trim();
    const notiz = i < 0 ? "" : rest.slice(i).replace(/^\s+\|\s+/, "").trim();
    liste.push({ art: m[1] as MaterialArt, ziel, notiz });
  }
  return liste;
}

export function schreibeMaterial(liste: readonly Material[]): string {
  return liste
    .map((e) => (e.art ? `${e.art}: ${e.ziel}${e.notiz ? ` | ${e.notiz.replace(/\s*\n\s*/g, " ")}` : ""}` : e.ziel))
    .join("\n");
}

export type ZielPruefung = { ok: true; ziel: string; link: boolean } | { ok: false; fehler: string };

/** Prüft ein Ziel: https-Link oder Pfad relativ zu `Studio/`. Ein Pfad bekommt NFC und Schrägstriche, ein führendes «Studio/» fällt weg. */
export function pruefeZiel(roh: string): ZielPruefung {
  const z = (roh || "").normalize("NFC").trim();
  if (!z) return { ok: false, fehler: "Pfad oder Link fehlt." };
  if (z.length > MATERIAL_MAX_ZIEL) return { ok: false, fehler: `Zu lang (höchstens ${MATERIAL_MAX_ZIEL} Zeichen).` };
  if (/[|\n\r\t]/.test(z)) return { ok: false, fehler: "Das Zeichen «|» und Zeilenumbrüche sind im Pfad nicht erlaubt." };
  if (/^https:\/\//i.test(z)) return /^https:\/\/[^\s|]+$/i.test(z) ? { ok: true, ziel: z, link: true } : { ok: false, fehler: "Der Link darf keine Leerzeichen enthalten." };
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(z)) return { ok: false, fehler: "Nur https-Links sind erlaubt." };
  if (/^~/.test(z)) return { ok: false, fehler: "Der Pfad muss relativ zum Ordner «Studio» sein, nicht zum Benutzerordner." };
  let p: string;
  try {
    p = relPath(z);
  } catch (e) {
    if (e instanceof PathError) return { ok: false, fehler: /Absolut/.test(e.message) ? "Der Pfad muss relativ zum Ordner «Studio» sein (zum Beispiel rohmaterial/projekt/clip.mov)." : "Der Pfad darf den Ordner «Studio» nicht verlassen." };
    throw e;
  }
  if (p.startsWith("Studio/")) p = p.slice("Studio/".length);
  if (!p) return { ok: false, fehler: "Pfad fehlt." };
  return { ok: true, ziel: p, link: false };
}

/** Hängt einen Eintrag an. Wirft einen Fehlertext (als Error), wenn das Ziel nicht gilt oder das Feld zu voll würde. */
export function haengeAn(text: string, art: MaterialArt, ziel: string, notiz = ""): string {
  const p = pruefeZiel(ziel);
  if (!p.ok) throw new Error(p.fehler);
  const neu = schreibeMaterial([...liesMaterial(text), { art, ziel: p.ziel, notiz: notiz.trim() }]);
  if (neu.length > MATERIAL_MAX_ZEICHEN) throw new Error("Das Feld ist voll. Leg einen Ordner an und verweise mit einem Eintrag auf ihn.");
  return neu;
}

const hatArt = (text: string, arten: readonly MaterialArt[]): boolean => liesMaterial(text).some((e) => e.art !== "" && arten.includes(e.art));

/**
 * «Dreh nötig» heisst: Es gibt Aufnahmen. Ein Inhalt in Produktion mit diesem Aufwand und ohne Footage oder Foto im Anhang
 * kann nicht gebaut werden. Das ist ein Hinweis im Abgleich, kein Verbot (Material kann auch erst auf dem Weg sein).
 */
export function materialFehlt(i: { aufwand?: string | undefined; dateien: string }): boolean {
  return i.aufwand === "Dreh nötig" && !hatArt(i.dateien, ["Footage", "Foto"]);
}

export interface MaterialStand {
  eintrag: Material;
  /** true oder false für einen Pfad; null für einen Link, den der Rechner nicht prüfen kann. */
  vorhanden: boolean | null;
  megabyte?: number;
}

/** Prüft Pfade auf diesem Rechner. Grosse Ordner (rohmaterial, renders, inspiration) liegen im Medien-Ordner, wenn es einen gibt. */
export function pruefeVorhanden(liste: readonly Material[], studio: string, medien?: string): MaterialStand[] {
  return liste.map((eintrag) => {
    const p = pruefeZiel(eintrag.ziel);
    if (!eintrag.art || !p.ok) return { eintrag, vorhanden: p.ok && p.link ? null : false };
    if (p.link) return { eintrag, vorhanden: null };
    const ersterTeil = p.ziel.split("/")[0] ?? "";
    const wurzel = medien && (GROSSE_UNTERORDNER as readonly string[]).includes(ersterTeil) ? medien : studio;
    try {
      const abs = resolveInRoot(wurzel, p.ziel);
      const st = fs.statSync(abs);
      return { eintrag, vorhanden: true, megabyte: st.isDirectory() ? undefined : Math.round((st.size / 1024 / 1024) * 10) / 10 };
    } catch {
      return { eintrag, vorhanden: false };
    }
  });
}

export const materialPfad = (studio: string, rel: string): string => path.join(studio, rel);
