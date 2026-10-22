import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { alsSchritt, baueEreignis, bereinige, entsperre, erzeugeMelder, keinMelder, type Ereignis, type Melder, type MelderOptionen } from "./melder";
import { stoppuhr } from "../schnitt/stoppuhr";

const ID = "3f8a1c2e-5b7d-4e90-8a11-0c2d4e6f8a10";
const GEHEIMNIS = "Zq3_-xK9mP2vR8sT5wY1uN7bC4dF6gH0jLaE2oIpQkM";
const TOKEN = `vsd_${ID}_${GEHEIMNIS}`;

interface Anfrage {
  headers: http.IncomingHttpHeaders;
  body: { events: Ereignis[] };
}
type Antwort = { status: number; body?: unknown; headers?: Record<string, string> } | "haengt";

let tmp: string;
let ausgang: string;
let srv: http.Server | undefined;
let anfragen: Anfrage[];
let antwort: (n: number, a: Anfrage) => Antwort;
let url: string;
let t: number;
const jetzt = (): number => t;

async function starteServer(): Promise<void> {
  anfragen = [];
  srv = http.createServer((req, res) => {
    const teile: Buffer[] = [];
    req.on("data", (c: Buffer) => teile.push(c));
    req.on("end", () => {
      const a: Anfrage = { headers: req.headers, body: JSON.parse(Buffer.concat(teile).toString("utf8")) as { events: Ereignis[] } };
      anfragen.push(a);
      const r = antwort(anfragen.length, a);
      if (r === "haengt") return;
      res.writeHead(r.status, { "content-type": "application/json", ...(r.headers ?? {}) });
      res.end(JSON.stringify(r.body ?? { accepted: a.body.events.length, duplicates: 0, rejected: [] }));
    });
  });
  await new Promise<void>((r) => srv!.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
}

beforeEach(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vs-melder-"));
  ausgang = path.join(tmp, "ausgang");
  t = Date.parse("2026-10-22T08:00:00.000Z");
  antwort = () => ({ status: 200 });
  await starteServer();
});
afterEach(async () => {
  srv?.closeAllConnections();
  await new Promise<void>((r) => srv!.close(() => r()));
  fs.rmSync(tmp, { recursive: true, force: true });
});

let zaehler = 0;
function melder(o: Partial<MelderOptionen> = {}): Melder {
  return erzeugeMelder({ konfig: { url, token: TOKEN }, ausgang, jetzt, verzoegerung: 0, neueId: () => `ev-${String(++zaehler).padStart(4, "0")}`, ...o });
}
const korb = (): string[] => (fs.existsSync(ausgang) ? fs.readdirSync(ausgang).filter((n) => n.endsWith(".json") && n !== "zustand.json") : []);
const abgelehnt = (): string[] => (fs.existsSync(path.join(ausgang, "abgelehnt")) ? fs.readdirSync(path.join(ausgang, "abgelehnt")) : []);
const ereignis = (step: string) => ({ step, state: "info" as const });

describe("ohne Verbindung", () => {
  it("tut nichts: keine Datei, kein Netz, keine Wartezeit", async () => {
    const m = erzeugeMelder({ konfig: undefined, ausgang });
    expect(m).toBe(keinMelder);
    m.melde(ereignis("a"));
    await m.leeren(5000);
    expect(fs.existsSync(ausgang)).toBe(false);
    expect(anfragen).toHaveLength(0);
    expect(m.hinweis()).toBeUndefined();
    expect(m.stand().verbunden).toBe(false);
    m.schritte("c-0001")({ nr: 1, name: "x", zustand: "start" });
  });
});

