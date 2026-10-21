import type { KatalogEintrag, Regel, Schnittprofil, Storyboard } from "../core/schemas";
import { pruefeStoryboard, StoryboardFehler, type VerworfenesOverlay } from "../core/storyboard";
import { kompakterIndex } from "../motion/bibliothek";
import type { Stueck } from "../motion/stueck";
import { leseSchnittplan, platziere, sekunden, type Schnittplan, type SchnittQuelle } from "./plan";
import { projektKennung } from "../katalog/katalog";
import { woerterMitHerkunft } from "./untertitel";

/**
 * Das Storyboard im Schnittplan (Bauplan v2, Kap. 3.5). Zwei Schritte:
 *
 *  1. `bauAuftrag`: Text für Claude mit dem Skript samt Zeiten in der Timeline, den aktiven Stücken, dem Katalog, den aktiven Regeln und dem Format der Antwort.
 *  2. `wendeStoryboardAn`: Claudes Antwort wird geprüft (`pruefeStoryboard`: nur aktive Stücke, nur Katalog-Schlüssel, Begründung Pflicht) und in den Schnittplan
 *     übernommen: B-Roll als Clip auf V2, Grafiken als Verweis auf eine noch zu rendernde Datei auf V3, Betonung als Markierung an den Wörtern.
 *
 * Das Ergebnis ist ein Entwurf. Freigegeben ist ein Storyboard erst, wenn ein Mensch es bestätigt (Plan Kap. 3.5); dieser Code gibt nie frei.
 */

const s1 = (n: number): string => n.toFixed(1).replace(".", ",");
const s2 = (n: number): string => n.toFixed(2).replace(".", ",");

/** Kennung für Dateinamen aus dem Projekt: die Inhalt-ID oder der Name in Kleinbuchstaben. */
export function renderOrdnerName(plan: Schnittplan): string {
  return plan.projekt.inhalt ?? (plan.projekt.name.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "video");
}

/**
 * Katalog-Schlüssel, die im letzten Video der Marke vorkamen: alle Einträge, deren letzte Nutzung zum jüngsten Projekt gehört, das nicht das aktuelle ist.
 * Mit `marke` zählen nur Videos dieser Marke (Kennung «Name [marke]», siehe `projektKennung`); ohne sie alle.
 */
export function imLetztenVideo(katalog: KatalogEintrag[], aktuellesProjekt: string, marke?: string): string[] {
  const genutzt = katalog.filter((k) => k.zuletztGenutzt && k.zuletztGenutzt.projekt !== aktuellesProjekt && (!marke || k.zuletztGenutzt.projekt.endsWith(` [${marke}]`)));
  if (!genutzt.length) return [];
  const juengstes = genutzt.reduce((a, b) => (b.zuletztGenutzt!.datum > a.zuletztGenutzt!.datum ? b : a)).zuletztGenutzt!.projekt;
  return genutzt.filter((k) => k.zuletztGenutzt!.projekt === juengstes).map((k) => k.schluessel);
}

/* ---------- 1. Auftrag an Claude ---------- */

export interface AuftragKontext {
  /** Stücke der Bibliothek; im Auftrag stehen nur die aktiven. */
  stuecke: Stueck[];
  katalog: KatalogEintrag[];
  /** Regeln; im Auftrag stehen die aktiven der Marke (Optik) und alle aktiven Handwerksregeln. */
  regeln?: Regel[];
  profil?: Schnittprofil;
  /** Skript-Zeilen mit ihrem Text, falls bekannt; sonst wird der Text aus den Wörtern des Plans gebildet. */
  zeilenText?: Map<number, string>;
}

