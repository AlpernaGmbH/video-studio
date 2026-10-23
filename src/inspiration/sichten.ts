import fs from "node:fs";
import path from "node:path";
import { lautheitAusEbur128, lauf } from "../presets/messen";
import { findeSchrift } from "../katalog/bogen";
import { EinbettungsFehler, einbettungsAdresse, leseEinbettung, type Einbettung, type Folie, type Link } from "./embed";

/**
 * Inspiration sichten: Ein Link wird in einen Ordner geladen und so aufbereitet, dass ein Mensch oder Claude ihn wirklich ansehen kann:
 * die Medien jeder Folie, ein Transkript des Tons, Kontaktbögen mit Zeitmarken und Messwerte (Schnitte, Lautheit, Stille).
 * Alles landet in einem Ordner **ausserhalb des Repos**: Es sind fremde Inhalte, die nur intern angesehen werden (`pruefeAusgabe`).
 * Gehört nichts davon in Notion oder ins Repo ausser der eigenen Auswertung in eigenen Worten.
 */

export type SichtStatus = "ok" | "nur_text" | "gesperrt" | "fehler" | "nicht_unterstuetzt";

export interface FolienErgebnis {
  nr: number;
  art: "video" | "bild";
  datei: string;
  dauer?: number;
  /** Bögen dieser Folie (Dateinamen im Ordner des Links). */
  boegen: string[];
  /** Schnitte pro Minute (nur Video). */
  schnitteProMinute?: number;
  schnitte?: number;
  lufs?: number;
  truePeak?: number;
  /** Anzahl und Gesamtdauer der Pausen (Ton unter -40 dB, mindestens 0,5 s). */
  stillen?: { anzahl: number; sekunden: number };
  ohneTon?: boolean;
  transkript?: { datei: string; segmente: number } | { keineSprache: true } | { fehler: string };
}

export interface Sichtung {
  link: Link;
  status: SichtStatus;
  grund?: string;
  abgerufenAm: string;
  konto?: string;
  typ?: Einbettung["typ"];
  beschreibung?: string;
  likes?: number;
  ansichten?: number;
  folien: FolienErgebnis[];
  /** Überblick über alle Folien eines Karussells. */
  folienBoegen: string[];
}

export interface SichtOptionen {
  /** Zielordner. Je Link entsteht ein Unterordner mit dem Kurzcode. */
  aus: string;
  /** Dichte Abtastung (alle 0,5 s) für Kamera, Bewegung und Übergänge: für alle Links (`true`) oder nur für die genannten Kurzcodes. */
  dicht?: boolean | string[];
  /** Whisper-Modell und Sprache («auto» erkennt sie). */
  modell?: string;
  sprache?: string;
  /** Vorhandene Sichtungen neu machen. */
  neu?: boolean;
}

export interface SichtDeps {
  holeText(url: string): Promise<{ status: number; text: string }>;
  holeDatei(url: string, ziel: string): Promise<{ status: number; bytes: number }>;
  ffmpeg(args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }>;
  ffprobe(args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }>;
  transkribiere(o: { eingang: string; ziel: string; modell: string; sprache: string }): Promise<{ segmente: number }>;
  schrift(): string | undefined;
  pause(ms: number): Promise<void>;
  jetzt(): string;
}

/** Ein Mensch am Browser bekommt dieselbe Seite; ein bekannter Browser-Kopf verhindert, dass Instagram die Abfrage als Programm abweist. */
const BROWSER = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
export const PAUSE_MS = 6000;
/** Wartezeiten nach «zu viele Anfragen» (HTTP 429), dann gibt der Link auf. Instagram begrenzt die Einbettung pro Adresse; ein kurzer Stoss geht vorbei. */
export const WARTEN_BEI_429_MS = [20_000, 60_000, 120_000];

