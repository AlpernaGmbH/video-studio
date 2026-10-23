import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { KatalogEintrag } from "../core/schemas";
import { echteWerkzeuge, type FotoWerkzeuge } from "../foto/werkzeug";
import { findeSchrift } from "../katalog/bogen";
import { KATALOG_DATEI } from "../katalog/katalog";
import type { ReelPfade } from "./reel";
import { baueGeruest, kachelKopf, pruefeShotliste, shotlisteText, umbrich, vorschauKandidaten, type Shotliste } from "./shotliste";
import { schreibeBogen, TEXT_ZEILEN, ZEICHEN_JE_ZEILE, type Kachel } from "./shotliste-bogen";

/**
 * `reel shotliste <ID>`: aus dem Skript ein Gerüst (`--geruest`), aus der Liste von Claude (`ergebnis/shotliste.json`) die Shotliste als Text und der Bogen mit den Beispielbildern aus dem Katalog.
 * Der Befehl schreibt nur nach `ergebnis/` (shotliste.json beim Gerüst, shotliste.md und shotliste-bogen.jpg beim Prüfen) und gibt nichts frei. Er lädt nichts hoch: Das tut `tool hochladen`.
 */

export interface ShotlisteEingabe {
  id: string;
  pfade: Pick<ReelPfade, "ergebnis" | "shotliste" | "shotlisteText" | "shotlisteBogen">;
  /** Das Skript des Reels, aus dem das Gerüst entsteht. */
  skriptDatei: string;
  titel: string;
  datenDir: string;
  katalogDatei?: string;
  geruest: boolean;
  neu: boolean;
  /** Die Liste von Claude liegt woanders als in `ergebnis/shotliste.json`. */
  datei?: string;
  werkzeuge?: FotoWerkzeuge;
  schrift?: string;
  jetzt?: () => Date;
  aus?: (zeile: string) => void;
  fehl?: (zeile: string) => void;
}

function ladeKatalog(o: Pick<ShotlisteEingabe, "datenDir" | "katalogDatei">): { katalog: KatalogEintrag[]; notiz: string } {
  const datei = o.katalogDatei ?? path.join(o.datenDir, KATALOG_DATEI);
  if (!fs.existsSync(datei)) {
    if (o.katalogDatei) throw new Error(`Katalog fehlt: ${datei}`);
    return { katalog: [], notiz: `Kein Katalog gefunden (${datei}): Es gibt keine Beispielbilder` };
  }
  return { katalog: z.array(KatalogEintrag).parse(JSON.parse(fs.readFileSync(datei, "utf8"))), notiz: "" };
}

/** Schreibt eine Datei ganz oder gar nicht. */
function schreibeGanz(ziel: string, inhalt: string): void {
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  const nebenan = `${ziel}.neu`;
  fs.writeFileSync(nebenan, inhalt);
  fs.renameSync(nebenan, ziel);
}

/** Die Kacheln des Bogens: Beispielbild aus dem Datenordner oder ein Platzhalter, der sagt, warum es keines gibt. */
export function baueKacheln(liste: Shotliste, katalog: KatalogEintrag[], datenDir: string): Kachel[] {
  const nachSchluessel = new Map(katalog.map((k) => [k.schluessel, k]));
  return liste.einstellungen.map((e) => {
    const k = e.beispiel ? nachSchluessel.get(e.beispiel) : undefined;
    const bild = k ? vorschauKandidaten(k).map((rel) => path.join(datenDir, rel)).find((p) => fs.existsSync(p)) : undefined;
    const zeilen = [kachelKopf(e), k ? k.schluessel : "kein Beispielbild", ...umbrich(e.bild, ZEICHEN_JE_ZEILE, TEXT_ZEILEN - 2)];
    return {
      ...(bild ? { bild } : {}),
      platzhalter: k ? "Vorschaubild fehlt" : "Kein Beispielbild",
      text: zeilen.join("\n"),
    };
  });
}

