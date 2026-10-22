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
 * Schnittprofil (Plan v3, 9.1, geändert durch Plan v4): Die Optik folgt der Marke, das Tempo dem Schnittprofil. Alperna: ruhig und hochwertig.
 * Ein Schnitt darf schnell sein, wenn er hochwertig aussieht; billig wirkt Hektik ohne Gestaltung. Darum gibt es keinen Zoom-Automatismus mehr:
 * Zooms setzt das Storyboard am Schluss, nur auf betonten Wörtern (`zoom`).
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
    /** Stärke eines Zooms, den das Storyboard setzt: mittel = 1,1-fach, schnell = 1,15-fach. «langsam» heisst: keine Zooms. */
    zoomTempo: z.enum(["langsam", "mittel", "schnell"]),
    /** Zoom nur nach dem Storyboard («betonung») oder nie («aus»), höchstens so viele je Minute. */
    zoom: z.object({ modus: z.enum(["aus", "betonung"]), maxProMinute: z.number().min(0) }).default({ modus: "aus", maxProMinute: 4 }),
    /** Kürzeste Einstellung in Sekunden. Kürzere Stücke werden mit dem Nachbarn verschmolzen, statt als Mikro-Schnitt zu flackern. */
    minClip: z.number().min(0).default(0.7),
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

/**
 * Ein Look für Bildmaterial (Plan v4, 1.4), als wenige Zahlen. `schwarz` und `weiss` sind die Eingangswerte (0 bis 1), die Schwarz und Weiss werden sollen.
 * Fehlen sie, misst das System sie am Material (10. und 90. Perzentil der Helligkeit). Gerechnet wird in `src/schnitt/lut.ts`.
 */
export const Farblook = z
  .object({
    schwarz: z.number().min(0).max(0.5).optional(),
    weiss: z.number().min(0.3).max(1).optional(),
    /** Mitten: über 1 heller, unter 1 dunkler. */
    gamma: z.number().min(0.4).max(2.5).default(1),
    /** Stärke der S-Kurve, 0 bis 1. */
    kontrast: z.number().min(0).max(1).default(0),
    saettigung: z.number().min(0).max(2).default(1),
    /** Über 0 kühl (Blau in Schatten und Mitten), unter 0 warm. */
    kuehle: z.number().min(-1).max(1).default(0),
  })
  .refine((l) => l.schwarz === undefined || l.weiss === undefined || l.weiss > l.schwarz + 0.1, { message: "«weiss» muss mindestens 0,1 über «schwarz» liegen", path: ["weiss"] });
export type Farblook = z.infer<typeof Farblook>;

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
  /**
   * Der Look in Zahlen (Plan v4, 1.4): `log` für flaches Material (Log), `angleich` für normales Material und B-Roll, damit beides zusammenpasst.
   * Daraus entstehen die LUTs für Vorschau und Resolve. Eine Näherung, keine Kamera-LUT.
   */
  farbe: z
    .object({
      log: Farblook.optional(),
      angleich: Farblook.optional(),
      /**
       * Das Log-Profil der Kamera (Lumix S1IIE, S5II: Panasonic V-Log). «vlog» macht V-Log zur Annahme für flaches Material und baut die LUT «log» mit der
       * Umrechnung des Herstellers (`vlog.ts`) statt aus Zahlen allein; dann gilt `vlog` als Look über der Basis. «generisch» (oder fehlend) bleibt die Näherung aus `log`.
       */
      logProfil: z.enum(["vlog", "generisch"]).optional(),
      /** Der Look über der V-Log-Basis (Rec. 709): wenige Zahlen, die Basis ist schon ein normales Bild. Fehlt er, bleibt es bei der reinen Umrechnung. */
      vlog: Farblook.optional(),
      /** Belichtung der V-Log-Umrechnung in Blenden (plus = heller). Pro Inhalt mit `--belichtung` überschreibbar. */
      belichtung: z.number().min(-3).max(3).optional(),
    })
    .optional(),
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

/** Ein Zoom auf einem betonten Wort (Plan v4: Zooms setzt das Storyboard am Schluss, nicht der Schnitt). */
export const Zoom = z.object({
  /** Nummer des betonten Wortes, wie in `betonung`. */
  wort: z.number().int().min(0),
  /** Dauer in Sekunden. Kürzer als 0,6 s wirkt wie ein Ruckler. */
  dauer: z.number().min(0.6).max(3).default(1.2),
  /** Faktor, 1,1 = 10 Prozent grösser. Fehlt er, gilt die Stufe des Zoom-Tempos der Marke. */
  stufe: z.number().min(1.02).max(1.3).optional(),
  /** Kein Zoom ohne Begründung. */
  begruendung: z.string().min(5),
});
export type Zoom = z.infer<typeof Zoom>;

export const Storyboard = z.object({
  hook: z.string().min(1),
  overlays: z.array(Overlay),
  /** Wortindizes, die betont werden */
  betonung: z.array(z.number().int().min(0)).default([]),
  /** Zooms, nur auf betonten Wörtern. Einzeln geprüft: ein ungültiger Eintrag kippt das Storyboard nicht. */
  zooms: z.array(z.unknown()).default([]),
  notiz: z.string().default(""),
});
export type Storyboard = z.infer<typeof Storyboard>;
