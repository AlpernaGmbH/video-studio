import type { Schnittprofil } from "../core/schemas";
import { leseSchnittplan, PlanFehler, type Schnittplan, type SchnittQuelle, type SchnittWort } from "./plan";
import type { TWort } from "./transkript";
import type { Take, ZeilenErgebnis, Zuordnung } from "./zuordnung";

/**
 * Vom Ergebnis der Skript-Zuordnung zum Schnittplan (Bauplan v2, Kap. 3.3 und 3.4). Pro Skriptzeile kommt der gewählte Take in die Spur V1, in der Reihenfolge des Skripts.
 * Aus dem Schnitt folgen die Regeln des Schnittprofils:
 *
 *  - Pausen im Take, die länger sind als `laengstePause`, werden herausgeschnitten (Jump-Cut). Übrig bleiben `vorlauf` und `nachlauf` an den Rändern der Clips.
 *  - Bei einem gelben Take werden die Füllwörter herausgeschnitten, aber nur, wenn Whisper echte Wortzeiten geliefert hat. Bei geschätzten Zeiten würde der Schnitt Nachbarwörter treffen.
 *  - Ein Clip länger als `laengsteEinstellung` wird an einer Wortgrenze geteilt, ohne Zeit zu entfernen. Der Bildwechsel ist dann der Zoom-Wechsel.
 *  - Zoom-Punch: jeder zweite Clip bekommt den Zoom der Stufe `zoomTempo` (Plan: 1,1-fach bei jedem zweiten Schnitt).
 *
 * Zusätzliche Wörter, die Whisper hörte und die nicht im Skript stehen, werden nicht herausgeschnitten: Ob eine Abweichung sinnvoll ist, entscheidet ein Mensch (Plan Kap. 3.3, Punkt 6).
 * B-Roll, Grafiken und Musik kommen nicht von hier, sondern aus dem Storyboard.
 */

/** Startwerte aus Bauplan v2, Kap. 3.4, wenn die Marke kein Schnittprofil hat. */
export const STANDARD_SCHNITTPROFIL: Schnittprofil = {
  laengstePause: 0.25,
  laengsteEinstellung: 1.5,
  woerterJeUntertitel: { min: 2, max: 3 },
  hookMaxSekunden: 2,
  zoomTempo: "mittel",
  textlaengen: {},
};

/** Zoom des Punch-Clips je Zoom-Tempo. «mittel» steht im Plan (1,1-fach), die anderen Stufen sind Annahmen. «langsam» schaltet den Zoom-Punch ab. */
export const ZOOM_STUFE: Record<Schnittprofil["zoomTempo"], number> = { langsam: 1, mittel: 1.1, schnell: 1.15 };

/** Zeit (Sekunden), die vor dem ersten und nach dem letzten Wort eines Clips stehen bleibt. Das Ende klingt länger aus als der Anfang. */
export const VORLAUF = 0.06;
export const NACHLAUF = 0.1;

export interface PlanbauOptionen {
  projekt: { name: string; inhalt?: string; marke: string; fps?: number; breite?: number; hoehe?: number };
  /** Die Quellen des Plans. Die Kennung jeder Quelle im Transkript muss hier vorkommen. */
  quellen: SchnittQuelle[];
  profil?: Schnittprofil;
  vorlauf?: number;
  nachlauf?: number;
  /** Zeilen, deren Untertitel den gesprochenen Text nehmen statt des Skripttexts (nach der Entscheidung über eine Abweichung). */
  gesprochen?: number[];
}

export interface Markierung {
  zeile: number;
  art: "gelb" | "fehlt" | "abweichung" | "geschaetzt" | "gesprochen";
  text: string;
}

export interface Planbau {
  plan: Schnittplan;
  markierungen: Markierung[];
}

interface Stueck {
  quelle: string;
  von: number;
  bis: number;
  zeile: number;
  notiz: string;
}

const s1 = (n: number): string => n.toFixed(1).replace(".", ",");

/** Schneidet die Füllwörter heraus und liefert die Wörter, die im Take bleiben. */
function ohneFuellwoerter(t: Take): TWort[] {
  const weg = new Set(t.fuellwoerter.map((f) => `${f.von}|${f.bis}`));
  return t.fensterWoerter.filter((w) => !weg.has(`${w.von}|${w.bis}`));
}

/**
 * Teilt einen Clip an Wortgrenzen so, dass jedes Stück höchstens `grenze` Sekunden dauert, wenn die Wörter das zulassen. Es wird keine Zeit entfernt.
 * Die Schnitte liegen möglichst gleichmässig verteilt, aber bevorzugt in einer Lücke zwischen Wörtern oder nach einem Satzzeichen.
 */
