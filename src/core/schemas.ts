import { z } from "zod";
import { RelPathSchema } from "./paths";

/* ---------- Bausteine ---------- */

export const Iso = z.string().datetime({ offset: true });
export const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Hex-Farbe wie #FFC629 erwartet");
export const Slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Kleinbuchstaben, Ziffern und Bindestriche");

/** Wer etwas getan hat. Freigaben sind nur gültig, wenn `typ` «mensch» ist (siehe motion/idee.ts). */
export const Akteur = z.object({
  typ: z.enum(["mensch", "system"]),
  name: z.string().min(1),
});
export type Akteur = z.infer<typeof Akteur>;

/* ---------- Katalog (Bauplan 3.7) ---------- */

export const KatalogEintrag = z.object({
  schluessel: z.string().regex(/^k-\d{4,}$/, "Schlüssel wie k-0142"),
  art: z.enum(["video", "foto", "sound"]),
  pfad: RelPathSchema,
  titel: z.string().min(3),
  beschreibung: z.string().min(3),
  tags: z.array(z.string().min(1)).min(1),
  dauer: z.number().positive().optional(),
  bildrate: z.number().positive().optional(),
  orientierung: z.enum(["hoch", "quer", "quadrat"]).optional(),
  zeitlupe: z.boolean().default(false),
  log: z.boolean().default(false),
  besteSekunden: z.object({ von: z.number().min(0), bis: z.number().positive() }).refine((v) => v.bis > v.von, "bis muss nach von liegen").optional(),
  personen: z.boolean().default(false),
  freigabe: z.string().default("alles erlaubt"),
  sicherheit: z.enum(["hoch", "mittel", "niedrig"]),
  zuletztGenutzt: z.object({ datum: z.string(), projekt: z.string() }).optional(),
});
export type KatalogEintrag = z.infer<typeof KatalogEintrag>;

/* ---------- Markenprofil (Bauplan Kap. 4) ---------- */

/**
 * Schnittprofil (Plan v3, 9.1): Die Optik folgt der Marke, das Tempo dem Schnittprofil. Alperna: Optik ruhig, Schnitt schnell (Retention).
 * Eine Marke kann ruhig aussehen und schnell geschnitten sein, ein anderer Kunde umgekehrt.
 */
export const Schnittprofil = z
  .object({
    /** Längste Pause zwischen zwei Wörtern im Schnitt, in Sekunden. */
    laengstePause: z.number().positive(),
    /** Längste Einstellung ohne Bildwechsel, in Sekunden. */
    laengsteEinstellung: z.number().positive(),
    woerterJeUntertitel: z.object({ min: z.number().int().min(1), max: z.number().int().min(1) }),
    /** Höchstens so viele Sekunden bis zur ersten Aussage. */
    hookMaxSekunden: z.number().positive(),
    zoomTempo: z.enum(["langsam", "mittel", "schnell"]),
    /** Textlängen je Format (Zeichen), zum Beispiel {"linkedin-post": {"min": 400, "max": 1300}}. */
    textlaengen: z.record(z.object({ min: z.number().int().min(0), max: z.number().int().positive() })).default({}),
  })
  .superRefine((p, ctx) => {
    if (p.woerterJeUntertitel.max < p.woerterJeUntertitel.min) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["woerterJeUntertitel"], message: "max darf nicht kleiner als min sein" });
    }
    for (const [format, l] of Object.entries(p.textlaengen)) {
      if (l.max < l.min) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["textlaengen", format], message: "max darf nicht kleiner als min sein" });
    }
  });
export type Schnittprofil = z.infer<typeof Schnittprofil>;

/** Aussehen der Untertitel (Wort für Wort). Gehört zum Markenprofil, die Presets in presets/untertitel/ sind Vorschläge dafür. */
export const CaptionPreset = z.object({
  schrift: z.string().min(1),
  groesse: z.number().positive(),
  position: z.enum(["mitte", "unten", "oben"]),
  animation: z.enum(["pop", "fade", "keine"]),
  hervorhebung: z.enum(["akzent", "kasten", "keine"]),
  grossschreibung: z.boolean(),
  kasten: z.boolean(),
});
export type CaptionPreset = z.infer<typeof CaptionPreset>;

export const Markenprofil = z.object({
  schluessel: Slug,
  name: z.string().min(1),
  /** «platzhalter» bis Gate 0 bestanden ist. Mit Platzhalter-Profil gibt es nur Entwürfe, nie einen finalen Export. */
  status: z.enum(["platzhalter", "freigegeben"]),
  freigabe: z.object({ wer: z.string(), wann: Iso }).optional(),
  farben: z.object({
    hintergrund: Hex,
    text: Hex,
    akzent1: Hex,
    akzent2: Hex,
  }),
  schriften: z.object({
    titel: z.string().min(1),
    fliesstext: z.string().min(1),
  }),
  logo: z.object({ hell: RelPathSchema.optional(), dunkel: RelPathSchema.optional() }).default({}),
  captionPreset: CaptionPreset.optional(),
  effektStil: z.object({
    eckenradius: z.number().min(0),
    schatten: z.boolean(),
    /** 1 = normal, grösser = schneller */
    bewegungstempo: z.number().positive(),
  }),
  tonalitaet: z.object({
    anrede: z.enum(["du", "sie"]),
    verboteneWoerter: z.array(z.string()).default([]),
    hinweise: z.string().default(""),
  }),
  ton: z.object({
    /** Soundeffekte pro Sekunde, Bauplan 3.8: höchstens 0,5 (einer pro 2 s) */
    sfxDichte: z.number().min(0).max(0.5),
    musik: z.boolean(),
  }),
  look: z.string().optional(),
  schnittprofil: Schnittprofil.optional(),
  schlusskarte: z.object({ text: z.string(), handle: z.string().optional() }).optional(),
  hashtags: z.object({ fest: z.array(z.string()).default([]), anzahl: z.number().int().min(0).max(30) }),
});
export type Markenprofil = z.infer<typeof Markenprofil>;

