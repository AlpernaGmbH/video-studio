import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { Akteur } from "./core/schemas";
import { parseArgs, werteAusSet, type Args } from "./args";
import { aktiviere, setzeStatus } from "./motion/aktivieren";
import { FamilienFehler, ladeFamilien, familienLookFuer, referenzBildPfad, stueckFamilieAus } from "./motion/familie";
import { legeStueckAn } from "./motion/geruest";
import { kompakterIndex, ladeBibliothek, leseDeklaration, lintBibliothek, setzeDeklaration, vorhandene } from "./motion/bibliothek";
import { IDEE_STATI, Pitch, PruefRunde, Looks, type IdeeStatus } from "./motion/idee";
import { analysiere, entwurfAusKandidat, luecken, type Zeile } from "./motion/luecken";
import { pitchText } from "./motion/pitch";
import { Ideenprotokoll } from "./motion/protokoll";
import { ideeZuZeile, leseAlle, zeilenAusAbfrage } from "./notion/abbild";
import { ladeNotionZiel } from "./notion/ziel";
import { baueDaten, setzeDatenEin } from "./pruefplatz";
import { inhalteBefehl, INHALTE_HILFE, markenBefehl, MARKEN_HILFE } from "./inhalte/befehle";
import { presetsBefehl, PRESETS_HILFE } from "./presets/befehle";
import { katalogBefehl, KATALOG_HILFE } from "./katalog/befehle";
import { schnittBefehl, SCHNITT_HILFE } from "./schnitt/befehle";
import { reelBefehl, REEL_HILFE } from "./schnitt/reel";
import { fotoBefehl, FOTO_HILFE } from "./foto/befehle";
import { auftragBefehl, AUFTRAG_HILFE } from "./studio/auftraege";
import { toolBefehl, TOOL_HILFE } from "./studio/befehle";
import { ausgangsordner, beendeMelder, standardMelder, standardOrt } from "./studio/standard";
import { whisperBefehl, WHISPER_HILFE } from "./schnitt/whisper-setup";
import { INSPIRATION_HILFE, inspirationBefehl } from "./inspiration/befehle";
import { formatiere, hatFehler, initialisiere, pruefeUmgebung, studioHome, type Sonde } from "./setup";
import { pruefeRender, messeRender, parseHfCheck } from "./motion/render-pruefung";
import { SIGNAL_TYPEN, type SignalTyp } from "./motion/stueck";
import { Signal, splitSaetze } from "./motion/signale";
import { erzeugeDeklaration, loeseVariablen } from "./motion/stueck";
import { checkStueck, erzeugeLookBogen, findeStueck, ladeMarke, rendereBatch, rendereStueck, umgebung, vorschauBilder, extrahiereJson, type Umgebung } from "./motion/werkstatt";

