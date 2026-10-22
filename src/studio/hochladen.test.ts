import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ALLE_ARTEN, ARTEN, bereinigeQualitaet, hochladen, ladeDateiHoch, leseArten, type Art, type ArtErgebnis, type HochladenEingabe, type Quellen } from "./hochladen";
import type { ToolKonfig } from "./konfig";
import { DateiEintragenSchema, DateiVorbereitenSchema } from "./vertrag";

const vertrag = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "../../docs/studio/vertrag.json"), "utf8")) as {
  artifacts: {
    arten: Record<string, { mime: string; max_bytes: number; schalter: boolean }>;
    target: { gueltig: { name: string; body: unknown }[]; ungueltig: { name: string; body: unknown }[]; antwort: { headers: Record<string, string> } };
    register: { gueltig: { name: string; body: unknown }[]; ungueltig: { name: string; body: unknown }[] };
    qualitaet: { roh: unknown; bereinigt: unknown };
  };
};

const TOKEN = `vsd_3f8a1c2e-5b7d-4e90-8a11-0c2d4e6f8a10_${"Zq3_-xK9mP2vR8sT5wY1uN7bC4dF6gH0jLaE2oIpQkM"}`;
const GEHEIMNIS = "Zq3_-xK9mP2vR8sT5wY1uN7bC4dF6gH0jLaE2oIpQkM";
const ID = "c-1000";

interface Gesehen {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}
let srv: http.Server;
let basis: string;
let gesehen: Gesehen[];
/** Antworten der Gegenstelle; pro Pfad überschreibbar. */
let antworten: Record<string, (g: Gesehen) => { status: number; body?: unknown } | "abbruch">;
let uploadAntwort: { headers?: Record<string, string>; urlRoh?: string };

const standard: typeof antworten = {
  "GET /api/studio-geraet/contents/c-1000": () => ({ status: 200, body: { code: ID, version: 3, preview_allowed: true } }),
  "POST /api/studio-geraet/artifacts/target": (g) => {
    const b = JSON.parse(g.body.toString("utf8")) as { kind: string; version: number };
    return {
      status: 200,
      body: {
        path: `studio/x/${b.kind}-${b.version}`,
        uploadUrl: uploadAntwort.urlRoh ?? `${basis}/speicher/${b.kind}-${b.version}?token=GEHEIMER-LINK`,
        method: "PUT",
        headers: uploadAntwort.headers ?? { apikey: "oeffentlich", "content-type": "text/html", "cache-control": "max-age=3600", "x-upsert": "true" },
        maxBytes: 1,
        expiresInSeconds: 7200,
      },
    };
  },
  "PUT /speicher": () => ({ status: 200, body: { Key: "x" } }),
  "POST /api/studio-geraet/artifacts/register": () => ({ status: 201, body: { id: "a1", path: "p", size: 1 } }),
};

