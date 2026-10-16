import { z } from "zod";
import { Iso, Slug, type Markenprofil } from "../core/schemas";

/**
 * Stück-Vertrag (Motion-Bibliothek)
 * ----------------------------------
 * Ein Stück ist ein HyperFrames-Projektordner mit `piece.json` (Datenblatt, Bauplan Anhang A3, plus
 * Einsatzangaben) und `index.html` (die Komposition).
 *
 * Vertrag für `ausgabe: "overlay"` (Stand: gegen HyperFrames 0.8.164 geprüft):
 *   (Variablen, Dauer, Marke) → transparentes WebM (VP9 mit Alpha), 1080×1920, 25p, genau `dauer` Sekunden.
 * Der Vertrag ist engine-neutral: eine Remotion-Fassung (Plan B) muss dieselbe Datei liefern.
 *
 * Die Dauer ist in HyperFrames keine Root-Variable. Deshalb hat `index.html` kein `data-duration` am Root,
 * liest die Variable `dauer` und endet die Timeline bei `dauer`. So wird die Länge pro Einsatz bestimmt.
 */

export const SIGNAL_TYPEN = ["zahl", "anteil", "verlauf", "vergleich", "aufzaehlung", "prozess", "zeitraum", "frei"] as const;
export type SignalTyp = (typeof SIGNAL_TYPEN)[number];

export const VIDEOTYPEN = ["talking-head", "trendformat", "projektvideo", "erklaervideo"] as const;
export const STUECK_STATI = ["entwurf", "gebaut", "geprueft", "aktiv", "veraltet"] as const;
export type StueckStatus = (typeof STUECK_STATI)[number];

/** Ein Stück gilt für die Lückenanalyse als «vorhanden», sobald es mehr als ein Entwurf ist. */
export const VORHANDEN_AB: readonly StueckStatus[] = ["gebaut", "geprueft", "aktiv"];

/* ---------- Marken-Variablen ---------- */

export const MARKEN_VARIABLEN = {
  markeBg: { typ: "color", beschreibung: "Hintergrundfarbe der Marke", standard: "#FFFFFF" },
  markeText: { typ: "color", beschreibung: "Textfarbe der Marke", standard: "#0A0A0A" },
  markeAkzent1: { typ: "color", beschreibung: "Erste Akzentfarbe der Marke", standard: "#FFC629" },
  markeAkzent2: { typ: "color", beschreibung: "Zweite Akzentfarbe der Marke", standard: "#4B3FD6" },
  markeFontTitel: { typ: "font", beschreibung: "Schrift für Titel und Zahlen", standard: "Poppins" },
  markeFontText: { typ: "font", beschreibung: "Schrift für Fliesstext", standard: "Montserrat" },
  markeRadius: { typ: "number", beschreibung: "Eckenradius in Pixeln", standard: 24 },
  markeTempo: { typ: "number", beschreibung: "Bewegungstempo, 1 ist normal, grösser ist schneller", standard: 1 },
} as const;
export type MarkenKey = keyof typeof MARKEN_VARIABLEN;
const MARKEN_KEYS = Object.keys(MARKEN_VARIABLEN) as [MarkenKey, ...MarkenKey[]];

export type Variablen = Record<string, string | number | boolean>;

export function markeZuVariablen(m: Markenprofil): Variablen {
  return {
    markeBg: m.farben.hintergrund,
    markeText: m.farben.text,
    markeAkzent1: m.farben.akzent1,
    markeAkzent2: m.farben.akzent2,
    markeFontTitel: m.schriften.titel,
    markeFontText: m.schriften.fliesstext,
    markeRadius: m.effektStil.eckenradius,
    markeTempo: m.effektStil.bewegungstempo,
  };
}

/* ---------- Parameter ---------- */

const ParamId = z.string().regex(/^[a-z][A-Za-z0-9]*$/, "camelCase, beginnt mit Kleinbuchstaben");
const basis = {
  id: ParamId,
  label: z.string().min(1),
  /** Sagt, was der Platz bedeutet, nicht wo er sitzt (HyperFrames-Empfehlung, gilt auch für Claude als Leser). */
  beschreibung: z.string().min(5),
  pflicht: z.boolean().default(false),
  rolle: z.enum(["inhalt", "stil", "timing", "bewegung", "layout"]).default("inhalt"),
};

