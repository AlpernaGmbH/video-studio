import { UntertitelPreset } from "../presets/schema";
import { leseTranskript } from "../schnitt/transkript";
import type { FolienErgebnis, Sichtung } from "./sichten";

/**
 * Stil-Studie aus einer gesichteten fremden Aufnahme (M12): Was sich **messen** lässt (Schnitte, Pausen, Lautheit, Sprechtempo), und eine Stelle für das, was nur
 * **jemand sehen** kann (Schrift, Lage und Animation der Untertitel). Die Messwerte stehen in `sichten.ts`; dieses Modul liest sie nur und rechnet nichts nach, was
 * die Messung nicht hergibt. Alles bleibt intern: fremder Beitrag, nie Material für Kunden. Ein Preset daraus ist ein Vorschlag mit Herkunft «unbelegt»;
 * ob es ins Repo und ins Markenprofil kommt, entscheidet ein Mensch (Gate 0).
 */

/** Harte Schnitte je Minute, in den Klassen der Messung an 22 Reels (docs/inspiration/editing.md). */
export function schnittKlasse(proMinute: number): string {
  if (proMinute <= 2) return "kaum harte Schnitte (0 bis 2 je Minute)";
  if (proMinute < 12) return "wenige harte Schnitte (3 bis 11 je Minute)";
  if (proMinute <= 25) return "viele harte Schnitte (12 bis 25 je Minute)";
  if (proMinute <= 50) return "sehr viele harte Schnitte (26 bis 50 je Minute)";
  return "Schnittgewitter (über 50 je Minute)";
}

const r1 = (n: number): number => Math.round(n * 10) / 10;
const komma = (n: number): string => String(r1(n)).replace(".", ",");

export interface StilMesswerte {
  dauer: number;
  /** Harte Schnitte (Szenenwechsel ab Schwelle 0,3). **Zählt keine Einblendungen, Masken oder Bewegungen im Bild.** */
  schnitte: number;
  schnitteProMinute: number;
  /** Mittlere Länge zwischen zwei harten Schnitten, in Sekunden. Fehlt, wenn es keinen gibt. */
  mittlereEinstellung?: number;
  lufs?: number;
  truePeak?: number;
  /** Pausen (Ton unter −40 dB, mindestens 0,5 s). Kürzere Pausen zählt die Messung nicht. */
  pausen?: { anzahl: number; sekunden: number; anteil: number };
  ohneTon?: boolean;
  /** Gesprochene Wörter je Minute, wenn ein Transkript mit Wörtern oder Segmenten da war. */
  woerterProMinute?: number;
}

export interface StilStudie {
  schema: 1;
  code: string;
  erstellt: string;
  hinweis: string;
  konto?: string;
  messwerte: StilMesswerte;
  einordnung: string[];
  /** Was die Messung nicht hergibt und ein Mensch auf den Bögen beurteilt. */
  nichtGemessen: string[];
  /** Das Urteil über die Untertitel, falls eines angegeben wurde (Urteil, nicht Messwert). */
  untertitel?: UntertitelPreset;
}

export const NICHT_GEMESSEN = [
  "Schriftgrösse, Lage, Animation und Hervorhebung der Untertitel: stehen auf den Bögen, nicht in den Messwerten",
  "Bewegung im Bild, Einblendungen, Masken und Übergänge: Die Schnittzahl zählt nur harte Schnitte",
  "Ob der Ton gut klingt: ich höre nichts, die Messwerte sagen nur Pegel und Pausen",
];

export const HINWEIS = "Fremder Beitrag, nur intern. Nie Material für Kunden. Messwerte sind gemessen, alles andere ist Urteil nach Ansicht der Bögen und hat die Herkunft «unbelegt».";

/** Gesprochene Wörter je Minute aus einem Transkript (Whisper-JSON). Unlesbares ergibt `undefined`, nie einen Fehler. */
export function woerterProMinuteAus(transkript: unknown, dauer: number): number | undefined {
  if (!(dauer > 0)) return undefined;
  try {
    const segmente = leseTranskript(transkript);
    const woerter = segmente.reduce((n, s) => n + (s.woerter?.length ?? s.text.split(/\s+/).filter(Boolean).length), 0);
    if (!woerter) return undefined;
    return r1((woerter / dauer) * 60);
  } catch {
    return undefined;
  }
}

/** Das erste Video einer Sichtung mit Messwerten. */
export function ersteVideofolie(s: Sichtung): FolienErgebnis | undefined {
  return s.folien.find((f) => f.art === "video" && f.dauer !== undefined && f.schnitte !== undefined);
}

export type StilErgebnis = { ok: true; studie: StilStudie } | { ok: false; grund: string };

