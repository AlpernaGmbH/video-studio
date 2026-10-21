import { splitSaetze } from "../motion/signale";
import { abstand, gleichesWort, normiere, rohWoerter, transkriptWoerter, type Segment, type TWort } from "./transkript";

/**
 * Skript-Zuordnung und Take-Auswahl (Bauplan v2, Kap. 3.3). Aus dem Wort-für-Wort-Skript und dem Transkript (Whisper) wird pro Skriptzeile der beste Take.
 *
 *  1. Das Skript wird in Zeilen zerlegt (ein Satz pro Zeile).
 *  2. Jede Zeile wird mit dem Transkript verglichen: unscharf, auf normalisierten Wörtern, über Segmentgrenzen hinweg. Mehrere Treffer sind Wiederholungen, also Takes.
 *  3. Die Takes werden bewertet (Vollständig 30, Keine Füllwörter 25, Flüssig 20, Energie 15, Späterer Take 10 Prozent; die Gewichte sind eine Vermutung des Plans).
 *     Ein Take mit Füllwort, Neustart oder Abbruch scheidet aus. Bleibt nur ein solcher übrig, gilt er als «gelb»: Füllwörter werden herausgeschnitten.
 *     Hört Whisper das erste oder letzte Wort einer Zeile falsch («Küche» als «Kirche»), reicht das Fenster trotzdem bis dorthin (`erweitereRaender`): Sonst fehlte dem Satz der Anfang oder das Ende.
 *     Regieanweisungen im Take («Action», «ok») scheiden den Take aus und werden herausgeschnitten, wie Füllwörter.
 *  4. Segmente ohne Treffer (Gespräche, «nochmal», erfundene Sätze) werden verworfen, Skriptzeilen ohne Treffer stehen als «fehlt im Material».
 *  5. Weicht das Gesprochene vom Skript ab, steht der Unterschied im Bericht. Die Entscheidung, ob er sinnvoll ist, trifft ein Mensch oder Claude im Gespräch, nie dieser Code.
 *
 * «Claude hört nicht»: bewertet werden Transkript und Messwerte. Ob ein Take überzeugt, beurteilt das System nicht. Darum liefert es pro Zeile den besten und den zweitbesten Take.
 */

/** Gewichte der Kriterien (Bauplan v2, Kap. 3.3, dort als Vermutung gekennzeichnet). */
export const GEWICHTE = { vollstaendig: 0.3, fuellwoerter: 0.25, fluessig: 0.2, energie: 0.15, spaeter: 0.1 } as const;
/** Ab diesem Anteil wiedergefundener Skriptwörter und dieser Gesamtähnlichkeit gilt ein Fenster des Transkripts als Treffer (Startwerte, Vermutung). */
export const MIN_RECALL = 0.6;
export const MIN_SCORE = 0.6;
/** Ein Take mit weniger wiedergefundenen Skriptwörtern gilt als abgebrochen. */
export const MIN_VOLLSTAENDIG = 0.85;
/** Pausen zwischen Wörtern über dieser Dauer (Sekunden) zählen als Stocken, wenn Whisper echte Wortzeiten liefert. */
export const STOCKEN = 0.35;

const FUELLWOERTER = new Set(["äh", "ähm", "ähh", "ähhm", "öh", "öhm", "ehm", "em", "hm", "hmm", "also", "gäll", "gell", "gälled"]);
const NEUSTART = new Set(["nochmal", "stopp", "stop", "moment", "sorry", "entschuldigung", "ups", "pardon", "vorne"]);
/** Eindeutige Regieanweisungen. Gezählt werden nur Wörter, die nicht zum Skript gehören; zweideutige Wörter («gut», «super», «los») fehlen mit Absicht: Das Gegenlesen fängt sie. */
const REGIE = new Set(["action", "kamera", "klappe", "ok", "okay", "cut"]);
/** Längste Lücke (Sekunden) zwischen zwei Wörtern, über die ein Rand-Wort noch zum Satz gehört. */
const RAND_LUECKE = 0.6;

export interface QuelleTranskript {
  quelle: string;
  segmente: Segment[];
}

