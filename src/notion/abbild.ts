import type { Akteur } from "../core/schemas";
import { IDEE_STATI, ausloesenderText, type Idee, type IdeeStatus, type WeiterDaten } from "../motion/idee";
import { quellenzeile } from "../motion/pitch";

/**
 * Abbild einer Idee als Zeile der Notion-Datenbank «Ideen» und zurück.
 *
 * Rollen:
 *   - Das Ideenprotokoll (data/ideen.json) ist die Wahrheit über den Zustand und prüft jeden Übergang.
 *   - Die Notion-Zeile ist Ansicht und Eingabe: Claude schreibt Inhalt hinein, der Prüfplatz schreibt die
 *     Entscheide eines Menschen hinein (Entscheid, Look-Wahl, Abnahme, jeweils mit Name und Zeitpunkt).
 *   - Claude schreibt nie einen Entscheid. `ideeZuZeile` setzt nur «offen» oder leert Felder, deren Stufe noch
 *     nicht erreicht ist (verhindert, dass ein zu früh oder veraltet gesetzter Entscheid später greift).
 *
 * Dieses Modul ist rein: Es ruft Notion nicht selbst auf. Die Sitzung (Claude Code) holt und schreibt die
 * Zeilen mit den Notion-Werkzeugen und übergibt sie diesen Funktionen.
 */

export type Wert = string | number | string[] | null;

/** Ein Bild für den Prüfplatz: Kennung, Adresse und eine kurze Beschriftung. */
export interface BildEintrag {
  id: string;
  url: string;
  text?: string;
}

/**
 * Format der Eigenschaft «Bilder»: eine Zeile je Bild, «<id>: <adresse> | <beschriftung>». Der Prüfplatz liest sie so.
 * Passt alles nicht in die Eigenschaft, entfallen die Beschriftungen (sie stehen im Seitentext).
 */
export function bilderZeilen(liste: BildEintrag[]): string | null {
  if (liste.length === 0) return null;
  const mit = liste.map((b) => `${b.id}: ${b.url}${b.text ? ` | ${b.text}` : ""}`).join("\n");
  return mit.length <= MAX_TEXT ? mit : liste.map((b) => `${b.id}: ${b.url}`).join("\n");
}

export interface ZeilenInhalt {
  /** Eigenschaften für notion-create-pages beziehungsweise notion-update-page (update_properties). */
  properties: Record<string, Wert>;
  /** Seitentext (Notion-Markdown) für die Seite der Idee. */
  inhalt: string;
}

/** Eine Zeile so, wie notion-query-data-sources im Modus «rows» sie liefert. */
export type Zeile = Record<string, unknown>;

/** Notion kürzt Texteigenschaften bei 2000 Zeichen. Der volle Text steht im Seitentext. */
const MAX_TEXT = 1800;

function kuerze(s: string, max = MAX_TEXT): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

