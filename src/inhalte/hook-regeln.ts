import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { Slug } from "../core/schemas";
import { ANZEIGE_NAMEN, ANZEIGE_TEILE, leseAnzeige } from "./anzeige";
import { FORMATE, type Format } from "./inhalt";

/**
 * Hook- und Open-Loop-Regeln als Empfehlung (Plan M7). Die Regeln stehen als Datei in `library/hook-regeln.json`; sie stammen aus gesichteten Reels
 * (`docs/inspiration/hooks.md`) und sind unbelegt. Darum sind es **Empfehlungen und nie Fehler**: Sie gehören nicht zu `befunde` der Textprüfung, ändern
 * `bestanden` nicht und nicht den Exit-Code. Was sich nur mit Urteil beantworten lässt, steht als Prüffrage für Claude und die Menschen.
 */

export const HookRegeln = z
  .object({
    schema: z.literal(1),
    herkunft: z.string().min(1),
    belegt: z.boolean(),
    fragen: z.array(z.object({ id: Slug, frage: z.string().min(1), quelle: z.string().min(1) }).strict()).min(1),
    pruefungen: z
      .object({
        ersterSatzMaxWoerter: z.number().int().min(5).max(80),
        titelMaxZeilen: z.number().int().min(1).max(5),
        kommentarKoeder: z.array(z.string().min(3)).min(1),
      })
      .strict(),
  })
  .strict();
export type HookRegeln = z.infer<typeof HookRegeln>;

export function ladeHookRegeln(datei: string): HookRegeln {
  if (!fs.existsSync(datei)) throw new Error(`Die Hook-Regeln fehlen: ${datei}`);
  const r = HookRegeln.safeParse(JSON.parse(fs.readFileSync(datei, "utf8")));
  if (!r.success) throw new Error(`${path.basename(datei)} ist ungültig: ${r.error.issues.map((i) => `${i.path.join(".") || "(Datei)"}: ${i.message}`).join("; ")}`);
  for (const p of r.data.pruefungen.kommentarKoeder) {
    try {
      new RegExp(p, "iu");
    } catch {
      throw new Error(`${path.basename(datei)}: «${p}» ist kein gültiger Ausdruck`);
    }
  }
  return r.data;
}

export interface Empfehlung {
  code: string;
  text: string;
}

export interface HookPruefFrage {
  id: string;
  frage: string;
}

export interface HookPruefung {
  empfehlungen: Empfehlung[];
  /** Fragen, die sich nur mit Urteil beantworten lassen. Nicht automatisch geprüft. */
  fragen: HookPruefFrage[];
  /** Immer wahr, solange die Regeln unbelegt sind: Der Aufrufer zeigt es neben den Empfehlungen. */
  hinweis: string;
}

/** Formate mit einem Hook: Reel und Carousel (Titelfolie), Story, LinkedIn-Post (erste Zeile). */
const FORMATE_MIT_HOOK: readonly Format[] = ["Reel", "Carousel", "Story", "LinkedIn-Post", "Anzeige"];