describe("senden", () => {
  it("sendet gebündelt mit Token im Header, und der Korb ist danach leer", async () => {
    const m = melder();
    m.melde({ step: "whisper", state: "start", span: "s1", code: "c-0007" });
    m.melde({ step: "whisper", state: "ok", span: "s1", ms: 91000, code: "c-0007", detail: { modell: "large-v3" } });
    await m.leeren(3000);
    expect(anfragen).toHaveLength(1);
    expect(anfragen[0]!.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(anfragen[0]!.headers["content-type"]).toBe("application/json");
    const [a, b] = anfragen[0]!.body.events;
    expect(a).toMatchObject({ id: "ev-0001" + "", step: "whisper", state: "start", span: "s1", code: "c-0007", at: "2026-10-22T08:00:00.000Z" });
    expect(b).toMatchObject({ state: "ok", ms: 91000, detail: { modell: "large-v3" } });
    expect(korb()).toEqual([]);
    expect(m.stand()).toMatchObject({ verbunden: true, wartend: 0, gesperrt: false });
  });

  it("schreibt das Ereignis in den Korb, bevor melde() zurückkehrt (es geht beim Exit nicht verloren)", () => {
    antwort = () => "haengt";
    const m = melder({ verzoegerung: 10_000 });
    m.melde(ereignis("a"));
    expect(korb()).toHaveLength(1);
    expect(JSON.parse(fs.readFileSync(path.join(ausgang, korb()[0]!), "utf8"))).toMatchObject({ id: expect.any(String), step: "a", state: "info" });
    expect(anfragen).toHaveLength(0);
  });

  it("leeren() wartet höchstens die genannte Zeit, auch wenn das Tool nicht antwortet; das Ereignis bleibt im Korb", async () => {
    antwort = () => "haengt";
    const m = melder();
    m.melde(ereignis("a"));
    const t0 = Date.now();
    await m.leeren(120);
    expect(Date.now() - t0).toBeLessThan(1500);
    expect(korb()).toHaveLength(1);
  });

  it("Zeitüberschreitung der Sendung: kein Wurf, Ereignis bleibt, Wartezeit gesetzt", async () => {
    antwort = () => "haengt";
    const m = melder({ zeitlimit: 60 });
    m.melde(ereignis("a"));
    await m.leeren(3000);
    expect(korb()).toHaveLength(1);
    expect(m.stand().nichtVor).toBe(t + 30_000);
  });

  it("Netzfehler (nichts hört auf dem Port): kein Wurf, Ereignis bleibt", async () => {
    const m = melder({ konfig: { url: "http://127.0.0.1:1", token: TOKEN } });
    m.melde(ereignis("a"));
    await expect(m.leeren(3000)).resolves.toBeUndefined();
    expect(korb()).toHaveLength(1);
  });

  it("mehr als 50 Ereignisse gehen in mehreren Sendungen, in der Reihenfolge des Meldens", async () => {
    const m = melder();
    for (let i = 1; i <= 120; i++) {
      t += 1;
      m.melde(ereignis(`schritt-${i}`));
    }
    await m.leeren(5000);
    expect(anfragen.map((a) => a.body.events.length)).toEqual([50, 50, 20]);
    const steps = anfragen.flatMap((a) => a.body.events.map((e) => e.step));
    expect(steps).toEqual(Array.from({ length: 120 }, (_, i) => `schritt-${i + 1}`));
    expect(korb()).toEqual([]);
  });

  it("ein Ereignis, das während einer Sendung dazukommt, wird auch gesendet", async () => {
    let freigabe: (() => void) | undefined;
    const warten = new Promise<void>((r) => (freigabe = r));
    srv!.removeAllListeners("request");
    srv!.on("request", (req, res) => {
      const teile: Buffer[] = [];
      req.on("data", (c: Buffer) => teile.push(c));
      req.on("end", () => {
        anfragen.push({ headers: req.headers, body: JSON.parse(Buffer.concat(teile).toString("utf8")) });
        void (anfragen.length === 1 ? warten : Promise.resolve()).then(() => {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ accepted: 1, duplicates: 0, rejected: [] }));
        });
      });
    });
    const m = melder();
    m.melde(ereignis("erstes"));
    await new Promise((r) => setTimeout(r, 50));
    m.melde(ereignis("zweites"));
    freigabe!();
    await m.leeren(3000);
    expect(anfragen.flatMap((a) => a.body.events.map((e) => e.step))).toEqual(["erstes", "zweites"]);
    expect(korb()).toEqual([]);
  });

  it("der Zeitgeber hält den Prozess nicht am Leben und feuert nach der Verzögerung", async () => {
    const m = melder({ verzoegerung: 30 });
    m.melde(ereignis("a"));
    expect(anfragen).toHaveLength(0);
    await new Promise((r) => setTimeout(r, 400));
    expect(anfragen).toHaveLength(1);
    await m.leeren(1000);
  });
});

