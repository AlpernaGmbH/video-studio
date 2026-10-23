import { z } from "zod";
import type { KatalogEintrag } from "../core/schemas";
import { bereinige } from "../studio/melder";
import { skriptZeilen } from "./zuordnung";

/**
 * Shotliste: was zu filmen ist, Einstellung für Einstellung, mit einem Beispielbild aus dem eigenen Katalog.
 * Die Beschreibung der Bilder schreibt Claude in einer Sitzung (`ergebnis/shotliste.json`); dieser Teil ist rein: Gerüst aus dem Skript, Prüfung gegen den Katalog, Text zum Lesen.
 * Beispielbilder gibt es nur aus dem Katalog (Schlüssel `k-0142`), nie aus dem Netz oder von fremden Seiten (Regel 5). Fehlt ein passendes Bild, steht das auf dem Bogen: Das ist eine Lücke im Katalog.
 * Nichts in der Liste trägt einen Pfad oder Dateinamen (Regel 11: Das Tool bekommt nie Dateinamen); die Prüfung weist solche Texte ab, statt sie still zu verändern.
 */

export const ID_MUSTER = /^c-\d{4}$/;

export const GROESSEN = ["totale", "halbtotale", "halbnah", "nah", "gross", "detail"] as const;
export type Groesse = (typeof GROESSEN)[number];

/** Beschriftung der Einstellungsgrösse (Filmbegriffe, wie sie am Set gesagt werden). */
export const GROESSE_TEXT: Record<Groesse, string> = { totale: "Totale", halbtotale: "Halbtotale", halbnah: "Halbnah", nah: "Nah", gross: "Gross", detail: "Detail" };

/**
 * Richtwert für das Gerüst: wie viele Wörter pro Sekunde ruhig gesprochen werden. Das ist eine Annahme (150 Wörter je Minute), nicht gemessen;
 * nach dem Dreh ersetzt das Transkript die Schätzung. Die Dauer im Gerüst ist darum immer eine Schätzung und im Text als solche bezeichnet.
 */
export const WOERTER_PRO_SEKUNDE = 2.5;
/** Eine Einstellung im Gerüst fasst so viele Sätze zusammen, bis sie mindestens diese Dauer (geschätzt) erreicht. */
export const MIN_DAUER_GERUEST = 3;

export const MAX_EINSTELLUNGEN = 40;

const kurz = (max: number) => z.string().trim().max(max);

/** Text, den Claude frei schreibt und der ans Tool gehen darf: ohne Pfade und Dateinamen. */
function ohnePfad(max: number, min = 1) {
  return z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((t) => bereinige(t, 100_000) === t.replace(/\s+/g, " ").trim(), {
      message: "enthält einen Pfad oder Dateinamen (auch «und/oder» zählt): Das Tool bekommt nie Dateinamen. Schreibe «und» statt «und/oder»",
    });
}

export const Einstellung = z.strictObject({
  nr: z.number().int().min(1).max(MAX_EINSTELLUNGEN),
  /** Teil des Reels: «Hook», «Beweis», «Aufruf» … */
  abschnitt: ohnePfad(40).optional(),
  /** Der gesprochene Satz, wörtlich aus dem Skript (Regel 6). */
  sprechtext: kurz(600).optional(),
  /** Was zu sehen ist. */
  bild: ohnePfad(240, 8),
  groesse: z.enum(GROESSEN).optional(),
  bewegung: ohnePfad(60).optional(),
  ort: ohnePfad(80).optional(),
  /** Sekunden. Im Gerüst eine Schätzung aus der Wortzahl. */
  dauer: z.number().positive().max(120).optional(),
  /** Schlüssel eines Katalog-Eintrags, dessen Vorschaubild als Beispiel dient. */
  beispiel: z.string().regex(/^k-\d{4,}$/, "Schlüssel wie k-0142").optional(),
  hinweis: ohnePfad(240).optional(),
});
export type Einstellung = z.infer<typeof Einstellung>;

export const Shotliste = z.strictObject({
  schema: z.literal(1),
  inhalt: z.string().regex(ID_MUSTER, "Kennung wie c-0007"),
  titel: ohnePfad(120),
  einstellungen: z.array(Einstellung).min(1).max(MAX_EINSTELLUNGEN),
});
export type Shotliste = z.infer<typeof Shotliste>;

/* ---------- Gerüst aus dem Skript ---------- */

const woerter = (s: string): number => s.split(/\s+/).filter(Boolean).length;
const rund = (n: number): number => Math.round(n * 10) / 10;

