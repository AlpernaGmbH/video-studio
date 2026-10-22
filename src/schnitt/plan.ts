import { z } from "zod";
import { RelPathSchema } from "../core/paths";
import { Slug } from "../core/schemas";
import { frameZeit, fpsBruch, inFrames, type Bruch } from "./raster";

/**
 * Schnittplan: Was ein Video ist, bevor es in Resolve (oder irgendwo sonst) zur Timeline wird. Reine Daten, kein Render.
 * Quelle der Wahrheit für `timeline.fcpxml`, `timeline.otio` und `untertitel.srt` (Editing-Blueprint, docs/plan/editing-blueprint.md).
 *
 * Alle Zeiten sind Sekunden. «Quellzeit» ist die Zeit in der Quelldatei, «Timeline-Zeit» die Zeit im fertigen Video.
 * Die Sprache liegt auf V1/A1 als Folge von Clips ohne Lücken (der «Spine»). B-Roll liegt auf V2, gerenderte Grafiken auf V3,
 * Musik auf A2. Alles, was nicht auf V1 liegt, hat eine Timeline-Zeit `t`.
 */

const KennId = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "Kleinbuchstaben, Ziffern und Bindestriche");

export const SchnittQuelle = z
  .object({
    id: KennId,
    /** Relativ zum Studio-Ordner, Rohmaterial und Renders relativ zum Medien-Ordner (siehe `loesePfad` in uebergabe.ts). */
    pfad: RelPathSchema,
    art: z.enum(["video", "audio"]),
    /** Länge der Datei in Sekunden. */
    dauer: z.number().positive(),
    /** Beginn-Timecode der Datei in Sekunden, nur wenn die Kamera einen schreibt. Sonst 0. */
    start: z.number().min(0).default(0),
    fps: z.number().positive().optional(),
    breite: z.number().int().positive().optional(),
    hoehe: z.number().int().positive().optional(),
    hatAudio: z.boolean().default(false),
    audioKanaele: z.number().int().min(1).max(8).default(2),
    audioRate: z.number().int().positive().default(48000),
    /**
     * Getrennter Ton (Plan v4): Der Ton dieser Videoquelle liegt in einer eigenen Audioquelle (externes Mikrofon, Recorder). Dann kommt die Sprache von dort,
     * die Kameraspur bleibt stumm. Versatz: Zeit in der Tonaufnahme = Zeit im Video + versatz (in Sekunden, `ton-sync.ts`).
     */
    ton: z.object({ quelle: KennId, versatz: z.number() }).optional(),
    /**
     * Farbart (Plan v4, 1.4): «log» ist flaches Material, das einen Look braucht, «rec709» normales. Fehlt die Angabe, wurde nicht gemessen und das Material gilt als normal.
     * Daraus wählen Vorschau und Übergabe die LUT.
     */
    farbe: z.enum(["log", "rec709"]).optional(),
    /**
     * Datenbereich der Videospur, wenn ein Mensch ihn festgelegt hat: «voll» (0 bis 1023) oder «begrenzt» (64 bis 940). Fehlt die Angabe, gilt das Etikett der Datei.
     * Bei V-Log verschiebt ein falscher Bereich Schwarz und Weiss; die Messung in `reel vorbereiten` nennt dazu den Code der dunkelsten Pixel.
     */
    bereich: z.enum(["voll", "begrenzt"]).optional(),
  })
  .superRefine((q, ctx) => {
    if (q.art === "video") {
      for (const f of ["fps", "breite", "hoehe"] as const) {
        if (q[f] === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [f], message: `Eine Videoquelle braucht «${f}» (ffprobe: studio schnitt sondiere)` });
      }
    }
    if (q.art === "audio" && !q.hatAudio) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["hatAudio"], message: "Eine Audioquelle hat Audio" });
    if (q.ton && q.art !== "video") ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["ton"], message: "Nur eine Videoquelle hat einen getrennten Ton" });
    if (q.farbe && q.art !== "video") ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["farbe"], message: "Nur eine Videoquelle hat eine Farbart" });
    if (q.bereich && q.art !== "video") ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["bereich"], message: "Nur eine Videoquelle hat einen Datenbereich" });
  });
