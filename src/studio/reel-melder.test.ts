import { spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseArgs } from "../args";
import { umgebung, type Umgebung } from "../motion/werkstatt";
import { reelBefehl, type ReelGeraete } from "../schnitt/reel";
import { testSatz } from "../schnitt/testdaten";
import { erzeugeMelder, keinMelder, type Ereignis, type Melder } from "./melder";
import { beendeMelder } from "./standard";

const root = path.resolve(import.meta.dirname, "..", "..");
const TOKEN = `vsd_3f8a1c2e-5b7d-4e90-8a11-0c2d4e6f8a10_${"a".repeat(43)}`;
const SKRIPT = "# Küche Gossau\nWir haben diese Woche eine Küche komplett umgebaut.\nDer Kunde wollte mehr Stauraum.\n";

/**
 * Das Versprechen des Melders: Ob das Tool antwortet, hängt, ablehnt oder fehlt, ändert nichts am Befehl: gleicher Exit-Code, gleiche Ausgabe, gleiche Dateien, derselbe Fehler.
 * Der Befehl «reel neu» arbeitet ohne ffmpeg und Whisper und taugt darum als Probe; «reel vorbereiten» ohne Skript zeigt den Fehlerweg.
 */
let tmp: string;
let srv: http.Server;
let anfragen: { events: Ereignis[] }[];
let antwort: (n: number) => { status: number; body?: unknown } | "haengt";
let ausgabe: string[];

beforeEach(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "studio-reel-melder-"));
  ausgabe = [];
  hinweise = [];
  anfragen = [];
  antwort = () => ({ status: 200 });
  srv = http.createServer((req, res) => {
    const teile: Buffer[] = [];
    req.on("data", (c: Buffer) => teile.push(c));
    req.on("end", () => {
      const b = JSON.parse(Buffer.concat(teile).toString("utf8")) as { events: Ereignis[] };
      anfragen.push(b);
      const r = antwort(anfragen.length);
      if (r === "haengt") return;
      res.writeHead(r.status, { "content-type": "application/json" });
      res.end(JSON.stringify(r.body ?? { accepted: b.events.length, duplicates: 0, rejected: [] }));
    });
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  vi.spyOn(console, "log").mockImplementation((...x: unknown[]) => void ausgabe.push(x.join(" ")));
  vi.spyOn(console, "error").mockImplementation((...x: unknown[]) => void ausgabe.push(x.join(" ")));
  vi.stubEnv("STUDIO_HOME", path.join(tmp, "Studio"));
  vi.stubEnv("STUDIO_MEDIEN", path.join(tmp, "Medien"));
  vi.stubEnv("STUDIO_CONFIG", path.join(tmp, "keine-config.json"));
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  srv.closeAllConnections();
  await new Promise<void>((r) => srv.close(() => r()));
  fs.rmSync(tmp, { recursive: true, force: true });
});

