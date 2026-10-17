import fs from "node:fs";
import path from "node:path";
import type { Args } from "../args";
import { ladeMarke, type Umgebung } from "../motion/werkstatt";
import { zeilenAusAbfrage } from "../notion/abbild";
import { abgleich, zaehle } from "./abgleich";
import { FORMATE, zeileZuInhalt, type Format } from "./inhalt";
import { gate0Abgleich } from "./gate0";
import { gate0Funktion, markenNachSeite, zeileZuMarke } from "./marken";
import { ladeStand, speichereStand } from "./stand";
import { textBestanden, textpruefung } from "./textpruefung";

/** Befehle `studio inhalte …`. Sie lesen JSON-Dateien (Ergebnis der Notion-Ansichten) und schreiben nur den lokalen Stand, nie nach Notion. */

export const INHALTE_HILFE = `Inhalte (Plan v3; die Sitzung holt die Zeilen und schreibt die Eingriffe mit den Notion-Werkzeugen)
  inhalte abgleich --inhalte zeilen.json --marken marken.json [--erstlauf] [--uebernehmen]
                                      Zeilen der Ansicht «Inhalte» gegen den Stand prüfen. Gibt JSON aus: je Zeile übernommen, weiter,
                                      zurückgesetzt, geleert, blockiert oder Hinweis, dazu fertige Eigenschaften für notion-update-page.
                                      Ohne --uebernehmen nur der Bericht. --erstlauf: bestehende Zeilen in ihrem Status übernehmen.
  inhalte textpruefen --marke key --format "LinkedIn-Post" --text-datei entwurf.txt (--beleg "…" | --beleg-datei beleg.txt) [--id c-0007]
                                      Textprüfung (verbotene Wörter, ss, Gedankenstriche, Zahlenformat, Zahl ohne Beleg, Länge). Mit --id
                                      wird das Ergebnis als Prüfung des Entwurfs im Stand vermerkt. Exit-Code 1 bei Fehlern.
  inhalte pruefung <id> (--bestanden | --nicht-bestanden) [--text "…"]
                                      Ergebnis der Prüfung eines Entwurfs (zum Beispiel Render-Prüfung) im Stand vermerken.
`;

export const MARKEN_HILFE = `Marken (Gate 0)
  marken gate0 --marken marken.json [--anwenden]
                                      Gate 0 aus der Ansicht «Marken» ins Profil marken/<id>.json übernehmen: Eine Freigabe mit Namen setzt das Profil auf
                                      «freigegeben» (mit Name und Zeit), ein Widerruf setzt es auf «platzhalter». Ohne --anwenden nur der Bericht.
                                      Danach die geänderte Datei committen.
`;

const lesJson = (datei: string): unknown => JSON.parse(fs.readFileSync(datei, "utf8"));
const standDatei = (env: Umgebung): string => path.join(env.datenDir, "inhalte-stand.json");
const pflicht = (a: Args, name: string, hilfe: string): string => {
  const v = a.opt[name];
  if (typeof v !== "string" || !v) throw new Error(`--${name} fehlt (${hilfe})`);
  return v;
};
const gueltigeId = (id: string | undefined): string => {
  if (!id || !/^c-\d{4}$/.test(id)) throw new Error("Inhalt-ID im Format c-0007 fehlt");
  return id;
};

