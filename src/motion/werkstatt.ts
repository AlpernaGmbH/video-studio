import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { markeFuerExportFreigegeben, Markenprofil } from "../core/schemas";
import { ladeBibliothek, type GeladenesStueck } from "./bibliothek";
import { messeRender, parseHfCheck, pruefeRender, type Pruefung } from "./render-pruefung";
import { batchVorbereiten, type BatchZeile } from "./batch";
import { batchArgs, checkArgs, compareArgs, fuehreHfAus, HYPERFRAMES_VERSION, renderArgs, snapshotArgs, variablenJson } from "./render";
import { stageStueck } from "./staging";
import { loeseVariablen } from "./stueck";

/**
 * Werkstatt: die Abläufe, die ein Stück tatsächlich staged, prüft, fotografiert und rendert.
 * Alles hier braucht Chrome und ffmpeg und läuft deshalb nicht in den Unit-Tests, sondern im Selbsttest
 * (`npm run selftest:render`) und über die CLI.
 */

export interface Umgebung {
  studioRoot: string;
  bibliothek: string;
  schriftenDir: string;
  markenDir: string;
  arbeitsDir: string;
  datenDir: string;
}

/** `standardDaten`: Datenordner, wenn STUDIO_DATA_DIR nicht gesetzt ist (im Betrieb der Ordner «daten» im Studio-Ordner auf OneDrive). */
export function umgebung(studioRoot: string, standardDaten?: string): Umgebung {
  return {
    studioRoot,
    bibliothek: process.env["STUDIO_LIBRARY_DIR"] ?? path.join(studioRoot, "library", "motion"),
    schriftenDir: path.join(studioRoot, "assets", "fonts"),
    markenDir: path.join(studioRoot, "marken"),
    arbeitsDir: path.join(studioRoot, ".cache"),
    datenDir: process.env["STUDIO_DATA_DIR"] ?? standardDaten ?? path.join(studioRoot, "data"),
  };
}

export function ladeMarke(env: Umgebung, schluessel: string): Markenprofil {
  const datei = path.join(env.markenDir, `${schluessel}.json`);
  if (!fs.existsSync(datei)) throw new Error(`Markenprofil «${schluessel}» fehlt (${datei})`);
  return Markenprofil.parse(JSON.parse(fs.readFileSync(datei, "utf8")));
}

export function findeStueck(env: Umgebung, id: string): GeladenesStueck {
  const g = ladeBibliothek(env.bibliothek).stuecke.find((s) => s.stueck.id === id);
  if (!g) throw new Error(`Stück «${id}» nicht gefunden oder ungültig. Zuerst «./studio motion lint» ausführen`);
  return g;
}

/** HyperFrames druckt nach dem JSON noch Logzeilen. Wir lesen vom ersten «{» bis zur passenden Klammer. */
export function extrahiereJson(text: string): unknown {
  const start = text.indexOf("{");
  if (start < 0) throw new Error("Keine JSON-Ausgabe gefunden");
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
    else if (c === "{") tiefe++;
    else if (c === "}" && --tiefe === 0) return JSON.parse(text.slice(start, i + 1));
  }
  throw new Error("JSON-Ausgabe ist unvollständig");
}

export function stage(env: Umgebung, g: GeladenesStueck, marke?: Markenprofil) {
  const r = stageStueck({ stueckDir: g.dir, zielDir: path.join(env.arbeitsDir, "stage", g.stueck.id), schriftenDir: env.schriftenDir, marke });
  if (r.fehler.length) throw new Error(`Staging von «${g.stueck.id}» fehlgeschlagen:\n- ${r.fehler.join("\n- ")}`);
  return r;
}

/** hyperframes check auf dem gestageten Stück. */
export async function checkStueck(env: Umgebung, id: string, marke?: Markenprofil) {
  const g = findeStueck(env, id);
  const st = stage(env, g, marke);
  const lauf = await fuehreHfAus(checkArgs(st.dir), { timeoutMs: 180_000 });
  const info = parseHfCheck(extrahiereJson(lauf.stdout));
  return { ...info, dauerMs: lauf.dauerMs };
}