/** Der Gerüst-Eintrag hat noch keine Beschreibung: `bild` steht auf einem Platzhalter, den die Prüfung als «nicht ausgefüllt» meldet. */
export const PLATZHALTER = "AUSFÜLLEN: was ist zu sehen?";

/**
 * Teilt das Skript in Einstellungen: Sätze werden zusammengefasst, bis die geschätzte Sprechdauer mindestens MIN_DAUER_GERUEST erreicht.
 * Die erste Einstellung heisst «Hook», die letzte «Aufruf» (wenn es mehr als eine gibt). Reine Funktion; die Beschreibung der Bilder bleibt leer.
 */
export function baueGeruest(skriptText: string, inhalt: string, titel: string): Shotliste {
  const saetze = skriptZeilen(skriptText).map((s) => s.trim()).filter(Boolean);
  const gruppen: string[][] = [];
  let aktuell: string[] = [];
  let w = 0;
  for (const satz of saetze) {
    aktuell.push(satz);
    w += woerter(satz);
    if (w / WOERTER_PRO_SEKUNDE >= MIN_DAUER_GERUEST) {
      gruppen.push(aktuell);
      aktuell = [];
      w = 0;
    }
  }
  // ein kurzer Rest hängt an der letzten Einstellung, statt eine eigene zu bekommen
  if (aktuell.length) {
    if (gruppen.length) gruppen[gruppen.length - 1]!.push(...aktuell);
    else gruppen.push(aktuell);
  }
  if (gruppen.length === 0) throw new Error("Das Skript hat keine Sätze: Die Shotliste braucht einen Text, aus dem sie das Gerüst baut");
  if (gruppen.length > MAX_EINSTELLUNGEN) throw new Error(`Das Skript ergibt ${gruppen.length} Einstellungen, erlaubt sind ${MAX_EINSTELLUNGEN}. Das Skript ist für ein Reel zu lang`);
  return {
    schema: 1,
    inhalt,
    titel: bereinige(titel, 120) || inhalt,
    einstellungen: gruppen.map((g, i) => {
      const text = g.join(" ");
      return {
        nr: i + 1,
        ...(i === 0 ? { abschnitt: "Hook" } : i === gruppen.length - 1 && gruppen.length > 1 ? { abschnitt: "Aufruf" } : {}),
        sprechtext: text.slice(0, 600),
        bild: PLATZHALTER,
        dauer: Math.max(1, rund(woerter(text) / WOERTER_PRO_SEKUNDE)),
      };
    }),
  };
}

/* ---------- Prüfung ---------- */

export interface ShotlistePruefung {
  /** Die geprüfte Liste, oder undefined bei einem Fehler. */
  liste?: Shotliste;
  /** Fehler stoppen den Befehl: nichts wird geschrieben. */
  fehler: string[];
  /** Hinweise zeigen, wo ein Mensch hinschauen soll; sie stoppen nichts. */
  hinweise: string[];
  /** Zu Einstellungen ohne Beispielbild: Schlüssel aus dem Katalog, die zu den Wörtern der Beschreibung passen. Nur ein Vorschlag, nie übernommen. */
  vorschlaege: { nr: number; schluessel: string[] }[];
}

const pfadVon = (p: (string | number)[]): string => (p.length ? p.map(String).join(".") : "(Liste)");

/** Wörter der Beschreibung, mit denen im Katalog gesucht wird: ab vier Buchstaben, ohne Füllwörter, höchstens vier. */
const FUELLWOERTER = new Set(["einer", "eine", "einen", "einem", "dann", "oder", "wird", "werden", "auf", "mit", "und", "der", "die", "das", "den", "dem", "von", "vom", "zum", "zur", "ohne", "beim", "über", "unter", "nach", "aus"]);
export function suchwoerter(text: string): string[] {
  const alle = text.toLowerCase().split(/[^a-zäöüéèàß]+/).filter((w) => w.length >= 4 && !FUELLWOERTER.has(w));
  return [...new Set(alle)].slice(0, 4);
}

/**
 * Bis zu drei Katalog-Einträge (Fotos und Videos), in deren Titel, Beschreibung oder Tags Wörter der Beschreibung vorkommen; die mit den meisten Treffern zuerst.
 * Das ist eine Suche über Wörter, kein Urteil, ob das Bild passt: Ein Mensch oder Claude wählt.
 */
