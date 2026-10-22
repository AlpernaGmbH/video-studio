import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseArgs } from "../args";
import { frageTokenStandard, pruefeVerbindung, toolBefehl, type ToolDeps } from "./befehle";
import { ladeToolKonfig, toolDatei, type KonfigOrt, type Schluesselbund } from "./konfig";
import { entsperre } from "./melder";

const ID = "3f8a1c2e-5b7d-4e90-8a11-0c2d4e6f8a10";
const GEHEIMNIS = "Zq3_-xK9mP2vR8sT5wY1uN7bC4dF6gH0jLaE2oIpQkM";
const TOKEN = `vsd_${ID}_${GEHEIMNIS}`;

interface Anfrage {
  method: string;
  url: string;
  authorization?: string;
  body?: { events: { step: string; state: string; code?: string; detail?: Record<string, unknown> }[] } & Record<string, unknown>;
}
/** Der Hochlade-Test schickt auch Bytes, die kein JSON sind (die Datei selbst). */
function jsonOderNichts(roh: string): unknown {
  try {
    return JSON.parse(roh);
  } catch {
    return undefined;
  }
}
let tmp: string;
let srv: http.Server;
let anfragen: Anfrage[];
let antwort: (a: Anfrage) => { status: number; body?: unknown };
let url: string;
let ausgabe: string[];
let fehler: string[];
let bund: Schluesselbund & { inhalt: () => string | undefined };

beforeEach(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vs-tool-"));
  anfragen = [];
  antwort = () => ({ status: 200 });
  ausgabe = [];
  fehler = [];
  let t: string | undefined;
  bund = { vorhanden: () => t !== undefined, lies: () => t, schreibe: (x) => ((t = x), true), loesche: () => void (t = undefined), inhalt: () => t };
  srv = http.createServer((req, res) => {
    const teile: Buffer[] = [];
    req.on("data", (c: Buffer) => teile.push(c));
    req.on("end", () => {
      const roh = Buffer.concat(teile).toString("utf8");
      const a: Anfrage = { method: req.method ?? "", url: req.url ?? "", ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}), ...(roh && jsonOderNichts(roh) ? { body: jsonOderNichts(roh) as Anfrage["body"] } : {}) };
      anfragen.push(a);
      const r = antwort(a);
      res.writeHead(r.status, { "content-type": "application/json" });
      res.end(JSON.stringify(r.body ?? { accepted: a.body?.events?.length ?? 0, duplicates: 0, rejected: [] }));
    });
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
});
afterEach(async () => {
  srv.closeAllConnections();
  await new Promise<void>((r) => srv.close(() => r()));
  fs.rmSync(tmp, { recursive: true, force: true });
});

const ort = (): KonfigOrt => ({ dir: path.join(tmp, "cfg"), env: {}, schluessel: bund });
const ausgang = (): string => path.join(tmp, "cfg", "ausgang");
function deps(o: Partial<ToolDeps> = {}): ToolDeps {
  return { ort: ort(), ausgang: ausgang(), ausgabe: (z) => ausgabe.push(z), fehler: (z) => fehler.push(z), lesStdin: async () => `${TOKEN}\n`, ...o };
}
const lauf = (befehl: string, d: ToolDeps = deps()) => toolBefehl(befehl.split(" ")[1]!, parseArgs(befehl.split(" ")), d);
const alles = (): string => [...ausgabe, ...fehler].join("\n");

