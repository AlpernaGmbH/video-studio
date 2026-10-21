import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { parseArgs, type Args } from "../args";
import { extrahiereJson, ladeMarke, type Umgebung } from "../motion/werkstatt";
import { sondiere } from "../presets/messen";
import { medienOrdner, studioHome, type StudioHome } from "../setup";
import { zuordnungBericht } from "./bericht";
import { baueGegenlesen, GegenlesenAntwort, gegenlesenMarkdown, planHash, wendeGegenlesenAn } from "./gegenlesen";
import { findePreset, ladePresets } from "../presets/lader";
import { bewerteQualitaet, messeQualitaet, qualitaetZeilen } from "./qualitaet";
import { findeStille, type Stille } from "./stille";
import { schnittBefehl } from "./befehle";
import { SchnittQuelle, platziere } from "./plan";
import { leseSchnittplan } from "./plan";
import { bestimmeFarbe, lutOrdner, schreibeLuts } from "./farbe-ablauf";
import type { Farbart, Farbmessung } from "./farbe";
import { ordneTonZu, parseVersatzOption } from "./ton-ablauf";
import { stoppuhr, type Stoppuhr } from "./stoppuhr";
import { cacheDatei, fingerabdruck } from "./transkript-cache";
import { listeTonDateien, schneideTonFenster } from "./ton-sync";
import { pruefeSchnittplan } from "./pruefung";
import { auftragBefehl, storyboardBefehl } from "./storyboard-befehle";
import { leseTranskript } from "./transkript";
import { relativierePfad } from "./uebergabe";
import { STANDARD_MODELL, transkribiere } from "./whisper";
import { fuehreZuordnungAus } from "./zuordnen";

/**
 * Der Reel-Ablauf mit festen Ordnern: vom Rohmaterial zum Ordner für DaVinci Resolve in vier Befehlen.
 * Alles liegt unter <Studio>/inhalte/<ID>/ (Skript, Ergebnisse), die Aufnahmen unter <Medien>/rohmaterial/<ID>/.
 * Die Einzelschritte bleiben als `./studio schnitt …` erreichbar; dieser Befehl ruft sie in der richtigen Reihenfolge auf.
 */

export const REEL_HILFE = `Reel vom Rohmaterial bis zum Resolve-Ordner (feste Ordner, Skill reel-werkstatt)
  reel neu <ID> [--marke key] [--name "Titel"] [--zwischenablage | --skript datei] [--ueberschreiben] [--nicht-oeffnen]
                                      Legt <Studio>/inhalte/<ID>/ und <Medien>/rohmaterial/<ID>/ an, schreibt das Skript (aus der Zwischenablage oder einer Datei)
                                      nach inhalte/<ID>/skript.md und öffnet den Aufnahmen-Ordner. Danach die Videos dort hineinkopieren. <ID> ist die Kennung aus «Inhalte» (c-0007).
  reel transkript <ID> [--marke key] [--aufnahmen ordner] [--modell large-v3] [--neu] [--ohne-ton-sync] [--versatz …]
                                      Ohne Skript, oder wenn es nicht stimmt: transkribiert die Videos und schreibt ergebnis/transkript.md (nummerierte Sätze mit Zeiten).
                                      Claude wählt daraus die Sätze und schreibt sie wörtlich in skript.md.
  reel vorbereiten <ID> [--marke key] [--neu] [--ohne-pegel] [--ohne-stille] [--ohne-farbe] [--farbe log|rec709|auto] [--ohne-ton-sync] [--versatz 5.3 | clip=5.3;clip2=-2:aufnahme] [--untertitel gehoert|skript] [--gesprochen 3,5] [--modell large-v3] [--sprache de] [--aufnahmen ordner] [--name "Titel"]
                                      Sondiert die Videos, legt getrennte Tonaufnahmen (wav, m4a, mp3 im selben Ordner) über die Videos (Versatz aus der Lautstärkekurve, oder von Hand mit --versatz;
                                      ein Versatz von Hand wird gemerkt), transkribiert mit Whisper (vorhandene Transkripte bleiben, --neu erzwingt), misst die Stille der Tonspur, ordnet das Skript zu
                                      stellt fest, ob das Material flach (Log) ist, baut daraus die LUTs für den Look der Marke (ergebnis/lut/, Schwarz- und Weisspunkt am Material gemessen; bei falschem Urteil
                                      --farbe setzen, es wird gemerkt), ordnet das Skript zu und baut den Schnittplan. Schreibt ergebnis/gegenlesen.md. Die Untertitel nehmen das Gehörte.
  reel gegenlesen <ID> [--zwischenablage | --datei antwort.json] [--nicht-kopieren] [--regeln regeln.json] [--katalog katalog.json]
                                      Claude hat gegenlesen.md gelesen und ergebnis/gegenlesen.json geschrieben (Regie, Abbrüche, Verhörer). Der Befehl wendet es auf den Plan an
                                      und schreibt ergebnis/auftrag.md fürs Storyboard (auf dem Mac auch in die Zwischenablage). Ohne gültiges Gegenlesen läuft «reel storyboard» nicht.
  reel storyboard <ID> [--zwischenablage | --datei sb.json] [--entwurf] [--ohne-rendern] [--ohne-vorschau] [--nicht-oeffnen] [--ohne-gegenlesen]
                                      Antwort von Claude (Storyboard als JSON, mit Grafiken, B-Roll, Betonung und Zooms) prüfen und in den Plan übernehmen, Grafiken rendern,
                                      Kontaktbogen und Vorschau-Video erzeugen.
  reel uebergabe <ID> [--entwurf] [--nicht-strikt]
                                      Ordner für DaVinci Resolve schreiben (Timeline, Untertitel, Grafiken) nach inhalte/<ID>/ergebnis/resolve.
  reel messe <ID> [--video export.mp4] [--plan plan.json]
                                      Misst das fertige Video (aus Resolve exportiert, Standard: die jüngste Datei in ergebnis/export/): Dauer, Bitrate, Schnitte je Minute, Zooms, Sättigung und
                                      Helligkeitsspanne, Lautheit, Spitze, Stille, Zeit bis zur ersten Aussage. Prüft gegen Export- und Audio-Preset und das Schnittprofil der Marke und
                                      schreibt ergebnis/qualitaet.json. Die Messung zeigt, wo ein Mensch hinschauen soll; «hochwertig» sagt sie nicht.
  reel status [<ID>]                  Zeigt, was für einen Inhalt schon da ist und was der nächste Schritt wäre (ohne ID: alle Inhalte).
`;

/* ---------- reine Helfer ---------- */

/** Die Kennung eines Inhalts, wie sie im Schnittplan steht (`projekt.inhalt`). */
const ID_MUSTER = /^c-\d{4}$/;

export function pruefeInhaltId(id: string | undefined): string {
  if (!id) throw new Error("Die Inhalt-ID fehlt, zum Beispiel: ./studio reel neu c-0007");
  if (!ID_MUSTER.test(id)) throw new Error(`«${id}» ist keine gültige Inhalt-ID (erwartet wird die Kennung aus «Inhalte», vier Ziffern: c-0007)`);
  return id;
}

