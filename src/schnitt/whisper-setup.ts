import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Args } from "../args";
import { STANDARD_MODELL, whisperUmgebung } from "./whisper";

/**
 * `./studio whisper einrichten`: Whisper in eine eigene Python-Umgebung installieren (`~/.local/share/video-studio/whisper`) und das Modell laden.
 * Ein Befehl statt «pip install» von Hand: Auf dem Mac verweigert das System-Python oft die Installation («externally-managed-environment»), eine eigene Umgebung umgeht das.
 * Whisper läuft lokal und kostet nichts ausser Zeit und etwa 3 GB Platz für das Modell «large-v3».
 */

export const WHISPER_HILFE = `Whisper (lokal, kostenlos)
  whisper einrichten [--modell large-v3] [--ohne-modell]
                                      Whisper in eine eigene Python-Umgebung installieren und das Modell laden (large-v3: rund 3 GB, einmalig; «small»: 0,5 GB, ungenauer).
                                      Braucht Python 3 und ffmpeg. Danach findet «./studio schnitt transkribiere» es selbst.
`;

export interface Lauf {
  code: number | null;
  fehlt?: boolean;
}
/** Führt ein Programm aus und zeigt dessen Ausgabe (Fortschritt von pip und vom Modell-Download). Ersetzbar für Tests. */
export type Fuehre = (programm: string, args: string[]) => Promise<Lauf>;

/** Die Hilfe von Whisper (mehrere Bildschirme) dient nur als Lebenszeichen und bleibt stumm; alles andere zeigt seinen Fortschritt. */
export const stdioFuer = (args: string[]): "ignore" | "inherit" => (args.length === 1 && args[0] === "--help" ? "ignore" : "inherit");

export const echteFuehre: Fuehre = (programm, args) =>
  new Promise((resolve) => {
    const c = spawn(programm, args, { stdio: stdioFuer(args) });
    c.on("error", (e: NodeJS.ErrnoException) => resolve({ code: null, fehlt: e.code === "ENOENT" }));
    c.on("close", (code) => resolve({ code }));
  });

/** Liest die Version aus der Ausgabe von `python3 --version`. */
export function pythonVersion(text: string): { major: number; minor: number } | undefined {
  const m = /Python\s+(\d+)\.(\d+)/.exec(text);
  return m ? { major: Number(m[1]), minor: Number(m[2]) } : undefined;
}

export interface EinrichtenOptionen {
  home?: string;
  modell?: string | false;
  python?: string;
  fuehre?: Fuehre;
  /** Gibt die Ausgabe von `python3 --version` zurück, oder undefined, wenn es Python nicht gibt. */
  pythonAusgabe?: (python: string) => string | undefined;
  melde?: (text: string) => void;
}

export async function richteWhisperEin(o: EinrichtenOptionen = {}): Promise<{ programm: string; umgebung: string }> {
  const home = o.home ?? os.homedir();
  const fuehre = o.fuehre ?? echteFuehre;
  const python = o.python ?? "python3";
  const melde = o.melde ?? ((t) => console.log(t));
  const umgebung = whisperUmgebung(home);
  const programm = path.join(umgebung, "bin", "whisper");
  const pip = path.join(umgebung, "bin", "pip");
  const py = path.join(umgebung, "bin", "python");

  const version = pythonVersion((o.pythonAusgabe ?? pythonAusgabeEcht)(python) ?? "");
  if (!version) throw new Error(`Python 3 fehlt auf diesem Rechner. Im Terminal: brew install python`);
  if (version.major < 3 || (version.major === 3 && version.minor < 9)) throw new Error(`Python ${version.major}.${version.minor} ist zu alt, nötig ist 3.9 oder neuer. Im Terminal: brew install python`);

  if (!fs.existsSync(py)) {
    melde(`1/4 Python-Umgebung anlegen: ${umgebung}`);
    fs.mkdirSync(path.dirname(umgebung), { recursive: true });
    const r = await fuehre(python, ["-m", "venv", umgebung]);
    if (r.code !== 0) throw new Error("Die Python-Umgebung liess sich nicht anlegen (python3 -m venv). Auf Debian und Ubuntu fehlt dafür das Paket python3-venv");
  } else melde(`1/4 Python-Umgebung ist schon da: ${umgebung}`);

  melde("2/4 Whisper installieren (einmalig, mehrere Minuten, die Ausgabe von pip läuft durch)");
  let r = await fuehre(pip, ["install", "--upgrade", "--quiet", "pip"]);
  if (r.code !== 0) throw new Error("pip liess sich nicht aktualisieren: Netzwerk erreichbar?");
  r = await fuehre(pip, ["install", "openai-whisper"]);
  if (r.code !== 0) throw new Error("«pip install openai-whisper» schlug fehl. Die Meldung steht oben; häufig fehlt das Netz oder ffmpeg");

  melde("3/4 Prüfen, ob Whisper startet");
  r = await fuehre(programm, ["--help"]);
  if (r.code !== 0) throw new Error(`${programm} startet nicht, obwohl die Installation durchlief`);
  melde("    Whisper startet");

  if (o.modell === false) melde("4/4 Modell wird nicht geladen (--ohne-modell): Es wird beim ersten «./studio schnitt transkribiere» geladen");
  else {
    const modell = o.modell ?? STANDARD_MODELL;
    melde(`4/4 Modell «${modell}» laden (einmalig; large-v3 ist rund 3 GB, der Fortschritt läuft durch)`);
    // certifi (kommt mit Whisper) liefert die Zertifikate für den Download: Manche Python-Installationen auf dem Mac kennen sie nicht («CERTIFICATE_VERIFY_FAILED»)
    const code = `import os\ntry:\n    import certifi\n    os.environ.setdefault("SSL_CERT_FILE", certifi.where())\nexcept Exception:\n    pass\nimport whisper\nwhisper.load_model(${JSON.stringify(modell)})\nprint("Modell geladen")`;
    r = await fuehre(py, ["-c", code]);
    if (r.code !== 0) throw new Error(`Das Modell «${modell}» liess sich nicht laden: Platz auf dem Datenträger und Netz prüfen. Ein kleineres Modell mit --modell small`);
  }
  melde(`\nFertig. Whisper liegt in ${umgebung}. Nächster Schritt: ./studio schnitt transkribiere <aufnahme>`);
  return { programm, umgebung };
}

function pythonAusgabeEcht(python: string): string | undefined {
  const r = spawnSync(python, ["--version"], { encoding: "utf8" });
  return r.error || r.status !== 0 ? undefined : `${r.stdout}${r.stderr}`;
}

export async function whisperBefehl(sub: string, a: Args): Promise<number> {
  switch (sub) {
    case "einrichten": {
      const modell = a.opt["ohne-modell"] === true ? false : typeof a.opt["modell"] === "string" ? (a.opt["modell"] as string) : undefined;
      await richteWhisperEin({ modell });
      return 0;
    }
    default:
      console.error(`Unbekannter Befehl «whisper ${sub}»\n`);
      console.error(WHISPER_HILFE);
      return 2;
  }
}