describe("Antworten des Tools", () => {
  it("503: Ereignis bleibt, Wartezeit 30 s, dann 60 s, 120 s … höchstens 1 Stunde; vorher wird nicht gesendet", async () => {
    antwort = () => ({ status: 503 });
    const m = melder();
    m.melde(ereignis("a"));
    await m.leeren(3000);
    expect(anfragen).toHaveLength(1);
    expect(m.stand().nichtVor).toBe(t + 30_000);
    // vor Ablauf: keine Sendung
    t += 29_000;
    await m.leeren(3000);
    expect(anfragen).toHaveLength(1);
    // nach Ablauf: nächster Versuch, doppelte Wartezeit
    t += 2_000;
    await m.leeren(3000);
    expect(anfragen).toHaveLength(2);
    expect(m.stand().nichtVor).toBe(t + 60_000);
    for (let i = 0; i < 12; i++) {
      t += 3_600_000;
      await m.leeren(3000);
    }
    expect(m.stand().nichtVor! - t).toBe(3_600_000);
    expect(korb()).toHaveLength(1);
  });

  it("derselbe Eintrag behält beim Wiederholen seine Kennung (das Tool zählt ihn nie doppelt)", async () => {
    antwort = (n) => (n === 1 ? { status: 503 } : { status: 200 });
    const m = melder();
    m.melde(ereignis("a"));
    await m.leeren(3000);
    t += 31_000;
    await m.leeren(3000);
    expect(anfragen).toHaveLength(2);
    expect(anfragen[1]!.body.events[0]!.id).toBe(anfragen[0]!.body.events[0]!.id);
    expect(korb()).toEqual([]);
    expect(m.stand().nichtVor).toBeUndefined();
  });

  it("429 mit Retry-After: Die Wartezeit ist mindestens so lang", async () => {
    antwort = () => ({ status: 429, headers: { "retry-after": "120" } });
    const m = melder();
    m.melde(ereignis("a"));
    await m.leeren(3000);
    expect(m.stand().nichtVor).toBe(t + 120_000);
    expect(korb()).toHaveLength(1);
  });

  it("404 (Studio im Tool ausgeschaltet) wird wie 503 behandelt: später wieder, nichts geht verloren", async () => {
    antwort = () => ({ status: 404 });
    const m = melder();
    m.melde(ereignis("a"));
    await m.leeren(3000);
    expect(korb()).toHaveLength(1);
    expect(abgelehnt()).toEqual([]);
    expect(m.stand().nichtVor).toBeDefined();
  });

  it.each([422, 413])("%i wird nie wiederholt: die Dateien gehen nach abgelehnt/", async (status) => {
    antwort = () => ({ status, body: { error: "x" } });
    const m = melder();
    m.melde(ereignis("a"));
    m.melde(ereignis("b"));
    await m.leeren(3000);
    expect(korb()).toEqual([]);
    expect(abgelehnt()).toHaveLength(2);
    t += 10_000_000;
    await m.leeren(3000);
    expect(anfragen).toHaveLength(1);
    expect(m.stand()).toMatchObject({ wartend: 0, abgelehnt: 2 });
  });

  it("einzeln abgewiesene Einträge einer 200-Antwort gehen nach abgelehnt/, die übrigen sind erledigt", async () => {
    antwort = () => ({ status: 200, body: { accepted: 2, duplicates: 0, rejected: [{ index: 1, reason: "state ist ungültig" }] } });
    const m = melder();
    m.melde(ereignis("a"));
    m.melde(ereignis("b"));
    m.melde(ereignis("c"));
    await m.leeren(3000);
    expect(korb()).toEqual([]);
    expect(abgelehnt()).toHaveLength(1);
    const d = JSON.parse(fs.readFileSync(path.join(ausgang, "abgelehnt", abgelehnt()[0]!), "utf8")) as { grund: string; ereignis: Ereignis };
    expect(d.grund).toBe("state ist ungültig");
    expect(d.ereignis.step).toBe("b");
  });

  it("Duplikate zählen als angenommen", async () => {
    antwort = () => ({ status: 200, body: { accepted: 0, duplicates: 1, rejected: [] } });
    const m = melder();
    m.melde(ereignis("a"));
    await m.leeren(3000);
    expect(korb()).toEqual([]);
    expect(abgelehnt()).toEqual([]);
  });

  it("eine unlesbare 200-Antwort gilt trotzdem als gesendet (der Status entscheidet)", async () => {
    srv!.removeAllListeners("request");
    srv!.on("request", (req, res) => {
      req.resume();
      req.on("end", () => {
        anfragen.push({ headers: req.headers, body: { events: [] } });
        res.writeHead(200);
        res.end("kein json");
      });
    });
    const m = melder();
    m.melde(ereignis("a"));
    await m.leeren(3000);
    expect(korb()).toEqual([]);
  });

  it("jeder andere Status (500, 502, 302) heisst: später wieder", async () => {
    for (const status of [500, 502, 302]) {
      antwort = () => ({ status });
      fs.rmSync(ausgang, { recursive: true, force: true });
      const m = melder();
      m.melde(ereignis("a"));
      await m.leeren(3000);
      expect(korb(), String(status)).toHaveLength(1);
      expect(m.stand().nichtVor, String(status)).toBeDefined();
    }
  });
});

