import fs from "node:fs";
import path from "node:path";
import type { Args } from "../args";
import type { KatalogEintrag } from "../core/schemas";
import type { Umgebung } from "../motion/werkstatt";
import { studioHome } from "../setup";
import { relativierePfad } from "../schnitt/uebergabe";
import { fuegeBeschreibungenEin, ladeKatalog, ladeOffen, naechsterSchluessel, speichereKatalog, speichereOffen, sucheKatalog } from "./katalog";
import { scanne, type ScanWerkzeuge } from "./scan";

/** Befehle `studio katalog …` (Bauplan v2, Kap. 3.7). Der Katalog liegt im Datenordner: katalog.json, katalog-offen.json, katalog/vorschau/. */

export const KATALOG_HILFE = `Katalog der Fotos, B-Roll und Sounds (Bauplan v2, Kap. 3.7)
  katalog scan <ordner> [--max n] [--ohne-vorschau]
                                      Ordner scannen: Metadaten (ffprobe) und drei Vorschaubilder je Clip. Neue Dateien landen als «offen» in katalog-offen.json,
                                      bekannte werden übersprungen, Originale bleiben unberührt. Der Ordner muss im Studio- oder Medien-Ordner liegen.
  katalog offen [--limit 10]          Die nächsten offenen Dateien als JSON mit Pfaden der Vorschaubilder (Claude sieht sie an und beschreibt sie)
  katalog beschreibe --json datei.json
                                      Beschreibungen von Claude übernehmen: [{"schluessel","titel","beschreibung","tags","sicherheit","besteSekunden"?,"personen"?,"log"?}].
                                      Ein vorhandener Eintrag wird überschrieben (Korrektur). Ungültiges bleibt mit Grund liegen.
  katalog liste [--suche "begriffe"] [--art video|foto|sound] [--offen]
  katalog zeige <schluessel>          Ein Eintrag als JSON
`;

const SCHLUESSEL_HILFE = "Titel nach dem Schema Kunde_Ort_Motiv_Aktion_Datum; Ort und Kunde aus ordnerHinweis und gps, nicht raten; Tags deutsch; besteSekunden bei Videos; sicherheit hoch, mittel oder niedrig";

const sek = (n: number): string => n.toFixed(1).replace(".", ",");