const HILFE = `studio – Video-Editing-System der Alperna GmbH

Aufruf im Ordner des Repos oder aus jedem Ordner: ./studio <gruppe> <befehl> …   (statt «npm run studio --»; Pfade gelten ab dem Ordner, in dem du bist)
Stand holen und Pakete aktualisieren: ./studio update

Einrichtung (einmal je Mac)
  init [--home "<OneDrive>/Studio"] [--medien "<Laufwerk>/Studio-Medien"]   Studio-Ordner in OneDrive anlegen und den Pfad für diesen Mac merken.
                                      --medien: grosse Ordner (rohmaterial, renders, inspiration) auf ein eigenes Laufwerk, wenn der Mac zu wenig Platz hat
  doctor                              Prüft Node, ffmpeg, Studio-Ordner, OneDrive, Ideenprotokoll, Bibliothek, Notion-Ziel

Motion-Bibliothek
  motion lint                         Alle Stücke prüfen (Datenblatt, index.html, Variablen, Einsatzbeispiele)
  motion list [--alle]                Stücke mit Status
  motion index                        Kompakter Index für den Storyboard-Prompt
  motion neu <id> --name "Name" --typen verlauf,vergleich [--idee m-001]   Neues Stück mit Gerüst anlegen (Status «entwurf»).
                                      Gehört die Idee zu einer Familie, legt das Gerüst deren gewählten Look bei (look/look.md, look/referenz.png); ohne Look wird nichts gebaut (Regel 2)
  motion sync <id>                    data-composition-variables in index.html aus piece.json erzeugen
  motion vars <id> [--set k=v ...] [--dauer s] [--marke key]   Variablen auflösen und prüfen
  motion check <id>                   hyperframes check (Layout, Kontrast, Laufzeitfehler)
  motion vorschau <id> [--at 0.4,1,2] Standbilder nach vorschau/
  motion render <id> -o datei.webm [--set k=v ...] [--dauer s] [--marke key] [--final]
  motion batch <id> --zeilen datei.json -o ordner [--marke key] [--final]   Mehrere Fassungen: [{"name","dauer","werte":{…}}]
  motion pruefen <id> <datei.webm> --dauer s   Render objektiv prüfen
  motion status <id> gebaut|geprueft  Status anheben (nach Lint bzw. bestandener Prüfung); «aktiv» nur über aktivieren
  motion looks <idee-id> [--at 1.2] [--marke key]   Standbilder und Vergleichsblatt für die drei Looks (data/ideen/<id>/looks/a|b|c/index.html)
  motion aktivieren <id> --mensch --by Name    Stück in die Bibliothek aufnehmen (nur Mensch)
  motion luecken --skript datei [--projekt id] [--extra signale.json] [--limit 5] [--schreiben]

Ideenprotokoll
  ideen liste [--status s]            Übersicht
  ideen zeigen <id>                   Eine Idee als JSON
  ideen pitch <id>                    Pitch als Text
  ideen neu --json entwurf.json [--by Name]
  ideen bearbeiten <id> [--titel "…"] [--beschreibung "…"] [--zusammenfassung "…"] [--familie schluessel]   nur im Status «idee»
  ideen familien                      Familien (library/motion/_familien.json) mit gewähltem Look, offener Runde und wartenden Ideen
  ideen familie-zuruecksetzen <familie> --mensch --by Name --grund "…"   Den Look einer Familie verwerfen (nur Mensch): Die nächste Idee zeigt eine neue Runde
  ideen weiter <id> <status> (--mensch|--system) --by Name [--grund "…"] [--json daten.json] [--stueck slug] [--gewaehlt a|b|c]
  ideen pruefung <id> --json runde.json [--by Name]

Prüfplatz (Artifact für die Menschen)
  pruefplatz bauen [-o datei.html] [--marke key]   Seite mit aktuellem Stand von Bibliothek und Marke bauen (Standard: .cache/pruefplatz.html)

Notion (Ansicht und Entscheide; die Sitzung holt und schreibt die Zeilen mit den Notion-Werkzeugen)
  ideen notion-zeile <id> [--bilder urls.json] [--render-bilder liste.json]   Eigenschaften und Seitentext einer Idee als JSON (für notion-create-pages / notion-update-page).
                                      --bilder: {"a": "https://…", "b": …, "c": …} Adressen der Look-Standbilder im Prüfplatz
                                      --render-bilder: [{"id":"r1","url":"https://…","text":"bei 1,2 s"}] Standbilder des Renders für die Abnahme
  ideen notion-alle                   Dasselbe für alle Ideen, dazu Ziel (Datenquelle)
  ideen notion-lesen --json zeilen.json [--anwenden]   Entscheide aus den Notion-Zeilen lesen (Ergebnis von notion-query-data-sources, Modus view).
                                      Ohne --anwenden nur der Bericht. Mit --anwenden werden Entscheide im Protokoll nachgeführt;
                                      eine Abnahme aktiviert dabei auch das Stück (mit dem Namen aus «Abnahme von»).

${INHALTE_HILFE}
${MARKEN_HILFE}
${KATALOG_HILFE}
${WHISPER_HILFE}
${INSPIRATION_HILFE}
${REEL_HILFE}
${FOTO_HILFE}
${SCHNITT_HILFE}
${PRESETS_HILFE}
${TOOL_HILFE}
${AUFTRAG_HILFE}
Umgebung: STUDIO_HOME (Studio-Ordner statt Konfiguration), STUDIO_MEDIEN (Medien-Ordner), STUDIO_DATA_DIR (Ideenprotokoll, Ereignisse; sonst <Studio-Ordner>/daten), STUDIO_LIBRARY_DIR (Motion-Bibliothek), STUDIO_HYPERFRAMES_BIN (lokales hyperframes statt npx).
`;

const studioRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function jetzt(): string {
  return new Date().toISOString();
}

function lesJson<T>(datei: string, schema?: z.ZodType<T, z.ZodTypeDef, unknown>): T {
  const roh = JSON.parse(fs.readFileSync(datei, "utf8")) as unknown;
  return schema ? schema.parse(roh) : (roh as T);
}

function akteur(a: Args, standardTyp: "mensch" | "system" = "system"): Akteur {
  const typ = a.opt["mensch"] ? "mensch" : a.opt["system"] ? "system" : standardTyp;
  const name = typeof a.opt["by"] === "string" ? a.opt["by"] : typ === "system" ? "claude" : "";
  if (!name) throw new Error("--by <Name> fehlt (bei Freigaben und Entscheiden ist der Name Pflicht)");
  return { typ, name };
}

function protokoll(env: Umgebung): Ideenprotokoll {
  // Die Liste gültiger Familien liegt in der Bibliothek (library/motion/_familien.json): Ein Tippfehler legt keine neue Familie an.
  return new Ideenprotokoll(path.join(env.datenDir, "ideen.json"), path.join(env.datenDir, "ereignisse.jsonl"), ladeFamilien(env.bibliothek).map((f) => f.id));
}

/** Anzeigename der Familie (aus _familien.json) für Pitch und Notion-Zeile. */
function familienAnzeige(env: Umgebung, familie: string | undefined): { name: string } | undefined {
  if (!familie) return undefined;
  const def = ladeFamilien(env.bibliothek).find((f) => f.id === familie);
  return def ? { name: def.name } : undefined;
}

function zeigeBefunde(b: { stufe: string; stueck?: string; code: string; text: string }[]): void {
  for (const x of b) console.log(`${x.stufe === "fehler" ? "FEHLER " : "Warnung"} ${x.stueck ? `[${x.stueck}] ` : ""}${x.code}: ${x.text}`);
}

function id(a: Args, n = 1): string {
  const v = a.pos[n];
  if (!v) throw new Error("Es fehlt die ID");
  return v;
}