export interface Take {
  zeile: number;
  quelle: string;
  /** Wortindizes in der Wortliste der Quelle, beide eingeschlossen. */
  ersterWort: number;
  letzterWort: number;
  von: number;
  bis: number;
  /** Was Whisper in diesem Bereich hörte. */
  text: string;
  /** Die Wörter dieses Bereichs mit Zeiten (Füllwörter eingeschlossen), Grundlage für den Planbau. */
  fensterWoerter: TWort[];
  score: number;
  recall: number;
  precision: number;
  fuellwoerter: { text: string; von: number; bis: number }[];
  /** Regieanweisungen im Take («Action», «ok»), die nicht zum Skript gehören. */
  regie: { text: string; von: number; bis: number }[];
  /** Wörter im Take, die weder zum Skript noch zu den Füllwörtern oder Regieanweisungen gehören (Einschübe, Gerede). */
  extras: number;
  /** Wörter am Rand, die Whisper anders hörte als das Skript und die trotzdem zum Satz gezählt wurden. */
  randDeutung: string[];
  neustart: boolean;
  langePausen: number;
  fluessigGemessen: boolean;
  energieDb?: number;
  kriterien: { vollstaendig: number; fuellwoerter: number; fluessig: number; energie: number; spaeter: number };
  gesamt: number;
  /** Gründe, warum der Take ausscheidet. Leer heisst: tauglich. */
  ausgeschieden: string[];
  /** Ende des Wortes vor dem Take und Beginn des Wortes danach, damit der Schnitt kein Nachbarwort anschneidet. */
  vorWortBis?: number;
  nachWortVon?: number;
}

export interface SkriptWort {
  text: string;
  von: number;
  bis: number;
}

export interface ZeilenErgebnis {
  zeile: number;
  text: string;
  status: "ok" | "gelb" | "fehlt";
  /** Alle Takes, der beste zuerst. */
  takes: Take[];
  gewaehlt?: Take;
  zweitbester?: Take;
  /** Skriptwörter mit Zeiten im gewählten Take (Text aus dem Skript, Timing aus Whisper). */
  woerter?: SkriptWort[];
  /** Unterschied zwischen Skript und Gesprochenem, wenn es einen gibt. Die Bewertung steht aus. */
  abweichung?: { fehlend: string[]; zusaetzlich: string[]; gesprochen: string };
  hinweise: string[];
}

export interface VerworfenesSegment {
  quelle: string;
  von: number;
  bis: number;
  text: string;
}

export interface Zuordnung {
  zeilen: ZeilenErgebnis[];
  verworfen: VerworfenesSegment[];
}

export interface ZuordnungOptionen {
  /** Mittlerer Pegel (dB) einer Stelle der Quelle, zum Beispiel aus ffmpeg `astats`. Ohne diese Funktion zählt die Energie neutral. */
  energie?: (quelle: string, von: number, bis: number) => number | undefined;
  minScore?: number;
  minRecall?: number;
}

/* ---------- Skript ---------- */

/** Zeilen aus Skript-Text: Überschriften, Kommentare und Zitatzeilen von Markdown fallen weg, ein Satz je Zeile. */
export function skriptZeilen(text: string): string[] {
  return text
    .split("\n")
    .filter((l) => !/^\s*(#|<!--|---|>)/.test(l))
    .flatMap((l) => splitSaetze(l));
}

/* ---------- Unscharfer Vergleich ---------- */

interface Paar {
  s: number;
  w: number;
}

/** Längste gemeinsame Teilfolge zweier normierter Wortlisten mit unscharfer Gleichheit. */
export function ausrichten(skript: string[], woerter: string[]): Paar[] {
  const n = skript.length;
  const m = woerter.length;
  const L: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  const gleich: boolean[][] = skript.map((a) => woerter.map((b) => gleichesWort(a, b)));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) L[i]![j] = gleich[i - 1]![j - 1]! ? L[i - 1]![j - 1]! + 1 : Math.max(L[i - 1]![j]!, L[i]![j - 1]!);
  }
  const paare: Paar[] = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (gleich[i - 1]![j - 1]! && L[i]![j]! === L[i - 1]![j - 1]! + 1) {
      paare.push({ s: i - 1, w: j - 1 });
      i--;
      j--;
    } else if (L[i - 1]![j]! >= L[i]![j - 1]!) i--;
    else j--;
  }
  return paare.reverse();
}

