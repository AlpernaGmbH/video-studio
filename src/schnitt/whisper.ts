import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { leseTranskript, MAX_SEGMENT } from "./transkript";

/**
 * Whisper aufrufen (Bauplan v2, Kap. 3.2). Ausgeführt wird die Kommandozeile von openai-whisper (`pip install openai-whisper`) oder eine, die dieselben Schalter kennt;
 * ein anderes Programm lässt sich mit der Umgebungsvariable STUDIO_WHISPER_BIN eintragen. `./studio whisper einrichten` installiert es in eine eigene Umgebung (whisper-setup.ts). Whisper läuft lokal, die Aufnahmen verlassen den Rechner nicht (Regel 5).
 * Welches Modell Schweizerdeutsch am besten trifft, entscheidet Test T2: «large-v3» ist eine Annahme, `--modell` ändert sie.
 */

export const STANDARD_MODELL = "large-v3";

/** Wo `./studio whisper einrichten` Whisper installiert: eine eigene Python-Umgebung im Benutzerordner, damit nichts am System verändert wird. */
export const whisperUmgebung = (home: string = os.homedir()): string => path.join(home, ".local", "share", "video-studio", "whisper");

/** Das Programm: STUDIO_WHISPER_BIN, sonst die eingerichtete Umgebung, sonst «whisper» aus dem Pfad. */
export function whisperProgramm(env: NodeJS.ProcessEnv = process.env, home: string = os.homedir()): string {
  if (env["STUDIO_WHISPER_BIN"]) return env["STUDIO_WHISPER_BIN"];
  const eigenes = path.join(whisperUmgebung(home), "bin", "whisper");
  return fs.existsSync(eigenes) ? eigenes : "whisper";
}

/** Schalter von openai-whisper: Hochdeutsche Ausgabe, Wortzeiten, JSON. */
export function whisperArgs(o: { datei: string; modell: string; sprache: string; ausgabeDir: string }): string[] {
  return [o.datei, "--model", o.modell, "--language", o.sprache, "--word_timestamps", "True", "--output_format", "json", "--output_dir", o.ausgabeDir];
}

export interface WhisperLauf {
  code: number | null;
  stderr: string;
  fehlt: boolean;
}

/** Startet das Programm. «fehlt» heisst: Das Programm gibt es nicht auf diesem Rechner. Die Ausgabe von Whisper (Fortschritt) läuft durch, damit man sie sieht. */
export function starteWhisper(programm: string, args: string[]): Promise<WhisperLauf> {
  return new Promise((resolve) => {
    const c = spawn(programm, args, { stdio: ["ignore", "inherit", "pipe"] });
    let stderr = "";
    c.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
      process.stderr.write(d);
    });
    c.on("error", (e: NodeJS.ErrnoException) => resolve({ code: null, stderr: e.message, fehlt: e.code === "ENOENT" }));
    c.on("close", (code) => resolve({ code, stderr, fehlt: false }));
  });
}

export interface TranskriptErgebnis {
  datei: string;
  segmente: number;
  /** Sekunden vom ersten bis zum letzten Segment. */
  spanne: number;
  mitWortzeiten: number;
  ueberLimit: number;
}

export interface TranskribiereOptionen {
  /** Aufnahme (Video oder Audio). */
  eingang: string;
  /** Zieldatei für das JSON. */
  ziel: string;
  modell?: string;
  sprache?: string;
  programm?: string;
  /** Ersetzbar für Tests. */
  start?: (programm: string, args: string[]) => Promise<WhisperLauf>;
}

export async function transkribiere(o: TranskribiereOptionen): Promise<TranskriptErgebnis> {
  if (!fs.existsSync(o.eingang)) throw new Error(`Datei fehlt: ${o.eingang}`);
  const programm = o.programm ?? whisperProgramm();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "studio-whisper-"));
  try {
    const r = await (o.start ?? starteWhisper)(programm, whisperArgs({ datei: path.resolve(o.eingang), modell: o.modell ?? STANDARD_MODELL, sprache: o.sprache ?? "de", ausgabeDir: tmp }));
    if (r.fehlt) throw new Error(`«${programm}» ist auf diesem Rechner nicht installiert. Einrichten mit «./studio whisper einrichten» (installiert es in eine eigene Python-Umgebung, braucht ffmpeg und Python 3), oder mit STUDIO_WHISPER_BIN ein anderes Programm eintragen, das dieselben Schalter kennt`);
    if (r.code !== 0) throw new Error(`Whisper schlug fehl (Exit ${r.code}): ${r.stderr.trim().split("\n").slice(-3).join(" | ")}`);
    const json = path.join(tmp, `${path.basename(o.eingang, path.extname(o.eingang))}.json`);
    if (!fs.existsSync(json)) throw new Error(`Whisper lief, aber hat keine JSON-Datei geschrieben (erwartet: ${path.basename(json)}; gefunden: ${fs.readdirSync(tmp).join(", ") || "nichts"})`);
    const text = fs.readFileSync(json, "utf8");
    const segmente = leseTranskript(JSON.parse(text));
    if (!segmente.length) throw new Error("Das Transkript ist leer: Whisper hat keine Sprache gefunden");
    fs.mkdirSync(path.dirname(o.ziel), { recursive: true });
    fs.copyFileSync(json, o.ziel);
    return {
      datei: o.ziel,
      segmente: segmente.length,
      spanne: segmente[segmente.length - 1]!.bis - segmente[0]!.von,
      mitWortzeiten: segmente.filter((s) => s.woerter?.length).length,
      ueberLimit: segmente.filter((s) => s.bis - s.von > MAX_SEGMENT).length,
    };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