export function bauAuftrag(plan: Schnittplan, ctx: AuftragKontext): string[] {
  const zeit = platziere(plan);
  const gesamt = sekunden(zeit.gesamtFrames, plan.projekt.fps);
  const woerter = woerterMitHerkunft(plan, zeit);
  const aus: string[] = [];
  aus.push(`# Storyboard-Auftrag: ${plan.projekt.name}`, "");
  aus.push(`Marke ${plan.projekt.marke}${plan.projekt.inhalt ? `, Inhalt ${plan.projekt.inhalt}` : ""}. Länge ${s1(gesamt)} s, ${plan.projekt.breite}×${plan.projekt.hoehe}, ${plan.projekt.fps} Bilder pro Sekunde.`, "");
  aus.push("Du schreibst ein Storyboard als JSON (Format unten) mit Hook, Grafiken, B-Roll und betonten Wörtern. Alle Zeiten in Sekunden der Timeline, also des fertigen Videos.", "");

  if (ctx.profil) {
    const p = ctx.profil;
    aus.push("## Schnittprofil der Marke", "");
    aus.push(`- Aussage in den ersten ${s1(p.hookMaxSekunden)} s (Hook)`, `- Bildwechsel (Schnitt, Zoom, B-Roll, Grafik) spätestens alle ${s1(p.laengsteEinstellung)} s`, `- Pausen im Schnitt höchstens ${s2(p.laengstePause)} s`, `- Untertitel mit ${p.woerterJeUntertitel.min} bis ${p.woerterJeUntertitel.max} Wörtern`, "");
  }

  aus.push("## Skript mit Zeiten", "");
  const zeilen = new Map<number, { von: number; bis: number }>();
  zeit.clips.forEach((c) => {
    const z = c.clip.zeile ?? 0;
    const von = sekunden(c.startFrame, plan.projekt.fps);
    const bis = von + sekunden(c.frames, plan.projekt.fps);
    const alt = zeilen.get(z);
    zeilen.set(z, { von: alt ? Math.min(alt.von, von) : von, bis: alt ? Math.max(alt.bis, bis) : bis });
  });
  for (const [z, r] of [...zeilen].sort((a, b) => a[1].von - b[1].von)) {
    const inZeile = woerter.filter((w) => (w.von + w.bis) / 2 >= r.von && (w.von + w.bis) / 2 < r.bis);
    const text = ctx.zeilenText?.get(z) ?? inZeile.map((w) => w.text).join(" ");
    aus.push(`**${z ? `Zeile ${z}` : "ohne Zeile"}, ${s1(r.von)} bis ${s1(r.bis)} s:** ${text}`);
    aus.push(`Wörter (Nummer, Wort, Sekunde): ${inZeile.map((w) => `${woerter.indexOf(w)} ${w.text} ${s1(w.von)}`).join("; ")}`, "");
  }

  const aktive = ctx.stuecke.filter((s) => s.status === "aktiv");
  aus.push("## Grafiken (aktive Stücke)", "", aktive.length ? kompakterIndex(aktive) : "(Keine aktiven Stücke: Es gibt nur B-Roll. Fehlt eine Grafik, gehört sie ins Ideenprotokoll der Motion-Werkstatt, nicht ins Storyboard.)", "");
  aus.push("Parameter mit * sind Pflicht. Die Datenblätter stehen in `library/motion/<id>/piece.json`.", "");

  const letzte = new Set(imLetztenVideo(ctx.katalog, projektKennung(plan.projekt.name, plan.projekt.marke), plan.projekt.marke));
  // Fotos stehen nicht als B-Roll im Angebot (Entscheid Andrej, 21.10.): Sie bleiben im Katalog für Carousel, Blog und Google-Beitrag
  const bilder = ctx.katalog.filter((k) => k.art === "video");
  const frei = bilder.filter((k) => !letzte.has(k.schluessel));
  aus.push("## B-Roll (Katalog)", "");
  if (!frei.length) aus.push("(Der Katalog ist leer. Ohne Katalog-Schlüssel gibt es keine B-Roll.)");
  for (const k of frei) {
    const dauer = k.art === "video" ? (k.besteSekunden ? `${s1(k.besteSekunden.bis - k.besteSekunden.von)} s nutzbar` : k.dauer ? `${s1(k.dauer)} s` : "") : "Foto";
    aus.push(`- ${k.schluessel} · ${k.art}${k.orientierung ? `, ${k.orientierung}` : ""}${dauer ? `, ${dauer}` : ""}${k.zeitlupe ? ", Zeitlupe" : ""}${k.personen ? ", Personen" : ""} · ${k.titel} · ${k.beschreibung} · ${k.tags.join(", ")}`);
  }
  if (bilder.length - frei.length > 0) aus.push("", `${bilder.length - frei.length} Einträge fehlen, weil sie im letzten Video der Marke liefen.`);
  aus.push("", "B-Roll nur mit Katalog-Schlüssel, höchstens einmal pro Video, mindestens so lang wie das Overlay. Fotos und Sounds stehen nicht in der Liste: Fotos sind keine B-Roll.", "");

  const regeln = (ctx.regeln ?? []).filter((r) => r.status === "aktiv" && (r.typ === "handwerk" || r.marke === plan.projekt.marke));
  aus.push("## Aktive Regeln", "");
  aus.push(...(regeln.length ? regeln.map((r) => `- ${r.id} (${r.typ}): ${r.text}`) : ["(Keine aktiven Regeln.)"]), "");

  aus.push("## Antwort", "");
  aus.push("Nur das JSON, ohne Text davor oder danach:", "", "```json");
  aus.push(
    JSON.stringify(
      {
        hook: "Aussage der ersten Sekunden in einem Satz",
        overlays: [
          { effekt: "zahl-zaehler", t: 6.4, dauer: 2.6, params: { wert: 7, suffix: " von 10", label: "laden zu langsam" }, begruendung: "Kennzahl im Skript, Zahl wirkt stärker als Wort" },
          { effekt: "broll", t: 9.8, dauer: 1.5, params: { katalog: "k-0142" }, begruendung: "Zeigt die Aussage, bringt Bildwechsel" },
        ],
        betonung: [12, 40],
        notiz: "Ein Satz zur Gesamtidee",
      },
      null,
      2,
    ),
    "```",
    "",
  );
  aus.push("- `betonung`: Nummern aus der Wortliste oben.", "- Kein Eintrag ohne Begründung (mindestens ein kurzer Satz).", "- Der Plan ist ein Entwurf. Ein Mensch bestätigt ihn oder ändert ihn per Satz («Hook kürzer»).");
  return aus;
}