describe("tool verbinden", () => {
  it("prüft die Verbindung, legt das Token in den Schlüsselbund und gibt es nie aus", async () => {
    expect(await lauf(`tool verbinden ${url} --token-stdin`)).toBe(0);
    expect(anfragen).toHaveLength(1);
    expect(anfragen[0]).toMatchObject({ method: "POST", url: "/api/studio-geraet/events", authorization: `Bearer ${TOKEN}` });
    expect(anfragen[0]!.body!.events[0]).toMatchObject({ step: "Verbindung", state: "info" });
    expect(bund.inhalt()).toBe(TOKEN);
    expect(ladeToolKonfig(ort()).konfig).toEqual({ url, token: TOKEN });
    expect(alles()).toContain("nimmt das Token an");
    expect(alles()).toContain("3f8a1c2e");
    expect(alles()).not.toContain(GEHEIMNIS);
    expect(fs.readFileSync(toolDatei(ort()), "utf8")).not.toContain(GEHEIMNIS);
  });

  it("das Tool lehnt das Token ab (401): nichts wird gespeichert, Exit-Code 1", async () => {
    antwort = () => ({ status: 401 });
    expect(await lauf(`tool verbinden ${url} --token-stdin`)).toBe(1);
    expect(fs.existsSync(toolDatei(ort()))).toBe(false);
    expect(bund.inhalt()).toBeUndefined();
    expect(alles()).toMatch(/lehnt das Token ab/);
    expect(alles()).toMatch(/Nichts wurde gespeichert/);
    expect(alles()).not.toContain(GEHEIMNIS);
  });

  it("das Studio ist im Tool ausgeschaltet (404): gespeichert, mit klarem Hinweis", async () => {
    antwort = () => ({ status: 404 });
    expect(await lauf(`tool verbinden ${url} --token-stdin`)).toBe(0);
    expect(alles()).toMatch(/ausgeschaltet/);
    expect(ladeToolKonfig(ort()).konfig?.url).toBe(url);
  });

  it("das Tool ist nicht erreichbar: gespeichert, Hinweis, Exit-Code 0", async () => {
    srv.closeAllConnections();
    await new Promise<void>((r) => srv.close(() => r()));
    expect(await lauf(`tool verbinden ${url} --token-stdin`)).toBe(0);
    expect(alles()).toMatch(/nicht erreichbar/);
    expect(ladeToolKonfig(ort()).konfig).toBeDefined();
    // der Server muss für afterEach wieder da sein
    srv = http.createServer();
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  });

  it("hebt eine Sperre nach 401 auf", async () => {
    fs.mkdirSync(ausgang(), { recursive: true });
    fs.writeFileSync(path.join(ausgang(), "zustand.json"), JSON.stringify({ gesperrt: { seit: "x" } }));
    await lauf(`tool verbinden ${url} --token-stdin`);
    expect(fs.existsSync(path.join(ausgang(), "zustand.json"))).toBe(false);
  });

  it.each([
    ["ohne Adresse", "tool verbinden --token-stdin"],
    ["mit Adresse ohne https", "tool verbinden http://alperna-tool.vercel.app --token-stdin"],
    ["mit Müll als Adresse", "tool verbinden kein-url --token-stdin"],
  ])("%s: Exit-Code 2, nichts gespeichert, kein Netzaufruf", async (_n, befehl) => {
    expect(await lauf(befehl)).toBe(2);
    expect(fs.existsSync(toolDatei(ort()))).toBe(false);
    expect(anfragen).toHaveLength(0);
  });

  it("ein Token in falscher Form wird abgewiesen, ohne es im Fehler zu nennen", async () => {
    const falsch = "vsd_irgendwas_zu-kurz";
    expect(await lauf(`tool verbinden ${url} --token-stdin`, deps({ lesStdin: async () => falsch }))).toBe(2);
    expect(alles()).not.toContain(falsch);
    expect(anfragen).toHaveLength(0);
    expect(fs.existsSync(toolDatei(ort()))).toBe(false);
  });

  it("ohne --token-stdin wird unsichtbar gefragt; ohne Terminal ist das ein Fehler mit Hinweis", async () => {
    expect(await lauf(`tool verbinden ${url}`, deps({ frageToken: async () => TOKEN }))).toBe(0);
    expect(bund.inhalt()).toBe(TOKEN);
    fs.rmSync(path.join(tmp, "cfg"), { recursive: true, force: true });
    const d = deps({ frageToken: () => Promise.reject(new Error("Kein Terminal: das Token mit --token-stdin übergeben")) });
    expect(await lauf(`tool verbinden ${url}`, d)).toBe(2);
    expect(fehler.join("\n")).toMatch(/--token-stdin/);
  });

  it("die Standardabfrage verlangt ein Terminal", async () => {
    const tty = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
    try {
      await expect(frageTokenStandard()).rejects.toThrow(/Kein Terminal/);
    } finally {
      Object.defineProperty(process.stdin, "isTTY", { value: tty, configurable: true });
    }
  });
});