export interface Quelle {
  id: string;
  reihenfolge: number;
  woerter: TWort[];
  norm: string[];
}

export interface Treffer {
  zeile: number;
  quelle: Quelle;
  erster: number;
  letzter: number;
  score: number;
  recall: number;
  precision: number;
  paare: Paar[];
  deutung?: string[];
}

function ueberlappung(a: { erster: number; letzter: number }, b: { erster: number; letzter: number }): number {
  const von = Math.max(a.erster, b.erster);
  const bis = Math.min(a.letzter, b.letzter);
  if (bis < von) return 0;
  return (bis - von + 1) / Math.min(a.letzter - a.erster + 1, b.letzter - b.erster + 1);
}

/** Alle Fenster des Transkripts, die zur Skriptzeile passen: Anfang und Ende müssen zu Wörtern vom Anfang und vom Ende der Zeile passen. */
function fenster(zeile: number, zNorm: string[], q: Quelle, minScore: number, minRecall: number): Treffer[] {
  const n = zNorm.length;
  const k = Math.max(1, Math.ceil(n / 2));
  const kopf = zNorm.slice(0, k);
  const fuss = zNorm.slice(n - k);
  const anfaenge: number[] = [];
  const enden: number[] = [];
  q.norm.forEach((w, i) => {
    if (kopf.some((t) => gleichesWort(t, w))) anfaenge.push(i);
    if (fuss.some((t) => gleichesWort(t, w))) enden.push(i);
  });
  const lo = Math.max(1, Math.ceil(minRecall * n));
  const hi = Math.ceil(1.4 * n) + 1;
  const aus: Treffer[] = [];
  const gesehen = new Set<string>();
  for (const i of anfaenge) {
    for (const j of enden) {
      if (j < i) continue;
      const laenge = j - i + 1;
      if (laenge < lo || laenge > hi) continue;
      const paare = ausrichten(zNorm, q.norm.slice(i, j + 1));
      if (paare.length === 0) continue;
      // auf das erste und letzte wiedergefundene Wort zuschneiden
      const erster = i + paare[0]!.w;
      const letzter = i + paare[paare.length - 1]!.w;
      const schluessel = `${erster}-${letzter}`;
      if (gesehen.has(schluessel)) continue;
      gesehen.add(schluessel);
      const echteLaenge = letzter - erster + 1;
      const recall = paare.length / n;
      const precision = paare.length / echteLaenge;
      const score = 0.65 * recall + 0.35 * precision;
      if (recall < minRecall || score < minScore) continue;
      aus.push({ zeile, quelle: q, erster, letzter, score, recall, precision, paare: paare.map((p) => ({ s: p.s, w: p.w + i - erster })) });
    }
  }
  return aus;
}

/* ---------- Ränder ---------- */

/** Gleich genug für ein Wort am Rand der Zeile: gleich, oder ab drei Buchstaben höchstens die Hälfte der Buchstaben verschieden. Nur für die Ränder, wo die Stelle im Satz schon feststeht. */
export function randGleich(a: string, b: string): boolean {
  if (a === b) return a.length > 0;
  if (Math.min(a.length, b.length) < 3) return false;
  return abstand(a, b) <= Math.floor(Math.max(a.length, b.length) / 2);
}

/**
 * Hört Whisper das erste oder letzte Wort einer Zeile falsch, ist es kein Treffer des unscharfen Vergleichs, und der Take beginnt oder endet zu früh: Der Satz ist abgeschnitten.
 * Darum werden die Wörter direkt vor und nach dem Treffer, eins zu eins in der Reihenfolge, den noch unerklärten Skriptwörtern am Rand zugeordnet, wenn sie ähnlich genug sind,
 * ohne grosse Lücke folgen, nicht zum Take einer anderen Zeile gehören und kein Füllwort, keine Regieanweisung und kein Neustart sind.
 * Das Ergebnis ist eine Deutung: Sie steht im Bericht («Küche» gehört als «Kirche»), das Gegenlesen prüft sie.
 */