const url = (): string => `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
const melderZu = (o: { url?: string; zeitlimit?: number } = {}): Melder => erzeugeMelder({ konfig: { url: o.url ?? url(), token: TOKEN }, ausgang: path.join(tmp, "cfg", "ausgang"), zeitlimit: o.zeitlimit ?? 3000, verzoegerung: 0 });

interface Ergebnis {
  rc: number | "wirft";
  fehler?: string;
  ausgabe: string;
  dateien: Record<string, string>;
}

/** Der eine Satz, den der Melder nach einem 401 selbst ausgibt (nicht Teil der Ausgabe des Befehls). */
let hinweise: string[];

/** Führt einen Reel-Befehl in einem frischen Studio-Ordner aus und gibt alles zurück, woran man Unterschiede sehen würde. */
async function fuehreAus(argv: string[], melder: Melder | undefined, vorbereitung?: () => void): Promise<Ergebnis> {
  fs.rmSync(path.join(tmp, "Studio"), { recursive: true, force: true });
  fs.rmSync(path.join(tmp, "Medien"), { recursive: true, force: true });
  fs.mkdirSync(path.join(tmp, "Studio"), { recursive: true });
  vorbereitung?.();
  ausgabe.length = 0;
  hinweise = [];
  const env: Umgebung = { ...umgebung(root), datenDir: path.join(tmp, "daten") };
  const geraete: ReelGeraete = { liesZwischenablage: () => SKRIPT, schreibeZwischenablage: () => undefined, oeffne: () => undefined, ...(melder ? { melder } : {}) };
  let rc: Ergebnis["rc"];
  let fehler: string | undefined;
  try {
    rc = await reelBefehl(argv[1]!, parseArgs(argv), env, geraete);
  } catch (e) {
    rc = "wirft";
    fehler = (e as Error).message;
  }
  if (melder) await beendeMelder(melder, 500, (t) => hinweise.push(t));
  const dateien: Record<string, string> = {};
  const gehe = (dir: string): void => {
    for (const n of fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []) {
      const p = path.join(dir, n);
      if (fs.statSync(p).isDirectory()) gehe(p);
      else dateien[path.relative(tmp, p)] = fs.readFileSync(p, "utf8");
    }
  };
  gehe(path.join(tmp, "Studio"));
  gehe(path.join(tmp, "Medien"));
  return { rc, ...(fehler ? { fehler } : {}), ausgabe: ausgabe.join("\n").replaceAll(tmp, "<tmp>"), dateien };
}

const NEU = ["reel", "neu", "c-0007", "--marke", "alperna", "--zwischenablage", "--nicht-oeffnen"];
const VORBEREITEN_OHNE_SKRIPT = ["reel", "vorbereiten", "c-0007", "--marke", "alperna"];

describe("Tool-Ausfall ändert am Befehl nichts", () => {
  it("nur nach einem 401 gibt es einen einzigen Hinweis, sonst keinen", async () => {
    antwort = () => ({ status: 401 });
    await fuehreAus(NEU, melderZu());
    expect(hinweise).toHaveLength(1);
    expect(hinweise[0]).toMatch(/Token wurde abgelehnt/);
    expect(hinweise[0]).not.toContain(TOKEN);
    antwort = () => ({ status: 503 });
    await fuehreAus(NEU, melderZu());
    expect(hinweise).toEqual([]);
  });

  const bedingungen: [string, () => Melder][] = [
    ["Tool antwortet 503", () => ((antwort = () => ({ status: 503 })), melderZu())],
    ["Tool antwortet 401", () => ((antwort = () => ({ status: 401 })), melderZu())],
    ["Tool antwortet 422", () => ((antwort = () => ({ status: 422 })), melderZu())],
    ["Tool hängt", () => ((antwort = () => "haengt"), melderZu({ zeitlimit: 80 }))],
    ["Tool nicht erreichbar", () => melderZu({ url: "http://127.0.0.1:1" })],
    ["Tool gesund", () => melderZu()],
    ["Korb nicht beschreibbar", () => erzeugeMelder({ konfig: { url: "http://127.0.0.1:1", token: TOKEN }, ausgang: "/dev/null/gibt-es-nicht", verzoegerung: 0 })],
    [
      "Melder, der selbst wirft",
      () => ({
        melde: () => {
          throw new Error("kaputt");
        },
        leeren: async () => {
          throw new Error("kaputt");
        },
        schritte: () => {
          throw new Error("kaputt");
        },
        hinweis: () => undefined,
        stand: () => keinMelder.stand(),
      }),
    ],
  ];

  describe.each([
    ["reel neu (Erfolg)", NEU, undefined],
    ["reel vorbereiten ohne Skript (Fehler)", VORBEREITEN_OHNE_SKRIPT, () => fs.mkdirSync(path.join(tmp, "Studio", "inhalte", "c-0007"), { recursive: true })],
  ] as const)("%s", (_name, argv, vorbereitung) => {
    it.each(bedingungen)("%s: gleicher Exit-Code, gleiche Ausgabe, gleiche Dateien, derselbe Fehler", async (_b, bauen) => {
      const ohne = await fuehreAus([...argv], undefined, vorbereitung);
      const mit = await fuehreAus([...argv], bauen(), vorbereitung);
      expect(mit).toEqual(ohne);
    });
  });
});

describe("Was das Tool zu sehen bekommt", () => {
  it("reel neu: Beginn und Ende mit gleicher span, Dauer und Code des Inhalts", async () => {
    const r = await fuehreAus(NEU, melderZu());
    expect(r.rc).toBe(0);
    const e = anfragen.flatMap((a) => a.events);
    expect(e.map((x) => `${x.step}:${x.state}`)).toEqual(["reel neu:start", "reel neu:ok"]);
    expect(e[0]!.span).toBe(e[1]!.span);
    expect(e.every((x) => x.code === "c-0007")).toBe(true);
    expect(typeof e[1]!.ms).toBe("number");
  });

  it("ein Fehler: das Ereignis trägt die Meldung ohne Pfad, und der Fehler geht unverändert weiter", async () => {
    const r = await fuehreAus(VORBEREITEN_OHNE_SKRIPT, melderZu(), () => fs.mkdirSync(path.join(tmp, "Studio", "inhalte", "c-0007"), { recursive: true }));
    expect(r.rc).toBe("wirft");
    expect(r.fehler).toMatch(/Das Skript fehlt/);
    expect(r.fehler).toContain(tmp);
    const e = anfragen.flatMap((a) => a.events);
    expect(e.map((x) => `${x.step}:${x.state}`)).toEqual(["reel vorbereiten:start", "reel vorbereiten:error"]);
    const detail = JSON.stringify(e[1]!.detail);
    expect(detail).toMatch(/Das Skript fehlt/);
    expect(detail).not.toContain(tmp);
    expect(detail).not.toMatch(/Studio|inhalte|skript\.md/);
  });

  it("reel status ist keine Arbeit und wird nicht gemeldet", async () => {
    await fuehreAus(["reel", "status"], melderZu());
    expect(anfragen).toEqual([]);
  });

  it("ein unbekannter Befehl wird nicht gemeldet", async () => {
    const r = await fuehreAus(["reel", "unsinn"], melderZu());
    expect(r.rc).toBe(2);
    expect(anfragen).toEqual([]);
  });

  it("ohne Melder (Tool nicht eingerichtet) passiert nichts", async () => {
    const r = await fuehreAus(NEU, undefined);
    expect(r.rc).toBe(0);
    expect(anfragen).toEqual([]);
  });
});

const hatFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

describe.skipIf(!hatFfmpeg)("reel vorbereiten: die Teilschritte erreichen das Tool", () => {
  const Z1 = "Wir haben diese Woche eine Küche komplett umgebaut.";
  const Z2 = "Der Kunde wollte mehr Stauraum.";
  const SKRIPT_LANG = `# Küche Gossau\n${Z1}\n${Z2}\n`;

  it("meldet den ganzen Befehl und seine Schritte mit Dauer, in der Reihenfolge der Arbeit, ohne Pfade", async () => {
    // Ersatz-Whisper: legt das vorbereitete Transkript unter dem Namen der Aufnahme ab (wie in reel.test.ts)
    const woerter = (s: ReturnType<typeof testSatz>) => ({ start: s.von, end: s.bis, text: ` ${s.text}`, words: s.woerter!.map((w) => ({ word: ` ${w.text}`, start: w.von, end: w.bis })) });
    const vorlage = path.join(tmp, "vorlage.json");
    fs.writeFileSync(vorlage, JSON.stringify({ segments: [woerter(testSatz(1, Z1)), woerter(testSatz(8, Z2))] }));
    const bin = path.join(tmp, "whisper-ersatz");
    fs.writeFileSync(bin, `#!/usr/bin/env node\nconst fs = require("node:fs"), path = require("node:path");\nconst a = process.argv.slice(2);\nfs.copyFileSync(${JSON.stringify(vorlage)}, path.join(a[a.indexOf("--output_dir") + 1], path.basename(a[0], path.extname(a[0])) + ".json"));\n`);
    fs.chmodSync(bin, 0o755);
    vi.stubEnv("STUDIO_WHISPER_BIN", bin);

    const markiere = (stueck: string): void => {
      fs.mkdirSync(path.join(tmp, "Medien", "rohmaterial", "c-0007"), { recursive: true });
      const ziel = path.join(tmp, "Medien", "rohmaterial", "c-0007", stueck);
      const r = spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=320x568:rate=25:duration=14", "-f", "lavfi", "-i", "sine=frequency=300:duration=14", "-shortest", ziel]);
      expect(r.status).toBe(0);
    };
    fs.mkdirSync(path.join(tmp, "Studio"), { recursive: true });
    const env: Umgebung = { ...umgebung(root), datenDir: path.join(tmp, "daten") };
    const geraete: ReelGeraete = { liesZwischenablage: () => SKRIPT_LANG, schreibeZwischenablage: () => undefined, oeffne: () => undefined };
    await reelBefehl("neu", parseArgs(["reel", "neu", "c-0007", "--marke", "alperna", "--zwischenablage", "--nicht-oeffnen"]), env, geraete);
    markiere("Kunde Mueller Sprache 01.mp4");

    const melder = melderZu();
    const rc = await reelBefehl("vorbereiten", parseArgs(["reel", "vorbereiten", "c-0007", "--ohne-pegel"]), env, { ...geraete, melder });
    await beendeMelder(melder, 3000);
    expect(rc).toBe(0);

    const e = anfragen.flatMap((a) => a.events);
    const ganz = e.filter((x) => x.step === "reel vorbereiten");
    expect(ganz.map((x) => x.state)).toEqual(["start", "ok"]);
    // Teilschritte: die Schritte der Stoppuhr liegen zwischen Beginn und Ende des Befehls, jeder mit Beginn und Ende und gleicher span
    const teile = e.filter((x) => x.step !== "reel vorbereiten");
    const namen = [...new Set(teile.map((x) => x.step))];
    expect(namen.length).toBeGreaterThanOrEqual(3);
    for (const n of namen) {
      const paar = teile.filter((x) => x.step === n);
      expect(paar.map((x) => x.state), n).toEqual(["start", "ok"]);
      expect(paar[0]!.span, n).toBe(paar[1]!.span);
      expect(typeof paar[1]!.ms, n).toBe("number");
    }
    expect(e.every((x) => x.code === "c-0007")).toBe(true);
    expect(e[0]).toMatchObject({ step: "reel vorbereiten", state: "start" });
    expect(e.at(-1)).toMatchObject({ step: "reel vorbereiten", state: "ok" });
    // nichts vom Kunden: weder Pfade noch der Name der Aufnahme noch Text aus dem Skript
    const alles = JSON.stringify(e);
    expect(alles).not.toMatch(/Mueller|Sprache|Küche|Stauraum|Studio|Medien|rohmaterial|\/tmp|\.mp4/);
    // die Namen und die Reihenfolge der Schritte sind die der Stoppuhr (so stehen sie auch am Ende der Ausgabe)
    expect(namen).toEqual(["Videos sondieren", "Transkription", "Farbe messen", "Stille messen", "Zuordnen und Plan"]);
  });
});