describe("401: das Token gilt nicht mehr", () => {
  it("stoppt das Senden, meldet einmal, und nimmt weiter Ereignisse in den Korb", async () => {
    antwort = () => ({ status: 401 });
    const m = melder();
    m.melde(ereignis("a"));
    await m.leeren(3000);
    expect(anfragen).toHaveLength(1);
    expect(m.stand()).toMatchObject({ gesperrt: true, wartend: 1 });
    const h = m.hinweis();
    expect(h).toMatch(/Token wurde abgelehnt/);
    expect(h).not.toContain(GEHEIMNIS);
    expect(m.hinweis()).toBeUndefined();
    m.melde(ereignis("b"));
    await m.leeren(3000);
    expect(anfragen).toHaveLength(1);
    expect(m.hinweis()).toBeUndefined();
    expect(m.stand().wartend).toBe(2);
  });

  it("die Sperre gilt auch für den nächsten Prozess, und nach «tool verbinden» geht es weiter", async () => {
    antwort = () => ({ status: 401 });
    const m1 = melder();
    m1.melde(ereignis("a"));
    await m1.leeren(3000);
    antwort = () => ({ status: 200 });
    const m2 = melder();
    m2.melde(ereignis("b"));
    await m2.leeren(3000);
    expect(anfragen).toHaveLength(1);
    expect(m2.hinweis()).toBeUndefined();
    entsperre(ausgang);
    await m2.leeren(3000);
    expect(anfragen).toHaveLength(2);
    expect(anfragen[1]!.body.events.map((e) => e.step)).toEqual(["a", "b"]);
    expect(korb()).toEqual([]);
  });
});