export function erweitereRaender(t: Treffer, zNorm: string[], andere: ReadonlySet<number>): void {
  const q = t.quelle;
  const n = zNorm.length;
  if (t.paare.length === 0) return;
  const sErst = Math.min(...t.paare.map((p) => p.s));
  const sLetzt = Math.max(...t.paare.map((p) => p.s));
  const stoerwort = (w: string): boolean => FUELLWOERTER.has(w) || REGIE.has(w) || NEUSTART.has(w);
  const deutung: string[] = [];

  const vorn: Paar[] = [];
  for (let m = 0; sErst - 1 - m >= 0; m++) {
    const hi = t.erster - 1 - m;
    const si = sErst - 1 - m;
    if (hi < 0 || andere.has(hi) || stoerwort(q.norm[hi]!) || !randGleich(zNorm[si]!, q.norm[hi]!)) break;
    if (q.woerter[hi + 1]!.von - q.woerter[hi]!.bis > RAND_LUECKE) break;
    vorn.push({ s: si, w: -1 - m });
    if (zNorm[si] !== q.norm[hi]) deutung.push(`«${zNorm[si]}» gehört als «${q.woerter[hi]!.text}»`);
  }
  const hinten: Paar[] = [];
  for (let m = 0; sLetzt + 1 + m < n; m++) {
    const hi = t.letzter + 1 + m;
    const si = sLetzt + 1 + m;
    if (hi >= q.woerter.length || andere.has(hi) || stoerwort(q.norm[hi]!) || !randGleich(zNorm[si]!, q.norm[hi]!)) break;
    if (q.woerter[hi]!.von - q.woerter[hi - 1]!.bis > RAND_LUECKE) break;
    hinten.push({ s: si, w: t.letzter - t.erster + 1 + m });
    if (zNorm[si] !== q.norm[hi]) deutung.push(`«${zNorm[si]}» gehört als «${q.woerter[hi]!.text}»`);
  }
  if (!vorn.length && !hinten.length) return;

  const e = vorn.length;
  t.paare = [...vorn.map((p) => ({ s: p.s, w: p.w + e })), ...t.paare.map((p) => ({ s: p.s, w: p.w + e })), ...hinten.map((p) => ({ s: p.s, w: p.w + e }))];
  t.erster -= e;
  t.letzter += hinten.length;
  t.recall = t.paare.length / n;
  t.precision = t.paare.length / (t.letzter - t.erster + 1);
  t.score = 0.65 * t.recall + 0.35 * t.precision;
  t.deutung = deutung;
}

/* ---------- Take bauen und bewerten ---------- */

/** Wortindizes derselben Quelle, die zum Take einer anderen Skriptzeile gehören. */
function belegteWoerter(angenommen: Treffer[], t: Treffer): Set<number> {
  const aus = new Set<number>();
  for (const a of angenommen) {
    if (a === t || a.quelle !== t.quelle || a.zeile === t.zeile) continue;
    for (let i = a.erster; i <= a.letzter; i++) aus.add(i);
  }
  return aus;
}

