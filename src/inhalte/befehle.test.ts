import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseArgs } from "../args";
import { umgebung, type Umgebung } from "../motion/werkstatt";
import { INHALTE_HILFE, inhalteBefehl, markenBefehl } from "./befehle";
import { ladeStand } from "./stand";
import { ImportDateiSchema } from "./tool-export";

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

  it("textpruefen liefert Empfehlungen und Prüffragen zum Hook, ohne dass sie «bestanden» oder den Exit-Code ändern", () => {
    const text = `${Array.from({ length: 40 }, (_, k) => `wort${k}`).join(" ")}. Kommentiere Hook und ich schicke dir den Link.`;
    const r = lauf("inhalte", "textpruefen", "--marke", "alperna", "--format", "LinkedIn-Post", "--text-datei", entwurf(text), "--beleg", "Wartezeit von 32 auf 14 Minuten", "--hook", "Die Wartezeit sinkt");
    expect(r).toBe(0);
    expect(json().bestanden).toBe(true);
    expect(json().befunde).toEqual([]);
    expect(json().empfehlungen.map((e: { code: string }) => e.code)).toEqual(["hook_ohne_zahl", "erster_satz_lang", "kommentar_koeder"]);
    expect(json().pruefFragen).toHaveLength(3);
    expect(json().hinweis).toMatch(/nicht belegt/);
  });

  it("textpruefen: --hook-datei wird gelesen, ohne Hook kommt bei einem Reel die Empfehlung", () => {
    lauf("inhalte", "textpruefen", "--marke", "alperna", "--format", "LinkedIn-Post", "--text-datei", entwurf("Kurz."), "--beleg", "ohne", "--hook-datei", schreibe("hook.txt", "Ein Hook"));
    expect(json().empfehlungen).toEqual([]);
    ausgabe.length = 0;
    lauf("inhalte", "textpruefen", "--marke", "alperna", "--format", "LinkedIn-Post", "--text-datei", entwurf("Kurz."), "--beleg", "ohne");
    expect(json().empfehlungen.map((e: { code: string }) => e.code)).toEqual(["hook_fehlt"]);
  });

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

describe("marken gate0", () => {
  const profilKopie = (): string => {
    const dir = path.join(tmp, "marken");
    fs.mkdirSync(dir, { recursive: true });
    const echt = fs.readFileSync(path.join(root, "marken", "alperna.json"), "utf8");
    // Als Platzhalter, unabhängig vom aktuellen Stand von Gate 0 im Repo
    fs.writeFileSync(path.join(dir, "alperna.json"), echt.replace(/^[ \t]*"freigabe":.*\n/m, "").replace('"status": "freigegeben"', '"status": "platzhalter"'));
    env = { ...env, markenDir: dir };
    return path.join(dir, "alperna.json");
  };
  const gate0 = (...argv: string[]): number => markenBefehl("gate0", parseArgs(["marken", "gate0", ...argv]), env, () => JETZT);

  it("ohne --anwenden nur Bericht, die Datei bleibt unberührt", () => {
    const datei = profilKopie();
    const vorher = fs.readFileSync(datei, "utf8");
    const m = schreibe("m.json", marken("freigegeben", "Andrej"));
    expect(gate0("--marken", m)).toBe(0);
    expect(json()).toMatchObject({ angewendet: false, befunde: [{ marke: "alperna", art: "uebernommen", aendertDatei: true }] });
    expect(fs.readFileSync(datei, "utf8")).toBe(vorher);
  });

  it("mit --anwenden steht das Profil auf «freigegeben», ein zweiter Lauf ändert nichts mehr", () => {
    const datei = profilKopie();
    const m = schreibe("m.json", marken("freigegeben", "Andrej"));
    gate0("--marken", m, "--anwenden");
    const p = JSON.parse(fs.readFileSync(datei, "utf8"));
    expect(p.status).toBe("freigegeben");
    expect(p.freigabe.wer).toBe("Andrej");
    ausgabe = [];
    gate0("--marken", m, "--anwenden");
    expect(json().befunde[0]).toMatchObject({ art: "unveraendert", aendertDatei: false });
    expect(fs.readdirSync(path.dirname(datei))).toEqual(["alperna.json"]); // keine temporäre Datei übrig
  });

  it("verlangt die Datei und kennt nur gate0", () => {
    profilKopie();
    expect(() => gate0()).toThrow(/--marken fehlt/);
    expect(markenBefehl("gibtsnicht", parseArgs(["marken", "gibtsnicht"]), env, () => JETZT)).toBe(2);
  });
});