export function inhalteBefehl(sub: string, a: Args, env: Umgebung, jetzt: () => string = () => new Date().toISOString()): number {
  switch (sub) {
    case "abgleich": {
      const zeilen = zeilenAusAbfrage(lesJson(pflicht(a, "inhalte", "Ergebnis der Ansicht «Inhalte», Modus view")));
      const marken = zeilenAusAbfrage(lesJson(pflicht(a, "marken", "Ergebnis der Ansicht «Marken», Modus view"))).map(zeileZuMarke);
      const inhalte = zeilen.map((z) => zeileZuInhalt(z, markenNachSeite(marken)));
      const stand = ladeStand(standDatei(env));
      const r = abgleich(stand, inhalte, { jetzt: jetzt(), gate0: gate0Funktion(marken), erstlauf: a.opt["erstlauf"] === true });
      const speichern = a.opt["uebernehmen"] === true;
      if (speichern) speichereStand(standDatei(env), r.stand);
      console.log(
        JSON.stringify(
          {
            gespeichert: speichern,
            zaehlung: zaehle(r.befunde),
            eingriffe: r.befunde.filter((b) => b.eingriff).map((b) => ({ id: b.id, titel: b.titel, url: b.url, art: b.art, text: b.text, eigenschaften: b.eigenschaften })),
            blockiert: r.befunde.filter((b) => b.art === "blockiert").map((b) => ({ id: b.id, titel: b.titel, text: b.text, fehler: b.fehler })),
            zurueckgesetzt: r.befunde.filter((b) => b.art === "zurueckgesetzt").map((b) => ({ id: b.id, titel: b.titel, text: b.text, fehler: b.fehler })),
            hinweise: r.befunde.filter((b) => b.art === "hinweis").map((b) => ({ id: b.id, titel: b.titel, text: b.text })),
          },
          null,
          2,
        ),
      );
      return 0;
    }
    case "textpruefen": {
      const key = pflicht(a, "marke", "Schlüssel des Markenprofils, zum Beispiel alperna");
      const format = a.opt["format"];
      if (typeof format !== "string" || !(FORMATE as readonly string[]).includes(format)) throw new Error(`--format fehlt oder unbekannt (${FORMATE.join(", ")})`);
      const text = fs.readFileSync(pflicht(a, "text-datei", "Datei mit dem Entwurf"), "utf8");
      const beleg = typeof a.opt["beleg"] === "string" ? a.opt["beleg"] : fs.readFileSync(pflicht(a, "beleg-datei", "Beleg der Idee, als Text oder Datei"), "utf8");
      const marke = ladeMarke(env, key);
      const befunde = textpruefung({ text, beleg, format: format as Format, verboteneWoerter: marke.tonalitaet.verboteneWoerter, schnittprofil: marke.schnittprofil });
      const bestanden = textBestanden(befunde);
      if (typeof a.opt["id"] === "string") {
        const id = gueltigeId(a.opt["id"]);
        const stand = ladeStand(standDatei(env));
        const fehler = befunde.filter((b) => b.stufe === "fehler").map((b) => b.text);
        speichereStand(standDatei(env), { ...stand, pruefungen: { ...stand.pruefungen, [id]: { bestanden, ...(fehler.length ? { text: fehler.join("; ") } : {}), am: jetzt() } } });
      }
      console.log(JSON.stringify({ bestanden, befunde }, null, 2));
      return bestanden ? 0 : 1;
    }
    case "pruefung": {
      const id = gueltigeId(a.pos[2]);
      const ja = a.opt["bestanden"] === true;
      const nein = a.opt["nicht-bestanden"] === true;
      if (ja === nein) throw new Error("Entweder --bestanden oder --nicht-bestanden angeben");
      const stand = ladeStand(standDatei(env));
      const text = typeof a.opt["text"] === "string" && a.opt["text"] ? a.opt["text"] : undefined;
      speichereStand(standDatei(env), { ...stand, pruefungen: { ...stand.pruefungen, [id]: { bestanden: ja, ...(text ? { text } : {}), am: jetzt() } } });
      console.log(`Prüfung für ${id} vermerkt: ${ja ? "bestanden" : "nicht bestanden"}`);
      return 0;
    }
    default:
      console.error(`Unbekannter Befehl «inhalte ${sub}»\n`);
      console.error(INHALTE_HILFE);
      return 2;
  }
}

export function markenBefehl(sub: string, a: Args, env: Umgebung, jetzt: () => string = () => new Date().toISOString()): number {
  if (sub !== "gate0") {
    console.error(`Unbekannter Befehl «marken ${sub}»\n`);
    console.error(MARKEN_HILFE);
    return 2;
  }
  const marken = zeilenAusAbfrage(lesJson(pflicht(a, "marken", "Ergebnis der Ansicht «Marken», Modus view"))).map(zeileZuMarke);
  const datei = (id: string): string => path.join(env.markenDir, `${id}.json`);
  const befunde = gate0Abgleich(marken, (id) => (/^[a-z0-9-]+$/.test(id) && fs.existsSync(datei(id)) ? fs.readFileSync(datei(id), "utf8") : undefined), jetzt());
  const anwenden = a.opt["anwenden"] === true;
  if (anwenden) {
    for (const b of befunde) {
      if (b.neuerText === undefined) continue;
      const tmp = `${datei(b.marke)}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, b.neuerText);
      fs.renameSync(tmp, datei(b.marke));
    }
  }
  console.log(JSON.stringify({ angewendet: anwenden, befunde: befunde.map(({ neuerText, ...rest }) => ({ ...rest, aendertDatei: neuerText !== undefined })) }, null, 2));
  return 0;
}