export const Param = z.discriminatedUnion("typ", [
  z.object({ ...basis, typ: z.literal("string"), default: z.string().optional(), maxLaenge: z.number().int().positive().optional() }),
  z.object({
    ...basis,
    typ: z.literal("number"),
    default: z.number().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    einheit: z.string().optional(),
  }),
  z.object({ ...basis, typ: z.literal("boolean"), default: z.boolean().optional() }),
  z.object({
    ...basis,
    typ: z.literal("enum"),
    optionen: z.array(z.object({ wert: z.string().min(1), label: z.string().min(1) })).min(2),
    default: z.string().optional(),
  }),
  z.object({ ...basis, typ: z.literal("color"), default: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() }),
  /** HyperFrames kennt keine Listen. Zahlenreihen laufen als JSON-Text, z. B. "[97,88,75,70,60]". */
  z.object({
    ...basis,
    typ: z.literal("zahlenreihe"),
    minAnzahl: z.number().int().min(1),
    maxAnzahl: z.number().int().min(1),
    min: z.number().optional(),
    max: z.number().optional(),
    default: z.array(z.number()).optional(),
  }),
  z.object({
    ...basis,
    typ: z.literal("textliste"),
    minAnzahl: z.number().int().min(1),
    maxAnzahl: z.number().int().min(1),
    maxLaenge: z.number().int().positive().optional(),
    default: z.array(z.string()).optional(),
  }),
]);
export type Param = z.infer<typeof Param>;

/* ---------- Stück ---------- */

const Beispiel = z.object({
  satz: z.string().min(5),
  variablen: z.record(z.unknown()),
});

export const Einsatz = z.object({
  /** Wann das Stück die richtige Wahl ist. */
  wann: z.array(z.string().min(5)).min(1),
  /** Wann nicht. Verhindert, dass das Stück überall landet. */
  wannNicht: z.array(z.string().min(5)).min(1),
  /** Mindestens ein Beispiel mit echtem Satz und passenden Werten. */
  beispiele: z.array(Beispiel).min(1),
  kombinierbarMit: z.array(Slug).default([]),
  hinweise: z.array(z.string()).default([]),
});
export type Einsatz = z.infer<typeof Einsatz>;

