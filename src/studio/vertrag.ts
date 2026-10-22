import { z } from "zod";

/**
 * Die Regeln des Tools für ein Ereignis, nachgebaut, damit der Client nie etwas sendet, das das Tool ablehnt, und damit die Tests es gegen die gemeinsamen Beispiele prüfen können
 * (`docs/studio/vertrag.json`, dieselbe Datei liegt im Repo alperna-tool). Massgebend sind die Funktion `studio_device_ingest_events` in der Datenbank des Tools und `docs/studio/geraete-api.md` dort.
 */

/** Der Umschlag einer Sendung: 1 bis 50 Einträge, sonst nichts. Jeden Eintrag prüft das Tool einzeln. */
export const SendungSchema = z.strictObject({ events: z.array(z.unknown()).min(1).max(50) });

/** Die Medien, die das Tool kennt (dieselbe Liste steht in `docs/studio/vertrag.json` und im Tool in `lib/studio/constants.ts`). */
export const MEDIEN: readonly string[] = ["reel", "carousel", "linkedin_post", "blog", "google_post", "story", "other", "unclear"];

const ZUSTAENDE = ["start", "ok", "error", "info"];
const TAG = 24 * 3600_000;

/** Gibt den Grund zurück, aus dem das Tool das Ereignis abweist, oder undefined, wenn es gültig ist. */
export function ereignisFehler(e: unknown, jetzt: number = Date.now()): string | undefined {
  if (typeof e !== "object" || e === null || Array.isArray(e)) return "kein Objekt";
  const o = e as Record<string, unknown>;
  if (typeof o["id"] !== "string" || o["id"].length < 1 || o["id"].length > 64) return "id fehlt oder ist zu lang";
  if (typeof o["step"] !== "string" || o["step"].trim().length < 1 || o["step"].trim().length > 80) return "step fehlt oder ist zu lang";
  if (typeof o["state"] !== "string" || !ZUSTAENDE.includes(o["state"])) return "state ist ungültig";
  const at = typeof o["at"] === "string" ? Date.parse(o["at"]) : Number.NaN;
  if (!Number.isFinite(at) || at < jetzt - 30 * TAG || at > jetzt + TAG) return "at fehlt oder liegt ausserhalb von 30 Tagen zurück bis 1 Tag voraus";
  if (o["ms"] !== undefined && (typeof o["ms"] !== "number" || !Number.isInteger(o["ms"]) || o["ms"] < 0)) return "ms ist keine ganze Zahl oder negativ";
  if (o["code"] !== undefined && (typeof o["code"] !== "string" || !/^[a-z0-9-]{1,32}$/.test(o["code"]))) return "code ist ungültig";
  if (o["span"] !== undefined && (typeof o["span"] !== "string" || o["span"].length > 64)) return "span ist zu lang";
  if (o["job"] !== undefined && (typeof o["job"] !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(o["job"]))) return "job ist keine uuid";
  if (o["detail"] !== undefined) {
    if (typeof o["detail"] !== "object" || o["detail"] === null || Array.isArray(o["detail"])) return "detail muss ein Objekt sein";
    if (Buffer.byteLength(JSON.stringify(o["detail"]), "utf8") > 4096) return "detail ist grösser als 4 KB";
  }
  return undefined;
}

/** Dateien zu einem Inhalt: Vorbereiten (Art, Fassung, Typ und Grösse). Das Tool prüft dieselben Grenzen (`artifactTargetSchema` in `lib/studio/device/schemas.ts`). */
export const DateiVorbereitenSchema = z.strictObject({
  code: z.string().regex(/^c-[0-9]{4,}$/),
  kind: z.enum(["vorschau", "kontaktbogen", "gegenlesen", "plan", "storyboard", "auftrag", "qualitaet"]),
  version: z.number().int().min(1).max(1_000_000),
  mime: z.string().min(1).max(100),
  size: z.number().int().min(1).max(52_428_800),
});

/** Dateien zu einem Inhalt: Eintragen (Typ, Grösse und Kennung liest das Tool am Objekt). */
export const DateiEintragenSchema = z.strictObject({
  code: z.string().regex(/^c-[0-9]{4,}$/),
  kind: z.enum(["vorschau", "kontaktbogen", "gegenlesen", "plan", "storyboard", "auftrag", "qualitaet"]),
  version: z.number().int().min(1).max(1_000_000),
});