const woerter = (s: string): number => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/** Der erste Satz: bis zum ersten Satzzeichen mit anschliessendem Leerraum oder Zeilenende, sonst bis zur ersten Zeile. «z. B.» zählt als Ende, der Satz erscheint dann kürzer, nicht länger. */
export function ersterSatz(text: string): string {
  const t = text.trim().replace(/^#+\s*/, "");
  const m = /^[\s\S]*?(?:[.!?…](?=\s|$)|\n)/u.exec(t);
  return (m ? m[0] : t).trim();
}

export interface HookPruefOptionen {
  /** Der Entwurf (Skript, Text, Folientext). */
  text: string;
  /** Der Hook der Idee (Titeltext im Bild, erste Zeile). Leer, wenn die Idee keinen hat. */
  hook?: string;
  /** Der Beleg der Idee. */
  beleg: string;
  format?: Format;
  regeln: HookRegeln;
}

export function hookPruefung(o: HookPruefOptionen): HookPruefung {
  const e: Empfehlung[] = [];
  const add = (code: string, text: string): number => e.push({ code, text: `Empfehlung: ${text}` });
  const p = o.regeln.pruefungen;
  const hook = (o.hook ?? "").trim();
  const text = o.text;

  // Eine Anzeige besteht aus Varianten für Hook, Körper und Aufruf (`anzeige.ts`); ihr erster Satz ist der Hook jeder Variante, nicht die erste Zeile des Entwurfs.
  const anzeige = o.format === "Anzeige" ? leseAnzeige(o.text) : undefined;

  if (o.format && FORMATE_MIT_HOOK.includes(o.format) && !hook && !(anzeige && anzeige.hook.length > 0)) {
    add("hook_fehlt", `Die Idee hat keinen Hook. Für ${o.format} lohnt sich ein Satz oder Titeltext, der die ersten Sekunden trägt`);
  }

  if (anzeige) {
    for (const t of ANZEIGE_TEILE) {
      if (!anzeige.gefunden.includes(t)) add("anzeige_teil_fehlt", `Im Entwurf fehlt der Teil «${ANZEIGE_NAMEN[t]}». Eine Anzeige hat je eine Überschrift (## Hook, ## Körper, ## Aufruf) mit Varianten darunter`);
      else if (anzeige[t].length === 0) add("anzeige_teil_leer", `Unter «${ANZEIGE_NAMEN[t]}» steht keine Variante`);
    }
    if (anzeige.hook.length === 1) add("anzeige_eine_hook_variante", "Es gibt nur eine Hook-Variante. Mit mindestens zwei Hooks lässt sich später prüfen, welcher trägt");
  }

  if (hook) {
    const zeilen = hook.split(/\r?\n/).filter((z) => z.trim()).length;
    if (zeilen > p.titelMaxZeilen) add("hook_zeilen", `Der Hook hat ${zeilen} Zeilen, empfohlen sind höchstens ${p.titelMaxZeilen} (lesbar bleiben, Gesicht und Mund frei)`);
    const belegHatZahl = /\d/.test(o.beleg);
    if (belegHatZahl && !/\d/.test(hook)) add("hook_ohne_zahl", "Der Beleg nennt eine Zahl, der Hook keine. Eine konkrete Zahl aus dem Beleg macht den Hook greifbar (die Quelle bleibt im Beleg)");
  }

  // Der erste Satz: bei einer Anzeige der jeder Hook-Variante, sonst der des Entwurfs
  const einstiege = anzeige ? anzeige.hook.map((h, i) => ({ satz: ersterSatz(h), wo: `Hook-Variante ${i + 1}` })) : [{ satz: ersterSatz(text), wo: "Der erste Satz" }];
  for (const { satz, wo } of einstiege) {
    const n = woerter(satz);
    if (n > p.ersterSatzMaxWoerter) add("erster_satz_lang", `${wo} hat ${n} Wörter, empfohlen sind höchstens ${p.ersterSatzMaxWoerter}. Bei normalem Sprechtempo verzögert ein langer Einstieg den Hook`);
  }

  for (const muster of p.kommentarKoeder) {
    const treffer = new RegExp(muster, "iu").exec(text);
    if (treffer) {
      add("kommentar_koeder", `«${treffer[0].trim()}» sieht nach einem Kommentar-Köder aus. Wir übernehmen ihn nicht: Der Nutzen steht im Beitrag, nicht hinter einem Kommentar`);
      break;
    }
  }

  return {
    empfehlungen: e,
    fragen: o.regeln.fragen.map(({ id, frage }) => ({ id, frage })),
    hinweis: o.regeln.belegt ? o.regeln.herkunft : `Die Regeln stammen aus gesichteten Reels und sind nicht belegt: Sie sind Empfehlungen, keine Fehler. ${o.regeln.herkunft}`,
  };
}

/** Für die Hilfe und Prüfungen: die Formate, für die ein Hook erwartet wird. */
export const HOOK_FORMATE: readonly Format[] = FORMATE_MIT_HOOK.filter((f) => (FORMATE as readonly string[]).includes(f));