export type SchnittQuelle = z.infer<typeof SchnittQuelle>;

/** Ein Stück Sprache auf V1/A1. Die Clips liegen in der Reihenfolge der Liste direkt hintereinander. */
export const SchnittClip = z
  .object({
    id: KennId,
    quelle: KennId,
    von: z.number().min(0),
    bis: z.number().positive(),
    /** Nummer der Skriptzeile, zu der dieser Take gehört (Bauplan v2, 3.3). */
    zeile: z.number().int().min(1).optional(),
    /** Digitaler Zoom, 1 = unverändert. Der Zoom-Punch (Bauplan v2, 3.4) setzt 1,1 bei jedem zweiten Schnitt. */
    zoom: z.number().min(1).max(2).default(1),
    notiz: z.string().default(""),
  })
  .refine((c) => c.bis > c.von, { message: "«bis» muss nach «von» liegen", path: ["bis"] });
export type SchnittClip = z.infer<typeof SchnittClip>;

/** B-Roll auf V2. Nur aus dem Katalog (Regel 3 des Repos), darum ist der Schlüssel Pflicht. */
export const SchnittBroll = z.object({
  quelle: KennId,
  katalog: z.string().regex(/^k-\d{4,}$/, "Katalog-Schlüssel wie k-0142"),
  t: z.number().min(0),
  dauer: z.number().positive(),
  /** Einstieg in die Quelldatei, Quellzeit. */
  von: z.number().min(0).default(0),
  begruendung: z.string().min(5),
});
export type SchnittBroll = z.infer<typeof SchnittBroll>;

/** Eine fertig gerenderte Grafik (MOV mit Alpha) auf V3. */
export const SchnittOverlay = z.object({
  /** Relativ zum Medien-Ordner, zum Beispiel renders/c-0007/lower-third.mov. */
  datei: RelPathSchema,
  effekt: z.string().min(1),
  t: z.number().min(0),
  dauer: z.number().positive(),
  begruendung: z.string().min(5),
});
export type SchnittOverlay = z.infer<typeof SchnittOverlay>;

export const SchnittMusik = z.object({
  quelle: KennId,
  /** Timeline-Zeit, ab der die Musik läuft. */
  t: z.number().min(0).default(0),
  /** Einstieg in die Quelldatei, Quellzeit. */
  von: z.number().min(0).default(0),
  /** Fehlt die Dauer, läuft die Musik bis zum Ende des Videos. */
  dauer: z.number().positive().optional(),
  /** Pegel der Musik relativ zur Quelle. Blueprint: −20 dB unter der Stimme. */
  pegelDb: z.number().max(0).default(-20),
});
export type SchnittMusik = z.infer<typeof SchnittMusik>;

/** Ein gesprochenes Wort in Quellzeit. Der Text stammt aus dem Skript, nur das Timing aus Whisper (Bauplan v2, Entscheidungsprotokoll). */
export const SchnittWort = z
  .object({
    text: z.string().min(1),
    quelle: KennId,
    von: z.number().min(0),
    bis: z.number().min(0),
    /** Betontes Wort aus dem Storyboard (Bauplan v2, Kap. 3.5). Die SRT trägt es nicht, `LIESMICH.md` nennt die Stellen. */
    betont: z.boolean().optional(),
  })
  .refine((w) => w.bis >= w.von, { message: "«bis» darf nicht vor «von» liegen", path: ["bis"] });
export type SchnittWort = z.infer<typeof SchnittWort>;