export const echteDeps = (): Omit<SichtDeps, "transkribiere"> => ({
  async holeText(url) {
    const r = await fetch(url, { headers: { "user-agent": BROWSER, accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(30_000) });
    return { status: r.status, text: await r.text() };
  },
  async holeDatei(url, ziel) {
    const r = await fetch(url, { headers: { "user-agent": BROWSER }, redirect: "follow", signal: AbortSignal.timeout(120_000) });
    if (!r.ok || !r.body) return { status: r.status, bytes: 0 };
    const daten = Buffer.from(await r.arrayBuffer());
    fs.writeFileSync(ziel, daten);
    return { status: r.status, bytes: daten.length };
  },
  ffmpeg: (args) => lauf("ffmpeg", ["-hide_banner", "-nostdin", ...args]),
  ffprobe: (args) => lauf("ffprobe", args),
  schrift: () => findeSchrift(),
  pause: (ms) => new Promise((r) => setTimeout(r, ms)),
  jetzt: () => new Date().toISOString(),
});

/** Fremde Inhalte gehören nicht ins Repo: Ein Zielordner innerhalb des Repos wird abgelehnt. */
export function pruefeAusgabe(aus: string, repo: string): string {
  const ziel = path.resolve(aus);
  const wurzel = path.resolve(repo);
  if (ziel === wurzel || ziel.startsWith(wurzel + path.sep)) {
    throw new Error(`Der Zielordner liegt im Repo (${path.relative(wurzel, ziel) || "."}). Fremde Videos und Bilder gehören nicht ins Repo: Wähle einen Ordner ausserhalb, zum Beispiel im Medien-Ordner unter «inspiration/».`);
  }
  return ziel;
}

const zweistellig = (n: number): string => String(n).padStart(2, "0");

/* ---------- Messwerte ---------- */

/** Zeitpunkte der Szenenwechsel aus der Ausgabe von `showinfo`. */
export function schnittZeiten(stderr: string): number[] {
  return [...stderr.matchAll(/pts_time:(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1])).filter((t) => t > 0);
}

/** Pausen aus der Ausgabe von `silencedetect`. */
export function stillenAus(stderr: string): { anzahl: number; sekunden: number } {
  const dauern = [...stderr.matchAll(/silence_duration:\s*(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
  return { anzahl: dauern.length, sekunden: Math.round(dauern.reduce((a, b) => a + b, 0) * 10) / 10 };
}

/** Bildfilter für die Bögen: erstes Bild, jeder Szenenwechsel, mindestens alle `abstand` Sekunden; Zeitmarke ins Bild. */
export function bogenFilter(o: { dicht: boolean; schrift?: string; breite?: number }): string {
  const abstand = o.dicht ? 0.5 : 2.5;
  const breite = o.breite ?? 400;
  const auswahl = o.dicht ? `eq(n,0)+gte(t-prev_selected_t,${abstand})` : `eq(n,0)+gt(scene,0.25)+gte(t-prev_selected_t,${abstand})`;
  const marke = o.schrift ? `,drawtext=fontfile='${o.schrift.replace(/\\/g, "/").replace(/:/g, "\\:")}':text='%{pts\\:hms}':x=8:y=8:fontsize=26:fontcolor=white:box=1:boxcolor=black@0.65:boxborderw=5` : "";
  const spalten = o.dicht ? 4 : 3;
  const zeilen = o.dicht ? 3 : 2;
  return `select='${auswahl}',scale=${breite}:-2${marke},tile=${spalten}x${zeilen}:padding=4:margin=4:color=0x111111`;
}

/* ---------- Ablauf ---------- */

async function dauerVon(datei: string, d: SichtDeps): Promise<{ dauer?: number; ton: boolean }> {
  const r = await d.ffprobe(["-v", "error", "-print_format", "json", "-show_streams", "-show_format", datei]);
  if (r.code !== 0) return { ton: false };
  const j = JSON.parse(r.stdout) as { streams?: { codec_type?: string }[]; format?: { duration?: string } };
  const dauer = Number(j.format?.duration);
  return { ...(Number.isFinite(dauer) && dauer > 0 ? { dauer } : {}), ton: !!j.streams?.some((s) => s.codec_type === "audio") };
}

const istDicht = (o: SichtOptionen, code: string | undefined): boolean => o.dicht === true || (Array.isArray(o.dicht) && !!code && o.dicht.includes(code));

async function sichteVideo(folie: Folie, ordner: string, code: string | undefined, o: SichtOptionen, d: SichtDeps): Promise<FolienErgebnis> {
  const nr = zweistellig(folie.nr);
  const datei = `folie-${nr}.mp4`;
  const pfad = path.join(ordner, datei);
  const ergebnis: FolienErgebnis = { nr: folie.nr, art: "video", datei, boegen: [] };
  const geladen = await d.holeDatei(folie.videoUrl!, pfad);
  if (!geladen.bytes) throw new Error(`Video von Folie ${folie.nr} nicht ladbar (HTTP ${geladen.status})`);
  const { dauer, ton } = await dauerVon(pfad, d);
  if (dauer) ergebnis.dauer = Math.round(dauer * 100) / 100;

  // Bögen mit Zeitmarken
  const muster = path.join(ordner, `folie-${nr}-bogen-%02d.jpg`);
  const dicht = istDicht(o, code);
  const maxBoegen = dicht ? 6 : 4;
  const b = await d.ffmpeg(["-y", "-i", pfad, "-an", "-vf", bogenFilter({ dicht, schrift: d.schrift() }), "-fps_mode", "vfr", "-frames:v", String(maxBoegen), "-q:v", "3", muster]);
  if (b.code !== 0) throw new Error(`Bögen von Folie ${folie.nr} nicht erzeugt: ${b.stderr.trim().split("\n").pop()}`);
  ergebnis.boegen = fs.readdirSync(ordner).filter((f) => f.startsWith(`folie-${nr}-bogen-`)).sort();

  // Erstes Bild der Folie (für den Überblick über ein Karussell)
  await d.ffmpeg(["-y", "-i", pfad, "-frames:v", "1", "-q:v", "2", path.join(ordner, `folie-${nr}.jpg`)]);

  // Schnitte
  const s = await d.ffmpeg(["-i", pfad, "-an", "-vf", "select='gt(scene,0.3)',showinfo", "-f", "null", "-"]);
  const zeiten = schnittZeiten(s.stderr);
  ergebnis.schnitte = zeiten.length;
  if (dauer) ergebnis.schnitteProMinute = Math.round((zeiten.length / dauer) * 60 * 10) / 10;

  if (!ton) {
    ergebnis.ohneTon = true;
    return ergebnis;
  }
  const l = await d.ffmpeg(["-i", pfad, "-vn", "-af", "ebur128=peak=true,silencedetect=noise=-40dB:d=0.5", "-f", "null", "-"]);
  const lautheit = lautheitAusEbur128(l.stderr);
  if (lautheit) {
    ergebnis.lufs = lautheit.lufs;
    ergebnis.truePeak = lautheit.truePeak;
  }
  ergebnis.stillen = stillenAus(l.stderr);

  // Transkript: kein Ergebnis ist bei Musik oder Stille kein Fehler
  const ziel = path.join(ordner, `folie-${nr}-transkript.json`);
  try {
    const t = await d.transkribiere({ eingang: pfad, ziel, modell: o.modell ?? "small", sprache: o.sprache ?? "auto" });
    ergebnis.transkript = { datei: path.basename(ziel), segmente: t.segmente };
  } catch (e) {
    const text = e instanceof Error ? e.message : String(e);
    ergebnis.transkript = /Transkript ist leer|keine Sprache/.test(text) ? { keineSprache: true } : { fehler: text.slice(0, 300) };
  }
  return ergebnis;
}

async function sichteBild(folie: Folie, ordner: string, d: SichtDeps): Promise<FolienErgebnis> {
  const datei = `folie-${zweistellig(folie.nr)}.jpg`;
  const r = await d.holeDatei(folie.bildUrl!, path.join(ordner, datei));
  if (!r.bytes) throw new Error(`Bild von Folie ${folie.nr} nicht ladbar (HTTP ${r.status})`);
  return { nr: folie.nr, art: "bild", datei, boegen: [] };
}

/** Überblick über alle Folien: vier Folien pro Bild, in lesbarer Grösse. */
async function folienBoegen(ordner: string, anzahl: number, d: SichtDeps): Promise<string[]> {
  const muster = path.join(ordner, "folien-bogen-%02d.jpg");
  const r = await d.ffmpeg(["-y", "-framerate", "1", "-i", path.join(ordner, "folie-%02d.jpg"), "-vf", "scale=540:-2,tile=2x2:padding=6:margin=6:color=0x111111", "-fps_mode", "vfr", "-q:v", "3", muster]);
  if (r.code !== 0 || anzahl < 2) return [];
  return fs.readdirSync(ordner).filter((f) => /^folien-bogen-\d+\.jpg$/.test(f)).sort();
}

export async function sichteLink(link: Link, o: SichtOptionen, d: SichtDeps): Promise<Sichtung> {
  const basis = { link, abgerufenAm: d.jetzt(), folien: [] as FolienErgebnis[], folienBoegen: [] as string[] };
  const adresse = einbettungsAdresse(link);
  if (!adresse || !link.code) return { ...basis, status: "nicht_unterstuetzt", grund: link.art === "profil" ? "Profile lassen sich ohne Anmeldung nicht durchblättern" : link.art === "youtube" ? "YouTube wird gesondert geladen" : "Dieser Link ist weder Reel noch Beitrag" };

  const ordner = path.join(o.aus, link.code);
  const metaDatei = path.join(ordner, "meta.json");
  if (!o.neu && fs.existsSync(metaDatei)) return JSON.parse(fs.readFileSync(metaDatei, "utf8")) as Sichtung;

  let seite: { status: number; text: string };
  try {
    seite = await d.holeText(adresse);
    for (const warten of WARTEN_BEI_429_MS) {
      if (seite.status !== 429) break;
      await d.pause(warten);
      seite = await d.holeText(adresse);
    }
  } catch (e) {
    return { ...basis, status: "fehler", grund: `Einbettung nicht erreichbar: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (seite.status !== 200) return { ...basis, status: seite.status === 404 ? "gesperrt" : "fehler", grund: seite.status === 429 ? "Instagram begrenzt die Abfragen (HTTP 429), auch nach Warten; später noch einmal versuchen" : `Einbettung antwortet mit HTTP ${seite.status}` };

  let e: Einbettung;
  try {
    e = leseEinbettung(seite.text);
  } catch (f) {
    if (f instanceof EinbettungsFehler) return { ...basis, status: f.grund === "gesperrt" ? "gesperrt" : "nur_text", grund: f.message };
    throw f;
  }
  const kopf = { ...basis, ...(e.konto ? { konto: e.konto } : {}), typ: e.typ, beschreibung: e.beschreibung, ...(e.likes !== undefined ? { likes: e.likes } : {}), ...(e.ansichten !== undefined ? { ansichten: e.ansichten } : {}) };

  fs.mkdirSync(ordner, { recursive: true });
  for (const alt of fs.readdirSync(ordner)) fs.rmSync(path.join(ordner, alt), { recursive: true, force: true });
  const folien: FolienErgebnis[] = [];
  const probleme: string[] = [];
  for (const f of e.folien) {
    try {
      folien.push(f.art === "video" ? await sichteVideo(f, ordner, link.code, o, d) : await sichteBild(f, ordner, d));
    } catch (x) {
      probleme.push(x instanceof Error ? x.message : String(x));
    }
  }
  const boegen = e.typ === "karussell" && folien.length > 1 ? await folienBoegen(ordner, folien.length, d) : [];
  const sichtung: Sichtung = { ...kopf, status: folien.length ? "ok" : "fehler", ...(probleme.length ? { grund: probleme.join(" | ").slice(0, 600) } : {}), folien, folienBoegen: boegen };
  fs.writeFileSync(metaDatei, JSON.stringify(sichtung, null, 2));
  return sichtung;
}

/** Alle Links nacheinander, mit Pause zwischen den Abrufen. `bericht` wird nach jedem Link aufgerufen. */
export async function sichteAlle(links: Link[], o: SichtOptionen, d: SichtDeps, bericht?: (s: Sichtung, i: number, n: number) => void): Promise<Sichtung[]> {
  const aus: Sichtung[] = [];
  for (const [i, l] of links.entries()) {
    const s = await sichteLink(l, o, d);
    aus.push(s);
    bericht?.(s, i + 1, links.length);
    if (i < links.length - 1 && s.status !== "nicht_unterstuetzt") await d.pause(PAUSE_MS);
  }
  return aus;
}
