import fs from "node:fs";
import path from "node:path";
import type { Args } from "../args";
import { transkribiere, whisperProgramm } from "../schnitt/whisper";
import { UntertitelPreset } from "../presets/schema";
import { captionFuerMarke } from "../presets/grafik";
import { ladeMarke, umgebung } from "../motion/werkstatt";
import { linksAusText, type Link } from "./embed";
import { echteDeps, pruefeAusgabe, sichteAlle, type SichtDeps, type Sichtung } from "./sichten";
import { bauStilStudie, ersteVideofolie, presetKennung, stilAlsMarkdown, untertitelAusUrteil } from "./stil";

export const INSPIRATION_HILFE = `Inspiration sichten (Ton und Bilder statt Beschreibung; fremde Inhalte, nur intern)
  inspiration liste <links.txt>       Erkennt die Links einer Textdatei (Reel, Beitrag, Profil, YouTube) und zählt sie. Lädt nichts.
  inspiration sichten <links.txt> --out <ordner> [--nur code,code] [--dicht [code,code]] [--modell small] [--sprache auto] [--neu]
                                      Lädt Reels und Beiträge über die öffentliche Einbettung (ohne Anmeldung), misst Schnitte, Lautheit und Pausen, transkribiert den Ton
                                      mit Whisper (STUDIO_WHISPER_BIN) und legt je Link einen Ordner mit Folien, Kontaktbögen (Zeitmarken im Bild) und meta.json an.
                                      Der Zielordner darf nicht im Repo liegen. Vorhandene Ordner werden übersprungen (--neu macht sie neu). --dicht tastet alle 0,5 s ab
                                      (für Kamera und Übergänge), mit Codes nur für diese. Profile und YouTube meldet der Befehl als «nicht unterstützt».
  inspiration stil <code> --out <ordner> [--untertitel schrift=titel|fliesstext,groesse=48,position=unten|mitte|oben,animation=pop|fade|keine,hervorhebung=akzent|kasten|keine,grossschreibung=ja|nein,kasten=ja|nein] [--marke alperna]
                                      Stil-Studie (M12) aus einer gesichteten Aufnahme: liest meta.json (Schnitte je Minute, Lautheit, Pausen) und das Transkript und schreibt
                                      stil.json und stil.md in den Ordner der Aufnahme. Gemessen wird nur, was die Messung hergibt. Schrift, Lage und Animation der Untertitel
                                      sieht jemand auf den Bögen: Das Urteil kommt mit --untertitel (alle sieben Angaben, nichts wird geraten) und ergibt untertitel-vorschlag.json
                                      (Herkunft «unbelegt») samt Vorschlag für das Caption-Preset der Marke. Nur intern, nie Material für Kunden. Ins Repo und ins Markenprofil
                                      übernimmt ein Mensch (Gate 0).
`;

const lies = (datei: string): string => {
  if (!fs.existsSync(datei)) throw new Error(`Datei fehlt: ${datei}`);
  return fs.readFileSync(datei, "utf8");
};

const liste = (v: string | true | undefined): string[] | undefined => (typeof v === "string" ? v.split(",").map((x) => x.trim()).filter(Boolean) : undefined);

const zeile = (s: Sichtung): string => {
  const folien = s.folien.length ? `${s.folien.length} Folie${s.folien.length === 1 ? "" : "n"}` : "keine Folie";
  const ton = s.folien.filter((f) => f.transkript && "segmente" in f.transkript).length;
  return `${(s.link.code ?? s.link.url).padEnd(14)} ${s.status.padEnd(18)} ${s.konto ? `@${s.konto}` : ""}  ${folien}${ton ? `, ${ton} Transkript${ton === 1 ? "" : "e"}` : ""}${s.grund ? `  (${s.grund})` : ""}`;
};

