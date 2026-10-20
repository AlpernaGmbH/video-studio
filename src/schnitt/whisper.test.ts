import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { STANDARD_MODELL, starteWhisper, transkribiere, whisperArgs, whisperProgramm, type WhisperLauf } from "./whisper";

let dir: string;
beforeEach(() => (dir = fs.mkdtempSync(path.join(os.tmpdir(), "whisper-test-"))));
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const aufnahme = () => {
  const p = path.join(dir, "Sprache 01.mov");
  fs.writeFileSync(p, "x");
  return p;
};
const seg = (von: number, bis: number, text: string, mitWorten = true) => ({
  start: von,
  end: bis,
  text,
  ...(mitWorten ? { words: text.split(" ").map((w, i, a) => ({ word: ` ${w}`, start: von + ((bis - von) * i) / a.length, end: von + ((bis - von) * (i + 1)) / a.length })) } : {}),
});
/** Ein Ersatz für Whisper: schreibt das JSON dorthin, wo Whisper es hinschreibt (`--output_dir`, Name der Aufnahme). */
const ersatz = (segments: unknown[], opt: { name?: string; code?: number | null; fehlt?: boolean } = {}) => {
  const aufrufe: string[][] = [];
  const start = async (programm: string, args: string[]): Promise<WhisperLauf> => {
    aufrufe.push([programm, ...args]);
    if (opt.fehlt) return { code: null, stderr: "spawn whisper ENOENT", fehlt: true };
    if (opt.code) return { code: opt.code, stderr: "Zeile 1\nZeile 2\nCUDA out of memory", fehlt: false };
    const out = args[args.indexOf("--output_dir") + 1]!;
    fs.writeFileSync(path.join(out, opt.name ?? "Sprache 01.json"), JSON.stringify({ text: "", segments, language: "de" }));
    return { code: 0, stderr: "", fehlt: false };
  };
  return { start, aufrufe };
};

describe("whisperArgs", () => {
  it("ruft openai-whisper mit Wortzeiten, JSON und Ausgabeordner auf", () => {
    expect(whisperArgs({ datei: "/a/b.mov", modell: "large-v3", sprache: "de", ausgabeDir: "/tmp/x" })).toEqual(["/a/b.mov", "--model", "large-v3", "--language", "de", "--word_timestamps", "True", "--output_format", "json", "--output_dir", "/tmp/x"]);
  });
  it("nimmt das Programm aus STUDIO_WHISPER_BIN, sonst «whisper»", () => {
    expect(whisperProgramm({})).toBe("whisper");
    expect(whisperProgramm({ STUDIO_WHISPER_BIN: "/opt/mein-whisper" })).toBe("/opt/mein-whisper");
    expect(whisperProgramm({ STUDIO_WHISPER_BIN: "" })).toBe("whisper");
  });
});