describe("inhalte material", () => {
  const alt = process.env["STUDIO_HOME"];
  const altMedien = process.env["STUDIO_MEDIEN"];
  afterEach(() => {
    if (alt === undefined) delete process.env["STUDIO_HOME"]; else process.env["STUDIO_HOME"] = alt;
    if (altMedien === undefined) delete process.env["STUDIO_MEDIEN"]; else process.env["STUDIO_MEDIEN"] = altMedien;
  });

  it("meldet vorhandene und fehlende Dateien, Links bleiben ungeprüft, abgeschlossene Inhalte fehlen", () => {
    const studio = path.join(tmp, "Studio");
    fs.mkdirSync(path.join(studio, "rohmaterial"), { recursive: true });
    fs.writeFileSync(path.join(studio, "rohmaterial", "a.mov"), "x");
    process.env["STUDIO_HOME"] = studio;
    delete process.env["STUDIO_MEDIEN"];
    const z = schreibe("z.json", {
      results: [
        zeile({ Status: "In Produktion", Dateien: "Footage: rohmaterial/a.mov | Totale<br>Footage: rohmaterial/fehlt.mov<br>Foto: https://x.test/a" }),
        zeile({ "Inhalt-ID": "c-0002", Status: "Ausgewertet", Dateien: "Footage: rohmaterial/alt.mov" }),
      ],
    });
    expect(lauf("inhalte", "material", "--inhalte", z)).toBe(1); // eine Datei fehlt
    const r = json();
    expect(r.inhalte.map((i: any) => i.id)).toEqual(["c-0001"]);
    expect(r.inhalte[0].eintraege.map((e: any) => [e.art, e.vorhanden])).toEqual([["Footage", true], ["Footage", false], ["Foto", null]]);
    expect(r.dateienFehlen).toEqual([{ id: "c-0001", art: "Footage", ziel: "rohmaterial/fehlt.mov" }]);
  });

  it("alles in Ordnung gibt Exit-Code 0; ohne Footage bei «Dreh nötig» gibt 1", () => {
    const studio = path.join(tmp, "Studio");
    fs.mkdirSync(path.join(studio, "rohmaterial"), { recursive: true });
    fs.writeFileSync(path.join(studio, "rohmaterial", "a.mov"), "x");
    process.env["STUDIO_HOME"] = studio;
    delete process.env["STUDIO_MEDIEN"];
    expect(lauf("inhalte", "material", "--inhalte", schreibe("ok.json", { results: [zeile({ Status: "In Produktion", Dateien: "Footage: rohmaterial/a.mov" })] }))).toBe(0);
    ausgabe = [];
    expect(lauf("inhalte", "material", "--inhalte", schreibe("leer.json", { results: [zeile({ Status: "In Produktion", Dateien: "" })] }))).toBe(1);
    expect(json().inhalte[0]).toMatchObject({ id: "c-0001", materialFehlt: true, eintraege: [] });
  });

  it("ohne eingerichteten Studio-Ordner steht das da, und es wird nichts als fehlend gemeldet", () => {
    const leerHome = path.join(tmp, "home-ohne-config");
    fs.mkdirSync(leerHome);
    const altConfig = process.env["STUDIO_CONFIG"];
    process.env["STUDIO_CONFIG"] = path.join(leerHome, "config.json");
    delete process.env["STUDIO_HOME"];
    try {
      const z = schreibe("z.json", { results: [zeile({ Status: "In Produktion", Dateien: "Footage: rohmaterial/a.mov" })] });
      expect(lauf("inhalte", "material", "--inhalte", z)).toBe(0);
      expect(json()).toMatchObject({ studioOrdner: null, hinweis: expect.stringMatching(/nicht eingerichtet/), dateienFehlen: [] });
    } finally {
      if (altConfig === undefined) delete process.env["STUDIO_CONFIG"]; else process.env["STUDIO_CONFIG"] = altConfig;
    }
  });
});