/** Befehle `studio inspiration …`. `deps` ist für Tests ersetzbar. */
export async function inspirationBefehl(sub: string, a: Args, studioRoot: string, deps?: SichtDeps): Promise<number> {
  if (sub === "stil") return stilBefehl(a, studioRoot);
  const datei = a.pos[2];
  if (!datei) throw new Error("Textdatei mit den Links fehlt (inspiration liste|sichten <links.txt>)");
  const alle = linksAusText(lies(datei));
  if (sub === "liste") {
    const nach = new Map<string, number>();
    for (const l of alle) nach.set(l.art, (nach.get(l.art) ?? 0) + 1);
    console.log(`${alle.length} Links: ${[...nach].map(([k, n]) => `${n} ${k}`).join(", ") || "keine"}`);
    for (const l of alle) console.log(`${l.art.padEnd(8)} ${(l.code ?? "").padEnd(14)} ${l.folie ? `Folie ${l.folie}` : ""}`);
    return 0;
  }
  if (sub !== "sichten") throw new Error(`Unbekannter Befehl «inspiration ${sub}». Siehe ./studio hilfe`);

  const aus = a.opt["out"];
  if (typeof aus !== "string") throw new Error("--out <ordner> fehlt (ausserhalb des Repos, zum Beispiel im Medien-Ordner unter inspiration/)");
  const ziel = pruefeAusgabe(aus, studioRoot);
  fs.mkdirSync(ziel, { recursive: true });

  const nur = liste(a.opt["nur"]);
  const links: Link[] = nur ? alle.filter((l) => l.code && nur.includes(l.code)) : alle;
  if (nur && !links.length) throw new Error(`Keiner der Codes aus --nur steht in der Datei (${nur.join(", ")})`);
  const dichtWert = a.opt["dicht"];
  const modell = typeof a.opt["modell"] === "string" ? a.opt["modell"] : undefined;
  const sprache = typeof a.opt["sprache"] === "string" ? a.opt["sprache"] : undefined;
  const programm = whisperProgramm();
  const d: SichtDeps = deps ?? { ...echteDeps(), transkribiere: (o) => transkribiere({ eingang: o.eingang, ziel: o.ziel, modell: o.modell, sprache: o.sprache, programm }) };

  const r = await sichteAlle(
    links,
    { aus: ziel, dicht: dichtWert === true ? true : (liste(dichtWert) ?? false), ...(modell ? { modell } : {}), ...(sprache ? { sprache } : {}), neu: a.opt["neu"] === true },
    d,
    (s, i, n) => console.log(`[${i}/${n}] ${zeile(s)}`),
  );
  const zaehler = new Map<string, number>();
  for (const s of r) zaehler.set(s.status, (zaehler.get(s.status) ?? 0) + 1);
  const bericht = { ziel, links: r.length, status: Object.fromEntries(zaehler) };
  fs.writeFileSync(path.join(ziel, "bericht.json"), JSON.stringify({ ...bericht, erstelltAm: d.jetzt(), eintraege: r.map((s) => ({ link: s.link.url, code: s.link.code, art: s.link.art, folie: s.link.folie, status: s.status, grund: s.grund, konto: s.konto, folien: s.folien.length })) }, null, 2));
  console.log(`\n${JSON.stringify(bericht)}`);
  return 0;
}

