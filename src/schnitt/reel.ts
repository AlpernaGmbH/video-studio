import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { parseArgs, type Args } from "../args";
import { extrahiereJson, ladeMarke, type Umgebung } from "../motion/werkstatt";
import { sondiere } from "../presets/messen";
import { medienOrdner, studioHome, type StudioHome } from "../setup";
import { zuordnungBericht } from "./bericht";
import { schnittBefehl } from "./befehle";
import { SchnittQuelle, platziere } from "./plan";
import { leseSchnittplan } from "./plan";
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
                                      nach inhalte/<ID>/skript.md und öffnet den Aufnahmen-Ordner. Danach die Videos dort hineinkopieren.
  reel vorbereiten <ID> [--marke key] [--neu] [--ohne-pegel] [--gesprochen 3,5] [--modell large-v3] [--sprache de] [--aufnahmen ordner] [--nicht-kopieren]
                                      Sondiert die Videos, transkribiert mit Whisper (vorhandene Transkripte bleiben, --neu erzwingt), ordnet das Skript zu,
                                      baut den Schnittplan und den Auftrag fürs Storyboard (landet auf dem Mac in der Zwischenablage). Alles in inhalte/<ID>/ergebnis/.
  reel storyboard <ID> [--zwischenablage | --datei sb.json] [--entwurf] [--ohne-rendern] [--ohne-vorschau] [--nicht-oeffnen]
                                      Antwort von Claude (Storyboard als JSON) prüfen und in den Plan übernehmen, Grafiken rendern, Kontaktbogen und Vorschau-Video erzeugen.
  reel uebergabe <ID> [--entwurf] [--nicht-strikt]
                                      Ordner für DaVinci Resolve schreiben (Timeline, Untertitel, Grafiken) nach inhalte/<ID>/ergebnis/resolve.
  reel status [<ID>]                  Zeigt, was für einen Inhalt schon da ist und was der nächste Schritt wäre (ohne ID: alle Inhalte).