export const Stueck = z
  .object({
    schema: z.literal(1),
    id: Slug,
    name: z.string().min(2),
    version: z.string().regex(/^\d+\.\d+\.\d+$/, "Version wie 1.0.0"),
    status: z.enum(STUECK_STATI),
    welle: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal("wachstum")]),
    herkunft: z.object({ idee: z.string().regex(/^m-\d{3,}$/).optional(), notiz: z.string().optional() }).default({}),
    zweck: z.string().min(10),
    ausloeser: z.object({
      typen: z.array(z.enum(SIGNAL_TYPEN)).min(1),
      beschreibung: z.string().min(10),
    }),
    parameter: z.array(Param).default([]),
    dauer: z.object({ standard: z.number().positive(), min: z.number().positive(), max: z.number().positive() }),
    ausgabe: z.enum(["overlay", "komposition"]).default("overlay"),
    markenvariablen: z.array(z.enum(MARKEN_KEYS)).default([]),
    passtZu: z.array(z.enum(VIDEOTYPEN)).min(1),
    braucht: z.array(z.enum(["nichts", "freisteller", "broll", "foto", "logo", "basisvideo"])).min(1).default(["nichts"]),
    aufwand: z.enum(["klein", "mittel", "gross"]),
    /** Datenblatt-Feld «Abnahme»: Wie wir prüfen, dass er fertig ist. */
    abnahme: z.string().min(10),
    /** Inhalt muss im Sicherheitsrand bleiben (Instagram-Oberfläche), siehe render-pruefung.ts. */
    sicherheitsrand: z.boolean().default(true),
    engines: z.array(z.enum(["hyperframes", "remotion"])).min(1).default(["hyperframes"]),
    einsatz: Einsatz.optional(),
    freigabe: z.object({ wer: z.string().min(1), wann: Iso }).optional(),
  })
  .superRefine((s, ctx) => {
    const add = (path: (string | number)[], message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });

    if (!(s.dauer.min <= s.dauer.standard && s.dauer.standard <= s.dauer.max)) {
      add(["dauer"], "Es muss gelten: min ≤ standard ≤ max");
    }

    const ids = new Set<string>();
    s.parameter.forEach((p, i) => {
      if (ids.has(p.id)) add(["parameter", i, "id"], `Parameter «${p.id}» doppelt`);
      ids.add(p.id);
      if (p.id.startsWith("marke")) add(["parameter", i, "id"], "«marke…» ist für Marken-Variablen reserviert");
      if (p.id === "dauer") add(["parameter", i, "id"], "«dauer» ist reserviert und wird automatisch deklariert");
      const fehler = pruefeParamDefinition(p);
      if (fehler) add(["parameter", i], fehler);
    });

    // Ein Stück darf nur Signale versprechen, die es mit seinen Parametern auch zeigen kann.
    const hat = (typ: Param["typ"]) => s.parameter.some((p) => p.typ === typ);
    if (s.ausloeser.typen.includes("verlauf") && !hat("zahlenreihe")) {
      add(["ausloeser", "typen"], "«verlauf» braucht einen Parameter vom Typ zahlenreihe");
    }
    if (s.ausloeser.typen.includes("aufzaehlung") && !hat("textliste")) {
      add(["ausloeser", "typen"], "«aufzaehlung» braucht einen Parameter vom Typ textliste");
    }
    if ((s.ausloeser.typen.includes("zahl") || s.ausloeser.typen.includes("anteil")) && !hat("number") && !hat("zahlenreihe")) {
      add(["ausloeser", "typen"], "«zahl» und «anteil» brauchen einen Parameter vom Typ number oder zahlenreihe");
    }

    if (s.ausgabe === "komposition" && !s.braucht.includes("basisvideo")) {
      add(["braucht"], "Ein Stück mit ausgabe «komposition» braucht «basisvideo»");
    }
    if (s.ausgabe === "overlay" && s.braucht.includes("basisvideo")) {
      add(["braucht"], "Ein Overlay nimmt kein Basisvideo entgegen; dafür ist «komposition» da");
    }

    const ab = (st: StueckStatus) => STUECK_STATI.indexOf(s.status) >= STUECK_STATI.indexOf(st) && s.status !== "veraltet";
    if (ab("geprueft") && !s.einsatz) {
      add(["einsatz"], "Ab Status «geprueft» braucht jedes Stück Einsatzangaben (wann, wann nicht, Beispiele)");
    }
    if (s.status === "aktiv" && !s.freigabe) {
      add(["freigabe"], "Aktive Stücke brauchen eine Freigabe (wer, wann)");
    }
  });
export type Stueck = z.infer<typeof Stueck>;

/** Prüft, ob die Definition eines Parameters in sich stimmt (Default im erlaubten Bereich usw.). */
export function pruefeParamDefinition(p: Param): string | null {
  switch (p.typ) {
    case "string":
      if (p.default !== undefined && p.maxLaenge !== undefined && p.default.length > p.maxLaenge) return `Default von «${p.id}» ist länger als maxLaenge`;
      return null;
    case "number":
      if (p.min !== undefined && p.max !== undefined && p.min > p.max) return `«${p.id}»: min grösser als max`;
      if (p.default !== undefined) return pruefeWert(p, p.default);
      return null;
    case "enum": {
      const werte = p.optionen.map((o) => o.wert);
      if (new Set(werte).size !== werte.length) return `«${p.id}»: doppelte Optionen`;
      if (p.default !== undefined && !werte.includes(p.default)) return `Default von «${p.id}» steht nicht in den Optionen`;
      return null;
    }
    case "zahlenreihe":
    case "textliste":
      if (p.minAnzahl > p.maxAnzahl) return `«${p.id}»: minAnzahl grösser als maxAnzahl`;
      if (p.default !== undefined) return pruefeWert(p, p.default);
      return null;
    default:
      return null;
  }
}