/** `inspiration stil <code> --out <ordner>`: Stil-Studie aus einer Sichtung. */
async function stilBefehl(a: Args, studioRoot: string): Promise<number> {
  const code = a.pos[2];
  if (!code) throw new Error("Aufruf: inspiration stil <code> --out <ordner der Sichtungen> [--untertitel …] [--marke alperna]");
  if (!/^[A-Za-z0-9_-]{4,40}$/.test(code)) throw new Error(`«${code}» ist kein Kurzcode (Buchstaben, Ziffern, _ und -)`);
  const aus = a.opt["out"];
  if (typeof aus !== "string") throw new Error("--out <ordner> fehlt (der Ordner, in dem «inspiration sichten» die Aufnahmen abgelegt hat)");
  const ordner = path.join(pruefeAusgabe(aus, studioRoot), code);
  const metaDatei = path.join(ordner, "meta.json");
  if (!fs.existsSync(metaDatei)) throw new Error(`Keine Sichtung gefunden: ${metaDatei}. Zuerst «./studio inspiration sichten» ausführen`);
  const sichtung = JSON.parse(fs.readFileSync(metaDatei, "utf8")) as Sichtung;

  const folie = ersteVideofolie(sichtung);
  let transkript: unknown;
  if (folie?.transkript && "datei" in folie.transkript) {
    const t = path.join(ordner, folie.transkript.datei);
    if (fs.existsSync(t)) {
      try {
        transkript = JSON.parse(fs.readFileSync(t, "utf8"));
      } catch {
        transkript = undefined;
      }
    }
  }
  const r = bauStilStudie(sichtung, { transkript });
  if (!r.ok) {
    console.log(`FEHLER ${r.grund}`);
    return 1;
  }
  const studie = r.studie;

  let code0 = 0;
  const spec = a.opt["untertitel"];
  if (spec !== undefined) {
    if (typeof spec !== "string") throw new Error("--untertitel erwartet schrift=…,groesse=…,position=…,animation=…,hervorhebung=…,grossschreibung=…,kasten=…");
    const u = untertitelAusUrteil(spec, code);
    if (!u.ok) {
      console.log("FEHLER Das Urteil über die Untertitel ist nicht vollständig:");
      for (const f of u.fehler) console.log(`  ${f}`);
      return 1;
    }
    studie.untertitel = u.preset;
  }

  fs.writeFileSync(path.join(ordner, "stil.json"), `${JSON.stringify(studie, null, 2)}\n`);
  fs.writeFileSync(path.join(ordner, "stil.md"), `${stilAlsMarkdown(studie)}\n`);
  console.log(`Stil-Studie ${code}: ${studie.messwerte.schnitte} harte Schnitte (${String(studie.messwerte.schnitteProMinute).replace(".", ",")} je Minute), ${studie.einordnung[0]!.split(": ")[1]}`);
  for (const z of studie.einordnung.slice(1)) console.log(`  ${z}`);
  console.log(`Geschrieben: ${path.join(ordner, "stil.md")} und stil.json`);
  console.log(`Nicht gemessen: ${studie.nichtGemessen.map((x) => x.split(":")[0]).join("; ")}`);

  if (studie.untertitel) {
    // Dieselbe Prüfung wie «presets lint»: Schema und Dateiname (<id>.json)
    const ok = UntertitelPreset.safeParse(studie.untertitel).success && presetKennung(code) === studie.untertitel.id;
    if (!ok) code0 = 1;
    const vorschlag = path.join(ordner, "untertitel-vorschlag.json");
    fs.writeFileSync(vorschlag, `${JSON.stringify(studie.untertitel, null, 2)}\n`);
    const markeKey = typeof a.opt["marke"] === "string" ? a.opt["marke"] : "alperna";
    const marke = ladeMarke(umgebung(studioRoot), markeKey);
    console.log(`Urteil über die Untertitel (nach Ansicht der Bögen, Herkunft «unbelegt»): ${vorschlag}`);
    console.log(JSON.stringify({ captionPreset: captionFuerMarke(studie.untertitel, marke), hinweis: `Vorschlag für marken/${marke.schluessel}.json, Feld «captionPreset». Übernehmen und freigeben tut ein Mensch bei Gate 0, mit dem Probebild.` }, null, 2));
    console.log(`Als Preset ins Repo: Datei nach presets/untertitel/${studie.untertitel.id}.json kopieren und «./studio presets lint» laufen lassen. Das entscheidet ein Mensch.`);
  } else {
    console.log("Urteil über die Untertitel fehlt: Bögen ansehen, dann denselben Befehl mit --untertitel schrift=…,groesse=…,position=…,animation=…,hervorhebung=…,grossschreibung=…,kasten=…");
  }
  return code0;
}
