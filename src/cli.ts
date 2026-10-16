import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { Akteur } from "./core/schemas";
import { parseArgs, werteAusSet, type Args } from "./args";
import { aktiviere, setzeStatus } from "./motion/aktivieren";
import { legeStueckAn } from "./motion/geruest";
import { kompakterIndex, ladeBibliothek, leseDeklaration, lintBibliothek, setzeDeklaration, vorhandene } from "./motion/bibliothek";
import { IDEE_STATI, Pitch, PruefRunde, Looks, type IdeeStatus } from "./motion/idee";
import { analysiere, entwurfAusKandidat, luecken, type Zeile } from "./motion/luecken";
import { pitchText } from "./motion/pitch";
import { Ideenprotokoll } from "./motion/protokoll";
import { pruefeRender, messeRender, parseHfCheck } from "./motion/render-pruefung";
import { SIGNAL_TYPEN, type SignalTyp } from "./motion/stueck";
import { Signal, splitSaetze } from "./motion/signale";
import { erzeugeDeklaration, loeseVariablen } from "./motion/stueck";
import { checkStueck, erzeugeLookBogen, findeStueck, ladeMarke, rendereBatch, rendereStueck, umgebung, vorschauBilder, extrahiereJson, type Umgebung } from "./motion/werkstatt";

const HILFE = `studio – Video-Editing-System der Alperna GmbH

Motion-Bibliothek
  motion lint                         Alle Stücke prüfen (Datenblatt, index.html, Variablen, Einsatzbeispiele)
  motion list [--alle]                Stücke mit Status
  motion index                        Kompakter Index für den Storyboard-Prompt
  motion neu <id> --name "Name" --typen verlauf,vergleich [--idee m-001]   Neues Stück mit Gerüst anlegen (Status «entwurf»)
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
  ideen bearbeiten <id> [--titel "…"] [--beschreibung "…"] [--zusammenfassung "…"]   nur im Status «idee»
  ideen weiter <id> <status> (--mensch|--system) --by Name [--grund "…"] [--json daten.json] [--stueck slug] [--gewaehlt a|b|c]
  ideen pruefung <id> --json runde.json [--by Name]

Umgebung: STUDIO_DATA_DIR (Ideenprotokoll, Ereignisse), STUDIO_LIBRARY_DIR (Motion-Bibliothek), STUDIO_HYPERFRAMES_BIN (lokales hyperframes statt npx).
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
  return new Ideenprotokoll(path.join(env.datenDir, "ideen.json"), path.join(env.datenDir, "ereignisse.jsonl"));
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
      const dir = legeStueckAn(env.bibliothek, { id: id(a, 2), name: a.opt["name"], typen, idee: typeof a.opt["idee"] === "string" ? a.opt["idee"] : undefined });
      console.log(`Gerüst angelegt: ${path.relative(studioRoot, dir)}\nNächste Schritte: piece.json und index.html ausfüllen (alle TODO ersetzen), dann «motion sync ${id(a, 2)}», «motion lint», «motion check ${id(a, 2)}».\nSignaltypen: ${SIGNAL_TYPEN.join(", ")}`);
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
      for (const i of pr.liste({ status })) {
        console.log(`${i.id}  ${i.status.padEnd(15)} ${i.titel}  «${i.quelle.typ === "video" ? i.quelle.satz : i.quelle.typ === "auftrag" ? i.quelle.text : i.quelle.beobachtung}»`);
      }
      return 0;
    }
    case "zeigen":
      console.log(JSON.stringify(pr.holen(id(a, 2)), null, 2));
      return 0;
    case "pitch":
      console.log(pitchText(pr.holen(id(a, 2))));
      return 0;
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
      };
      if (Object.values(patch).every((x) => x === undefined)) throw new Error("Nichts zu ändern: --titel, --beschreibung oder --zusammenfassung angeben");
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
      const neu = pr.weiter(iid, nach, akteur(a), jetzt(), { grund: typeof a.opt["grund"] === "string" ? a.opt["grund"] : undefined, daten, stueckAktiviert });
      console.log(`${neu.id}: ${neu.status}`);
      return 0;
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

async function main(): Promise<number> {
  const a = parseArgs(process.argv.slice(2));
  const [gruppe, sub] = a.pos;
  if (!gruppe || gruppe === "help" || a.opt["help"]) {
    console.log(HILFE);
    return 0;
  }
  const env = umgebung(studioRoot);
  if (gruppe === "motion" && sub) return motion(sub, a, env);
  if (gruppe === "ideen" && sub) return ideen(sub, a, env);
  console.error(HILFE);
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