describe("Korb", () => {
  it("Ereignisse über 29 Tage werden nicht mehr gesendet (das Tool lehnt sie ab), sondern aussortiert", async () => {
    const m = melder();
    m.melde({ ...ereignis("alt"), at: new Date(t - 30 * 24 * 3600_000).toISOString() });
    m.melde({ ...ereignis("knapp"), at: new Date(t - 28 * 24 * 3600_000).toISOString() });
    await m.leeren(3000);
    expect(anfragen.flatMap((a) => a.body.events.map((e) => e.step))).toEqual(["knapp"]);
    expect(abgelehnt()).toHaveLength(1);
  });

  it("eine unlesbare Datei blockiert die übrigen nicht", async () => {
    fs.mkdirSync(ausgang, { recursive: true });
    fs.writeFileSync(path.join(ausgang, "0000000000001-00001-kaputt.json"), "{nicht json");
    const m = melder();
    m.melde(ereignis("gut"));
    await m.leeren(3000);
    expect(anfragen.flatMap((a) => a.body.events.map((e) => e.step))).toEqual(["gut"]);
    expect(abgelehnt()).toHaveLength(1);
  });

  it("der Korb ist auf 5000 Dateien begrenzt: die ältesten fallen weg", async () => {
    antwort = () => ({ status: 503 });
    fs.mkdirSync(ausgang, { recursive: true });
    for (let i = 0; i < 5010; i++) fs.writeFileSync(path.join(ausgang, `${String(i).padStart(13, "0")}-00000-x${i}.json`), JSON.stringify({ id: `x${i}`, step: "s", state: "info", at: new Date(t).toISOString() }));
    const m = melder();
    m.melde(ereignis("neu"));
    await m.leeren(3000);
    expect(korb().length).toBe(5000);
    expect(korb().some((n) => n.includes("x0.json"))).toBe(false);
    expect(korb().some((n) => n.includes("x5009.json"))).toBe(true);
  });

  it("abgelehnt/ behält höchstens 100 Dateien", async () => {
    antwort = () => ({ status: 422 });
    const m = melder();
    for (let i = 0; i < 130; i++) {
      t += 1;
      m.melde(ereignis(`s${i}`));
    }
    await m.leeren(5000);
    expect(abgelehnt().length).toBe(100);
  });

  it("die Dateien im Korb haben die Rechte 0600, der Ordner 0700, und enthalten nie das Token", async () => {
    antwort = () => ({ status: 503 });
    const m = melder();
    m.melde(ereignis("a"));
    await m.leeren(3000);
    expect(fs.statSync(ausgang).mode & 0o777).toBe(0o700);
    for (const d of fs.readdirSync(ausgang)) {
      expect(fs.statSync(path.join(ausgang, d)).mode & 0o777).toBe(0o600);
      expect(fs.readFileSync(path.join(ausgang, d), "utf8")).not.toContain(GEHEIMNIS);
    }
  });
});

describe("stört nie", () => {
  it("melde() wirft nie: Korb nicht beschreibbar, ungültige Eingaben, Detail mit Kreisverweis", async () => {
    fs.writeFileSync(path.join(tmp, "datei"), "x");
    const m = melder({ ausgang: path.join(tmp, "datei", "unter-datei") });
    expect(() => m.melde(ereignis("a"))).not.toThrow();
    await expect(m.leeren(500)).resolves.toBeUndefined();
    const m2 = melder();
    expect(() => m2.melde({ step: "", state: "info" })).not.toThrow();
    expect(() => m2.melde({ step: "   ", state: "ok" })).not.toThrow();
    const kreis: Record<string, unknown> = {};
    kreis["selbst"] = kreis;
    expect(() => m2.melde({ step: "a", state: "info", detail: kreis })).not.toThrow();
    // leere Schritte erzeugen kein Ereignis, das Detail mit Kreisverweis wird gekürzt statt verworfen
    await m2.leeren(3000);
    expect(anfragen.flatMap((a) => a.body.events)).toMatchObject([{ step: "a", detail: { gekuerzt: true } }]);
  });

  it("verändert weder Ausgabe noch Exit-Code: kein Aufruf von console", async () => {
    const orig = { log: console.log, error: console.error, warn: console.warn };
    const gesehen: unknown[][] = [];
    console.log = console.error = console.warn = (...a: unknown[]) => void gesehen.push(a);
    try {
      antwort = () => ({ status: 401 });
      const m = melder();
      m.melde(ereignis("a"));
      await m.leeren(3000);
    } finally {
      Object.assign(console, orig);
    }
    expect(gesehen).toEqual([]);
  });
});

