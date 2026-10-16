import { spawn } from "node:child_process";
import type { Variablen } from "./stueck";

/** Die Version, gegen die das Stück-Format geprüft wurde. Ein Upgrade ist eine bewusste Änderung mit erneutem Selbsttest. */
export const HYPERFRAMES_VERSION = "0.8.164";

/** Projektformat (Bauplan: Projekt 25p, Export 1080×1920). */
export const PROJEKT = { breite: 1080, hoehe: 1920, fps: 25 } as const;

/**
 * Sicherheitsrand für Overlays, als Anteil der Bildfläche. Startwerte aus Bauplan 3.10
 * («freier Rand unten und rechts, etwa 20 Prozent», dort als Vermutung gekennzeichnet).
 * Oben und links sind eigene Annahmen. Alles an einer Stelle, damit Test T4 sie später ändern kann.
 */
export const SICHERHEITSRAND = { oben: 0.08, unten: 0.2, links: 0.05, rechts: 0.2 } as const;

export interface HfAufruf {
  cmd: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}

/**
 * Baut den Aufruf des HyperFrames-CLI. `STUDIO_HYPERFRAMES_BIN` überschreibt (zum Beispiel für eine lokale Installation),
 * sonst läuft die gepinnte Version über npx.
 */
export function hfAufruf(args: string[], basisEnv: NodeJS.ProcessEnv = process.env): HfAufruf {
  const bin = basisEnv["STUDIO_HYPERFRAMES_BIN"];
  const env: NodeJS.ProcessEnv = {
    ...basisEnv,
    HYPERFRAMES_NO_UPDATE_CHECK: "1",
  };
  if (bin) return { cmd: bin, args, env };
  return { cmd: "npx", args: ["--yes", `hyperframes@${HYPERFRAMES_VERSION}`, ...args], env };
}

/* ---------- Argumente je Befehl ---------- */

export interface RenderOptionen {
  dir: string;
  ausgabe: string;
  /** Pfad zu einer JSON-Datei mit den Variablen (kein Inline-JSON: kürzer, kein Quoting-Problem). */
  variablenDatei: string;
  format?: "webm" | "mp4";
  fps?: number;
}

export function renderArgs(o: RenderOptionen): string[] {
  return [
    "render",
    o.dir,
    "--format",
    o.format ?? "webm",
    "--fps",
    String(o.fps ?? PROJEKT.fps),
    "--variables-file",
    o.variablenDatei,
    "--strict-variables",
    "--output",
    o.ausgabe,
  ];
}

/**
 * Mehrere Fassungen desselben Stücks in einem Lauf: eine Zeile pro Version, `name` steckt im Dateinamen.
 * Ohne `--strict-variables`: Im Strict-Modus lehnt HyperFrames den Schlüssel `name` ab, der nur den Dateinamen liefert
 * (gegen 0.8.164 geprüft). Jede Zeile wird vorher mit `loeseVariablen` genauso streng geprüft (siehe batch.ts).
 */
export function batchArgs(o: { dir: string; zeilenDatei: string; ausgabeMuster: string; format?: "webm" | "mp4"; fps?: number }): string[] {
  return ["render", o.dir, "--format", o.format ?? "webm", "--fps", String(o.fps ?? PROJEKT.fps), "--batch", o.zeilenDatei, "--output", o.ausgabeMuster];
}

export function checkArgs(dir: string, o: { at?: number[] } = {}): string[] {
  const a = ["check", dir, "--json"];
  if (o.at && o.at.length > 0) a.push("--at", o.at.join(","));
  return a;
}

/**
 * Standbilder. `--describe false` ist Pflicht: Mit gesetztem GEMINI_API_KEY würde HyperFrames die Bilder
 * sonst an einen externen Vision-Dienst schicken. Bei Kundenmaterial ist das nicht erlaubt.
 */
export function snapshotArgs(dir: string, o: { at: number[]; ausgabeDir: string }): string[] {
  return ["snapshot", dir, "--at", o.at.join(","), "--output", o.ausgabeDir, "--describe", "false"];
}

export function compareArgs(o: { dirs: string[]; labels: string[]; at: number; ausgabe: string }): string[] {
  return ["compare", ...o.dirs, "--labels", o.labels.join(","), "--at", String(o.at), "--out", o.ausgabe, "--json"];
}

/* ---------- Ausführen ---------- */

export interface HfLauf {
  code: number | null;
  stdout: string;
  stderr: string;
  dauerMs: number;
}

export function fuehreHfAus(args: string[], opt: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv } = {}): Promise<HfLauf> {
  const { cmd, args: a, env } = hfAufruf(args, opt.env);
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, a, { cwd: opt.cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = opt.timeoutMs
      ? setTimeout(() => {
          child.kill("SIGKILL");
          reject(new Error(`HyperFrames-Aufruf nach ${opt.timeoutMs} ms abgebrochen: ${args[0]}`));
        }, opt.timeoutMs)
      : undefined;
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("error", (e) => {
      if (timer) clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code, stdout, stderr, dauerMs: Date.now() - t0 });
    });
  });
}

/** Rendert ein Stück als Variablen-Datei: schreibt keine Dateien, liefert nur den JSON-Text. */
export function variablenJson(v: Variablen): string {
  return JSON.stringify(v, null, 2) + "\n";
}
