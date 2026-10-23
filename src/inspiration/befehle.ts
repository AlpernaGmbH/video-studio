import fs from "node:fs";
import path from "node:path";
import type { Args } from "../args";
import { transkribiere, whisperProgramm } from "../schnitt/whisper";
import { linksAusText, type Link } from "./embed";
import { echteDeps, pruefeAusgabe, sichteAlle, type SichtDeps, type Sichtung } from "./sichten";

export const INSPIRATION_HILFE = `Inspiration sichten (Ton und Bilder statt Beschreibung; fremde Inhalte, nur intern)
  inspiration liste <links.txt>       Erkennt die Links einer Textdatei (Reel, Beitrag, Profil, YouTube) und zählt sie. Lädt nichts.
  inspiration sichten <links.txt> --out <ordner> [--nur code,code] [--dicht [code,code]] [--modell small] [--sprache auto] [--neu]
                                      Lädt Reels und Beiträge über die öffentliche Einbettung (ohne Anmeldung), misst Schnitte, Lautheit und Pausen, transkribiert den Ton
                                      mit Whisper (STUDIO_WHISPER_BIN) und legt je Link einen Ordner mit Folien, Kontaktbögen (Zeitmarken im Bild) und meta.json an.
                                      Der Zielordner darf nicht im Repo liegen. Vorhandene Ordner werden übersprungen (--neu macht sie neu). --dicht tastet alle 0,5 s ab
                                      (für Kamera und Übergänge), mit Codes nur für diese. Profile und YouTube meldet der Befehl als «nicht unterstützt».
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
