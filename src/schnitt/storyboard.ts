import { SoundEintrag, Zoom, type KatalogEintrag, type KlangArt, type Markenprofil, type Regel, type Schnittprofil, type Storyboard } from "../core/schemas";
import { pruefeStoryboard, StoryboardFehler, type VerworfenesOverlay } from "../core/storyboard";
import { kompakterIndex } from "../motion/bibliothek";
import type { Stueck } from "../motion/stueck";
import { hoechstensKlaenge, KLAENGE_JE_SEKUNDE, KLANG_PEGEL_STANDARD } from "./klang";
import { STANDARD_SCHNITTPROFIL, ZOOM_STUFE } from "./planbau";
import { leseSchnittplan, platziere, sekunden, SchnittQuelle, type Schnittplan } from "./plan";
import { wendeZoomsAn, type ZoomEinsatz } from "./zoom";
import { klangGrund, projektKennung } from "../katalog/katalog";
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

/**
 * Die Quelle einer B-Roll aus dem Katalog. Steht im Katalog `log` (flaches Material aus der Kamera), trägt die Quelle die Farbart «log» und bekommt so die LUT «log» statt des Angleichs.
 * Hat ein Mensch für den Inhalt den Datenbereich festgelegt, gilt er auch für diese Quelle (derselbe Kamera-Modus).
 */
/** Die Audioquelle eines Klangs aus dem Katalog (M8), mit der Kennung «sound-<Schlüssel>». */
export function soundQuelleAusKatalog(k: Pick<KatalogEintrag, "schluessel" | "pfad">, sondiert: object): SchnittQuelle {
  return SchnittQuelle.parse({ id: `sound-${k.schluessel}`, pfad: k.pfad, ...sondiert });
}

export function brollQuelleAusKatalog(k: Pick<KatalogEintrag, "schluessel" | "pfad" | "log">, sondiert: object, plan: Pick<Schnittplan, "quellen">): SchnittQuelle {
  const bereich = plan.quellen.find((q) => q.farbe === "log" && q.bereich)?.bereich;
  return SchnittQuelle.parse({ id: `broll-${k.schluessel}`, pfad: k.pfad, ...sondiert, ...(k.log ? { farbe: "log", ...(bereich ? { bereich } : {}) } : {}) });
}

/* ---------- 1. Auftrag an Claude ---------- */

export interface AuftragKontext {
  /** Ton der Marke (M8): Nur wenn `sfxDichte` über 0 liegt, steht eine Klangliste im Auftrag. Ohne Angabe sind Klänge aus. */
  ton?: Markenprofil["ton"];
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
    const zoomAn = p.zoom.modus === "betonung" && p.zoomTempo !== "langsam";
    aus.push(
      `- Aussage in den ersten ${s1(p.hookMaxSekunden)} s (Hook)`,
      `- Eine neue visuelle Ebene (Grafik, B-Roll, Mockup) spätestens alle ${s1(p.laengsteEinstellung)} s; ein Zoom zählt nicht als Bildwechsel`,
      zoomAn
        ? `- Zooms nur auf betonten Wörtern, höchstens ${p.zoom.maxProMinute} je Minute, mindestens 1 s Abstand, 0,6 bis 3 s lang; der Schnitt setzt keinen Zoom von allein, du setzt sie am Schluss`
        : "- Keine Zooms (Schnittprofil der Marke: aus)",
      `- Pausen im Schnitt höchstens ${s2(p.laengstePause)} s`,
      `- Untertitel mit ${p.woerterJeUntertitel.min} bis ${p.woerterJeUntertitel.max} Wörtern`,
      "",
    );
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

