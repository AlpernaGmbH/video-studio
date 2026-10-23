import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { Farblook, Markenprofil, Slug } from "../core/schemas";
import { Farbpaar } from "./farbpaar";

/**
 * Ein Foto-Look als Rezept (Rezeptteile in `docs/inspiration/farbe-und-foto.md`): Tonwerte und Farbe aus dem `Farblook` der Marke,
 * dazu optional ein Farbpaar für Schatten und Lichter und Korn als Textur. Eine Datei je Look unter `library/foto-looks/<id>.json`,
 * mit Herkunft: Die Zahlen in den mitgelieferten Looks sind **Vorschläge**, keine belegten Werte.
 */
export const FotoLook = z
  .object({
    id: Slug,
    name: z.string().min(1).max(40),
    stimmung: z.string().min(1).max(160),
    herkunft: z.string().min(1),
    farblook: Farblook,
    farbpaar: Farbpaar.optional(),
    /** Stärke des Korns, 0 bis 1 (0 = keines). */
    korn: z.number().min(0).max(1).default(0),
  })
  .strict();
export type FotoLook = z.infer<typeof FotoLook>;

/** Höchstens so viele Looks zeigt ein Muster (Bogen mit Basis, Marke und Looks). Mehr gäbe keinen lesbaren Bogen. */
export const MAX_LOOKS = 8;

export const MARKEN_LOOK_ID = "marke";

/** Alle Looks einer Ablage, nach Dateiname sortiert. Fehler nennen die Datei. */
export function ladeFotoLooks(dir: string): FotoLook[] {
  if (!fs.existsSync(dir)) return [];
  const dateien = fs.readdirSync(dir).filter((n) => n.endsWith(".json") && !n.startsWith("_")).sort();
  const looks: FotoLook[] = [];
  for (const n of dateien) {
    const roh = JSON.parse(fs.readFileSync(path.join(dir, n), "utf8")) as unknown;
    const r = FotoLook.safeParse(roh);
    if (!r.success) throw new Error(`Foto-Look ${n} ist ungültig: ${r.error.issues.map((i) => `${i.path.join(".") || "(Datei)"}: ${i.message}`).join("; ")}`);
    if (r.data.id !== n.slice(0, -5)) throw new Error(`Foto-Look ${n}: Die id «${r.data.id}» muss dem Dateinamen entsprechen`);
    if (r.data.id === MARKEN_LOOK_ID) throw new Error(`Foto-Look ${n}: «${MARKEN_LOOK_ID}» ist für den Look der Marke reserviert`);
    if (looks.some((l) => l.id === r.data.id)) throw new Error(`Foto-Look ${n}: doppelte id «${r.data.id}»`);
    looks.push(r.data);
  }
  return looks;
}

/** Der Look, den die Marke für ihr Video-Material schon hat (`farbe.vlog`), als Foto-Look. Ohne diesen Eintrag gibt es keinen. */
export function markenLook(marke: Markenprofil): FotoLook | undefined {
  const look = marke.farbe?.vlog;
  if (!look) return undefined;
  return FotoLook.parse({
    id: MARKEN_LOOK_ID,
    name: `Look von ${marke.name}`.slice(0, 40),
    stimmung: "Derselbe Look wie im Video-Profil der Marke, damit Fotos und Videos zusammenpassen.",
    herkunft: `marken/${marke.schluessel}.json, Feld farbe.vlog`,
    farblook: look,
  });
}

/** Die Looks eines Musters: der Look der Marke zuerst (wenn es ihn gibt), dann die Ablage. */
export function looksFuerMuster(marke: Markenprofil, ablage: FotoLook[]): FotoLook[] {
  const m = markenLook(marke);
  const alle = m ? [m, ...ablage] : [...ablage];
  if (alle.length === 0) throw new Error("Es gibt keinen Foto-Look. Die Ablage library/foto-looks/ ist leer und die Marke hat keinen Look (farbe.vlog)");
  if (alle.length > MAX_LOOKS) throw new Error(`Höchstens ${MAX_LOOKS} Looks auf einem Bogen, es sind ${alle.length}. Looks aus library/foto-looks/ entfernen`);
  return alle;
}