/** Prüft einen konkreten Wert gegen die Definition. Gibt eine Fehlermeldung oder null zurück. */
export function pruefeWert(p: Param, wert: unknown): string | null {
  const label = `«${p.id}»`;
  switch (p.typ) {
    case "string":
      if (typeof wert !== "string") return `${label} erwartet Text`;
      if (p.maxLaenge !== undefined && wert.length > p.maxLaenge) return `${label} ist ${wert.length} Zeichen lang, erlaubt sind ${p.maxLaenge}`;
      return null;
    case "number":
      if (typeof wert !== "number" || !Number.isFinite(wert)) return `${label} erwartet eine Zahl`;
      if (p.min !== undefined && wert < p.min) return `${label} ist ${wert}, kleinster Wert ist ${p.min}`;
      if (p.max !== undefined && wert > p.max) return `${label} ist ${wert}, grösster Wert ist ${p.max}`;
      return null;
    case "boolean":
      return typeof wert === "boolean" ? null : `${label} erwartet wahr oder falsch`;
    case "enum":
      if (typeof wert !== "string" || !p.optionen.some((o) => o.wert === wert)) {
        return `${label} muss einer von ${p.optionen.map((o) => o.wert).join(", ")} sein`;
      }
      return null;
    case "color":
      return typeof wert === "string" && /^#[0-9a-fA-F]{6}$/.test(wert) ? null : `${label} erwartet eine Hex-Farbe wie #FFC629`;
    case "zahlenreihe": {
      if (!Array.isArray(wert) || !wert.every((v) => typeof v === "number" && Number.isFinite(v))) return `${label} erwartet eine Liste von Zahlen`;
      if (wert.length < p.minAnzahl || wert.length > p.maxAnzahl) return `${label} hat ${wert.length} Werte, erlaubt sind ${p.minAnzahl} bis ${p.maxAnzahl}`;
      if (p.min !== undefined && wert.some((v) => v < p.min!)) return `${label} enthält Werte unter ${p.min}`;
      if (p.max !== undefined && wert.some((v) => v > p.max!)) return `${label} enthält Werte über ${p.max}`;
      return null;
    }
    case "textliste": {
      if (!Array.isArray(wert) || !wert.every((v) => typeof v === "string" && v.length > 0)) return `${label} erwartet eine Liste von Texten`;
      if (wert.length < p.minAnzahl || wert.length > p.maxAnzahl) return `${label} hat ${wert.length} Einträge, erlaubt sind ${p.minAnzahl} bis ${p.maxAnzahl}`;
      if (p.maxLaenge !== undefined && wert.some((v) => (v as string).length > p.maxLaenge!)) return `${label} enthält Einträge über ${p.maxLaenge} Zeichen`;
      return null;
    }
  }
}

/* ---------- Variablen auflösen ---------- */

export type Aufloesung = { ok: true; variablen: Variablen; dauer: number } | { ok: false; fehler: string[] };

export interface AufloesungOptionen {
  dauer?: number;
  marke?: Markenprofil;
  /** Nur für Lint und Selbsttest: ohne Marke rendern, mit den Standardwerten der Komposition. */
  ohneMarke?: boolean;
}

/**
 * Macht aus Storyboard-Parametern die Variablen für `hyperframes render --variables ... --strict-variables`.
 * Unbekannte Schlüssel sind ein Fehler (wie bei `--strict-variables`), Zahlenreihen und Textlisten werden JSON-Text.
 */
