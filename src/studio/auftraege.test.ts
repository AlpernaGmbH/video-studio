import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseArgs } from "../args";
import { ART_NAME, auftragBefehl, hinweisFuerArt, leseAuftragsArten, leseStand, schreibeStand, standDatei, TAKT_MS, type AuftragDeps, type AuftragStand } from "./auftraege";
import type { KonfigOrt, Schluesselbund } from "./konfig";
import { ARTEN_AUFTRAG } from "./vertrag";

const GERAET = "3f8a1c2e-5b7d-4e90-8a11-0c2d4e6f8a10";
const GEHEIMNIS = "Zq3_-xK9mP2vR8sT5wY1uN7bC4dF6gH0jLaE2oIpQkM";
const TOKEN = `vsd_${GERAET}_${GEHEIMNIS}`;
const AUFTRAG = "7d1e9c3a-2b4f-4a6c-9e8d-1f2a3b4c5d6e";
const LEASE = "c4a2e6b8-0d1f-4e3a-8b5c-7d9e1f3a5b7c";
const LEASE2 = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

interface Anfrage {
  method: string;
  url: string;
  authorization?: string;
  body?: Record<string, unknown>;
}
let tmp: string;
let srv: http.Server;
let anfragen: Anfrage[];
let antwort: (a: Anfrage, nr: number) => { status: number; body?: unknown } | "abbrechen";
let url: string;
let ausgabe: string[];
let fehler: string[];
let schlaefe: number[];

const bund: Schluesselbund = { vorhanden: () => false, lies: () => undefined, schreibe: () => false, loesche: () => undefined };

const job = (over: Record<string, unknown> = {}) => ({
  id: AUFTRAG,
  kind: "reel_vorbereiten",
  target: "mac",
  content: "c-1000",
  status: "claimed",
  params: {},
  notes: "Bitte das Rohmaterial zuerst prüfen.\nDanach melden.",
  lease: LEASE,
  lease_until: "2026-10-22T10:03:00.000Z",
  attempts: 1,
  cancel_requested: false,
  ...over,
});