  // Klänge (M8): nur für Marken, die Soundeffekte wollen; nur Sounds mit Lizenz und Quelle
  const klangMax = hoechstensKlaenge(ctx.ton, gesamt);
  const klaenge = ctx.katalog.filter((k) => k.art === "sound" && k.klang);
  aus.push("## Klänge (Katalog)", "");
  if (!klangMax) aus.push("Keine Soundeffekte (Marke: `ton.sfxDichte` 0). Schreib kein `sounds`.", "");
  else if (!klaenge.length) aus.push("(Der Katalog hat keinen Sound mit Lizenz und Quelle. Ohne ihn gibt es keine Klänge: Schreib kein `sounds`.)", "");
  else {
    for (const k of klaenge) aus.push(`- ${k.schluessel} · ${k.klang!.art}${k.dauer ? `, ${s1(k.dauer)} s` : ""} · ${k.titel} · ${k.beschreibung} · ${k.tags.join(", ")}`);
    aus.push(
      "",
      `Höchstens ${klangMax} Klänge in diesem Video (Marke: ${ctx.ton!.sfxDichte} je Sekunde), nie mehr als ${KLAENGE_JE_SEKUNDE} in einer Sekunde. Ein Klang gehört auf ein sichtbares Ereignis (Grafik, Zahl, Schnitt, Wort): Setz \`t\` bis 0,5 s **vor** das Bildereignis, nie danach. Nur Schlüssel aus dieser Liste. Ein Mensch hört die Wahl und gibt sie frei; du hörst nichts.`,
      "",
    );
  }

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
        zooms: [{ wort: 12, dauer: 1.2, begruendung: "Betontes Wort, die Zahl soll hängen bleiben" }],
        ...(klangMax && klaenge.length ? { sounds: [{ katalog: klaenge[0]!.schluessel, t: 6.2, pegelDb: -12, begruendung: "Schlag knapp vor der Zahl, hebt sie hervor" }] } : {}),
        notiz: "Ein Satz zur Gesamtidee",
      },
      null,
      2,
    ),
    "```",
    "",
  );
  aus.push("- `betonung`: Nummern aus der Wortliste oben.", "- `zooms`: nur auf Wörtern aus `betonung` (`wort` ist dieselbe Nummer); `stufe` ist optional.", ...(klangMax && klaenge.length ? ["- `sounds`: Katalog-Schlüssel aus der Klangliste, `t` in Sekunden der Timeline, `pegelDb` optional (Standard −12)."] : []), "- Kein Eintrag ohne Begründung (mindestens ein kurzer Satz).", "- Der Plan ist ein Entwurf. Ein Mensch bestätigt ihn oder ändert ihn per Satz («Hook kürzer»).");
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
  /** Schnittprofil der Marke: bestimmt, ob und wie oft gezoomt werden darf. Ohne Profil gelten die Startwerte (kein Zoom). */
  profil?: Schnittprofil;
  /** Ton der Marke (M8): `sfxDichte` bestimmt, ob und wie viele Klänge erlaubt sind. Ohne Angabe sind Klänge aus. */
  ton?: Markenprofil["ton"];
  /** Sondierte Dateien der Klänge, nach Katalog-Schlüssel. Ohne Eintrag kann der Klang nicht in den Plan. */
  soundQuellen?: ReadonlyMap<string, SchnittQuelle>;
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
  zooms: { wort: number; text: string; t: number; dauer: number; stufe: number }[];
  verworfeneZooms: { index: number; zoom: unknown; grund: string }[];
  sounds: { katalog: string; art: KlangArt; t: number; dauer: number; pegelDb: number }[];
  verworfeneSounds: { index: number; sound: unknown; grund: string }[];
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
  const quellen = plan.quellen.filter((q) => !q.id.startsWith("broll-") && !q.id.startsWith("sound-"));
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

  // Zooms: nur auf betonten Wörtern, höchstens so viele je Minute, mit Abstand (Ruhe vor Effekt). Jeder Eintrag wird einzeln geprüft.
  const profil = ctx.profil ?? STANDARD_SCHNITTPROFIL;
  const zoomErlaubt = profil.zoom.modus === "betonung" && profil.zoomTempo !== "langsam";
  const hoechstens = zoomErlaubt && profil.zoom.maxProMinute > 0 ? Math.max(1, Math.round((profil.zoom.maxProMinute * gesamt) / 60)) : 0;
  const zooms: Angewandt["zooms"] = [];
  const verworfeneZooms: Angewandt["verworfeneZooms"] = [];
  const einsaetze: ZoomEinsatz[] = [];
  (geprueft.plan.zooms as unknown[]).forEach((roh, index) => {
    const nein = (grund: string) => verworfeneZooms.push({ index, zoom: roh, grund });
    const p = Zoom.safeParse(roh);
    if (!p.success) return nein(`Zoom ungültig: ${p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    const z = p.data;
    if (!zoomErlaubt) return nein("Zooms sind für diese Marke aus (Schnittprofil: zoom.modus «aus» oder Zoom-Tempo «langsam»)");
    const b = betont.find((x) => x.index === z.wort);
    if (!b) return nein(`Zoom nur auf betonten Wörtern: Wort ${z.wort} steht nicht in «betonung»`);
    if (einsaetze.length >= hoechstens) return nein(`Mehr als ${hoechstens} Zooms in ${s1(gesamt)} s (Schnittprofil: höchstens ${profil.zoom.maxProMinute} je Minute)`);
    const t = Math.max(0, b.t - 0.1);
    const dauer = Math.min(z.dauer, gesamt - t);
    if (dauer < 0.6) return nein(`Zoom bei ${s1(t)} s hat bis zum Ende des Videos weniger als 0,6 s Platz`);
    const stoert = einsaetze.find((e) => t < e.t + e.dauer + 1 && e.t < t + dauer + 1);
    if (stoert) return nein(`Zoom bei ${s1(t)} s liegt zu nah am Zoom bei ${s1(stoert.t)} s (mindestens 1 s Abstand)`);
    const stufe = z.stufe ?? ZOOM_STUFE[profil.zoomTempo];
    einsaetze.push({ t, dauer, stufe, begruendung: z.begruendung });
    zooms.push({ wort: z.wort, text: b.text, t, dauer, stufe });
  });

  // Klänge (M8): nur wenn die Marke Soundeffekte will, nur Sounds mit Lizenz und Quelle, höchstens so viele wie `sfxDichte` und `KLAENGE_JE_SEKUNDE` erlauben.
  // Jeder Eintrag wird einzeln geprüft, in der Reihenfolge der Zeit, damit die Obergrenze die späteren trifft und nicht die ersten.
  const klangMax = hoechstensKlaenge(ctx.ton, gesamt);
  const sounds: Angewandt["sounds"] = [];
  const verworfeneSounds: Angewandt["verworfeneSounds"] = [];
  const planSounds: Schnittplan["sounds"] = [];
  const klangQuellen = [...quellen];
  const roheKlaenge = (geprueft.plan.sounds as unknown[]).map((roh, index) => ({ roh, index, p: SoundEintrag.safeParse(roh) }));
  for (const x of roheKlaenge) {
    if (!x.p.success) verworfeneSounds.push({ index: x.index, sound: x.roh, grund: `Klang ungültig: ${x.p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}` });
  }
  const gueltigeKlaenge = roheKlaenge.filter((x): x is typeof x & { p: { success: true; data: SoundEintrag } } => x.p.success).sort((a, b) => a.p.data.t - b.p.data.t || a.index - b.index);
  for (const { roh, index, p } of gueltigeKlaenge) {
    const z = p.data;
    const nein = (grund: string) => verworfeneSounds.push({ index, sound: roh, grund });
    if (!klangMax) {
      nein("Soundeffekte sind für diese Marke aus (Markenprofil ton.sfxDichte 0)");
      continue;
    }
    const eintrag = katalogNach.get(z.katalog);
    const grund = klangGrund(eintrag, z.katalog);
    if (grund) {
      nein(grund);
      continue;
    }
    const q = ctx.soundQuellen?.get(z.katalog);
    if (!q) {
      nein(`«${z.katalog}»: Die Datei ${eintrag!.pfad} wurde nicht sondiert (liegt sie auf diesem Rechner?)`);
      continue;
    }
    if (z.t > gesamt - 0.05) {
      nein(`Klang bei ${s1(z.t)} s liegt nicht im Video (${s1(gesamt)} s lang)`);
      continue;
    }
    if (sounds.length >= klangMax) {
      nein(`Mehr als ${klangMax} Klänge in ${s1(gesamt)} s (Marke: ton.sfxDichte ${ctx.ton!.sfxDichte} je Sekunde)`);
      continue;
    }
    if (sounds.filter((o) => o.t > z.t - 1 && o.t <= z.t).length >= KLAENGE_JE_SEKUNDE) {
      nein(`Mehr als ${KLAENGE_JE_SEKUNDE} Klänge in einer Sekunde bei ${s1(z.t)} s`);
      continue;
    }
    if (!klangQuellen.some((o) => o.id === q.id)) klangQuellen.push(q);
    const dauer = Math.min(q.dauer, gesamt - z.t);
    const pegelDb = z.pegelDb ?? KLANG_PEGEL_STANDARD;
    sounds.push({ katalog: z.katalog, art: eintrag!.klang!.art, t: z.t, dauer, pegelDb });
    planSounds.push({ quelle: q.id, katalog: z.katalog, art: eintrag!.klang!.art, t: z.t, dauer, pegelDb, begruendung: z.begruendung });
  }

  const ohneZoom = leseSchnittplan({ ...plan, quellen: klangQuellen, broll, overlays, sounds: planSounds, woerter: neueWoerter });
  const neu = wendeZoomsAn(ohneZoom, einsaetze);
  return { plan: neu, storyboard: geprueft.plan, verworfen, warnungen, renderListe, betont, zooms, verworfeneZooms, sounds, verworfeneSounds };
}

export { StoryboardFehler };
