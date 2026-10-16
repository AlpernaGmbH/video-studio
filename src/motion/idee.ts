import { z } from "zod";
import { Akteur, Iso, Slug } from "../core/schemas";
import { RelPathSchema } from "../core/paths";
import { Signal, ZAHLWOERTER } from "./signale";

/**
 * Eine Idee ist eine Lücke in der Motion-Bibliothek, mit dem genauen Satz, der sie ausgelöst hat,
 * und der Begründung, warum nichts Bestehendes passt. Sie durchläuft feste Stufen. Der Zustandsautomat
 * unten erzwingt die Regeln der Wachstumsschleife:
 *   - Claude pitcht, ein Mensch gibt frei oder lehnt ab (mit Grund).
 *   - Nach der Freigabe wird noch nichts gebaut: zuerst drei Looks als Standbilder, ein Mensch wählt.
 *   - Erst danach Bau, dann Selbstprüfung (höchstens zwei Korrekturrunden), dann Abnahme durch einen Menschen.
 *   - Höchstens zwei Stücke gleichzeitig im Bau, höchstens fünf offene Pitches (Aufmerksamkeit ist der Engpass).
 */

export const IDEE_STATI = ["idee", "pitch", "freigegeben", "looks", "look_gewaehlt", "in_bau", "render_geprueft", "in_bibliothek", "abgelehnt"] as const;
export type IdeeStatus = (typeof IDEE_STATI)[number];
export const END_STATI: readonly IdeeStatus[] = ["in_bibliothek", "abgelehnt"];

export const MAX_KORREKTURRUNDEN = 2;
export const WIP_LIMIT_STANDARD = 2;
export const MAX_OFFENE_PITCHES = 5;

/* ---------- Teile ---------- */

export const Quelle = z.discriminatedUnion("typ", [
  /** Aus einem aufgenommenen Video: der exakte Satz ist Pflicht. */
  z.object({
    typ: z.literal("video"),
    projekt: z.string().min(1),
    zeile: z.string().optional(),
    t: z.number().min(0).optional(),
    satz: z.string().min(3),
  }),
  /** Aus einem gespeicherten Inspirationsvideo. */
  z.object({
    typ: z.literal("inspiration"),
    titel: z.string().min(2),
    url: z.string().url().optional(),
    zeit: z.number().min(0).optional(),
    beobachtung: z.string().min(10),
  }),
  /** Direkter Auftrag eines Menschen. */
  z.object({ typ: z.literal("auftrag"), von: z.string().min(1), text: z.string().min(5) }),
]);
export type Quelle = z.infer<typeof Quelle>;

export const WarumNichtsPasst = z
  .object({
    zusammenfassung: z.string().min(10),
    geprueft: z.array(z.object({ stueck: Slug, grund: z.string().min(5) })),
    bibliothekGroesse: z.number().int().min(0),
    geprueftAm: Iso,
  })
  .superRefine((w, ctx) => {
    const soll = Math.min(3, w.bibliothekGroesse);
    if (w.geprueft.length < soll) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["geprueft"],
        message: `Bei ${w.bibliothekGroesse} Stücken in der Bibliothek müssen mindestens ${soll} einzeln begründet werden, es sind ${w.geprueft.length}`,
      });
    }
  });
export type WarumNichtsPasst = z.infer<typeof WarumNichtsPasst>;

export const Pitch = z.object({
  text: z.string().min(30),
  /** Was die Grafik zeigt. */
  zeigt: z.string().min(10),
  /** Was pro Einsatz variabel ist (Wörter, Zahlen, Reihen). */
  parameter: z.array(z.string().min(2)).min(1),
  /** Mindestens zwei weitere Einsätze ausser dem auslösenden. Verhindert Einwegstücke. */
  wiederverwendung: z.array(z.string().min(10)).min(2),
  aufwand: z.enum(["klein", "mittel", "gross"]),
  ausgabe: z.enum(["overlay", "komposition"]).default("overlay"),
});
export type Pitch = z.infer<typeof Pitch>;

export const LookId = z.enum(["a", "b", "c"]);
export const LookBrief = z.object({
  id: LookId,
  name: z.string().min(2),
  leitidee: z.string().min(15),
  typografie: z.string().min(5),
  farbeinsatz: z.string().min(5),
  bewegung: z.string().min(5),
});

