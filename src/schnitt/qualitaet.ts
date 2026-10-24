import type { Schnittprofil } from "../core/schemas";
import { pruefeAudio, pruefeExport, type Messung } from "../presets/export";
import type { AudioPreset, ExportPreset } from "../presets/schema";
import { lauf, messeDatei } from "../presets/messen";
import { FLACH_SAETTIGUNG, FLACH_SPANNE, messeBilder } from "./farbe";
import { platziere, sekunden, type Schnittplan } from "./plan";
import { findeStille, type Stille } from "./stille";
import { TIEFENANTEIL_MAX } from "./klang";
import { woerterAufTimeline } from "./untertitel";

/**
 * Qualität eines fertigen Videos messen (Plan v4, 1.6): Was der Mensch beim Ansehen als «billig» oder «hochwertig» spürt, soweit es sich zählen lässt.
 * Gemessen wird die Datei, nicht der Plan: Dauer, Bitrate, Schnitte je Minute, Sättigung, Kontrast, Lautheit, Spitze, Stille und die Zeit bis zur ersten Aussage.
 * Mit dem Schnittplan kommen genaue Zahlen für Zooms und Anteil von Grafiken und B-Roll dazu. Das Urteil «hochwertig» fällt ein Mensch; die Messung zeigt, wo er hinschauen soll.
 */

export interface Qualitaet {
  datei: string;
  gemessen: string;
  /** Die volle Messung der Datei (ffprobe, Lautheit), Grundlage der Prüfung gegen Export- und Audio-Preset. */
  messung: Messung;
  dauer: number;
  breite: number;
  hoehe: number;
  fps: number;
  videoMbit?: number;
  lufs?: number;
  truePeak?: number;
  /** Anteil der Energie unter 200 Hz am ganzen Ton (0 bis 1), wenn die Messung gelang (M8). */
  tiefenanteil?: number;
  schnitte: { anzahl: number; proMinute: number; quelle: "plan" | "bild" };
  /** Wenn ein Plan gegeben war und nicht zur Datei passte (die Länge weicht um mehr als eine halbe Sekunde ab, zum Beispiel weil in Resolve geschnitten wurde): warum er nicht benutzt wurde. */
  planHinweis?: string;
  /** Nur mit Plan. */
  zooms?: { anzahl: number; proMinute: number };
  /** Nur mit Plan: Anteil der Zeit mit Grafik oder B-Roll im Bild (0 bis 1). */
  grafikAnteil?: number;
  brollAnteil?: number;
  farbe: { saettigung: number; yLow: number; yHigh: number; spanne: number };
  stille: { anteil: number; laengste: number };
  /** Sekunden bis zum ersten gesprochenen Wort (Plan) oder bis zum Ende der ersten Stille am Anfang. */
  ersteAussage: { sekunden: number; quelle: "plan" | "ton" };
}

export interface QualitaetsBefund {
  stufe: "hinweis";
  code: string;
  text: string;
}

const f1 = (n: number): string => n.toFixed(1).replace(".", ",");
const f2 = (n: number): string => n.toFixed(2).replace(".", ",");

/** Liest «RMS level dB» des Abschnitts «Overall» aus der Ausgabe von ffmpeg `astats`. */
export function rmsAusAstats(stderr: string): number | undefined {
  const teil = stderr.slice(stderr.lastIndexOf("Overall"));
  const m = /RMS level dB:\s+(-?\d+(?:\.\d+)?|-inf)/.exec(teil);
  if (!m || m[1] === "-inf") return undefined;
  return Number(m[1]);
}

/** Aus dem Pegel des ganzen Tons und des Tons unter 200 Hz der Anteil der Energie unter 200 Hz (Energie = Quadrat des Pegels, daher /10 statt /20). */
export function tiefenanteilAusPegeln(vollDb: number, tiefDb: number): number {
  return Math.min(1, Math.pow(10, (tiefDb - vollDb) / 10));
}