export function schlageVor(bild: string, katalog: KatalogEintrag[]): string[] {
  const begriffe = suchwoerter(bild);
  if (begriffe.length === 0) return [];
  return katalog
    .filter((k) => k.art !== "sound")
    .map((k) => {
      const heu = `${k.titel} ${k.beschreibung} ${k.tags.join(" ")}`.toLowerCase();
      return { s: k.schluessel, n: begriffe.filter((b) => heu.includes(b)).length };
    })
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.s.localeCompare(b.s))
    .slice(0, 3)
    .map((x) => x.s);
}

/**
 * Prüft die Shotliste von Claude gegen den Katalog. Fehler: falsche Form, falscher Inhalt, nicht fortlaufende Nummern, nicht ausgefüllte Beschreibung,
 * Schlüssel, die es nicht gibt, und Sounds als Beispielbild. Hinweise: Einstellungen ohne Beispielbild, dasselbe Bild mehrmals, ein Eintrag mit Personen.
 */
export function pruefeShotliste(roh: unknown, katalog: KatalogEintrag[], inhalt: string): ShotlistePruefung {
  const fehler: string[] = [];
  const hinweise: string[] = [];
  const vorschlaege: { nr: number; schluessel: string[] }[] = [];
  const p = Shotliste.safeParse(roh);
  if (!p.success) {
    for (const i of p.error.issues.slice(0, 12)) fehler.push(`${pfadVon(i.path)}: ${i.message}`);
    if (p.error.issues.length > 12) fehler.push(`… und ${p.error.issues.length - 12} weitere`);
    return { fehler, hinweise, vorschlaege };
  }
  const liste = p.data;
  if (liste.inhalt !== inhalt) fehler.push(`Die Liste gehört zu ${liste.inhalt}, geprüft wird ${inhalt}`);
  liste.einstellungen.forEach((e, i) => {
    if (e.nr !== i + 1) fehler.push(`Einstellung an Stelle ${i + 1} hat die Nummer ${e.nr}: Die Nummern müssen 1, 2, 3 … ohne Lücke sein`);
  });
  const offen = liste.einstellungen.filter((e) => e.bild === PLATZHALTER).map((e) => e.nr);
  if (offen.length) fehler.push(`Nicht ausgefüllt: Einstellung ${offen.join(", ")} (bild steht noch auf dem Platzhalter)`);

  const nachSchluessel = new Map(katalog.map((k) => [k.schluessel, k]));
  const benutzt = new Map<string, number>();
  for (const e of liste.einstellungen) {
    if (e.beispiel === undefined) {
      hinweise.push(`Einstellung ${e.nr} hat kein Beispielbild: Im Katalog fehlt ein passendes Bild, oder es wurde keines gewählt`);
      const treffer = schlageVor(e.bild, katalog);
      if (treffer.length) vorschlaege.push({ nr: e.nr, schluessel: treffer });
      continue;
    }
    const k = nachSchluessel.get(e.beispiel);
    if (!k) {
      fehler.push(`Einstellung ${e.nr}: Katalog-Schlüssel «${e.beispiel}» gibt es nicht. Beispielbilder kommen nur aus dem eigenen Katalog`);
      continue;
    }
    if (k.art === "sound") {
      fehler.push(`Einstellung ${e.nr}: «${e.beispiel}» ist ein Sound, kein Bild`);
      continue;
    }
    const davor = benutzt.get(e.beispiel);
    if (davor !== undefined) hinweise.push(`Einstellung ${e.nr} zeigt dasselbe Beispielbild wie Einstellung ${davor} (${e.beispiel})`);
    else benutzt.set(e.beispiel, e.nr);
    if (k.personen) hinweise.push(`Einstellung ${e.nr}: Auf «${e.beispiel}» sind Personen zu sehen. Das Bild geht nur ans Tool, wenn ein Admin Vorschauen für diesen Inhalt erlaubt hat`);
  }
  if (fehler.length) return { fehler, hinweise, vorschlaege };
  return { liste, fehler, hinweise, vorschlaege };
}

/* ---------- Beispielbild ---------- */

/**
 * Die Vorschaubilder eines Katalog-Eintrags in der Reihenfolge, in der eines als Beispiel dient (relativ zum Datenordner). Ein Foto hat nur das Bild «a»;
 * ein Video hat Anfang (a), Mitte (b) und Ende (c): Die Mitte zeigt meist die Handlung.
 */
export function vorschauKandidaten(k: Pick<KatalogEintrag, "schluessel" | "art">): string[] {
  const rel = (b: string): string => `katalog/vorschau/${k.schluessel}-${b}.jpg`;
  return k.art === "foto" ? [rel("a")] : [rel("b"), rel("a"), rel("c")];
}