export const Looks = z
  .object({
    runde: z.number().int().min(1),
    briefs: z.array(LookBrief).length(3),
    /** Standbilder, relativ zum Ideen-Ordner. Genau eines pro Look. */
    bilder: z.array(z.object({ id: LookId, pfad: RelPathSchema })).length(3),
    gewaehlt: LookId.optional(),
    notizen: z.array(z.string().min(1)).default([]),
  })
  .superRefine((l, ctx) => {
    const add = (message: string, path: (string | number)[] = []) => ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
    if (new Set(l.briefs.map((b) => b.id)).size !== 3) add("Die drei Looks müssen a, b und c heissen", ["briefs"]);
    if (new Set(l.bilder.map((b) => b.id)).size !== 3) add("Zu jedem Look gehört genau ein Standbild", ["bilder"]);
    const norm = (s: string) => s.trim().toLowerCase();
    if (new Set(l.briefs.map((b) => norm(b.name))).size !== 3) add("Die drei Looks brauchen verschiedene Namen", ["briefs"]);
    if (new Set(l.briefs.map((b) => norm(b.leitidee))).size !== 3) add("Die drei Looks brauchen verschiedene Leitideen: sonst ist es keine Wahl", ["briefs"]);
  });
export type Looks = z.infer<typeof Looks>;

export const BefundDaten = z.object({
  stufe: z.enum(["fehler", "warnung"]),
  code: z.string(),
  text: z.string(),
  stueck: z.string().optional(),
});

export const PruefRunde = z.object({
  runde: z.number().int().min(1),
  am: Iso,
  bestanden: z.boolean(),
  befunde: z.array(BefundDaten),
  /** Kurzfassung der Bildprüfung durch Claude (Standbilder angeschaut). */
  bildurteil: z.string().optional(),
});
export type PruefRunde = z.infer<typeof PruefRunde>;

export const Bau = z.object({
  stueck: Slug,
  /** Wie oft das Stück gebaut oder überarbeitet wurde. */
  versuche: z.number().int().min(1),
  notizen: z.array(z.string().min(1)).default([]),
  pruefungen: z.array(PruefRunde).default([]),
});
export type Bau = z.infer<typeof Bau>;

const Entscheidung = z.object({
  art: z.enum(["freigegeben", "abgelehnt"]),
  wer: z.string().min(1),
  wann: Iso,
  grund: z.string().optional(),
});

const Verlaufseintrag = z.object({
  von: z.enum(IDEE_STATI).nullable(),
  nach: z.enum(IDEE_STATI),
  wer: Akteur,
  wann: Iso,
  grund: z.string().optional(),
});

const STATI_AB = (ab: IdeeStatus) => IDEE_STATI.indexOf(ab);

export const Idee = z
  .object({
    id: z.string().regex(/^m-\d{3,}$/, "ID wie m-001"),
    status: z.enum(IDEE_STATI),
    titel: z.string().min(3),
    beschreibung: z.string().min(15),
    quelle: Quelle,
    signale: z.array(Signal).default([]),
    warumNichtsPasst: WarumNichtsPasst,
    pitch: Pitch.optional(),
    entscheidung: Entscheidung.optional(),
    looks: Looks.optional(),
    bau: Bau.optional(),
    abnahme: z.object({ wer: z.string().min(1), wann: Iso }).optional(),
    verlauf: z.array(Verlaufseintrag).min(1),
    erstelltAm: Iso,
  })
  .superRefine((i, ctx) => {
    const add = (message: string, path: (string | number)[]) => ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
    const s = STATI_AB(i.status);
    const nichtAbgelehnt = i.status !== "abgelehnt";
    if (nichtAbgelehnt && s >= STATI_AB("pitch") && !i.pitch) add(`Status «${i.status}» braucht einen Pitch`, ["pitch"]);
    if (nichtAbgelehnt && s >= STATI_AB("freigegeben") && i.entscheidung?.art !== "freigegeben") add(`Status «${i.status}» braucht eine Freigabe`, ["entscheidung"]);
    if (nichtAbgelehnt && s >= STATI_AB("looks") && !i.looks) add(`Status «${i.status}» braucht Looks`, ["looks"]);
    if (nichtAbgelehnt && s >= STATI_AB("look_gewaehlt") && !i.looks?.gewaehlt) add(`Status «${i.status}» braucht einen gewählten Look`, ["looks", "gewaehlt"]);
    if (nichtAbgelehnt && s >= STATI_AB("in_bau") && !i.bau) add(`Status «${i.status}» braucht Bau-Angaben`, ["bau"]);
    if (i.status === "in_bibliothek" && !i.abnahme) add("Status «in_bibliothek» braucht eine Abnahme (wer, wann)", ["abnahme"]);
    if (i.status === "abgelehnt" && !(i.entscheidung?.art === "abgelehnt" && i.entscheidung.grund)) add("Eine abgelehnte Idee braucht einen Grund", ["entscheidung"]);
    if (i.verlauf[i.verlauf.length - 1]?.nach !== i.status) add("Der letzte Verlaufseintrag passt nicht zum Status", ["verlauf"]);
  });
