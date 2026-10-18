import type { Zeile } from "../notion/abbild";

/**
 * Ein Inhalt (Plan v3, Kapitel 3): eine Idee für Reel, Carousel, LinkedIn-Post, Blog oder Google-Beitrag, von «Neu» bis «Ausgewertet».
 * Dieses Modul kennt die Notion-Datenbank «Inhalte» (Namen der Eigenschaften und Auswahlwerte stehen dort genau so) und rechnet
 * eine Zeile in einen `Inhalt` um und zurück. Es ruft Notion nicht auf.
 *
 * Wer schreibt was (Plan v3, Anhang A3): Claude schreibt Inhalt, Hook, Winkel, Beleg und den Status (mit Prüfung). Die Entscheide von Tor I und
 * Tor P schreibt nur der Prüfplatz. Claude setzt dort höchstens «offen».
 */

export const FORMATE = ["Reel", "Carousel", "LinkedIn-Post", "Blog", "Google-Maps-Beitrag", "Story", "Sonstiges", "ungeklärt"] as const;
export const PLATTFORMEN = ["Instagram", "LinkedIn", "Blog", "Google", "weitere"] as const;
export const PROFILE = ["Andrej", "Leander", "Alperna", "Kunde"] as const;
export const QUELLEN = ["Manuell", "Rohstoff", "Viral-Liste", "Kundenwunsch", "Scraping", "Performance"] as const;
export const AUFWAENDE = ["Dreh nötig", "Nur Katalog", "Nur Text"] as const;
export const PUBLISHING = ["Auto", "Paket", "Manuell"] as const;
export const STATI = ["Neu", "Pitch bereit", "In Produktion", "Entwurf fertig", "Freigegeben", "Geplant", "Veröffentlicht", "Ausgewertet", "Pausiert", "Verworfen"] as const;
export const TOR_I = ["offen", "freigegeben", "abgelehnt", "Rückfrage"] as const;
export const TOR_P = ["offen", "freigegeben", "Änderung"] as const;

export type Format = (typeof FORMATE)[number];
export type Plattform = (typeof PLATTFORMEN)[number];
export type Status = (typeof STATI)[number];
export type TorIEntscheid = (typeof TOR_I)[number];
export type TorPEntscheid = (typeof TOR_P)[number];

/** Formate, die ohne Render auskommen: Claude schreibt den Entwurf selbst in die Seite (Plan v3, 3.1). */
export const TEXTFORMATE: readonly Format[] = ["LinkedIn-Post", "Blog", "Google-Maps-Beitrag"];
export const istTextformat = (f: Format | undefined): boolean => !!f && TEXTFORMATE.includes(f);

export interface Tor<E extends string> {
  entscheid: E | "";
  grund: string;
  von: string;
  /** ISO-Zeitpunkt oder Datum, wie Notion es liefert. */
  am: string;
}

export interface Inhalt {
  /** Kennung wie c-0007. Schlüssel. */
  id: string;
  titel: string;
  format?: Format;
  plattformen: Plattform[];
  /** Marken-ID (zum Beispiel «alperna»), aufgelöst aus der Verknüpfung zur Datenbank «Marken». Leer, wenn nicht aufgelöst. */
  marke: string;
  /** Seiten-Adressen der verknüpften Marken, wie Notion sie liefert. */
  markeUrls: string[];
  profil?: string;
  quelle?: string;
  referenz: string;
  hook: string;
  winkel: string;
  beleg: string;
  aufwand?: string;
  status: Status | "";
  torI: Tor<TorIEntscheid>;
  torP: Tor<TorPEntscheid>;
  /** Wer den Status von Hand gesetzt hat und warum (Pausieren, Verwerfen, «Veröffentlicht» bestätigen). Der Prüfplatz füllt beides. */
  statusVon: string;
  statusGrund: string;
  /** Zeitpunkt, an dem der Prüfplatz den Status gesetzt hat. Ein von Hand geänderter Status gilt nur mit einem neuen Zeitpunkt. */
  statusAm: string;
  dateien: string;
  ziel: string;
  publishing?: string;
  geplantFuer: string;
  batch: string;
  offeneMarkierungen: number;
  /** Notion-Seite der Zeile. */
  url: string;
  seite: string;
  erstellt: string;
}

/** Notion macht aus einer Adresse in einem Textfeld eine Erwähnung: `<mention-page url="…">Name</mention-page>`. Gelesen wird «Name (Adresse)». */
const ERWAEHNUNG = /<mention-[a-z-]+ url="([^"]*)"[^>]*>([^<]*)<\/mention-[a-z-]+>/gi;

function text(z: Zeile, name: string): string {
  const v = z[name];
  return typeof v === "string" ? v.replace(/<br\s*\/?>/gi, "\n").replace(ERWAEHNUNG, (_m, url: string, name: string) => (name.trim() ? `${name.trim()} (${url})` : url)).trim() : "";
}

/** Im Feld «Dateien» zählt der Link, nicht der Titel der Seite, auf die Notion ihn verweist. */
function textMitLinks(z: Zeile, name: string): string {
  const v = z[name];
  return typeof v === "string" ? v.replace(/<br\s*\/?>/gi, "\n").replace(ERWAEHNUNG, (_m, url: string) => url).trim() : "";
}

