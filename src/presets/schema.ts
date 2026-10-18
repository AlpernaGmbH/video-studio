import { z } from "zod";
import { CaptionPreset, Slug } from "../core/schemas";

/**
 * Presets: benannte Voreinstellungen, damit nicht jedes Video neu erfindet, wo die Grafik sitzt, wie laut es ist oder was exportiert wird.
 * Vier Arten, je ein Ordner unter `presets/`: export, audio, untertitel, grafik.
 *
 * Ein Preset ist ein Vorschlag, kein Entscheid. Was zur Marke gehört (Untertitel-Aussehen, Logo, Schlusskarte), übernimmt ein Mensch
 * mit Gate 0 ins Markenprofil. Darum trägt jedes Preset seine Herkunft: woher der Wert kommt und wie belegt er ist.
 */

export const Herkunft = z.object({
  /**
   * entschieden: steht im Bauplan als Entscheid. annahme: Startwert, bis ein echtes Video etwas anderes zeigt.
   * unbelegt: Angabe aus einer fremden Quelle, nicht nachgeprüft.
   */
  stand: z.enum(["entschieden", "annahme", "unbelegt"]),
  quelle: z.string().min(5),
});
export type Herkunft = z.infer<typeof Herkunft>;

const Kopf = {
  id: Slug,
  name: z.string().min(2),
  beschreibung: z.string().min(10),
  herkunft: Herkunft,
};

/* ---------- Export ---------- */

const Bereich = z.object({ min: z.number().positive(), max: z.number().positive() }).refine((b) => b.max >= b.min, { message: "max darf nicht kleiner als min sein" });

export const ExportPreset = z.object({
  art: z.literal("export"),
  ...Kopf,
  breite: z.number().int().positive(),
  hoehe: z.number().int().positive(),
  fps: z.number().positive(),
  container: z.enum(["mp4", "mov"]),
  videoCodec: z.enum(["h264", "prores"]),
  /** Erlaubter Bereich der Video-Bitrate in Megabit pro Sekunde. Beim Kodieren gilt die Mitte als Ziel. */
  bitrateMbit: Bereich,
  bitrateModus: z.enum(["cbr", "vbr"]).default("vbr"),
  audioCodec: z.literal("aac"),
  /** Erlaubter Bereich der Audio-Bitrate in kbit/s. Beim Kodieren gilt der obere Wert. */
  audioKbit: Bereich,
  audioRate: z.number().int().positive(),
  farbe: z.literal("bt709"),
  minSekunden: z.number().positive().optional(),
  maxSekunden: z.number().positive().optional(),
  maxGigabyte: z.number().positive().optional(),
});
export type ExportPreset = z.infer<typeof ExportPreset>;

/* ---------- Audio ---------- */

export const AudioPreset = z.object({
  art: z.literal("audio"),
  ...Kopf,
  /** Ziel der integrierten Lautheit des fertigen Videos (Sprache und Musik zusammen), in LUFS. */
  zielLufs: z.number().max(0),
  /** Wie weit die gemessene Lautheit abweichen darf, in LU. */
  toleranzLu: z.number().positive().default(1),
  /** Höchster erlaubter True Peak in dBTP. */
  spitzeDbtp: z.number().max(0),
  /** Musik unter der Stimme, in dB relativ zur Quelle. Fehlt der Wert, ist Musik nicht vorgesehen. */
  musikPegelDb: z.number().max(0).optional(),
});
export type AudioPreset = z.infer<typeof AudioPreset>;

/* ---------- Untertitel ---------- */

export const UntertitelPreset = z.object({
  art: z.literal("untertitel"),
  ...Kopf,
  /** «titel» oder «fliesstext» steht für die Schrift der Marke. */
  schriftRolle: z.enum(["titel", "fliesstext"]),
  groesse: CaptionPreset.shape.groesse,
  position: CaptionPreset.shape.position,
  animation: CaptionPreset.shape.animation,
  hervorhebung: CaptionPreset.shape.hervorhebung,
  grossschreibung: CaptionPreset.shape.grossschreibung,
  kasten: CaptionPreset.shape.kasten,
});
export type UntertitelPreset = z.infer<typeof UntertitelPreset>;

/* ---------- Grafik ---------- */

export const ANKER = ["oben-links", "oben-mitte", "oben-rechts", "mitte-links", "mitte", "mitte-rechts", "unten-links", "unten-mitte", "unten-rechts"] as const;
export const GRAFIK_TYPEN = ["hook-karte", "lower-third", "keyword-pop", "schlusskarte", "logo", "zahl"] as const;

export const GrafikPreset = z
  .object({
    art: z.literal("grafik"),
    ...Kopf,
    typ: z.enum(GRAFIK_TYPEN),
    /** Motion-Stück, das dieses Preset zeichnet. Fehlt es, ist das Preset eine Vorgabe ohne Stück und steht in der Lückenliste. */
    stueck: Slug.optional(),
    anker: z.enum(ANKER),
    /** Breite der Grafik als Anteil der Breite innerhalb des Sicherheitsrands. */
    breiteAnteil: z.number().min(0.1).max(1),
    dauer: z.object({ min: z.number().positive(), standard: z.number().positive(), max: z.number().positive() }),
    einblendung: z.number().min(0),
    ausblendung: z.number().min(0),
    /** Grenzen je Textparameter des Stücks. */
    text: z.record(z.object({ maxZeichen: z.number().int().positive().optional(), maxWoerter: z.number().int().positive().optional() })).default({}),
    /** Voreinstellung für die Parameter des Stücks. Inhalte (Text, Zahl) stehen hier nie. */
    werte: z.record(z.unknown()).default({}),
    /** Mustertext für die Begründung im Storyboard. Kein Overlay ohne Begründung. */
    begruendung: z.string().min(5),
  })
  .superRefine((p, ctx) => {
    const d = p.dauer;
    if (!(d.min <= d.standard && d.standard <= d.max)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["dauer"], message: "min ≤ standard ≤ max erwartet" });
    if (p.einblendung + p.ausblendung > d.min) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["einblendung"], message: "Ein- und Ausblendung zusammen dürfen nicht länger sein als die kürzeste Dauer" });
  });
export type GrafikPreset = z.infer<typeof GrafikPreset>;

export const PRESET_ARTEN = ["export", "audio", "untertitel", "grafik"] as const;
export type PresetArt = (typeof PRESET_ARTEN)[number];

export const SCHEMAS = { export: ExportPreset, audio: AudioPreset, untertitel: UntertitelPreset, grafik: GrafikPreset } as const;
export type Preset = ExportPreset | AudioPreset | UntertitelPreset | GrafikPreset;