export type Idee = z.infer<typeof Idee>;

/* ---------- Anlegen ---------- */

export type IdeeEntwurf = Pick<Idee, "titel" | "beschreibung" | "quelle" | "warumNichtsPasst"> & { signale?: Idee["signale"] };

export function neueIdee(entwurf: IdeeEntwurf, id: string, akteur: Akteur, jetzt: string): Idee {
  return Idee.parse({
    id,
    status: "idee",
    titel: entwurf.titel,
    beschreibung: entwurf.beschreibung,
    quelle: entwurf.quelle,
    signale: entwurf.signale ?? [],
    warumNichtsPasst: entwurf.warumNichtsPasst,
    verlauf: [{ von: null, nach: "idee", wer: akteur, wann: jetzt }],
    erstelltAm: jetzt,
  });
}

/* ---------- Übergänge ---------- */

const ERLAUBT: Record<IdeeStatus, readonly IdeeStatus[]> = {
  idee: ["pitch", "abgelehnt"],
  pitch: ["freigegeben", "abgelehnt"],
  freigegeben: ["looks", "abgelehnt"],
  looks: ["look_gewaehlt", "freigegeben", "abgelehnt"],
  look_gewaehlt: ["in_bau", "abgelehnt"],
  in_bau: ["render_geprueft", "abgelehnt"],
  render_geprueft: ["in_bibliothek", "in_bau", "abgelehnt"],
  in_bibliothek: [],
  abgelehnt: [],
};

/** Übergänge, die nur ein Mensch auslösen darf (Freigaben, Wahlen, Abnahme, Ablehnung nach dem Pitch). */
function nurMensch(von: IdeeStatus, nach: IdeeStatus): boolean {
  if (nach === "abgelehnt") return von !== "idee";
  return (
    (von === "pitch" && nach === "freigegeben") ||
    (von === "looks" && (nach === "look_gewaehlt" || nach === "freigegeben")) ||
    (von === "render_geprueft" && (nach === "in_bibliothek" || nach === "in_bau"))
  );
}

const SYSTEMNAMEN = /^(claude|system|ki|ai|bot|assistant|assistent|pipeline)$/i;

/**
 * Ein Namenstest ist keine Authentifizierung. Er verhindert nur den Flüchtigkeitsfehler, dass Claude sich
 * selbst als Mensch einträgt. Echten Schutz bieten erst die Rechte im Prüfplatz oder in Notion.
 */
export function istMensch(a: Akteur): boolean {
  return a.typ === "mensch" && !SYSTEMNAMEN.test(a.name.trim());
}

export interface WeiterDaten {
  pitch?: Pitch;
  looks?: Looks;
  gewaehlt?: z.infer<typeof LookId>;
  stueck?: string;
  notizen?: string[];
}

export interface WeiterKontext {
  akteur: Akteur;
  jetzt: string;
  grund?: string;
  daten?: WeiterDaten;
  /** Anzahl Ideen, die gerade «in_bau» sind (ohne diese). */
  imBau?: number;
  wipLimit?: number;
  /** Anzahl Ideen, die gerade im Status «pitch» sind (ohne diese). */
  offenePitches?: number;
  maxOffenePitches?: number;
  /** Vom Aufrufer geprüft: Das Stück existiert, ist gültig und konnte aktiviert werden. */
  stueckAktiviert?: boolean;
}

export type WeiterErgebnis = { ok: true; idee: Idee } | { ok: false; fehler: string[] };