export async function fuehreShotlisteAus(o: ShotlisteEingabe): Promise<number> {
  const aus = o.aus ?? ((z: string) => console.log(z));
  const fehl = o.fehl ?? ((z: string) => console.error(z));
  const jetzt = o.jetzt ?? (() => new Date());
  const p = o.pfade;

  if (o.geruest) {
    if (!fs.existsSync(o.skriptDatei)) {
      fehl(`Das Skript fehlt: ${o.skriptDatei}\nZuerst «./studio reel neu ${o.id} --zwischenablage» ausführen (das Skript kopieren) oder die Datei anlegen.`);
      return 1;
    }
    if (fs.existsSync(p.shotliste) && !o.neu) {
      fehl(`Es gibt schon eine Shotliste (${p.shotliste}). Mit --neu wird sie durch ein leeres Gerüst ersetzt; die Beschreibungen darin gehen verloren.`);
      return 1;
    }
    let geruest: Shotliste;
    try {
      geruest = baueGeruest(fs.readFileSync(o.skriptDatei, "utf8"), o.id, o.titel);
    } catch (e) {
      fehl((e as Error).message);
      return 1;
    }
    schreibeGanz(p.shotliste, `${JSON.stringify(geruest, null, 2)}\n`);
    aus(`Gerüst geschrieben: ${p.shotliste}`);
    aus(`${geruest.einstellungen.length} Einstellungen aus dem Skript. Die Dauer ist aus der Wortzahl geschätzt (150 Wörter je Minute, eine Annahme).`);
    aus(`Nächster Schritt: Claude beschreibt in jeder Einstellung «bild», setzt «groesse» und «beispiel» (ein Schlüssel aus dem Katalog: «./studio katalog liste --suche "…"»).`);
    aus(`Dann «./studio reel shotliste ${o.id}» (prüft, schreibt den Text und den Bogen).`);
    return 0;
  }

  // prüfen, schreiben
  const quelle = o.datei ?? p.shotliste;
  if (!fs.existsSync(quelle)) {
    fehl(`Es gibt noch keine Shotliste (${quelle}). «./studio reel shotliste ${o.id} --geruest» schreibt das Gerüst aus dem Skript.`);
    return 1;
  }
  let roh: unknown;
  try {
    roh = JSON.parse(fs.readFileSync(quelle, "utf8"));
  } catch (e) {
    fehl(`Die Shotliste ist kein gültiges JSON (${(e as Error).message})`);
    return 1;
  }
  let katalogStand: { katalog: KatalogEintrag[]; notiz: string };
  try {
    katalogStand = ladeKatalog(o);
  } catch (e) {
    fehl((e as Error).message);
    return 1;
  }
  const { katalog, notiz } = katalogStand;
  if (notiz) fehl(notiz);
  const r = pruefeShotliste(roh, katalog, o.id);
  for (const h of r.hinweise) aus(`Hinweis: ${h}`);
  for (const v of r.vorschlaege) {
    const namen = v.schluessel.map((s) => `${s} «${katalog.find((k) => k.schluessel === s)?.titel ?? ""}»`).join(", ");
    aus(`Vorschlag für Einstellung ${v.nr} (nach Wörtern gefunden, nicht übernommen): ${namen}`);
  }
  if (!r.liste) {
    fehl("Die Shotliste ist nicht gültig, es wurde nichts geschrieben:");
    for (const f of r.fehler) fehl(`  - ${f}`);
    return 1;
  }
  const liste = r.liste;

  // Der Text zuerst: Er braucht kein ffmpeg.
  const text = shotlisteText(liste, katalog, jetzt());
  schreibeGanz(p.shotlisteText, text);
  if (o.datei && path.resolve(o.datei) !== path.resolve(p.shotliste)) schreibeGanz(p.shotliste, `${JSON.stringify(liste, null, 2)}\n`);

  const schrift = o.schrift ?? findeSchrift();
  if (!schrift) {
    fehl("Für die Beschriftung des Bogens fehlt eine Schrift. Mit STUDIO_FONT=/Pfad/zur/Schrift.ttf eine angeben. Der Text der Shotliste ist geschrieben, der Bogen nicht.");
    aus(`Shotliste (Text): ${p.shotlisteText}`);
    return 1;
  }
  try {
    await schreibeBogen(o.werkzeuge ?? echteWerkzeuge, { kacheln: baueKacheln(liste, katalog, o.datenDir), schrift, ausgang: p.shotlisteBogen });
  } catch (e) {
    fehl(`${(e as Error).message}\nDer Text der Shotliste ist geschrieben (${p.shotlisteText}), der Bogen nicht.`);
    return 1;
  }
  const ohne = liste.einstellungen.filter((e) => !e.beispiel).length;
  aus(`Shotliste: ${p.shotlisteText}`);
  aus(`Bogen mit Beispielbildern: ${p.shotlisteBogen}`);
  aus(`${liste.einstellungen.length} Einstellungen, ${liste.einstellungen.length - ohne} mit Beispielbild${ohne ? `, ${ohne} ohne (Lücke im Katalog oder noch nicht gewählt)` : ""}.`);
  aus(`Aufs Handy: «./studio tool hochladen ${o.id} --art shotliste,shotliste_bogen» (nur wenn ein Admin Vorschauen für diesen Inhalt erlaubt hat).`);
  return 0;
}
