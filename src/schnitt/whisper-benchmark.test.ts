import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseArgs } from "../args";
import { benchmarkZeilen, messeWhisper, normierteWoerter, wortFehlerrate } from "./whisper-benchmark";
import { whisperBefehl } from "./whisper-setup";

const hatFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

describe("wortFehlerrate", () => {
  it("gleiche Wörter: keine Fehler", () => {
    expect(wortFehlerrate(["a", "b", "c"], ["a", "b", "c"])).toEqual({ fehler: 0, rate: 0 });
  });
  it("zählt Ersetzen, Löschen und Einfügen je einmal, geteilt durch die Länge der Referenz", () => {
    expect(wortFehlerrate(["a", "b", "c", "d"], ["a", "x", "c", "d"])).toEqual({ fehler: 1, rate: 0.25 });
    expect(wortFehlerrate(["a", "b", "c", "d"], ["a", "c", "d"])).toEqual({ fehler: 1, rate: 0.25 });
    expect(wortFehlerrate(["a", "b"], ["a", "b", "c", "d"])).toEqual({ fehler: 2, rate: 1 });
  });
  it("Reihenfolge zählt: vertauschte Wörter sind zwei Fehler", () => {
    expect(wortFehlerrate(["a", "b"], ["b", "a"]).fehler).toBe(2);
  });
  it("leere Referenz: jede Hypothese ist ein Fehler, zwei leere sind fehlerfrei", () => {
    expect(wortFehlerrate([], ["a"])).toEqual({ fehler: 1, rate: 1 });
    expect(wortFehlerrate([], [])).toEqual({ fehler: 0, rate: 0 });
    expect(wortFehlerrate(["a", "b"], [])).toEqual({ fehler: 2, rate: 1 });
  });
});

describe("normierteWoerter", () => {
  it("klein, ohne Satzzeichen, ß als ss, leere Wörter fallen weg", () => {
    expect(normierteWoerter("Wir haben, die Küche: umgebaut.  Die Straße! – ")).toEqual(["wir", "haben", "die", "küche", "umgebaut", "die", "strasse"]);
  });
});

