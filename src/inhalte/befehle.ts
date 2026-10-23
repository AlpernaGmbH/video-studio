import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Args } from "../args";
import { ladeMarke, type Umgebung } from "../motion/werkstatt";
import { zeilenAusAbfrage } from "../notion/abbild";
import { abgleich, zaehle } from "./abgleich";
import { archivBericht } from "./archiv";
import { FORMATE, zeileZuInhalt, type Format } from "./inhalt";
import { gate0Abgleich } from "./gate0";
import { liesMaterial, materialFehlt, pruefeVorhanden } from "./material";
import { medienOrdner, studioHome } from "../setup";
import { gate0Funktion, markenNachSeite, zeileZuMarke } from "./marken";
import { ladeStand, speichereStand } from "./stand";
import { ladeHookRegeln, hookPruefung } from "./hook-regeln";
import { textBestanden, textpruefung } from "./textpruefung";
import { baueImport, importText } from "./tool-export";

/** Befehle `studio inhalte …`. Sie lesen JSON-Dateien (Ergebnis der Notion-Ansichten) und schreiben nur den lokalen Stand, nie nach Notion. */

export const INHALTE_HILFE = `Inhalte (Plan v3; die Sitzung holt die Zeilen und schreibt die Eingriffe mit den Notion-Werkzeugen)
  inhalte abgleich --inhalte zeilen.json --marken marken.json [--erstlauf] [--uebernehmen]
                                      Zeilen der Ansicht «Inhalte» gegen den Stand prüfen. Gibt JSON aus: je Zeile übernommen, weiter,
                                      zurückgesetzt, geleert, blockiert oder Hinweis, dazu fertige Eigenschaften für notion-update-page.
                                      Ohne --uebernehmen nur der Bericht. --erstlauf: bestehende Zeilen in ihrem Status übernehmen.
  inhalte textpruefen --marke key --format "LinkedIn-Post" --text-datei entwurf.txt (--beleg "…" | --beleg-datei beleg.txt) [--hook "…" | --hook-datei hook.txt] [--id c-0007]
                                      Dazu Empfehlungen zum Hook (nie Fehler, ohne Einfluss auf «bestanden» und den Exit-Code) und drei Prüffragen für dich
                                      Textprüfung (verbotene Wörter, ss, Gedankenstriche, Zahlenformat, Zahl ohne Beleg, Länge). Mit --id
                                      wird das Ergebnis als Prüfung des Entwurfs im Stand vermerkt. Exit-Code 1 bei Fehlern.
  inhalte material --inhalte zeilen.json [--alle]
                                      Material (Feld «Dateien») laufender Inhalte: je Eintrag Art, Ziel und ob die Datei auf diesem Rechner liegt
                                      (Links kann der Rechner nicht prüfen). Nennt auch «Dreh nötig» ohne Footage oder Foto. --alle: auch Ausgewertetes.
  inhalte archiv --inhalte zeilen.json [--thema "…"] [--max 8]
                                      Der Bestand für die Ideenfindung: Archiv (veröffentlicht, ausgewertet) je Pillar, Hook-Muster, Format und Plattform, und wann jeder Pillar
                                      zuletzt dran war. Mit --thema die ähnlichen Beiträge jeden Alters, mit Datum, Alter, Status und bei Verworfenen dem Grund.
                                      Zeigt, was es schon gibt; entscheiden tut ein Mensch. Leistungszahlen stehen im Cockpit «Beiträge · Archiv & Analytics».
  inhalte tool-export --inhalte zeilen.json --marken marken.json --out import.json
                                      Altbestand für den Einmal-Import ins Alperna-Tool als Datei: nur das Archiv (veröffentlicht, ausgewertet, verworfen), ohne Texte,
                                      ohne Beispielzeilen, ohne laufende Zeilen und ohne Zeilen mit entschiedenem Tor, dazu die Marken. Schreibt nur die Datei und sendet nichts:
                                      Ein Admin lädt sie im Tool unter /studio/import hoch und bestätigt. Gibt Prüfsumme, Zahlen und die übersprungenen Zeilen mit Grund aus.
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
      // Empfehlungen zum Hook: unbelegte Regeln aus gesichteten Reels, darum ausserhalb von «befunde» und ohne Einfluss auf «bestanden»
      const hook = typeof a.opt["hook"] === "string" ? a.opt["hook"] : typeof a.opt["hook-datei"] === "string" ? fs.readFileSync(a.opt["hook-datei"], "utf8") : "";
      const hp = hookPruefung({ text, hook, beleg, format: format as Format, regeln: ladeHookRegeln(path.join(env.studioRoot, "library", "hook-regeln.json")) });
      console.log(JSON.stringify({ bestanden, befunde, empfehlungen: hp.empfehlungen, pruefFragen: hp.fragen, hinweis: hp.hinweis }, null, 2));
      return bestanden ? 0 : 1;
    }
    case "material": {
      const zeilen = zeilenAusAbfrage(lesJson(pflicht(a, "inhalte", "Ergebnis der Ansicht «Inhalte», Modus view")));
      const inhalte = zeilen.map((z) => zeileZuInhalt(z));
      const home = studioHome();
      const abgeschlossen = ["Veröffentlicht", "Ausgewertet", "Verworfen", "Pausiert"];
      const gewaehlt = inhalte.filter((i) => a.opt["alle"] === true || !abgeschlossen.includes(i.status || "Neu"));
      const eintraege = gewaehlt
        .map((i) => ({ i, liste: liesMaterial(i.dateien) }))
        .filter(({ i, liste }) => liste.length > 0 || materialFehlt(i))
        .map(({ i, liste }) => {
          const stand = home ? pruefeVorhanden(liste, home.pfad, medienOrdner(home)) : liste.map((eintrag) => ({ eintrag, vorhanden: null as boolean | null }));
          return {
            id: i.id,
            titel: i.titel,
            status: i.status || "Neu",
            materialFehlt: materialFehlt(i),
            eintraege: stand.map((s) => ({ art: s.eintrag.art || "frei", ziel: s.eintrag.ziel, notiz: s.eintrag.notiz, vorhanden: s.vorhanden, ...("megabyte" in s && s.megabyte !== undefined ? { megabyte: s.megabyte } : {}) })),
          };
        });
      const fehlen = eintraege.flatMap((e) => e.eintraege.filter((x) => x.vorhanden === false && x.art !== "frei").map((x) => ({ id: e.id, art: x.art, ziel: x.ziel })));
      console.log(JSON.stringify({ studioOrdner: home ? home.pfad : null, hinweis: home ? undefined : "Studio-Ordner nicht eingerichtet: Dateien wurden nicht geprüft", inhalte: eintraege, dateienFehlen: fehlen }, null, 2));
      return fehlen.length || eintraege.some((e) => e.materialFehlt) ? 1 : 0;
    }
    case "archiv": {
      const zeilen = zeilenAusAbfrage(lesJson(pflicht(a, "inhalte", "Ergebnis der Ansicht «Inhalte», Modus view")));
      const max = typeof a.opt["max"] === "string" ? Number(a.opt["max"]) : undefined;
      if (max !== undefined && (!Number.isInteger(max) || max < 1)) throw new Error("--max erwartet eine ganze Zahl ab 1");
      const thema = typeof a.opt["thema"] === "string" ? a.opt["thema"] : undefined;
      console.log(JSON.stringify(archivBericht(zeilen.map((z) => zeileZuInhalt(z)), jetzt(), { thema, max }), null, 2));
      return 0;
    }
    case "tool-export": {
      const zeilen = zeilenAusAbfrage(lesJson(pflicht(a, "inhalte", "Ergebnis der Ansicht «Inhalte», Modus view")));
      const marken = zeilenAusAbfrage(lesJson(pflicht(a, "marken", "Ergebnis der Ansicht «Marken», Modus view"))).map(zeileZuMarke);
      const ziel = path.resolve(pflicht(a, "out", "Datei für den Import, zum Beispiel import.json"));
      const r = baueImport(
        zeilen.map((z) => zeileZuInhalt(z, markenNachSeite(marken))),
        marken,
        jetzt(),
      );
      const text = importText(r.datei);
      const tmp = `${ziel}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, text);
      fs.renameSync(tmp, ziel);
      console.log(
        JSON.stringify(
          {
            geschrieben: ziel,
            pruefsumme: createHash("sha256").update(text).digest("hex"),
            inhalte: r.datei.contents.length,
            marken: r.datei.brands.length,
            uebersprungen: r.uebersprungen,
            hinweise: r.hinweise,
            naechsterSchritt: "Im Tool unter /studio/import die Datei hochladen. Der Import braucht einen Admin mit 2FA und legt nur an, was es dort noch nicht gibt.",
          },
          null,
          2,
        ),
      );
      return 0;
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