describe("transkribiere", () => {
  it("legt das JSON am Ziel ab und fasst es zusammen", async () => {
    const { start, aufrufe } = ersatz([seg(0, 2, "Hallo zusammen"), seg(2, 8, "Wir bauen heute eine Küche um", true), seg(9, 10, "Tschüss", false)]);
    const ziel = path.join(dir, "daten", "transkripte", "sprache-01.json");
    const r = await transkribiere({ eingang: aufnahme(), ziel, start, programm: "whisper" });
    expect(r).toEqual({ datei: ziel, segmente: 3, spanne: 10, mitWortzeiten: 2, ueberLimit: 1 });
    expect(JSON.parse(fs.readFileSync(ziel, "utf8")).segments).toHaveLength(3);
    // Modell, Sprache und Aufnahme kommen an
    expect(aufrufe[0]!.slice(0, 6)).toEqual(["whisper", path.join(dir, "Sprache 01.mov"), "--model", STANDARD_MODELL, "--language", "de"]);
  });

  it("gibt Modell und Sprache weiter", async () => {
    const { start, aufrufe } = ersatz([seg(0, 2, "Grüezi mitenand")]);
    await transkribiere({ eingang: aufnahme(), ziel: path.join(dir, "t.json"), start, modell: "/modelle/schweizer.pt", sprache: "en" });
    const a = aufrufe[0]!;
    expect(a[a.indexOf("--model") + 1]).toBe("/modelle/schweizer.pt");
    expect(a[a.indexOf("--language") + 1]).toBe("en");
  });

  it("sagt, wie man Whisper installiert, wenn das Programm fehlt", async () => {
    const { start } = ersatz([], { fehlt: true });
    await expect(transkribiere({ eingang: aufnahme(), ziel: path.join(dir, "t.json"), start })).rejects.toThrow(/pip install openai-whisper.*STUDIO_WHISPER_BIN/);
  });

  it("meldet den Fehler von Whisper mit den letzten Zeilen", async () => {
    const { start } = ersatz([], { code: 1 });
    await expect(transkribiere({ eingang: aufnahme(), ziel: path.join(dir, "t.json"), start })).rejects.toThrow(/Exit 1.*Zeile 2 \| CUDA out of memory/);
  });

  it("meldet, wenn Whisper die erwartete Datei nicht geschrieben hat, und was stattdessen da war", async () => {
    const { start } = ersatz([seg(0, 1, "x")], { name: "anders.json" });
    await expect(transkribiere({ eingang: aufnahme(), ziel: path.join(dir, "t.json"), start })).rejects.toThrow(/erwartet: Sprache 01\.json; gefunden: anders\.json/);
  });

  it("lehnt ein leeres Transkript ab und lässt das Ziel unberührt", async () => {
    const { start } = ersatz([]);
    const ziel = path.join(dir, "t.json");
    await expect(transkribiere({ eingang: aufnahme(), ziel, start })).rejects.toThrow(/leer/);
    expect(fs.existsSync(ziel)).toBe(false);
  });

  it("lehnt ein unbekanntes Format ab", async () => {
    const start = async (_p: string, args: string[]): Promise<WhisperLauf> => {
      fs.writeFileSync(path.join(args[args.indexOf("--output_dir") + 1]!, "Sprache 01.json"), JSON.stringify({ irgendwas: 1 }));
      return { code: 0, stderr: "", fehlt: false };
    };
    await expect(transkribiere({ eingang: aufnahme(), ziel: path.join(dir, "t.json"), start })).rejects.toThrow(/kein bekanntes Format/);
  });

  it("wirft bei fehlender Aufnahme, bevor etwas startet", async () => {
    const { start, aufrufe } = ersatz([seg(0, 1, "x")]);
    await expect(transkribiere({ eingang: path.join(dir, "nicht-da.mov"), ziel: path.join(dir, "t.json"), start })).rejects.toThrow(/Datei fehlt/);
    expect(aufrufe).toEqual([]);
  });

  it("räumt den Arbeitsordner auf, auch nach einem Fehler", async () => {
    const vorher = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith("studio-whisper-")).length;
    await transkribiere({ eingang: aufnahme(), ziel: path.join(dir, "t.json"), start: ersatz([seg(0, 1, "x")]).start });
    await expect(transkribiere({ eingang: aufnahme(), ziel: path.join(dir, "t2.json"), start: ersatz([], { code: 2 }).start })).rejects.toThrow();
    expect(fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith("studio-whisper-")).length).toBe(vorher);
  });
});

describe("starteWhisper mit einem echten Programm", () => {
  it("erkennt ein fehlendes Programm", async () => {
    expect((await starteWhisper("/gibt/es/nicht-whisper", [])).fehlt).toBe(true);
  });
  it("gibt den Exit-Code eines vorhandenen Programms weiter", async () => {
    expect(await starteWhisper("false", [])).toMatchObject({ code: 1, fehlt: false });
    expect(await starteWhisper("true", [])).toMatchObject({ code: 0, fehlt: false });
  });
});
