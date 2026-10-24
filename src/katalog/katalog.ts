import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { Klang, KatalogEintrag } from "../core/schemas";
import { RelPathSchema } from "../core/paths";

/**
 * Katalog der Fotos, B-Roll und Sounds (Bauplan v2, Kap. 3.7). Zwei Dateien im Datenordner:
 *   katalog.json        fertige Einträge (KatalogEintrag), die das Storyboard benutzen darf
 *   katalog-offen.json  gescannte Dateien, die noch auf ihre Beschreibung warten
 * Originaldateien werden nie umbenannt. Die Beschreibung (Titel, Tags, beste Sekunden) schreibt Claude in einer Sitzung nach den Vorschaubildern.
 */

export const KATALOG_DATEI = "katalog.json";
export const OFFEN_DATEI = "katalog-offen.json";

/** Eine gescannte Datei, noch ohne Beschreibung. */
export const OffenerEintrag = z.object({
  schluessel: z.string().regex(/^k-\d{4,}$/),
  art: z.enum(["video", "foto", "sound"]),
  pfad: RelPathSchema,
  dauer: z.number().positive().optional(),
  bildrate: z.number().positive().optional(),
  breite: z.number().int().positive().optional(),
  hoehe: z.number().int().positive().optional(),
  orientierung: z.enum(["hoch", "quer", "quadrat"]).optional(),
  zeitlupe: z.boolean().default(false),
  hatTon: z.boolean().default(false),
  log: z.boolean().default(false),
  /** Aufnahmezeit aus den Metadaten der Datei, ISO. */
  aufnahme: z.string().optional(),
  kamera: z.string().optional(),
  /** Aufnahmeort aus den Metadaten (ISO 6709), wenn die Kamera einen schreibt. */
  gps: z.string().optional(),
  /** Ordnernamen vom gescannten Ordner bis zur Datei: Hinweis auf Kunde und Ort, kein Raten. */
  ordnerHinweis: z.array(z.string()).default([]),
  /** Vorschaubilder (Anfang, Mitte, Ende), relativ zum Datenordner. */
  vorschau: z.array(z.string()).default([]),
});
export type OffenerEintrag = z.infer<typeof OffenerEintrag>;

/** Was Claude zu einer Datei liefert. Alles andere kommt aus dem Scan. */
export const Beschreibung = z.object({
  schluessel: z.string().regex(/^k-\d{4,}$/),
  titel: z.string().min(3),
  beschreibung: z.string().min(3),
  tags: z.array(z.string().min(1)).min(1),
  besteSekunden: z.object({ von: z.number().min(0), bis: z.number().positive() }).optional(),
  personen: z.boolean().optional(),
  sicherheit: z.enum(["hoch", "mittel", "niedrig"]),
  /** Bildanalyse: Log-Material erkennt man am flachen Bild. Überschreibt die Metadaten. */
  log: z.boolean().optional(),
});
export type Beschreibung = z.infer<typeof Beschreibung>;

const lies = <T>(datei: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>): T[] => {
  if (!fs.existsSync(datei)) return [];
  const roh = JSON.parse(fs.readFileSync(datei, "utf8"));
  return z.array(schema).parse(roh);
};

/** Schreibt über eine Temporärdatei, damit eine unterbrochene Synchronisation keine halbe Datei hinterlässt. */
function schreibe(datei: string, daten: unknown): void {
  fs.mkdirSync(path.dirname(datei), { recursive: true });
  const tmp = `${datei}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(daten, null, 2)}\n`);
  fs.renameSync(tmp, datei);
}

export const ladeKatalog = (datenDir: string): KatalogEintrag[] => lies(path.join(datenDir, KATALOG_DATEI), KatalogEintrag);
export const speichereKatalog = (datenDir: string, k: KatalogEintrag[]): void => schreibe(path.join(datenDir, KATALOG_DATEI), [...k].sort((a, b) => a.schluessel.localeCompare(b.schluessel)));
export const ladeOffen = (datenDir: string): OffenerEintrag[] => lies(path.join(datenDir, OFFEN_DATEI), OffenerEintrag);
export const speichereOffen = (datenDir: string, o: OffenerEintrag[]): void => schreibe(path.join(datenDir, OFFEN_DATEI), o);

