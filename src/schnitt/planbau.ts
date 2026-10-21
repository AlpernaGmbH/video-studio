import type { Schnittprofil } from "../core/schemas";
import type { Stille } from "./stille";
import { leseSchnittplan, PlanFehler, type Schnittplan, type SchnittQuelle, type SchnittWort } from "./plan";
import type { TWort } from "./transkript";
import type { Take, ZeilenErgebnis, Zuordnung } from "./zuordnung";

/**
 * Vom Ergebnis der Skript-Zuordnung zum Schnittplan (Bauplan v2, Kap. 3.3 und 3.4, geändert durch Plan v4). Pro Skriptzeile kommt der gewählte Take in die Spur V1, in der Reihenfolge des Skripts.
 * Aus dem Schnitt folgen die Regeln des Schnittprofils:
 *
 *  - Pausen im Take, die länger sind als `laengstePause`, werden herausgeschnitten (Jump-Cut). Übrig bleiben `vorlauf` und `nachlauf` an den Rändern der Clips.
 *    Wo eine Audiospur ausgewertet wurde (`stille`), rasten Anfang und Ende in die echte Stille ein: Die Wortzeiten von Whisper enden oft vor dem Wort.
 *  - Stücke unter `minClip` Sekunden werden mit dem Nachbarn verschmolzen (die Pause dazwischen bleibt), statt als Mikro-Schnitt zu flackern.
 *  - Bei einem gelben Take werden Füllwörter und Regieanweisungen («Action», «ok») herausgeschnitten, aber nur, wenn Whisper echte Wortzeiten geliefert hat. Bei geschätzten Zeiten würde der Schnitt Nachbarwörter treffen.
 *  - Es gibt keinen Zoom-Automatismus mehr. Zooms setzt das Storyboard am Schluss, nur auf betonten Wörtern (`wendeZoomsAn`).
 *
 * Die Untertitel nehmen standardmässig das Gehörte (das Skript stimmt nicht immer); `untertitel: "skript"` nimmt den Skripttext. Eine Abweichung steht im Bericht,
 * ob sie sinnvoll ist, entscheidet das Gegenlesen (`gegenlesen.ts`) und ein Mensch, nie dieser Code.
 * B-Roll, Grafiken und Musik kommen nicht von hier, sondern aus dem Storyboard.
 */

/** Startwerte, wenn die Marke kein Schnittprofil hat: ruhig und hochwertig (Plan v4). */
export const STANDARD_SCHNITTPROFIL: Schnittprofil = {
  laengstePause: 0.4,
  laengsteEinstellung: 5,
  woerterJeUntertitel: { min: 2, max: 3 },
  hookMaxSekunden: 2,
  zoomTempo: "mittel",
  zoom: { modus: "aus", maxProMinute: 4 },
  minClip: 0.7,
  textlaengen: {},
};

/** Stärke eines Zooms je Zoom-Tempo. «mittel» steht im Plan (1,1-fach), die anderen Stufen sind Annahmen. «langsam» heisst: keine Zooms. */
export const ZOOM_STUFE: Record<Schnittprofil["zoomTempo"], number> = { langsam: 1, mittel: 1.1, schnell: 1.15 };

/** Zeit (Sekunden), die vor dem ersten und nach dem letzten Wort eines Clips stehen bleibt. Das Ende klingt länger aus als der Anfang; Whisper beendet Wörter oft zu früh. */
export const VORLAUF = 0.08;
export const NACHLAUF = 0.22;

export interface PlanbauOptionen {
  projekt: { name: string; inhalt?: string; marke: string; fps?: number; breite?: number; hoehe?: number };
  /** Die Quellen des Plans. Die Kennung jeder Quelle im Transkript muss hier vorkommen. */
  quellen: SchnittQuelle[];
  profil?: Schnittprofil;
  vorlauf?: number;
  nachlauf?: number;
  /** Zeilen, deren Untertitel den gesprochenen Text nehmen, auch wenn `untertitel` auf «skript» steht. */
  gesprochen?: number[];
  /** Untertitel nach dem Gehörten (Standard, das Skript stimmt nicht immer) oder nach dem Skript. */
  untertitel?: "gehoert" | "skript";
  /** Stille je Quelle (ffmpeg silencedetect). Ohne sie gelten die Wortzeiten von Whisper. */
  stille?: ReadonlyMap<string, Stille[]>;
}

