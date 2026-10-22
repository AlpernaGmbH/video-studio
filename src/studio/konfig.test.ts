import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KEYCHAIN_DIENST, KEYCHAIN_KONTO, ladeToolKonfig, pruefeToken, pruefeUrl, schluesselbund, speichereToolKonfig, toolDatei, toolPunkt, trenneTool, type Ausfuehrer, type KonfigOrt, type Schluesselbund } from "./konfig";

const ID = "3f8a1c2e-5b7d-4e90-8a11-0c2d4e6f8a10";
const GEHEIMNIS = "Zq3_-xK9mP2vR8sT5wY1uN7bC4dF6gH0jLaE2oIpQkM";
const TOKEN = `vsd_${ID}_${GEHEIMNIS}`;
const TOKEN2 = `vsd_${ID}_${"b".repeat(43)}`;

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vs-konfig-"));
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

function bund(ok = true): Schluesselbund & { inhalt: () => string | undefined } {
  let t: string | undefined;
  return {
    vorhanden: () => t !== undefined,
    lies: () => t,
    schreibe: (x) => (ok ? ((t = x), true) : false),
    loesche: () => void (t = undefined),
    inhalt: () => t,
  };
}
const ort = (s: Schluesselbund, env: NodeJS.ProcessEnv = {}): KonfigOrt => ({ dir: path.join(tmp, "cfg"), env, schluessel: s });

describe("pruefeUrl", () => {
  it("normalisiert auf Ursprung", () => {
    expect(pruefeUrl("https://alperna-tool.vercel.app")).toBe("https://alperna-tool.vercel.app");
    expect(pruefeUrl(" https://alperna-tool.vercel.app/studio/x?y=1 ")).toBe("https://alperna-tool.vercel.app");
    expect(pruefeUrl("https://tool.example.ch:8443/")).toBe("https://tool.example.ch:8443");
  });
  it("http nur für den eigenen Rechner", () => {
    expect(pruefeUrl("http://localhost:3000")).toBe("http://localhost:3000");
    expect(pruefeUrl("http://127.0.0.1:3000/")).toBe("http://127.0.0.1:3000");
    expect(() => pruefeUrl("http://alperna-tool.vercel.app")).toThrow(/https/);
    expect(() => pruefeUrl("http://localhost.evil.ch")).toThrow(/https/);
  });
  it.each(["", "kein url", "ftp://tool.ch", "https://user:pw@tool.ch", "https://", "javascript:alert(1)"])("weist «%s» ab", (u) => {
    expect(() => pruefeUrl(u)).toThrow();
  });
});

describe("pruefeToken", () => {
  it("nimmt die Form des Skripts, trimmt Leerraum", () => {
    expect(pruefeToken(`  ${TOKEN}\n`)).toBe(TOKEN);
  });
  it.each(["", "abc", `vsd_${ID}_kurz`, `vsx_${ID}_${"a".repeat(43)}`, `vsd_nicht-uuid_${"a".repeat(43)}`, `${TOKEN}x`, `vsd_${ID}_${"a".repeat(42)}+`])("weist «%s» ab, ohne den Wert im Fehler zu nennen", (t) => {
    let meldung = "";
    try {
      pruefeToken(t);
    } catch (e) {
      meldung = (e as Error).message;
    }
    expect(meldung).not.toBe("");
    if (t.length > 8) expect(meldung).not.toContain(t);
  });
});