export function teileEinstellung(woerter: TWort[], von: number, bis: number, grenze: number): { von: number; bis: number }[] {
  const dauer = bis - von;
  const k = Math.ceil(dauer / grenze - 1e-9);
  if (k < 2 || woerter.length < 2) return [{ von, bis }];
  // mögliche Schnitte: zwischen Wort j-1 und Wort j, in der Mitte der Lücke
  const grenzen = woerter.slice(1).map((w, i) => {
    const vor = woerter[i]!;
    const luecke = Math.max(0, w.von - vor.bis);
    return { j: i + 1, t: (vor.bis + w.von) / 2, bonus: 1.5 * Math.min(luecke, 0.25) + (/[.!?,;:]$/.test(vor.text) ? 0.15 : 0) };
  });
  const gewaehlt: number[] = [];
  let letzte = 0;
  let zeit = von;
  for (let i = 1; i < k; i++) {
    const ziel = von + (i * dauer) / k;
    const imRahmen = (g: { j: number; t: number }, eng: boolean): boolean =>
      g.j > letzte && g.j <= woerter.length - (k - i) && (!eng || (g.t - zeit <= grenze && bis - g.t <= (k - i) * grenze));
    // zuerst nur Schnitte, nach denen alle Stücke unter der Grenze bleiben können, sonst alle
    const kandidaten = grenzen.filter((g) => imRahmen(g, true));
    const liste = kandidaten.length ? kandidaten : grenzen.filter((g) => imRahmen(g, false));
    if (!liste.length) break;
    const beste = liste.reduce((a, b) => (Math.abs(b.t - ziel) - b.bonus < Math.abs(a.t - ziel) - a.bonus ? b : a));
    gewaehlt.push(beste.t);
    letzte = beste.j;
    zeit = beste.t;
  }
  const punkte = [von, ...gewaehlt, bis];
  return punkte.slice(1).map((p, i) => ({ von: punkte[i]!, bis: p }));
}

function planeZeile(e: ZeilenErgebnis, t: Take, cfg: { profil: Schnittprofil; vorlauf: number; nachlauf: number; dauer: number; teilen: boolean }, mark: Markierung[]): Stueck[] {
  const { profil } = cfg;
  const geschaetzt = !t.fluessigGemessen;
  let woerter: TWort[] = t.fensterWoerter;
  const notizen: string[] = [];

  if (t.fuellwoerter.length) {
    const liste = t.fuellwoerter.map((f) => `«${f.text}» bei ${s1(f.von)} s`).join(", ");
    if (geschaetzt) {
      mark.push({ zeile: e.zeile, art: "geschaetzt", text: `Füllwort ${liste} bleibt drin: Whisper lieferte keine Wortzeiten, ein Schnitt träfe Nachbarwörter. Stelle von Hand schneiden` });
    } else {
      woerter = ohneFuellwoerter(t);
      notizen.push(`gelb: Füllwort ${liste} herausgeschnitten, Wortzeit von Whisper, bitte anhören`);
    }
  } else if (geschaetzt) {
    mark.push({ zeile: e.zeile, art: "geschaetzt", text: "Whisper lieferte keine Wortzeiten: Pausen im Satz werden nicht gekürzt" });
  }
  if (woerter.length === 0) return [];

  // Läufe: Wörter, deren Abstand nicht über der längsten Pause liegt
  const laeufe: TWort[][] = [[woerter[0]!]];
  for (let i = 1; i < woerter.length; i++) {
    if (woerter[i]!.von - woerter[i - 1]!.bis > profil.laengstePause) laeufe.push([woerter[i]!]);
    else laeufe[laeufe.length - 1]!.push(woerter[i]!);
  }

  const aus: Stueck[] = [];
  laeufe.forEach((lauf, i) => {
    const erstes = lauf[0]!;
    const letztes = lauf[lauf.length - 1]!;
    const davor = i === 0 ? t.vorWortBis : laeufe[i - 1]![laeufe[i - 1]!.length - 1]!.bis;
    const danach = i === laeufe.length - 1 ? t.nachWortVon : laeufe[i + 1]![0]!.von;
    // höchstens 40 Prozent der Lücke zum Nachbarwort, damit der Schnitt es nicht anschneidet
    const vor = davor === undefined ? cfg.vorlauf : Math.min(cfg.vorlauf, 0.4 * Math.max(0, erstes.von - davor));
    const nach = danach === undefined ? cfg.nachlauf : Math.min(cfg.nachlauf, 0.4 * Math.max(0, danach - letztes.bis));
    const von = Math.max(0, erstes.von - vor);
    const bis = Math.min(cfg.dauer, letztes.bis + nach);
    const teile = cfg.teilen ? teileEinstellung(lauf, von, bis, profil.laengsteEinstellung) : [{ von, bis }];
    teile.forEach((x, k) => {
      const n = [...notizen];
      if (teile.length > 1) n.push(k === 0 ? `geteilt in ${teile.length} Clips (Zoom-Wechsel statt Bildwechsel)` : "Fortsetzung, ohne Zeit zu entfernen");
      aus.push({ quelle: t.quelle, von: x.von, bis: x.bis, zeile: e.zeile, notiz: n.join("; ") });
    });
  });
  return aus;
}