export function weiter(idee: Idee, nach: IdeeStatus, ctx: WeiterKontext): WeiterErgebnis {
  const fehler: string[] = [];
  const von = idee.status;

  if (!ERLAUBT[von].includes(nach)) {
    return { ok: false, fehler: [`Übergang «${von}» → «${nach}» ist nicht vorgesehen. Erlaubt von «${von}»: ${ERLAUBT[von].join(", ") || "nichts (Endstatus)"}`] };
  }
  if (nurMensch(von, nach) && !istMensch(ctx.akteur)) {
    fehler.push(`«${von}» → «${nach}» darf nur ein Mensch auslösen (Akteur: ${ctx.akteur.typ} «${ctx.akteur.name}»)`);
  }

  const grund = ctx.grund?.trim();
  const d = ctx.daten ?? {};
  const kopie: Idee = structuredClone(idee);
  kopie.status = nach;

  switch (`${von}>${nach}`) {
    case "idee>pitch": {
      const p = Pitch.safeParse(d.pitch);
      if (!p.success) fehler.push(...p.error.issues.map((i) => `Pitch: ${i.path.join(".")}: ${i.message}`));
      else kopie.pitch = p.data;
      const grenze = ctx.maxOffenePitches ?? MAX_OFFENE_PITCHES;
      if ((ctx.offenePitches ?? 0) >= grenze) fehler.push(`${grenze} Pitches liegen schon zur Entscheidung vor. Erst entscheiden, dann neu pitchen`);
      break;
    }
    case "pitch>freigegeben":
      kopie.entscheidung = { art: "freigegeben", wer: ctx.akteur.name, wann: ctx.jetzt, grund };
      break;
    case "freigegeben>looks": {
      const l = Looks.safeParse(d.looks);
      if (!l.success) fehler.push(...l.error.issues.map((i) => `Looks: ${i.path.join(".")}: ${i.message}`));
      else {
        const vorher = idee.looks?.runde ?? 0;
        if (l.data.runde !== vorher + 1) fehler.push(`Looks: Runde muss ${vorher + 1} sein, ist ${l.data.runde}`);
        if (l.data.gewaehlt) fehler.push("Looks: Ein Look darf noch nicht gewählt sein");
        kopie.looks = { ...l.data, notizen: [...(idee.looks?.notizen ?? []), ...l.data.notizen] };
      }
      break;
    }
    case "looks>look_gewaehlt": {
      if (!d.gewaehlt) fehler.push("Es fehlt die Wahl: a, b oder c");
      else if (kopie.looks) kopie.looks.gewaehlt = d.gewaehlt;
      if (kopie.looks && d.notizen?.length) kopie.looks.notizen = [...kopie.looks.notizen, ...d.notizen];
      break;
    }
    case "looks>freigegeben":
      if (!grund) fehler.push("Kein Look passt: Ein Grund ist Pflicht, damit die nächste Runde etwas ändern kann");
      else if (kopie.looks) kopie.looks.notizen = [...kopie.looks.notizen, `Runde ${kopie.looks.runde} verworfen: ${grund}`];
      break;
    case "look_gewaehlt>in_bau": {
      const limit = ctx.wipLimit ?? WIP_LIMIT_STANDARD;
      if ((ctx.imBau ?? 0) >= limit) fehler.push(`${limit} Stücke sind schon im Bau. Erst eines abschliessen (zu viele halbfertige Stücke sind ein Risiko des Bauplans)`);
      if (!d.stueck) fehler.push("Es fehlt der Schlüssel des Stücks, das gebaut wird");
      else {
        const s = Slug.safeParse(d.stueck);
        if (!s.success) fehler.push(`Stück-Schlüssel «${d.stueck}» ist ungültig`);
        else kopie.bau = { stueck: s.data, versuche: 1, notizen: [...(d.notizen ?? [])], pruefungen: [] };
      }
      break;
    }
    case "in_bau>render_geprueft": {
      const letzte = idee.bau?.pruefungen.at(-1);
      if (!letzte) fehler.push("Es gibt noch keine Selbstprüfung des Renders");
      else if (!letzte.bestanden) fehler.push("Die letzte Selbstprüfung ist nicht bestanden");
      break;
    }
    case "render_geprueft>in_bau":
      if (!grund && !d.notizen?.length) fehler.push("Änderungswunsch ohne Notiz: Es muss stehen, was anders sein soll");
      if (kopie.bau) {
        kopie.bau = { ...kopie.bau, versuche: kopie.bau.versuche + 1, notizen: [...kopie.bau.notizen, ...(d.notizen ?? []), ...(grund ? [grund] : [])], pruefungen: [] };
      }
      {
        const limit = ctx.wipLimit ?? WIP_LIMIT_STANDARD;
        if ((ctx.imBau ?? 0) >= limit) fehler.push(`${limit} Stücke sind schon im Bau`);
      }
      break;
    case "render_geprueft>in_bibliothek":
      if (!ctx.stueckAktiviert) fehler.push("Das Stück ist nicht aktiviert (Datenblatt, Einsatzangaben und Lint müssen stimmen)");
      kopie.abnahme = { wer: ctx.akteur.name, wann: ctx.jetzt };
      break;
    default:
      if (nach === "abgelehnt") {
        if (!grund || grund.length < 10 || grund.split(/\s+/).length < 2) {
          fehler.push("Eine Ablehnung braucht einen Grund aus mindestens zwei Wörtern (zehn Zeichen). Er verhindert, dass dieselbe Idee wiederkommt");
        }
        else kopie.entscheidung = { art: "abgelehnt", wer: ctx.akteur.name, wann: ctx.jetzt, grund };
      }
  }

  if (fehler.length > 0) return { ok: false, fehler };

  kopie.verlauf = [...kopie.verlauf, { von, nach, wer: ctx.akteur, wann: ctx.jetzt, grund }];
  const geprueft = Idee.safeParse(kopie);
  if (!geprueft.success) return { ok: false, fehler: geprueft.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  return { ok: true, idee: geprueft.data };
}

/* ---------- Selbstprüfung erfassen ---------- */

export type PruefungErfasst =
  | { ok: true; idee: Idee; bestanden: boolean; naechsteKorrekturErlaubt: boolean }
  | { ok: false; fehler: string[] };

/**
 * Trägt das Ergebnis einer Selbstprüfung ein. Die Idee bleibt «in_bau». Bei Bestehen folgt `weiter(..., "render_geprueft")`.
 * Nach `MAX_KORREKTURRUNDEN` Korrekturen ist Schluss: Dann entscheidet ein Mensch.
 */
export function pruefungErfassen(idee: Idee, runde: Omit<PruefRunde, "runde">): PruefungErfasst {
  if (idee.status !== "in_bau" || !idee.bau) return { ok: false, fehler: [`Selbstprüfung nur im Status «in_bau», nicht «${idee.status}»`] };
  // Erlaubt sind die erste Prüfung und höchstens MAX_KORREKTURRUNDEN Wiederholungen nach einer Korrektur.
  const bisher = idee.bau.pruefungen.length;
  if (bisher >= 1 + MAX_KORREKTURRUNDEN) {
    return { ok: false, fehler: [`Nach ${MAX_KORREKTURRUNDEN} Korrekturrunden ist Schluss: Ein Mensch entscheidet, wie es weitergeht`] };
  }
  const neu = PruefRunde.safeParse({ ...runde, runde: bisher + 1 });
  if (!neu.success) return { ok: false, fehler: neu.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  const kopie = structuredClone(idee);
  kopie.bau!.pruefungen.push(neu.data);
  const geprueft = Idee.parse(kopie);
  // Prüfung 1 durchgefallen → Korrektur 1 erlaubt; Prüfung 2 durchgefallen → Korrektur 2 erlaubt; Prüfung 3 durchgefallen → Schluss.
  return { ok: true, idee: geprueft, bestanden: neu.data.bestanden, naechsteKorrekturErlaubt: !neu.data.bestanden && neu.data.runde <= MAX_KORREKTURRUNDEN };
}

/* ---------- Ähnlichkeit (gegen Wiederholung) ---------- */

const STOPWOERTER = new Set(["der", "die", "das", "und", "oder", "ein", "eine", "einen", "ist", "sind", "war", "wird", "wurde", "zu", "von", "auf", "in", "im", "an", "am", "mit", "für", "dass", "es", "sie", "er", "wir", "ich", "du", "dein", "deine", "nicht", "auch", "aber", "wenn", "dann", "so", "als", "wie", "bei", "nach", "über", "um", "den", "dem", "des"]);

/** Normalisierte Wortmenge. Zahlen und Zahlwörter werden zu «#», damit «über fünf Scans von 97 auf 60» und «über vier Scans von 80 auf 45» als gleiche Art gelten. */
export function wortmenge(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/\d+(?:[.,'’]\d+)*/g, "#")
      .split(/[^a-zäöüß#]+/)
      .map((w) => (ZAHLWOERTER.has(w) ? "#" : w))
      .filter((w) => w === "#" || (w.length > 1 && !STOPWOERTER.has(w))),
  );
}

export function aehnlichkeit(a: string, b: string): number {
  const x = wortmenge(a);
  const y = wortmenge(b);
  if (x.size === 0 || y.size === 0) return 0;
  let gemeinsam = 0;
  for (const w of x) if (y.has(w)) gemeinsam++;
  return gemeinsam / (x.size + y.size - gemeinsam);
}

export function ausloesenderText(q: Quelle): string {
  switch (q.typ) {
    case "video": return q.satz;
    case "inspiration": return q.beobachtung;
    case "auftrag": return q.text;
  }
}