describe("pruefeVerbindung", () => {
  const k = () => ({ url, token: TOKEN });
  it.each([
    [200, "ok"],
    [401, "abgelehnt"],
    [404, "aus"],
    [503, "nicht-erreichbar"],
    [429, "nicht-erreichbar"],
    [500, "nicht-erreichbar"],
  ] as const)("Status %i heisst «%s»", async (status, art) => {
    antwort = () => ({ status });
    expect((await pruefeVerbindung(k())).art).toBe(art);
  });
  it("ein Netzfehler heisst «nicht erreichbar», ohne Wurf", async () => {
    expect(await pruefeVerbindung({ url: "http://127.0.0.1:1", token: TOKEN })).toEqual({ art: "nicht-erreichbar" });
  });
});

describe("tool status, senden, trennen", () => {
  it("status ohne Verbindung: freundlicher Hinweis, Exit-Code 0", async () => {
    expect(await lauf("tool status")).toBe(0);
    expect(alles()).toMatch(/Nicht mit dem Tool verbunden/);
  });

  it("status mit Verbindung: Adresse, Geräte-ID, Zähler, nie das Token", async () => {
    await lauf(`tool verbinden ${url} --token-stdin`);
    ausgabe.length = 0;
    fs.mkdirSync(ausgang(), { recursive: true });
    fs.writeFileSync(path.join(ausgang(), "0000000000001-00001-a.json"), "{}");
    expect(await lauf("tool status")).toBe(0);
    expect(alles()).toContain(url);
    expect(alles()).toMatch(/1 warten, 0 abgelehnt/);
    expect(alles()).not.toContain(GEHEIMNIS);
  });

  it("senden leert den Korb und hebt eine Wartezeit auf", async () => {
    await lauf(`tool verbinden ${url} --token-stdin`);
    anfragen.length = 0;
    ausgabe.length = 0;
    fs.mkdirSync(ausgang(), { recursive: true });
    fs.writeFileSync(path.join(ausgang(), "0000000000001-00001-a.json"), JSON.stringify({ id: "a", step: "x", state: "info", at: new Date().toISOString() }));
    fs.writeFileSync(path.join(ausgang(), "zustand.json"), JSON.stringify({ nichtVor: Date.now() + 3_600_000, fehlversuche: 5 }));
    expect(await lauf("tool senden")).toBe(0);
    expect(anfragen).toHaveLength(1);
    expect(alles()).toMatch(/Ausgangskorb ist leer/);
  });

  it("senden bei nicht erreichbarem Tool: Exit-Code 1, die Ereignisse bleiben", async () => {
    await lauf(`tool verbinden ${url} --token-stdin`);
    antwort = () => ({ status: 503 });
    fs.mkdirSync(ausgang(), { recursive: true });
    fs.writeFileSync(path.join(ausgang(), "0000000000001-00001-a.json"), JSON.stringify({ id: "a", step: "x", state: "info", at: new Date().toISOString() }));
    expect(await lauf("tool senden")).toBe(1);
    expect(fs.readdirSync(ausgang()).filter((n) => n.endsWith("-a.json"))).toHaveLength(1);
  });

  it("senden nach 401: meldet den Grund, Exit-Code 1", async () => {
    await lauf(`tool verbinden ${url} --token-stdin`);
    antwort = () => ({ status: 401 });
    fs.mkdirSync(ausgang(), { recursive: true });
    fs.writeFileSync(path.join(ausgang(), "0000000000001-00001-a.json"), JSON.stringify({ id: "a", step: "x", state: "info", at: new Date().toISOString() }));
    fehler.length = 0;
    expect(await lauf("tool senden")).toBe(1);
    expect(fehler.join("\n")).toMatch(/Token wurde abgelehnt/);
    entsperre(ausgang());
  });

  it("senden ohne Verbindung: Exit-Code 1", async () => {
    expect(await lauf("tool senden")).toBe(1);
  });

  it("trennen löscht Token und Adresse, der Korb bleibt", async () => {
    await lauf(`tool verbinden ${url} --token-stdin`);
    fs.mkdirSync(ausgang(), { recursive: true });
    fs.writeFileSync(path.join(ausgang(), "0000000000001-00001-a.json"), "{}");
    expect(await lauf("tool trennen")).toBe(0);
    expect(ladeToolKonfig(ort())).toEqual({});
    expect(bund.inhalt()).toBeUndefined();
    expect(fs.existsSync(path.join(ausgang(), "0000000000001-00001-a.json"))).toBe(true);
  });

  it("ein unbekannter Befehl gibt Exit-Code 2 und die Hilfe", async () => {
    expect(await lauf("tool unsinn")).toBe(2);
    expect(fehler.join("\n")).toMatch(/tool verbinden/);
  });
});

