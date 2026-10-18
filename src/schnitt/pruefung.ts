import type { KatalogEintrag, Schnittprofil } from "../core/schemas";
import type { Stueck } from "../motion/stueck";
import { fpsBruch, inFrames } from "./raster";
import { PlanFehler, platziere, quelleNach, sekunden, type Schnittplan } from "./plan";
import { woerterAufTimeline } from "./untertitel";

/**
 * Prüft einen Schnittplan, bevor er nach Resolve geht. «fehler» heisst: Der Export wäre falsch oder unvollständig, er bricht ab.
 * «hinweis» heisst: Der Plan verletzt eine Regel des Schnittprofils oder einen Startwert aus Bauplan v2, Kap. 3.4. Der Export läuft,
 * die Stellen stehen in `LIESMICH.md`.
 */

export interface Befund {
  stufe: "fehler" | "hinweis";
  code: string;
  text: string;
}

export interface PruefKontext {
  profil?: Schnittprofil;
  /** Wenn bekannt: Katalog-Schlüssel und Effekte werden dagegen geprüft (Regel 3 des Repos). */
  katalog?: KatalogEintrag[];
  stuecke?: Stueck[];
  /** Nur aktive Stücke sind erlaubt (Regel 3 des Repos). Für Entwürfe auf false setzen. Standard: true. */
  nurAktive?: boolean;
  /** Längste erlaubte Videolänge in Sekunden (Instagram-Reel). */
  maxSekunden?: number;
}

/** Bauplan v2, Kap. 3.4: höchstens 4,8 Wörter pro Sekunde, sonst sind Captions schlecht lesbar (Startwert, Vermutung). */
export const SPRECHTEMPO_MAX = 4.8;
/** Bauplan v2, Kap. 3.4: Reel-Grenze von Instagram. */
export const REEL_MAX_SEKUNDEN = 90;

const s1 = (n: number): string => n.toFixed(1).replace(".", ",");