export interface Markierung {
  zeile: number;
  art: "gelb" | "fehlt" | "abweichung" | "geschaetzt" | "gesprochen" | "regie" | "verschmolzen";
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
const s2 = (n: number): string => n.toFixed(2).replace(".", ",");

/** Schneidet Füllwörter und Regieanweisungen heraus und liefert die Wörter, die im Take bleiben. */
function bereinigt(t: Take): TWort[] {
  const weg = new Set([...t.fuellwoerter, ...t.regie].map((f) => `${f.von}|${f.bis}`));
  return t.fensterWoerter.filter((w) => !weg.has(`${w.von}|${w.bis}`));
}

/**
 * Verschmilzt Läufe (Wörter ohne lange Pause), deren Clip kürzer wäre als `minClip`, mit dem Nachbarn: erst mit dem folgenden, der letzte mit dem vorigen.
 * Die Pause zwischen ihnen bleibt dann im Clip. `zuschlag` ist Vor- plus Nachlauf. `fest[i]` heisst: Der Bruch nach Lauf i ist hart (ein herausgeschnittenes Füllwort
 * oder eine Regieanweisung liegt dort) und darf nicht überbrückt werden, sonst käme es zurück.
 */
export function verschmelzeKleine(laeufe: TWort[][], minClip: number, zuschlag: number, fest: boolean[] = []): { laeufe: TWort[][]; fest: boolean[] } {
  const aus = laeufe.map((l) => [...l]);
  const hart = laeufe.map((_, i) => fest[i] ?? false);
  const dauer = (l: TWort[]): number => l[l.length - 1]!.bis - l[0]!.von + zuschlag;
  let i = 0;
  while (aus.length > 1 && i < aus.length) {
    if (dauer(aus[i]!) >= minClip) {
      i++;
      continue;
    }
    if (i < aus.length - 1 && !hart[i]) {
      aus[i] = [...aus[i]!, ...aus[i + 1]!];
      hart[i] = hart[i + 1]!;
      aus.splice(i + 1, 1);
      hart.splice(i + 1, 1);
    } else if (i > 0 && !hart[i - 1]) {
      aus[i - 1] = [...aus[i - 1]!, ...aus[i]!];
      hart[i - 1] = hart[i]!;
      aus.splice(i, 1);
      hart.splice(i, 1);
      i = Math.max(0, i - 1);
    } else i++;
  }
  return { laeufe: aus, fest: hart };
}

/**
 * Setzt Anfang und Ende eines Clips in die Stille. Whisper beendet ein Wort oft zu früh: Liegt in `[Wortende - 0,05 s; Wortende + 0,4 s]` eine Stille, endet der Clip kurz nach deren Beginn.
 * Der Anfang liegt kurz vor dem Ende der Stille, die dem ersten Wort vorausgeht. Nachbarwörter werden nie angeschnitten (`davor`, `danach`).
 */
export function rasteEin(clip: { von: number; bis: number }, stille: readonly Stille[], wort: { von: number; bis: number; davor?: number; danach?: number }): { von: number; bis: number } {
  let { von, bis } = clip;
  const lang = (s: Stille): boolean => s.bis - s.von > 0.06;
  // Ende
  const ende = stille.filter((s) => lang(s) && s.von >= wort.bis - 0.05 && s.von <= wort.bis + 0.4 && (wort.danach === undefined || s.von <= wort.danach)).sort((a, b) => a.von - b.von)[0];
  if (ende) {
    let ziel = ende.von + Math.min(0.14, (ende.bis - ende.von) * 0.5);
    if (wort.danach !== undefined) ziel = Math.min(ziel, wort.danach - 0.03);
    bis = Math.max(wort.bis + 0.02, ziel);
  }
  // Anfang
  const anfang = stille.filter((s) => lang(s) && s.bis >= wort.von - 0.35 && s.bis <= wort.von + 0.25 && (wort.davor === undefined || s.bis >= wort.davor)).sort((a, b) => Math.abs(a.bis - wort.von) - Math.abs(b.bis - wort.von))[0];
  if (anfang) {
    let ziel = Math.max(anfang.von, anfang.bis - 0.07);
    if (wort.davor !== undefined) ziel = Math.max(ziel, wort.davor + 0.02);
    von = Math.max(0, Math.min(ziel, wort.von));
  }
  return { von, bis: Math.max(bis, von + 0.05) };
}

function planeZeile(e: ZeilenErgebnis, t: Take, cfg: { profil: Schnittprofil; vorlauf: number; nachlauf: number; dauer: number; stille?: readonly Stille[] }, mark: Markierung[]): Stueck[] {
  const { profil } = cfg;
  const geschaetzt = !t.fluessigGemessen;
  const alle = t.fensterWoerter;
  const entfernt = new Set<number>();
  const notizen: string[] = [];

  const gestoert = [...t.fuellwoerter.map((f) => ({ ...f, art: "Füllwort" })), ...t.regie.map((f) => ({ ...f, art: "Regieanweisung" }))];
  if (gestoert.length) {
    const liste = gestoert.map((f) => `${f.art} «${f.text}» bei ${s1(f.von)} s`).join(", ");
    if (geschaetzt) {
      mark.push({ zeile: e.zeile, art: "geschaetzt", text: `${liste} bleibt drin: Whisper lieferte keine Wortzeiten, ein Schnitt träfe Nachbarwörter. Stelle von Hand schneiden` });
    } else {
      const weg = new Set(gestoert.map((f) => `${f.von}|${f.bis}`));
      alle.forEach((w, i) => weg.has(`${w.von}|${w.bis}`) && entfernt.add(i));
      notizen.push(`gelb: ${liste} herausgeschnitten, Wortzeit von Whisper, bitte anhören`);
      if (t.regie.length) mark.push({ zeile: e.zeile, art: "regie", text: `Regieanweisung herausgeschnitten: ${t.regie.map((r) => `«${r.text}» bei ${s1(r.von)} s`).join(", ")}` });
    }
  } else if (geschaetzt) {
    mark.push({ zeile: e.zeile, art: "geschaetzt", text: "Whisper lieferte keine Wortzeiten: Pausen im Satz werden nicht gekürzt" });
  }
  const behalten = alle.map((_, i) => i).filter((i) => !entfernt.has(i));
  if (behalten.length === 0) return [];

  // Läufe: Wörter, deren Abstand nicht über der längsten Pause liegt. Ein herausgeschnittenes Wort ist immer ein Bruch.
  const roh: TWort[][] = [[alle[behalten[0]!]!]];
  const fest: boolean[] = [];
  for (let k = 1; k < behalten.length; k++) {
    const i = behalten[k]!;
    const vorI = behalten[k - 1]!;
    const hart = i - vorI > 1;
    if (hart || alle[i]!.von - alle[vorI]!.bis > profil.laengstePause) {
      roh.push([alle[i]!]);
      fest.push(hart);
    } else roh[roh.length - 1]!.push(alle[i]!);
  }
  fest.push(false);
  // zu kurze Läufe wachsen mit dem Nachbarn zusammen
  const v = verschmelzeKleine(roh, profil.minClip, cfg.vorlauf + cfg.nachlauf, fest);
  const laeufe = v.laeufe;
  if (laeufe.length < roh.length) mark.push({ zeile: e.zeile, art: "verschmolzen", text: `${roh.length - laeufe.length} Mikro-Schnitt(e) unter ${s2(profil.minClip)} s verschmolzen, die Pause bleibt im Clip` });

  const aus: Stueck[] = [];
  laeufe.forEach((lauf) => {
    const erstes = lauf[0]!;
    const letztes = lauf[lauf.length - 1]!;
    // Nachbarn sind die Wörter des Takes direkt davor und danach, auch herausgeschnittene: Der Schnitt trifft sie nicht
    const iErst = alle.indexOf(erstes);
    const iLetzt = alle.indexOf(letztes);
    const davor = iErst > 0 ? alle[iErst - 1]!.bis : t.vorWortBis;
    const danach = iLetzt < alle.length - 1 ? alle[iLetzt + 1]!.von : t.nachWortVon;
    // höchstens 40 Prozent der Lücke zum Nachbarwort, damit der Schnitt es nicht anschneidet
    const vor = davor === undefined ? cfg.vorlauf : Math.min(cfg.vorlauf, 0.4 * Math.max(0, erstes.von - davor));
    const nach = danach === undefined ? cfg.nachlauf : Math.min(cfg.nachlauf, 0.4 * Math.max(0, danach - letztes.bis));
    let von = Math.max(0, erstes.von - vor);
    let bis = Math.min(cfg.dauer, letztes.bis + nach);
    if (cfg.stille?.length) {
      const r = rasteEin({ von, bis }, cfg.stille, { von: erstes.von, bis: letztes.bis, ...(davor !== undefined ? { davor } : {}), ...(danach !== undefined ? { danach } : {}) });
      von = Math.max(0, r.von);
      bis = Math.min(cfg.dauer, r.bis);
    }
    aus.push({ quelle: t.quelle, von, bis, zeile: e.zeile, notiz: notizen.join("; ") });
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
  const gesprochen = new Set(opt.gesprochen ?? []);
  const nachGehoertem = (zeile: number): boolean => (opt.untertitel ?? "gehoert") === "gehoert" || gesprochen.has(zeile);
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
      markierungen.push({ zeile: e.zeile, art: "abweichung", text: `${teile.join("; ")}. Untertitel folgen ${nachGehoertem(e.zeile) ? "dem Gehörten (im Gegenlesen prüfen)" : "dem Skript"}` });
    }
    stuecke.push(...planeZeile(e, t, { profil, vorlauf, nachlauf, dauer: q.dauer, ...(opt.stille?.get(t.quelle) ? { stille: opt.stille.get(t.quelle)! } : {}) }, markierungen));

    if (nachGehoertem(e.zeile)) {
      if (e.abweichung) markierungen.push({ zeile: e.zeile, art: "gesprochen", text: "Untertitel nehmen den gehörten Text von Whisper" });
      for (const w of bereinigt(t)) woerter.push({ text: w.text, quelle: t.quelle, von: w.von, bis: w.bis });
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
    zoom: 1,
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