describe("tool sync", () => {
  let home: { pfad: string; quelle: "STUDIO_HOME" };
  beforeEach(async () => {
    home = { pfad: path.join(tmp, "Studio Müller"), quelle: "STUDIO_HOME" };
    fs.mkdirSync(path.join(home.pfad, "inhalte", "c-0007"), { recursive: true });
    fs.writeFileSync(path.join(home.pfad, "inhalte", "c-0007", "skript.md"), "# Skript");
    await lauf(`tool verbinden ${url} --token-stdin`);
    anfragen.length = 0;
    ausgabe.length = 0;
  });

  it("liest den Stand im Tool und meldet den Stand dieses Rechners, nur als Ja und Nein und Zahlen, nie mit Pfaden", async () => {
    antwort = (a) => (a.method === "GET" ? { status: 200, body: { code: "c-0007", status: "in_production", tor_i: "approved", tor_p: "open", version: 2, preview_allowed: false, archived: false } } : { status: 200 });
    expect(await lauf("tool sync c-0007", deps({ home }))).toBe(0);
    expect(anfragen[0]).toMatchObject({ method: "GET", url: "/api/studio-geraet/contents/c-0007", authorization: `Bearer ${TOKEN}` });
    expect(alles()).toMatch(/Skript ja/);
    expect(alles()).toMatch(/Status in_production, Tor I approved, Tor P open, Fassung 2, Vorschau nicht erlaubt/);
    const post = anfragen.find((a) => a.method === "POST")!;
    expect(post.body!.events[0]).toMatchObject({ step: "Stand", state: "info", code: "c-0007", detail: { skript: true, aufnahmen: 0, plan: false } });
    expect(JSON.stringify(post.body)).not.toMatch(/Müller|Studio|tmp|\//);
    expect(alles()).toMatch(/ist gemeldet/);
  });

  it("ein im Tool unbekannter Inhalt ist keine Fehlermeldung, und der Stand wird trotzdem gemeldet", async () => {
    antwort = (a) => (a.method === "GET" ? { status: 404 } : { status: 200 });
    expect(await lauf("tool sync c-0007", deps({ home }))).toBe(0);
    expect(alles()).toMatch(/nicht bekannt/);
    expect(anfragen.some((a) => a.method === "POST")).toBe(true);
  });

  it("401: Exit-Code 1 und kein Stand gemeldet", async () => {
    antwort = () => ({ status: 401 });
    expect(await lauf("tool sync c-0007", deps({ home }))).toBe(1);
    expect(anfragen.some((a) => a.method === "POST")).toBe(false);
    expect(fehler.join("\n")).toMatch(/lehnt das Token ab/);
  });

  it.each([
    ["ohne ID", "tool sync", 2],
    ["mit ungültiger ID", "tool sync c-7", 2],
    ["mit Pfad statt ID", "tool sync ../c-0007", 2],
  ])("%s: Exit-Code %i, kein Netzaufruf", async (_n, befehl, code) => {
    expect(await lauf(befehl, deps({ home }))).toBe(code);
    expect(anfragen).toHaveLength(0);
  });

  it("ohne eingerichteten Studio-Ordner oder ohne Verbindung: Exit-Code 1", async () => {
    expect(await lauf("tool sync c-0007", deps())).toBe(1);
    expect(fehler.join("\n")).toMatch(/init/);
    fehler.length = 0;
    expect(await lauf("tool sync c-0007", deps({ home, ort: { ...ort(), dir: path.join(tmp, "leer"), schluessel: { ...bund, lies: () => undefined } } }))).toBe(1);
    expect(fehler.join("\n")).toMatch(/Nicht mit dem Tool verbunden/);
  });

  it("ein Netzfehler beim Lesen: Exit-Code 1 mit Hinweis, kein Wurf", async () => {
    srv.closeAllConnections();
    await new Promise<void>((r) => srv.close(() => r()));
    expect(await lauf("tool sync c-0007", deps({ home }))).toBe(1);
    expect(fehler.join("\n")).toMatch(/nicht erreichbar/);
    srv = http.createServer();
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  });
});

describe("tool inhalt neu", () => {
  beforeEach(async () => {
    await lauf(`tool verbinden ${url} --token-stdin`);
    anfragen.length = 0;
    ausgabe.length = 0;
  });

  it("legt einen Inhalt an, nennt den Code und den nächsten Schritt, und sagt, dass Freigeben ein Mensch tut", async () => {
    antwort = () => ({ status: 201, body: { code: "c-1000", created: true } });
    expect(await lauf(`tool inhalt neu Küche-Gossau --medium reel --marke alperna --funnel awareness --absicht Vertrauen --typ erklaerung --muster mythos`)).toBe(0);
    expect(anfragen).toHaveLength(1);
    expect(anfragen[0]).toMatchObject({ method: "POST", url: "/api/studio-geraet/contents", authorization: `Bearer ${TOKEN}` });
    expect(anfragen[0]!.body).toEqual({ title: "Küche-Gossau", medium: "reel", brand: "alperna", funnel: "awareness", intent: "Vertrauen", content_type: "erklaerung", pattern: "mythos" });
    expect(alles()).toContain("Angelegt: c-1000");
    expect(alles()).toContain("Freigeben kann nur ein Mensch");
    expect(alles()).toContain("./studio reel neu c-1000 --marke alperna --zwischenablage");
  });

  it("sendet nur, was angegeben ist, und nie Status, Tore oder Fassung", async () => {
    antwort = () => ({ status: 201, body: { code: "c-1001", created: true } });
    await lauf("tool inhalt neu Nur-Titel");
    expect(anfragen[0]!.body).toEqual({ title: "Nur-Titel" });
    expect(JSON.stringify(anfragen[0]!.body)).not.toMatch(/status|tor_|version|archived|preview/);
  });

  it("der Titel darf Leerzeichen haben, wenn er als ein Argument kommt", async () => {
    antwort = () => ({ status: 201, body: { code: "c-1002", created: true } });
    const a = parseArgs(["tool", "inhalt", "neu", "Küche in Gossau"]);
    expect(await toolBefehl("inhalt", a, deps())).toBe(0);
    expect(anfragen[0]!.body?.["title"]).toBe("Küche in Gossau");
  });

  it.each([
    ["ohne Titel", "tool inhalt neu", 2],
    ["mit unbekanntem Medium", "tool inhalt neu Titel --medium podcast", 2],
    ["mit unbekannter Unterfunktion", "tool inhalt loeschen c-1000", 2],
  ])("%s: Exit-Code %i, kein Netzaufruf", async (_n, befehl, rc) => {
    expect(await lauf(befehl)).toBe(rc);
    expect(anfragen).toHaveLength(0);
  });

  it("das Tool lehnt ab (422): die Gründe stehen in der Ausgabe", async () => {
    antwort = () => ({ status: 422, body: { error: "Ungültige Daten.", issues: [{ path: "brand", message: "Invalid" }] } });
    expect(await lauf("tool inhalt neu Titel --marke Alperna-Gross")).toBe(1);
    expect(alles()).toMatch(/brand: Invalid/);
  });

  it.each([
    [401, /lehnt das Token ab/],
    [404, /ausgeschaltet/],
    [503, /antwortete 503/],
  ])("Status %i: Exit-Code 1 mit Grund", async (status, muster) => {
    antwort = () => ({ status });
    expect(await lauf("tool inhalt neu Titel")).toBe(1);
    expect(alles()).toMatch(muster);
  });

  it("ohne Verbindung: Exit-Code 1", async () => {
    expect(await lauf("tool inhalt neu Titel", deps({ ort: { ...ort(), dir: path.join(tmp, "leer"), schluessel: { ...bund, lies: () => undefined } } }))).toBe(1);
    expect(anfragen).toHaveLength(0);
  });

  it("das Tool ist nicht erreichbar: Exit-Code 1, kein Wurf", async () => {
    srv.closeAllConnections();
    await new Promise<void>((r) => srv.close(() => r()));
    expect(await lauf("tool inhalt neu Titel")).toBe(1);
    expect(alles()).toMatch(/nicht erreichbar/);
    srv = http.createServer();
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  });
});

describe("tool hochladen", () => {
  const quellen = { bereit: async (art: string) => ({ bytes: Buffer.from(`inhalt-${art}`) }) };
  const vorlauf = async (): Promise<void> => {
    expect(await lauf(`tool verbinden ${url} --token-stdin`)).toBe(0);
    anfragen.length = 0;
  };
  const home = (): ToolDeps["home"] => ({ pfad: path.join(tmp, "Studio"), quelle: "STUDIO_HOME" });
  const mitQuellen = (o: Partial<ToolDeps> = {}): ToolDeps => deps({ home: home(), quellen: () => quellen, ...o });

  it("lädt über die Geräte-API hoch und meldet das Ergebnis als Ereignis «Hochladen»", async () => {
    await vorlauf();
    const gesehen: string[] = [];
    antwort = (a) => {
      gesehen.push(`${a.method} ${a.url}`);
      if (a.method === "GET") return { status: 200, body: { version: 2, preview_allowed: true } };
      if (a.url.endsWith("/target")) return { status: 200, body: { path: "p", uploadUrl: `${url}/speicher/x?token=t`, method: "PUT", headers: { apikey: "a" } } };
      if (a.url.endsWith("/register")) return { status: 201, body: { id: "1" } };
      return { status: 200 };
    };
    expect(await lauf(`tool hochladen c-1000 --art qualitaet`, mitQuellen())).toBe(0);
    expect(gesehen.slice(0, 4)).toEqual(["GET /api/studio-geraet/contents/c-1000", "POST /api/studio-geraet/artifacts/target", expect.stringContaining("PUT /speicher/x"), "POST /api/studio-geraet/artifacts/register"]);
    expect(alles()).toContain("Messwerte: hochgeladen");
    const ereignis = anfragen.flatMap((x) => x.body?.events ?? []).find((e) => e.step === "Hochladen");
    expect(ereignis).toMatchObject({ state: "ok", code: "c-1000", detail: { hochgeladen: ["qualitaet"], fehlgeschlagen: [] } });
    expect(alles()).not.toContain(GEHEIMNIS);
    expect(alles()).not.toContain("token=t");
  });

  it.each([
    ["ohne ID", "tool hochladen", 2],
    ["ungültige ID", "tool hochladen ../etc", 2],
    ["unbekannte Art", "tool hochladen c-1000 --art video", 2],
    ["nicht erlaubte Art", "tool hochladen c-1000 --art plan", 2],
    ["--art ohne Liste", "tool hochladen c-1000 --art", 2],
  ])("%s: Hinweis, Exit-Code %i, keine Anfrage", async (_n, befehl, code) => {
    await vorlauf();
    expect(await lauf(befehl, mitQuellen())).toBe(code);
    expect(anfragen).toHaveLength(0);
    expect(fehler.length).toBeGreaterThan(0);
  });

  it("ohne Studio-Ordner oder ohne Verbindung: Hinweis und Exit-Code 1", async () => {
    expect(await lauf("tool hochladen c-1000", deps({ quellen: () => quellen }))).toBe(1);
    expect(fehler.join("\n")).toContain("./studio init");
    fehler.length = 0;
    expect(await lauf("tool hochladen c-1000", mitQuellen())).toBe(1);
    expect(alles()).toMatch(/Nicht mit dem Tool verbunden/);
    expect(anfragen).toHaveLength(0);
  });

  it("der Hilfetext nennt den Befehl", async () => {
    const { TOOL_HILFE } = await import("./befehle");
    expect(TOOL_HILFE).toContain("tool hochladen <ID>");
    expect(TOOL_HILFE).toMatch(/Plan, Storyboard und Auftrag gehen nie hoch/);
  });
});
