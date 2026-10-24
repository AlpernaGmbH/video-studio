import fs from "node:fs";
import path from "node:path";
import type { Args } from "../args";
import type { KatalogEintrag } from "../core/schemas";
import type { OffenerEintrag } from "./katalog";
import type { Umgebung } from "../motion/werkstatt";
import { studioHome } from "../setup";
import { relativierePfad } from "../schnitt/uebergabe";
import { leseSchnittplan } from "../schnitt/plan";
import { fuegeBeschreibungenEin, ladeKatalog, ladeOffen, markiereGenutzt, naechsterSchluessel, projektKennung, setzeKlang, speichereKatalog, speichereOffen, sucheKatalog } from "./katalog";
import { messeKlangpegel } from "../presets/messen";
import { loesePfad } from "../schnitt/uebergabe";
import { scanne, artVonDatei, type ScanWerkzeuge } from "./scan";
import { erzeugeBoegen } from "./bogen";
import { spawnSync } from "node:child_process";
import { medienOrdner } from "../setup";

/** Befehle `studio katalog …` (Bauplan v2, Kap. 3.7). Der Katalog liegt im Datenordner: katalog.json, katalog-offen.json, katalog/vorschau/. */

export const KATALOG_HILFE = `Katalog der Fotos, B-Roll und Sounds (Bauplan v2, Kap. 3.7)
  katalog scan [ordner oder datei] [--max n] [--ohne-vorschau]
                                      Scannen: Metadaten (ffprobe) und drei Vorschaubilder je Clip. Neue Dateien landen als «offen» in katalog-offen.json,
                                      bekannte werden übersprungen, Originale bleiben unberührt. Ohne Angabe wird der Ordner «rohmaterial» im Medien-Ordner gescannt.
                                      Danach entstehen die Bögen zum Beschreiben (siehe «./studio katalog bogen») und der Ordner mit den Bögen geht im Finder auf.
  katalog bogen                       Bögen neu erzeugen: Bilder mit der Katalog-Nummer auf jedem Clip, vier Clips pro Bild. Die Bilder in den Chat ziehen, dort werden die Clips beschrieben.
  katalog offen [--limit 10]          Die nächsten offenen Dateien als JSON mit Pfaden der Vorschaubilder (für Claude Code auf dem Mac)
  katalog beschreibe [--zwischenablage | --json datei.json | --json -]
                                      Beschreibungen übernehmen: [{"schluessel","titel","beschreibung","tags","sicherheit","besteSekunden"?,"personen"?,"log"?}].
                                      --zwischenablage liest die Liste aus der Zwischenablage (macOS: JSON im Chat kopieren, dann diesen Befehl), «--json -» aus der Eingabe.
                                      Text drumherum und Codezäune stören nicht. Ein vorhandener Eintrag wird überschrieben (Korrektur). Ungültiges bleibt mit Grund liegen.
  katalog klang <schluessel> --art klick|schlag|whoosh|flaeche|glocke --lizenz "…" --quelle "…" [--ohne-messen]
                                      Trägt bei einem Sound Art, Lizenz und Quelle ein (M8) und misst Spitze und Lautheit der Datei. Das macht ein Mensch: Claude erfindet keine Lizenz.
                                      Ohne Lizenz und Quelle darf das Storyboard den Sound nicht benutzen. Es gibt keine Klänge im Repo und kein Herunterladen aus dem Netz.
  katalog genutzt --plan plan.json [--datum JJJJ-MM-TT]
                                      Trägt ein, dass die B-Roll des Plans in diesem Video vorkam (Feld «zuletzt genutzt», Kennung «Name [marke]»).
                                      Erst aufrufen, wenn das Video fertig ist: Danach gilt die B-Roll im nächsten Video derselben Marke als «lief schon».
  katalog liste [--suche "begriffe"] [--art video|foto|sound] [--offen]
  katalog zeige <schluessel>          Ein Eintrag als JSON
`;

