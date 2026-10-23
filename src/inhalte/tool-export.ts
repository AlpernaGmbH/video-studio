import { z } from "zod";
import { MEDIEN } from "../studio/vertrag";
import { winkelMeta } from "./archiv";
import type { Format, Inhalt, Plattform } from "./inhalt";
import { gate0Wirksam, type Marke } from "./marken";

/**
 * Altbestand für den Einmal-Import ins Alperna-Tool (Scheibe S6b). Das Tool hat keinen Zugang zu Notion: Eine Claude-Sitzung liest die Ansichten «Inhalte» und «Marken» (Modus view, Regel 9),
 * dieses Modul macht daraus eine Datei, und ein **Admin lädt sie im Tool hoch** (`/studio/import`: Vorschau, Bestätigung). Nichts geht über das Geräte-Token, weil der Import einen Status setzt
 * (Regel 1: Geräte entscheiden nie), und dieses Modul sendet selbst nichts (Regel 11).
 *
 * Was in die Datei kommt: nur das **Archiv** (Veröffentlicht, Ausgewertet, Verworfen), nur Code, Titel, Medium, Marke, Status, Notion-Seite, Hook-Muster und Pillar, keine Texte.
 * Was nie hineinkommt: Beispielzeilen, laufende Zeilen (Notion und der Prüfplatz bleiben bis zur Umstellung der einzige Schreiber), Zeilen mit gesetztem Tor (das Tool übernimmt keine Entscheide),
 * Rohstoffe und Inspiration (Rohstoffe enthalten Privates von Mitarbeitenden, besonders schützenswert nach nDSG).
 * Das Format steht in `docs/studio/vertrag.json` (`import`); das Tool prüft dieselben Grenzen.
 */

export const IMPORT_SCHEMA = 1;
/** Die Status, die der Import zulässt. Alles andere ist laufende Arbeit. */
export const IMPORT_STATI = ["published", "evaluated", "discarded"] as const;
/** Die Plattformen, die das Tool an einem Inhalt kennt (`docs/studio/vertrag.json`, `import.grenzen.plattformen`, im Tool `CONTENT_PLATFORMS`): die des Auftragskatalogs ohne «allgemein». */
export const TOOL_PLATTFORMEN = ["instagram", "linkedin", "facebook", "tiktok", "youtube", "google", "website", "newsletter", "ads"] as const;
export const IMPORT_MAX_PLATTFORMEN = 9;
export const IMPORT_MAX_INHALTE = 500;
export const IMPORT_MAX_MARKEN = 100;

const MARKEN_SCHLUESSEL = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const laenge = (s: string): number => Array.from(s).length;

const ImportInhaltSchema = z.strictObject({
  code: z.string().regex(/^c-[0-9]{4,}$/),
  title: z.string().refine((s) => laenge(s.trim()) >= 2 && laenge(s) <= 200, "2 bis 200 Zeichen"),
  medium: z.enum(MEDIEN as [string, ...string[]]),
  brand: z.string().regex(MARKEN_SCHLUESSEL).max(60).nullable(),
  status: z.enum(IMPORT_STATI),
  notion_id: z.string().regex(/^[0-9a-f]{32}$/),
  pattern: z.string().min(1).max(60).nullable(),
  content_type: z.string().min(1).max(60).nullable(),
  /** Freiwillig im Vertrag, hier immer gesetzt. Bei einem vorhandenen Beitrag ohne Plattformen trägt das Tool sie nach, vorhandene überschreibt es nie. */
  platforms: z
    .array(z.enum(TOOL_PLATTFORMEN))
    .max(IMPORT_MAX_PLATTFORMEN)
    .refine((l) => new Set(l).size === l.length, "keine Plattform doppelt")
    .optional(),
});

const ImportMarkeSchema = z.strictObject({
  key: z.string().regex(MARKEN_SCHLUESSEL).max(60),
  name: z.string().refine((s) => laenge(s.trim()) >= 2 && laenge(s) <= 80, "2 bis 80 Zeichen"),
  kind: z.enum(["own", "client"]),
  /** Gate 0, wie es in Notion steht. Nur eine Information: Im Tool beginnt jede Marke mit offenem Gate 0, ein Admin bestätigt es dort. */
  notion_gate0: z.enum(["open", "approved", "change"]),
});

