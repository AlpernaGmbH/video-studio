import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

/** Wo die Studio-Daten in Notion liegen. Nur Kennungen; Zugriff regelt Notion (Seite teilen). */
export const NotionZiel = z.object({
  schema: z.literal(1),
  wurzelSeite: z.string().uuid(),
  /** Adresse des Prüfplatzes (Artifact in claude.ai), damit jede Sitzung die richtige Seite neu veröffentlicht. */
  pruefplatz: z.string().url().optional(),
  ideen: z.object({
    datenbank: z.string().uuid(),
    datenquelle: z.string().regex(/^collection:\/\/[0-9a-f-]{36}$/),
    /**
     * Gespeicherte Ansicht mit allen Eigenschaften und ohne Filter. Gelesen wird damit im Modus «view»: Der braucht kein
     * Abfrage-Kontingent. SQL und Modus «rows» zählen gegen ein knappes Kontingent des Notion-Arbeitsbereichs (beobachtet).
     */
    ansicht: z.string().regex(/^view:\/\/[0-9a-f-]{36}$/),
  }),
});
export type NotionZiel = z.infer<typeof NotionZiel>;

export function ladeNotionZiel(repoWurzel: string): NotionZiel {
  const datei = path.join(repoWurzel, "notion.json");
  const p = NotionZiel.safeParse(JSON.parse(fs.readFileSync(datei, "utf8")));
  if (!p.success) throw new Error(`${datei} ist ungültig: ${p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  return p.data;
}
