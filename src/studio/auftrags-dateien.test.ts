import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DATEI_MAX_BYTES, DATEI_TYPEN, adresseOk, groesse, ladeDatei, sichererName } from "./auftrags-dateien";
import type { AuftragDatei } from "./vertrag";

const ID = "2b6f0a8c-4d1e-4c3a-9f5b-8e7d6c5b4a39";
let tmp: string;
beforeEach(() => void (tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vs-dateien-"))));
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("sichererName", () => {
  it("setzt die Nummer vor den Namen und die Endung nach dem Typ", () => {
    expect(sichererName("Moodboard.JPG", "image/jpeg", 1)).toBe("01-Moodboard.jpg");
    expect(sichererName("Briefing", "application/pdf", 12)).toBe("12-Briefing.pdf");
  });

  it("die Endung folgt dem Typ, nicht dem Namen: «x.sh» mit dem Typ image/png wird «x.png»", () => {
    expect(sichererName("x.sh", "image/png", 2)).toBe("02-x.png");
    expect(sichererName("virus.exe", "application/pdf", 3)).toBe("03-virus.pdf");
  });

  it.each([
    ["../../etc/passwd", "02-passwd.png"],
    ["..\\..\\Windows\\win.ini", "02-win.png"],
    ["/absolut/pfad/bild.png", "02-bild.png"],
    ["a/b/c/d.png", "02-d.png"],
    [".bashrc", "02-bashrc.png"],
    ["...versteckt.png", "02-versteckt.png"],
    ["bild\u0000.png", "02-bild.png"],
    ["zeile\neins\r.png", "02-zeileeins.png"],
    ["a:b*c?d\"e<f>g|h.png", "02-a_b_c_d_e_f_g_h.png"],
    ["   ", "02-datei.png"],
    ["", "02-datei.png"],
    ["....", "02-datei.png"],
  ])("«%s» wird zu «%s»", (roh, soll) => {
    expect(sichererName(roh, "image/png", 2)).toBe(soll);
  });

  it("ein Name ohne Pfadteil: Das Ergebnis enthält nie / oder \\ und beginnt nie mit einem Punkt", () => {
    for (const roh of ["../a", "a/../b", "..", "/", "\\", "a\\b", ".hidden", "x"]) {
      const n = sichererName(roh, "image/png", 5);
      expect(n, roh).not.toMatch(/[\\/]/);
      expect(n.startsWith("."), roh).toBe(false);
      expect(path.basename(n), roh).toBe(n);
    }
  });

  it("Unicode wird in NFC geschrieben (ä aus a und Trema wird ä)", () => {
    expect(sichererName("M" + String.fromCharCode(0x61, 0x308) + "rz.png", "image/png", 1)).toBe("01-M" + String.fromCharCode(0xe4) + "rz.png");
  });

  it("ein langer Name wird gekürzt, die Endung bleibt, das Ganze ist höchstens 103 Zeichen lang", () => {
    const n = sichererName(`${"ä".repeat(300)}.jpg`, "image/jpeg", 1);
    expect(n.endsWith(".jpg")).toBe(true);
    expect(Array.from(n).length).toBeLessThanOrEqual(103);
  });

  it("ein unbekannter Typ bekommt keine Endung (er wird ohnehin nicht geladen)", () => {
    expect(sichererName("a.bin", "application/octet-stream", 1)).toBe("01-a");
  });

  it("alle erlaubten Typen haben eine Endung mit Punkt", () => {
    for (const [typ, endung] of Object.entries(DATEI_TYPEN)) expect(endung, typ).toMatch(/^\.[a-z0-9]+$/);
  });
});

describe("adresseOk", () => {
  it.each([
    ["https://speicher.example/datei?token=t", true],
    ["http://127.0.0.1:3000/datei", true],
    ["http://localhost/datei", true],
    ["http://speicher.example/datei", false],
    ["https://user:pw@speicher.example/datei", false],
    ["ftp://speicher.example/datei", false],
    ["file:///etc/passwd", false],
    ["javascript:alert(1)", false],
    ["//speicher.example/datei", false],
    ["", false],
    ["kein url", false],
  ])("%s ist %s", (u, ok) => {
    expect(adresseOk(u)).toBe(ok);
  });
});

describe("groesse", () => {
  it("KB unter einem MB, sonst MB mit Komma", () => {
    expect(groesse(1)).toBe("1 KB");
    expect(groesse(482113)).toBe("471 KB");
    expect(groesse(1024 * 1024)).toBe("1,0 MB");
    expect(groesse(20 * 1024 * 1024)).toBe("20,0 MB");
  });
});

const datei = (o: Partial<AuftragDatei> = {}): AuftragDatei => ({ id: ID, name: "Bild.png", type: "image/png", size: 5, url: "https://speicher.example/d?t=1", ...o });
const antwort = (inhalt: string | Uint8Array, o: { status?: number; headers?: Record<string, string> } = {}): typeof fetch =>
  (async () => new Response(inhalt as ConstructorParameters<typeof Response>[0], { status: o.status ?? 200, ...(o.headers ? { headers: o.headers } : {}) })) as unknown as typeof fetch;

describe("ladeDatei", () => {
  it("lädt, schreibt unter dem sicheren Namen und gibt Name und Grösse zurück", async () => {
    const r = await ladeDatei(antwort("12345"), datei(), 1, tmp);
    expect(r).toEqual({ art: "geladen", datei: "01-Bild.png", bytes: 5 });
    expect(fs.readFileSync(path.join(tmp, "01-Bild.png"), "utf8")).toBe("12345");
    expect(fs.readdirSync(tmp)).toEqual(["01-Bild.png"]);
  });

  it("schickt keine Kopfzeile «authorization» (das Token des Geräts gehört nicht an die Adresse einer Datei) und folgt keiner Weiterleitung", async () => {
    let gesehen: RequestInit | undefined;
    const f = (async (_u: unknown, init?: RequestInit) => ((gesehen = init), new Response("12345"))) as unknown as typeof fetch;
    await ladeDatei(f, datei(), 1, tmp);
    expect(gesehen?.headers).toBeUndefined();
    expect(gesehen?.redirect).toBe("error");
    expect(gesehen?.method).toBe("GET");
  });

  it("eine Datei, die mit gleicher Grösse schon da liegt, wird nicht noch einmal geladen", async () => {
    fs.writeFileSync(path.join(tmp, "01-Bild.png"), "abcde");
    let aufrufe = 0;
    const f = (async () => (aufrufe++, new Response("12345"))) as unknown as typeof fetch;
    expect(await ladeDatei(f, datei(), 1, tmp)).toEqual({ art: "vorhanden", datei: "01-Bild.png", bytes: 5 });
    expect(aufrufe).toBe(0);
  });

  it("eine Datei gleichen Namens mit anderer Grösse wird ersetzt", async () => {
    fs.writeFileSync(path.join(tmp, "01-Bild.png"), "zu lang für fünf");
    const r = await ladeDatei(antwort("12345"), datei(), 1, tmp);
    expect(r.art).toBe("geladen");
    expect(fs.readFileSync(path.join(tmp, "01-Bild.png"), "utf8")).toBe("12345");
  });

  it("ein Typ ausserhalb der Liste wird übersprungen, ohne zu laden", async () => {
    let aufrufe = 0;
    const f = (async () => (aufrufe++, new Response("x"))) as unknown as typeof fetch;
    for (const type of ["application/x-sh", "application/zip", "text/html", "image/svg+xml", "application/octet-stream"]) {
      expect(await ladeDatei(f, datei({ type }), 1, tmp), type).toEqual({ art: "uebersprungen", grund: "Dateityp nicht erlaubt" });
    }
    expect(aufrufe).toBe(0);
    expect(fs.readdirSync(tmp)).toEqual([]);
  });

  it("über 20 MB wird übersprungen, genau 20 MB nicht", async () => {
    expect((await ladeDatei(antwort("x"), datei({ size: DATEI_MAX_BYTES + 1 }), 1, tmp)).art).toBe("uebersprungen");
    const r = await ladeDatei(antwort(new Uint8Array(DATEI_MAX_BYTES)), datei({ size: DATEI_MAX_BYTES }), 1, tmp);
    expect(r.art).toBe("geladen");
  });

  it("ohne Adresse (der Speicher kennt die Datei nicht) ist es ein Fehler, kein Überspringen", async () => {
    const r = await ladeDatei(antwort("x"), datei({ url: null }), 1, tmp);
    expect(r).toEqual({ art: "fehler", grund: "Das Tool findet die Datei im Speicher nicht" });
  });

  it.each(["http://speicher.example/d", "https://u:p@speicher.example/d", "file:///etc/passwd", "kein url"])("die Adresse «%s» wird nicht geladen", async (url) => {
    let aufrufe = 0;
    const f = (async () => (aufrufe++, new Response("12345"))) as unknown as typeof fetch;
    expect(await ladeDatei(f, datei({ url }), 1, tmp)).toEqual({ art: "fehler", grund: "Die Adresse der Datei ist nicht zulässig" });
    expect(aufrufe).toBe(0);
  });

  it("antwortet der Speicher mit einem Fehler, wird nichts geschrieben", async () => {
    const r = await ladeDatei(antwort("nein", { status: 403 }), datei(), 1, tmp);
    expect(r).toEqual({ art: "fehler", grund: "Der Speicher antwortet mit 403" });
    expect(fs.readdirSync(tmp)).toEqual([]);
  });

  it("liefert der Speicher eine andere Grösse als angegeben, wird nichts geschrieben", async () => {
    const r = await ladeDatei(antwort("123456789"), datei({ size: 5 }), 1, tmp);
    expect(r.art).toBe("fehler");
    expect(r.art === "fehler" && r.grund).toContain("Grösse stimmt nicht");
    expect(fs.readdirSync(tmp)).toEqual([]);
  });

  it("meldet der Speicher mehr als 20 MB, wird nicht gelesen", async () => {
    const r = await ladeDatei(antwort("x", { headers: { "content-length": String(DATEI_MAX_BYTES + 1) } }), datei(), 1, tmp);
    expect(r).toEqual({ art: "fehler", grund: "Der Speicher meldet mehr als 20 MB" });
  });

  it("liefert der Speicher mehr als 20 MB, obwohl die Grösse kleiner angegeben war, bricht das Laden ab", async () => {
    const r = await ladeDatei(antwort(new Uint8Array(DATEI_MAX_BYTES + 10)), datei({ size: 5 }), 1, tmp);
    expect(r).toEqual({ art: "fehler", grund: "Mehr als 20 MB geliefert" });
    expect(fs.readdirSync(tmp)).toEqual([]);
  });

  it("ein Netzfehler ist ein Fehler mit Grund, kein Absturz, und hinterlässt keine halbe Datei", async () => {
    const f = (async () => {
      throw new TypeError("fetch failed: ECONNRESET /Users/andrej/secret");
    }) as unknown as typeof fetch;
    const r = await ladeDatei(f, datei(), 1, tmp);
    expect(r).toEqual({ art: "fehler", grund: "Laden fehlgeschlagen (Netz oder Zeitlimit)" });
    expect(JSON.stringify(r)).not.toContain("andrej");
    expect(fs.readdirSync(tmp)).toEqual([]);
  });

  it("ein Name mit Pfadteilen schreibt nie ausserhalb des Ordners", async () => {
    const innen = path.join(tmp, "auftrag");
    fs.mkdirSync(innen);
    const r = await ladeDatei(antwort("12345"), datei({ name: "../../ausbruch.png" }), 1, innen);
    expect(r.art).toBe("geladen");
    expect(fs.readdirSync(innen)).toEqual(["01-ausbruch.png"]);
    expect(fs.readdirSync(tmp)).toEqual(["auftrag"]);
  });

  it("gleiche Namen kollidieren nicht, weil die Nummer vorn steht", async () => {
    await ladeDatei(antwort("11111"), datei({ id: "11111111-1111-4111-8111-111111111111" }), 1, tmp);
    await ladeDatei(antwort("22222"), datei({ id: "22222222-2222-4222-8222-222222222222" }), 2, tmp);
    expect(fs.readdirSync(tmp).sort()).toEqual(["01-Bild.png", "02-Bild.png"]);
  });
});