const SCHLUESSEL_HILFE = "Titel nach dem Schema Kunde_Ort_Motiv_Aktion_Datum; Ort und Kunde aus ordnerHinweis und gps, nicht raten; Tags deutsch; besteSekunden bei Videos; sicherheit hoch, mittel oder niedrig";

const sek = (n: number): string => n.toFixed(1).replace(".", ",");

/** Liest eine JSON-Liste aus Text, auch wenn Erklärungen oder Codezäune darum stehen: vom ersten «[» bis zur passenden «]». */
export function extrahiereListe(text: string): unknown[] {
  const start = text.indexOf("[");
  if (start < 0) throw new Error("Keine Liste gefunden: Der Text muss mit [ beginnen und die Beschreibungen als {…} enthalten");
  let tiefe = 0;
  let inString = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i]!;
    if (inString) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "[") tiefe++;
    else if (c === "]" && --tiefe === 0) {
      try {
        const roh = JSON.parse(text.slice(start, i + 1)) as unknown;
        if (Array.isArray(roh)) return roh;
      } catch (e) {
        throw new Error(`Die Liste ist kein gültiges JSON: ${(e as Error).message}`);
      }
    }
  }
  throw new Error("Die Liste ist unvollständig: Die schliessende ] fehlt. Wurde beim Kopieren etwas abgeschnitten?");
}

/** Bögen erzeugen, ihre Orte nennen und auf dem Mac den Ordner im Finder öffnen. */
async function zeigeBoegen(offen: OffenerEintrag[], dd: string, oeffnen: boolean): Promise<void> {
  const ziel = path.join(dd, "katalog", "bogen");
  let r: Awaited<ReturnType<typeof erzeugeBoegen>>;
  try {
    r = await erzeugeBoegen(offen, dd, ziel);
  } catch (e) {
    console.log(`\nFEHLER bei den Bögen: ${(e as Error).message}\nDie Vorschaubilder liegen einzeln in ${path.join(dd, "katalog", "vorschau")}.`);
    return;
  }
  if (!r.dateien.length) {
    console.log("Es gibt keine Vorschaubilder, also keine Bögen.");
    return;
  }
  console.log(`\n${r.dateien.length} ${r.dateien.length === 1 ? "Bogen" : "Bögen"} zum Beschreiben in ${ziel}:`);
  r.dateien.forEach((d, i) => console.log(`  ${path.basename(d)}: ${r.inhalt[i]!.join(", ")}`));
  if (r.ohneBild.length) console.log(`Ohne Bild (nur Dateiname und Metadaten): ${r.ohneBild.map((o) => o.schluessel).join(", ")}`);
  console.log("\nNächster Schritt: die Bilder in den Chat ziehen und «beschreibe die Clips» schreiben. Die Liste, die zurückkommt, kopieren und dann:\n  ./studio katalog beschreibe --zwischenablage");
  if (oeffnen && process.platform === "darwin") spawnSync("open", [ziel]);
}