function bauTake(t: Treffer, zNorm: string[], andere: ReadonlySet<number>): Take {
  const w = t.quelle.woerter.slice(t.erster, t.letzter + 1);
  const norm = t.quelle.norm.slice(t.erster, t.letzter + 1);
  const wiedergefunden = new Set(t.paare.map((p) => p.w));
  // Ein Füllwort ist ein Füllwort, auch wenn das Skript dasselbe Wort an anderer Stelle hat («also also bauen wir …» ist ein Stottern).
  const fuell = w.filter((x, idx) => !wiedergefunden.has(idx) && FUELLWOERTER.has(norm[idx]!)).map((x) => ({ text: x.text, von: x.von, bis: x.bis }));
  const regie = w.filter((x, idx) => !wiedergefunden.has(idx) && REGIE.has(norm[idx]!)).map((x) => ({ text: x.text, von: x.von, bis: x.bis }));

  // Neustart: ein Zeichen im Take oder in den zwei Wörtern danach (höchstens eine Sekunde später).
  // Wörter, die zum Take einer anderen Skriptzeile gehören, zählen nicht («Nochmal prüfen wir …» als nächster Satz ist kein Neustart).
  const bisZeit = w[w.length - 1]!.bis;
  const umfeld = t.quelle.woerter.slice(t.erster, t.letzter + 3).filter((x) => x.von <= bisZeit + 1);
  const umfeldNorm = umfeld.map((x) => normiere(x.text));
  let neustart = false;
  umfeldNorm.forEach((x, idx) => {
    const imTake = idx <= t.letzter - t.erster;
    if (imTake && wiedergefunden.has(idx)) return;
    if (andere.has(t.erster + idx)) return;
    if (NEUSTART.has(x)) neustart = true;
    if (x === "noch" && umfeldNorm[idx + 1] === "mal") neustart = true;
  });

  const echt = w.every((x) => x.echt);
  let lange = 0;
  if (echt) for (let i = 1; i < w.length; i++) if (w[i]!.von - w[i - 1]!.bis > STOCKEN) lange++;

  const ausgeschieden: string[] = [];
  if (fuell.length) ausgeschieden.push(`Füllwort «${fuell.map((f) => f.text).join("», «")}» bei ${fuell[0]!.von.toFixed(1).replace(".", ",")} s`);
  if (regie.length) ausgeschieden.push(`Regieanweisung «${regie.map((f) => f.text).join("», «")}» bei ${regie[0]!.von.toFixed(1).replace(".", ",")} s`);
  if (neustart) ausgeschieden.push("Neustart im oder direkt nach dem Take («nochmal», «stopp» und ähnlich)");
  const n = zNorm.length;
  if (t.recall < MIN_VOLLSTAENDIG) ausgeschieden.push(`unvollständig: ${Math.round(t.recall * 100)} Prozent der Wörter wiedergefunden`);
  else if (n >= 3 && !t.paare.some((p) => p.s === 0)) ausgeschieden.push("das erste Wort der Zeile fehlt");
  else if (n >= 3 && !t.paare.some((p) => p.s === n - 1)) ausgeschieden.push("das letzte Wort der Zeile fehlt");

  const vor = t.erster > 0 ? t.quelle.woerter[t.erster - 1] : undefined;
  const nach = t.letzter + 1 < t.quelle.woerter.length ? t.quelle.woerter[t.letzter + 1] : undefined;
  return {
    zeile: t.zeile,
    quelle: t.quelle.id,
    ersterWort: t.erster,
    letzterWort: t.letzter,
    von: w[0]!.von,
    bis: bisZeit,
    text: w.map((x) => x.text).join(" "),
    fensterWoerter: w,
    score: round(t.score),
    recall: round(t.recall),
    precision: round(t.precision),
    fuellwoerter: fuell,
    regie,
    extras: Math.max(0, w.length - wiedergefunden.size - fuell.length - regie.length),
    randDeutung: t.deutung ?? [],
    neustart,
    langePausen: lange,
    fluessigGemessen: echt,
    kriterien: { vollstaendig: 0, fuellwoerter: 0, fluessig: 0, energie: 0.5, spaeter: 0 },
    gesamt: 0,
    ausgeschieden,
    ...(vor ? { vorWortBis: vor.bis } : {}),
    ...(nach ? { nachWortVon: nach.von } : {}),
  };
}

const round = (x: number): number => Math.round(x * 1000) / 1000;

/** Setzt die fünf Kriterien und die Gesamtpunktzahl für alle Takes einer Zeile (Energie und «später» sind relativ zu den anderen Takes). */
function bewerte(takes: Take[], reihenfolge: (quelle: string) => number, energie: ZuordnungOptionen["energie"]): void {
  const geordnet = [...takes].sort((a, b) => reihenfolge(a.quelle) - reihenfolge(b.quelle) || a.von - b.von);
  const gemessen = takes.map((t) => (energie ? energie(t.quelle, t.von, t.bis) : undefined));
  takes.forEach((t, i) => {
    if (gemessen[i] !== undefined) t.energieDb = gemessen[i];
  });
  const werte = gemessen.filter((x): x is number => x !== undefined);
  const lo = Math.min(...werte);
  const hi = Math.max(...werte);
  takes.forEach((t, i) => {
    const vollstaendig = t.recall;
    // Fremdwörter im Take kosten Punkte: Ein Take mit Regie oder eingestreutem Gerede ist schlechter als ein sauberer mit gleicher Vollständigkeit, auch wenn er später kam
    const fuell = 1 / (1 + t.fuellwoerter.length + t.regie.length + 0.5 * t.extras);
    const fluessig = t.fluessigGemessen ? Math.max(0, 1 - 0.3 * t.langePausen) : 0.5;
    const e = gemessen[i];
    const energieWert = e !== undefined && werte.length >= 2 && hi > lo ? (e - lo) / (hi - lo) : 0.5;
    const rang = geordnet.indexOf(t);
    const spaeter = takes.length > 1 ? rang / (takes.length - 1) : 1;
    t.kriterien = { vollstaendig: round(vollstaendig), fuellwoerter: round(fuell), fluessig: round(fluessig), energie: round(energieWert), spaeter: round(spaeter) };
    t.gesamt = round(GEWICHTE.vollstaendig * vollstaendig + GEWICHTE.fuellwoerter * fuell + GEWICHTE.fluessig * fluessig + GEWICHTE.energie * energieWert + GEWICHTE.spaeter * spaeter);
  });
}

