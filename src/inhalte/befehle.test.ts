import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseArgs } from "../args";
import { umgebung, type Umgebung } from "../motion/werkstatt";
import { inhalteBefehl } from "./befehle";
import { ladeStand } from "./stand";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
let tmp: string;
let env: Umgebung;
let ausgabe: string[];
const JETZT = "2026-10-17T09:00:00Z";

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "studio-inhalte-"));
  env = { ...umgebung(root), datenDir: path.join(tmp, "daten") };
  ausgabe = [];
  vi.spyOn(console, "log").mockImplementation((...x: unknown[]) => void ausgabe.push(x.join(" ")));
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const lauf = (...argv: string[]): number => inhalteBefehl(argv[1]!, parseArgs(argv), env, () => JETZT);
const json = (): any => JSON.parse(ausgabe.join("\n"));
const schreibe = (name: string, inhalt: unknown): string => {
  const d = path.join(tmp, name);
  fs.writeFileSync(d, typeof inhalt === "string" ? inhalt : JSON.stringify(inhalt));
  return d;
};

const MARKE_URL = "https://app.notion.com/p/3fc6be186e9b81df9141ebe5778a86ff";
const marken = (gate0 = "offen", von = "") => ({ results: [{ Typ: "Eigene", "Gate 0": gate0, "Gate 0 von": von, "Marken-ID": "alperna", Name: "Alperna", url: MARKE_URL }], has_more: false });
const zeile = (p: Record<string, unknown> = {}) => ({
  url: "https://app.notion.com/p/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa01",
  "Inhalt-ID": "c-0001",
  Titel: "Wartezeit beim Zahnarzt",
  Format: "Reel",
  Plattformen: '["Instagram"]',
  Marke: `["${MARKE_URL}"]`,
  Quelle: "Manuell",
  Hook: "Dreissig Minuten Wartezeit sind kein Naturgesetz.",
  Winkel: "Ein Praxisteam zeigt, wie es die Wartezeit halbiert hat",
  Beleg: "Praxis Hofer, Herisau: Wartezeit von 32 auf 14 Minuten, gemessen im September 2026",
  Aufwand: "Dreh nötig",
  Status: "Pitch bereit",
  "Tor I Entscheid": "offen",
  "Tor P Entscheid": "offen",
  createdTime: "2026-10-10T08:00:00Z",
  ...p,
});

describe("inhalte abgleich", () => {
  it("ohne --uebernehmen nur Bericht: der Stand wird nicht geschrieben", () => {
    const z = schreibe("z.json", { results: [zeile({ Status: "Neu" })] });
    const m = schreibe("m.json", marken());
    expect(lauf("inhalte", "abgleich", "--inhalte", z, "--marken", m)).toBe(0);
    expect(json()).toMatchObject({ gespeichert: false, zaehlung: { neu: 1 } });
    expect(fs.existsSync(path.join(env.datenDir, "inhalte-stand.json"))).toBe(false);
  });

  it("mit --uebernehmen steht die Zeile im Stand", () => {
    const z = schreibe("z.json", { results: [zeile({ Status: "Neu" })] });
    const m = schreibe("m.json", marken());
    lauf("inhalte", "abgleich", "--inhalte", z, "--marken", m, "--uebernehmen");
    expect(ladeStand(path.join(env.datenDir, "inhalte-stand.json")).inhalte["c-0001"]?.status).toBe("Neu");
  });

  it("ganzer Weg über Dateien: Tor I wartet auf Gate 0, nach Gate 0 kommt der Eingriff mit fertigen Eigenschaften", () => {
    const m0 = schreibe("m0.json", marken());
    lauf("inhalte", "abgleich", "--inhalte", schreibe("z0.json", { results: [zeile({ Status: "Neu" })] }), "--marken", m0, "--uebernehmen");
    const pitch = zeile({ "Tor I Entscheid": "freigegeben", "Tor I von": "Leander", "date:Tor I am:start": "2026-10-17T08:00:00Z" });
    lauf("inhalte", "abgleich", "--inhalte", schreibe("z1.json", { results: [pitch] }), "--marken", m0, "--uebernehmen");
    // Neu → Pitch bereit wurde von Hand gesetzt und übernommen. Das Tor ist entschieden, Gate 0 ist offen.
    ausgabe = [];
    lauf("inhalte", "abgleich", "--inhalte", schreibe("z2.json", { results: [pitch] }), "--marken", m0);
    expect(json().blockiert[0].fehler.join(" ")).toMatch(/Gate 0/);
    expect(json().eingriffe).toEqual([]);
    ausgabe = [];
    lauf("inhalte", "abgleich", "--inhalte", schreibe("z3.json", { results: [pitch] }), "--marken", schreibe("m1.json", marken("freigegeben", "Andrej")));
    expect(json().eingriffe).toEqual([expect.objectContaining({ id: "c-0001", art: "weiter", eigenschaften: { Status: "In Produktion" } })]);
  });

  it("verlangt beide Dateien und nennt, was fehlt", () => {
    expect(() => lauf("inhalte", "abgleich", "--marken", schreibe("m.json", marken()))).toThrow(/--inhalte fehlt/);
    expect(() => lauf("inhalte", "abgleich", "--inhalte", schreibe("z.json", { results: [] }))).toThrow(/--marken fehlt/);
  });
});

