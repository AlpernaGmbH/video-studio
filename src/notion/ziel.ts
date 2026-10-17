import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

/**
 * Wo die Daten in Notion liegen. Nur Kennungen; Zugriff regelt Notion (Seite teilen).
 *
 * Gelesen wird über eine gespeicherte Ansicht (`ansicht`) im Modus «view». SQL und der Modus «rows» von `notion-query-data-sources`
 * zählen gegen ein knappes Kontingent des Notion-Arbeitsbereichs (beobachtet am 17.10.2026, «usage_limit_reached»), der Modus «view» nicht.
 * Jede Ansicht zeigt darum alle Eigenschaften und hat keinen Filter.
 */
export const Datenbank = z.object({
  datenbank: z.string().uuid(),
  datenquelle: z.string().regex(/^collection:\/\/[0-9a-f-]{36}$/),
  ansicht: z.string().regex(/^view:\/\/[0-9a-f-]{36}$/),
});
export type Datenbank = z.infer<typeof Datenbank>;

export const NotionZiel = z.object({
  schema: z.literal(2),
  marketingSystem: z.string().uuid(),
  /** Seite «Video-Studio» mit der Datenbank der Motion-Ideen, unter dem Marketing System. */
  motionSeite: z.string().uuid(),
  /** Adresse des Prüfplatzes (Artifact in claude.ai), damit jede Sitzung die richtige Seite neu veröffentlicht. */
  pruefplatz: z.string().url().optional(),
  motionIdeen: Datenbank,
  marken: Datenbank,
  inhalte: Datenbank,
});
export type NotionZiel = z.infer<typeof NotionZiel>;

export function ladeNotionZiel(repoWurzel: string): NotionZiel {
  const datei = path.join(repoWurzel, "notion.json");
  const p = NotionZiel.safeParse(JSON.parse(fs.readFileSync(datei, "utf8")));
  if (!p.success) throw new Error(`${datei} ist ungültig: ${p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  return p.data;
}