/** Misst den Anteil der Energie unter 200 Hz im Ton einer Datei (M8). Gibt `undefined`, wenn sich nichts messen lässt (kein Ton, Stille, kein ffmpeg). */
export async function messeTiefenanteil(datei: string): Promise<number | undefined> {
  try {
    const messe = async (filter: string): Promise<number | undefined> => rmsAusAstats((await lauf("ffmpeg", ["-nostats", "-hide_banner", "-i", datei, "-vn", "-af", filter, "-f", "null", "-"])).stderr);
    const voll = await messe("astats=metadata=0");
    const tief = await messe("lowpass=f=200,astats=metadata=0");
    return voll === undefined || tief === undefined ? undefined : tiefenanteilAusPegeln(voll, tief);
  } catch {
    return undefined;
  }
}

/** Zählt die Szenenwechsel aus der Ausgabe von `select='gt(scene,x)',metadata=print`. */
export function zaehleSzenenwechsel(text: string): number {
  return [...text.matchAll(/lavfi\.scene_score=\d/g)].length;
}

/** Szenenwechsel eines Videos (Bildänderung über der Schwelle, Standard 0,3). Ein Wechsel am allerersten Bild zählt nicht. */
export async function messeSchnitte(datei: string, schwelle = 0.3): Promise<number> {
  const r = await lauf("ffmpeg", ["-v", "error", "-i", datei, "-an", "-vf", `select='gt(scene,${schwelle})',metadata=print:file=-`, "-f", "null", "-"]);
  if (r.code !== 0) throw new Error(`ffmpeg schlug bei der Schnitt-Zählung fehl: ${r.stderr.trim().split("\n").pop()}`);
  return zaehleSzenenwechsel(r.stdout);
}

/** Aus Plan: Schnitte (Sprünge zwischen Clips, die nicht nahtlos weiterlaufen), Zooms und Anteile von Grafik und B-Roll. */
export function kennzahlenAusPlan(plan: Schnittplan): { schnitte: number; zooms: number; dauer: number; grafikAnteil: number; brollAnteil: number; ersteAussage?: number } {
  const zeit = platziere(plan);
  const dauer = sekunden(zeit.gesamtFrames, plan.projekt.fps);
  let schnitte = 0;
  let zooms = 0;
  let vorher: (typeof zeit.clips)[number] | undefined;
  for (const c of zeit.clips) {
    const weiter = vorher && vorher.clip.quelle === c.clip.quelle && Math.abs(c.clip.von - vorher.clip.bis) < 1e-3;
    if (vorher && !weiter) schnitte++;
    if (c.clip.zoom > 1) zooms++;
    vorher = c;
  }
  // Anteil der Zeit, in der mindestens eine Grafik oder B-Roll läuft (Überlappungen zählen einmal)
  const anteil = (liste: { t: number; dauer: number }[]): number => {
    const iv = liste.map((x) => [Math.max(0, x.t), Math.min(dauer, x.t + x.dauer)] as const).filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
    let summe = 0;
    let ende = 0;
    for (const [a, b] of iv) {
      const von = Math.max(a, ende);
      if (b > von) summe += b - von;
      ende = Math.max(ende, b);
    }
    return dauer > 0 ? summe / dauer : 0;
  };
  const woerter = woerterAufTimeline(plan, zeit);
  return { schnitte, zooms, dauer, grafikAnteil: anteil(plan.overlays), brollAnteil: anteil(plan.broll), ...(woerter.length ? { ersteAussage: woerter[0]!.von } : {}) };
}

/** Anteil der Stille und längste Pause aus einer Liste von Stillen. */
export function stilleKennzahlen(stille: Stille[], dauer: number): { anteil: number; laengste: number; anfang: number } {
  let summe = 0;
  let laengste = 0;
  let anfang = 0;
  for (const s of stille) {
    const bis = Math.min(dauer, s.bis);
    const l = Math.max(0, bis - s.von);
    summe += l;
    laengste = Math.max(laengste, l);
    if (s.von < 0.05) anfang = bis;
  }
  return { anteil: dauer > 0 ? summe / dauer : 0, laengste, anfang };
}