/* ---------- Skript → Zeilen ---------- */

function zeilenAusDatei(datei: string): Zeile[] {
  const text = fs.readFileSync(datei, "utf8");
  if (datei.endsWith(".json")) {
    const Z = z.array(z.object({ id: z.string().optional(), t: z.number().optional(), text: z.string() }));
    return Z.parse(JSON.parse(text)).map((x, i) => ({ id: x.id ?? `z${String(i + 1).padStart(2, "0")}`, t: x.t, text: x.text }));
  }
  // Markdown oder Text: Überschriften und Kommentare weglassen, ein Satz pro Zeile
  const saetze = text
    .split("\n")
    .filter((l) => !/^\s*(#|<!--|---|>)/.test(l))
    .flatMap((l) => splitSaetze(l));
  return saetze.map((s, i) => ({ id: `z${String(i + 1).padStart(2, "0")}`, text: s }));
}

/* ---------- Befehle ---------- */

/**
 * Regel 2 beim Anlegen eines Stücks: Gehört die Idee zu einer Familie, muss deren Look gewählt sein. Dann bekommt das Stück ihn mit
 * (Datenblatt, Prosa, Referenzbild). Eine unbekannte Idee oder eine Idee ohne Familie ändert nichts am bisherigen Verhalten.
 */
function familieFuerStueck(env: Umgebung, ideeId: string): { name: string; look: ReturnType<typeof stueckFamilieAus>; referenzBild?: string } | undefined {
  const pr = protokoll(env);
  const idee = pr.lade().ideen.find((x) => x.id === ideeId);
  if (!idee?.familie) return undefined;
  try {
    const look = familienLookFuer(idee, pr.familien());
    const def = ladeFamilien(env.bibliothek).find((f) => f.id === idee.familie);
    const bild = referenzBildPfad(env.datenDir, look);
    return { name: def?.name ?? idee.familie, look: stueckFamilieAus(idee.familie, look), referenzBild: bild && fs.existsSync(bild) ? bild : undefined };
  } catch (e) {
    if (e instanceof FamilienFehler) throw new Error(e.message);
    throw e;
  }
}

async function motion(sub: string, a: Args, env: Umgebung): Promise<number> {
  switch (sub) {
    case "lint": {
      const bib = ladeBibliothek(env.bibliothek);
      const b = lintBibliothek(bib);
      zeigeBefunde(b);
      const fehler = b.filter((x) => x.stufe === "fehler").length;
      console.log(`${bib.stuecke.length} Stücke, ${fehler} Fehler, ${b.length - fehler} Warnungen`);
      return fehler > 0 ? 1 : 0;
    }
    case "list": {
      const bib = ladeBibliothek(env.bibliothek);
      for (const g of bib.stuecke) {
        if (!a.opt["alle"] && g.stueck.status === "veraltet") continue;
        console.log(`${g.stueck.id.padEnd(22)} ${g.stueck.status.padEnd(9)} welle ${String(g.stueck.welle).padEnd(8)} ${g.stueck.ausloeser.typen.join("/")}`);
      }
      return 0;
    }
    case "index": {
      console.log(kompakterIndex(vorhandene(ladeBibliothek(env.bibliothek))));
      return 0;
    }
    case "neu": {
      const typen = (typeof a.opt["typen"] === "string" ? a.opt["typen"] : "").split(",").filter(Boolean) as SignalTyp[];
      if (typeof a.opt["name"] !== "string") throw new Error('--name "Name" fehlt');
      const ideeId = typeof a.opt["idee"] === "string" ? a.opt["idee"] : undefined;
      const fam = ideeId ? familieFuerStueck(env, ideeId) : undefined;
      const dir = legeStueckAn(env.bibliothek, { id: id(a, 2), name: a.opt["name"], typen, idee: ideeId, familie: fam });
      console.log(`Gerüst angelegt: ${path.relative(studioRoot, dir)}\nNächste Schritte: piece.json und index.html ausfüllen (alle TODO ersetzen), dann «motion sync ${id(a, 2)}», «motion lint», «motion check ${id(a, 2)}».\nSignaltypen: ${SIGNAL_TYPEN.join(", ")}`);
      if (fam) console.log(`Familie «${fam.look.id}»: Das Stück entsteht im Look von ${fam.look.look.von} (Fassung ${fam.look.fassung}, ${fam.look.look.name}). Lies look/look.md${fam.referenzBild ? " und schau dir look/referenz.png an" : " (das Standbild fehlt: motion lint warnt)"}.`);
      return 0;
    }
    case "sync": {
      const g = findeStueck(env, id(a, 2));
      const datei = path.join(g.dir, "index.html");
      const vorher = fs.readFileSync(datei, "utf8");
      const nachher = setzeDeklaration(vorher, erzeugeDeklaration(g.stueck));
      if (vorher === nachher) console.log("Schon aktuell.");
      else {
        fs.writeFileSync(datei, nachher);
        const l = leseDeklaration(nachher);
        console.log(`index.html aktualisiert (${l.ok ? l.variablen.length : "?"} Variablen).`);
      }
      return 0;
    }
    case "vars": {
      const g = findeStueck(env, id(a, 2));
      const marke = typeof a.opt["marke"] === "string" ? ladeMarke(env, a.opt["marke"]) : undefined;
      const r = loeseVariablen(g.stueck, werteAusSet(a.set), { dauer: typeof a.opt["dauer"] === "string" ? Number(a.opt["dauer"]) : undefined, marke, ohneMarke: !marke });
      if (!r.ok) {
        console.error(r.fehler.map((f) => `FEHLER ${f}`).join("\n"));
        return 1;
      }
      console.log(JSON.stringify(r.variablen, null, 2));
      return 0;
    }
    case "check": {
      const r = await checkStueck(env, id(a, 2));
      for (const b of r.befunde) console.log(`${b.stufe === "fehler" ? "FEHLER " : "Warnung"} ${b.code}: ${b.text}`);
      console.log(r.ok ? `ok (${(r.dauerMs / 1000).toFixed(1)} s)` : "NICHT ok");
      return r.ok ? 0 : 1;
    }
    case "vorschau": {
      const at = typeof a.opt["at"] === "string" ? a.opt["at"].split(",").map(Number) : [0.4, 1.0, 2.0];
      for (const p of await vorschauBilder(env, id(a, 2), at)) console.log(p);
      return 0;
    }
    case "render": {
      const ausgabe = typeof a.opt["o"] === "string" ? a.opt["o"] : typeof a.opt["output"] === "string" ? a.opt["output"] : undefined;
      if (!ausgabe) throw new Error("-o <datei.webm> fehlt");
      const marke = typeof a.opt["marke"] === "string" ? ladeMarke(env, a.opt["marke"]) : undefined;
      const r = await rendereStueck(env, id(a, 2), {
        werte: werteAusSet(a.set),
        dauer: typeof a.opt["dauer"] === "string" ? Number(a.opt["dauer"]) : undefined,
        marke,
        ausgabe,
        final: a.opt["final"] === true,
      });
      for (const w of r.warnungen) console.log(`Hinweis: ${w}`);
      zeigeBefunde(r.pruefung.befunde);
      console.log(`${r.datei}  ${r.dauer} s  gerendert in ${(r.renderMs / 1000).toFixed(1)} s  Prüfung: ${r.pruefung.bestanden ? "bestanden" : "NICHT bestanden"}`);
      return r.pruefung.bestanden ? 0 : 1;
    }
    case "batch": {
      const datei = a.opt["zeilen"];
      const ausgabe = typeof a.opt["o"] === "string" ? a.opt["o"] : undefined;
      if (typeof datei !== "string" || !ausgabe) throw new Error("Aufruf: motion batch <id> --zeilen datei.json -o <ordner>");
      const Zeilen = z.array(z.object({ name: z.string(), dauer: z.number().optional(), werte: z.record(z.unknown()).optional() }));
      const marke = typeof a.opt["marke"] === "string" ? ladeMarke(env, a.opt["marke"]) : undefined;
      const r = await rendereBatch(env, id(a, 2), lesJson(datei, Zeilen), { marke, ohneMarke: !marke, ausgabeDir: ausgabe, final: a.opt["final"] === true });
      let ok = true;
      for (const x of r.zeilen) {
        zeigeBefunde(x.pruefung.befunde);
        console.log(`${x.name}: ${x.dauer} s → ${x.pruefung.bestanden ? "bestanden" : "NICHT bestanden"}  ${x.datei}`);
        ok &&= x.pruefung.bestanden;
      }
      console.log(`${r.zeilen.length} Fassungen in ${(r.renderMs / 1000).toFixed(1)} s`);
      return ok ? 0 : 1;
    }
    case "pruefen": {
      const g = findeStueck(env, id(a, 2));
      const datei = a.pos[3];
      if (!datei || typeof a.opt["dauer"] !== "string") throw new Error("Aufruf: motion pruefen <id> <datei.webm> --dauer <s>");
      const dauer = Number(a.opt["dauer"]);
      const gemessen = await messeRender(datei, dauer);
      const p = pruefeRender({ stueck: g.stueck, dauer, ...gemessen });
      zeigeBefunde(p.befunde);
      console.log(p.bestanden ? "bestanden" : "NICHT bestanden");
      return p.bestanden ? 0 : 1;
    }
    case "status": {
      const ziel = a.pos[3];
      if (ziel !== "gebaut" && ziel !== "geprueft") throw new Error("Aufruf: motion status <id> gebaut|geprueft («aktiv» geht nur über «motion aktivieren»)");
      const neu = setzeStatus(env.bibliothek, id(a, 2), ziel);
      console.log(`${neu.id}: ${neu.status}`);
      return 0;
    }
    case "looks": {
      const iid = id(a, 2);
      const marke = typeof a.opt["marke"] === "string" ? ladeMarke(env, a.opt["marke"]) : undefined;
      const r = await erzeugeLookBogen(env, path.join(env.datenDir, "ideen", iid), typeof a.opt["at"] === "string" ? Number(a.opt["at"]) : 1.0, marke);
      console.log(JSON.stringify({ bilder: r.bilder, vergleich: path.relative(path.join(env.datenDir, "ideen", iid), r.vergleich).split(path.sep).join("/") }, null, 2));
      return 0;
    }
    case "pruefung-ok":
      console.error("«motion pruefung-ok» heisst jetzt «motion status <id> geprueft».");
      return 2;
    case "aktivieren": {
      const neu = aktiviere(env.bibliothek, id(a, 2), akteur(a, "mensch"), jetzt());
      console.log(`${neu.id}: ${neu.status} (${neu.freigabe?.wer}, ${neu.freigabe?.wann})`);
      return 0;
    }
    case "luecken": {
      const datei = a.opt["skript"] ?? a.opt["transkript"];
      if (typeof datei !== "string") throw new Error("--skript <datei> fehlt");
      const projekt = typeof a.opt["projekt"] === "string" ? a.opt["projekt"] : path.basename(datei, path.extname(datei));
      const zusatz = typeof a.opt["extra"] === "string" ? lesJson(a.opt["extra"], z.record(z.array(Signal))) : undefined;
      const bib = ladeBibliothek(env.bibliothek);
      const stuecke = bib.stuecke.map((g) => g.stueck);
      const pr = protokoll(env);
      const bericht = analysiere(zeilenAusDatei(datei), stuecke, pr.lade().ideen, { zusatzSignale: zusatz });
      console.log(`Bibliothek: ${bericht.bibliothekGroesse} Stücke. Abgedeckt ${bericht.zaehlung.abgedeckt}, Lücken ${bericht.zaehlung.luecke}, bereits erfasst ${bericht.zaehlung["bereits-erfasst"]}, bereits abgelehnt ${bericht.zaehlung["bereits-abgelehnt"]}, unsicher ${bericht.zaehlung.unsicher}.`);
      for (const h of bericht.hinweise) console.log(`Hinweis: ${h}`);
      for (const k of bericht.kandidaten) {
        const kopf = `${k.zeile.id} [${k.urteil}]`;
        const sig = k.signale.map((s) => s.typ).join(", ");
        const extra = k.urteil === "abgedeckt" ? ` → ${k.vorschlag!.stueck}${k.vorschlag!.fehlend.length ? ` (fehlt: ${k.vorschlag!.fehlend.join("; ")})` : ""}` : k.verweis ? ` → ${k.verweis.idee} (${k.verweis.status})` : "";
        console.log(`${kopf} ${sig}${extra}\n    «${k.zeile.text}»`);
      }
      if (a.opt["schreiben"] === true) {
        const limit = typeof a.opt["limit"] === "string" ? Number(a.opt["limit"]) : 5;
        const { aufnehmen, zurueckgestellt } = luecken(bericht, limit);
        const t = jetzt();
        for (const k of aufnehmen) {
          const idee = pr.neu(entwurfAusKandidat(k, { projekt, bibliothekGroesse: bericht.bibliothekGroesse, jetzt: t }), akteur(a), t);
          console.log(`Idee ${idee.id} angelegt: «${idee.quelle.typ === "video" ? idee.quelle.satz : idee.titel}»`);
        }
        if (zurueckgestellt.length) console.log(`${zurueckgestellt.length} weitere Lücken zurückgestellt (--limit ${limit}).`);
      } else if (bericht.zaehlung.luecke > 0) {
        console.log("Trockenlauf. Mit --schreiben werden die wichtigsten Lücken als Ideen ins Protokoll geschrieben.");
      }
      return 0;
    }
    default:
      console.error(`Unbekannter Befehl «motion ${sub}»\n`);
      console.error(HILFE);
      return 2;
  }
}

function ideen(sub: string, a: Args, env: Umgebung): number {
  const pr = protokoll(env);
  switch (sub) {
    case "liste": {
      const status = typeof a.opt["status"] === "string" ? (a.opt["status"] as IdeeStatus) : undefined;
      if (status && !IDEE_STATI.includes(status)) throw new Error(`Status «${status}» unbekannt. Möglich: ${IDEE_STATI.join(", ")}`);
      const staende = pr.familien();
      for (const i of pr.liste({ status })) {
        const wartet = pr.wartetAuf(i, staende);
        const fam = i.familie ? `[${i.familie}${wartet ? `, wartet auf Look-Wahl in ${wartet}` : ""}] ` : "";
        console.log(`${i.id}  ${i.status.padEnd(15)} ${fam}${i.titel}  «${i.quelle.typ === "video" ? i.quelle.satz : i.quelle.typ === "auftrag" ? i.quelle.text : i.quelle.beobachtung}»`);
      }
      return 0;
    }
    case "familien": {
      const liste = ladeFamilien(env.bibliothek);
      if (liste.length === 0) console.log("Keine Familie definiert (library/motion/_familien.json). Jede Idee zeigt drei eigene Looks.");
      const staende = pr.familien();
      const alle = pr.liste();
      for (const f of liste) {
        const st = staende[f.id];
        console.log(`${f.id}  ${f.name}`);
        if (st?.look) console.log(`  Look: ${st.look.gewaehlt.toUpperCase()} «${st.look.briefs.find((b) => b.id === st.look!.gewaehlt)?.name ?? "?"}», gewählt von ${st.look.von} am ${st.look.am.slice(0, 10)}, Fassung ${st.look.fassung}, gezeigt in ${st.look.vonIdee}`);
        else console.log("  Look: noch keiner gewählt");
        if (st?.offeneRunde) console.log(`  Offene Runde: ${st.offeneRunde.idee}, Runde ${st.offeneRunde.runde}`);
        if (st?.frueher.length) console.log(`  Verworfene Fassungen: ${st.frueher.map((x) => x.fassung).join(", ")}`);
        const ideen = alle.filter((i) => i.familie === f.id);
        const wartend = ideen.filter((i) => pr.wartetAuf(i, staende));
        const erben = ideen.filter((i) => i.status === "freigegeben" && st?.look);
        console.log(`  Ideen: ${ideen.length ? ideen.map((i) => `${i.id} (${i.status})`).join(", ") : "keine"}${wartend.length ? `; warten auf die Look-Wahl: ${wartend.map((i) => i.id).join(", ")}` : ""}${erben.length ? `; können den Look übernehmen: ${erben.map((i) => i.id).join(", ")} («ideen weiter <id> look_gewaehlt --system»)` : ""}`);
      }
      const unbekannt = alle.filter((i) => i.familie && !liste.some((f) => f.id === i.familie));
      for (const i of unbekannt) console.log(`Hinweis: ${i.id} nennt die Familie «${i.familie}», die nicht in _familien.json steht.`);
      return 0;
    }
    case "familie-zuruecksetzen": {
      const stand = pr.familieZuruecksetzen(id(a, 2), akteur(a, "mensch"), jetzt(), typeof a.opt["grund"] === "string" ? a.opt["grund"] : "");
      console.log(`Familie «${id(a, 2)}»: Look verworfen (Fassung ${stand.frueher.at(-1)?.fassung}). Die nächste Idee der Familie zeigt eine neue Runde. Stücke, die schon im alten Look entstanden sind, behalten ihn.`);
      return 0;
    }
    case "zeigen":
      console.log(JSON.stringify(pr.holen(id(a, 2)), null, 2));
      return 0;
    case "pitch": {
      const idee = pr.holen(id(a, 2));
      console.log(pitchText(idee, familienAnzeige(env, idee.familie)));
      return 0;
    }
    case "neu": {
      if (typeof a.opt["json"] !== "string") throw new Error("--json <entwurf.json> fehlt");
      const e = lesJson<Parameters<Ideenprotokoll["neu"]>[0]>(a.opt["json"]);
      const idee = pr.neu(e, akteur(a), jetzt());
      console.log(`${idee.id} angelegt`);
      return 0;
    }
    case "bearbeiten": {
      const patch = {
        titel: typeof a.opt["titel"] === "string" ? a.opt["titel"] : undefined,
        beschreibung: typeof a.opt["beschreibung"] === "string" ? a.opt["beschreibung"] : undefined,
        zusammenfassung: typeof a.opt["zusammenfassung"] === "string" ? a.opt["zusammenfassung"] : undefined,
        familie: typeof a.opt["familie"] === "string" ? a.opt["familie"] : undefined,
      };
      if (Object.values(patch).every((x) => x === undefined)) throw new Error("Nichts zu ändern: --titel, --beschreibung, --zusammenfassung oder --familie angeben");
      const neu = pr.bearbeite(id(a, 2), patch, akteur(a), jetzt());
      console.log(`${neu.id}: «${neu.titel}»`);
      return 0;
    }
    case "weiter": {
      const iid = id(a, 2);
      const nach = a.pos[3] as IdeeStatus | undefined;
      if (!nach || !IDEE_STATI.includes(nach)) throw new Error(`Zielstatus fehlt oder unbekannt. Möglich: ${IDEE_STATI.join(", ")}`);
      const daten: Record<string, unknown> = typeof a.opt["json"] === "string" ? lesJson<Record<string, unknown>>(a.opt["json"]) : {};
      if (daten["pitch"]) daten["pitch"] = Pitch.parse(daten["pitch"]);
      if (daten["looks"]) daten["looks"] = Looks.parse(daten["looks"]);
      if (typeof a.opt["stueck"] === "string") daten["stueck"] = a.opt["stueck"];
      if (typeof a.opt["gewaehlt"] === "string") daten["gewaehlt"] = a.opt["gewaehlt"];
      let stueckAktiviert = false;
      if (nach === "in_bibliothek") {
        const idee = pr.holen(iid);
        const g = ladeBibliothek(env.bibliothek).stuecke.find((s) => s.stueck.id === idee.bau?.stueck);
        stueckAktiviert = g?.stueck.status === "aktiv";
      }
      // Regel 2: Das Stück einer Idee mit Familie muss den Look der Familie tragen (sonst liesse sich das Gerüst ohne Familie anlegen).
      let stueckFamilie: { id?: string; fassung?: number } | undefined;
      if (nach === "in_bau" && typeof daten["stueck"] === "string") {
        const g = ladeBibliothek(env.bibliothek).stuecke.find((x) => x.stueck.id === daten["stueck"]);
        if (g) stueckFamilie = { id: g.stueck.familie?.id, fassung: g.stueck.familie?.fassung };
      }
      const neu = pr.weiter(iid, nach, akteur(a), jetzt(), { grund: typeof a.opt["grund"] === "string" ? a.opt["grund"] : undefined, daten, stueckAktiviert, stueckFamilie });
      console.log(`${neu.id}: ${neu.status}${neu.looks?.erbe ? ` (Look der Familie «${neu.looks.erbe.familie}» geerbt, Fassung ${neu.looks.erbe.fassung})` : ""}`);
      return 0;
    }
    case "notion-zeile": {
      const idee = pr.holen(id(a, 2));
      const bildUrls = typeof a.opt["bilder"] === "string" ? lesJson<Record<string, string>>(a.opt["bilder"]) : undefined;
      const renderBilder = typeof a.opt["render-bilder"] === "string" ? lesJson<{ id: string; url: string; text?: string }[]>(a.opt["render-bilder"]) : undefined;
      console.log(JSON.stringify(ideeZuZeile(idee, { onedriveOrdner: `daten/ideen/${idee.id}`, bildUrls, renderBilder, familieName: familienAnzeige(env, idee.familie)?.name }), null, 2));
      return 0;
    }
    case "notion-alle": {
      const ziel = ladeNotionZiel(studioRoot);
      const zeilen = pr.liste().map((i) => ({ idee: i.id, ...ideeZuZeile(i, { onedriveOrdner: `daten/ideen/${i.id}`, familieName: familienAnzeige(env, i.familie)?.name }) }));
      console.log(JSON.stringify({ datenquelle: ziel.motionIdeen.datenquelle, zeilen }, null, 2));
      return 0;
    }
    case "notion-lesen": {
      if (typeof a.opt["json"] !== "string") throw new Error("--json <zeilen.json> fehlt (Ergebnis von notion-query-data-sources im Modus view)");
      const bericht = leseAlle(pr.liste(), zeilenAusAbfrage(lesJson(a.opt["json"])), jetzt());
      const anwenden = a.opt["anwenden"] === true;
      const angewendet: { idee: string; nach: IdeeStatus; text: string }[] = [];
      const fehler: { idee: string; fehler: string[] }[] = [];
      const nachziehen = new Set<string>();
      for (const b of bericht.befunde) {
        if (b.hinweise.length) nachziehen.add(b.idee);
        if (!b.aktion) continue;
        const x = b.aktion;
        if (!anwenden) {
          angewendet.push({ idee: x.idee, nach: x.nach, text: `(Vorschau) ${x.text}` });
          continue;
        }
        try {
          const i = pr.holen(x.idee);
          const finde = () => (x.nach === "in_bibliothek" ? ladeBibliothek(env.bibliothek).stuecke.find((s) => s.stueck.id === i.bau?.stueck) : undefined);
          // Die Abnahme im Prüfplatz ist zugleich die Aufnahme in die Bibliothek: Das Stück wird mit demselben Menschen aktiviert.
          if (finde()?.stueck.status === "geprueft") aktiviere(env.bibliothek, i.bau!.stueck, x.akteur, x.wann);
          pr.weiter(x.idee, x.nach, x.akteur, x.wann, { grund: x.grund, daten: x.daten, stueckAktiviert: finde()?.stueck.status === "aktiv" });
          angewendet.push({ idee: x.idee, nach: x.nach, text: x.text });
          nachziehen.add(x.idee);
        } catch (e) {
          fehler.push({ idee: x.idee, fehler: [(e as Error).message] });
        }
      }
      // Ideen, die auf die Look-Wahl ihrer Familie gewartet haben und den Look jetzt übernehmen können («ideen weiter <id> look_gewaehlt --system»)
      const staende = pr.familien();
      const erbenKoennen = pr.liste({ status: "freigegeben" }).filter((i) => i.familie && staende[i.familie]?.look).map((i) => i.id);
      console.log(JSON.stringify({ anwenden, angewendet, fehler, erbenKoennen, hinweise: bericht.befunde.filter((b) => b.hinweise.length).map((b) => ({ idee: b.idee, hinweise: b.hinweise })), ohneIdee: bericht.ohneIdee, ohneZeile: bericht.ohneZeile, zeileNeuSchreiben: [...nachziehen] }, null, 2));
      return fehler.length ? 1 : 0;
    }
    case "pruefung": {
      if (typeof a.opt["json"] !== "string") throw new Error("--json <runde.json> fehlt");
      const runde = lesJson(a.opt["json"], PruefRunde.omit({ runde: true }));
      const r = pr.pruefung(id(a, 2), runde, akteur(a));
      console.log(r.bestanden ? "Prüfung bestanden. Weiter mit: ideen weiter <id> render_geprueft" : r.naechsteKorrekturErlaubt ? "Nicht bestanden. Eine Korrekturrunde ist erlaubt." : "Nicht bestanden und keine Korrekturrunde mehr: ein Mensch entscheidet.");
      return 0;
    }
    default:
      console.error(`Unbekannter Befehl «ideen ${sub}»\n`);
      console.error(HILFE);
      return 2;
  }
}

function echteSonde(): Sonde {
  return {
    nodeVersion: process.version,
    platform: process.platform,
    env: process.env,
    userHome: os.homedir(),
    befehl(cmd, args) {
      const r = spawnSync(cmd, args, { encoding: "utf8" });
      return r.status === 0 ? r.stdout.trim() : undefined;
    },
    ideenProtokollPruefen(datei) {
      try {
        new Ideenprotokoll(datei).lade();
        return undefined;
      } catch (e) {
        return (e as Error).message;
      }
    },
    bibliothekPruefen() {
      const b = lintBibliothek(ladeBibliothek(path.join(studioRoot, "library", "motion")));
      return { fehler: b.filter((x) => x.stufe === "fehler").length, warnungen: b.filter((x) => x.stufe === "warnung").length };
    },
    notionZielPruefen() {
      try {
        ladeNotionZiel(studioRoot);
        return undefined;
      } catch (e) {
        return (e as Error).message;
      }
    },
    freierPlatzGB(pfad) {
      try {
        const s = fs.statfsSync(pfad);
        return (s.bavail * s.bsize) / 2 ** 30;
      } catch {
        return undefined;
      }
    },
  };
}

async function main(): Promise<number> {
  const a = parseArgs(process.argv.slice(2));
  const [gruppe, sub] = a.pos;
  if (!gruppe || gruppe === "help" || gruppe === "hilfe" || a.opt["help"]) {
    console.log(HILFE);
    return 0;
  }
  if (gruppe === "init") {
    const r = initialisiere({ home: typeof a.opt["home"] === "string" ? a.opt["home"] : undefined, medien: typeof a.opt["medien"] === "string" ? a.opt["medien"] : undefined });
    console.log(`Studio-Ordner: ${r.home}${r.medien ? `\nMedien-Ordner: ${r.medien}` : ""}${r.angelegt.length ? `\nAngelegt: ${r.angelegt.length} Ordner` : "\nBestand unverändert"}\nKonfiguration: ${r.config}${r.hinweise.length ? `\n\nACHTUNG:\n${r.hinweise.map((h) => `  ${h}`).join("\n")}` : ""}\n\nNächste Schritte:\n  npm install\n  npx hyperframes@0.8.164 browser ensure\n  npx hyperframes@0.8.164 telemetry disable\n  ./studio doctor`);
    return 0;
  }
  if (gruppe === "doctor") {
    const punkte = pruefeUmgebung(echteSonde());
    console.log(formatiere(punkte));
    return hatFehler(punkte) ? 1 : 0;
  }
  const home = studioHome();
  if (gruppe === "pruefplatz" && sub === "bauen") {
    const marke = typeof a.opt["marke"] === "string" ? a.opt["marke"] : "alperna";
    const daten = baueDaten({ bibliothek: ladeBibliothek(path.join(studioRoot, "library", "motion")), marke: ladeMarke(umgebung(studioRoot), marke), notion: ladeNotionZiel(studioRoot), jetzt: jetzt() });
    const html = setzeDatenEin(fs.readFileSync(path.join(studioRoot, "pruefplatz", "index.html"), "utf8"), daten);
    const ziel = typeof a.opt["o"] === "string" ? path.resolve(a.opt["o"]) : path.join(studioRoot, ".cache", "pruefplatz.html");
    fs.mkdirSync(path.dirname(ziel), { recursive: true });
    fs.writeFileSync(ziel, html);
    console.log(`${ziel}\n${(Buffer.byteLength(html) / 1024).toFixed(0)} KB, ${daten.bibliothek.length} Stücke, Marke «${daten.marke?.name ?? "keine"}»`);
    return 0;
  }
  const env = umgebung(studioRoot, home ? path.join(home.pfad, "daten") : undefined);
  if (gruppe === "motion" && sub) return motion(sub, a, env);
  if (gruppe === "ideen" && sub) return ideen(sub, a, env);
  if (gruppe === "inhalte" && sub) return inhalteBefehl(sub, a, env, jetzt);
  if (gruppe === "marken" && sub) return markenBefehl(sub, a, env, jetzt);
  if (gruppe === "katalog" && sub) return katalogBefehl(sub, a, env);
  if (gruppe === "whisper" && sub) return whisperBefehl(sub, a);
  if (gruppe === "inspiration" && sub) return inspirationBefehl(sub, a, studioRoot);
  if (gruppe === "reel" && sub) {
    // Fortschritt an das Alperna-Tool (freiwillig): Der Melder stört den Befehl nie. Vor dem Exit wartet er höchstens 1,5 s auf den Rest, der Korb behält, was dann noch aussteht.
    const melder = standardMelder();
    try {
      return await reelBefehl(sub, a, env, { melder });
    } finally {
      await beendeMelder(melder);
    }
  }
  if (gruppe === "foto" && sub) return fotoBefehl(sub, a, env);
  if (gruppe === "tool" && sub) {
    const ort = standardOrt();
    return toolBefehl(sub, a, { ort, ausgang: ausgangsordner(ort), home });
  }
  if (gruppe === "warteschlange" && sub) return auftragBefehl(sub, a, { ort: standardOrt() });
  if (gruppe === "schnitt" && sub) return schnittBefehl(sub, a, env);
  if (gruppe === "presets" && sub) return presetsBefehl(sub, a, env);
  console.error(`Unbekannter Befehl «${[gruppe, sub].filter(Boolean).join(" ")}».\nGruppen: init, doctor, motion, ideen, inhalte, marken, katalog, whisper, inspiration, reel, foto, schnitt, presets, tool, warteschlange, pruefplatz. Alle Befehle: ./studio hilfe\nIst dein Stand alt? ./studio update`);
  return 2;
}

// Hilfsfunktionen für Tests und Skripte
export { extrahiereJson, parseHfCheck };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (e: unknown) => {
      console.error(`FEHLER: ${(e as Error).message}`);
      process.exit(1);
    },
  );
}