export interface ReelPfade {
  inhalt: string;
  ergebnis: string;
  skript: string;
  aufnahmen: string;
  reel: string;
  transkripte: string;
  /** Die Stücke der Tonaufnahmen, die zu je einem Video gehören (Zeit 0 = Zeit 0 des Videos). */
  ton: string;
  quellen: string;
  plan: string;
  bericht: string;
  /** Der Plan, wie `reel vorbereiten` ihn baute, ohne das Gegenlesen. */
  planRoh: string;
  gegenlesen: string;
  gegenlesenAntwort: string;
  gegenlesenStand: string;
  transkriptText: string;
  auftrag: string;
  storyboard: string;
  planStoryboard: string;
  bogen: string;
  resolve: string;
  /** Hier liegt der Export aus Resolve, den `reel messe` misst. */
  export: string;
  qualitaet: string;
}

export function reelPfade(home: StudioHome, id: string): ReelPfade {
  const inhalt = path.join(home.pfad, "inhalte", id);
  const ergebnis = path.join(inhalt, "ergebnis");
  return {
    inhalt,
    ergebnis,
    skript: path.join(inhalt, "skript.md"),
    aufnahmen: path.join(medienOrdner(home), "rohmaterial", id),
    reel: path.join(inhalt, "reel.json"),
    transkripte: path.join(ergebnis, "transkripte"),
    ton: path.join(ergebnis, "ton"),
    quellen: path.join(ergebnis, "quellen.json"),
    plan: path.join(ergebnis, "plan.json"),
    bericht: path.join(ergebnis, "bericht.json"),
    planRoh: path.join(ergebnis, "plan-vor-gegenlesen.json"),
    gegenlesen: path.join(ergebnis, "gegenlesen.md"),
    gegenlesenAntwort: path.join(ergebnis, "gegenlesen.json"),
    gegenlesenStand: path.join(ergebnis, "gegenlesen-stand.json"),
    transkriptText: path.join(ergebnis, "transkript.md"),
    auftrag: path.join(ergebnis, "auftrag.md"),
    storyboard: path.join(ergebnis, "storyboard.json"),
    planStoryboard: path.join(ergebnis, "plan-storyboard.json"),
    bogen: path.join(ergebnis, "kontaktbogen.html"),
    resolve: path.join(ergebnis, "resolve"),
    export: path.join(ergebnis, "export"),
    qualitaet: path.join(ergebnis, "qualitaet.json"),
  };
}

/** Der Titel aus der ersten Überschrift des Skripts, sonst der Rückfall (die ID). */
export function skriptTitel(text: string, rueckfall: string): string {
  const m = /^#\s+(.+?)\s*$/m.exec(text);
  return m?.[1] ?? rueckfall;
}

const VIDEO_ENDUNGEN = [".mp4", ".mov", ".m4v", ".mkv", ".webm"];

/** Die Videodateien eines Ordners (nicht rekursiv, ohne versteckte Dateien), natürlich sortiert. */
export function listeAufnahmen(dir: string): string[] {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error(`Der Ordner mit den Aufnahmen fehlt: ${dir}`);
  const namen = fs
    .readdirSync(dir)
    .filter((n) => !n.startsWith(".") && VIDEO_ENDUNGEN.includes(path.extname(n).toLowerCase()) && fs.statSync(path.join(dir, n)).isFile())
    .sort((x, y) => x.localeCompare(y, "de", { numeric: true }));
  if (!namen.length) throw new Error(`Im Ordner ${dir} liegt kein Video (${VIDEO_ENDUNGEN.join(", ")})`);
  return namen;
}

/** Eine Kennung für die Quelle aus dem Dateinamen, eindeutig innerhalb des Reels. */
export function quellenId(dateiname: string, vergeben: Set<string>): string {
  const basis = path.basename(dateiname, path.extname(dateiname)).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "aufnahme";
  let id = basis;
  for (let n = 2; vergeben.has(id); n++) id = `${basis}-${n}`;
  vergeben.add(id);
  return id;
}

export interface ReelZustand {
  skript: boolean;
  aufnahmen: number;
  plan: boolean;
  /** Das Gegenlesen ist angewendet und gilt für den jetzigen Plan. */
  gegenlesen: boolean;
  auftrag: boolean;
  storyboard: boolean;
  planStoryboard: boolean;
  vorschau: boolean;
  resolve: boolean;
}

/** Der nächste Schritt, mit dem Befehl dazu. */
export function naechsterSchritt(id: string, z: ReelZustand): string {
  if (!z.skript) return `Skript ablegen: Skript kopieren, dann «./studio reel neu ${id} --zwischenablage»`;
  if (!z.aufnahmen) return `Videos in den Ordner rohmaterial/${id}/ kopieren, dann «./studio reel vorbereiten ${id}»`;
  if (!z.plan) return `«./studio reel vorbereiten ${id}»`;
  if (!z.gegenlesen) return `ergebnis/gegenlesen.md vollständig lesen, ergebnis/gegenlesen.json schreiben (Regie, Abbrüche, Verhörer), dann «./studio reel gegenlesen ${id}»`;
  if (!z.storyboard) return `Den Auftrag (ergebnis/auftrag.md) an Claude geben, die Antwort kopieren, dann «./studio reel storyboard ${id} --zwischenablage»`;
  if (!z.planStoryboard) return `«./studio reel storyboard ${id}»`;
  if (!z.resolve) return `Kontaktbogen und Vorschau ansehen. Passt es: «./studio reel uebergabe ${id}». Sonst eine neue Antwort kopieren und «./studio reel storyboard ${id} --zwischenablage»`;
  return "Ordner resolve in DaVinci Resolve importieren (LIESMICH.md darin)";
}

const ReelDatei = z.object({
  schema: z.literal(1),
  id: z.string(),
  marke: z.string().optional(),
  name: z.string().optional(),
  /** Nur wenn der Mensch einen anderen Ort angegeben hat (absolut). */
  skript: z.string().optional(),
  aufnahmen: z.string().optional(),
  gesprochen: z.array(z.number().int().positive()).optional(),
  modell: z.string().optional(),
  sprache: z.string().optional(),
  untertitel: z.enum(["gehoert", "skript"]).optional(),
  /** Von Hand angegebene Versätze des getrennten Tons je Videoquelle (Sekunden: Zeit in der Aufnahme = Zeit im Video + Versatz). `ton` nennt die Aufnahme, wenn es mehrere gibt. */
  versatz: z.record(z.string(), z.object({ versatz: z.number(), ton: z.string().optional() })).optional(),
  /** Von Hand festgelegte Farbart für alle Videos (sonst wird gemessen). */
  farbe: z.enum(["log", "rec709"]).optional(),
});
type ReelDatei = z.infer<typeof ReelDatei>;

function leseReel(p: ReelPfade): ReelDatei | undefined {
  if (!fs.existsSync(p.reel)) return undefined;
  const r = ReelDatei.safeParse(JSON.parse(fs.readFileSync(p.reel, "utf8")));
  if (!r.success) throw new Error(`${p.reel} ist ungültig. Löschen, dann «./studio reel neu <ID> --marke <key>» erneut ausführen`);
  return r.data;
}

function schreibeReel(p: ReelPfade, r: ReelDatei): void {
  fs.mkdirSync(path.dirname(p.reel), { recursive: true });
  const sauber = Object.fromEntries(Object.entries(r).filter(([, v]) => v !== undefined));
  fs.writeFileSync(p.reel, `${JSON.stringify(sauber, null, 2)}\n`);
}

/* ---------- Umgebung des Rechners ---------- */

export interface ReelGeraete {
  /** Text aus der Zwischenablage. Wirft, wenn das auf diesem Rechner nicht geht. */
  liesZwischenablage?: () => string;
  /** Legt Text in die Zwischenablage. Fehlt die Funktion, wird nichts kopiert (nicht-Mac). */
  schreibeZwischenablage?: (text: string) => void;
  /** Öffnet einen Ordner oder eine Datei (Finder, Browser, Player). Fehlt die Funktion, passiert nichts. */
  oeffne?: (pfad: string) => void;
  transkribiere?: typeof transkribiere;
}