`;

/* ---------- reine Helfer ---------- */

const ID_MUSTER = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export function pruefeInhaltId(id: string | undefined): string {
  if (!id) throw new Error("Die Inhalt-ID fehlt, zum Beispiel: ./studio reel neu c-0007");
  if (!ID_MUSTER.test(id)) throw new Error(`«${id}» ist keine gültige Inhalt-ID (erlaubt: Buchstaben, Ziffern, - und _, zum Beispiel c-0007)`);
  return id;
}

export interface ReelPfade {
  inhalt: string;
  ergebnis: string;
  skript: string;
  aufnahmen: string;
  reel: string;
  transkripte: string;
  quellen: string;
  plan: string;
  bericht: string;
  auftrag: string;
  storyboard: string;
  planStoryboard: string;
  bogen: string;
  resolve: string;
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
    quellen: path.join(ergebnis, "quellen.json"),
    plan: path.join(ergebnis, "plan.json"),
    bericht: path.join(ergebnis, "bericht.json"),
    auftrag: path.join(ergebnis, "auftrag.md"),
    storyboard: path.join(ergebnis, "storyboard.json"),
    planStoryboard: path.join(ergebnis, "plan-storyboard.json"),
    bogen: path.join(ergebnis, "kontaktbogen.html"),
    resolve: path.join(ergebnis, "resolve"),
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

/* ---------- reel vorbereiten ---------- */

async function vorbereiten(a: Args, env: Umgebung, g: ReturnType<typeof standardGeraete>): Promise<number> {
  const home = braucheHome();
  const id = pruefeInhaltId(a.pos[2]);
  const p = reelPfade(home, id);
  const alt = leseReel(p);
  const markeKey = str(a, "marke") ?? alt?.marke ?? einzigeMarke(env);
  const marke = ladeMarke(env, markeKey);

  const skriptDatei = path.resolve(alt?.skript ?? p.skript);
  if (!fs.existsSync(skriptDatei)) throw new Error(`Das Skript fehlt: ${skriptDatei}\nSkript kopieren und «./studio reel neu ${id} --zwischenablage» ausführen`);
  const skriptText = fs.readFileSync(skriptDatei, "utf8");

  const aufnahmenDir = path.resolve(str(a, "aufnahmen") ?? alt?.aufnahmen ?? p.aufnahmen);
  let dateien: string[];
  try {
    dateien = listeAufnahmen(aufnahmenDir);
  } catch (e) {
    throw new Error(`${(e as Error).message}\nDie Videos gehören nach ${p.aufnahmen} (oder --aufnahmen <ordner>)`);
  }

  const gesprochen = str(a, "gesprochen") ? zahlenListe(str(a, "gesprochen")!) : (alt?.gesprochen ?? []);
  const modell = str(a, "modell") ?? alt?.modell ?? STANDARD_MODELL;
  const sprache = str(a, "sprache") ?? alt?.sprache ?? "de";
  const name = str(a, "name") ?? alt?.name ?? skriptTitel(skriptText, id);

  // Quellen sondieren
  console.log(`${dateien.length} ${dateien.length === 1 ? "Video" : "Videos"} in ${aufnahmenDir}`);
  const vergeben = new Set<string>();
  const quellen: SchnittQuelle[] = [];
  const pfade = new Map<string, string>();
  for (const datei of dateien) {
    const abs = path.join(aufnahmenDir, datei);
    const rel = relativierePfad(home, abs);
    if (!rel) throw new Error(`${abs} liegt ausserhalb von Studio- und Medien-Ordner. Die Datei nach ${p.aufnahmen} verschieben`);
    let s: Awaited<ReturnType<typeof sondiere>>;
    try {
      s = await sondiere(abs);
    } catch (e) {
      throw new Error(`${datei}: ${(e as Error).message}\nLiegt die Datei in OneDrive nur online? Im Finder Rechtsklick, «Immer auf diesem Gerät behalten»`);
    }
    const qid = quellenId(datei, vergeben);
    quellen.push(SchnittQuelle.parse({ id: qid, pfad: rel, ...s }));
    pfade.set(qid, abs);
  }
  const videos = quellen.filter((q) => q.art === "video");
  if (!videos.length) throw new Error(`Keine der Dateien in ${aufnahmenDir} hat ein Bild`);

  // Transkripte: vorhandene bleiben, solange das Video nicht neuer ist
  fs.mkdirSync(p.transkripte, { recursive: true });
  const transkripte: { quelle: string; segmente: ReturnType<typeof leseTranskript> }[] = [];
  let nr = 0;
  for (const q of videos) {
    nr++;
    const ziel = path.join(p.transkripte, `${q.id}.json`);
    const abs = pfade.get(q.id)!;
    const veraltet = !fs.existsSync(ziel) || fs.statSync(abs).mtimeMs > fs.statSync(ziel).mtimeMs;
    if (a.opt["neu"] === true || veraltet) {
      console.log(`\nTranskribiere ${nr} von ${videos.length}: ${path.basename(abs)} (Modell ${modell}, das dauert je nach Länge einige Minuten)`);
      const r = await g.transkribiere({ eingang: abs, ziel, modell, sprache });
      console.log(`  ${r.segmente} Segmente über ${f1(r.spanne)} s, ${r.mitWortzeiten} mit Wortzeiten`);
    } else console.log(`Transkript vorhanden: ${q.id} (mit --neu neu erstellen)`);
    transkripte.push({ quelle: q.id, segmente: leseTranskript(JSON.parse(fs.readFileSync(ziel, "utf8"))) });
  }

  // Zuordnung und Plan
  const ergebnis = await fuehreZuordnungAus({
    marke,
    skriptText,
    skriptQuelle: skriptDatei,
    quellen,
    transkripte,
    name,
    inhalt: id,
    gesprochen,
    home,
    ohnePegel: a.opt["ohne-pegel"] === true,
  });
  fs.mkdirSync(p.ergebnis, { recursive: true });
  fs.writeFileSync(p.quellen, `${JSON.stringify(quellen, null, 2)}\n`);
  fs.writeFileSync(p.plan, `${JSON.stringify(ergebnis.plan, null, 2)}\n`);
  fs.writeFileSync(p.bericht, `${JSON.stringify({ zuordnung: ergebnis.zuordnung, markierungen: ergebnis.markierungen }, null, 2)}\n`);
  schreibeReel(p, {
    schema: 1,
    id,
    marke: markeKey,
    name,
    ...(alt?.skript ? { skript: alt.skript } : {}),
    ...(str(a, "aufnahmen") ? { aufnahmen: aufnahmenDir } : alt?.aufnahmen ? { aufnahmen: alt.aufnahmen } : {}),
    ...(gesprochen.length ? { gesprochen } : {}),
    ...(str(a, "modell") ?? alt?.modell ? { modell } : {}),
    ...(str(a, "sprache") ?? alt?.sprache ? { sprache } : {}),
  });

  console.log("");
  for (const l of zuordnungBericht(ergebnis.zuordnung, ergebnis.markierungen)) console.log(l);
  if (ergebnis.pegelNotiz) console.log(`\n${ergebnis.pegelNotiz}`);
  const befunde = pruefeSchnittplan(ergebnis.plan, { profil: marke.schnittprofil });
  if (befunde.length) {
    console.log("\nPrüfung des Plans:");
    for (const b of befunde) console.log(`${b.stufe === "fehler" ? "FEHLER " : "Hinweis"} ${b.code}: ${b.text}`);
  }
  const dauer = platziere(ergebnis.plan);
  console.log(`\nPlan: ${p.plan} (${ergebnis.plan.clips.length} Clips, ${f1(dauer.gesamtFrames / ergebnis.plan.projekt.fps)} s)`);

  // Auftrag fürs Storyboard
  const vorher = console.log;
  const stumm: string[] = [];
  console.log = (...x: unknown[]) => void stumm.push(x.join(" "));
  try {
    await auftragBefehl(parseArgs(["schnitt", "auftrag", "--plan", p.plan, "--marke", markeKey, "-o", p.auftrag, ...(str(a, "regeln") ? ["--regeln", str(a, "regeln")!] : []), ...(str(a, "katalog") ? ["--katalog", str(a, "katalog")!] : [])]), env);
  } finally {
    console.log = vorher;
  }
  console.log(`Auftrag fürs Storyboard: ${p.auftrag}`);

  const kopiert = a.opt["nicht-kopieren"] !== true && g.schreibeZwischenablage !== undefined;
  if (kopiert) g.schreibeZwischenablage!(fs.readFileSync(p.auftrag, "utf8"));
  console.log(
    `\nNächster Schritt:\n  1. Gelbe Stellen und Abweichungen ansehen (Liste oben, ${p.bericht}).\n  2. ${kopiert ? "Der Auftrag ist in der Zwischenablage: in den Chat mit Claude einfügen" : `Inhalt von ${p.auftrag} in den Chat mit Claude kopieren`} und das Storyboard schreiben lassen.\n  3. Antwort kopieren (Kopieren-Knopf am Codeblock), dann:\n     ./studio reel storyboard ${id} --zwischenablage`,
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

/* ---------- reel status ---------- */

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
    case "storyboard":
      return storyboard(a, env, g);
    case "uebergabe":
      return uebergabe(a, env);
    case "status":
      return status(a);
    default:
      console.error(`Unbekannter Befehl «reel ${sub}»\n`);
      console.error(REEL_HILFE);
      return 2;
  }
}
