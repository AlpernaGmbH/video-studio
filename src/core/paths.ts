import path from "node:path";
import { z } from "zod";

/**
 * Pfade im Katalog sind relativ zum Ordner `Studio/` auf OneDrive (Bauplan 2.2).
 * So funktioniert derselbe Eintrag auf jedem Mac, obwohl der OneDrive-Pfad überall anders heisst.
 */
export class PathError extends Error {}

/** Normalisiert einen relativen Pfad (NFC, Schrägstriche) und lehnt absolute oder ausbrechende Pfade ab. */
export function relPath(input: string): string {
  // macOS liefert Dateinamen mit Umlauten oft zerlegt (NFD). Der Katalog speichert immer NFC.
  const s = input.normalize("NFC").replaceAll("\\", "/").trim();
  if (!s) throw new PathError("Leerer Pfad");
  if (s.startsWith("/") || /^[A-Za-z]:/.test(s)) {
    throw new PathError(`Absoluter Pfad nicht erlaubt: ${input}`);
  }
  const parts = s.split("/").filter((p) => p !== "" && p !== ".");
  if (parts.includes("..")) throw new PathError(`Pfad verlässt den Studio-Ordner: ${input}`);
  if (parts.length === 0) throw new PathError("Leerer Pfad");
  return parts.join("/");
}

export const RelPathSchema = z.string().transform((value, ctx) => {
  try {
    return relPath(value);
  } catch (e) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: (e as Error).message });
    return z.NEVER;
  }
});

/** Löst einen relativen Pfad unterhalb von `root` auf. Wirft, wenn das Ergebnis ausserhalb von `root` liegt. */
export function resolveInRoot(root: string, rel: string): string {
  const clean = relPath(rel);
  const abs = path.resolve(root, clean);
  const base = path.resolve(root);
  if (abs !== base && !abs.startsWith(base + path.sep)) {
    throw new PathError(`Pfad liegt ausserhalb von ${root}: ${rel}`);
  }
  return abs;
}