describe("inhalte tool-export", () => {
  const seite = (i: number): string => i.toString(16).padStart(32, "0");
  /** 98 Zeilen wie in Notion: 3 Beispiele, 95 Altbeiträge (75 ausgewertet, 9 verworfen, 11 neu). */
  const notion = () => {
    const zeilen: Record<string, unknown>[] = [];
    for (let n = 1; n <= 98; n++) {
      const status = n <= 3 ? (n === 3 ? "Entwurf fertig" : "Pitch bereit") : n <= 78 ? "Ausgewertet" : n <= 87 ? "Verworfen" : "Neu";
      zeilen.push(
        zeile({
          url: `https://app.notion.com/p/${seite(n)}`,
          "Inhalt-ID": `c-${String(n).padStart(4, "0")}`,
          Titel: n <= 3 ? `Beispiel: Zeile ${n}` : `Beitrag ${n}`,
          Format: n % 2 ? "LinkedIn-Post" : "Reel",
          Status: status,
          Winkel: "Pillar: B Gruender-Journey · Hook-Muster: Curiosity Gap · CTA: keiner",
          "Tor I Entscheid": "",
          "Tor P Entscheid": "",
        }),
      );
    }
    return { results: zeilen, has_more: false };
  };
  const dateien = (): { z: string; m: string; out: string } => ({ z: schreibe("zeilen.json", notion()), m: schreibe("marken.json", marken()), out: path.join(tmp, "import.json") });

  it("schreibt die Datei: 84 Beiträge (75 ausgewertet, 9 verworfen), die 3 Beispiele und die 11 laufenden Zeilen bleiben draussen, mit Grund", () => {
    const { z, m, out } = dateien();
    expect(lauf("inhalte", "tool-export", "--inhalte", z, "--marken", m, "--out", out)).toBe(0);
    const bericht = json();
    expect(bericht).toMatchObject({ geschrieben: out, inhalte: 84, marken: 1 });
    expect(bericht.uebersprungen).toHaveLength(14);
    expect(bericht.uebersprungen.filter((u: { grund: string }) => u.grund === "Beispielzeile").map((u: { id: string }) => u.id)).toEqual(["c-0001", "c-0002", "c-0003"]);
    expect(bericht.uebersprungen.filter((u: { grund: string }) => u.grund.startsWith("Laufende Arbeit"))).toHaveLength(11);
    expect(bericht.hinweise).toEqual([]);
    expect(bericht.naechsterSchritt).toContain("/studio/import");

    const datei = ImportDateiSchema.parse(JSON.parse(fs.readFileSync(out, "utf8")));
    expect(datei.contents).toHaveLength(84);
    expect(datei.contents.filter((c) => c.status === "evaluated")).toHaveLength(75);
    expect(datei.contents.filter((c) => c.status === "discarded")).toHaveLength(9);
    expect(datei.contents.every((c) => c.brand === "alperna" && c.pattern === "Curiosity Gap" && c.content_type === "B Gruender-Journey")).toBe(true);
    expect(datei.contents[0]).toMatchObject({ code: "c-0004", notion_id: seite(4), medium: "reel" });
    expect(datei.brands).toEqual([{ key: "alperna", name: "Alperna", kind: "own", notion_gate0: "open" }]);
  });

  it("Besonderheiten stehen als Hinweise im Bericht: eine Marke, die sich nicht auflösen lässt", () => {
    const z = schreibe("zeilen.json", { results: [zeile({ Status: "Ausgewertet", "Inhalt-ID": "c-0004", Marke: '["https://app.notion.com/p/00000000000000000000000000000000"]', "Tor I Entscheid": "", "Tor P Entscheid": "" })] });
    const m = schreibe("marken.json", marken());
    const out = path.join(tmp, "import.json");
    expect(lauf("inhalte", "tool-export", "--inhalte", z, "--marken", m, "--out", out)).toBe(0);
    const bericht = json();
    expect(bericht.inhalte).toBe(1);
    expect(bericht.hinweise).toHaveLength(1);
    expect(bericht.hinweise[0]).toContain("c-0004");
    expect(ImportDateiSchema.parse(JSON.parse(fs.readFileSync(out, "utf8"))).contents[0]!.brand).toBeNull();
  });

  it("die Prüfsumme im Bericht ist die der Datei, und es bleibt keine halbe Datei liegen", () => {
    const { z, m, out } = dateien();
    lauf("inhalte", "tool-export", "--inhalte", z, "--marken", m, "--out", out);
    expect(json().pruefsumme).toBe(createHash("sha256").update(fs.readFileSync(out)).digest("hex"));
    expect(fs.readdirSync(tmp).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });

  it("zweimal gleich: dieselbe Datei, dieselbe Prüfsumme (der Zeitpunkt kommt von aussen)", () => {
    const { z, m, out } = dateien();
    lauf("inhalte", "tool-export", "--inhalte", z, "--marken", m, "--out", out);
    const erste = json().pruefsumme;
    ausgabe.length = 0;
    lauf("inhalte", "tool-export", "--inhalte", z, "--marken", m, "--out", out);
    expect(json().pruefsumme).toBe(erste);
  });

  it("eine vorhandene Datei wird ersetzt", () => {
    const { z, m, out } = dateien();
    fs.writeFileSync(out, "alt");
    lauf("inhalte", "tool-export", "--inhalte", z, "--marken", m, "--out", out);
    expect(fs.readFileSync(out, "utf8")).not.toBe("alt");
  });

  it.each([
    ["--out fehlt", (z: string, m: string) => ["--inhalte", z, "--marken", m]],
    ["--marken fehlt", (z: string, _m: string, out: string) => ["--inhalte", z, "--out", out]],
    ["--inhalte fehlt", (_z: string, m: string, out: string) => ["--marken", m, "--out", out]],
  ])("%s: Fehler mit Hinweis, nichts geschrieben", (_n, args) => {
    const { z, m, out } = dateien();
    expect(() => lauf("inhalte", "tool-export", ...args(z, m, out))).toThrow(/fehlt/);
    expect(fs.existsSync(out)).toBe(false);
  });

  it("sendet nichts: kein Netzaufruf (Regel 11)", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("kein Netz erlaubt"));
    const { z, m, out } = dateien();
    lauf("inhalte", "tool-export", "--inhalte", z, "--marken", m, "--out", out);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("die Hilfe nennt den Befehl", () => {
    expect(INHALTE_HILFE).toContain("inhalte tool-export");
    expect(INHALTE_HILFE).toContain("/studio/import");
  });
});