describe("messeWhisper", () => {
  let dir: string;
  beforeEach(() => void (dir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-bench-test-"))));
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
  const aufnahme = (): string => {
    const p = path.join(dir, "aufnahme.wav");
    fs.writeFileSync(p, "x");
    return p;
  };
  const text: Record<string, string> = {
    "large-v3": "Wir haben diese Woche eine Küche komplett umgebaut.",
    turbo: "Wir haben diese Woche eine Kirche komplett umgebaut.",
    klein: "Wir haben Woche Küche umgebaut.",
  };
  /** Ersatz für Whisper: schreibt je Modell einen Text und «braucht» eine feste Zeit. */
  const ersatz = (zeiten: Record<string, number>) => {
    let t = 0;
    return {
      jetzt: () => t,
      transkribiere: async (o: { modell?: string; ziel: string }) => {
        t += (zeiten[o.modell!] ?? 1) * 1000;
        if (o.modell === "kaputt") throw new Error("Modell nicht gefunden");
        fs.writeFileSync(o.ziel, JSON.stringify({ segmente: [{ von: 0, bis: 3, text: text[o.modell!] ?? "" }] }));
      },
      schneide: async () => void 0,
    };
  };

  it("misst Zeit, Faktor, Wörter und die Abweichung vom ersten Modell", async () => {
    const e = ersatz({ "large-v3": 30, turbo: 10 });
    const r = await messeWhisper({ datei: aufnahme(), modelle: ["large-v3", "turbo"], sekunden: 60, ...e });
    expect(r.referenz).toBe("erstes-modell");
    expect(r.laeufe[0]).toMatchObject({ modell: "large-v3", sekunden: 30, faktor: 0.5, woerter: 8, abweichung: 0 });
    expect(r.laeufe[1]).toMatchObject({ modell: "turbo", sekunden: 10, woerter: 8, abweichung: 12.5 });
  });

  it("mit Referenztext misst jedes Modell gegen den Text, auch das erste", async () => {
    const e = ersatz({});
    const r = await messeWhisper({ datei: aufnahme(), modelle: ["large-v3", "klein"], referenzText: "Wir haben diese Woche eine Küche komplett umgebaut", ...e });
    expect(r.referenz).toBe("text");
    expect(r.laeufe[0]!.abweichung).toBe(0);
    expect(r.laeufe[1]!.abweichung).toBe(37.5);
  });

  it("mit Referenztext zählt der Text, nicht das erste Modell: Stimmt das zweite Modell mit dem Text überein, hat das erste die Abweichung", async () => {
    const r = await messeWhisper({ datei: aufnahme(), modelle: ["large-v3", "turbo"], referenzText: "Wir haben diese Woche eine Kirche komplett umgebaut.", ...ersatz({}) });
    expect(r.laeufe[0]!.abweichung).toBe(12.5);
    expect(r.laeufe[1]!.abweichung).toBe(0);
  });

  it("die Abweichung ist auf Zehntel Prozent gerundet", async () => {
    const r = await messeWhisper({ datei: aufnahme(), modelle: ["a", "b"], schneide: async () => void 0, jetzt: () => 0, transkribiere: async (o) => void fs.writeFileSync(o.ziel, JSON.stringify({ segmente: [{ von: 0, bis: 1, text: o.modell === "a" ? "eins zwei drei" : "eins zwei vier" }] })) });
    expect(r.laeufe[1]!.abweichung).toBe(33.3);
  });

  it("ein Modell, das scheitert, steht mit Fehler in der Liste, die anderen laufen weiter", async () => {
    const e = ersatz({});
    const r = await messeWhisper({ datei: aufnahme(), modelle: ["kaputt", "large-v3"], ...e });
    expect(r.laeufe[0]).toMatchObject({ modell: "kaputt", fehler: "Modell nicht gefunden" });
    expect(r.laeufe[1]!.woerter).toBe(8);
    // das erste Modell ist die Referenz: scheitert es, gibt es keine Abweichungen
    expect(r.laeufe[1]!.abweichung).toBeUndefined();
  });

  it("verlangt Modelle, eine vorhandene Datei und eine sinnvolle Länge", async () => {
    await expect(messeWhisper({ datei: aufnahme(), modelle: [] })).rejects.toThrow(/mindestens ein Modell/);
    await expect(messeWhisper({ datei: path.join(dir, "fehlt.wav"), modelle: ["a"] })).rejects.toThrow(/Datei fehlt/);
    await expect(messeWhisper({ datei: aufnahme(), modelle: ["a"], sekunden: 0 })).rejects.toThrow(/positiv/);
  });

  it("gibt Ab und Länge an das Schneiden weiter und räumt das Stück auf", async () => {
    const schnitte: unknown[][] = [];
    const arbeits = path.join(dir, "arbeit");
    fs.mkdirSync(arbeits);
    const e = ersatz({});
    await messeWhisper({ datei: aufnahme(), modelle: ["large-v3"], ab: 12, sekunden: 30, arbeitsDir: arbeits, ...e, schneide: async (...a) => void schnitte.push(a) });
    expect(schnitte[0]!.slice(1, 3)).toEqual([12, 30]);
    expect(fs.readdirSync(arbeits)).toEqual([]);
  });
});

describe("benchmarkZeilen", () => {
  it("eine Tabelle mit Komma, dem Faktor und dem Hinweis zur Referenz", () => {
    const z = benchmarkZeilen({ datei: "/x/a.mov", ab: 0, sekunden: 60, referenz: "erstes-modell", rechner: "darwin arm64", laeufe: [{ modell: "large-v3", sekunden: 120, faktor: 2, woerter: 150, abweichung: 0 }, { modell: "turbo", sekunden: 30.5, faktor: 0.5083, woerter: 148, abweichung: 4.7 }, { modell: "kaputt", sekunden: 1, faktor: 0, woerter: 0, fehler: "weg" }] }).join("\n");
    expect(z).toContain("Rechner: darwin arm64");
    expect(z).toContain("das erste Modell, large-v3");
    expect(z).toMatch(/large-v3\s+120,0 s\s+×2,0\s+150\s+0,0 %/);
    expect(z).toMatch(/turbo\s+30,5 s\s+×0,5\s+148\s+4,7 %/);
    expect(z).toMatch(/kaputt\s+FEHLER: weg/);
  });
});

describe.skipIf(!hatFfmpeg)("whisper benchmark (Befehl)", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-bench-cmd-"));
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("schneidet ein Stück aus einer echten Datei, lässt jedes Modell laufen und schreibt das Ergebnis", async () => {
    const quelle = path.join(dir, "clip.mp4");
    expect(spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=300:duration=20", quelle]).status).toBe(0);
    // Ersatz-Whisper: schreibt je nach --model einen anderen Text, und merkt sich die Länge der Eingabe
    const bin = path.join(dir, "whisper-ersatz");
    const log = path.join(dir, "log.txt");
    fs.writeFileSync(bin, `#!/usr/bin/env node\nconst fs=require("node:fs"),path=require("node:path");const a=process.argv.slice(2);const m=a[a.indexOf("--model")+1];\nfs.appendFileSync(${JSON.stringify(log)}, m+" "+a[0]+"\\n");\nconst text=m==="eins"?"Das ist ein Test mit sieben Wörtern":"Das ist ein Test mit sieben Wortern";\nfs.writeFileSync(path.join(a[a.indexOf("--output_dir")+1], path.basename(a[0],path.extname(a[0]))+".json"), JSON.stringify({segments:[{start:0,end:3,text}]}));\n`);
    fs.chmodSync(bin, 0o755);
    vi.stubEnv("STUDIO_WHISPER_BIN", bin);
    const aus = path.join(dir, "ergebnis.json");
    const code = await whisperBefehl("benchmark", parseArgs(["whisper", "benchmark", quelle, "--modelle", "eins,zwei", "--ab", "2", "--sekunden", "5", "--ausgabe", aus]));
    expect(code).toBe(0);
    const r = JSON.parse(fs.readFileSync(aus, "utf8"));
    expect(r.laeufe.map((l: { modell: string }) => l.modell)).toEqual(["eins", "zwei"]);
    expect(r.laeufe[0].abweichung).toBe(0);
    expect(r.laeufe[1].abweichung).toBeCloseTo(14.3, 1);
    expect(r.ab).toBe(2);
    expect(r.sekunden).toBe(5);
    const aufrufe = fs.readFileSync(log, "utf8").trim().split("\n");
    expect(aufrufe).toHaveLength(2);
    // Whisper bekam das geschnittene Stück (WAV), nicht das ganze Video
    expect(aufrufe[0]).toMatch(/^eins .*probe\.wav$/);
  }, 120_000);

  it("Fehler: ohne Datei, mit unlesbaren Zahlen und mit fehlender Referenz", async () => {
    await expect(whisperBefehl("benchmark", parseArgs(["whisper", "benchmark"]))).rejects.toThrow(/Aufruf/);
    await expect(whisperBefehl("benchmark", parseArgs(["whisper", "benchmark", "x.mp4", "--sekunden", "viel"]))).rejects.toThrow(/Zahlen/);
    await expect(whisperBefehl("benchmark", parseArgs(["whisper", "benchmark", "x.mp4", "--referenz", path.join(dir, "gibt-es-nicht.txt")]))).rejects.toThrow(/Referenz fehlt/);
  });
});