describe("baueEreignis", () => {
  const jetztD = new Date("2026-10-22T08:00:00.000Z");
  it("setzt die Zeit und füllt nur gültige Felder", () => {
    expect(baueEreignis({ step: "  whisper ", state: "ok", ms: 1234.6, code: "c-0007", span: "s", detail: { a: 1 } }, "id1", jetztD)).toEqual({ id: "id1", step: "whisper", state: "ok", at: "2026-10-22T08:00:00.000Z", span: "s", ms: 1235, code: "c-0007", detail: { a: 1 } });
  });
  it("lässt ungültigen Code, ungültigen Auftrag und ungültige Dauer weg, statt das Ereignis zu verlieren", () => {
    const e = baueEreignis({ step: "x", state: "ok", code: "C-0007", job: "kein-uuid", ms: Number.NaN }, "id1", jetztD)!;
    expect(e).toEqual({ id: "id1", step: "x", state: "ok", at: "2026-10-22T08:00:00.000Z" });
    expect(baueEreignis({ step: "x", state: "ok", ms: -5 }, "i", jetztD)!.ms).toBe(0);
    expect(baueEreignis({ step: "x", state: "info", job: ID }, "i", jetztD)!.job).toBe(ID);
  });
  it("kürzt Schritt und span auf die Grenzen des Tools", () => {
    const e = baueEreignis({ step: "s".repeat(120), state: "info", span: "p".repeat(100) }, "i", jetztD)!;
    expect(e.step).toHaveLength(80);
    expect(e.span).toHaveLength(64);
  });
  it("ein Detail über 4000 Bytes wird zu {gekuerzt: true}, auch mit Umlauten (Bytes, nicht Zeichen)", () => {
    expect(baueEreignis({ step: "x", state: "info", detail: { t: "a".repeat(5000) } }, "i", jetztD)!.detail).toEqual({ gekuerzt: true });
    expect(baueEreignis({ step: "x", state: "info", detail: { t: "ä".repeat(2100) } }, "i", jetztD)!.detail).toEqual({ gekuerzt: true });
    expect(baueEreignis({ step: "x", state: "info", detail: { t: "a".repeat(3000) } }, "i", jetztD)!.detail).toEqual({ t: "a".repeat(3000) });
  });
  it("ohne Schritt gibt es kein Ereignis; ein unbekannter Zustand wird zu «info»", () => {
    expect(baueEreignis({ step: " ", state: "ok" }, "i", jetztD)).toBeUndefined();
    expect(baueEreignis({ step: "x", state: "laeuft" as never }, "i", jetztD)!.state).toBe("info");
  });
});