beforeEach(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vs-auftrag-"));
  anfragen = [];
  ausgabe = [];
  fehler = [];
  schlaefe = [];
  antwort = () => ({ status: 200, body: { job: job() } });
  srv = http.createServer((req, res) => {
    const teile: Buffer[] = [];
    req.on("data", (c: Buffer) => teile.push(c));
    req.on("end", () => {
      const roh = Buffer.concat(teile).toString("utf8");
      const a: Anfrage = { method: req.method ?? "", url: req.url ?? "", ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}), ...(roh ? { body: JSON.parse(roh) as Record<string, unknown> } : {}) };
      anfragen.push(a);
      const r = antwort(a, anfragen.length);
      if (r === "abbrechen") return void req.socket.destroy();
      res.writeHead(r.status, { "content-type": "application/json" });
      res.end(JSON.stringify(r.body ?? {}));
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

const dir = (): string => path.join(tmp, "cfg");
const ort = (verbunden = true): KonfigOrt => ({ dir: dir(), env: verbunden ? { STUDIO_TOOL_URL: url, STUDIO_TOOL_TOKEN: TOKEN } : {}, schluessel: bund });
let jetztMs = Date.parse("2026-10-22T10:00:00.000Z");
function deps(o: Partial<AuftragDeps> = {}): AuftragDeps {
  return { ort: ort(), ausgabe: (z) => ausgabe.push(z), fehler: (z) => fehler.push(z), jetzt: () => jetztMs, schlaf: async (ms) => void (schlaefe.push(ms), (jetztMs += ms)), ...o };
}
const lauf = (befehl: string, d: AuftragDeps = deps()) => {
  const teile = befehl.split(" ");
  return auftragBefehl(teile[1]!, parseArgs(teile), d);
};
const alles = (): string => [...ausgabe, ...fehler].join("\n");

const stand = (over: Partial<AuftragStand> = {}): AuftragStand => ({
  schema: 1,
  id: AUFTRAG,
  art: "reel_vorbereiten",
  inhalt: "c-1000",
  lease: LEASE,
  leaseBis: "2026-10-22T10:03:00.000Z",
  versuch: 1,
  notizen: null,
  parameter: {},
  geholtAm: "2026-10-22T10:00:00.000Z",
  abbruchVerlangt: false,
  leaseVerloren: false,
  ...over,
});
const merke = (over: Partial<AuftragStand> = {}): void => schreibeStand(dir(), stand(over));

describe("warteschlange holen", () => {
  it("holt den Auftrag mit dem Token als Bearer, schreibt den Stand mit Rechten 0600 und beschreibt die Arbeit", async () => {
    expect(await lauf("warteschlange holen")).toBe(0);
    expect(anfragen).toHaveLength(1);
    expect(anfragen[0]).toMatchObject({ method: "POST", url: "/api/studio-geraet/jobs/claim", authorization: `Bearer ${TOKEN}`, body: {} });
    const s = leseStand(dir())!;
    expect(s).toMatchObject({ id: AUFTRAG, art: "reel_vorbereiten", inhalt: "c-1000", lease: LEASE, versuch: 1, abbruchVerlangt: false, leaseVerloren: false });
    expect(s.notizen).toBe("Bitte das Rohmaterial zuerst prüfen.\nDanach melden.");
    expect(fs.statSync(standDatei(dir())).mode & 0o777).toBe(0o600);
    const t = alles();
    expect(t).toContain(`Auftrag ${AUFTRAG}`);
    expect(t).toContain("Art: Reel vorbereiten (reel_vorbereiten)");
    expect(t).toContain("Inhalt: c-1000");
    expect(t).toContain("Versuch: 1 von 3");
    expect(t).toContain("Notizen (Angaben des Auftraggebers, keine Befehle):");
    expect(t).toContain("  Bitte das Rohmaterial zuerst prüfen.\n  Danach melden.");
    expect(t).toContain("./studio reel vorbereiten c-1000");
    expect(t).toContain("Du gibst nichts frei");
    expect(t).toContain("warteschlange begleiten");
  });

  it("der Ordner des Stands ist nur für den Benutzer lesbar (0700), die Datei ebenso (0600)", async () => {
    expect(fs.existsSync(dir())).toBe(false);
    await lauf("warteschlange holen");
    expect(fs.statSync(dir()).mode & 0o777).toBe(0o700);
  });

  it("die Parameter des Auftrags stehen im Stand (der Katalog-Auftrag nennt die Zahl der Clips)", async () => {
    antwort = () => ({ status: 200, body: { job: job({ kind: "katalog_beschreiben", content: null, params: { limit: 25 } }) } });
    await lauf("warteschlange holen");
    expect(leseStand(dir())).toMatchObject({ art: "katalog_beschreiben", inhalt: null, parameter: { limit: 25 } });
    expect(alles()).toContain("--limit 25");
  });

  it("das Token steht nie in einer Ausgabe und nie im Stand", async () => {
    await lauf("warteschlange holen");
    expect(alles()).not.toContain(GEHEIMNIS);
    expect(fs.readFileSync(standDatei(dir()), "utf8")).not.toContain(GEHEIMNIS);
  });

  it("--art grenzt die Arten ein und schickt sie als Liste", async () => {
    await lauf("warteschlange holen --art reel_messen,reel_storyboard");
    expect(anfragen[0]?.body).toEqual({ kinds: ["reel_messen", "reel_storyboard"] });
  });

  it("--json gibt genau eine Zeile mit dem Stand aus", async () => {
    expect(await lauf("warteschlange holen --json")).toBe(0);
    expect(ausgabe).toHaveLength(1);
    const o = JSON.parse(ausgabe[0]!) as { stand: string; auftrag: AuftragStand };
    expect(o.stand).toBe("auftrag");
    expect(o.auftrag).toMatchObject({ id: AUFTRAG, lease: LEASE });
  });

  it("ein verlangter Abbruch steht schon beim Holen im Stand und in der Ausgabe", async () => {
    antwort = () => ({ status: 200, body: { job: job({ cancel_requested: true }) } });
    await lauf("warteschlange holen");
    expect(leseStand(dir())?.abbruchVerlangt).toBe(true);
    expect(alles()).toContain("ABBRUCH VERLANGT");
  });

  it("eine Wiederholung gibt denselben Auftrag zurück und überschreibt den Stand mit der Antwort des Tools", async () => {
    await lauf("warteschlange holen");
    antwort = () => ({ status: 200, body: { job: job({ lease: LEASE2, attempts: 2 }) } });
    await lauf("warteschlange holen");
    expect(leseStand(dir())).toMatchObject({ lease: LEASE2, versuch: 2 });
  });

  it("nichts offen: sagt es, Exit 0, kein Stand", async () => {
    antwort = () => ({ status: 200, body: { job: null } });
    expect(await lauf("warteschlange holen")).toBe(0);
    expect(alles()).toContain("Kein Auftrag offen.");
    expect(leseStand(dir())).toBeUndefined();
  });

  it("nichts offen mit --json", async () => {
    antwort = () => ({ status: 200, body: { job: null } });
    await lauf("warteschlange holen --json");
    expect(JSON.parse(ausgabe[0]!)).toEqual({ stand: "leer" });
  });

  it("--warten fragt alle 15 Sekunden neu, bis ein Auftrag kommt", async () => {
    antwort = (_a, nr) => ({ status: 200, body: { job: nr < 3 ? null : job() } });
    expect(await lauf("warteschlange holen --warten")).toBe(0);
    expect(anfragen).toHaveLength(3);
    expect(schlaefe).toEqual([15_000, 15_000]);
    expect(leseStand(dir())).toBeDefined();
  });

  it("--warten gibt nach der genannten Zeit auf", async () => {
    antwort = () => ({ status: 200, body: { job: null } });
    expect(await lauf("warteschlange holen --warten 1")).toBe(0);
    expect(anfragen.length).toBe(5);
    expect(schlaefe.reduce((a, b) => a + b, 0)).toBe(60_000);
    expect(alles()).toContain("Kein Auftrag offen.");
  });

  it("--warten ohne Zahl wartet 10 Minuten", async () => {
    antwort = () => ({ status: 200, body: { job: null } });
    await lauf("warteschlange holen --warten");
    expect(schlaefe.reduce((a, b) => a + b, 0)).toBe(600_000);
  });

  it.each([
    ["--warten 0", "warteschlange holen --warten 0"],
    ["--warten abc", "warteschlange holen --warten abc"],
    ["--warten 241", "warteschlange holen --warten 241"],
    ["--art unbekannt", "warteschlange holen --art reel_nachbau"],
    ["--art leer", "warteschlange holen --art"],
  ])("falsche Angabe (%s): Exit 2, kein Aufruf", async (_n, befehl) => {
    expect(await lauf(befehl)).toBe(2);
    expect(anfragen).toHaveLength(0);
  });

  it("ohne Verbindung: Hinweis und Exit 0 (das Tool ist freiwillig)", async () => {
    expect(await lauf("warteschlange holen", deps({ ort: ort(false) }))).toBe(0);
    expect(alles()).toContain("Nicht mit dem Tool verbunden");
    expect(anfragen).toHaveLength(0);
    ausgabe.length = 0;
    await lauf("warteschlange holen --json", deps({ ort: ort(false) }));
    expect(JSON.parse(ausgabe[0]!)).toMatchObject({ stand: "offline" });
  });

  it.each([
    ["404", { status: 404, body: { error: "Nicht gefunden." } }, "ausgeschaltet"],
    ["429", { status: 429, body: { error: "Zu viele" } }, "Geduld"],
    ["500", { status: 500 }, "nicht erreichbar"],
    ["503", { status: 503, body: { error: "x" } }, "nicht erreichbar"],
    ["422", { status: 422, body: { error: "Ungültige Daten." } }, "Ungültige Daten."],
    ["413", { status: 413, body: { error: "Die Anfrage ist zu gross." } }, "Die Anfrage ist zu gross."],
    ["unerwartete Antwort", { status: 200, body: { auftrag: 1 } }, "Unerwartete Antwort"],
  ])("Ausfall oder Ablehnung (%s): ohne Warteschlange weiter, Exit 0", async (_n, r, text) => {
    antwort = () => r;
    expect(await lauf("warteschlange holen")).toBe(0);
    expect(alles()).toContain(text);
    expect(alles()).toContain("Ohne Warteschlange weiter.");
    expect(leseStand(dir())).toBeUndefined();
  });

  it("ein Verbindungsabbruch ist ebenfalls nur ein Hinweis mit Exit 0", async () => {
    antwort = () => "abbrechen";
    expect(await lauf("warteschlange holen")).toBe(0);
    expect(alles()).toContain("nicht erreichbar");
  });

  it("ein abgelehntes Token ist ein Fehler (Exit 1): Das ist eine Einrichtung, die nicht stimmt, kein Ausfall", async () => {
    antwort = () => ({ status: 401, body: { error: "Nicht autorisiert." } });
    expect(await lauf("warteschlange holen")).toBe(1);
    expect(fehler.join("\n")).toContain("lehnt das Token ab");
    expect(leseStand(dir())).toBeUndefined();
  });

  it("ein Cloud-Gerät bekommt Exit 1 mit dem Text des Tools", async () => {
    antwort = () => ({ status: 403, body: { error: "Nur ein Mac holt Aufträge" } });
    expect(await lauf("warteschlange holen")).toBe(1);
    expect(fehler.join("\n")).toContain("kein Mac");
    expect(fehler.join("\n")).toContain("Nur ein Mac holt Aufträge");
  });

  it("Texte des Tools laufen durch die Pfadbereinigung", async () => {
    antwort = () => ({ status: 422, body: { error: "Fehler in /Users/andrej/OneDrive/Kunde Mueller/a.mov" } });
    await lauf("warteschlange holen");
    expect(alles()).not.toContain("Mueller");
    expect(alles()).not.toContain("/Users/andrej");
  });
});

describe("hinweisFuerArt", () => {
  it("jede Art nennt, womit die Arbeit beginnt, mit der Nummer des Inhalts", () => {
    for (const art of ARTEN_AUFTRAG) {
      const t = hinweisFuerArt(art, "c-1234", {});
      expect(t.length, art).toBeGreaterThan(20);
      if (art !== "katalog_beschreiben" && art !== "analyse_auswerten" && art !== "planung") expect(t, art).toContain("c-1234");
    }
  });
  it("die Befehle zu den Reel-Arten", () => {
    expect(hinweisFuerArt("reel_vorbereiten", "c-1000")).toContain("./studio reel vorbereiten c-1000");
    expect(hinweisFuerArt("reel_storyboard", "c-1000")).toContain("./studio reel storyboard c-1000");
    expect(hinweisFuerArt("reel_uebergabe", "c-1000")).toContain("./studio reel uebergabe c-1000");
    expect(hinweisFuerArt("reel_messen", "c-1000")).toContain("./studio reel messe c-1000");
  });
  it("der Katalog nennt die Zahl der Clips, sonst 10", () => {
    expect(hinweisFuerArt("katalog_beschreiben", null, { limit: 25 })).toContain("--limit 25");
    expect(hinweisFuerArt("katalog_beschreiben", null, {})).toContain("--limit 10");
    expect(hinweisFuerArt("katalog_beschreiben", null, { limit: "viele" })).toContain("--limit 10");
  });
  it("ein Textentwurf gibt nichts frei", () => {
    expect(hinweisFuerArt("text_entwurf", "c-1000")).toContain("nichts freigeben");
  });
  it("eine Cloud-Art gehört nicht auf den Mac und wird als blockiert gemeldet", () => {
    expect(hinweisFuerArt("planung", null)).toContain("blockiert");
  });
  it("jede Art hat einen Namen", () => {
    expect(Object.keys(ART_NAME).sort()).toEqual([...ARTEN_AUFTRAG].sort());
  });
});

describe("leseAuftragsArten", () => {
  it("liest eine Liste und entfernt Doppelte", () => {
    expect(leseAuftragsArten("reel_messen, reel_messen ,reel_storyboard")).toEqual(["reel_messen", "reel_storyboard"]);
  });
  it("Gross- und Kleinschreibung spielt keine Rolle", () => {
    expect(leseAuftragsArten("Reel_Messen, REEL_STORYBOARD")).toEqual(["reel_messen", "reel_storyboard"]);
  });
  it("lehnt Unbekanntes und Leeres ab", () => {
    expect(leseAuftragsArten("reel_nachbau")).toContain("Unbekannte Art");
    expect(leseAuftragsArten(" , ")).toContain("Keine Art genannt");
  });
});

describe("warteschlange begleiten", () => {
  it("ohne Auftrag endet es sofort mit Exit 0", async () => {
    expect(await lauf("warteschlange begleiten")).toBe(0);
    expect(alles()).toContain("Kein Auftrag in Arbeit");
    expect(anfragen).toHaveLength(0);
  });

  it("ohne Verbindung endet es mit Exit 0", async () => {
    merke();
    expect(await lauf("warteschlange begleiten", deps({ ort: ort(false) }))).toBe(0);
    expect(anfragen).toHaveLength(0);
  });

  it("meldet sich im Takt von 30 Sekunden mit Auftrag und Lease und verlängert den Stand", async () => {
    merke();
    antwort = () => ({ status: 200, body: { status: "running", cancel_requested: false, lease_until: "2026-10-22T10:06:00.000Z" } });
    expect(await lauf("warteschlange begleiten", deps({ maxRunden: 3 }))).toBe(0);
    expect(anfragen).toHaveLength(3);
    for (const a of anfragen) expect(a).toMatchObject({ method: "POST", url: "/api/studio-geraet/jobs/heartbeat", authorization: `Bearer ${TOKEN}`, body: { job: AUFTRAG, lease: LEASE } });
    expect(schlaefe).toEqual([TAKT_MS, TAKT_MS, TAKT_MS]);
    expect(TAKT_MS).toBe(30_000);
    expect(leseStand(dir())?.leaseBis).toBe("2026-10-22T10:06:00.000Z");
  });

  it("ein verlangter Abbruch wird einmal gemeldet und im Stand gemerkt", async () => {
    merke();
    antwort = () => ({ status: 200, body: { status: "running", cancel_requested: true, lease_until: "2026-10-22T10:06:00.000Z" } });
    await lauf("warteschlange begleiten", deps({ maxRunden: 3 }));
    expect(ausgabe.filter((z) => z.includes("ABBRUCH VERLANGT"))).toHaveLength(1);
    expect(leseStand(dir())?.abbruchVerlangt).toBe(true);
  });

  it("ein einmal verlangter Abbruch bleibt im Stand, auch wenn das Tool ihn nicht mehr nennt", async () => {
    merke({ abbruchVerlangt: true });
    antwort = () => ({ status: 200, body: { status: "running", cancel_requested: false, lease_until: "2026-10-22T10:06:00.000Z" } });
    await lauf("warteschlange begleiten", deps({ maxRunden: 1 }));
    expect(leseStand(dir())?.abbruchVerlangt).toBe(true);
  });

  it.each([409, 404])("%i: Die Lease gilt nicht mehr. Es merkt es, sagt es und endet mit Exit 3", async (status) => {
    merke();
    antwort = () => ({ status, body: { error: "Die Lease dieses Auftrags gilt nicht mehr" } });
    expect(await lauf("warteschlange begleiten", deps({ maxRunden: 5 }))).toBe(3);
    expect(anfragen).toHaveLength(1);
    expect(leseStand(dir())?.leaseVerloren).toBe(true);
    expect(alles()).toContain("LEASE VERLOREN");
  });

  it("gilt die Lease nicht mehr, während inzwischen ein anderer Auftrag geholt wurde, bleibt dessen Stand unberührt", async () => {
    merke();
    antwort = () => {
      merke({ id: "1f2e3d4c-5b6a-4978-8695-a4b3c2d1e0f9", lease: LEASE2 });
      return { status: 409, body: { error: "Die Lease dieses Auftrags gilt nicht mehr" } };
    };
    expect(await lauf("warteschlange begleiten", deps({ maxRunden: 5 }))).toBe(3);
    expect(leseStand(dir())).toMatchObject({ lease: LEASE2, leaseVerloren: false });
  });

  it("ein abgelehntes Token endet mit Exit 1", async () => {
    merke();
    antwort = () => ({ status: 401, body: { error: "Nicht autorisiert." } });
    expect(await lauf("warteschlange begleiten", deps({ maxRunden: 5 }))).toBe(1);
    expect(anfragen).toHaveLength(1);
  });

  it("422 endet mit Exit 1 und dem Text des Tools", async () => {
    merke();
    antwort = () => ({ status: 422, body: { error: "Ungültige Daten." } });
    expect(await lauf("warteschlange begleiten", deps({ maxRunden: 5 }))).toBe(1);
    expect(fehler.join("\n")).toContain("Ungültige Daten.");
  });

  it("ein Ausfall des Tools unterbricht es nicht: Es versucht es weiter, und warnt einmal, wenn die Lease abgelaufen ist", async () => {
    merke({ leaseBis: "2026-10-22T09:59:00.000Z" });
    antwort = () => ({ status: 503, body: { error: "x" } });
    expect(await lauf("warteschlange begleiten", deps({ maxRunden: 4 }))).toBe(0);
    expect(anfragen).toHaveLength(4);
    expect(ausgabe.filter((z) => z.includes("Lease ist abgelaufen"))).toHaveLength(1);
  });

  it("nach einem gelungenen Lebenszeichen warnt es bei einem neuen Ausfall mit abgelaufener Lease erneut", async () => {
    merke({ leaseBis: "2026-10-22T09:59:00.000Z" });
    antwort = (_a, nr) => (nr === 2 ? { status: 200, body: { status: "running", cancel_requested: false, lease_until: "2026-10-22T09:59:30.000Z" } } : { status: 503, body: { error: "x" } });
    expect(await lauf("warteschlange begleiten", deps({ maxRunden: 3 }))).toBe(0);
    expect(anfragen).toHaveLength(3);
    expect(ausgabe.filter((z) => z.includes("Lease ist abgelaufen"))).toHaveLength(2);
  });

  it("bei gültiger Lease schweigt es beim Ausfall", async () => {
    merke({ leaseBis: "2026-10-22T10:30:00.000Z" });
    antwort = () => "abbrechen";
    await lauf("warteschlange begleiten", deps({ maxRunden: 3 }));
    expect(ausgabe).toHaveLength(0);
  });

  it("nach dem Abschluss (Stand gelöscht) endet es mit Exit 0, ohne den Stand wieder anzulegen", async () => {
    merke();
    antwort = () => {
      fs.rmSync(standDatei(dir()), { force: true });
      return { status: 200, body: { status: "running", cancel_requested: false, lease_until: "2026-10-22T10:06:00.000Z" } };
    };
    expect(await lauf("warteschlange begleiten", deps({ maxRunden: 5 }))).toBe(0);
    expect(anfragen).toHaveLength(1);
    expect(fs.existsSync(standDatei(dir()))).toBe(false);
  });

  it("wurde inzwischen ein anderer Auftrag geholt, überschreibt es dessen Stand nicht", async () => {
    merke();
    antwort = () => {
      merke({ id: "1f2e3d4c-5b6a-4978-8695-a4b3c2d1e0f9", lease: LEASE2 });
      return { status: 200, body: { status: "running", cancel_requested: true, lease_until: "2026-10-22T10:06:00.000Z" } };
    };
    await lauf("warteschlange begleiten", deps({ maxRunden: 1 }));
    expect(leseStand(dir())).toMatchObject({ lease: LEASE2, abbruchVerlangt: false, leaseBis: "2026-10-22T10:03:00.000Z" });
  });

  it("eine unerwartete Antwort beendet es mit Exit 1 und sagt es (das Tool und dieser Rechner passen nicht zusammen)", async () => {
    merke();
    antwort = () => ({ status: 200, body: { komisch: true } });
    expect(await lauf("warteschlange begleiten", deps({ maxRunden: 2 }))).toBe(1);
    expect(anfragen).toHaveLength(1);
    expect(fehler.join("\n")).toContain("Unerwartete Antwort");
  });
});

describe("warteschlange status", () => {
  it("ohne Auftrag", async () => {
    expect(await lauf("warteschlange status")).toBe(0);
    expect(alles()).toContain("Kein Auftrag in Arbeit.");
    ausgabe.length = 0;
    await lauf("warteschlange status --json");
    expect(JSON.parse(ausgabe[0]!)).toEqual({ stand: "leer" });
  });
  it("mit Auftrag, ohne das Netz zu fragen", async () => {
    merke({ notizen: "Hinweis A", abbruchVerlangt: true });
    expect(await lauf("warteschlange status", deps({ ort: ort(false) }))).toBe(0);
    const t = alles();
    expect(t).toContain(`Auftrag ${AUFTRAG}`);
    expect(t).toContain("ABBRUCH VERLANGT");
    expect(t).toContain("Hinweis A");
    expect(anfragen).toHaveLength(0);
    ausgabe.length = 0;
    await lauf("warteschlange status --json");
    expect(JSON.parse(ausgabe[0]!)).toMatchObject({ stand: "auftrag", auftrag: { id: AUFTRAG, abbruchVerlangt: true } });
  });
  it("der Stand einer beschädigten Datei zählt als leer", async () => {
    fs.mkdirSync(dir(), { recursive: true });
    fs.writeFileSync(standDatei(dir()), "{kaputt");
    expect(leseStand(dir())).toBeUndefined();
    fs.writeFileSync(standDatei(dir()), JSON.stringify({ schema: 1, id: "x" }));
    expect(leseStand(dir())).toBeUndefined();
  });
});

describe("warteschlange fertig", () => {
  it("done: meldet den Abschluss ohne Grundangabe, löscht den Stand, Exit 0", async () => {
    merke();
    antwort = () => ({ status: 200, body: { status: "done", replayed: false } });
    expect(await lauf("warteschlange fertig")).toBe(0);
    expect(anfragen).toHaveLength(1);
    expect(anfragen[0]).toMatchObject({ method: "POST", url: "/api/studio-geraet/jobs/finish", authorization: `Bearer ${TOKEN}`, body: { job: AUFTRAG, lease: LEASE, outcome: "done" } });
    expect(anfragen[0]?.body).not.toHaveProperty("reason");
    expect(fs.existsSync(standDatei(dir()))).toBe(false);
    expect(alles()).toContain(`Auftrag ${AUFTRAG} abgeschlossen (done).`);
  });

  it("eine bestätigte Wiederholung wird gesagt", async () => {
    merke();
    antwort = () => ({ status: 200, body: { status: "done", replayed: true } });
    await lauf("warteschlange fertig");
    expect(alles()).toContain("kannte den Abschluss schon");
  });

  it.each(["failed", "blocked"])("%s braucht einen Grund aus mindestens 5 Zeichen, sonst Exit 2 ohne Aufruf", async (e) => {
    merke();
    expect(await lauf(`warteschlange fertig --ergebnis ${e}`)).toBe(2);
    expect(await lauf(`warteschlange fertig --ergebnis ${e} --grund abcd`)).toBe(2);
    expect(await lauf(`warteschlange fertig --ergebnis ${e} --grund`)).toBe(2);
    expect(anfragen).toHaveLength(0);
    expect(fs.existsSync(standDatei(dir()))).toBe(true);
  });

  it.each(["failed", "blocked"])("%s: ein Grund aus genau 5 Zeichen genügt", async (e) => {
    merke();
    antwort = () => ({ status: 200, body: { status: e, replayed: false } });
    expect(await lauf(`warteschlange fertig --ergebnis ${e} --grund abcde`)).toBe(0);
    expect(anfragen[0]?.body).toMatchObject({ outcome: e, reason: "abcde" });
  });

  it.each(["failed", "blocked"])("%s mit Grund: der Grund geht mit, Pfade und Dateinamen nicht", async (e) => {
    merke();
    antwort = () => ({ status: 200, body: { status: e, replayed: false } });
    expect(await lauf(`warteschlange fertig --ergebnis ${e} --grund /Users/andrej/OneDrive/Kunde-Mueller/a.mov_nicht_lesbar_Datei_fehlt`)).toBe(0);
    const reason = String(anfragen[0]?.body?.["reason"]);
    expect(reason.length).toBeGreaterThanOrEqual(5);
    expect(reason).not.toContain("Mueller");
    expect(reason).not.toContain("/Users");
    expect(anfragen[0]?.body).toMatchObject({ outcome: e });
  });

  it("ein Grund ohne Pfad geht unverändert (bis auf Leerraum am Rand)", async () => {
    merke();
    antwort = () => ({ status: 200, body: { status: "blocked", replayed: false } });
    await auftragBefehl("fertig", { pos: ["warteschlange", "fertig"], opt: { ergebnis: "blocked", grund: "  Es fehlt die Datei des Skripts.  " }, set: {} }, deps());
    expect(anfragen[0]?.body).toMatchObject({ reason: "Es fehlt die Datei des Skripts." });
  });

  it("der Grund wird auf 400 Zeichen gekürzt (das Tool nimmt höchstens 500)", async () => {
    merke();
    antwort = () => ({ status: 200, body: { status: "failed", replayed: false } });
    await auftragBefehl("fertig", { pos: ["warteschlange", "fertig"], opt: { ergebnis: "failed", grund: "wort ".repeat(300) }, set: {} }, deps());
    expect(String(anfragen[0]?.body?.["reason"]).length).toBeLessThanOrEqual(400);
  });

  it("cancelled gilt nur nach verlangtem Abbruch", async () => {
    merke();
    expect(await lauf("warteschlange fertig --ergebnis cancelled")).toBe(2);
    expect(anfragen).toHaveLength(0);
    merke({ abbruchVerlangt: true });
    antwort = () => ({ status: 200, body: { status: "cancelled", replayed: false } });
    expect(await lauf("warteschlange fertig --ergebnis cancelled")).toBe(0);
    expect(anfragen[0]?.body).toMatchObject({ outcome: "cancelled" });
  });

  it.each(["queued", "running", "fertig", ""])("unbekanntes Ergebnis «%s»: Exit 2", async (e) => {
    merke();
    expect(await auftragBefehl("fertig", { pos: ["warteschlange", "fertig"], opt: { ergebnis: e }, set: {} }, deps())).toBe(2);
    expect(await lauf("warteschlange fertig --ergebnis")).toBe(2);
    expect(anfragen).toHaveLength(0);
  });

  it("ohne Auftrag in Arbeit: Exit 1", async () => {
    expect(await lauf("warteschlange fertig")).toBe(1);
    expect(fehler.join("\n")).toContain("Kein Auftrag in Arbeit");
    expect(anfragen).toHaveLength(0);
  });

  it("ohne Verbindung: Exit 1, der Auftrag bleibt gemerkt", async () => {
    merke();
    expect(await lauf("warteschlange fertig", deps({ ort: ort(false) }))).toBe(1);
    expect(fs.existsSync(standDatei(dir()))).toBe(true);
  });

  it.each([409, 404])("%i: Die Lease gilt nicht mehr. Der Auftrag wird hier vergessen, Exit 1", async (status) => {
    merke();
    antwort = () => ({ status, body: { error: "Die Lease dieses Auftrags gilt nicht mehr" } });
    expect(await lauf("warteschlange fertig")).toBe(1);
    expect(fs.existsSync(standDatei(dir()))).toBe(false);
    expect(fehler.join("\n")).toContain("kennt diesen Anspruch nicht mehr");
  });

  it("401 und 422: Exit 1, der Auftrag bleibt gemerkt, kein zweiter Versuch", async () => {
    for (const status of [401, 422, 403]) {
      merke();
      anfragen.length = 0;
      antwort = () => ({ status, body: { error: "Text" } });
      expect(await lauf("warteschlange fertig"), String(status)).toBe(1);
      expect(anfragen, String(status)).toHaveLength(1);
      expect(fs.existsSync(standDatei(dir())), String(status)).toBe(true);
    }
  });

  it("ein Ausfall wird zweimal wiederholt (nach 2 und 5 Sekunden), danach bleibt der Auftrag gemerkt", async () => {
    merke();
    antwort = () => ({ status: 503, body: { error: "x" } });
    expect(await lauf("warteschlange fertig")).toBe(1);
    expect(anfragen).toHaveLength(3);
    expect(schlaefe).toEqual([2000, 5000]);
    expect(fs.existsSync(standDatei(dir()))).toBe(true);
    expect(fehler.join("\n")).toContain("Der Abschluss kam nicht an");
  });

  it("gelingt ein späterer Versuch, ist der Auftrag abgeschlossen", async () => {
    merke();
    antwort = (_a, nr) => (nr === 1 ? "abbrechen" : { status: 200, body: { status: "done", replayed: false } });
    expect(await lauf("warteschlange fertig")).toBe(0);
    expect(anfragen).toHaveLength(2);
    expect(schlaefe).toEqual([2000]);
    expect(fs.existsSync(standDatei(dir()))).toBe(false);
  });

  it("429 wird wie ein Ausfall wiederholt", async () => {
    merke();
    antwort = (_a, nr) => (nr === 1 ? { status: 429, body: { error: "Zu viele" } } : { status: 200, body: { status: "done", replayed: false } });
    expect(await lauf("warteschlange fertig")).toBe(0);
    expect(anfragen).toHaveLength(2);
  });
});

describe("Unbekannte Befehle", () => {
  it("nennen die Hilfe", async () => {
    expect(await lauf("warteschlange vergessen")).toBe(2);
    expect(fehler.join("\n")).toContain("warteschlange holen");
  });
});