export async function katalogBefehl(sub: string, a: Args, env: Umgebung, werkzeuge?: ScanWerkzeuge): Promise<number> {
  const dd = env.datenDir;
  switch (sub) {
    case "scan": {
      const ordner = a.pos[2];
      if (!ordner) throw new Error("Aufruf: katalog scan <ordner>");
      const abs = path.resolve(ordner);
      if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) throw new Error(`Kein Ordner: ${abs}`);
      const home = studioHome();
      if (!home) throw new Error("Der Studio-Ordner ist auf diesem Rechner nicht eingerichtet: «studio init» ausführen");
      const katalog = ladeKatalog(dd);
      const offen = ladeOffen(dd);
      const bekannt = new Set([...katalog.map((k) => k.pfad), ...offen.map((o) => o.pfad)]);
      const max = typeof a.opt["max"] === "string" ? Number(a.opt["max"]) : undefined;
      if (max !== undefined && !(Number.isInteger(max) && max > 0)) throw new Error("--max erwartet eine ganze Zahl über 0");
      const r = await scanne({
        ordner: abs,
        relativ: (d) => relativierePfad(home, d),
        bekannt,
        naechster: naechsterSchluessel([...katalog.map((k) => k.schluessel), ...offen.map((o) => o.schluessel)]),
        datenDir: dd,
        maximal: max,
        ohneVorschau: a.opt["ohne-vorschau"] === true,
        werkzeuge,
      });
      if (r.neu.length) speichereOffen(dd, [...offen, ...r.neu]);
      console.log(`${r.neu.length} neue Dateien, ${r.bekannt} schon bekannt${r.zurueckgestellt ? `, ${r.zurueckgestellt} zurückgestellt (--max)` : ""}`);
      for (const u of r.uebersprungen) console.log(`  übersprungen: ${u.datei}: ${u.grund}`);
      const gesamtOffen = offen.length + r.neu.length;
      console.log(`${gesamtOffen} Dateien warten auf ihre Beschreibung. Nächster Schritt: «studio katalog offen» (Claude sieht sich die Vorschaubilder an und beschreibt sie)${r.zurueckgestellt ? `; danach den Scan wiederholen` : ""}.`);
      return r.uebersprungen.length && !r.neu.length ? 1 : 0;
    }
    case "offen": {
      const limit = typeof a.opt["limit"] === "string" ? Number(a.opt["limit"]) : 10;
      if (!(Number.isInteger(limit) && limit > 0)) throw new Error("--limit erwartet eine ganze Zahl über 0");
      const offen = ladeOffen(dd);
      const naechste = offen.slice(0, limit).map((o) => ({ ...o, vorschau: o.vorschau.map((v) => path.join(dd, v)) }));
      console.log(JSON.stringify(naechste, null, 2));
      console.error(`${naechste.length} von ${offen.length} offenen Dateien. Antwort als JSON-Liste für «katalog beschreibe»: ${SCHLUESSEL_HILFE}.`);
      return 0;
    }
    case "beschreibe": {
      const datei = a.opt["json"];
      if (typeof datei !== "string") throw new Error("Aufruf: katalog beschreibe --json datei.json");
      const roh = JSON.parse(fs.readFileSync(datei, "utf8")) as unknown;
      if (!Array.isArray(roh)) throw new Error("Die Datei muss eine Liste von Beschreibungen enthalten");
      const e = fuegeBeschreibungenEin(ladeOffen(dd), ladeKatalog(dd), roh);
      if (e.neu.length || e.ueberschrieben.length) {
        speichereKatalog(dd, e.katalog);
        speichereOffen(dd, e.offen);
      }
      console.log(`${e.neu.length} neu im Katalog, ${e.ueberschrieben.length} überschrieben, ${e.fehler.length} abgelehnt; ${e.offen.length} offen, ${e.katalog.length} im Katalog`);
      for (const f of e.fehler) console.log(`  ${f.schluessel}: ${f.grund}`);
      return e.fehler.length ? 1 : 0;
    }
    case "liste": {
      if (a.opt["offen"] === true) {
        const offen = ladeOffen(dd);
        for (const o of offen) console.log(`${o.schluessel}  ${o.art}  ${o.pfad}${o.dauer ? `  ${sek(o.dauer)} s` : ""}`);
        console.log(`${offen.length} offen`);
        return 0;
      }
      const art = typeof a.opt["art"] === "string" ? (a.opt["art"] as KatalogEintrag["art"]) : undefined;
      if (art && !["video", "foto", "sound"].includes(art)) throw new Error("--art: video, foto oder sound");
      const alle = ladeKatalog(dd);
      const treffer = typeof a.opt["suche"] === "string" ? sucheKatalog(alle, a.opt["suche"] as string, { art }) : art ? alle.filter((k) => k.art === art) : alle;
      for (const k of treffer) {
        const laenge = k.art === "video" ? (k.besteSekunden ? `${sek(k.besteSekunden.bis - k.besteSekunden.von)} s nutzbar` : k.dauer ? `${sek(k.dauer)} s` : "") : "";
        console.log(`${k.schluessel}  ${k.art}${k.orientierung ? `  ${k.orientierung}` : ""}${laenge ? `  ${laenge}` : ""}  ${k.titel}  [${k.tags.join(", ")}]`);
      }
      console.log(`${treffer.length} von ${alle.length} Einträgen`);
      return 0;
    }
    case "zeige": {
      const key = a.pos[2];
      if (!key) throw new Error("Aufruf: katalog zeige <schluessel>");
      const k = ladeKatalog(dd).find((x) => x.schluessel === key) ?? ladeOffen(dd).find((x) => x.schluessel === key);
      if (!k) throw new Error(`Schlüssel «${key}» steht weder im Katalog noch bei den offenen Dateien`);
      console.log(JSON.stringify(k, null, 2));
      return 0;
    }
    default:
      console.error(`Unbekannter Befehl «katalog ${sub}»\n`);
      console.error(KATALOG_HILFE);
      return 2;
  }
}