describe("bereinige: keine Pfade in Fehlertexten", () => {
  it.each([
    ["ENOENT: no such file or directory, open '/Users/andrej/Library/CloudStorage/OneDrive/Studio/rohmaterial/Kunde Müller/a.mov'", "<pfad>"],
    ["Datei /Users/andrej/Studio/inhalte/c-0007/skript.md fehlt", "<pfad>"],
    ["Fehler in ~/Studio/daten/ideen.json", "<pfad>"],
    ["Cannot read C:\\Users\\andrej\\OneDrive\\Studio\\x.mov", "<pfad>"],
    ["Das Skript fehlt: /Volumes/Medien/rohmaterial/c-0007/a.mov\nSkript kopieren", "<pfad>"],
  ])("%s", (text, erwartet) => {
    const r = bereinige(text);
    expect(r).toContain(erwartet);
    expect(r).not.toMatch(/Users|andrej|Müller|Volumes|OneDrive|rohmaterial|\.mov|\.md|\.json/);
  });
  it.each([
    ["Quelle kunde-mueller/b-roll/a.mov nicht gefunden", /mueller|b-roll|\.mov/],
    ["Datei Interview.mov ist beschädigt", /Interview|\.mov/],
    ["Skript müller-offerte.md fehlt", /müller|offerte|\.md/],
    ["Pfad «/Users/x/Kunde Schmid AG/Projekt Alpen/a.wav» fehlt", /Schmid|Alpen|Users|\.wav/],
  ])("auch relative Pfade und blosse Dateinamen: %s", (text, verboten) => {
    expect(bereinige(text)).not.toMatch(verboten);
  });
  it.each([
    ["Datei ~/geheimnis-kunde-mueller fehlt", /mueller|geheimnis/],
    ["Ordner kunde-mueller/b-roll fehlt", /mueller|b-roll/],
    ["Ordner C:\\Kunde-Mueller\\Aufnahmen fehlt", /Mueller|Aufnahmen/],
  ])("einzelne Teile von Pfaden: %s", (text, verboten) => {
    expect(bereinige(text)).not.toMatch(verboten);
  });
  it("lässt gewöhnlichen Text stehen und kürzt auf 200 Zeichen", () => {
    expect(bereinige("ffmpeg beendete mit Code 1")).toBe("ffmpeg beendete mit Code 1");
    expect(bereinige("Zeit 12/13 abgelaufen")).toBe("Zeit 12/13 abgelaufen");
    expect(bereinige("Stand 3/5 Schritte")).toBe("Stand 3/5 Schritte");
    expect(bereinige("entweder A und/oder B")).toBe("entweder A <pfad> B");
    const lang = bereinige("x".repeat(500));
    expect(lang).toHaveLength(200);
    expect(lang.endsWith("…")).toBe(true);
  });
  it("fasst Zeilenumbrüche zusammen", () => {
    expect(bereinige("a\n\n  b")).toBe("a b");
  });
});

describe("Schritte der Stoppuhr", () => {
  it("Beginn, Ende und Fehler gehen mit gleicher span, Dauer und Code", async () => {
    const m = melder();
    let u = 1000;
    const uhr = stoppuhr(() => u, m.schritte("c-0007"));
    await uhr.messe("Farbe messen", async () => void (u += 4_500));
    await expect(
      uhr.messe("Stille messen", async () => {
        u += 700;
        throw new Error("ffmpeg fehlgeschlagen bei /Users/andrej/OneDrive/Kunde Meier/a.mov");
      }),
    ).rejects.toThrow();
    await m.leeren(3000);
    const e = anfragen.flatMap((a) => a.body.events);
    expect(e.map((x) => `${x.step}:${x.state}`)).toEqual(["Farbe messen:start", "Farbe messen:ok", "Stille messen:start", "Stille messen:error"]);
    expect(e[0]!.span).toBe(e[1]!.span);
    expect(e[2]!.span).toBe(e[3]!.span);
    expect(e[0]!.span).not.toBe(e[2]!.span);
    expect(e[1]!.ms).toBe(4500);
    expect(e[3]!.ms).toBe(700);
    expect(e.every((x) => x.code === "c-0007")).toBe(true);
    expect(JSON.stringify(e[3]!.detail)).not.toMatch(/Users|Meier|\.mov/);
    expect(e[3]!.detail).toEqual({ fehler: "ffmpeg fehlgeschlagen bei <pfad>" });
  });

  it("zwei Läufe benutzen nie dieselbe span", async () => {
    const a = melder();
    const b = melder();
    await stoppuhr(undefined, a.schritte()).messe("x", async () => undefined);
    await stoppuhr(undefined, b.schritte()).messe("x", async () => undefined);
    await a.leeren(3000);
    await b.leeren(3000);
    const spans = anfragen.flatMap((q) => q.body.events.map((e) => e.span));
    expect(new Set(spans).size).toBe(2);
  });
});