export function bauePlan(z: Zuordnung, opt: PlanbauOptionen): Planbau {
  const profil = opt.profil ?? STANDARD_SCHNITTPROFIL;
  const quellen = new Map(opt.quellen.map((q) => [q.id, q]));
  // Vor- und Nachlauf zusammen bleiben deutlich unter der längsten Pause, sonst überschreitet jeder Schnitt sie
  let vorlauf = opt.vorlauf ?? VORLAUF;
  let nachlauf = opt.nachlauf ?? NACHLAUF;
  const summe = vorlauf + nachlauf;
  if (summe > 0.8 * profil.laengstePause) {
    const f = (0.8 * profil.laengstePause) / summe;
    vorlauf *= f;
    nachlauf *= f;
  }
  const stufe = ZOOM_STUFE[profil.zoomTempo];
  const gesprochen = new Set(opt.gesprochen ?? []);
  const markierungen: Markierung[] = [];

  const stuecke: Stueck[] = [];
  const woerter: SchnittWort[] = [];
  for (const e of z.zeilen) {
    const t = e.gewaehlt;
    if (e.status === "fehlt" || !t) {
      markierungen.push({ zeile: e.zeile, art: "fehlt", text: `Zeile ${e.zeile} fehlt im Material und steht nicht im Plan: «${e.text}»` });
      continue;
    }
    const q = quellen.get(t.quelle);
    if (!q) throw new PlanFehler(`Zeile ${e.zeile}: Die Quelle «${t.quelle}» aus dem Transkript fehlt in der Liste der Quellen`);
    if (q.art !== "video") throw new PlanFehler(`Zeile ${e.zeile}: Die Quelle «${t.quelle}» ist keine Videoquelle`);
    if (e.status === "gelb") markierungen.push({ zeile: e.zeile, art: "gelb", text: e.hinweise.join("; ") });
    if (e.abweichung) {
      const teile = [e.abweichung.zusaetzlich.length ? `zusätzlich gesprochen: ${e.abweichung.zusaetzlich.join(" ")}` : "", e.abweichung.fehlend.length ? `im Skript, aber nicht gehört: ${e.abweichung.fehlend.join(" ")}` : ""].filter(Boolean);
      markierungen.push({ zeile: e.zeile, art: "abweichung", text: `${teile.join("; ")}. Entscheidung offen, Untertitel folgen ${gesprochen.has(e.zeile) ? "dem Gesprochenen" : "dem Skript"}` });
    }
    stuecke.push(...planeZeile(e, t, { profil, vorlauf, nachlauf, dauer: q.dauer, teilen: stufe > 1 }, markierungen));

    if (gesprochen.has(e.zeile)) {
      markierungen.push({ zeile: e.zeile, art: "gesprochen", text: "Untertitel nehmen den gesprochenen Text von Whisper" });
      for (const w of ohneFuellwoerter(t)) woerter.push({ text: w.text, quelle: t.quelle, von: w.von, bis: w.bis });
    } else {
      for (const w of e.woerter ?? []) woerter.push({ text: w.text, quelle: t.quelle, von: w.von, bis: w.bis });
    }
  }
  if (!stuecke.length) throw new PlanFehler("Aus dem Material ergibt sich kein einziger Clip: Keine Skriptzeile wurde im Transkript gefunden");

  const clips = stuecke.map((s, i) => ({
    id: `z${String(s.zeile).padStart(2, "0")}-${stuecke.slice(0, i).filter((x) => x.zeile === s.zeile).length + 1}`,
    quelle: s.quelle,
    von: Math.round(s.von * 1000) / 1000,
    bis: Math.round(s.bis * 1000) / 1000,
    zeile: s.zeile,
    // Zoom-Punch bei jedem zweiten Schnitt: der erste Clip bleibt unverändert, der zweite zoomt, der dritte nicht, der vierte zoomt …
    zoom: i % 2 === 1 ? stufe : 1,
    notiz: s.notiz,
  }));

  const plan = leseSchnittplan({
    version: 1,
    projekt: { name: opt.projekt.name, ...(opt.projekt.inhalt ? { inhalt: opt.projekt.inhalt } : {}), marke: opt.projekt.marke, fps: opt.projekt.fps ?? 25, breite: opt.projekt.breite ?? 1080, hoehe: opt.projekt.hoehe ?? 1920 },
    quellen: opt.quellen,
    clips,
    broll: [],
    overlays: [],
    woerter: woerter.map((w) => ({ ...w, von: Math.round(w.von * 1000) / 1000, bis: Math.round(w.bis * 1000) / 1000 })),
  });
  return { plan, markierungen };
}
