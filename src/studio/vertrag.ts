import { z } from "zod";

/**
 * Die Regeln des Tools für ein Ereignis, nachgebaut, damit der Client nie etwas sendet, das das Tool ablehnt, und damit die Tests es gegen die gemeinsamen Beispiele prüfen können
 * (`docs/studio/vertrag.json`, dieselbe Datei liegt im Repo alperna-tool). Massgebend sind die Funktion `studio_device_ingest_events` in der Datenbank des Tools und `docs/studio/geraete-api.md` dort.
 */

/** Der Umschlag einer Sendung: 1 bis 50 Einträge, sonst nichts. Jeden Eintrag prüft das Tool einzeln. */
export const SendungSchema = z.strictObject({ events: z.array(z.unknown()).min(1).max(50) });

/** Die Medien, die das Tool kennt (dieselbe Liste steht in `docs/studio/vertrag.json` und im Tool in `lib/studio/constants.ts`). */
export const MEDIEN: readonly string[] = ["reel", "carousel", "linkedin_post", "blog", "google_post", "story", "ad", "other", "unclear"];

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
  kind: z.enum(["vorschau", "kontaktbogen", "gegenlesen", "plan", "storyboard", "auftrag", "qualitaet", "shotliste", "shotliste_bogen"]),
  version: z.number().int().min(1).max(1_000_000),
  mime: z.string().min(1).max(100),
  size: z.number().int().min(1).max(52_428_800),
});

/** Dateien zu einem Inhalt: Eintragen (Typ, Grösse und Kennung liest das Tool am Objekt). */
export const DateiEintragenSchema = z.strictObject({
  code: z.string().regex(/^c-[0-9]{4,}$/),
  kind: z.enum(["vorschau", "kontaktbogen", "gegenlesen", "plan", "storyboard", "auftrag", "qualitaet", "shotliste", "shotliste_bogen"]),
  version: z.number().int().min(1).max(1_000_000),
});

/**
 * Aufträge der Warteschlange (Scheibe S5). Die Arten, Ergebnisse und Grenzen stehen in `docs/studio/vertrag.json` (`jobs`), im Tool in `lib/studio/jobs.ts` und in der Datenbank
 * (`app.studio_job_spec`); `vertrag.test.ts` vergleicht den Code hier mit dem Vertrag.
 */
export const ARTEN_AUFTRAG = ["reel_vorbereiten", "reel_storyboard", "reel_uebergabe", "reel_messen", "katalog_beschreiben", "text_entwurf", "analyse_auswerten", "planung", "ideen_sammeln", "moodboard", "shotliste", "grafik", "bild_batch"] as const;
export type AuftragsArt = (typeof ARTEN_AUFTRAG)[number];

export const ERGEBNISSE = ["done", "failed", "blocked", "cancelled"] as const;
export type Ergebnis = (typeof ERGEBNISSE)[number];

/** Auftrag holen: leer oder mit einer Liste von Arten. */
export const AuftragHolenSchema = z.strictObject({ kinds: z.array(z.enum(ARTEN_AUFTRAG)).min(1).max(20).optional() });

/** Lebenszeichen: Auftrag und Lease. */
export const AuftragHerzschlagSchema = z.strictObject({ job: z.string().uuid(), lease: z.string().uuid() });

/** Abschluss: Ergebnis und, bei failed und blocked, ein Grund von mindestens 5 und höchstens 500 Zeichen (die Datenbank verlangt das). */
export const AuftragAbschlussSchema = z.strictObject({ job: z.string().uuid(), lease: z.string().uuid(), outcome: z.enum(ERGEBNISSE), reason: z.string().max(500).nullable().optional() });

/** Was das Tool einem Mac auf «Auftrag holen» gibt. Nie der Urheber, nie der Schlüssel der Oberfläche. */
export const AuftragSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(ARTEN_AUFTRAG),
  target: z.enum(["mac", "cloud"]),
  content: z.string().regex(/^c-[0-9]{4,}$/).nullable(),
  status: z.string(),
  params: z.record(z.unknown()),
  notes: z.string().nullable(),
  lease: z.string().uuid(),
  lease_until: z.string(),
  attempts: z.number().int().min(1).max(3),
  cancel_requested: z.boolean(),
  /**
   * Plattform, Art und Phase des Katalogs (alle drei oder keines), die Marke und die Zahl der angehängten Dateien. Ein Tool ohne die Migration `20261023100000` (Auftragskatalog)
   * schickt sie nicht: Dann gelten «keine Angabe» und null Dateien, und dieser Rechner arbeitet wie vorher.
   */
  platform: z.string().nullable().default(null),
  format: z.string().nullable().default(null),
  phase: z.string().nullable().default(null),
  brand: z.string().nullable().default(null),
  files: z.number().int().min(0).default(0),
});
export type Auftrag = z.infer<typeof AuftragSchema>;

/**
 * Die Dateien eines Auftrags (`POST jobs/files`, Body wie beim Lebenszeichen). `url` ist eine Adresse, die zehn Minuten gilt und nur diese eine Datei liefert; null, wenn der Speicher sie nicht kennt.
 * Der Pfad im Speicher steht nie in der Antwort. Name, Typ und Grösse hat ein Mensch im Tool angegeben beziehungsweise der Speicher gemessen: Der Rechner prüft sie trotzdem (`auftrags-dateien.ts`).
 */
export const AuftragDateiSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(300),
  type: z.string().min(1).max(100),
  size: z.number().int().min(0),
  url: z.string().nullable(),
});
export const AuftragDateienAntwortSchema = z.object({ files: z.array(AuftragDateiSchema).max(30), url_seconds: z.number().int().min(1) });
export type AuftragDatei = z.infer<typeof AuftragDateiSchema>;