export async function katalogBefehl(sub: string, a: Args, env: Umgebung, werkzeuge?: ScanWerkzeuge): Promise<number> {
  const dd = env.datenDir;
  switch (sub) {
    case "scan": {
      const home = studioHome();
      if (!home) throw new Error("Der Studio-Ordner ist auf diesem Rechner nicht eingerichtet: «./studio init» ausführen");
      const ziel = a.pos[2] ?? path.join(medienOrdner(home), "rohmaterial");
      const abs = path.resolve(ziel);
      if (!fs.existsSync(abs)) throw new Error(`${a.pos[2] ? "Nicht gefunden" : "Der Standardordner fehlt"}: ${abs}${a.pos[2] ? "" : ". Ordner angeben: ./studio katalog scan <ordner oder datei>"}`);
      const istDatei = fs.statSync(abs).isFile();
      if (istDatei && !artVonDatei(abs)) throw new Error(`Das ist kein Video, Foto oder Sound: ${abs}`);
      const katalog = ladeKatalog(dd);
      const offen = ladeOffen(dd);
      const bekannt = new Set([...katalog.map((k) => k.pfad), ...offen.map((o) => o.pfad)]);
      const max = typeof a.opt["max"] === "string" ? Number(a.opt["max"]) : undefined;
      if (max !== undefined && !(Number.isInteger(max) && max > 0)) throw new Error("--max erwartet eine ganze Zahl über 0");
      const r = await scanne({
        ordner: istDatei ? path.dirname(abs) : abs,
        ...(istDatei ? { dateien: [abs] } : {}),
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
      const gesamtOffen = [...offen, ...r.neu];
      if (!gesamtOffen.length) {
        console.log(r.uebersprungen.length ? "Keine Datei konnte gelesen werden." : "Nichts zu beschreiben.");
        return r.uebersprungen.length ? 1 : 0;
      }
      console.log(`${gesamtOffen.length} Dateien warten auf ihre Beschreibung.`);
      if (a.opt["ohne-vorschau"] !== true) await zeigeBoegen(gesamtOffen, dd, werkzeuge === undefined);
      else console.log("Ohne Vorschaubilder gibt es keine Bögen. Nächster Schritt: «./studio katalog offen».");
      if (r.zurueckgestellt) console.log("Danach den Scan wiederholen, die übrigen Dateien kommen dann dran.");
      return r.uebersprungen.length && !r.neu.length ? 1 : 0;
    }
    case "bogen": {
      const offen = ladeOffen(dd);
      if (!offen.length) {
        console.log("Nichts zu beschreiben: Es gibt keine offenen Dateien.");
        return 0;
      }
      await zeigeBoegen(offen, dd, true);
      return 0;
    }
    case "offen": {
      const limit = typeof a.opt["limit"] === "string" ? Number(a.opt["limit"]) : 10;
      if (!(Number.isInteger(limit) && limit > 0)) throw new Error("--limit erwartet eine ganze Zahl über 0");
      const offen = ladeOffen(dd);
      const naechste = offen.slice(0, limit).map((o) => ({ ...o, vorschau: o.vorschau.map((v) => path.join(dd, v)) }));
      console.log(JSON.stringify(naechste, null, 2));
      console.error(`${naechste.length} von ${offen.length} offenen Dateien. Antwort als JSON-Liste für «./studio katalog beschreibe»: ${SCHLUESSEL_HILFE}.`);
      return 0;
    }
    case "beschreibe": {
      let text: string;
      if (a.opt["zwischenablage"] === true) {
        const r = spawnSync("pbpaste", [], { encoding: "utf8" });
        if (r.error || r.status !== 0) throw new Error("Die Zwischenablage lässt sich nur auf dem Mac lesen (pbpaste). Stattdessen: --json datei.json");
        text = r.stdout;
        if (!text.trim()) throw new Error("Die Zwischenablage ist leer. Zuerst die JSON-Liste im Chat kopieren (Kopieren-Knopf am Codeblock)");
      } else if (a.opt["json"] === "-") text = fs.readFileSync(0, "utf8");
      else if (typeof a.opt["json"] === "string") text = fs.readFileSync(a.opt["json"] as string, "utf8");
      else throw new Error("Aufruf: ./studio katalog beschreibe --zwischenablage   (oder --json datei.json, oder --json - für die Eingabe)");
      const roh = extrahiereListe(text);
      const e = fuegeBeschreibungenEin(ladeOffen(dd), ladeKatalog(dd), roh);
      if (e.neu.length || e.ueberschrieben.length) {
        speichereKatalog(dd, e.katalog);
        speichereOffen(dd, e.offen);
      }
      console.log(`${e.neu.length} neu im Katalog, ${e.ueberschrieben.length} überschrieben, ${e.fehler.length} abgelehnt; ${e.offen.length} offen, ${e.katalog.length} im Katalog`);
      for (const f of e.fehler) console.log(`  ${f.schluessel}: ${f.grund}`);
      if (e.offen.length) console.log(`Noch offen: ${e.offen.map((o) => o.schluessel).join(", ")}`);
      return e.fehler.length ? 1 : 0;
    }
    case "klang": {
      const key = a.pos[2];
      if (!key) throw new Error("Aufruf: katalog klang <schluessel> --art … --lizenz \"…\" --quelle \"…\"");
      const feld = (n: string): string | undefined => (typeof a.opt[n] === "string" ? (a.opt[n] as string) : undefined);
      const alle = ladeKatalog(dd);
      const eintrag = alle.find((x) => x.schluessel === key);
      let gemessen: { spitzeDb?: number; lufs?: number } = {};
      let notiz = "";
      if (eintrag?.art === "sound" && a.opt["ohne-messen"] !== true) {
        const home = studioHome();
        const abs = home ? loesePfad(home, eintrag.pfad) : undefined;
        if (!abs || !fs.existsSync(abs)) notiz = "nicht gemessen: Die Datei liegt nicht auf diesem Rechner";
        else {
          try {
            const m = await messeKlangpegel(abs);
            gemessen = { ...(m.truePeak !== undefined ? { spitzeDb: Math.round(m.truePeak * 10) / 10 } : {}), ...(m.lufs !== undefined ? { lufs: Math.round(m.lufs * 10) / 10 } : {}) };
            if (!Object.keys(gemessen).length) notiz = "nicht gemessen: Die Datei ist stumm";
            else if (m.lufs === undefined) notiz = "Lautheit nicht messbar: Der Klang ist kürzer als 0,4 s";
          } catch (e) {
            notiz = `nicht gemessen: ${(e as Error).message}`;
          }
        }
      }
      const r = setzeKlang(alle, key, { art: feld("art"), lizenz: feld("lizenz"), quelle: feld("quelle"), ...gemessen });
      if ("fehler" in r) {
        console.log(`FEHLER ${r.fehler}`);
        return 1;
      }
      speichereKatalog(dd, r.katalog);
      console.log(`${key}: ${r.klang.art}, Lizenz ${r.klang.lizenz}, Quelle ${r.klang.quelle}${r.klang.spitzeDb !== undefined ? `, Spitze ${sek(r.klang.spitzeDb)} dBTP` : ""}${r.klang.lufs !== undefined ? `, ${sek(r.klang.lufs)} LUFS` : ""}${notiz ? ` (${notiz})` : ""}`);
      return 0;
    }
    case "genutzt": {
      const planDatei = a.opt["plan"];
      if (typeof planDatei !== "string") throw new Error("Aufruf: katalog genutzt --plan plan.json");
      const plan = leseSchnittplan(JSON.parse(fs.readFileSync(planDatei, "utf8")));
      const datum = typeof a.opt["datum"] === "string" ? (a.opt["datum"] as string) : new Date().toISOString().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) throw new Error("--datum erwartet JJJJ-MM-TT");
      const schluessel = [...new Set(plan.broll.map((b) => b.katalog))];
      if (!schluessel.length) {
        console.log("Der Plan hat keine B-Roll: nichts einzutragen");
        return 0;
      }
      const r = markiereGenutzt(ladeKatalog(dd), schluessel, { datum, projekt: projektKennung(plan.projekt.name, plan.projekt.marke) });
      if (r.markiert.length) speichereKatalog(dd, r.katalog);
      console.log(`${r.markiert.length} Einträge als zuletzt genutzt vermerkt (${projektKennung(plan.projekt.name, plan.projekt.marke)}, ${datum})${r.unbekannt.length ? `; nicht im Katalog: ${r.unbekannt.join(", ")}` : ""}`);
      return r.unbekannt.length ? 1 : 0;
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
        const klang = k.art === "sound" ? (k.klang ? `  ${k.klang.art}, Lizenz ${k.klang.lizenz}` : "  OHNE Lizenz (im Storyboard nicht verwendbar)") : "";
        console.log(`${k.schluessel}  ${k.art}${k.orientierung ? `  ${k.orientierung}` : ""}${laenge ? `  ${laenge}` : ""}${klang}  ${k.titel}  [${k.tags.join(", ")}]`);
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