/* ---------- 2. Storyboard anwenden ---------- */

export interface AnwendenKontext {
  stuecke: Stueck[];
  katalog: KatalogEintrag[];
  /** Sondierte Dateien der B-Roll, nach Katalog-Schlüssel (`schnitt sondiere`). Ohne Eintrag kann die B-Roll nicht in den Plan. */
  brollQuellen: ReadonlyMap<string, SchnittQuelle>;
  /** Nur für Entwürfe auf false: dann sind auch Stücke erlaubt, die noch nicht aktiv sind. */
  nurAktive?: boolean;
  imLetztenVideoDerMarke?: string[];
  /** Ordner unter `renders/`, Standard: Inhalt-ID oder Projektname. */
  renderOrdner?: string;
  /** Sondierte Musikdatei des Storyboards (Feld «musik»). Ohne sie bleibt die Musik draussen und das Ergebnis sagt es. */
  musikQuelle?: SchnittQuelle;
}

export interface RenderAuftrag {
  name: string;
  effekt: string;
  /** Zieldatei relativ zum Medien-Ordner. */
  datei: string;
  t: number;
  dauer: number;
  werte: Record<string, unknown>;
}

export interface Angewandt {
  plan: Schnittplan;
  storyboard: Storyboard;
  verworfen: VerworfenesOverlay[];
  warnungen: string[];
  renderListe: RenderAuftrag[];
  betont: { index: number; text: string; t: number }[];
}