/** Zeichen, die Notion-Markdown sonst als Formatierung liest. */
function esc(s: string): string {
  return s.replace(/([\\*~`$[\]<>{}|^])/g, "\\$1");
}

const reihenfolge = (s: IdeeStatus): number => IDEE_STATI.indexOf(s);
/** «abgelehnt» steht in IDEE_STATI am Ende, hat aber keine Stufe: Entscheide bleiben als Protokoll stehen. */
const vor = (status: IdeeStatus, stufe: IdeeStatus): boolean => status !== "abgelehnt" && reihenfolge(status) < reihenfolge(stufe);

/* ---------- Idee → Zeile ---------- */

export interface ZeilenOptionen {
  /** Ordner der Idee relativ zum Studio-Ordner in OneDrive, zum Beispiel «daten/ideen/m-001». */
  onedriveOrdner?: string;
  /** Adressen der Standbilder im Prüfplatz (Look → URL). Fehlen sie, steht der Dateipfad in «Bilder». */
  bildUrls?: Partial<Record<"a" | "b" | "c", string>>;
  /** Standbilder des gebauten Renders für die Abnahme (nur im Status «render_geprueft» verwendet). */
  renderBilder?: BildEintrag[];
}

export function ideeZuZeile(i: Idee, opt: ZeilenOptionen = {}): ZeilenInhalt {
  const q = i.quelle;
  const p: Record<string, Wert> = {
    Titel: i.titel,
    "Idee-ID": i.id,
    Status: i.status,
    Quelle: q.typ,
    Projekt: q.typ === "video" ? q.projekt : q.typ === "inspiration" ? q.titel : `Auftrag von ${q.von}`,
    Satz: kuerze(ausloesenderText(q)),
    Signale: [...new Set(i.signale.map((s) => s.typ))],
    "Warum nichts passt": kuerze(i.warumNichtsPasst.zusammenfassung),
    Pitch: i.pitch ? kuerze(`${i.pitch.text}\n\nZeigt: ${i.pitch.zeigt}`) : null,
    Aufwand: i.pitch?.aufwand ?? null,
    "Look-Runde": i.looks?.runde ?? 0,
    Stueck: i.bau?.stueck ?? null,
    Bilder: bilderZeilen(i.status === "render_geprueft" && opt.renderBilder?.length ? opt.renderBilder : lookBilder(i, opt)),
    "OneDrive-Ordner": opt.onedriveOrdner ? `Studio/${opt.onedriveOrdner}` : null,
  };

  // Stufen, die noch nicht erreicht sind: Entscheidfelder leeren. Erreichte Stufen bleiben unberührt,
  // damit ein Entscheid, den ein Mensch gerade gesetzt hat, nicht überschrieben wird.
  if (i.status === "idee") {
    Object.assign(p, { Entscheid: "offen", "Entscheid-Grund": null, "Entscheid von": null, "date:Entscheid am:start": null });
  }
  if (vor(i.status, "looks")) {
    Object.assign(p, { "Look-Wahl": null, "Look-Notiz": null, "Look-Wahl von": null, "date:Look-Wahl am:start": null });
  }
  if (vor(i.status, "render_geprueft")) {
    Object.assign(p, { Abnahme: "offen", "Abnahme-Notiz": null, "Abnahme von": null, "date:Abnahme am:start": null });
  }
  return { properties: p, inhalt: seitentext(i) };
}

function lookBilder(i: Idee, opt: ZeilenOptionen): BildEintrag[] {
  if (!i.looks) return [];
  const l = i.looks;
  return l.bilder.map((b) => {
    const brief = l.briefs.find((x) => x.id === b.id);
    return { id: b.id, url: opt.bildUrls?.[b.id] ?? b.pfad, text: brief ? `${brief.name}. ${brief.leitidee}` : undefined };
  });
}

function seitentext(i: Idee): string {
  const z: string[] = [];
  const w = i.warumNichtsPasst;
  z.push(`**Quelle:** ${esc(quellenzeile(i))}`, "", `> «${esc(ausloesenderText(i.quelle))}»`, "");
  z.push("## Warum nichts Bestehendes passt", "", esc(w.zusammenfassung), "");
  if (w.geprueft.length) {
    z.push(`Geprüft: ${w.geprueft.length} von ${w.bibliothekGroesse} Stücken.`, "", ...w.geprueft.map((g) => `- **${esc(g.stueck)}:** ${esc(g.grund)}`), "");
  }
  if (i.pitch) {
    const pt = i.pitch;
    z.push("## Pitch", "", esc(pt.text), "", `**Zeigt:** ${esc(pt.zeigt)}`, "", "**Pro Einsatz anders:**", "", ...pt.parameter.map((x) => `- ${esc(x)}`), "");
    z.push("**Weitere Einsätze:**", "", ...pt.wiederverwendung.map((x) => `- ${esc(x)}`), "", `**Aufwand:** ${pt.aufwand}`, "");
  }
  if (i.looks) {
    z.push(`## Looks, Runde ${i.looks.runde}`, "");
    for (const b of i.looks.briefs) {
      z.push(`- **${b.id.toUpperCase()}, ${esc(b.name)}:** ${esc(b.leitidee)} Schrift: ${esc(b.typografie)}. Farbe: ${esc(b.farbeinsatz)}. Bewegung: ${esc(b.bewegung)}.`);
    }
    z.push("");
    if (i.looks.notizen.length) z.push(...i.looks.notizen.map((n) => `- ${esc(n)}`), "");
  }
  if (i.bau) {
    z.push(`## Bau: ${esc(i.bau.stueck)}, Versuch ${i.bau.versuche}`, "");
    for (const r of i.bau.pruefungen) {
      z.push(`- Selbstprüfung ${r.runde}: ${r.bestanden ? "bestanden" : "nicht bestanden"}${r.bildurteil ? `. ${esc(r.bildurteil)}` : ""}`);
    }
    if (i.bau.notizen.length) z.push(...i.bau.notizen.map((n) => `- Notiz: ${esc(n)}`));
    z.push("");
  }
  z.push("## Verlauf", "", ...i.verlauf.map((v) => `- ${v.wann.slice(0, 10)}: ${v.von ?? "neu"} → ${v.nach} (${esc(v.wer.name)}${v.grund ? `, ${esc(v.grund)}` : ""})`), "");
  return z.join("\n");
}

/* ---------- Zeile → Entscheid ---------- */

export interface Aktion {
  idee: string;
  nach: IdeeStatus;
  akteur: Akteur;
  wann: string;
  grund?: string;
  daten?: WeiterDaten;
  /** Menschlich lesbar, für den Bericht. */
  text: string;
}

export interface Lesebefund {
  idee: string;
  /** Was zu tun ist. Leer, wenn die Zeile nichts Neues enthält. */
  aktion?: Aktion;
  /** Hinweise, die ein Mensch lesen soll (Entscheid ohne Namen, zu früh gesetzt, Abweichung). */
  hinweise: string[];
}

/** Notion liefert Zeilenumbrüche in Texteigenschaften als «<br>» (beobachtet am echten Abfrageergebnis). */
function text(z: Zeile, name: string): string {
  const v = z[name];
  return typeof v === "string" ? v.replace(/<br\s*\/?>/gi, "\n").trim() : "";
}

function wahl(z: Zeile, name: string): string {
  return text(z, name);
}

/** Zeitpunkt des Entscheids. Fehlt er oder ist er kaputt, gilt `jetzt`. */
function zeitpunkt(z: Zeile, spalte: string, jetzt: string): string {
  const roh = z[`date:${spalte}:start`];
  if (typeof roh !== "string" || !roh) return jetzt;
  const t = Date.parse(roh);
  return Number.isNaN(t) ? jetzt : new Date(t).toISOString();
}

export function leseZeile(i: Idee, z: Zeile, jetzt: string): Lesebefund {
  const hinweise: string[] = [];
  const befund: Lesebefund = { idee: i.id, hinweise };

  const status = wahl(z, "Status");
  if (status && status !== i.status) {
    hinweise.push(`Notion zeigt «${status}», das Protokoll «${i.status}». Das Protokoll gilt: Zeile neu schreiben.`);
  }

  const entscheid = wahl(z, "Entscheid");
  const lookWahl = wahl(z, "Look-Wahl");
  const abnahme = wahl(z, "Abnahme");

  const mensch = (name: string, feld: string): Akteur | undefined => {
    const n = text(z, name);
    if (!n) {
      hinweise.push(`${feld} ohne Namen im Feld «${name}»: nicht übernommen. Ein Mensch muss mit Namen entscheiden.`);
      return undefined;
    }
    return { typ: "mensch", name: n };
  };

  switch (i.status) {
    case "pitch": {
      if (entscheid === "freigegeben" || entscheid === "abgelehnt") {
        const akteur = mensch("Entscheid von", "Entscheid");
        if (akteur) {
          const grund = text(z, "Entscheid-Grund") || undefined;
          befund.aktion = {
            idee: i.id,
            nach: entscheid,
            akteur,
            wann: zeitpunkt(z, "Entscheid am", jetzt),
            grund,
            text: entscheid === "freigegeben" ? `Pitch freigegeben von ${akteur.name}` : `Pitch abgelehnt von ${akteur.name}: ${grund ?? "ohne Grund"}`,
          };
        }
      }
      break;
    }
    case "looks": {
      if (lookWahl === "a" || lookWahl === "b" || lookWahl === "c") {
        const akteur = mensch("Look-Wahl von", "Look-Wahl");
        if (akteur) {
          const notiz = text(z, "Look-Notiz");
          befund.aktion = {
            idee: i.id,
            nach: "look_gewaehlt",
            akteur,
            wann: zeitpunkt(z, "Look-Wahl am", jetzt),
            daten: { gewaehlt: lookWahl, notizen: notiz ? [notiz] : [] },
            text: `Look ${lookWahl.toUpperCase()} gewählt von ${akteur.name}${notiz ? ` (Notiz: ${notiz})` : ""}`,
          };
        }
      } else if (lookWahl === "keiner") {
        const akteur = mensch("Look-Wahl von", "Look-Wahl");
        const notiz = text(z, "Look-Notiz");
        if (akteur && !notiz) {
          hinweise.push("«Keiner der Looks» ohne Notiz: nicht übernommen. Die nächste Runde braucht den Grund.");
        } else if (akteur) {
          befund.aktion = {
            idee: i.id,
            nach: "freigegeben",
            akteur,
            wann: zeitpunkt(z, "Look-Wahl am", jetzt),
            grund: notiz,
            text: `Kein Look passt (${akteur.name}): ${notiz}. Neue Runde nötig.`,
          };
        }
      }
      break;
    }
    case "render_geprueft": {
      if (abnahme === "abgenommen" || abnahme === "aenderung") {
        const akteur = mensch("Abnahme von", "Abnahme");
        const notiz = text(z, "Abnahme-Notiz");
        if (akteur && abnahme === "aenderung" && !notiz) {
          hinweise.push("«Änderung nötig» ohne Notiz: nicht übernommen. Es muss stehen, was anders sein soll.");
        } else if (akteur) {
          befund.aktion = {
            idee: i.id,
            nach: abnahme === "abgenommen" ? "in_bibliothek" : "in_bau",
            akteur,
            wann: zeitpunkt(z, "Abnahme am", jetzt),
            grund: notiz || undefined,
            text: abnahme === "abgenommen" ? `Abgenommen von ${akteur.name}` : `Änderung verlangt von ${akteur.name}: ${notiz}`,
          };
        }
      }
      break;
    }
    default:
      break;
  }

  // Entscheide, die für eine spätere Stufe gesetzt wurden: sie greifen nicht und werden beim nächsten Schreiben geleert.
  if (!befund.aktion) {
    if (vor(i.status, "freigegeben") && i.status !== "pitch" && (entscheid === "freigegeben" || entscheid === "abgelehnt")) {
      hinweise.push(`Entscheid «${entscheid}» gesetzt, aber ohne Pitch gibt es nichts zu entscheiden: ignoriert.`);
    }
    if (vor(i.status, "looks") && lookWahl) hinweise.push(`Look-Wahl «${lookWahl}» gesetzt, bevor Looks vorliegen: ignoriert.`);
    if (vor(i.status, "render_geprueft") && (abnahme === "abgenommen" || abnahme === "aenderung")) {
      hinweise.push(`Abnahme «${abnahme}» gesetzt, bevor ein geprüftes Render vorliegt: ignoriert.`);
    }
  }
  return befund;
}

/* ---------- Ganze Abfrage ---------- */

export interface Lesebericht {
  befunde: Lesebefund[];
  /** Zeilen ohne passende Idee im Protokoll (zum Beispiel ein Auftrag, den ein Mensch direkt in Notion angelegt hat). */
  ohneIdee: { url: string; titel: string }[];
  /** Ideen, zu denen es keine Zeile gibt. */
  ohneZeile: string[];
}

/** Ergebnis von notion-query-data-sources im Modus «rows»: `{ results: [...] }` oder direkt das Array. */
export function zeilenAusAbfrage(roh: unknown): Zeile[] {
  const liste = Array.isArray(roh) ? roh : (roh as { results?: unknown })?.results;
  if (!Array.isArray(liste)) throw new Error("Erwartet wird das Ergebnis von notion-query-data-sources (Modus «rows») mit einer Liste «results»");
  return liste.filter((x): x is Zeile => typeof x === "object" && x !== null);
}

export function leseAlle(ideen: Idee[], zeilen: Zeile[], jetzt: string): Lesebericht {
  const nachId = new Map(ideen.map((i) => [i.id, i]));
  const gesehen = new Set<string>();
  const bericht: Lesebericht = { befunde: [], ohneIdee: [], ohneZeile: [] };
  for (const z of zeilen) {
    const id = text(z, "Idee-ID");
    const idee = nachId.get(id);
    if (!idee) {
      bericht.ohneIdee.push({ url: text(z, "url"), titel: text(z, "Titel") });
      continue;
    }
    if (gesehen.has(id)) {
      bericht.befunde.push({ idee: id, hinweise: [`Zwei Zeilen tragen die Idee-ID ${id}: nur die erste wurde gelesen.`] });
      continue;
    }
    gesehen.add(id);
    bericht.befunde.push(leseZeile(idee, z, jetzt));
  }
  bericht.ohneZeile = ideen.filter((i) => !gesehen.has(i.id)).map((i) => i.id);
  return bericht;
}
