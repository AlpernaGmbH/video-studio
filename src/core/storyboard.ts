import { loeseVariablen, type Stueck } from "../motion/stueck";
import { Overlay, Storyboard, type KatalogEintrag } from "./schemas";

export interface StoryboardKontext {
  /** Alle bekannten Stücke der Bibliothek. Benutzt werden dürfen nur aktive, ausser `nurAktive` ist false. */
  stuecke: Stueck[];
  /** Nur für Test-Renders einzelner Entwürfe auf false setzen. Standard: true. */
  nurAktive?: boolean;
  katalog: KatalogEintrag[];
  /** Katalog-Schlüssel, die im letzten Video derselben Marke schon vorkamen. */
  imLetztenVideoDerMarke?: string[];
  /** Länge des Videos in Sekunden, wenn schon bekannt. */
  videoDauer?: number;
}

export interface VerworfenesOverlay {
  index: number;
  overlay: unknown;
  grund: string;
}

export interface StoryboardErgebnis {
  plan: Storyboard;
  verworfen: VerworfenesOverlay[];
  warnungen: string[];
}

export class StoryboardFehler extends Error {}

/**
 * Prüft ein Storyboard von Claude (Bauplan 3.5, 3.7). Ungültige Einträge fallen heraus und werden mit Grund
 * gemeldet, statt das ganze Storyboard zu kippen:
 * - B-Roll nur mit gültigem Katalog-Schlüssel, nicht zweimal im selben Video, nicht im letzten Video der Marke,
 *   mindestens so lang wie das Overlay.
 * - Effekte nur aus der Bibliothek (aktive Stücke), Parameter gegen das Datenblatt.
 * - Kein Overlay ohne Begründung.
 */
export function pruefeStoryboard(roh: unknown, ctx: StoryboardKontext): StoryboardErgebnis {
  if (!roh || typeof roh !== "object") throw new StoryboardFehler("Storyboard ist kein Objekt");
  const huelle = roh as Record<string, unknown>;
  const rohOverlays = Array.isArray(huelle["overlays"]) ? (huelle["overlays"] as unknown[]) : null;
  if (!rohOverlays) throw new StoryboardFehler("Storyboard hat keine Liste «overlays»");

  const kopf = Storyboard.safeParse({ ...huelle, overlays: [] });
  if (!kopf.success) throw new StoryboardFehler(`Storyboard unvollständig: ${kopf.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);

  const verworfen: VerworfenesOverlay[] = [];
  const gueltig: Overlay[] = [];
  const warnungen: string[] = [];
  const benutzteBroll = new Set<string>();
  const stueckeNachId = new Map(ctx.stuecke.map((s) => [s.id, s]));
  const nurAktive = ctx.nurAktive ?? true;
  const katalogNachKey = new Map(ctx.katalog.map((k) => [k.schluessel, k]));
  const letzte = new Set(ctx.imLetztenVideoDerMarke ?? []);

  rohOverlays.forEach((o, index) => {
    const nein = (grund: string) => verworfen.push({ index, overlay: o, grund });

    const p = Overlay.safeParse(o);
    if (!p.success) return nein(`Eintrag ungültig: ${p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    const ov = p.data;

    if (ctx.videoDauer !== undefined && ov.t + ov.dauer > ctx.videoDauer + 0.001) {
      return nein(`Endet bei ${(ov.t + ov.dauer).toFixed(2)} s, das Video ist nur ${ctx.videoDauer} s lang`);
    }

    if (ov.effekt === "broll") {
      const key = ov.params["katalog"];
      if (typeof key !== "string") return nein("B-Roll ohne Katalog-Schlüssel (params.katalog)");
      const eintrag = katalogNachKey.get(key);
      if (!eintrag) return nein(`Katalog-Schlüssel «${key}» existiert nicht`);
      if (eintrag.art === "sound") return nein(`«${key}» ist ein Sound, kein Bild`);
      if (benutzteBroll.has(key)) return nein(`«${key}» kommt in diesem Video schon vor`);
      if (letzte.has(key)) return nein(`«${key}» lief schon im letzten Video der Marke`);
      const verfuegbar = eintrag.besteSekunden ? eintrag.besteSekunden.bis - eintrag.besteSekunden.von : eintrag.dauer;
      if (eintrag.art === "video" && verfuegbar !== undefined && verfuegbar + 0.001 < ov.dauer) {
        return nein(`«${key}» hat nur ${verfuegbar.toFixed(1)} s brauchbares Material, das Overlay braucht ${ov.dauer} s`);
      }
      benutzteBroll.add(key);
      gueltig.push(ov);
      return;
    }

    const stueck = stueckeNachId.get(ov.effekt);
    if (!stueck) {
      return nein(`Effekt «${ov.effekt}» ist kein Stück der Bibliothek. Fehlt etwas, gehört es ins Ideenprotokoll`);
    }
    if (nurAktive && stueck.status !== "aktiv") {
      return nein(`Effekt «${ov.effekt}» hat den Status «${stueck.status}». Das Storyboard darf nur aktive Stücke benutzen (ein Mensch gibt sie frei)`);
    }
    const r = loeseVariablen(stueck, ov.params, { dauer: ov.dauer, ohneMarke: true });
    if (!r.ok) return nein(r.fehler.join("; "));
    gueltig.push(ov);
  });

  // Überlappende Einsätze desselben Typs sind selten gewollt: nur melden.
  const sortiert = [...gueltig].sort((a, b) => a.t - b.t);
  for (let i = 1; i < sortiert.length; i++) {
    const a = sortiert[i - 1]!;
    const b = sortiert[i]!;
    if (a.effekt !== "broll" && b.effekt !== "broll" && b.t < a.t + a.dauer - 0.001) {
      warnungen.push(`«${a.effekt}» (${a.t} s) und «${b.effekt}» (${b.t} s) überlappen sich`);
    }
  }

  return { plan: { ...kopf.data, overlays: gueltig }, verworfen, warnungen };
}