/* ---------- Text zum Lesen ---------- */

const zwei = (n: number): string => String(n).padStart(2, "0");
/** 03.10.2026 */
export const datumCH = (d: Date): string => `${zwei(d.getDate())}.${zwei(d.getMonth() + 1)}.${d.getFullYear()}`;
const sek = (n: number): string => `${Number.isInteger(n) ? n : n.toFixed(1).replace(".", ",")} s`;

/** Die Gesamtdauer aller Einstellungen, die eine Dauer haben. */
export const gesamtDauer = (l: Shotliste): number => rund(l.einstellungen.reduce((s, e) => s + (e.dauer ?? 0), 0));

/**
 * Die Shotliste als Text: für Menschen am Set und für die Seite des Inhalts im Tool. Enthält den Titel des Katalog-Eintrags und den Schlüssel, nie einen Pfad.
 * Der Sprechtext steht wörtlich da (Regel 6).
 */
export function shotlisteText(l: Shotliste, katalog: KatalogEintrag[], jetzt: Date): string {
  const nachSchluessel = new Map(katalog.map((k) => [k.schluessel, k]));
  const dauer = gesamtDauer(l);
  const kopf = [
    `# Shotliste ${l.inhalt}: ${l.titel}`,
    "",
    `Stand ${datumCH(jetzt)} · ${l.einstellungen.length} Einstellungen${dauer > 0 ? ` · zusammen etwa ${sek(dauer)}` : ""}`,
    "Die Beispielbilder stammen aus dem eigenen Katalog. Die Dauer ist eine Angabe aus dem Skript (Annahme: 150 Wörter je Minute), nicht gemessen.",
    "",
  ];
  const teile = l.einstellungen.flatMap((e) => {
    const k = e.beispiel ? nachSchluessel.get(e.beispiel) : undefined;
    const kopfTeile = [e.abschnitt, e.groesse ? GROESSE_TEXT[e.groesse] : undefined, e.dauer ? sek(e.dauer) : undefined].filter(Boolean).join(" · ");
    const zeilen = [`## ${e.nr}.${kopfTeile ? ` ${kopfTeile}` : ""}`, "", `Bild: ${e.bild}`];
    if (e.bewegung) zeilen.push(`Bewegung: ${e.bewegung}`);
    if (e.ort) zeilen.push(`Ort: ${e.ort}`);
    if (e.sprechtext) zeilen.push(`Sprechtext: «${e.sprechtext}»`);
    zeilen.push(k ? `Beispielbild: ${k.schluessel} «${bereinige(k.titel, 80)}»` : "Beispielbild: keines (Lücke im Katalog)");
    if (e.hinweis) zeilen.push(`Hinweis: ${e.hinweis}`);
    zeilen.push("");
    return zeilen;
  });
  return [...kopf, ...teile].join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

/** Eine kurze Zeile für den Bogen: «3 · Nah · 4 s». */
export function kachelKopf(e: Einstellung): string {
  return [String(e.nr), e.groesse ? GROESSE_TEXT[e.groesse] : undefined, e.dauer ? sek(e.dauer) : undefined].filter(Boolean).join(" · ");
}

/** Bricht Text in Zeilen von höchstens `breite` Zeichen und kürzt auf `zeilen` Zeilen mit «…» (rein). */
export function umbrich(text: string, breite: number, zeilen: number): string[] {
  const woerterListe = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const aus: string[] = [];
  let z = "";
  for (let w of woerterListe) {
    while (w.length > breite) {
      if (z) {
        aus.push(z);
        z = "";
      }
      aus.push(w.slice(0, breite));
      w = w.slice(breite);
    }
    if (!z) z = w;
    else if (z.length + 1 + w.length <= breite) z += ` ${w}`;
    else {
      aus.push(z);
      z = w;
    }
  }
  if (z) aus.push(z);
  if (aus.length <= zeilen) return aus;
  const kopf = aus.slice(0, zeilen);
  // die letzte Zeile bekommt «…» und bleibt dabei in der Breite: Eher ein Wort weniger als ein halbes Wort
  let letzte = kopf[zeilen - 1]!;
  while (letzte.length + 1 > breite) {
    const leer = letzte.lastIndexOf(" ");
    letzte = leer > 0 ? letzte.slice(0, leer) : letzte.slice(0, breite - 1);
  }
  kopf[zeilen - 1] = `${letzte}…`;
  return kopf;
}