const mac = process.platform === "darwin";

function standardGeraete(): Required<Omit<ReelGeraete, "schreibeZwischenablage" | "oeffne">> & Pick<ReelGeraete, "schreibeZwischenablage" | "oeffne"> {
  return {
    liesZwischenablage: () => {
      const r = spawnSync("pbpaste", [], { encoding: "utf8" });
      if (r.error || r.status !== 0) throw new Error("Die Zwischenablage lässt sich nur auf dem Mac lesen (pbpaste). Stattdessen --datei oder --skript mit einer Datei angeben");
      return r.stdout;
    },
    schreibeZwischenablage: mac ? (text) => void spawnSync("pbcopy", [], { input: text }) : undefined,
    oeffne: mac ? (pfad) => void spawnSync("open", [pfad]) : undefined,
    transkribiere,
  };
}

const str = (a: Args, name: string): string | undefined => (typeof a.opt[name] === "string" && a.opt[name] !== "" ? (a.opt[name] as string) : undefined);

function braucheHome(): StudioHome {
  const h = studioHome();
  if (!h) throw new Error("Der Studio-Ordner ist auf diesem Rechner nicht eingerichtet: «./studio init» ausführen");
  return h;
}

function einzigeMarke(env: Umgebung): string {
  const keys = fs.existsSync(env.markenDir) ? fs.readdirSync(env.markenDir).filter((n) => n.endsWith(".json")).map((n) => n.slice(0, -5)).sort() : [];
  if (keys.length === 1) return keys[0]!;
  throw new Error(`--marke fehlt (Schlüssel des Markenprofils${keys.length ? `, vorhanden: ${keys.join(", ")}` : ""})`);
}

function zahlenListe(text: string): number[] {
  return text.split(",").map((x) => Number(x.trim())).filter((x) => Number.isInteger(x) && x > 0);
}

const f1 = (n: number): string => n.toFixed(1).replace(".", ",");

/* ---------- reel neu ---------- */