describe("inhalte textpruefen und pruefung", () => {
  const entwurf = (text: string) => schreibe("entwurf.txt", text);

  it("ein sauberer Text besteht, mit --id wird die Prüfung vermerkt", () => {
    const r = lauf("inhalte", "textpruefen", "--marke", "alperna", "--format", "LinkedIn-Post", "--text-datei", entwurf("Praxis Hofer hat die Wartezeit auf 14 Minuten gesenkt."), "--beleg", "Wartezeit von 32 auf 14 Minuten", "--id", "c-0007");
    expect(r).toBe(0);
    expect(json().bestanden).toBe(true);
    expect(ladeStand(path.join(env.datenDir, "inhalte-stand.json")).pruefungen["c-0007"]).toMatchObject({ bestanden: true });
  });

  it("verbotenes Wort aus dem echten Markenprofil und Zahl ohne Beleg: Exit-Code 1, Fehler im Stand", () => {
    const r = lauf("inhalte", "textpruefen", "--marke", "alperna", "--format", "LinkedIn-Post", "--text-datei", entwurf("Ein viraler Post bringt 500 Anfragen."), "--beleg", "Wartezeit von 32 auf 14 Minuten", "--id", "c-0007");
    expect(r).toBe(1);
    expect(json().befunde.map((b: { code: string }) => b.code)).toEqual(expect.arrayContaining(["verbotenes_wort", "zahl_ohne_beleg"]));
    const p = ladeStand(path.join(env.datenDir, "inhalte-stand.json")).pruefungen["c-0007"];
    expect(p?.bestanden).toBe(false);
    expect(p?.text).toMatch(/viraler/);
  });

  it("ein unbekanntes Format oder eine kaputte ID wird abgelehnt", () => {
    expect(() => lauf("inhalte", "textpruefen", "--marke", "alperna", "--format", "Podcast", "--text-datei", entwurf("x"), "--beleg", "y")).toThrow(/--format/);
    expect(() => lauf("inhalte", "textpruefen", "--marke", "alperna", "--format", "Blog", "--text-datei", entwurf("Text."), "--beleg", "y", "--id", "7")).toThrow(/Inhalt-ID/);
  });

  it("pruefung vermerkt das Ergebnis und verlangt genau eine Angabe", () => {
    expect(lauf("inhalte", "pruefung", "c-0003", "--bestanden")).toBe(0);
    expect(lauf("inhalte", "pruefung", "c-0004", "--nicht-bestanden", "--text", "Untertitel abgeschnitten")).toBe(0);
    const s = ladeStand(path.join(env.datenDir, "inhalte-stand.json"));
    expect(s.pruefungen["c-0003"]?.bestanden).toBe(true);
    expect(s.pruefungen["c-0004"]).toMatchObject({ bestanden: false, text: "Untertitel abgeschnitten" });
    expect(() => lauf("inhalte", "pruefung", "c-0003")).toThrow(/Entweder/);
    expect(() => lauf("inhalte", "pruefung", "c-0003", "--bestanden", "--nicht-bestanden")).toThrow(/Entweder/);
  });

  it("ein unbekannter Befehl gibt Hilfe und Exit-Code 2", () => {
    expect(lauf("inhalte", "gibtsnicht")).toBe(2);
  });
});