export const ImportDateiSchema = z.strictObject({
  schema: z.literal(IMPORT_SCHEMA),
  created_at: z.string().datetime({ offset: true }),
  contents: z.array(ImportInhaltSchema).max(IMPORT_MAX_INHALTE),
  brands: z.array(ImportMarkeSchema).max(IMPORT_MAX_MARKEN),
});
export type ImportDatei = z.infer<typeof ImportDateiSchema>;
export type ImportInhalt = z.infer<typeof ImportInhaltSchema>;

export interface Uebersprungen {
  id: string;
  titel: string;
  grund: string;
}

export interface ExportErgebnis {
  datei: ImportDatei;
  uebersprungen: Uebersprungen[];
  hinweise: string[];
}

const MEDIUM: Record<Format, string> = {
  Reel: "reel",
  Carousel: "carousel",
  "LinkedIn-Post": "linkedin_post",
  Blog: "blog",
  "Google-Maps-Beitrag": "google_post",
  Story: "story",
  Anzeige: "ad",
  Sonstiges: "other",
  ungeklärt: "unclear",
};

/**
 * Die Plattform in Notion (Feld «Plattformen») als Schlüssel des Tools. «weitere» hat keinen Schlüssel. Ohne Angabe in Notion bleibt die Liste leer: Aus dem Format wird nichts geraten
 * (ein Carousel kann Instagram oder LinkedIn sein; im Archiv sind alle Carousels LinkedIn).
 */
const PLATTFORM: Record<Plattform, (typeof TOOL_PLATTFORMEN)[number] | null> = { Instagram: "instagram", LinkedIn: "linkedin", Blog: "website", Google: "google", weitere: null };

const STATUS: Record<string, (typeof IMPORT_STATI)[number]> = { Veröffentlicht: "published", Ausgewertet: "evaluated", Verworfen: "discarded" };

const GATE0: Record<string, "open" | "approved" | "change"> = { offen: "open", freigegeben: "approved", Änderung: "change" };

/** Ein Tor gilt als entschieden, sobald dort etwas anderes als «offen» oder nichts steht. */
const torGesetzt = (e: string): boolean => e !== "" && e !== "offen";

/**
 * Baut die Importdatei aus den Zeilen der Ansichten. Reine Funktion: Sie liest nichts und schreibt nichts. `jetzt` ist ein ISO-Zeitpunkt mit Zone.
 * Eine Zeile, die nicht hineinkommt, steht mit Grund in `uebersprungen`; Besonderheiten bei Zeilen, die hineinkommen, in `hinweise`.
 */