export function pruefeSchnittplan(plan: Schnittplan, ctx: PruefKontext = {}): Befund[] {
  const b: Befund[] = [];
  const fehler = (code: string, text: string) => b.push({ stufe: "fehler", code, text });
  const hinweis = (code: string, text: string) => b.push({ stufe: "hinweis", code, text });

  try {
    fpsBruch(plan.projekt.fps);
  } catch (e) {
    fehler("projekt-fps", (e as Error).message);
    return b;
  }
  const fps = plan.projekt.fps;
  const eineFrame = 1 / fps;

  // Doppelte Kennungen
  for (const [was, ids] of [
    ["Quelle", plan.quellen.map((q) => q.id)],
    ["Clip", plan.clips.map((c) => c.id)],
  ] as const) {
    const gesehen = new Set<string>();
    for (const id of ids) {
      if (gesehen.has(id)) fehler("doppelte-id", `${was} «${id}» kommt zweimal vor`);
      gesehen.add(id);
    }
  }
  const quellen = quelleNach(plan);

  for (const q of plan.quellen) {
    if (q.art === "video") {
      try {
        fpsBruch(q.fps!);
      } catch (e) {
        fehler("quelle-fps", `Quelle «${q.id}»: ${(e as Error).message}`);
      }
    }
  }

  // Clips
  for (const c of plan.clips) {
    const q = quellen.get(c.quelle);
    if (!q) {
      fehler("quelle-fehlt", `Clip «${c.id}»: Quelle «${c.quelle}» ist nicht definiert`);
      continue;
    }
    if (q.art !== "video") fehler("quelle-art", `Clip «${c.id}»: «${c.quelle}» ist keine Videoquelle`);
    else if (c.bis > q.dauer + eineFrame) fehler("clip-ueber-ende", `Clip «${c.id}» endet bei ${s1(c.bis)} s, die Quelle «${q.id}» ist nur ${s1(q.dauer)} s lang`);
  }
  if (b.some((x) => x.stufe === "fehler")) return b;

  const zeit = platziere(plan);
  const gesamt = sekunden(zeit.gesamtFrames, fps);
  const grenze = ctx.maxSekunden ?? REEL_MAX_SEKUNDEN;
  if (gesamt > grenze + eineFrame) hinweis("zu-lang", `Das Video ist ${s1(gesamt)} s lang, die Grenze liegt bei ${grenze} s`);

  // B-Roll
  const benutzteBroll = new Set<string>();
  const katalogNach = new Map((ctx.katalog ?? []).map((k) => [k.schluessel, k]));
  for (const r of plan.broll) {
    const q = quellen.get(r.quelle);
    if (!q) {
      fehler("quelle-fehlt", `B-Roll «${r.katalog}»: Quelle «${r.quelle}» ist nicht definiert`);
      continue;
    }
    if (q.art !== "video") fehler("quelle-art", `B-Roll «${r.katalog}»: «${r.quelle}» ist keine Videoquelle`);
    else if (r.von + r.dauer > q.dauer + eineFrame) fehler("broll-ueber-ende", `B-Roll «${r.katalog}»: ${s1(r.von)} s + ${s1(r.dauer)} s reichen über das Ende der Quelle (${s1(q.dauer)} s)`);
    if (r.t + r.dauer > gesamt + eineFrame) fehler("broll-ueber-timeline", `B-Roll «${r.katalog}» endet bei ${s1(r.t + r.dauer)} s, das Video ist ${s1(gesamt)} s lang`);
    if (benutzteBroll.has(r.katalog)) hinweis("broll-doppelt", `B-Roll «${r.katalog}» kommt in diesem Video mehrfach vor`);
    benutzteBroll.add(r.katalog);
    if (ctx.katalog) {
      const k = katalogNach.get(r.katalog);
      if (!k) fehler("katalog-unbekannt", `Katalog-Schlüssel «${r.katalog}» existiert nicht`);
      else if (k.art === "sound") fehler("katalog-sound", `«${r.katalog}» ist ein Sound, kein Bild`);
    }
  }

  // Grafiken
  const stueckeNach = new Map((ctx.stuecke ?? []).map((s) => [s.id, s]));
  for (const o of plan.overlays) {
    if (o.t + o.dauer > gesamt + eineFrame) fehler("overlay-ueber-timeline", `Grafik «${o.effekt}» endet bei ${s1(o.t + o.dauer)} s, das Video ist ${s1(gesamt)} s lang`);
    if (ctx.stuecke) {
      const s = stueckeNach.get(o.effekt);
      if (!s) fehler("effekt-unbekannt", `Effekt «${o.effekt}» ist kein Stück der Bibliothek`);
      else if (ctx.nurAktive !== false && s.status !== "aktiv") fehler("effekt-nicht-aktiv", `Effekt «${o.effekt}» hat den Status «${s.status}»: Das Storyboard darf nur aktive Stücke benutzen`);
    }
    if (/\.mp4$/i.test(o.datei)) fehler("overlay-format", `Grafik «${o.datei}» ist ein MP4 und hat keine Transparenz. Grafiken kommen als WebM aus dem Render (wird in der Übergabe zu ProRes 4444) oder als MOV`);
    else if (!/\.(mov|webm)$/i.test(o.datei)) fehler("overlay-format", `Grafik «${o.datei}» ist weder MOV noch WebM`);
  }

  // Musik
  if (plan.musik) {
    const q = quellen.get(plan.musik.quelle);
    if (!q) fehler("quelle-fehlt", `Musik: Quelle «${plan.musik.quelle}» ist nicht definiert`);
    else if (q.art !== "audio") fehler("quelle-art", `Musik: «${plan.musik.quelle}» ist keine Audioquelle`);
  }

  // Wörter
  for (const w of plan.woerter) {
    if (!quellen.has(w.quelle)) {
      fehler("quelle-fehlt", `Wort «${w.text}»: Quelle «${w.quelle}» ist nicht definiert`);
      break;
    }
  }

  // Regeln des Schnittprofils
  const p = ctx.profil;
  if (p) {
    // Bildwechsel: Schnitt, B-Roll oder Grafik, spätestens alle `laengsteEinstellung` Sekunden
    const punkte = new Set<number>([0, gesamt]);
    for (const c of zeit.clips) punkte.add(sekunden(c.startFrame, fps));
    for (const r of plan.broll) {
      punkte.add(sekunden(inFrames(r.t, fps), fps));
      punkte.add(sekunden(inFrames(r.t + r.dauer, fps), fps));
    }
    for (const o of plan.overlays) punkte.add(sekunden(inFrames(o.t, fps), fps));
    const sortiert = [...punkte].filter((t) => t <= gesamt + 1e-9).sort((x, y) => x - y);
    for (let i = 1; i < sortiert.length; i++) {
      const von = sortiert[i - 1]!;
      const dauer = sortiert[i]! - von;
      if (dauer > p.laengsteEinstellung + eineFrame) hinweis("einstellung-zu-lang", `Von ${s1(von)} s bis ${s1(sortiert[i]!)} s (${s1(dauer)} s) gibt es keinen Bildwechsel, erlaubt sind ${s1(p.laengsteEinstellung)} s`);
    }

    const woerter = woerterAufTimeline(plan, zeit);
    if (woerter.length) {
      if (woerter[0]!.von > p.hookMaxSekunden + eineFrame) hinweis("hook-zu-spaet", `Das erste Wort kommt bei ${s1(woerter[0]!.von)} s, der Hook soll in den ersten ${s1(p.hookMaxSekunden)} s stehen`);
      for (let i = 1; i < woerter.length; i++) {
        const luecke = woerter[i]!.von - woerter[i - 1]!.bis;
        if (luecke > p.laengstePause + eineFrame) hinweis("pause-zu-lang", `Pause von ${s1(luecke)} s vor «${woerter[i]!.text}» bei ${s1(woerter[i]!.von)} s, erlaubt sind ${s1(p.laengstePause)} s`);
      }
      const spanne = woerter[woerter.length - 1]!.bis - woerter[0]!.von;
      if (spanne > 0) {
        const tempo = woerter.length / spanne;
        if (tempo > SPRECHTEMPO_MAX) hinweis("sprechtempo", `Sprechtempo ${s1(tempo)} Wörter pro Sekunde, der Startwert liegt bei höchstens ${s1(SPRECHTEMPO_MAX)}`);
      }
    }
  }
  return b;
}

/** Wirft, wenn der Plan Fehler enthält. Hinweise bleiben erlaubt. */
export function verlangeGueltig(befunde: Befund[]): void {
  const f = befunde.filter((x) => x.stufe === "fehler");
  if (f.length) throw new PlanFehler(`Schnittplan hat ${f.length} Fehler:\n${f.map((x) => `  ${x.code}: ${x.text}`).join("\n")}`);
}