export interface MessEingabe {
  datei: string;
  plan?: Schnittplan;
  /** Ersetzbar für Tests. */
  messeDatei?: typeof messeDatei;
  messeSchnitte?: typeof messeSchnitte;
  messeBilder?: typeof messeBilder;
  findeStille?: typeof findeStille;
  messeTiefen?: typeof messeTiefenanteil;
  jetzt?: () => Date;
}

export async function messeQualitaet(e: MessEingabe): Promise<Qualitaet> {
  const m: Messung = await (e.messeDatei ?? messeDatei)(e.datei);
  const dauer = m.dauer;
  const minuten = Math.max(dauer / 60, 1e-9);
  let plan = e.plan ? kennzahlenAusPlan(e.plan) : undefined;
  let planHinweis: string | undefined;
  if (plan && Math.abs(plan.dauer - dauer) > 0.5) {
    planHinweis = `Der Plan (${f1(plan.dauer)} s) passt nicht zum Video (${f1(dauer)} s): Es wurde nach dem Plan geschnitten. Die Zahlen stammen aus dem Bild und dem Ton, nicht aus dem Plan`;
    plan = undefined;
  }
  const schnitteAnzahl = plan ? plan.schnitte : await (e.messeSchnitte ?? messeSchnitte)(e.datei);
  const farbe = await (e.messeBilder ?? messeBilder)(e.datei, dauer, 8);
  if (!farbe) throw new Error("Aus dem Video liessen sich keine Bilder lesen");
  const stille = m.audioCodec ? stilleKennzahlen(await (e.findeStille ?? findeStille)(e.datei, { mindestdauer: 0.3, dauer }), dauer) : { anteil: 1, laengste: dauer, anfang: dauer };
  const tiefen = m.audioCodec ? await (e.messeTiefen ?? messeTiefenanteil)(e.datei) : undefined;
  const q: Qualitaet = {
    datei: e.datei,
    gemessen: (e.jetzt?.() ?? new Date()).toISOString(),
    messung: m,
    ...(planHinweis ? { planHinweis } : {}),
    dauer,
    breite: m.breite,
    hoehe: m.hoehe,
    fps: m.fps,
    ...(m.videoMbit !== undefined ? { videoMbit: m.videoMbit } : {}),
    ...(m.lufs !== undefined ? { lufs: m.lufs } : {}),
    ...(m.truePeak !== undefined ? { truePeak: m.truePeak } : {}),
    ...(tiefen !== undefined ? { tiefenanteil: tiefen } : {}),
    schnitte: { anzahl: schnitteAnzahl, proMinute: schnitteAnzahl / minuten, quelle: plan ? "plan" : "bild" },
    ...(plan ? { zooms: { anzahl: plan.zooms, proMinute: plan.zooms / minuten }, grafikAnteil: plan.grafikAnteil, brollAnteil: plan.brollAnteil } : {}),
    farbe: { saettigung: farbe.saettigung, yLow: farbe.yLow, yHigh: farbe.yHigh, spanne: farbe.yHigh - farbe.yLow },
    stille: { anteil: stille.anteil, laengste: stille.laengste },
    ersteAussage: plan?.ersteAussage !== undefined ? { sekunden: plan.ersteAussage, quelle: "plan" } : { sekunden: stille.anfang, quelle: "ton" },
  };
  return q;
}

/**
 * Hinweise aus der Messung: Was gegen das Schnittprofil der Marke und die Presets verstösst, und ob das Bild noch flach aussieht.
 * Es gibt keine Schwelle, die «hochwertig» beweist: Die Hinweise zeigen, wohin ein Mensch schauen soll.
 */