export function baueImport(inhalte: Inhalt[], marken: Marke[], jetzt: string): ExportErgebnis {
  const uebersprungen: Uebersprungen[] = [];
  const hinweise: string[] = [];
  const contents: ImportInhalt[] = [];
  const ohnePlattform: string[] = [];

  const haeufigkeit = new Map<string, number>();
  for (const i of inhalte) haeufigkeit.set(i.id, (haeufigkeit.get(i.id) ?? 0) + 1);

  const weg = (i: Inhalt, grund: string): void => void uebersprungen.push({ id: i.id, titel: i.titel, grund });

  for (const i of inhalte) {
    if ((haeufigkeit.get(i.id) ?? 0) > 1) {
      weg(i, "Die Inhalt-ID kommt in Notion mehrfach vor: bitte dort klären");
      continue;
    }
    if (/^beispiel\b/i.test(i.titel.trim())) {
      weg(i, "Beispielzeile");
      continue;
    }
    const status = STATUS[i.status];
    if (!status) {
      weg(i, `Laufende Arbeit (Status «${i.status || "Neu"}»): Notion und der Prüfplatz bleiben bis zur Umstellung der einzige Schreiber`);
      continue;
    }
    if (torGesetzt(i.torI.entscheid) || torGesetzt(i.torP.entscheid)) {
      weg(i, "Ein Tor ist in Notion entschieden: Das Tool übernimmt keine Entscheide");
      continue;
    }
    if (!/^c-[0-9]{4,}$/.test(i.id)) {
      weg(i, "Die Inhalt-ID hat nicht die Form c-0007");
      continue;
    }
    if (!/^[0-9a-f]{32}$/.test(i.seite)) {
      weg(i, "Die Notion-Adresse der Zeile fehlt oder ist nicht lesbar");
      continue;
    }
    const titel = i.titel.trim();
    if (laenge(titel) < 2 || laenge(titel) > 200) {
      weg(i, "Der Titel hat nicht 2 bis 200 Zeichen");
      continue;
    }

    let marke: string | null = null;
    if (i.marke) {
      if (MARKEN_SCHLUESSEL.test(i.marke) && i.marke.length <= 60) marke = i.marke;
      else hinweise.push(`${i.id}: Der Marken-Schlüssel «${i.marke}» ist im Tool nicht zulässig, die Zeile kommt ohne Marke`);
    } else if (i.markeUrls.length > 0) {
      hinweise.push(`${i.id}: Die Marke liess sich nicht auflösen (Ansicht «Marken» unvollständig?), die Zeile kommt ohne Marke`);
    }

    const platforms: (typeof TOOL_PLATTFORMEN)[number][] = [];
    for (const p of i.plattformen) {
      const schluessel = PLATTFORM[p];
      if (schluessel === null) hinweise.push(`${i.id}: Die Plattform «${p}» hat im Tool keinen Schlüssel und fällt weg`);
      else if (!platforms.includes(schluessel)) platforms.push(schluessel);
    }
    if (platforms.length === 0) ohnePlattform.push(i.id);

    const meta = winkelMeta(i.winkel);
    const kurz = (wert: string | undefined, was: string): string | null => {
      if (!wert) return null;
      if (laenge(wert) > 60) {
        hinweise.push(`${i.id}: ${was} hat mehr als 60 Zeichen und fällt weg`);
        return null;
      }
      return wert;
    };

    contents.push({
      code: i.id,
      title: titel,
      medium: i.format ? MEDIUM[i.format] : "unclear",
      brand: marke,
      status,
      notion_id: i.seite,
      pattern: kurz(meta.hookMuster, "Das Hook-Muster"),
      content_type: kurz(meta.pillar, "Der Pillar"),
      platforms,
    });
  }
  contents.sort((a, b) => Number(a.code.slice(2)) - Number(b.code.slice(2)));
  if (ohnePlattform.length > 0) hinweise.push(`${ohnePlattform.length} Zeilen ohne Plattform in Notion (${ohnePlattform.slice(0, 5).join(", ")}${ohnePlattform.length > 5 ? " …" : ""}): Sie stehen im Tool unter «Ohne Angabe»`);

  const brands: ImportDatei["brands"] = [];
  for (const m of marken) {
    if (!m.id) continue;
    const name = m.name.trim();
    if (!MARKEN_SCHLUESSEL.test(m.id) || m.id.length > 60) {
      hinweise.push(`Marke «${m.id}»: Der Schlüssel ist im Tool nicht zulässig, die Marke fällt weg`);
      continue;
    }
    if (m.typ === "") {
      hinweise.push(`Marke «${m.id}»: In Notion fehlt der Typ (Eigene oder Kunde), die Marke fällt weg`);
      continue;
    }
    if (laenge(name) < 2 || laenge(name) > 80) {
      hinweise.push(`Marke «${m.id}»: Der Name hat nicht 2 bis 80 Zeichen, die Marke fällt weg`);
      continue;
    }
    if (brands.some((b) => b.key === m.id)) {
      hinweise.push(`Marke «${m.id}»: Der Schlüssel kommt mehrfach vor, die erste gilt`);
      continue;
    }
    brands.push({ key: m.id, name, kind: m.typ === "Kunde" ? "client" : "own", notion_gate0: GATE0[gate0Wirksam(m)] ?? "open" });
  }
  brands.sort((a, b) => a.key.localeCompare(b.key));

  if (contents.length > IMPORT_MAX_INHALTE) throw new Error(`Mehr als ${IMPORT_MAX_INHALTE} Zeilen für einen Import. Der Import nimmt höchstens ${IMPORT_MAX_INHALTE} auf: bitte in zwei Dateien teilen`);
  if (brands.length > IMPORT_MAX_MARKEN) throw new Error(`Mehr als ${IMPORT_MAX_MARKEN} Marken für einen Import`);

  const datei = ImportDateiSchema.parse({ schema: IMPORT_SCHEMA, created_at: jetzt, contents, brands });
  return { datei, uebersprungen, hinweise };
}

/** Der Text der Datei: eingerückt, mit Zeilenumbruch am Ende, immer in derselben Reihenfolge (nach Code und Schlüssel). */
export const importText = (d: ImportDatei): string => `${JSON.stringify(d, null, 2)}\n`;
