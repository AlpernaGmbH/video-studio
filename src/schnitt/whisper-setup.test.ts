import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pythonVersion, richteWhisperEin, type Fuehre } from "./whisper-setup";
import { whisperProgramm, whisperUmgebung } from "./whisper";

let home: string;
beforeEach(() => (home = fs.mkdtempSync(path.join(os.tmpdir(), "whisper-home-"))));
afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

const umgebung = () => whisperUmgebung(home);
/** Ein Ersatz für die Ausführung: merkt sich die Aufrufe, legt bei «venv» die Umgebung an. */
const ersatz = (steuer: { scheitere?: string; fehlt?: boolean } = {}) => {
  const aufrufe: string[][] = [];
  const fuehre: Fuehre = async (programm, args) => {
    aufrufe.push([programm, ...args]);
    if (args[0] === "-m" && args[1] === "venv") fs.mkdirSync(path.join(args[2]!, "bin"), { recursive: true }), fs.writeFileSync(path.join(args[2]!, "bin", "python"), "");
    if (steuer.scheitere && aufrufe[aufrufe.length - 1]!.join(" ").includes(steuer.scheitere)) return { code: 1 };
    return { code: 0 };
  };
  return { fuehre, aufrufe };
};
const opt = (extra: Record<string, unknown> = {}) => ({ home, pythonAusgabe: () => "Python 3.12.4", melde: () => undefined, ...extra });

describe("pythonVersion", () => {
  it("liest Haupt- und Nebenversion", () => {
    expect(pythonVersion("Python 3.13.16")).toEqual({ major: 3, minor: 13 });
    expect(pythonVersion("kein Python")).toBeUndefined();
  });
});

describe("whisperProgramm", () => {
  it("nimmt STUDIO_WHISPER_BIN vor der eingerichteten Umgebung und die vor «whisper» aus dem Pfad", () => {
    expect(whisperProgramm({}, home)).toBe("whisper");
    fs.mkdirSync(path.join(umgebung(), "bin"), { recursive: true });
    fs.writeFileSync(path.join(umgebung(), "bin", "whisper"), "");
    expect(whisperProgramm({}, home)).toBe(path.join(umgebung(), "bin", "whisper"));
    expect(whisperProgramm({ STUDIO_WHISPER_BIN: "/opt/w" }, home)).toBe("/opt/w");
  });
});

describe("richteWhisperEin", () => {
  it("legt die Umgebung an, installiert Whisper, prüft es und lädt das Modell, in dieser Reihenfolge", async () => {
    const { fuehre, aufrufe } = ersatz();
    const r = await richteWhisperEin(opt({ fuehre }));
    const u = umgebung();
    expect(aufrufe).toEqual([
      ["python3", "-m", "venv", u],
      [path.join(u, "bin", "pip"), "install", "--upgrade", "--quiet", "pip"],
      [path.join(u, "bin", "pip"), "install", "openai-whisper"],
      [path.join(u, "bin", "whisper"), "--help"],
      [path.join(u, "bin", "python"), "-c", 'import whisper; whisper.load_model("large-v3"); print("Modell geladen")'],
    ]);
    expect(r.programm).toBe(path.join(u, "bin", "whisper"));
  });

  it("legt eine vorhandene Umgebung nicht neu an", async () => {
    fs.mkdirSync(path.join(umgebung(), "bin"), { recursive: true });
    fs.writeFileSync(path.join(umgebung(), "bin", "python"), "");
    const { fuehre, aufrufe } = ersatz();
    await richteWhisperEin(opt({ fuehre }));
    expect(aufrufe.some((a) => a.includes("venv"))).toBe(false);
  });

  it("lädt mit --ohne-modell kein Modell und nimmt ein gewähltes Modell", async () => {
    const a = ersatz();
    await richteWhisperEin(opt({ fuehre: a.fuehre, modell: false }));
    expect(a.aufrufe.some((x) => x.join(" ").includes("load_model"))).toBe(false);
    const b = ersatz();
    await richteWhisperEin(opt({ fuehre: b.fuehre, modell: "small" }));
    expect(b.aufrufe[b.aufrufe.length - 1]!.join(" ")).toContain('load_model("small")');
  });

  it("bricht mit klarer Meldung ab: kein Python, zu altes Python", async () => {
    await expect(richteWhisperEin(opt({ fuehre: ersatz().fuehre, pythonAusgabe: () => undefined }))).rejects.toThrow(/Python 3 fehlt.*brew install python/);
    await expect(richteWhisperEin(opt({ fuehre: ersatz().fuehre, pythonAusgabe: () => "Python 3.8.2" }))).rejects.toThrow(/zu alt/);
  });

  it("nennt bei jedem Schritt, der scheitert, was zu tun ist", async () => {
    await expect(richteWhisperEin(opt({ fuehre: ersatz({ scheitere: "venv" }).fuehre }))).rejects.toThrow(/python3-venv/);
    await expect(richteWhisperEin(opt({ fuehre: ersatz({ scheitere: "install openai-whisper" }).fuehre }))).rejects.toThrow(/Netz oder ffmpeg/);
    await expect(richteWhisperEin(opt({ fuehre: ersatz({ scheitere: "--help" }).fuehre }))).rejects.toThrow(/startet nicht/);
    await expect(richteWhisperEin(opt({ fuehre: ersatz({ scheitere: "load_model" }).fuehre }))).rejects.toThrow(/--modell small/);
  });
});