/** Baut die Stil-Studie aus einer Sichtung und, wenn vorhanden, dem Transkript der Folie. */
export function bauStilStudie(s: Sichtung, opt: { transkript?: unknown; jetzt?: Date } = {}): StilErgebnis {
  const code = s.link.code;
  if (!code) return { ok: false, grund: "Die Sichtung hat keinen Kurzcode" };
  if (s.status !== "ok" && s.status !== "nur_text") return { ok: false, grund: `Die Sichtung ${code} hat den Status «${s.status}»${s.grund ? ` (${s.grund})` : ""}: Es gibt nichts zu messen` };
  const f = ersteVideofolie(s);
  if (!f || f.dauer === undefined || f.schnitte === undefined) return { ok: false, grund: `Die Sichtung ${code} hat kein Video mit Messwerten (ein Karussell aus Bildern hat keinen Schnitt, keinen Ton und keine Pausen)` };

  const dauer = f.dauer;
  const proMinute = f.schnitteProMinute ?? (dauer > 0 ? r1((f.schnitte / dauer) * 60) : 0);
  const messwerte: StilMesswerte = {
    dauer: r1(dauer),
    schnitte: f.schnitte,
    schnitteProMinute: proMinute,
    ...(f.schnitte > 0 ? { mittlereEinstellung: r1(dauer / (f.schnitte + 1)) } : {}),
    ...(f.lufs !== undefined ? { lufs: f.lufs } : {}),
    ...(f.truePeak !== undefined ? { truePeak: f.truePeak } : {}),
    ...(f.stillen ? { pausen: { anzahl: f.stillen.anzahl, sekunden: r1(f.stillen.sekunden), anteil: dauer > 0 ? Math.round((f.stillen.sekunden / dauer) * 1000) / 1000 : 0 } } : {}),
    ...(f.ohneTon ? { ohneTon: true } : {}),
  };
  const wpm = opt.transkript !== undefined ? woerterProMinuteAus(opt.transkript, dauer) : undefined;
  if (wpm !== undefined) messwerte.woerterProMinute = wpm;

  const einordnung = [`${komma(proMinute)} harte Schnitte je Minute: ${schnittKlasse(proMinute)}`];
  if (messwerte.mittlereEinstellung !== undefined) einordnung.push(`Mittlere Einstellung rund ${komma(messwerte.mittlereEinstellung)} s (Dauer geteilt durch Schnitte plus eins)`);
  else einordnung.push("Keine harten Schnitte: eine Einstellung (Einblendungen und Bewegung im Bild sind damit nicht ausgeschlossen)");
  if (messwerte.ohneTon) einordnung.push("Ohne Ton");
  else if (messwerte.pausen) einordnung.push(`${messwerte.pausen.anzahl} Pausen von mindestens 0,5 s, zusammen ${komma(messwerte.pausen.sekunden)} s (${Math.round(messwerte.pausen.anteil * 100)} Prozent der Dauer)`);
  if (wpm !== undefined) einordnung.push(`Sprechtempo rund ${komma(wpm)} Wörter je Minute (Zahl der erkannten Wörter durch die Dauer; Whisper irrt sich bei Dialekt und Musik)`);
  if (messwerte.truePeak !== undefined && messwerte.truePeak > 0) einordnung.push(`True Peak ${komma(messwerte.truePeak)} dBFS liegt über 0: nach der Kompression der Plattform nicht ungewöhnlich, sagt nichts über die Mischung der Autoren`);

  return {
    ok: true,
    studie: {
      schema: 1,
      code,
      erstellt: (opt.jetzt ?? new Date()).toISOString(),
      hinweis: HINWEIS,
      ...(s.konto ? { konto: s.konto } : {}),
      messwerte,
      einordnung,
      nichtGemessen: NICHT_GEMESSEN,
    },
  };
}

const JA = new Set(["ja", "true", "1", "an"]);
const NEIN = new Set(["nein", "false", "0", "aus"]);
const SCHLUESSEL = ["schrift", "groesse", "position", "animation", "hervorhebung", "grossschreibung", "kasten"] as const;