/** Der nächste freie Schlüssel nach allen vergebenen (Katalog und Offene). */
export function naechsterSchluessel(vergeben: string[]): () => string {
  let n = vergeben.reduce((m, k) => Math.max(m, Number(/^k-(\d+)$/.exec(k)?.[1] ?? 0)), 0);
  return () => `k-${String(++n).padStart(4, "0")}`;
}

export interface EinfuegeErgebnis {
  katalog: KatalogEintrag[];
  offen: OffenerEintrag[];
  neu: string[];
  ueberschrieben: string[];
  fehler: { schluessel: string; grund: string }[];
}

/**
 * Macht aus Beschreibungen von Claude Katalog-Einträge. Zu einer offenen Datei gehören die Werte aus dem Scan; ein vorhandener Eintrag wird überschrieben
 * (Plan 3.7: Korrigiert jemand einen Namen, gilt die Korrektur). Ungültige Beschreibungen bleiben mit Grund liegen, die übrigen gehen durch.
 */
export function fuegeBeschreibungenEin(offen: OffenerEintrag[], katalog: KatalogEintrag[], roh: unknown[]): EinfuegeErgebnis {
  const fehler: EinfuegeErgebnis["fehler"] = [];
  const neu: string[] = [];
  const ueberschrieben: string[] = [];
  let restOffen = [...offen];
  let k = [...katalog];
  roh.forEach((r, i) => {
    const p = Beschreibung.safeParse(r);
    if (!p.success) {
      const key = typeof (r as { schluessel?: unknown })?.schluessel === "string" ? (r as { schluessel: string }).schluessel : `Eintrag ${i + 1}`;
      return void fehler.push({ schluessel: key, grund: p.error.issues.map((x) => `${x.path.join(".") || "(Eintrag)"}: ${x.message}`).join("; ") });
    }
    const b = p.data;
    const o = restOffen.find((x) => x.schluessel === b.schluessel);
    const alt = k.find((x) => x.schluessel === b.schluessel);
    if (!o && !alt) return void fehler.push({ schluessel: b.schluessel, grund: "Der Schlüssel ist weder offen noch im Katalog" });
    if (o && b.besteSekunden && o.dauer !== undefined && b.besteSekunden.bis > o.dauer + 0.001) {
      return void fehler.push({ schluessel: b.schluessel, grund: `beste Sekunden reichen bis ${b.besteSekunden.bis} s, die Datei ist ${o.dauer} s lang` });
    }
    const basis = o
      ? { schluessel: o.schluessel, art: o.art, pfad: o.pfad, dauer: o.dauer, bildrate: o.bildrate, orientierung: o.orientierung, zeitlupe: o.zeitlupe, log: o.log }
      : { ...alt! };
    const e = KatalogEintrag.safeParse({
      ...basis,
      titel: b.titel,
      beschreibung: b.beschreibung,
      tags: b.tags,
      sicherheit: b.sicherheit,
      ...(b.besteSekunden ? { besteSekunden: b.besteSekunden } : {}),
      ...(b.personen !== undefined ? { personen: b.personen } : {}),
      ...(b.log !== undefined ? { log: b.log } : {}),
    });
    if (!e.success) return void fehler.push({ schluessel: b.schluessel, grund: e.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ") });
    k = [...k.filter((x) => x.schluessel !== b.schluessel), e.data];
    restOffen = restOffen.filter((x) => x.schluessel !== b.schluessel);
    (alt ? ueberschrieben : neu).push(b.schluessel);
  });
  return { katalog: k, offen: restOffen, neu, ueberschrieben, fehler };
}

/**
 * Trägt Art, Lizenz und Quelle eines Sounds ein (M8). Nur ein Mensch bestimmt sie, Claude erfindet keine Lizenz.
 * Ein Sound ohne diese Angaben ist im Storyboard nicht verwendbar. Gemessene Werte (Spitze, Lautheit) bleiben beim Ändern erhalten, wenn keine neuen kommen.
 */
export function setzeKlang(katalog: KatalogEintrag[], schluessel: string, roh: unknown): { katalog: KatalogEintrag[]; klang: Klang } | { fehler: string } {
  const e = katalog.find((x) => x.schluessel === schluessel);
  if (!e) return { fehler: `Der Schlüssel «${schluessel}» steht nicht im Katalog (erst beschreiben: ./studio katalog beschreibe)` };
  if (e.art !== "sound") return { fehler: `«${schluessel}» ist kein Sound, sondern ${e.art === "video" ? "ein Video" : "ein Foto"}` };
  const p = Klang.safeParse(roh);
  if (!p.success) return { fehler: p.error.issues.map((i) => `${i.path.join(".") || "(Klang)"}: ${i.message}`).join("; ") };
  const klang = { ...(e.klang?.spitzeDb !== undefined ? { spitzeDb: e.klang.spitzeDb } : {}), ...(e.klang?.lufs !== undefined ? { lufs: e.klang.lufs } : {}), ...p.data };
  return { katalog: katalog.map((x) => (x.schluessel === schluessel ? { ...x, klang } : x)), klang };
}

/** Ob das Storyboard den Sound benutzen darf: ein Sound mit Art, Lizenz und Quelle. Der Grund ist leer, wenn ja. */
export function klangGrund(e: KatalogEintrag | undefined, schluessel: string): string {
  if (!e) return `Katalog-Schlüssel «${schluessel}» existiert nicht`;
  if (e.art !== "sound") return `«${schluessel}» ist kein Sound`;
  if (!e.klang) return `«${schluessel}» hat keine Lizenz und keine Quelle im Katalog (./studio katalog klang ${schluessel} --art … --lizenz … --quelle …)`;
  return "";
}

/** Einfache Suche über Titel, Beschreibung und Tags: alle Begriffe müssen vorkommen, Gross- und Kleinschreibung zählt nicht. */
export function sucheKatalog(katalog: KatalogEintrag[], begriffe: string, filter: { art?: KatalogEintrag["art"] } = {}): KatalogEintrag[] {
  const teile = begriffe.toLowerCase().split(/\s+/).filter(Boolean);
  return katalog
    .filter((k) => !filter.art || k.art === filter.art)
    .filter((k) => {
      const heu = `${k.titel} ${k.beschreibung} ${k.tags.join(" ")}`.toLowerCase();
      return teile.every((t) => heu.includes(t));
    });
}

/** Kennung des Videos im Feld «zuletzt genutzt»: Name und Marke, damit «nicht im letzten Video derselben Marke» je Marke gilt. */
export const projektKennung = (name: string, marke: string): string => `${name} [${marke}]`;

export interface GenutztErgebnis {
  katalog: KatalogEintrag[];
  markiert: string[];
  /** Schlüssel, die es im Katalog nicht gibt. */
  unbekannt: string[];
}

/** Trägt ein, dass die Einträge in diesem Video vorkamen. Ein früherer Vermerk wird ersetzt: gemerkt wird immer nur die letzte Nutzung. */
export function markiereGenutzt(katalog: KatalogEintrag[], schluessel: string[], genutzt: { datum: string; projekt: string }): GenutztErgebnis {
  const gesucht = new Set(schluessel);
  const markiert: string[] = [];
  const neu = katalog.map((k) => {
    if (!gesucht.has(k.schluessel)) return k;
    markiert.push(k.schluessel);
    return { ...k, zuletztGenutzt: genutzt };
  });
  return { katalog: neu, markiert, unbekannt: [...gesucht].filter((s) => !markiert.includes(s)) };
}