export function loeseVariablen(stueck: Stueck, werte: Record<string, unknown>, opt: AufloesungOptionen = {}): Aufloesung {
  const fehler: string[] = [];
  const out: Variablen = {};

  for (const key of Object.keys(werte)) {
    if (key.startsWith("marke")) fehler.push(`«${key}» kommt aus dem Markenprofil und darf nicht im Storyboard stehen`);
    else if (key === "dauer") fehler.push("«dauer» steht im Overlay, nicht in params");
    else if (!stueck.parameter.some((p) => p.id === key)) fehler.push(`Unbekannter Parameter «${key}» für ${stueck.id}`);
  }

  for (const p of stueck.parameter) {
    const gegeben = werte[p.id];
    // Bei Pflichtparametern ist `default` nur der Vorschauwert für Check und Snapshot, nie ein stiller Ersatz.
    if (p.pflicht && gegeben === undefined) {
      fehler.push(`Pflichtparameter «${p.id}» fehlt`);
      continue;
    }
    const wert = gegeben !== undefined ? gegeben : p.default;
    if (wert === undefined) continue;
    const f = pruefeWert(p, wert);
    if (f) {
      fehler.push(f);
      continue;
    }
    out[p.id] = p.typ === "zahlenreihe" || p.typ === "textliste" ? JSON.stringify(wert) : (wert as string | number | boolean);
  }

  const dauer = opt.dauer ?? stueck.dauer.standard;
  if (dauer < stueck.dauer.min || dauer > stueck.dauer.max) {
    fehler.push(`Dauer ${dauer} s liegt ausserhalb von ${stueck.dauer.min} bis ${stueck.dauer.max} s`);
  }
  out.dauer = dauer;

  if (stueck.markenvariablen.length > 0) {
    if (opt.marke) {
      const marke = markeZuVariablen(opt.marke);
      for (const k of stueck.markenvariablen) out[k] = marke[k] as string | number;
    } else if (!opt.ohneMarke) {
      fehler.push("Markenprofil fehlt (Marken-Variablen ohne Marke rendern nur im Selbsttest)");
    }
  }

  return fehler.length > 0 ? { ok: false, fehler } : { ok: true, variablen: out, dauer };
}

/* ---------- Deklaration für HyperFrames ---------- */

export interface HfVariable {
  id: string;
  type: "string" | "number" | "color" | "boolean" | "enum" | "font";
  label: string;
  description: string;
  default?: string | number | boolean;
  options?: { value: string; label: string }[];
  role?: "content" | "style" | "timing" | "motion" | "layout";
}

const ROLLE: Record<Param["rolle"], NonNullable<HfVariable["role"]>> = {
  inhalt: "content",
  stil: "style",
  timing: "timing",
  bewegung: "motion",
  layout: "layout",
};

/** Die `data-composition-variables`-Deklaration, die `index.html` tragen muss. Quelle der Wahrheit ist piece.json. */
export function erzeugeDeklaration(stueck: Stueck): HfVariable[] {
  const vars: HfVariable[] = [
    {
      id: "dauer",
      type: "number",
      label: "Dauer",
      description: `Länge des Einsatzes in Sekunden (${stueck.dauer.min} bis ${stueck.dauer.max}). Die Timeline endet hier.`,
      default: stueck.dauer.standard,
      role: "timing",
    },
  ];
  for (const p of stueck.parameter) {
    const v: HfVariable = {
      id: p.id,
      type: "string",
      label: p.label,
      description: p.beschreibung,
      role: ROLLE[p.rolle],
    };
    switch (p.typ) {
      case "string":
      case "boolean":
      case "number":
      case "color":
        v.type = p.typ;
        if (p.default !== undefined) v.default = p.default;
        break;
      case "enum":
        v.type = "enum";
        v.options = p.optionen.map((o) => ({ value: o.wert, label: o.label }));
        if (p.default !== undefined) v.default = p.default;
        break;
      case "zahlenreihe":
        v.description += ` Als JSON-Liste, ${p.minAnzahl} bis ${p.maxAnzahl} Zahlen.`;
        if (p.default !== undefined) v.default = JSON.stringify(p.default);
        break;
      case "textliste":
        v.description += ` Als JSON-Liste, ${p.minAnzahl} bis ${p.maxAnzahl} Texte.`;
        if (p.default !== undefined) v.default = JSON.stringify(p.default);
        break;
    }
    vars.push(v);
  }
  for (const key of stueck.markenvariablen) {
    const m = MARKEN_VARIABLEN[key];
    vars.push({
      id: key,
      type: m.typ,
      label: key,
      description: m.beschreibung,
      default: m.standard,
      role: "style",
    });
  }
  return vars;
}