describe("speichern und laden", () => {
  it("das Token geht in den Schlüsselbund, die Datei trägt nur die Adresse und hat die Rechte 0600", () => {
    const b = bund();
    const o = ort(b);
    expect(speichereToolKonfig(o, "https://alperna-tool.vercel.app/", TOKEN)).toEqual({ quelle: "schluesselbund", url: "https://alperna-tool.vercel.app" });
    expect(b.inhalt()).toBe(TOKEN);
    const text = fs.readFileSync(toolDatei(o), "utf8");
    expect(text).not.toContain(GEHEIMNIS);
    expect(JSON.parse(text)).toEqual({ schema: 1, url: "https://alperna-tool.vercel.app" });
    expect(fs.statSync(toolDatei(o)).mode & 0o777).toBe(0o600);
    expect(ladeToolKonfig(o)).toEqual({ konfig: { url: "https://alperna-tool.vercel.app", token: TOKEN }, quelle: "schluesselbund" });
  });

  it("ohne Schlüsselbund liegt das Token in der Datei, nur für den Besitzer lesbar", () => {
    const o = ort(bund(false));
    expect(speichereToolKonfig(o, "https://alperna-tool.vercel.app", TOKEN).quelle).toBe("datei");
    expect(fs.statSync(toolDatei(o)).mode & 0o777).toBe(0o600);
    expect(fs.statSync(o.dir).mode & 0o777).toBe(0o700);
    expect(ladeToolKonfig(o)).toEqual({ konfig: { url: "https://alperna-tool.vercel.app", token: TOKEN }, quelle: "datei" });
  });

  it("eine bestehende Datei mit offenen Rechten wird beim Überschreiben wieder 0600", () => {
    const o = ort(bund(false));
    fs.mkdirSync(o.dir, { recursive: true });
    fs.writeFileSync(toolDatei(o), "{}", { mode: 0o644 });
    speichereToolKonfig(o, "https://alperna-tool.vercel.app", TOKEN);
    expect(fs.statSync(toolDatei(o)).mode & 0o777).toBe(0o600);
  });

  it("ein neues Token ersetzt das alte, auch beim Wechsel von Datei zu Schlüsselbund", () => {
    const o = ort(bund(false));
    speichereToolKonfig(o, "https://alperna-tool.vercel.app", TOKEN);
    const b = bund(true);
    const o2 = { ...o, schluessel: b };
    speichereToolKonfig(o2, "https://alperna-tool.vercel.app", TOKEN2);
    expect(fs.readFileSync(toolDatei(o), "utf8")).not.toContain(GEHEIMNIS);
    expect(fs.readFileSync(toolDatei(o), "utf8")).not.toContain("b".repeat(43));
    expect(ladeToolKonfig(o2).konfig?.token).toBe(TOKEN2);
  });

  it("speichert nichts, wenn Adresse oder Token ungültig sind", () => {
    const b = bund();
    const o = ort(b);
    expect(() => speichereToolKonfig(o, "http://tool.ch", TOKEN)).toThrow();
    expect(() => speichereToolKonfig(o, "https://tool.ch", "kaputt")).toThrow();
    expect(fs.existsSync(toolDatei(o))).toBe(false);
    expect(b.inhalt()).toBeUndefined();
  });

  it("Umgebungsvariablen gelten vor der Datei", () => {
    const b = bund();
    const o = ort(b);
    speichereToolKonfig(o, "https://alperna-tool.vercel.app", TOKEN);
    const g = ladeToolKonfig({ ...o, env: { STUDIO_TOOL_URL: "https://cloud.example.ch", STUDIO_TOOL_TOKEN: TOKEN2 } });
    expect(g).toEqual({ konfig: { url: "https://cloud.example.ch", token: TOKEN2 }, quelle: "umgebung" });
  });

  it("nur eine der beiden Umgebungsvariablen: Hinweis, keine Verbindung, nie der Rückgriff auf die Datei", () => {
    const o = ort(bund());
    speichereToolKonfig(o, "https://alperna-tool.vercel.app", TOKEN);
    const g = ladeToolKonfig({ ...o, env: { STUDIO_TOOL_URL: "https://cloud.example.ch" } });
    expect(g.konfig).toBeUndefined();
    expect(g.hinweis).toMatch(/gehören zusammen/);
  });

  it("nichts eingerichtet: leer, kein Hinweis", () => {
    expect(ladeToolKonfig(ort(bund()))).toEqual({});
  });

  it("Adresse da, Token fehlt: Hinweis, keine Verbindung, kein Fehler", () => {
    const b = bund();
    const o = ort(b);
    speichereToolKonfig(o, "https://alperna-tool.vercel.app", TOKEN);
    b.loesche();
    const g = ladeToolKonfig(o);
    expect(g.konfig).toBeUndefined();
    expect(g.hinweis).toMatch(/Token fehlt/);
  });

  it("beschädigte oder fremde Datei: Hinweis ohne Absturz und ohne Inhalt der Datei", () => {
    const o = ort(bund());
    fs.mkdirSync(o.dir, { recursive: true });
    for (const inhalt of ["{kaputt", "[]", '{"schema":2,"url":"https://a.ch"}', `{"schema":1,"url":"ftp://a.ch","token":"${TOKEN}"}`, `{"schema":1,"url":"https://a.ch","token":"${GEHEIMNIS}"}`]) {
      fs.writeFileSync(toolDatei(o), inhalt);
      const g = ladeToolKonfig(o);
      expect(g.konfig).toBeUndefined();
      expect(g.hinweis).toBeTruthy();
      expect(g.hinweis).not.toContain(GEHEIMNIS);
    }
  });

  it("trennen löscht Datei und Schlüsselbund", () => {
    const b = bund();
    const o = ort(b);
    speichereToolKonfig(o, "https://alperna-tool.vercel.app", TOKEN);
    trenneTool(o);
    expect(fs.existsSync(toolDatei(o))).toBe(false);
    expect(b.inhalt()).toBeUndefined();
    expect(ladeToolKonfig(o)).toEqual({});
    expect(() => trenneTool(o)).not.toThrow();
  });
});