/** Standbilder des Stücks nach `vorschau/` (für die Bibliothek und für Claudes Bildprüfung). */
export async function vorschauBilder(env: Umgebung, id: string, at: number[], zielDir?: string, marke?: Markenprofil): Promise<string[]> {
  const g = findeStueck(env, id);
  const st = stage(env, g, marke);
  const tmp = path.join(env.arbeitsDir, "snap", id);
  fs.rmSync(tmp, { recursive: true, force: true });
  const lauf = await fuehreHfAus(snapshotArgs(st.dir, { at, ausgabeDir: tmp }), { timeoutMs: 180_000 });
  if (lauf.code !== 0) throw new Error(`snapshot fehlgeschlagen:\n${lauf.stderr.slice(-600)}`);
  const ziel = zielDir ?? path.join(g.dir, "vorschau");
  fs.mkdirSync(ziel, { recursive: true });
  const out: string[] = [];
  for (const t of at) {
    const quelle = fs.readdirSync(tmp).find((f) => f.endsWith(".png") && new RegExp(`at-${String(t).replace(".", "\\.")}s\\.png$`).test(f));
    if (!quelle) throw new Error(`Standbild für ${t} s fehlt in ${tmp}`);
    const name = `at-${String(t).replace(".", "_")}s.png`;
    fs.copyFileSync(path.join(tmp, quelle), path.join(ziel, name));
    out.push(path.join(ziel, name));
  }
  return out;
}

export interface RenderErgebnis {
  datei: string;
  dauer: number;
  variablen: Record<string, string | number | boolean>;
  pruefung: Pruefung;
  renderMs: number;
  warnungen: string[];
  /** Wahr, wenn das Ergebnis aus einem früheren Render stammt (gleiche Eingabe, `zwischenspeicher`). */
  zwischengespeichert?: boolean;
}

/** Alle Dateien eines Ordners (rekursiv, sortiert, relativ), ohne Vorschaubilder: Sie ändern den Render nicht. */
function stueckDateien(dir: string, rel = ""): string[] {
  const aus: string[] = [];
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.name.startsWith(".") || (rel === "" && e.name === "vorschau")) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) aus.push(...stueckDateien(dir, r));
    else aus.push(r);
  }
  return aus;
}

const stabil = (x: unknown): string => JSON.stringify(x, (_k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))) : v));

/**
 * Der Schlüssel eines Renders: alles, was das Ergebnis bestimmt, nämlich Stück (alle Dateien seines Ordners), Werte, Dauer, Marke, «final» und die Version von HyperFrames.
 * Derselbe Schlüssel heisst: derselbe Render. Gespeichert wird er neben der Ausgabe (`<datei>.render.json`).
 */
export function renderSchluessel(env: Umgebung, id: string, opt: { werte?: Record<string, unknown>; dauer?: number; marke?: Markenprofil; final?: boolean }): string {
  const g = findeStueck(env, id);
  const h = createHash("sha256");
  h.update(stabil({ id, werte: opt.werte ?? {}, dauer: opt.dauer ?? null, final: opt.final === true, marke: opt.marke ?? null, hyperframes: HYPERFRAMES_VERSION }));
  for (const datei of stueckDateien(g.dir)) {
    h.update(`\0${datei}\0`);
    h.update(fs.readFileSync(path.join(g.dir, datei)));
  }
  return h.digest("hex");
}

export const renderMarker = (ausgabe: string): string => `${ausgabe}.render.json`;