/** Gate 0: Erst nach Freigabe wird das Profil für einen finalen Export benutzt. */
export function markeFuerExportFreigegeben(marke: Markenprofil): { ok: true } | { ok: false; grund: string } {
  if (marke.status !== "freigegeben") return { ok: false, grund: `Markenprofil «${marke.name}» ist ein Platzhalter (Gate 0 offen)` };
  if (!marke.freigabe) return { ok: false, grund: `Markenprofil «${marke.name}» hat keine Freigabe (wer, wann)` };
  return { ok: true };
}

/**
 * Was dem Profil für Gate 0 (Tor 0) noch fehlt. Leer heisst vollständig; freigeben muss trotzdem ein Mensch mit den Probebildern.
 * Grundlage ist die Tabelle in Kapitel 4 des Plans v2 plus das Schnittprofil aus Plan v3.
 */
export function gate0Luecken(marke: Markenprofil): string[] {
  const l: string[] = [];
  if (!marke.logo.hell && !marke.logo.dunkel) l.push("Logo (helle oder dunkle Datei)");
  if (!marke.captionPreset) l.push("Caption-Preset");
  if (!marke.schnittprofil) l.push("Schnittprofil");
  if (!marke.schlusskarte) l.push("Schlusskarte");
  if (marke.tonalitaet.verboteneWoerter.length === 0) l.push("Verbotene Wörter");
  return l;
}

/* ---------- Ereignisse (Bauplan Kap. 5 und 6) ---------- */

export const EreignisStufe = z.enum([
  "skript-zuordnung",
  "schnitt",
  "storyboard",
  "vorschau",
  "export",
  "motion-idee",
  "motion-pitch",
  "motion-looks",
  "motion-bau",
  "motion-abnahme",
  "regel",
]);

export const EreignisArt = z.enum([
  "geloescht",
  "verschoben",
  "ersetzt",
  "text-geaendert",
  "abgewaehlt",
  "bestaetigt",
  /** Auch Unverändertes ist ein Signal («es blieb, also passt es»). */
  "unveraendert",
  "freitext",
  "freigegeben",
  "abgelehnt",
  "look-gewaehlt",
  "notiz",
]);

export const Ereignis = z.object({
  projekt: z.string().min(1),
  stufe: EreignisStufe,
  art: EreignisArt,
  detail: z.record(z.unknown()).default({}),
  zeit: Iso,
  wer: Akteur,
});
export type Ereignis = z.infer<typeof Ereignis>;

/* ---------- Regeln (Bauplan Kap. 5) ---------- */

export const MAX_AKTIVE_REGELN = 30;

export const Regel = z
  .object({
    id: z.string().regex(/^r-\d{3,}$/),
    text: z.string().min(8),
    typ: z.enum(["handwerk", "optik"]),
    /** Optik-Regeln sind an eine Marke gebunden, Handwerk gilt überall. */
    marke: Slug.optional(),
    geltung: z.literal("alle-videos").default("alle-videos"),
    status: z.enum(["vorschlag", "aktiv", "pausiert", "verworfen"]),
    beleg: z.object({ anzahl: z.number().int().min(1), verweise: z.array(z.string()).min(1) }),
    freigabe: z.object({ wer: z.string().min(1), wann: Iso }).optional(),
  })
  .superRefine((r, ctx) => {
    if (r.typ === "optik" && !r.marke) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["marke"], message: "Optik-Regeln brauchen eine Marke" });
    }
    if (r.typ === "handwerk" && r.marke) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["marke"], message: "Handwerk-Regeln gelten überall und tragen keine Marke" });
    }
    if (r.status === "aktiv" && !r.freigabe) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["freigabe"], message: "Aktive Regel braucht eine Freigabe (wer, wann)" });
    }
  });
export type Regel = z.infer<typeof Regel>;

export function pruefeRegelLimit(regeln: Regel[]): { ok: boolean; aktiv: number; limit: number } {
  const aktiv = regeln.filter((r) => r.status === "aktiv").length;
  return { ok: aktiv <= MAX_AKTIVE_REGELN, aktiv, limit: MAX_AKTIVE_REGELN };
}

/* ---------- Storyboard (Bauplan 3.5, Anhang A1) ---------- */

export const Overlay = z.object({
  /** Schlüssel eines Motion-Stücks, oder «broll» für Katalog-Material. */
  effekt: z.string().min(1),
  t: z.number().min(0),
  dauer: z.number().positive(),
  params: z.record(z.unknown()).default({}),
  /** Kein Overlay ohne Begründung. */
  begruendung: z.string().min(5),
});
export type Overlay = z.infer<typeof Overlay>;

export const Storyboard = z.object({
  hook: z.string().min(1),
  overlays: z.array(Overlay),
  /** Wortindizes, die betont werden */
  betonung: z.array(z.number().int().min(0)).default([]),
  notiz: z.string().default(""),
});
export type Storyboard = z.infer<typeof Storyboard>;