/* ---------- Skriptwörter mit Zeiten ---------- */

/**
 * Legt die Wörter des Skripts auf die Zeit eines Takes: Wiedergefundene Wörter übernehmen die Zeit von Whisper, die übrigen werden zwischen den
 * Ankern nach Zeichenzahl verteilt (Bauplan v2, Kap. 3.2: Text aus dem Skript, Timing aus Whisper). Füllwörter und Wörter, die nur Whisper hörte, kommen nicht vor.
 */
export function skriptWoerterMitZeit(zeileText: string, woerter: TWort[]): SkriptWort[] {
  const roh = rohWoerter(zeileText).filter((x) => normiere(x).length > 0);
  if (roh.length === 0 || woerter.length === 0) return [];
  const paare = ausrichten(roh.map(normiere), woerter.map((w) => normiere(w.text)));
  const anker = new Map(paare.map((p) => [p.s, woerter[p.w]!]));
  const start = woerter[0]!.von;
  const ende = woerter[woerter.length - 1]!.bis;
  const aus: SkriptWort[] = new Array(roh.length);
  let i = 0;
  while (i < roh.length) {
    const a = anker.get(i);
    if (a) {
      aus[i] = { text: roh[i]!, von: a.von, bis: a.bis };
      i++;
      continue;
    }
    // Lücke von i bis j-1 zwischen zwei Ankern
    let j = i;
    while (j < roh.length && !anker.has(j)) j++;
    const links = i > 0 ? aus[i - 1]!.bis : start;
    const rechts = j < roh.length ? anker.get(j)!.von : ende;
    const gewicht = roh.slice(i, j).map((x) => Math.max(1, normiere(x).length));
    const summe = gewicht.reduce((p, q) => p + q, 0);
    const spanne = Math.max(0, rechts - links);
    let t = links;
    for (let k = i; k < j; k++) {
      const bis = k === j - 1 ? rechts : t + (spanne * gewicht[k - i]!) / summe;
      aus[k] = { text: roh[k]!, von: t, bis: Math.max(t, bis) };
      t = aus[k]!.bis;
    }
    i = j;
  }
  return aus;
}

/* ---------- Hauptfunktion ---------- */