/** Kennung für die Datei eines Presets: aus dem Kurzcode, nur Kleinbuchstaben, Ziffern und Bindestriche. */
export function presetKennung(code: string): string {
  return `stil-${code.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
}

/**
 * Das Urteil über die Untertitel, als Liste `schrift=titel,groesse=48,position=unten,animation=pop,hervorhebung=akzent,grossschreibung=ja,kasten=nein`.
 * Alle sieben Angaben sind Pflicht: Was nicht beurteilt wurde, wird nicht geraten. Ein Fehler nennt jede fehlende oder ungültige Angabe.
 */
export function untertitelAusUrteil(spec: string, code: string): { ok: true; preset: UntertitelPreset } | { ok: false; fehler: string[] } {
  const werte = new Map<string, string>();
  for (const teil of spec.split(",").map((x) => x.trim()).filter(Boolean)) {
    const i = teil.indexOf("=");
    if (i < 1) return { ok: false, fehler: [`«${teil}» ist keine Angabe der Form schluessel=wert`] };
    werte.set(teil.slice(0, i).trim(), teil.slice(i + 1).trim());
  }
  const fehler: string[] = [];
  for (const k of werte.keys()) if (!(SCHLUESSEL as readonly string[]).includes(k)) fehler.push(`Unbekannte Angabe «${k}» (erlaubt: ${SCHLUESSEL.join(", ")})`);
  for (const k of SCHLUESSEL) if (!werte.has(k)) fehler.push(`Angabe «${k}» fehlt: Was nicht beurteilt wurde, wird nicht geraten`);
  if (fehler.length) return { ok: false, fehler };
  const bool = (k: string): boolean | undefined => {
    const v = werte.get(k)!.toLowerCase();
    return JA.has(v) ? true : NEIN.has(v) ? false : undefined;
  };
  const gross = bool("grossschreibung");
  const kasten = bool("kasten");
  if (gross === undefined) fehler.push("grossschreibung: ja oder nein");
  if (kasten === undefined) fehler.push("kasten: ja oder nein");
  const p = UntertitelPreset.safeParse({
    art: "untertitel",
    id: presetKennung(code),
    name: `Untertitel wie in ${code}`,
    beschreibung: `Aussehen der Untertitel in der Aufnahme ${code}, nach Ansicht der Bögen beurteilt. Urteil, nicht gemessen; nur intern.`,
    schriftRolle: werte.get("schrift"),
    groesse: Number(werte.get("groesse")),
    position: werte.get("position"),
    animation: werte.get("animation"),
    hervorhebung: werte.get("hervorhebung"),
    grossschreibung: gross,
    kasten,
    herkunft: { stand: "unbelegt", quelle: `Inspiration ${code}: Urteil nach Ansicht der Bögen, nicht gemessen` },
  });
  if (!p.success) fehler.push(...p.error.issues.map((i) => `${i.path.join(".") || "(Preset)"}: ${i.message}`));
  if (fehler.length || !p.success) return { ok: false, fehler };
  return { ok: true, preset: p.data };
}

/** Die Stil-Studie als Text zum Lesen. */
export function stilAlsMarkdown(s: StilStudie): string {
  const m = s.messwerte;
  const z: string[] = [];
  z.push(`# Stil-Studie ${s.code}${s.konto ? ` (@${s.konto})` : ""}`, "", `*${s.hinweis}*`, "");
  z.push("## Gemessen", "");
  z.push(`- Dauer ${komma(m.dauer)} s, ${m.schnitte} harte Schnitte (${komma(m.schnitteProMinute)} je Minute)`);
  if (m.mittlereEinstellung !== undefined) z.push(`- Mittlere Einstellung rund ${komma(m.mittlereEinstellung)} s`);
  if (m.lufs !== undefined) z.push(`- Lautheit ${komma(m.lufs)} LUFS${m.truePeak !== undefined ? `, True Peak ${komma(m.truePeak)} dBFS` : ""}`);
  if (m.pausen) z.push(`- Pausen (mindestens 0,5 s): ${m.pausen.anzahl}, zusammen ${komma(m.pausen.sekunden)} s`);
  if (m.woerterProMinute !== undefined) z.push(`- Sprechtempo rund ${komma(m.woerterProMinute)} Wörter je Minute`);
  if (m.ohneTon) z.push("- Ohne Ton");
  z.push("", "## Einordnung", "", ...s.einordnung.map((x) => `- ${x}`), "");
  z.push("## Nicht gemessen", "", ...s.nichtGemessen.map((x) => `- ${x}`), "");
  if (s.untertitel) {
    const u = s.untertitel;
    z.push("## Urteil über die Untertitel (nach Ansicht der Bögen)", "", `- Schrift: ${u.schriftRolle === "titel" ? "Titelschrift" : "Fliesstextschrift"}, Grösse ${u.groesse}, Lage ${u.position}, Animation ${u.animation}, Hervorhebung ${u.hervorhebung}, ${u.grossschreibung ? "Grossbuchstaben" : "normale Schreibung"}, ${u.kasten ? "mit Kasten" : "ohne Kasten"}`, `- Herkunft: ${u.herkunft.stand}, ${u.herkunft.quelle}`, "");
  } else z.push("## Urteil über die Untertitel", "", "Noch keines. Die Bögen ansehen und mit `--untertitel schrift=…,groesse=…,position=…,animation=…,hervorhebung=…,grossschreibung=…,kasten=…` angeben.", "");
  return z.join("\n");
}