async function neu(a: Args, env: Umgebung, g: ReturnType<typeof standardGeraete>): Promise<number> {
  const home = braucheHome();
  const id = pruefeInhaltId(a.pos[2]);
  const p = reelPfade(home, id);
  const alt = leseReel(p);
  const marke = str(a, "marke") ?? alt?.marke ?? einzigeMarke(env);
  ladeMarke(env, marke);

  let skriptText: string | undefined;
  if (a.opt["zwischenablage"] === true) {
    skriptText = g.liesZwischenablage();
    if (!skriptText.trim()) throw new Error("Die Zwischenablage ist leer. Zuerst das Skript kopieren");
  } else if (str(a, "skript")) {
    const datei = path.resolve(str(a, "skript")!);
    if (!fs.existsSync(datei)) throw new Error(`Die Skript-Datei fehlt: ${datei}`);
    skriptText = fs.readFileSync(datei, "utf8");
  }
  if (skriptText !== undefined && !skriptText.trim()) throw new Error("Das Skript ist leer");
  if (skriptText !== undefined && fs.existsSync(p.skript) && fs.readFileSync(p.skript, "utf8") !== skriptText && a.opt["ueberschreiben"] !== true) {
    throw new Error(`Es gibt schon ein anderes Skript: ${p.skript}. Mit --ueberschreiben ersetzen (das alte geht verloren)`);
  }

  fs.mkdirSync(p.inhalt, { recursive: true });
  fs.mkdirSync(p.aufnahmen, { recursive: true });
  if (skriptText !== undefined) fs.writeFileSync(p.skript, skriptText.endsWith("\n") ? skriptText : `${skriptText}\n`);
  schreibeReel(p, { ...(alt ?? { schema: 1 as const, id }), id, marke, ...(str(a, "name") ? { name: str(a, "name") } : {}) });

  const hatSkript = fs.existsSync(p.skript);
  const zaehlzeilen = hatSkript ? fs.readFileSync(p.skript, "utf8").split("\n").filter((l) => l.trim() && !/^\s*(#|<!--|---|>)/.test(l)).length : 0;
  console.log(`Inhalt ${id}, Marke ${marke}`);
  console.log(`Skript:    ${p.skript}${hatSkript ? ` (${zaehlzeilen} Zeilen)` : "  (fehlt noch)"}`);
  console.log(`Aufnahmen: ${p.aufnahmen}`);
  console.log(`Ergebnis:  ${p.ergebnis}`);
  if (!hatSkript) console.log(`\nSkript fehlt noch: Skript kopieren, dann «./studio reel neu ${id} --zwischenablage»`);
  console.log(`\nNächster Schritt: die Videos in den Ordner Aufnahmen kopieren, dann\n  ./studio reel vorbereiten ${id}`);
  if (a.opt["nicht-oeffnen"] !== true) g.oeffne?.(p.aufnahmen);
  return 0;
}

/* ---------- Quellen und Transkripte (vorbereiten und transkript) ---------- */

interface Grundlage {
  markeKey: string;
  aufnahmenDir: string;
  quellen: SchnittQuelle[];
  pfade: Map<string, string>;
  /** Video-Quelle → Stück der Tonaufnahme in der Zeit des Videos (nur bei getrenntem Ton). */
  fenster: Map<string, string>;
  transkripte: { quelle: string; segmente: ReturnType<typeof leseTranskript> }[];
  modell: string;
  sprache: string;
  /** Von Hand angegebene Versätze (gemerkt in reel.json). */
  versatz: Map<string, { versatz: number; ton?: string }>;
}

/** Was ein Stück Tonaufnahme beschreibt: aus welcher Datei, mit welchem Versatz. Ändert sich das, sind Stück, Transkript und Stille veraltet. */
interface TonStand {
  ton: { quelle: string; versatz: number; groesse: number; mtimeMs: number } | null;
  /** Nur bei Transkripten: Fingerabdruck der Datei, die Whisper hörte, Modell und Sprache. */
  fp?: string;
  modell?: string;
  sprache?: string;
}
const leseStand = (datei: string): TonStand => {
  try {
    return JSON.parse(fs.readFileSync(datei, "utf8")) as TonStand;
  } catch {
    return { ton: null };
  }
};
const schreibeStand = (datei: string, stand: TonStand): void => {
  fs.mkdirSync(path.dirname(datei), { recursive: true });
  fs.writeFileSync(datei, `${JSON.stringify(stand)}\n`);
};

/** Die von Hand angegebenen Versätze für `reel.json` (leer, wenn es keine gibt). */
const versatzFelder = (gr: Grundlage): { versatz?: ReelDatei["versatz"] } => (gr.versatz.size ? { versatz: Object.fromEntries(gr.versatz) } : {});

/** Sondiert die Videos des Aufnahmenordners, legt getrennte Tonaufnahmen darüber und transkribiert (vorhandene Transkripte bleiben, solange weder Video noch Ton neuer sind). */
async function holeGrundlage(a: Args, env: Umgebung, g: ReturnType<typeof standardGeraete>, home: StudioHome, p: ReelPfade, alt: ReelDatei | undefined, uhr: Stoppuhr = stoppuhr()): Promise<Grundlage> {
  const markeKey = str(a, "marke") ?? alt?.marke ?? einzigeMarke(env);
  ladeMarke(env, markeKey);
  const aufnahmenDir = path.resolve(str(a, "aufnahmen") ?? alt?.aufnahmen ?? p.aufnahmen);
  let dateien: string[];
  try {
    dateien = listeAufnahmen(aufnahmenDir);
  } catch (e) {
    throw new Error(`${(e as Error).message}\nDie Videos gehören nach ${p.aufnahmen} (oder --aufnahmen <ordner>)`);
  }
  const modell = str(a, "modell") ?? alt?.modell ?? STANDARD_MODELL;
  const sprache = str(a, "sprache") ?? alt?.sprache ?? "de";

  console.log(`${dateien.length} ${dateien.length === 1 ? "Video" : "Videos"} in ${aufnahmenDir}`);
  const vergeben = new Set<string>();
  const quellen: SchnittQuelle[] = [];
  const pfade = new Map<string, string>();
  const sondiereDatei = async (abs: string, datei: string): Promise<SchnittQuelle> => {
    const rel = relativierePfad(home, abs);
    if (!rel) throw new Error(`${abs} liegt ausserhalb von Studio- und Medien-Ordner. Die Datei nach ${p.aufnahmen} verschieben`);
    let s: Awaited<ReturnType<typeof sondiere>>;
    try {
      s = await sondiere(abs);
    } catch (e) {
      throw new Error(`${datei}: ${(e as Error).message}\nLiegt die Datei in OneDrive nur online? Im Finder Rechtsklick, «Immer auf diesem Gerät behalten»`);
    }
    return SchnittQuelle.parse({ id: quellenId(datei, vergeben), pfad: rel, ...s });
  };
  await uhr.messe("Videos sondieren", async () => {
    for (const datei of dateien) {
      const abs = path.join(aufnahmenDir, datei);
      const q = await sondiereDatei(abs, datei);
      quellen.push(q);
      pfade.set(q.id, abs);
    }
  });
  const videos = quellen.filter((q) => q.art === "video");
  if (!videos.length) throw new Error(`Keine der Dateien in ${aufnahmenDir} hat ein Bild`);

  // Getrennter Ton: Tonaufnahmen im selben Ordner werden über die Videos gelegt
  let manuell = new Map(Object.entries(alt?.versatz ?? {}));
  if (str(a, "versatz")) manuell = new Map([...manuell, ...parseVersatzOption(str(a, "versatz")!, videos.map((v) => v.id))]);
  const toene: { quelle: SchnittQuelle; datei: string }[] = [];
  if (a.opt["ohne-ton-sync"] === true) console.log("Getrennter Ton ausgelassen (--ohne-ton-sync): Es zählt die Tonspur der Kamera");
  else {
    for (const datei of listeTonDateien(aufnahmenDir)) {
      const abs = path.join(aufnahmenDir, datei);
      const q = await sondiereDatei(abs, datei);
      if (q.art !== "audio") {
        console.log(`${datei}: kein reiner Ton (hat ein Bild), wird nicht als Tonaufnahme benutzt`);
        continue;
      }
      toene.push({ quelle: q, datei: abs });
    }
  }
  if (toene.length) await uhr.messe("Ton abgleichen", async () => {
    console.log(`${toene.length} ${toene.length === 1 ? "Tonaufnahme" : "Tonaufnahmen"} im Ordner (${toene.map((t) => path.basename(t.datei)).join(", ")}): Lege sie über die Videos, das dauert einige Sekunden je Datei`);
    const r = await ordneTonZu({
      videos: videos.map((v) => ({ id: v.id, datei: pfade.get(v.id)! })),
      toene: toene.map((t) => ({ id: t.quelle.id, datei: t.datei })),
      ...(manuell.size ? { manuell } : {}),
    });
    for (const m of r.meldungen) console.log(m);
    const benutzt = new Set<string>();
    for (const [video, paar] of r.paare) {
      quellen.find((q) => q.id === video)!.ton = { quelle: paar.ton, versatz: paar.versatz };
      benutzt.add(paar.ton);
    }
    for (const t of toene) {
      if (!benutzt.has(t.quelle.id)) continue;
      quellen.push(t.quelle);
      pfade.set(t.quelle.id, t.datei);
    }
  });
  else if (manuell.size) console.log("Es sind Versätze für getrennten Ton gemerkt, aber im Ordner liegt keine Tonaufnahme: Es zählt die Tonspur der Kamera");

  fs.mkdirSync(p.transkripte, { recursive: true });
  const transkripte: Grundlage["transkripte"] = [];
  const fenster = new Map<string, string>();
  const quelleNachId = new Map(quellen.map((q) => [q.id, q]));
  const cacheDir = path.join(env.datenDir, "cache", "transkripte");
  let nr = 0;
  await uhr.messe("Transkription", async () => {
    for (const q of videos) {
      nr++;
      const ziel = path.join(p.transkripte, `${q.id}.json`);
      const standDatei = path.join(p.transkripte, `${q.id}.stand.json`);
      const abs = pfade.get(q.id)!;
      let eingang = abs;
      let soll: TonStand = { ton: null };
      let beschreibung = "";
      if (q.ton) {
        const audio = quelleNachId.get(q.ton.quelle)!;
        const audioAbs = pfade.get(audio.id)!;
        const st = fs.statSync(audioAbs);
        soll = { ton: { quelle: audio.id, versatz: q.ton.versatz, groesse: st.size, mtimeMs: Math.round(st.mtimeMs) } };
        // Das Stück der Aufnahme, das zum Video gehört: Whisper, Stille und Pegel rechnen damit in der Zeit des Videos
        eingang = path.join(p.ton, `${q.id}.wav`);
        const fensterStand = path.join(p.ton, `${q.id}.stand.json`);
        if (!fs.existsSync(eingang) || JSON.stringify(leseStand(fensterStand)) !== JSON.stringify(soll)) {
          await schneideTonFenster(audioAbs, q.ton.versatz, q.dauer, eingang);
          schreibeStand(fensterStand, soll);
        }
        fenster.set(q.id, eingang);
        beschreibung = `, Ton von ${path.basename(audioAbs)} mit Versatz ${q.ton.versatz >= 0 ? "+" : "−"}${Math.abs(q.ton.versatz).toFixed(2).replace(".", ",")} s`;
      }
      // Ein Transkript gilt, solange die Datei, die Whisper hörte (Inhalt, nicht Änderungszeit), das Modell und die Sprache dieselben sind
      const stand: TonStand = { ...soll, fp: fingerabdruck(eingang), modell, sprache };
      const ist = leseStand(standDatei);
      const gleich = fs.existsSync(ziel) && ist.fp === stand.fp && ist.modell === modell && ist.sprache === sprache && JSON.stringify(ist.ton) === JSON.stringify(soll.ton);
      // Transkripte aus der Zeit vor dem Zwischenspeicher haben keinen Fingerabdruck: gelten, wenn sie mit dem Standardmodell nach dem Video entstanden
      const aelter = !gleich && fs.existsSync(ziel) && ist.fp === undefined && modell === STANDARD_MODELL && fs.statSync(abs).mtimeMs <= fs.statSync(ziel).mtimeMs && JSON.stringify(ist.ton) === JSON.stringify(soll.ton);
      const zwischen = cacheDatei(cacheDir, { fp: stand.fp!, modell, sprache });
      const transkribiereJetzt = async (): Promise<void> => {
        console.log(`\nTranskribiere ${nr} von ${videos.length}: ${path.basename(abs)}${beschreibung} (Modell ${modell}, das dauert je nach Länge einige Minuten)`);
        const r = await g.transkribiere({ eingang, ziel, modell, sprache });
        schreibeStand(standDatei, stand);
        fs.mkdirSync(cacheDir, { recursive: true });
        fs.copyFileSync(ziel, zwischen);
        console.log(`  ${r.segmente} Segmente über ${f1(r.spanne)} s, ${r.mitWortzeiten} mit Wortzeiten`);
      };
      if (a.opt["neu"] === true) await transkribiereJetzt();
      else if (gleich) console.log(`Transkript vorhanden: ${q.id} (mit --neu neu erstellen)`);
      else if (aelter) {
        schreibeStand(standDatei, stand);
        fs.mkdirSync(cacheDir, { recursive: true });
        fs.copyFileSync(ziel, zwischen);
        console.log(`Transkript vorhanden: ${q.id} (aus einem früheren Lauf übernommen, mit --neu neu erstellen)`);
      } else if (fs.existsSync(zwischen)) {
        fs.copyFileSync(zwischen, ziel);
        schreibeStand(standDatei, stand);
        console.log(`Transkript aus dem Zwischenspeicher: ${q.id} (dieselbe Datei, dasselbe Modell, nicht noch einmal transkribiert)`);
      } else await transkribiereJetzt();
      transkripte.push({ quelle: q.id, segmente: leseTranskript(JSON.parse(fs.readFileSync(ziel, "utf8"))) });
    }
  });
  return { markeKey, aufnahmenDir, quellen, pfade, fenster, transkripte, modell, sprache, versatz: manuell };
}

/* ---------- reel transkript (ohne Skript) ---------- */

/** Das Transkript als nummerierte Sätze mit Zeiten: Grundlage, wenn es kein Skript gibt oder es nicht stimmt. Claude wählt die Sätze und schreibt `skript.md`. */
export function transkriptMarkdown(name: string, t: { quelle: string; segmente: { von: number; bis: number; text: string }[] }[]): string {
  const aus: string[] = [`# Transkript: ${name}`, "", "Was Whisper hörte, Satz für Satz mit Zeiten der Quelldatei. Wähle die Sätze fürs Video und schreibe sie in `skript.md`, **wörtlich und in der Reihenfolge des Videos**, einen Satz je Zeile. Wiederholungen derselben Aussage (Takes) schreibst du nur einmal; das System sucht den besten Take. Lass Regieanweisungen, Abbrüche und Gespräch weg.", ""];
  let n = 0;
  for (const q of t) {
    aus.push(`## Quelle ${q.quelle}`, "");
    for (const s of q.segmente) aus.push(`${++n}. [${s.von.toFixed(1).replace(".", ",")} bis ${s.bis.toFixed(1).replace(".", ",")} s] ${s.text}`);
    aus.push("");
  }
  return aus.join("\n");
}

async function transkript(a: Args, env: Umgebung, g: ReturnType<typeof standardGeraete>): Promise<number> {
  const home = braucheHome();
  const id = pruefeInhaltId(a.pos[2]);
  const p = reelPfade(home, id);
  const alt = leseReel(p);
  const gr = await holeGrundlage(a, env, g, home, p, alt);
  const name = str(a, "name") ?? alt?.name ?? id;
  fs.mkdirSync(p.ergebnis, { recursive: true });
  fs.writeFileSync(p.quellen, `${JSON.stringify(gr.quellen, null, 2)}\n`);
  fs.writeFileSync(p.transkriptText, `${transkriptMarkdown(name, gr.transkripte)}\n`);
  schreibeReel(p, { ...(alt ?? { schema: 1 as const, id }), id, marke: gr.markeKey, ...(str(a, "name") ? { name } : {}), ...versatzFelder(gr) });
  console.log(`\nTranskript zum Lesen: ${p.transkriptText}\nNächster Schritt: Sätze wählen und in ${p.skript} schreiben (wörtlich, ein Satz je Zeile), dann «./studio reel vorbereiten ${id}»`);
  return 0;
}

/* ---------- reel vorbereiten ---------- */

async function vorbereiten(a: Args, env: Umgebung, g: ReturnType<typeof standardGeraete>): Promise<number> {
  const home = braucheHome();
  const id = pruefeInhaltId(a.pos[2]);
  const p = reelPfade(home, id);
  const alt = leseReel(p);
  const markeKey = str(a, "marke") ?? alt?.marke ?? einzigeMarke(env);
  const marke = ladeMarke(env, markeKey);

  const skriptDatei = path.resolve(alt?.skript ?? p.skript);
  if (!fs.existsSync(skriptDatei)) throw new Error(`Das Skript fehlt: ${skriptDatei}\nSkript kopieren und «./studio reel neu ${id} --zwischenablage» ausführen, oder ohne Skript: «./studio reel transkript ${id}»`);
  const skriptText = fs.readFileSync(skriptDatei, "utf8");

  const gesprochen = str(a, "gesprochen") ? zahlenListe(str(a, "gesprochen")!) : (alt?.gesprochen ?? []);
  const untertitel = (str(a, "untertitel") as "gehoert" | "skript" | undefined) ?? alt?.untertitel ?? "gehoert";
  if (untertitel !== "gehoert" && untertitel !== "skript") throw new Error("--untertitel erwartet «gehoert» oder «skript»");
  const name = str(a, "name") ?? alt?.name ?? skriptTitel(skriptText, id);
  const uhr = stoppuhr();
  const gr = await holeGrundlage(a, env, g, home, p, alt, uhr);
  const { quellen, transkripte } = gr;

  // Farbe: flaches Material (Log) bekommt einen Look, normales einen Angleich
  const farbeOpt = str(a, "farbe");
  if (farbeOpt !== undefined && farbeOpt !== "log" && farbeOpt !== "rec709" && farbeOpt !== "auto") throw new Error("--farbe erwartet «log», «rec709» oder «auto»");
  const farbVorgabe: Farbart | undefined = farbeOpt === "auto" ? undefined : ((farbeOpt as Farbart | undefined) ?? alt?.farbe);
  let messungen = new Map<string, Farbmessung>();
  let farbeGemessen = false;
  if (a.opt["ohne-farbe"] === true) console.log("Farbe nicht gemessen (--ohne-farbe): keine LUT, das Material bleibt unverändert");
  else {
    const fr = await uhr.messe("Farbe messen", () => bestimmeFarbe({ videos: quellen.filter((q) => q.art === "video").map((q) => ({ id: q.id, datei: gr.pfade.get(q.id)!, dauer: q.dauer })), ...(farbVorgabe ? { vorgabe: farbVorgabe } : {}) }));
    for (const m of fr.meldungen) console.log(m);
    for (const [id, f] of fr.farbart) quellen.find((q) => q.id === id)!.farbe = f;
    messungen = fr.messungen;
    farbeGemessen = fr.farbart.size > 0;
  }

  // Stille der Tonspur: Anfang und Ende der Clips rasten dort ein, wo wirklich nichts gesprochen wird
  const stille = new Map<string, Stille[]>();
  let stilleNotiz = "";
  if (a.opt["ohne-stille"] === true) stilleNotiz = "Stille nicht gemessen (--ohne-stille): Die Schnitte folgen den Wortzeiten von Whisper";
  else {
    await uhr.messe("Stille messen", async () => {
      for (const q of quellen.filter((x) => x.art === "video" && (x.hatAudio || x.ton))) {
        try {
          // Mit getrenntem Ton gilt die Stille der Tonaufnahme (im Stück, das zum Video gehört), nicht die der Kamera
          stille.set(q.id, await findeStille(gr.fenster.get(q.id) ?? gr.pfade.get(q.id)!, { dauer: q.dauer }));
        } catch (e) {
          stilleNotiz = `Stille nicht gemessen: ${(e as Error).message}`;
        }
      }
    });
  }

  // Zuordnung und Plan
  const ergebnis = await uhr.messe("Zuordnen und Plan", () =>
    fuehreZuordnungAus({
      marke,
      skriptText,
      skriptQuelle: skriptDatei,
      quellen,
      transkripte,
      name,
      inhalt: id,
      gesprochen,
      untertitel,
      stille,
      home,
      ohnePegel: a.opt["ohne-pegel"] === true,
    }),
  );
  fs.mkdirSync(p.ergebnis, { recursive: true });
  fs.writeFileSync(p.quellen, `${JSON.stringify(quellen, null, 2)}\n`);
  const planText = `${JSON.stringify(ergebnis.plan, null, 2)}\n`;
  fs.writeFileSync(p.planRoh, planText);
  fs.writeFileSync(p.plan, planText);
  if (farbeGemessen) for (const m of schreibeLuts({ ergebnis: p.ergebnis, marke, quellen: ergebnis.plan.quellen, messungen }).meldungen) console.log(m);
  else fs.rmSync(lutOrdner(p.ergebnis), { recursive: true, force: true });
  fs.rmSync(p.gegenlesenStand, { force: true });
  fs.rmSync(p.auftrag, { force: true });
  fs.writeFileSync(p.bericht, `${JSON.stringify({ zuordnung: ergebnis.zuordnung, markierungen: ergebnis.markierungen }, null, 2)}\n`);
  const lesen = baueGegenlesen(ergebnis.plan, ergebnis.zuordnung, transkripte);
  fs.writeFileSync(p.gegenlesen, gegenlesenMarkdown(name, lesen));
  schreibeReel(p, {
    schema: 1,
    id,
    marke: markeKey,
    name,
    ...(alt?.skript ? { skript: alt.skript } : {}),
    ...(str(a, "aufnahmen") ? { aufnahmen: gr.aufnahmenDir } : alt?.aufnahmen ? { aufnahmen: alt.aufnahmen } : {}),
    ...(gesprochen.length ? { gesprochen } : {}),
    ...(untertitel !== "gehoert" ? { untertitel } : {}),
    ...(str(a, "modell") ?? alt?.modell ? { modell: gr.modell } : {}),
    ...(str(a, "sprache") ?? alt?.sprache ? { sprache: gr.sprache } : {}),
    ...(farbVorgabe ? { farbe: farbVorgabe } : {}),
    ...versatzFelder(gr),
  });

  console.log("");
  for (const l of zuordnungBericht(ergebnis.zuordnung, ergebnis.markierungen)) console.log(l);
  if (ergebnis.pegelNotiz) console.log(`\n${ergebnis.pegelNotiz}`);
  if (stilleNotiz) console.log(stilleNotiz);
  const befunde = pruefeSchnittplan(ergebnis.plan, { profil: marke.schnittprofil });
  if (befunde.length) {
    console.log("\nPrüfung des Plans:");
    for (const b of befunde) console.log(`${b.stufe === "fehler" ? "FEHLER " : "Hinweis"} ${b.code}: ${b.text}`);
  }
  const dauer = platziere(ergebnis.plan);
  console.log(`\nPlan: ${p.plan} (${ergebnis.plan.clips.length} Clips, ${f1(dauer.gesamtFrames / ergebnis.plan.projekt.fps)} s)`);
  console.log(`Zum Gegenlesen: ${p.gegenlesen}`);
  const zeiten = uhr.zeilen();
  if (zeiten.length) console.log(`\nWo die Zeit blieb:\n${zeiten.join("\n")}`);
  console.log(`\nNächster Schritt: Gegenlesen. ${p.gegenlesen} vollständig lesen (Skript gegen Gehörtes, Regie, Abbrüche, Verhörer), Ergebnis nach ${p.gegenlesenAntwort} schreiben, dann:\n  ./studio reel gegenlesen ${id}`);
  return 0;
}

/* ---------- reel gegenlesen ---------- */

async function gegenlesen(a: Args, env: Umgebung, g: ReturnType<typeof standardGeraete>): Promise<number> {
  const home = braucheHome();
  const id = pruefeInhaltId(a.pos[2]);
  const p = reelPfade(home, id);
  const alt = leseReel(p);
  if (!fs.existsSync(p.planRoh)) throw new Error(`Es gibt noch keinen Plan: zuerst «./studio reel vorbereiten ${id}»`);

  let text: string | undefined;
  if (a.opt["zwischenablage"] === true) {
    text = g.liesZwischenablage();
    if (!text.trim()) throw new Error("Die Zwischenablage ist leer. Zuerst die Antwort kopieren");
  } else if (str(a, "datei")) text = fs.readFileSync(path.resolve(str(a, "datei")!), "utf8");
  else if (fs.existsSync(p.gegenlesenAntwort)) text = fs.readFileSync(p.gegenlesenAntwort, "utf8");
  if (text === undefined) throw new Error(`Das Ergebnis des Gegenlesens fehlt: ${p.gegenlesenAntwort}\n${p.gegenlesen} lesen und die Antwort als JSON dorthin schreiben (Format am Ende der Datei)`);
  let json: unknown;
  try {
    json = extrahiereJson(text);
  } catch (e) {
    throw new Error(`In der Antwort steht kein JSON: ${(e as Error).message}`);
  }
  const antwort = GegenlesenAntwort.safeParse(json);
  if (!antwort.success) throw new Error(`Das Gegenlesen ist ungültig: ${antwort.error.issues.map((i) => `${i.path.join(".") || "(Wurzel)"}: ${i.message}`).join("; ")}`);
  fs.writeFileSync(p.gegenlesenAntwort, `${JSON.stringify(antwort.data, null, 2)}\n`);

  // immer vom Plan «vor dem Gegenlesen» aus: Zweimal ausführen ergibt dasselbe, eine geänderte Antwort ersetzt die vorige
  const roh = leseSchnittplan(JSON.parse(fs.readFileSync(p.planRoh, "utf8")));
  const r = wendeGegenlesenAn(roh, antwort.data);
  const planText = `${JSON.stringify(r.plan, null, 2)}\n`;
  fs.writeFileSync(p.plan, planText);
  fs.writeFileSync(p.gegenlesenStand, `${JSON.stringify({ planHash: planHash(planText), geschnitten: r.geschnitten, korrigiert: r.korrigiert, notiz: antwort.data.notiz }, null, 2)}\n`);
  const vorher = platziere(roh).gesamtFrames;
  const nachher = platziere(r.plan).gesamtFrames;
  console.log(`Gegenlesen angewendet: ${r.geschnitten} Schnitte, ${r.korrigiert} Wörter korrigiert, Film ${f1(nachher / r.plan.projekt.fps)} s${nachher !== vorher ? ` (vorher ${f1(vorher / r.plan.projekt.fps)} s)` : ""}`);
  for (const i of r.ignoriert) console.log(`Hinweis: ${i}`);
  if (antwort.data.notiz) console.log(`Notiz: ${antwort.data.notiz}`);

  // Auftrag fürs Storyboard, aus dem Plan nach dem Gegenlesen
  const markeKey = alt?.marke ?? r.plan.projekt.marke;
  const vorherLog = console.log;
  console.log = () => undefined;
  try {
    await auftragBefehl(parseArgs(["schnitt", "auftrag", "--plan", p.plan, "--marke", markeKey, "-o", p.auftrag, ...(str(a, "regeln") ? ["--regeln", str(a, "regeln")!] : []), ...(str(a, "katalog") ? ["--katalog", str(a, "katalog")!] : [])]), env);
  } finally {
    console.log = vorherLog;
  }
  console.log(`Auftrag fürs Storyboard: ${p.auftrag}`);
  const kopiert = a.opt["nicht-kopieren"] !== true && g.schreibeZwischenablage !== undefined;
  if (kopiert) g.schreibeZwischenablage!(fs.readFileSync(p.auftrag, "utf8"));
  console.log(
    `\nNächster Schritt: Storyboard.\n  1. ${kopiert ? "Der Auftrag ist in der Zwischenablage: in den Chat mit Claude einfügen" : `${p.auftrag} lesen`} und das Storyboard schreiben lassen (Claude in einer Sitzung auf dem Mac schreibt es nach ${p.storyboard}).\n  2. ./studio reel storyboard ${id}${kopiert ? " --zwischenablage" : ""}`,
  );
  return 0;
}

/* ---------- reel storyboard ---------- */

/** Führt einen Schritt aus und hält Fehler fest, damit die nächsten trotzdem laufen. Gibt den Exit-Code zurück. */
async function schritt(name: string, f: () => Promise<number>): Promise<number> {
  try {
    return await f();
  } catch (e) {
    console.log(`\nFEHLER bei ${name}: ${(e as Error).message}`);
    return 1;
  }
}

/** Die jüngste Vorschau-Datei des Ergebnis-Ordners (vorschau.mp4, vorschau-v2.mp4 …). */
function juengsteVorschau(ergebnis: string): string | undefined {
  if (!fs.existsSync(ergebnis)) return undefined;
  const treffer = fs.readdirSync(ergebnis).filter((n) => /^vorschau(-v\d+)?\.mp4$/.test(n)).map((n) => path.join(ergebnis, n));
  return treffer.sort((x, y) => fs.statSync(y).mtimeMs - fs.statSync(x).mtimeMs)[0];
}

async function storyboard(a: Args, env: Umgebung, g: ReturnType<typeof standardGeraete>): Promise<number> {
  const home = braucheHome();
  const id = pruefeInhaltId(a.pos[2]);
  const p = reelPfade(home, id);
  const alt = leseReel(p);
  if (!fs.existsSync(p.plan)) throw new Error(`Es gibt noch keinen Plan: zuerst «./studio reel vorbereiten ${id}»`);
  if (a.opt["ohne-gegenlesen"] === true) console.log("Hinweis: Ohne Gegenlesen (--ohne-gegenlesen). Regie und Verhörer im Video bleiben unbemerkt.");
  else if (!gegenlesenGilt(p)) {
    throw new Error(`Das Gegenlesen fehlt oder gilt nicht mehr für den jetzigen Plan. ${p.gegenlesen} lesen, ${p.gegenlesenAntwort} schreiben, dann «./studio reel gegenlesen ${id}». Eine Ausnahme: --ohne-gegenlesen`);
  }

  let antwort: string | undefined;
  if (a.opt["zwischenablage"] === true) {
    antwort = g.liesZwischenablage();
    if (!antwort.trim()) throw new Error("Die Zwischenablage ist leer. Zuerst die Antwort von Claude kopieren (Kopieren-Knopf am Codeblock)");
  } else if (str(a, "datei")) {
    antwort = fs.readFileSync(path.resolve(str(a, "datei")!), "utf8");
  }
  if (antwort !== undefined) {
    let json: unknown;
    try {
      json = extrahiereJson(antwort);
    } catch (e) {
      throw new Error(`In der Antwort steht kein Storyboard als JSON: ${(e as Error).message}`);
    }
    if (fs.existsSync(p.storyboard)) fs.copyFileSync(p.storyboard, path.join(p.ergebnis, "storyboard-vorher.json"));
    fs.writeFileSync(p.storyboard, `${JSON.stringify(json, null, 2)}\n`);
    console.log(`Storyboard gespeichert: ${p.storyboard}${fs.existsSync(path.join(p.ergebnis, "storyboard-vorher.json")) ? " (das vorige als storyboard-vorher.json)" : ""}`);
  } else if (!fs.existsSync(p.storyboard)) {
    throw new Error(`Das Storyboard fehlt: ${p.storyboard}\nAntwort von Claude kopieren und «./studio reel storyboard ${id} --zwischenablage» ausführen`);
  }

  const marke = alt?.marke;
  const gemeinsam = ["--plan", p.plan, ...(marke ? ["--marke", marke] : []), ...(a.opt["entwurf"] === true ? ["--entwurf"] : []), ...(str(a, "katalog") ? ["--katalog", str(a, "katalog")!] : [])];
  let code = await storyboardBefehl(parseArgs(["schnitt", "storyboard", ...gemeinsam, "--storyboard", p.storyboard, "-o", p.planStoryboard, ...(a.opt["ohne-rendern"] === true ? [] : ["--rendern"])]), env);

  const plan2 = ["--plan", p.planStoryboard];
  code = Math.max(code, await schritt("Kontaktbogen", () => schnittBefehl("kontaktbogen", parseArgs(["schnitt", "kontaktbogen", ...plan2, "-o", p.bogen]), env)));
  if (a.opt["ohne-vorschau"] !== true) code = Math.max(code, await schritt("Vorschau", () => schnittBefehl("vorschau", parseArgs(["schnitt", "vorschau", ...plan2]), env)));

  if (a.opt["nicht-oeffnen"] !== true) {
    if (fs.existsSync(p.bogen)) g.oeffne?.(p.bogen);
    const v = juengsteVorschau(p.ergebnis);
    if (v) g.oeffne?.(v);
  }
  console.log(
    `\nNächster Schritt: Kontaktbogen und Vorschau ansehen.\n  Passt es:    ./studio reel uebergabe ${id}${a.opt["entwurf"] === true ? " --entwurf" : ""}\n  Sonst:       Änderungswunsch an Claude schreiben, neue Antwort kopieren, dann ./studio reel storyboard ${id} --zwischenablage${a.opt["entwurf"] === true ? " --entwurf" : ""}`,
  );
  return code;
}

/* ---------- reel uebergabe ---------- */

async function uebergabe(a: Args, env: Umgebung): Promise<number> {
  const home = braucheHome();
  const id = pruefeInhaltId(a.pos[2]);
  const p = reelPfade(home, id);
  let plan = p.planStoryboard;
  if (!fs.existsSync(plan)) {
    if (!fs.existsSync(p.plan)) throw new Error(`Es gibt noch keinen Plan: zuerst «./studio reel vorbereiten ${id}»`);
    plan = p.plan;
    console.log("Hinweis: Es gibt noch kein Storyboard. Die Übergabe enthält nur die Sprache (keine B-Roll, keine Grafiken).");
  }
  leseSchnittplan(JSON.parse(fs.readFileSync(plan, "utf8")));
  return schnittBefehl("resolve", parseArgs(["schnitt", "resolve", "--plan", plan, "--aus", p.resolve, ...(a.opt["entwurf"] === true ? ["--entwurf"] : []), ...(a.opt["nicht-strikt"] === true ? ["--nicht-strikt"] : [])]), env);
}

/* ---------- reel messe ---------- */

const EXPORT_ENDUNGEN = [".mp4", ".mov", ".m4v"];

/** Die jüngste Videodatei eines Ordners (nach Änderungszeit), oder undefined. */
export function juengsterExport(dir: string): string | undefined {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return undefined;
  const dateien = fs
    .readdirSync(dir)
    .filter((n) => !n.startsWith(".") && EXPORT_ENDUNGEN.includes(path.extname(n).toLowerCase()) && fs.statSync(path.join(dir, n)).isFile())
    .map((n) => ({ pfad: path.join(dir, n), zeit: fs.statSync(path.join(dir, n)).mtimeMs }))
    .sort((x, y) => y.zeit - x.zeit);
  return dateien[0]?.pfad;
}

async function messe(a: Args, env: Umgebung): Promise<number> {
  const home = braucheHome();
  const id = pruefeInhaltId(a.pos[2]);
  const p = reelPfade(home, id);
  const alt = leseReel(p);
  const datei = str(a, "video") ? path.resolve(str(a, "video")!) : juengsterExport(p.export);
  if (!datei) throw new Error(`Es gibt kein Video zum Messen. Den Export aus Resolve in ${p.export} ablegen oder «--video <datei>» angeben`);
  if (!fs.existsSync(datei)) throw new Error(`Das Video fehlt: ${datei}`);
  const planDatei = str(a, "plan") ? path.resolve(str(a, "plan")!) : [p.planStoryboard, p.plan].find((x) => fs.existsSync(x));
  const plan = planDatei ? leseSchnittplan(JSON.parse(fs.readFileSync(planDatei, "utf8"))) : undefined;
  const markeKey = alt?.marke ?? plan?.projekt.marke ?? einzigeMarke(env);
  const marke = ladeMarke(env, markeKey);
  const presets = ladePresets(path.join(env.studioRoot, "presets"));

  console.log(`Messe ${datei}${plan ? ` (Plan ${path.basename(planDatei!)})` : " (ohne Plan)"}`);
  const q = await messeQualitaet({ datei, ...(plan ? { plan } : {}) });
  const b = bewerteQualitaet(q, marke.schnittprofil, findePreset(presets, "export", "reel"), findePreset(presets, "audio", "standard"));
  fs.mkdirSync(p.ergebnis, { recursive: true });
  fs.writeFileSync(p.qualitaet, `${JSON.stringify({ ...q, abweichungen: b.abweichungen, hinweise: b.hinweise }, null, 2)}\n`);

  console.log("");
  for (const z of qualitaetZeilen(q)) console.log(z);
  if (b.abweichungen.length) {
    console.log("\nAbweichungen vom Export- und Audio-Preset:");
    for (const x of b.abweichungen) console.log(`  ${x.code}: ${x.text}`);
  }
  if (b.hinweise.length) {
    console.log("\nHinweise:");
    for (const x of b.hinweise) console.log(`  ${x.code}: ${x.text}`);
  }
  if (!b.abweichungen.length && !b.hinweise.length) console.log("\nKeine Abweichung und kein Hinweis. Ob es hochwertig aussieht, entscheidet ein Mensch beim Ansehen.");
  console.log(`\nGespeichert: ${p.qualitaet}`);
  return b.abweichungen.length ? 1 : 0;
}

/* ---------- reel status ---------- */

/** Das Gegenlesen ist angewendet und gehört zu genau diesem plan.json. */
export function gegenlesenGilt(p: ReelPfade): boolean {
  if (!fs.existsSync(p.gegenlesenStand) || !fs.existsSync(p.plan)) return false;
  try {
    const stand = JSON.parse(fs.readFileSync(p.gegenlesenStand, "utf8")) as { planHash?: string };
    return stand.planHash === planHash(fs.readFileSync(p.plan, "utf8"));
  } catch {
    return false;
  }
}

function zustand(home: StudioHome, p: ReelPfade): ReelZustand {
  let aufnahmen = 0;
  try {
    aufnahmen = listeAufnahmen(p.aufnahmen).length;
  } catch {
    aufnahmen = 0;
  }
  const resolve = fs.existsSync(p.ergebnis) && fs.readdirSync(p.ergebnis).some((n) => /^resolve(-v\d+)?$/.test(n));
  void home;
  return {
    skript: fs.existsSync(p.skript),
    aufnahmen,
    plan: fs.existsSync(p.plan),
    gegenlesen: gegenlesenGilt(p),
    auftrag: fs.existsSync(p.auftrag),
    storyboard: fs.existsSync(p.storyboard),
    planStoryboard: fs.existsSync(p.planStoryboard),
    vorschau: juengsteVorschau(p.ergebnis) !== undefined,
    resolve,
  };
}

const haken = (b: boolean): string => (b ? "ja  " : "nein");

async function status(a: Args): Promise<number> {
  const home = braucheHome();
  const id = a.pos[2];
  if (id) {
    pruefeInhaltId(id);
    const p = reelPfade(home, id);
    const z = zustand(home, p);
    const reel = leseReel(p);
    console.log(`Inhalt ${id}${reel?.marke ? `, Marke ${reel.marke}` : ""}${reel?.name ? `, «${reel.name}»` : ""}`);
    console.log(`  Skript            ${haken(z.skript)}  ${p.skript}`);
    console.log(`  Aufnahmen         ${z.aufnahmen ? `${z.aufnahmen} Videos` : "nein "}  ${p.aufnahmen}`);
    console.log(`  Plan              ${haken(z.plan)}  ${p.plan}`);
    console.log(`  Gegenlesen        ${haken(z.gegenlesen)}  ${p.gegenlesen}`);
    console.log(`  Auftrag           ${haken(z.auftrag)}  ${p.auftrag}`);
    console.log(`  Storyboard        ${haken(z.storyboard)}  ${p.storyboard}`);
    console.log(`  Plan mit Storyb.  ${haken(z.planStoryboard)}  ${p.planStoryboard}`);
    console.log(`  Vorschau          ${haken(z.vorschau)}`);
    console.log(`  Resolve-Ordner    ${haken(z.resolve)}  ${p.resolve}`);
    console.log(`\nNächster Schritt: ${naechsterSchritt(id, z)}`);
    return 0;
  }
  const wurzel = path.join(home.pfad, "inhalte");
  const ids = fs.existsSync(wurzel) ? fs.readdirSync(wurzel).filter((n) => ID_MUSTER.test(n) && fs.statSync(path.join(wurzel, n)).isDirectory() && fs.existsSync(path.join(wurzel, n, "reel.json"))).sort() : [];
  if (!ids.length) {
    console.log("Noch kein Reel angelegt. Anfangen mit: ./studio reel neu <ID> --marke <key> --zwischenablage");
    return 0;
  }
  for (const i of ids) console.log(`${i}: ${naechsterSchritt(i, zustand(home, reelPfade(home, i)))}`);
  return 0;
}

/* ---------- Einstieg ---------- */

export async function reelBefehl(sub: string, a: Args, env: Umgebung, geraete: ReelGeraete = {}): Promise<number> {
  const g = { ...standardGeraete(), ...geraete };
  switch (sub) {
    case "neu":
      return neu(a, env, g);
    case "vorbereiten":
      return vorbereiten(a, env, g);
    case "transkript":
      return transkript(a, env, g);
    case "gegenlesen":
      return gegenlesen(a, env, g);
    case "storyboard":
      return storyboard(a, env, g);
    case "uebergabe":
      return uebergabe(a, env);
    case "messe":
      return messe(a, env);
    case "status":
      return status(a);
    default:
      console.error(`Unbekannter Befehl «reel ${sub}»\n`);
      console.error(REEL_HILFE);
      return 2;
  }
}