export function ordneZu(zeilen: string[], transkripte: QuelleTranskript[], opt: ZuordnungOptionen = {}): Zuordnung {
  const minScore = opt.minScore ?? MIN_SCORE;
  const minRecall = opt.minRecall ?? MIN_RECALL;
  const quellen: Quelle[] = transkripte.map((t, reihenfolge) => {
    const woerter = transkriptWoerter(t.segmente).filter((w) => normiere(w.text).length > 0);
    return { id: t.quelle, reihenfolge, woerter, norm: woerter.map((w) => normiere(w.text)) };
  });

  const zNormAlle = zeilen.map((z) => rohWoerter(z).map(normiere).filter((x) => x.length > 0));

  // 1. Alle Treffer je Zeile und Quelle, nach Punktzahl sortiert
  const alle: Treffer[] = [];
  zeilen.forEach((_, idx) => {
    const zNorm = zNormAlle[idx]!;
    if (zNorm.length === 0) return;
    for (const q of quellen) alle.push(...fenster(idx + 1, zNorm, q, minScore, minRecall));
  });
  alle.sort((a, b) => b.score - a.score || a.zeile - b.zeile);

  // 2. Annehmen, was sich mit keinem besseren Treffer überschneidet (eine Stelle gehört einer Zeile)
  const angenommen: Treffer[] = [];
  for (const t of alle) {
    const kollidiert = angenommen.some((a) => a.quelle === t.quelle && ueberlappung(a, t) > 0.4);
    if (!kollidiert) angenommen.push(t);
  }

  // 2b. Ränder: Ein falsch gehörtes erstes oder letztes Wort darf den Satz nicht abschneiden. Der Reihe nach, damit zwei Zeilen nicht dasselbe Wort beanspruchen.
  for (const t of angenommen) erweitereRaender(t, zNormAlle[t.zeile - 1]!, belegteWoerter(angenommen, t));

  // 3. Takes bauen und bewerten
  const reihenfolge = (id: string): number => quellen.find((q) => q.id === id)?.reihenfolge ?? 0;
  const ergebnis: ZeilenErgebnis[] = zeilen.map((text, idx) => {
    const zeile = idx + 1;
    const takes = angenommen
      .filter((t) => t.zeile === zeile)
      .map((t) => bauTake(t, zNormAlle[idx]!, belegteWoerter(angenommen, t)));
    bewerte(takes, reihenfolge, opt.energie);
    const sortiert = [...takes].sort((a, b) => b.gesamt - a.gesamt || b.kriterien.spaeter - a.kriterien.spaeter);
    const tauglich = sortiert.filter((t) => t.ausgeschieden.length === 0);
    const gewaehlt = tauglich[0] ?? sortiert[0];
    const hinweise: string[] = [];
    if (!gewaehlt) return { zeile, text, status: "fehlt" as const, takes: [], hinweise: ["fehlt im Material"] };
    const zweitbester = sortiert.find((t) => t !== gewaehlt);
    const status: "ok" | "gelb" = gewaehlt.ausgeschieden.length === 0 ? "ok" : "gelb";
    if (status === "gelb") hinweise.push(`Kein sauberer Take: ${gewaehlt.ausgeschieden.join("; ")}`);
    const q = quellen.find((x) => x.id === gewaehlt.quelle)!;
    const fenstertext = q.woerter.slice(gewaehlt.ersterWort, gewaehlt.letzterWort + 1);
    const woerter = skriptWoerterMitZeit(text, fenstertext);
    // Unterschied zwischen Skript und Gesprochenem
    const zNorm = zNormAlle[idx]!;
    const paare = ausrichten(zNorm, fenstertext.map((w) => normiere(w.text)));
    const gefundenS = new Set(paare.map((p) => p.s));
    const gefundenW = new Set(paare.map((p) => p.w));
    const fehlend = rohWoerter(text).filter((x) => normiere(x).length > 0).filter((_, k) => !gefundenS.has(k));
    const zusaetzlich = fenstertext.filter((_, k) => !gefundenW.has(k)).map((w) => w.text);
    const abweichung = fehlend.length || zusaetzlich.length ? { fehlend, zusaetzlich, gesprochen: gewaehlt.text } : undefined;
    return { zeile, text, status, takes: sortiert, gewaehlt, ...(zweitbester ? { zweitbester } : {}), woerter, ...(abweichung ? { abweichung } : {}), hinweise };
  });

  // 4. Segmente ohne Treffer
  const verworfen: VerworfenesSegment[] = [];
  for (const t of transkripte) {
    const q = quellen.find((x) => x.id === t.quelle)!;
    for (const s of t.segmente) {
      const innen = q.woerter.map((w, i) => ({ w, i })).filter(({ w }) => w.von >= s.von - 1e-6 && w.bis <= s.bis + 1e-6);
      if (innen.length === 0) continue;
      const belegt = innen.some(({ i }) => angenommen.some((a) => a.quelle === q && i >= a.erster && i <= a.letzter));
      if (!belegt) verworfen.push({ quelle: t.quelle, von: s.von, bis: s.bis, text: s.text });
    }
  }
  return { zeilen: ergebnis, verworfen };
}