export function bewerteQualitaet(q: Qualitaet, profil?: Schnittprofil, exportPreset?: ExportPreset, audio?: AudioPreset): { abweichungen: { code: string; text: string }[]; hinweise: QualitaetsBefund[] } {
  const hinweise: QualitaetsBefund[] = [];
  const h = (code: string, text: string): number => hinweise.push({ stufe: "hinweis", code, text });
  if (q.farbe.saettigung < FLACH_SAETTIGUNG && q.farbe.spanne < FLACH_SPANNE) h("bild-flach", `Das Bild wirkt flach: Sättigung ${f2(q.farbe.saettigung)}, Helligkeitsspanne ${f2(q.farbe.spanne)}. Es sieht aus wie Material ohne Look. [Vermutung] Der Look ist nicht angewendet`);
  if (q.tiefenanteil !== undefined && q.tiefenanteil > TIEFENANTEIL_MAX) {
    h("ton-tiefen", `${Math.round(q.tiefenanteil * 100)} Prozent der Energie liegen unter 200 Hz (Hinweis ab ${Math.round(TIEFENANTEIL_MAX * 100)} Prozent). [Vermutung] Der Ton wirkt dumpf oder dröhnend: Klänge und Musik mit Kopfhörer prüfen. Die Schwelle ist unsere Annahme`);
  }
  if (profil) {
    if (q.zooms && profil.zoom.modus === "aus" && q.zooms.anzahl > 0) h("zoom-trotz-aus", `${q.zooms.anzahl} Zooms, obwohl das Schnittprofil keine will`);
    if (q.zooms && profil.zoom.modus === "betonung" && q.zooms.proMinute > profil.zoom.maxProMinute + 0.5) h("zu-viele-zooms", `${f1(q.zooms.proMinute)} Zooms je Minute, das Schnittprofil erlaubt ${profil.zoom.maxProMinute}`);
    if (q.ersteAussage.sekunden > profil.hookMaxSekunden + 0.2) h("hook-zu-spaet", `Die erste Aussage kommt bei ${f1(q.ersteAussage.sekunden)} s, der Hook soll in den ersten ${f1(profil.hookMaxSekunden)} s stehen`);
    if (q.stille.laengste > profil.laengstePause + 0.5) h("lange-pause", `Die längste Stille dauert ${f1(q.stille.laengste)} s, das Schnittprofil erlaubt Pausen bis ${f1(profil.laengstePause)} s`);
  }
  // dieselbe Prüfung wie «schnitt export-pruefen»
  const abweichungen = [...(exportPreset ? pruefeExport(q.messung, exportPreset) : []), ...(audio ? pruefeAudio(q.messung, audio) : [])];
  return { abweichungen, hinweise };
}

/** Eine kurze Zusammenfassung zum Vorlesen. */
export function qualitaetZeilen(q: Qualitaet): string[] {
  const z: string[] = [];
  if (q.planHinweis) z.push(`Hinweis: ${q.planHinweis}`);
  z.push(`Dauer ${f1(q.dauer)} s, ${q.breite}×${q.hoehe}, ${f1(q.fps)} Bilder pro Sekunde${q.videoMbit !== undefined ? `, Video ${f1(q.videoMbit)} Mbit/s` : ""}`);
  z.push(`Schnitte: ${q.schnitte.anzahl} (${f1(q.schnitte.proMinute)} je Minute, ${q.schnitte.quelle === "plan" ? "aus dem Plan" : "aus dem Bild gezählt, Näherung"})`);
  if (q.zooms) z.push(`Zooms: ${q.zooms.anzahl} (${f1(q.zooms.proMinute)} je Minute)`);
  if (q.grafikAnteil !== undefined) z.push(`Grafiken im Bild: ${Math.round(q.grafikAnteil * 100)} Prozent der Zeit, B-Roll: ${Math.round((q.brollAnteil ?? 0) * 100)} Prozent`);
  z.push(`Bild: Sättigung ${f2(q.farbe.saettigung)}, Helligkeitsspanne ${f2(q.farbe.spanne)}`);
  if (q.lufs !== undefined) z.push(`Ton: ${f1(q.lufs)} LUFS, Spitze ${q.truePeak !== undefined ? f1(q.truePeak) : "?"} dBTP${q.tiefenanteil !== undefined ? `, ${Math.round(q.tiefenanteil * 100)} Prozent der Energie unter 200 Hz` : ""}`);
  z.push(`Stille: ${Math.round(q.stille.anteil * 100)} Prozent, längste Pause ${f1(q.stille.laengste)} s`);
  z.push(`Erste Aussage nach ${f1(q.ersteAussage.sekunden)} s (${q.ersteAussage.quelle === "plan" ? "aus dem Plan" : "aus dem Ton"})`);
  return z;
}