describe("Zeitgeber", () => {
  it("der Zeitgeber für die Sendung hält den Prozess nicht am Leben (unref)", () => {
    antwort = () => "haengt";
    const vorher = vi.spyOn(globalThis, "setTimeout");
    const m = melder({ verzoegerung: 12_345 });
    m.melde(ereignis("a"));
    const aufruf = vorher.mock.calls.findIndex((c) => c[1] === 12_345);
    expect(aufruf).toBeGreaterThanOrEqual(0);
    const timer = vorher.mock.results[aufruf]!.value as NodeJS.Timeout;
    expect(timer.hasRef()).toBe(false);
    clearTimeout(timer);
    vorher.mockRestore();
  });
});

describe("alsSchritt", () => {
  const aufzeichner = () => {
    const e: { name: string; zustand: string; ms?: number; fehler?: string; nr: number }[] = [];
    const m: Melder = { ...keinMelder, schritte: () => (x) => void e.push(x) };
    return { m, e };
  };
  let t = 1000;
  const uhr = (): number => t;

  it("meldet Beginn und Ende mit Dauer und gibt den Exit-Code unverändert zurück", async () => {
    const { m, e } = aufzeichner();
    t = 1000;
    const rc = await alsSchritt(m, "reel neu", "c-0007", async () => ((t += 2500), 0), uhr);
    expect(rc).toBe(0);
    expect(e).toEqual([
      { nr: 0, name: "reel neu", zustand: "start" },
      { nr: 0, name: "reel neu", zustand: "ok", ms: 2500 },
    ]);
  });

  it("ein Exit-Code ungleich 0 ist ein Fehler im Tool, der Code geht unverändert zurück", async () => {
    const { m, e } = aufzeichner();
    t = 0;
    expect(await alsSchritt(m, "reel messe", undefined, async () => ((t += 10), 3), uhr)).toBe(3);
    expect(e.at(-1)).toEqual({ nr: 0, name: "reel messe", zustand: "error", ms: 10, fehler: "Exit-Code 3" });
  });

  it("eine Ausnahme wird als Fehler gemeldet und unverändert weitergeworfen", async () => {
    const { m, e } = aufzeichner();
    t = 0;
    await expect(
      alsSchritt(
        m,
        "reel vorbereiten",
        "c-0007",
        async () => {
          t += 7;
          throw new Error("Das Skript fehlt");
        },
        uhr,
      ),
    ).rejects.toThrow("Das Skript fehlt");
    expect(e.at(-1)).toMatchObject({ zustand: "error", ms: 7, fehler: "Das Skript fehlt" });
  });

  it("der Befehl läuft genau einmal, ohne Melder und mit kaputtem Melder", async () => {
    for (const m of [
      undefined,
      keinMelder,
      { ...keinMelder, schritte: () => { throw new Error("kaputt"); } } as Melder,
      { ...keinMelder, schritte: () => () => { throw new Error("kaputt"); } } as Melder,
    ]) {
      let n = 0;
      expect(await alsSchritt(m, "x", "c-0007", async () => (n++, 5))).toBe(5);
      expect(n).toBe(1);
    }
    await expect(
      alsSchritt({ ...keinMelder, schritte: () => () => { throw new Error("kaputt"); } } as Melder, "x", undefined, async () => { throw new Error("echt"); }),
    ).rejects.toThrow("echt");
  });

  it("der Code des Inhalts geht an den Melder", async () => {
    let gesehen: string | undefined;
    const m: Melder = { ...keinMelder, schritte: (c) => ((gesehen = c), () => undefined) };
    await alsSchritt(m, "x", "c-0042", async () => 0);
    expect(gesehen).toBe("c-0042");
  });
});