/** Das gespeicherte Ergebnis, wenn die Ausgabe noch da ist und der Schlüssel stimmt. */
export function gespeicherterRender(ausgabe: string, schluessel: string): RenderErgebnis | undefined {
  const marker = renderMarker(ausgabe);
  if (!fs.existsSync(ausgabe) || !fs.existsSync(marker)) return undefined;
  try {
    const m = JSON.parse(fs.readFileSync(marker, "utf8")) as { schluessel?: string; ergebnis?: RenderErgebnis };
    return m.schluessel === schluessel && m.ergebnis ? { ...m.ergebnis, datei: ausgabe, renderMs: 0, zwischengespeichert: true } : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Rendert einen Einsatz eines Stücks (Variablen, Dauer, Marke → WebM mit Alpha) und prüft ihn objektiv.
 * `final: true` verlangt ein freigegebenes Markenprofil (Gate 0).
 */
export async function rendereStueck(
  env: Umgebung,
  id: string,
  opt: { werte?: Record<string, unknown>; dauer?: number; marke?: Markenprofil; ausgabe: string; final?: boolean; zwischenspeicher?: boolean },
): Promise<RenderErgebnis> {
  const g = findeStueck(env, id);
  const warnungen: string[] = [];
  // Mit Zwischenspeicher: Ist die Eingabe dieselbe wie beim letzten bestandenen Render, wird nicht neu gerendert (Änderungswunsch am Storyboard: nur die geänderten Grafiken)
  const schluessel = opt.zwischenspeicher ? renderSchluessel(env, id, opt) : undefined;
  if (schluessel) {
    const alt = gespeicherterRender(opt.ausgabe, schluessel);
    if (alt) return alt;
  }

  if (opt.final) {
    if (!opt.marke) throw new Error("Ein finaler Render braucht ein Markenprofil");
    const gate = markeFuerExportFreigegeben(opt.marke);
    if (!gate.ok) throw new Error(`Finaler Render nicht möglich: ${gate.grund}`);
  }

  const aufl = loeseVariablen(g.stueck, opt.werte ?? {}, { dauer: opt.dauer, marke: opt.marke, ohneMarke: !opt.marke });
  if (!aufl.ok) throw new Error(`Variablen ungültig:\n- ${aufl.fehler.join("\n- ")}`);

  const st = stage(env, g, opt.marke);
  warnungen.push(...st.warnungen);
  const varDatei = path.join(st.dir, "variablen.json");
  fs.writeFileSync(varDatei, variablenJson(aufl.variablen));
  fs.mkdirSync(path.dirname(opt.ausgabe), { recursive: true });

  const lauf = await fuehreHfAus(renderArgs({ dir: st.dir, ausgabe: path.resolve(opt.ausgabe), variablenDatei: varDatei }), { timeoutMs: 280_000 });
  if (lauf.code !== 0) throw new Error(`Render fehlgeschlagen (Exit ${lauf.code}):\n${(lauf.stderr + lauf.stdout).slice(-800)}`);

  const gemessen = await messeRender(opt.ausgabe, aufl.dauer);
  const pruefung = pruefeRender({ stueck: g.stueck, dauer: aufl.dauer, probe: gemessen.probe, frames: gemessen.frames });
  const ergebnis: RenderErgebnis = { datei: opt.ausgabe, dauer: aufl.dauer, variablen: aufl.variablen, pruefung, renderMs: lauf.dauerMs, warnungen };
  // Nur ein bestandener Render wird gemerkt; ein nicht bestandener oder ein alter Marker soll nie als «unverändert» durchgehen
  if (schluessel && pruefung.bestanden) fs.writeFileSync(renderMarker(opt.ausgabe), `${JSON.stringify({ schluessel, ergebnis })}\n`);
  else if (schluessel) fs.rmSync(renderMarker(opt.ausgabe), { force: true });
  return ergebnis;
}

/**
 * Drei Looks als Standbilder plus ein Vergleichsblatt. Jeder Look ist ein eigener Entwurfsordner mit index.html
 * (`<ideeDir>/looks/a`, `b`, `c`). Es entstehen `a.png`, `b.png`, `c.png` und `vergleich.png`.
 */
export async function erzeugeLookBogen(env: Umgebung, ideeDir: string, at: number, marke?: Markenprofil): Promise<{ bilder: { id: "a" | "b" | "c"; pfad: string }[]; vergleich: string }> {
  const ids = ["a", "b", "c"] as const;
  const bilder: { id: "a" | "b" | "c"; pfad: string }[] = [];
  const gestaged: string[] = [];
  for (const id of ids) {
    const quelle = path.join(ideeDir, "looks", id);
    if (!fs.existsSync(path.join(quelle, "index.html"))) throw new Error(`Look «${id}» fehlt: ${path.join(quelle, "index.html")}`);
    const st = stageStueck({ stueckDir: quelle, zielDir: path.join(env.arbeitsDir, "stage", `look-${path.basename(ideeDir)}-${id}`), schriftenDir: env.schriftenDir, marke });
    if (st.fehler.length) throw new Error(`Staging von Look «${id}» fehlgeschlagen:\n- ${st.fehler.join("\n- ")}`);
    gestaged.push(st.dir);

    const tmp = path.join(env.arbeitsDir, "snap", `look-${path.basename(ideeDir)}-${id}`);
    fs.rmSync(tmp, { recursive: true, force: true });
    const lauf = await fuehreHfAus(snapshotArgs(st.dir, { at: [at], ausgabeDir: tmp }), { timeoutMs: 180_000 });
    if (lauf.code !== 0) throw new Error(`snapshot für Look «${id}» fehlgeschlagen:\n${lauf.stderr.slice(-500)}`);
    const png = fs.readdirSync(tmp).find((f) => /^frame-.*\.png$/.test(f));
    if (!png) throw new Error(`Kein Standbild für Look «${id}»`);
    const ziel = path.join(ideeDir, "looks", `${id}.png`);
    fs.copyFileSync(path.join(tmp, png), ziel);
    bilder.push({ id, pfad: path.relative(ideeDir, ziel).split(path.sep).join("/") });
  }
  const vergleich = path.join(ideeDir, "looks", "vergleich.png");
  const c = await fuehreHfAus(compareArgs({ dirs: gestaged, labels: ["A", "B", "C"], at, ausgabe: vergleich }), { timeoutMs: 180_000 });
  if (c.code !== 0) throw new Error(`compare fehlgeschlagen:\n${c.stderr.slice(-500)}`);
  return { bilder, vergleich };
}

export interface BatchErgebnis {
  zeilen: { name: string; datei: string; dauer: number; pruefung: Pruefung }[];
  renderMs: number;
}

/**
 * Rendert mehrere Fassungen desselben Stücks in einem Lauf («gleiches Stück, andere Wörter oder Zahlen») und prüft jede objektiv.
 * Alle Zeilen werden vorher streng geprüft: Ein Fehler stoppt den Lauf, bevor etwas gerendert wird.
 */
export async function rendereBatch(env: Umgebung, id: string, zeilen: BatchZeile[], opt: { marke?: Markenprofil; ohneMarke?: boolean; ausgabeDir: string; final?: boolean }): Promise<BatchErgebnis> {
  const g = findeStueck(env, id);
  if (opt.final) {
    if (!opt.marke) throw new Error("Ein finaler Render braucht ein Markenprofil");
    const gate = markeFuerExportFreigegeben(opt.marke);
    if (!gate.ok) throw new Error(`Finaler Render nicht möglich: ${gate.grund}`);
  }
  const v = batchVorbereiten(g.stueck, zeilen, { marke: opt.marke, ohneMarke: opt.ohneMarke });
  if (!v.ok) throw new Error(`Batch ungültig, nichts gerendert:\n- ${v.fehler.join("\n- ")}`);

  const st = stage(env, g, opt.marke);
  const zeilenDatei = path.join(st.dir, "zeilen.json");
  fs.writeFileSync(zeilenDatei, JSON.stringify(v.zeilen, null, 2) + "\n");
  fs.rmSync(opt.ausgabeDir, { recursive: true, force: true });
  fs.mkdirSync(opt.ausgabeDir, { recursive: true });

  const lauf = await fuehreHfAus(batchArgs({ dir: st.dir, zeilenDatei, ausgabeMuster: path.join(path.resolve(opt.ausgabeDir), "{name}.webm") }), { timeoutMs: 1_800_000 });
  if (lauf.code !== 0) throw new Error(`Batch-Render fehlgeschlagen (Exit ${lauf.code}):\n${(lauf.stderr + lauf.stdout).slice(-800)}`);

  const out: BatchErgebnis["zeilen"] = [];
  for (const z of v.zeilen) {
    const datei = path.join(opt.ausgabeDir, `${z.name}.webm`);
    const dauer = v.dauern[z.name]!;
    if (!fs.existsSync(datei)) {
      out.push({ name: z.name, datei, dauer, pruefung: { bestanden: false, befunde: [{ stufe: "fehler", stueck: id, code: "datei_fehlt", text: `${datei} wurde nicht erzeugt` }] } });
      continue;
    }
    const gemessen = await messeRender(datei, dauer);
    out.push({ name: z.name, datei, dauer, pruefung: pruefeRender({ stueck: g.stueck, dauer, probe: gemessen.probe, frames: gemessen.frames }) });
  }
  return { zeilen: out, renderMs: lauf.dauerMs };
}