export function wendeStoryboardAn(plan: Schnittplan, roh: unknown, ctx: AnwendenKontext): Angewandt {
  const zeit = platziere(plan);
  const gesamt = sekunden(zeit.gesamtFrames, plan.projekt.fps);
  const geprueft = pruefeStoryboard(roh, {
    stuecke: ctx.stuecke,
    nurAktive: ctx.nurAktive,
    katalog: ctx.katalog,
    imLetztenVideoDerMarke: ctx.imLetztenVideoDerMarke ?? imLetztenVideo(ctx.katalog, projektKennung(plan.projekt.name, plan.projekt.marke), plan.projekt.marke),
    videoDauer: gesamt,
  });
  const verworfen = [...geprueft.verworfen];
  const warnungen = [...geprueft.warnungen];

  // Frühere Ergebnisse eines Storyboards fallen weg: das Storyboard ist massgebend, nicht die Summe aller Läufe
  const quellen = plan.quellen.filter((q) => !q.id.startsWith("broll-") && !q.id.startsWith("musik-"));
  const broll: Schnittplan["broll"] = [];
  const overlays: Schnittplan["overlays"] = [];
  const renderListe: RenderAuftrag[] = [];
  const ordner = ctx.renderOrdner ?? renderOrdnerName(plan);
  const katalogNach = new Map(ctx.katalog.map((k) => [k.schluessel, k]));

  const sortiert = geprueft.plan.overlays.map((ov, i) => ({ ov, i })).sort((a, b) => a.ov.t - b.ov.t || a.i - b.i);
  let nr = 0;
  for (const { ov, i } of sortiert) {
    const nein = (grund: string) => verworfen.push({ index: i, overlay: ov, grund });
    if (ov.effekt === "broll") {
      const key = String(ov.params["katalog"]);
      const eintrag = katalogNach.get(key)!;
      if (eintrag.art !== "video") {
        nein(`«${key}» ist ein Foto: Fotos mit Kamerabewegung (Ken Burns) sind im Schnittplan noch nicht möglich`);
        continue;
      }
      const q = ctx.brollQuellen.get(key);
      if (!q) {
        nein(`«${key}»: Die Datei ${eintrag.pfad} wurde nicht sondiert (liegt sie auf diesem Rechner?)`);
        continue;
      }
      if (!quellen.some((x) => x.id === q.id)) quellen.push(q);
      broll.push({ quelle: q.id, katalog: key, t: ov.t, dauer: ov.dauer, von: eintrag.besteSekunden?.von ?? 0, begruendung: ov.begruendung });
      continue;
    }
    nr += 1;
    const name = `${ov.effekt}-${String(nr).padStart(2, "0")}`;
    const datei = `renders/${ordner}/${name}.webm`;
    overlays.push({ datei, effekt: ov.effekt, t: ov.t, dauer: ov.dauer, begruendung: ov.begruendung });
    renderListe.push({ name, effekt: ov.effekt, datei, t: ov.t, dauer: ov.dauer, werte: ov.params });
  }

  // Betonung: Wortnummern der Timeline-Reihenfolge, wie im Auftrag aufgelistet
  const woerter = woerterMitHerkunft(plan, zeit);
  const betontIdx = new Set<number>();
  const betont: Angewandt["betont"] = [];
  for (const n of geprueft.plan.betonung) {
    const w = woerter[n];
    if (!w) {
      warnungen.push(`Betonung: Wort Nummer ${n} gibt es nicht (das Video hat ${woerter.length} Wörter)`);
      continue;
    }
    betontIdx.add(w.index);
    betont.push({ index: n, text: w.text, t: w.von });
  }
  const neueWoerter = plan.woerter.map((w, i) => {
    const { betont: _alt, ...rest } = w;
    return betontIdx.has(i) ? { ...rest, betont: true } : rest;
  });

  // Musik und Look kommen aus dem Storyboard (ein früherer Stand im Plan fällt weg)
  const sbMusik = geprueft.plan.musik;
  let musik: Schnittplan["musik"];
  if (sbMusik) {
    if (ctx.musikQuelle && ctx.musikQuelle.art === "audio") {
      quellen.push(ctx.musikQuelle);
      musik = { quelle: ctx.musikQuelle.id, t: sbMusik.t, von: sbMusik.von, pegelDb: sbMusik.pegelDb };
    } else if (ctx.musikQuelle) warnungen.push(`Musik: «${sbMusik.datei}» ist keine Audiodatei und bleibt draussen`);
    else warnungen.push(`Musik: «${sbMusik.datei}» wurde nicht sondiert (liegt die Datei auf diesem Rechner?) und bleibt draussen`);
  }
  const look = geprueft.plan.look ? { lut: geprueft.plan.look.lut, ...(geprueft.plan.look.name ? { name: geprueft.plan.look.name } : {}) } : undefined;

  const neu = leseSchnittplan({ ...plan, quellen, broll, overlays, woerter: neueWoerter, musik, look });
  return { plan: neu, storyboard: geprueft.plan, verworfen, warnungen, renderListe, betont };
}

export { StoryboardFehler };