beforeEach(async () => {
  gesehen = [];
  antworten = { ...standard };
  uploadAntwort = {};
  srv = http.createServer((req, res) => {
    const teile: Buffer[] = [];
    req.on("data", (c: Buffer) => teile.push(c));
    req.on("end", () => {
      const g: Gesehen = { method: req.method ?? "", url: req.url ?? "", headers: req.headers, body: Buffer.concat(teile) };
      gesehen.push(g);
      const pfad = g.url.split("?")[0]!;
      const schluessel = g.url.startsWith("/speicher/") ? "PUT /speicher" : `${g.method} ${pfad}`;
      const r = (antworten[schluessel] ?? ((): { status: number; body?: unknown } => ({ status: 500 })))(g);
      if (r === "abbruch") return req.socket.destroy();
      res.writeHead(r.status, { "content-type": "application/json" });
      res.end(JSON.stringify(r.body ?? {}));
    });
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  basis = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
});
afterEach(async () => {
  srv.closeAllConnections();
  await new Promise<void>((r) => srv.close(() => r()));
});

const konfig = (): ToolKonfig => ({ url: basis, token: TOKEN });
const bytesVon = (art: Art): Buffer => Buffer.from(`inhalt-${art}`);
const quellenAlle: Quellen = { bereit: async (art) => ({ bytes: bytesVon(art) }) };

function eingabe(o: Partial<HochladenEingabe> = {}): { e: HochladenEingabe; aus: string[]; fehl: string[]; melde: { state: string; detail: Record<string, unknown> }[] } {
  const aus: string[] = [];
  const fehl: string[] = [];
  const melde: { state: string; detail: Record<string, unknown> }[] = [];
  const e: HochladenEingabe = { id: ID, konfig: konfig(), fetch, quellen: quellenAlle, aus: (z) => aus.push(z), fehl: (z) => fehl.push(z), melde: (m) => melde.push(m), zeitlimits: { api: 3000, upload: 5000 }, ...o };
  return { e, aus, fehl, melde };
}
const anfragenAn = (pfad: string): Gesehen[] => gesehen.filter((g) => g.url.startsWith(pfad));

describe("Arten und Vertrag", () => {
  it("die Arten, Typen und Grenzen sind die des Vertrags mit dem Tool", () => {
    for (const art of ALLE_ARTEN) {
      expect(vertrag.artifacts.arten[art], art).toEqual({ mime: ARTEN[art].mime, max_bytes: ARTEN[art].maxBytes, schalter: ARTEN[art].schalter });
    }
  });

  it("nur die Arten, die ohne Pfade auskommen, gehen ans Tool", () => {
    expect([...ALLE_ARTEN].sort()).toEqual(["gegenlesen", "kontaktbogen", "qualitaet", "vorschau"]);
    for (const nie of ["plan", "storyboard", "auftrag"]) expect(ALLE_ARTEN as readonly string[]).not.toContain(nie);
  });

  it.each(vertrag.artifacts.target.gueltig)("Vorbereiten gültig: $name", ({ body }) => {
    expect(DateiVorbereitenSchema.safeParse(body).success).toBe(true);
  });
  it.each(vertrag.artifacts.target.ungueltig)("Vorbereiten ungültig: $name", ({ body }) => {
    expect(DateiVorbereitenSchema.safeParse(body).success).toBe(false);
  });
  it.each(vertrag.artifacts.register.gueltig)("Eintragen gültig: $name", ({ body }) => {
    expect(DateiEintragenSchema.safeParse(body).success).toBe(true);
  });
  it.each(vertrag.artifacts.register.ungueltig)("Eintragen ungültig: $name", ({ body }) => {
    expect(DateiEintragenSchema.safeParse(body).success).toBe(false);
  });
});

describe("leseArten", () => {
  it("liest eine Liste, ohne Doppelte, ohne Gross-/Kleinschreibung", () => {
    expect(leseArten("vorschau, Kontaktbogen,vorschau")).toEqual(["vorschau", "kontaktbogen"]);
  });
  it.each(["", " , ", "video", "vorschau,plan", "storyboard"])("«%s» ist ein Fehler mit der Liste der erlaubten Arten", (t) => {
    const r = leseArten(t);
    expect(typeof r).toBe("string");
    expect(r as string).toContain("vorschau, kontaktbogen, gegenlesen, qualitaet");
  });
});

describe("bereinigeQualitaet", () => {
  it("macht aus der Messung des Rechners genau das Beispiel des Vertrags", () => {
    expect(bereinigeQualitaet(vertrag.artifacts.qualitaet.roh)).toEqual(vertrag.artifacts.qualitaet.bereinigt);
  });

  it("lässt Pfad, volle Messung und die Stufe der Hinweise zurück", () => {
    const text = JSON.stringify(bereinigeQualitaet(vertrag.artifacts.qualitaet.roh));
    for (const nie of ["Müller", "OneDrive", "/Users", "videoCodec", "pixFmt", "stufe", "datei", "messung", "yLow"]) expect(text, nie).not.toContain(nie);
  });

  it("Texte laufen durch die Pfadbereinigung", () => {
    const roh = { ...(vertrag.artifacts.qualitaet.roh as Record<string, unknown>), planHinweis: "Der Plan /Users/andrej/Kunde Müller/plan.json passt nicht", hinweise: [{ stufe: "hinweis", code: "x", text: "Datei /Volumes/Medien/Kunde/video.mp4 fehlt" }] };
    const text = JSON.stringify(bereinigeQualitaet(roh));
    expect(text).not.toContain("Müller");
    expect(text).not.toContain("/Volumes");
    expect(text).not.toContain("video.mp4");
  });

  it("ohne Plan und ohne Ton fehlen nur die optionalen Felder", () => {
    const { zooms, grafikAnteil, brollAnteil, lufs, truePeak, videoMbit, planHinweis, ...rest } = vertrag.artifacts.qualitaet.roh as Record<string, unknown>;
    void [zooms, grafikAnteil, brollAnteil, lufs, truePeak, videoMbit, planHinweis];
    const q = bereinigeQualitaet(rest);
    for (const k of ["zooms", "grafikAnteil", "brollAnteil", "lufs", "truePeak", "videoMbit", "planHinweis"]) expect(q).not.toHaveProperty(k);
  });

  it.each([
    ["kein Objekt", "text"],
    ["null", null],
    ["Liste", []],
    ["Dauer fehlt", { ...(vertrag.artifacts.qualitaet.roh as object), dauer: undefined }],
    ["Dauer ist Text", { ...(vertrag.artifacts.qualitaet.roh as object), dauer: "42" }],
    ["Schnitte fehlen", { ...(vertrag.artifacts.qualitaet.roh as object), schnitte: undefined }],
    ["Quelle der Schnitte unbekannt", { ...(vertrag.artifacts.qualitaet.roh as object), schnitte: { anzahl: 1, proMinute: 1, quelle: "x" } }],
    ["Farbe fehlt", { ...(vertrag.artifacts.qualitaet.roh as object), farbe: undefined }],
    ["Stille fehlt", { ...(vertrag.artifacts.qualitaet.roh as object), stille: undefined }],
    ["erste Aussage fehlt", { ...(vertrag.artifacts.qualitaet.roh as object), ersteAussage: undefined }],
    ["unendlich", { ...(vertrag.artifacts.qualitaet.roh as object), fps: Infinity }],
  ])("wirft bei: %s", (_n, roh) => {
    expect(() => bereinigeQualitaet(roh)).toThrow();
  });

  it("Zooms zählen nur mit Anzahl und Takt, der Zeitstempel ist höchstens 40 Zeichen lang", () => {
    const basis = vertrag.artifacts.qualitaet.roh as Record<string, unknown>;
    expect(bereinigeQualitaet({ ...basis, zooms: { anzahl: 2 } })).not.toHaveProperty("zooms");
    expect(bereinigeQualitaet({ ...basis, zooms: { proMinute: 2 } })).not.toHaveProperty("zooms");
    expect(bereinigeQualitaet({ ...basis, zooms: { anzahl: 2, proMinute: 1.5 } })).toHaveProperty("zooms", { anzahl: 2, proMinute: 1.5 });
    expect((bereinigeQualitaet({ ...basis, gemessen: "x".repeat(100) }) as { gemessen: string }).gemessen).toHaveLength(40);
  });

  it("höchstens 30 Notizen je Liste, Texte höchstens 400 Zeichen", () => {
    const viele = Array.from({ length: 40 }, (_, i) => ({ code: `c${i}`, text: "t".repeat(900) }));
    const q = bereinigeQualitaet({ ...(vertrag.artifacts.qualitaet.roh as object), abweichungen: viele }) as { abweichungen: { text: string }[] };
    expect(q.abweichungen).toHaveLength(30);
    expect(q.abweichungen[0]!.text.length).toBeLessThanOrEqual(400);
  });
});

describe("ladeDateiHoch", () => {
  const datei = (art: Art = "vorschau") => ({ konfig: konfig(), fetch, code: ID, version: 3, art, bytes: bytesVon(art), zeitlimits: { api: 3000, upload: 5000 } });

  it("bereitet vor, lädt hoch und trägt ein; der Typ im Header ist der der Art, nie einer vom Tool", async () => {
    const r = await ladeDateiHoch(datei("vorschau"));
    expect(r).toEqual({ art: "vorschau", ergebnis: "hochgeladen", bytes: bytesVon("vorschau").length });
    expect(gesehen.map((g) => `${g.method} ${g.url.split("?")[0]}`)).toEqual(["POST /api/studio-geraet/artifacts/target", "PUT /speicher/vorschau-3", "POST /api/studio-geraet/artifacts/register"]);
    const [ziel, put, reg] = gesehen as [Gesehen, Gesehen, Gesehen];
    expect(JSON.parse(ziel.body.toString())).toEqual({ code: ID, kind: "vorschau", version: 3, mime: "video/mp4", size: bytesVon("vorschau").length });
    expect(DateiVorbereitenSchema.safeParse(JSON.parse(ziel.body.toString())).success).toBe(true);
    expect(put.headers["content-type"]).toBe("video/mp4");
    expect(put.headers["x-upsert"]).toBe("true");
    expect(put.headers["cache-control"]).toBe("max-age=3600");
    expect(put.headers["apikey"]).toBe("oeffentlich");
    expect(put.body.equals(bytesVon("vorschau"))).toBe(true);
    expect(JSON.parse(reg.body.toString())).toEqual({ code: ID, kind: "vorschau", version: 3 });
    expect(DateiEintragenSchema.safeParse(JSON.parse(reg.body.toString())).success).toBe(true);
  });

  it("das Token geht nur ans Tool, nie an den Speicher", async () => {
    await ladeDateiHoch(datei());
    expect(gesehen[0]!.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(gesehen[1]!.headers.authorization).toBeUndefined();
    expect(gesehen[2]!.headers.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("vom Tool genannte Header ausser apikey, cache-control und x-upsert werden nicht mitgeschickt", async () => {
    uploadAntwort = { headers: { apikey: "a", authorization: "Bearer fremd", cookie: "x=y", "x-evil": "1", "content-type": "text/html", "x-upsert": "true" } };
    await ladeDateiHoch(datei());
    const put = gesehen[1]!;
    expect(put.headers.authorization).toBeUndefined();
    expect(put.headers.cookie).toBeUndefined();
    expect(put.headers["x-evil"]).toBeUndefined();
    expect(put.headers["content-type"]).toBe("video/mp4");
  });

  it("Header des Tools in anderer Schreibweise gelten ebenso (nur die drei erlaubten, klein geschrieben)", async () => {
    uploadAntwort = { headers: { ApiKey: "a", "Cache-Control": "max-age=1", "X-Upsert": "true", Authorization: "Bearer fremd" } };
    await ladeDateiHoch(datei());
    const put = gesehen[1]!;
    expect(put.headers["apikey"]).toBe("a");
    expect(put.headers["cache-control"]).toBe("max-age=1");
    expect(put.headers["x-upsert"]).toBe("true");
    expect(put.headers.authorization).toBeUndefined();
  });

  it("der Speicher darf auch mit 201 antworten", async () => {
    antworten["PUT /speicher"] = () => ({ status: 201 });
    expect((await ladeDateiHoch(datei())).ergebnis).toBe("hochgeladen");
  });

  it.each([
    ["kein Link", "ohne"],
    ["javascript", "javascript:alert(1)"],
    ["Datei", "file:///etc/passwd"],
    ["http an eine fremde Adresse", "http://speicher.example/x"],
    ["Adresse ohne Protokoll", "//speicher.example/x"],
    ["kein URL", "das ist kein link"],
    ["http an localhost.evil.example", "http://localhost.evil.example/x"],
    ["http an 127.0.0.1.evil.example", "http://127.0.0.1.evil.example/x"],
  ])("ein unbrauchbarer Upload-Link (%s): es wird nichts dorthin geschickt und nichts eingetragen", async (_n, link) => {
    uploadAntwort = { urlRoh: link === "ohne" ? "" : link };
    const versucht: string[] = [];
    const beobachtet: typeof fetch = async (url, init) => {
      versucht.push(String(url));
      return fetch(url, init);
    };
    const r = await ladeDateiHoch({ ...datei(), fetch: beobachtet });
    expect(r).toMatchObject({ ergebnis: "fehler", stop: false });
    // nur die zwei Aufrufe ans Tool (Vorbereiten), nie einer an den genannten Link
    expect(versucht).toEqual([`${basis}/api/studio-geraet/artifacts/target`]);
    expect(gesehen.filter((g) => g.url.includes("register"))).toHaveLength(0);
  });

  it("403 beim Vorbereiten: übersprungen mit dem Hinweis auf den Schalter, nichts hochgeladen", async () => {
    antworten["POST /api/studio-geraet/artifacts/target"] = () => ({ status: 403, body: { error: "x" } });
    const r = await ladeDateiHoch(datei());
    expect(r).toMatchObject({ ergebnis: "uebersprungen" });
    expect((r as { grund: string }).grund).toContain("nicht erlaubt");
    expect(gesehen).toHaveLength(1);
  });

  it.each([
    [401, "lehnt das Token ab", false, true],
    [404, "nicht bekannt", false, true],
    [422, "lehnt die Datei ab", false, false],
    [413, "lehnt die Datei ab", false, false],
    [429, "drosselt", true, true],
    [503, "antwortete 503", true, true],
    [500, "antwortete 500", true, true],
  ])("Vorbereiten: Status %i", async (status, text, spaeter, stop) => {
    antworten["POST /api/studio-geraet/artifacts/target"] = () => ({ status, body: { error: "Zu gross", issues: [{ path: "size", message: "zu gross" }] } });
    const r = (await ladeDateiHoch(datei())) as Extract<ArtErgebnis, { ergebnis: "fehler" }>;
    expect(r.ergebnis).toBe("fehler");
    expect(r.grund).toContain(text);
    expect(r.spaeter).toBe(spaeter);
    expect(r.stop).toBe(stop);
    expect(gesehen).toHaveLength(1);
  });

  it("das Tool ist nicht erreichbar: Fehler zum späteren Wiederholen, ohne Adresse und Token im Text", async () => {
    antworten["POST /api/studio-geraet/artifacts/target"] = () => "abbruch";
    const r = (await ladeDateiHoch(datei())) as Extract<ArtErgebnis, { ergebnis: "fehler" }>;
    expect(r).toMatchObject({ ergebnis: "fehler", spaeter: true, stop: true });
    expect(r.grund).not.toContain(basis);
    expect(r.grund).not.toContain(GEHEIMNIS);
  });

  it.each([
    [413, false],
    [403, false],
    [500, true],
    [429, true],
  ])("Hochladen: Status %i des Speichers heisst abgelehnt, es wird nichts eingetragen", async (status, spaeter) => {
    antworten["PUT /speicher"] = () => ({ status });
    const r = (await ladeDateiHoch(datei())) as Extract<ArtErgebnis, { ergebnis: "fehler" }>;
    expect(r.ergebnis).toBe("fehler");
    expect(r.grund).toContain(`Status ${status}`);
    expect(r.spaeter).toBe(spaeter);
    expect(r.grund).not.toContain("GEHEIMER-LINK");
    expect(gesehen.filter((g) => g.url.includes("register"))).toHaveLength(0);
  });

  it("reisst die Verbindung beim Hochladen ab: Fehler ohne den Link, nichts eingetragen", async () => {
    antworten["PUT /speicher"] = () => "abbruch";
    const r = (await ladeDateiHoch(datei())) as Extract<ArtErgebnis, { ergebnis: "fehler" }>;
    expect(r).toMatchObject({ ergebnis: "fehler", spaeter: true, stop: false });
    expect(r.grund).not.toContain("GEHEIMER-LINK");
    expect(r.grund).not.toContain(basis);
    expect(gesehen.filter((g) => g.url.includes("register"))).toHaveLength(0);
  });

  it("hängt der Speicher, bricht das Zeitlimit ab", async () => {
    antworten["PUT /speicher"] = () => ({ status: 200 });
    const langsam: typeof fetch = async (url, init) => {
      if (String(url).includes("/speicher/")) return new Promise((_r, rej) => init?.signal?.addEventListener("abort", () => rej(new Error("abgebrochen"))));
      return fetch(url, init);
    };
    const r = await ladeDateiHoch({ ...datei(), fetch: langsam, zeitlimits: { api: 3000, upload: 50 } });
    expect(r).toMatchObject({ ergebnis: "fehler", spaeter: true });
  });

  it.each([
    [403, "uebersprungen"],
    [422, "fehler"],
    [401, "fehler"],
    [503, "fehler"],
  ])("Eintragen: Status %i", async (status, erwartet) => {
    antworten["POST /api/studio-geraet/artifacts/register"] = () => ({ status, body: { error: "Der Inhalt der Datei passt nicht zum Typ." } });
    const r = await ladeDateiHoch(datei());
    expect(r.ergebnis).toBe(erwartet);
    if (status === 503) expect((r as { grund: string }).grund).toContain("liegt im Speicher");
    if (status === 422) {
      expect((r as { grund: string }).grund).toContain("passt nicht zum Typ");
      expect(r).toMatchObject({ spaeter: false, stop: false });
    }
  });
});

describe("hochladen (der Befehl)", () => {
  it("lädt alle vier Arten hoch, in fester Reihenfolge, meldet es und gibt 0 zurück", async () => {
    const { e, aus, fehl, melde } = eingabe();
    expect(await hochladen(e)).toBe(0);
    expect(fehl).toEqual([]);
    expect(gesehen.filter((g) => g.url.includes("/target")).map((g) => (JSON.parse(g.body.toString()) as { kind: string }).kind)).toEqual(["vorschau", "kontaktbogen", "gegenlesen", "qualitaet"]);
    expect(aus.join("\n")).toContain("Fassung 3");
    expect(aus.filter((z) => z.includes("hochgeladen"))).toHaveLength(4);
    expect(melde).toEqual([{ state: "ok", detail: { hochgeladen: ["vorschau", "kontaktbogen", "gegenlesen", "qualitaet"], fehlgeschlagen: [] } }]);
  });

  it("jede Datei geht mit der Fassung aus dem Tool", async () => {
    antworten["GET /api/studio-geraet/contents/c-1000"] = () => ({ status: 200, body: { version: 7, preview_allowed: true } });
    const { e } = eingabe({ arten: ["gegenlesen"] });
    await hochladen(e);
    expect((JSON.parse(gesehen.find((g) => g.url.includes("/target"))!.body.toString()) as { version: number }).version).toBe(7);
  });

  it("ohne Erlaubnis im Tool: nur die Messwerte, alles andere übersprungen mit Hinweis und ohne Anfrage, Exit-Code 0", async () => {
    antworten["GET /api/studio-geraet/contents/c-1000"] = () => ({ status: 200, body: { version: 1, preview_allowed: false } });
    const { e, aus, fehl } = eingabe();
    expect(await hochladen(e)).toBe(0);
    expect(fehl).toEqual([]);
    expect(gesehen.filter((g) => g.url.includes("/target")).map((g) => (JSON.parse(g.body.toString()) as { kind: string }).kind)).toEqual(["qualitaet"]);
    expect(aus.filter((z) => z.includes("übersprungen"))).toHaveLength(3);
    expect(aus.join("\n")).toContain("nicht erlaubt");
  });

  it("ohne Erlaubnis und mit ausdrücklicher Art: kein Fehler, nur der Hinweis", async () => {
    antworten["GET /api/studio-geraet/contents/c-1000"] = () => ({ status: 200, body: { version: 1, preview_allowed: false } });
    const { e, aus } = eingabe({ arten: ["vorschau"] });
    expect(await hochladen(e)).toBe(0);
    expect(gesehen).toHaveLength(1);
    expect(aus.join("\n")).toContain("Ein Admin schaltet das auf der Seite des Inhalts ein");
    expect(aus.join("\n")).toContain("Es wurde nichts hochgeladen.");
  });

  it("wird nichts versucht, wird auch nichts gemeldet", async () => {
    antworten["GET /api/studio-geraet/contents/c-1000"] = () => ({ status: 200, body: { version: 1, preview_allowed: false } });
    const { e, melde } = eingabe({ arten: ["vorschau", "gegenlesen"] });
    await hochladen(e);
    expect(melde).toEqual([]);
  });

  it.each([
    ["ohne Fassung", { preview_allowed: true }],
    ["Fassung als Text", { version: "3", preview_allowed: true }],
    ["ohne Schalter", { version: 3 }],
    ["Schalter als Text", { version: 3, preview_allowed: "ja" }],
    ["leer", {}],
  ])("ein Stand, der nicht lesbar ist (%s), endet mit Hinweis und ohne Hochladen", async (_n, body) => {
    antworten["GET /api/studio-geraet/contents/c-1000"] = () => ({ status: 200, body });
    const { e, fehl } = eingabe();
    expect(await hochladen(e)).toBe(1);
    expect(fehl.join("\n")).toContain("nicht lesbar");
    expect(gesehen).toHaveLength(1);
  });

  it("fehlt eine Datei und war die Art nicht ausdrücklich genannt, ist das ein Hinweis; bei ausdrücklicher Art ein Fehler", async () => {
    const quellen: Quellen = { bereit: async (art) => (art === "kontaktbogen" ? { fehlt: "Es gibt noch keinen Plan." } : { bytes: bytesVon(art) }) };
    const a = eingabe({ quellen });
    expect(await hochladen(a.e)).toBe(0);
    expect(a.aus.join("\n")).toContain("Kontaktbogen: übersprungen. Es gibt noch keinen Plan.");
    gesehen.length = 0;
    const b = eingabe({ quellen, arten: ["kontaktbogen"] });
    expect(await hochladen(b.e)).toBe(1);
    expect(b.fehl.join("\n")).toContain("Es gibt noch keinen Plan.");
    expect(gesehen.filter((g) => g.url.includes("/target"))).toHaveLength(0);
  });

  it("eine leere oder zu grosse Datei wird nicht versucht", async () => {
    const quellen: Quellen = {
      bereit: async (art) => (art === "vorschau" ? { bytes: Buffer.alloc(0) } : art === "kontaktbogen" ? { bytes: Buffer.alloc(8 * 1024 * 1024 + 1) } : { bytes: bytesVon(art) }),
    };
    const { e, fehl } = eingabe({ quellen });
    expect(await hochladen(e)).toBe(1);
    expect(fehl.join("\n")).toContain("Vorschau: Die Datei ist leer.");
    expect(fehl.join("\n")).toContain("Kontaktbogen: Die Datei ist grösser als 8,0 MB");
    expect(gesehen.filter((g) => g.url.includes("/target")).map((g) => (JSON.parse(g.body.toString()) as { kind: string }).kind)).toEqual(["gegenlesen", "qualitaet"]);
  });

  it("wirft eine Quelle, ist das ein Hinweis ohne Pfade und die übrigen Arten gehen weiter", async () => {
    const quellen: Quellen = {
      bereit: async (art) => {
        if (art === "vorschau") throw new Error("ENOENT: /Users/andrej/Kunde Müller/vorschau.mp4");
        return { bytes: bytesVon(art) };
      },
    };
    const { e, aus, fehl } = eingabe({ quellen });
    expect(await hochladen(e)).toBe(0);
    const text = [...aus, ...fehl].join("\n");
    expect(text).not.toContain("Müller");
    expect(text).not.toContain("/Users");
    expect(aus.filter((z) => z.includes("hochgeladen"))).toHaveLength(3);
  });

  it("401 beim Vorbereiten: die übrigen Arten werden nicht versucht, Exit-Code 1", async () => {
    antworten["POST /api/studio-geraet/artifacts/target"] = () => ({ status: 401 });
    const { e, fehl, melde } = eingabe();
    expect(await hochladen(e)).toBe(1);
    expect(anfragenAn("/api/studio-geraet/artifacts/target")).toHaveLength(1);
    expect(fehl.join("\n")).toContain("lehnt das Token ab");
    expect(fehl.join("\n")).toContain("Nicht versucht: Kontaktbogen, Gegenlesen, Messwerte");
    expect(melde[0]!.state).toBe("error");
  });

  it("422 bei einer Datei lässt die übrigen weiterlaufen", async () => {
    let n = 0;
    antworten["POST /api/studio-geraet/artifacts/target"] = (g) => {
      n += 1;
      if (n === 1) return { status: 422, body: { error: "Die Datei muss zur jetzigen Fassung 3 gehören" } };
      return standard["POST /api/studio-geraet/artifacts/target"]!(g);
    };
    const { e, aus, fehl } = eingabe();
    expect(await hochladen(e)).toBe(1);
    expect(aus.filter((z) => z.includes("hochgeladen"))).toHaveLength(3);
    expect(fehl.join("\n")).toContain("Vorschau: Das Tool lehnt die Datei ab");
    // eine abgewiesene Datei wird nicht nochmals versucht: kein Hinweis auf «später»
    expect(fehl.join("\n")).not.toContain("später noch einmal");
  });

  it("bei einem Fehler, der vorübergehend sein kann, steht der Hinweis auf einen späteren Versuch", async () => {
    antworten["PUT /speicher"] = () => ({ status: 503 });
    const { e, fehl } = eingabe({ arten: ["gegenlesen"] });
    expect(await hochladen(e)).toBe(1);
    expect(fehl.join("\n")).toContain("Derselbe Befehl später noch einmal.");
  });

  it.each([
    [401, "lehnt das Token ab"],
    [404, "nicht bekannt"],
    [500, "nicht lesbar"],
  ])("Stand lesen: Status %i endet mit Hinweis und Exit-Code 1, ohne etwas hochzuladen", async (status, text) => {
    antworten["GET /api/studio-geraet/contents/c-1000"] = () => ({ status, body: {} });
    const { e, fehl } = eingabe();
    expect(await hochladen(e)).toBe(1);
    expect(fehl.join("\n")).toContain(text);
    expect(fehl).toHaveLength(1);
    expect(gesehen).toHaveLength(1);
  });

  it("ist das Tool nicht erreichbar: Hinweis, Exit-Code 1, keine Ausnahme, kein Link und kein Token im Text", async () => {
    antworten["GET /api/studio-geraet/contents/c-1000"] = () => "abbruch";
    const { e, aus, fehl } = eingabe();
    expect(await hochladen(e)).toBe(1);
    const text = [...aus, ...fehl].join("\n");
    expect(text).toContain("nicht erreichbar");
    expect(text).not.toContain(GEHEIMNIS);
  });

  it("nichts in der Ausgabe verrät Token, Upload-Link oder Pfade", async () => {
    antworten["PUT /speicher"] = () => ({ status: 500 });
    const { e, aus, fehl } = eingabe();
    await hochladen(e);
    const text = [...aus, ...fehl].join("\n");
    for (const nie of [GEHEIMNIS, TOKEN, "GEHEIMER-LINK", "token=", "apikey", "oeffentlich", basis]) expect(text, nie).not.toContain(nie);
  });

  it("jede Anfrage ans Tool ist ein Aufruf der Geräte-API und trägt das Token", async () => {
    const { e } = eingabe();
    await hochladen(e);
    for (const g of gesehen.filter((x) => !x.url.startsWith("/speicher/"))) {
      expect(g.url.startsWith("/api/studio-geraet/")).toBe(true);
      expect(g.headers.authorization).toBe(`Bearer ${TOKEN}`);
    }
  });

  it("ohne Melder läuft alles trotzdem", async () => {
    const { e } = eingabe();
    const { melde: _ignoriert, ...ohneMelder } = e;
    void _ignoriert;
    expect(await hochladen(ohneMelder)).toBe(0);
  });
});