function wahl<T extends string>(z: Zeile, name: string, erlaubt: readonly T[]): T | undefined {
  const v = text(z, name);
  return (erlaubt as readonly string[]).includes(v) ? (v as T) : undefined;
}

/** Notion liefert Mehrfachauswahl und Verknüpfungen als JSON-Text oder als Liste. */
function liste(z: Zeile, name: string): string[] {
  const v = z[name];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  if (typeof v !== "string" || !v.trim()) return [];
  try {
    const p: unknown = JSON.parse(v);
    return Array.isArray(p) ? p.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function tor<E extends string>(z: Zeile, praefix: "Tor I" | "Tor P", erlaubt: readonly E[]): Tor<E> {
  return {
    entscheid: wahl(z, `${praefix} Entscheid`, erlaubt) ?? "",
    grund: text(z, `${praefix} Grund`),
    von: text(z, `${praefix} von`),
    am: text(z, `date:${praefix} am:start`),
  };
}

/** Seiten-Kennung aus einer Notion-Adresse oder Kennung: die letzten 32 Hex-Zeichen, klein und ohne Bindestriche (auch aus 8-4-4-4-12). */
export function seitenId(url: string): string {
  const t = url.match(/(?<![0-9a-f])[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}(?![0-9a-f])/gi);
  return t ? t[t.length - 1]!.replace(/-/g, "").toLowerCase() : "";
}

/** Eine Zeile der Ansicht «Inhalte» als Inhalt. `markenNachUrl` löst die Verknüpfung zur Marke auf (Seiten-Kennung → Marken-ID). */
export function zeileZuInhalt(z: Zeile, markenNachId: ReadonlyMap<string, string> = new Map()): Inhalt {
  const markeUrls = liste(z, "Marke");
  const marke = markeUrls.map((u) => markenNachId.get(seitenId(u))).find((m): m is string => !!m) ?? "";
  const url = text(z, "url");
  const plattformen = liste(z, "Plattformen").filter((p): p is Plattform => (PLATTFORMEN as readonly string[]).includes(p));
  return {
    id: text(z, "Inhalt-ID"),
    titel: text(z, "Titel"),
    format: wahl(z, "Format", FORMATE),
    plattformen,
    marke,
    markeUrls,
    profil: text(z, "Profil") || undefined,
    quelle: text(z, "Quelle") || undefined,
    referenz: text(z, "Referenz"),
    hook: text(z, "Hook"),
    winkel: text(z, "Winkel"),
    beleg: text(z, "Beleg"),
    aufwand: text(z, "Aufwand") || undefined,
    status: wahl(z, "Status", STATI) ?? "",
    torI: tor(z, "Tor I", TOR_I),
    torP: tor(z, "Tor P", TOR_P),
    statusVon: text(z, "Status von"),
    statusGrund: text(z, "Status-Grund"),
    statusAm: text(z, "date:Status am:start"),
    dateien: textMitLinks(z, "Dateien"),
    ziel: text(z, "Ziel"),
    publishing: text(z, "Publishing") || undefined,
    geplantFuer: text(z, "date:Geplant für:start"),
    batch: text(z, "Batch"),
    offeneMarkierungen: typeof z["Offene Markierungen"] === "number" ? (z["Offene Markierungen"] as number) : 0,
    url,
    seite: seitenId(url),
    erstellt: text(z, "createdTime"),
  };
}

export type Wert = string | number | string[] | null;

/**
 * Eigenschaften, die Claude in die Zeile schreiben darf. Entscheide der Tore kommen nie vor, ausser dem Leeren (null) oder «offen» von Stufen,
 * die noch nicht erreicht sind oder nach einer Rückfrage neu beginnen. So gilt kein zu früh gesetzter Entscheid später.
 */
export function inhaltZuProperties(i: Inhalt): Record<string, Wert> {
  const p: Record<string, Wert> = {
    Titel: i.titel,
    "Inhalt-ID": i.id,
    Format: i.format ?? null,
    Plattformen: i.plattformen,
    Profil: i.profil ?? null,
    Quelle: i.quelle ?? null,
    Referenz: i.referenz || null,
    Hook: i.hook || null,
    Winkel: i.winkel || null,
    Beleg: i.beleg || null,
    Aufwand: i.aufwand ?? null,
    Status: i.status || "Neu",
    Dateien: i.dateien || null,
    Ziel: i.ziel || null,
    Publishing: i.publishing ?? null,
    Batch: i.batch || null,
    "Offene Markierungen": i.offeneMarkierungen,
  };
  const status: Status = i.status || "Neu";
  if (status === "Neu" && i.torI.entscheid !== "Rückfrage") {
    Object.assign(p, { "Tor I Entscheid": "offen", "Tor I Grund": null, "Tor I von": null, "date:Tor I am:start": null });
  }
  if (["Neu", "Pitch bereit"].includes(status) || (status === "In Produktion" && i.torP.entscheid !== "Änderung")) {
    Object.assign(p, { "Tor P Entscheid": "offen", "Tor P Grund": null, "Tor P von": null, "date:Tor P am:start": null });
  }
  return p;
}