export const Schnittplan = z.object({
  version: z.literal(1),
  projekt: z.object({
    name: z.string().min(1),
    /** Inhalt-ID aus Notion, wenn der Schnitt zu einem Inhalt gehört. */
    inhalt: z.string().regex(/^c-\d{4}$/).optional(),
    marke: Slug,
    /** Bauplan v2: Projekt 25p, Export 1080×1920. */
    fps: z.number().positive().default(25),
    breite: z.number().int().positive().default(1080),
    hoehe: z.number().int().positive().default(1920),
  }),
  quellen: z.array(SchnittQuelle).min(1),
  clips: z.array(SchnittClip).min(1),
  broll: z.array(SchnittBroll).default([]),
  overlays: z.array(SchnittOverlay).default([]),
  musik: SchnittMusik.optional(),
  woerter: z.array(SchnittWort).default([]),
});
export type Schnittplan = z.infer<typeof Schnittplan>;

export class PlanFehler extends Error {}

/** Liest einen Schnittplan aus JSON. Fehler nennen den Pfad zur Stelle. */
export function leseSchnittplan(roh: unknown): Schnittplan {
  const p = Schnittplan.safeParse(roh);
  if (!p.success) throw new PlanFehler(`Schnittplan ungültig: ${p.error.issues.map((i) => `${i.path.join(".") || "(Wurzel)"}: ${i.message}`).join("; ")}`);
  return p.data;
}

/* ---------- Timeline berechnen ---------- */

export interface PlatzierterClip {
  clip: SchnittClip;
  quelle: SchnittQuelle;
  /** Erstes Frame des Clips in der Timeline (Projekt-fps). */
  startFrame: number;
  /** Länge in Frames der Timeline (Projekt-fps). */
  frames: number;
  /** Einstieg in die Quelldatei, als Zeit, auf das Frame-Raster der Quelle gelegt. */
  quellStart: Bruch;
}

export interface Zeitleiste {
  clips: PlatzierterClip[];
  gesamtFrames: number;
}

export const quelleNach = (plan: Schnittplan): Map<string, SchnittQuelle> => new Map(plan.quellen.map((q) => [q.id, q]));

/** Der getrennte Ton einer Videoquelle (Audioquelle und Versatz), wenn sie einen hat und die Audioquelle im Plan steht. Sonst `undefined`: Dann zählt die Tonspur der Kamera. */
export function externerTon(q: SchnittQuelle, quellen: ReadonlyMap<string, SchnittQuelle>): { audio: SchnittQuelle; versatz: number } | undefined {
  if (!q.ton) return undefined;
  const audio = quellen.get(q.ton.quelle);
  return audio && audio.art === "audio" ? { audio, versatz: q.ton.versatz } : undefined;
}

/**
 * Legt die Clips von V1 hintereinander und rundet jede Grenze auf ganze Frames der Timeline. Die Längen werden einzeln gerundet und
 * dann addiert: So bleibt jede Grenze ganzzahlig und es gibt keine Drift über das Video.
 */
export function platziere(plan: Schnittplan): Zeitleiste {
  const q = quelleNach(plan);
  const fps = plan.projekt.fps;
  fpsBruch(fps);
  const clips: PlatzierterClip[] = [];
  let frame = 0;
  for (const clip of plan.clips) {
    const quelle = q.get(clip.quelle);
    if (!quelle) throw new PlanFehler(`Clip «${clip.id}»: Quelle «${clip.quelle}» ist nicht definiert`);
    if (quelle.art !== "video" || quelle.fps === undefined) throw new PlanFehler(`Clip «${clip.id}»: Quelle «${clip.quelle}» ist keine Videoquelle`);
    const frames = Math.max(1, inFrames(clip.bis - clip.von, fps));
    clips.push({ clip, quelle, startFrame: frame, frames, quellStart: frameZeit(inFrames(clip.von, quelle.fps), quelle.fps) });
    frame += frames;
  }
  return { clips, gesamtFrames: frame };
}

export const sekunden = (frames: number, fps: number): number => (frames * fpsBruch(fps).d) / fpsBruch(fps).n;