describe("Schlüsselbund (macOS, über das Programm security)", () => {
  function fake(antworten: Record<string, { status: number | null; stdout: string }> = {}) {
    const aufrufe: { cmd: string; args: string[] }[] = [];
    const run: Ausfuehrer = (cmd, args) => {
      aufrufe.push({ cmd, args });
      return antworten[args[0]! + (args.includes("-w") && args[0] === "find-generic-password" ? "+w" : "")] ?? { status: 0, stdout: "" };
    };
    return { aufrufe, run };
  }
  const ziel = ["-a", KEYCHAIN_KONTO, "-s", KEYCHAIN_DIENST];

  it("schreibt mit -U (ersetzt ein vorhandenes Token) und liest mit -w", () => {
    const f = fake({ "find-generic-password+w": { status: 0, stdout: `${TOKEN}\n` } });
    const b = schluesselbund("darwin", f.run);
    expect(b.schreibe(TOKEN)).toBe(true);
    expect(b.lies()).toBe(TOKEN);
    expect(f.aufrufe[0]).toEqual({ cmd: "security", args: ["add-generic-password", "-U", ...ziel, "-w", TOKEN] });
    expect(f.aufrufe[1]).toEqual({ cmd: "security", args: ["find-generic-password", ...ziel, "-w"] });
  });

  it("«vorhanden» fragt ohne -w, damit das Geheimnis nie gelesen wird", () => {
    const f = fake();
    expect(schluesselbund("darwin", f.run).vorhanden()).toBe(true);
    expect(f.aufrufe[0]!.args).toEqual(["find-generic-password", ...ziel]);
  });

  it("Fehler des Programms: lies gibt undefined, schreibe false, vorhanden false", () => {
    const f = fake({ "find-generic-password": { status: 44, stdout: "" }, "find-generic-password+w": { status: 44, stdout: "" }, "add-generic-password": { status: 1, stdout: "" } });
    const b = schluesselbund("darwin", f.run);
    expect(b.lies()).toBeUndefined();
    expect(b.vorhanden()).toBe(false);
    expect(b.schreibe(TOKEN)).toBe(false);
  });

  it("fehlt das Programm (Status null), gilt es als nicht verfügbar", () => {
    const b = schluesselbund("darwin", () => ({ status: null, stdout: "" }));
    expect(b.schreibe(TOKEN)).toBe(false);
    expect(b.lies()).toBeUndefined();
  });

  it("löschen ruft delete-generic-password", () => {
    const f = fake();
    schluesselbund("darwin", f.run).loesche();
    expect(f.aufrufe[0]!.args).toEqual(["delete-generic-password", ...ziel]);
  });

  it("auf anderen Systemen gibt es keinen Schlüsselbund und kein Programmaufruf", () => {
    const f = fake();
    const b = schluesselbund("linux", f.run);
    expect(b.schreibe(TOKEN)).toBe(false);
    expect(b.lies()).toBeUndefined();
    expect(b.vorhanden()).toBe(false);
    b.loesche();
    expect(f.aufrufe).toEqual([]);
  });
});

describe("Doctor-Punkt «Tool»", () => {
  it("nicht eingerichtet ist ein Hinweis, kein Fehler", () => {
    const p = toolPunkt(ort(bund()));
    expect(p.stufe).toBe("hinweis");
    expect(p.text).toMatch(/freiwillig/);
  });

  it("verbunden: ok, mit Adresse und Anfang der Geräte-ID, ohne Token", () => {
    const b = bund();
    const o = ort(b);
    speichereToolKonfig(o, "https://alperna-tool.vercel.app", TOKEN);
    const p = toolPunkt(o);
    expect(p.stufe).toBe("ok");
    expect(p.text).toContain("https://alperna-tool.vercel.app");
    expect(p.text).toContain("3f8a1c2e");
    expect(p.text).not.toContain(GEHEIMNIS);
    expect(p.text).not.toContain(TOKEN);
  });

  it("Token in der Datei mit offenen Rechten: Warnung", () => {
    const o = ort(bund(false));
    speichereToolKonfig(o, "https://alperna-tool.vercel.app", TOKEN);
    fs.chmodSync(toolDatei(o), 0o644);
    const p = toolPunkt(o);
    expect(p.stufe).toBe("warnung");
    expect(p.text).not.toContain(GEHEIMNIS);
  });

  it("Token fehlt oder Datei beschädigt: Warnung ohne Inhalt der Datei", () => {
    const b = bund();
    const o = ort(b);
    speichereToolKonfig(o, "https://alperna-tool.vercel.app", TOKEN);
    b.loesche();
    expect(toolPunkt(o).stufe).toBe("warnung");
    fs.writeFileSync(toolDatei(o), `{kaputt ${GEHEIMNIS}`);
    const p = toolPunkt(o);
    expect(p.stufe).toBe("warnung");
    expect(p.text).not.toContain(GEHEIMNIS);
  });

  it("macht nie einen Netzaufruf", () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error("Netz");
    }) as typeof fetch;
    try {
      const o = ort(bund());
      speichereToolKonfig(o, "https://alperna-tool.vercel.app", TOKEN);
      expect(toolPunkt(o).stufe).toBe("ok");
    } finally {
      globalThis.fetch = orig;
    }
  });
});
