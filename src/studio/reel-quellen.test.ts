import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { StudioHome } from "../setup";
import type { Ausfuehrer, BogenWerkzeuge } from "../schnitt/kontaktbogen";
import { reelPfade } from "../schnitt/reel";
import { beispielPlan } from "../schnitt/testdaten";
import { loesePfad } from "../schnitt/uebergabe";
import { reelQuellen } from "./reel-quellen";

const ID = "c-0007";
let tmp: string;
let home: StudioHome;
let ergebnis: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vs-quellen-"));
  home = { pfad: tmp, quelle: "STUDIO_HOME" };
  ergebnis = reelPfade(home, ID).ergebnis;
  fs.mkdirSync(ergebnis, { recursive: true });
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

/** Legt die Dateien an, die der Plan nennt (leer): Der Kontaktbogen prüft, ob sie da sind, bevor er ein Standbild verlangt. */
const lege = (plan: ReturnType<typeof beispielPlan>): void => {
  for (const pfad of [...plan.quellen.map((q) => q.pfad), ...plan.overlays.map((o) => o.datei)]) {
    const abs = loesePfad(home, pfad);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, "");
  }
};

const schreibe = (name: string, inhalt: string | Buffer, alter = 0): string => {
  const p = path.join(ergebnis, name);
  fs.writeFileSync(p, inhalt);
  const t = new Date(Date.now() - alter * 1000);
  fs.utimesSync(p, t, t);
  return p;
};

describe("Vorschau", () => {
  it("nimmt die jüngste Vorschau", async () => {
    schreibe("vorschau.mp4", "alt", 100);
    schreibe("vorschau-v2.mp4", "neu", 10);
    expect(await reelQuellen(home, ID).bereit("vorschau")).toEqual({ bytes: Buffer.from("neu") });
  });

  it("ohne Vorschau ein Hinweis, der den nächsten Schritt nennt", async () => {
    const r = await reelQuellen(home, ID).bereit("vorschau");
    expect(r).toEqual({ fehlt: expect.stringContaining("reel storyboard c-0007") });
  });

  it("eine Vorschau über 50 MB wird nicht gelesen", async () => {
    const p = schreibe("vorschau.mp4", "");
    fs.truncateSync(p, 50 * 1024 * 1024 + 1);
    expect(await reelQuellen(home, ID).bereit("vorschau")).toEqual({ fehlt: expect.stringContaining("50 MB") });
  });

  it("andere Dateien im Ordner zählen nicht", async () => {
    schreibe("vorschau.txt", "x");
    schreibe("vorschau-final.mp4", "x");
    expect(await reelQuellen(home, ID).bereit("vorschau")).toHaveProperty("fehlt");
  });
});

describe("Gegenlesen", () => {
  it("liest gegenlesen.md", async () => {
    schreibe("gegenlesen.md", "# Gegenlesen\nZeile 1");
    expect(await reelQuellen(home, ID).bereit("gegenlesen")).toEqual({ bytes: Buffer.from("# Gegenlesen\nZeile 1") });
  });
  it("genau 1 MB ist erlaubt, ein Byte mehr nicht", async () => {
    fs.truncateSync(schreibe("gegenlesen.md", ""), 1024 * 1024);
    expect(await reelQuellen(home, ID).bereit("gegenlesen")).toHaveProperty("bytes");
    fs.truncateSync(path.join(ergebnis, "gegenlesen.md"), 1024 * 1024 + 1);
    expect(await reelQuellen(home, ID).bereit("gegenlesen")).toHaveProperty("fehlt");
  });
  it("ein Ordner mit dem Namen der Datei ist keine Datei", async () => {
    fs.mkdirSync(path.join(ergebnis, "gegenlesen.md"));
    expect(await reelQuellen(home, ID).bereit("gegenlesen")).toEqual({ fehlt: expect.stringContaining("noch kein Gegenlesen") });
  });
  it("fehlt oder ist über 1 MB: Hinweis", async () => {
    expect(await reelQuellen(home, ID).bereit("gegenlesen")).toEqual({ fehlt: expect.stringContaining("reel vorbereiten c-0007") });
    fs.truncateSync(schreibe("gegenlesen.md", ""), 1024 * 1024 + 1);
    expect(await reelQuellen(home, ID).bereit("gegenlesen")).toEqual({ fehlt: expect.stringContaining("1 MB") });
  });
});

describe("Messwerte", () => {
  const roh = {
    datei: "/Users/andrej/OneDrive/Kunde Müller/export/video.mp4",
    messung: { breite: 1080, hoehe: 1920 },
    dauer: 40,
    breite: 1080,
    hoehe: 1920,
    fps: 30,
    schnitte: { anzahl: 5, proMinute: 7.5, quelle: "bild" },
    farbe: { saettigung: 0.3, yLow: 0.1, yHigh: 0.9, spanne: 0.8 },
    stille: { anteil: 0.1, laengste: 0.5 },
    ersteAussage: { sekunden: 0.3, quelle: "ton" },
    abweichungen: [],
    hinweise: [{ stufe: "hinweis", code: "x", text: "Ein Hinweis" }],
  };

  it("schickt die bereinigte Fassung, nie den Pfad der Datei", async () => {
    schreibe("qualitaet.json", JSON.stringify(roh));
    const r = await reelQuellen(home, ID).bereit("qualitaet");
    expect("bytes" in r).toBe(true);
    const text = (r as { bytes: Buffer }).bytes.toString("utf8");
    expect(text).not.toContain("Müller");
    expect(text).not.toContain("datei");
    expect(text).not.toContain("messung");
    expect(JSON.parse(text)).toMatchObject({ dauer: 40, schnitte: { anzahl: 5 }, hinweise: [{ code: "x", text: "Ein Hinweis" }] });
  });

  it("noch nicht gemessen: Hinweis", async () => {
    expect(await reelQuellen(home, ID).bereit("qualitaet")).toEqual({ fehlt: expect.stringContaining("reel messe c-0007") });
  });

  it("kaputte oder unvollständige Messwerte: Hinweis ohne den Inhalt der Datei", async () => {
    schreibe("qualitaet.json", "{kaputt Müller");
    const a = await reelQuellen(home, ID).bereit("qualitaet");
    expect(a).toHaveProperty("fehlt");
    expect(JSON.stringify(a)).not.toContain("Müller");
    schreibe("qualitaet.json", JSON.stringify({ dauer: 5 }));
    expect(await reelQuellen(home, ID).bereit("qualitaet")).toEqual({ fehlt: expect.stringContaining("unvollständig") });
  });
});

describe("Kontaktbogen", () => {
  const bogen = (bilder: Record<number, string | undefined>): BogenWerkzeuge => {
    let n = 0;
    return { bild: async () => bilder[++n] };
  };
  const lauf = (inhalt = "JPEG"): Ausfuehrer => async (_c, args) => (fs.writeFileSync(args[args.length - 1]!, inhalt), { code: 0, stdout: "", stderr: "" });

  it("ohne Plan ein Hinweis", async () => {
    expect(await reelQuellen(home, ID).bereit("kontaktbogen")).toEqual({ fehlt: expect.stringContaining("reel vorbereiten c-0007") });
  });

  it("nimmt den Plan mit Storyboard vor dem einfachen Plan und setzt die Standbilder zu einem Bild zusammen", async () => {
    schreibe("plan.json", JSON.stringify({ version: 1 }));
    lege(beispielPlan());
    schreibe("plan-storyboard.json", JSON.stringify(beispielPlan()));
    // der Beispielplan hat eine Grafik und ein B-Roll: zwei Einträge
    const r = await reelQuellen(home, ID, { bogen: bogen({ 1: Buffer.from("a").toString("base64"), 2: Buffer.from("b").toString("base64") }), lauf: lauf("COLLAGE") }).bereit("kontaktbogen");
    expect(r).toEqual({ bytes: Buffer.from("COLLAGE") });
  });

  it("der einfache Plan genügt, wenn es kein Storyboard gibt", async () => {
    lege(beispielPlan());
    schreibe("plan.json", JSON.stringify(beispielPlan()));
    const r = await reelQuellen(home, ID, { bogen: bogen({ 1: Buffer.from("a").toString("base64") }), lauf: lauf() }).bereit("kontaktbogen");
    expect("bytes" in r).toBe(true);
  });

  it("ein Plan ohne Grafik und B-Roll hat keinen Kontaktbogen", async () => {
    schreibe("plan.json", JSON.stringify(beispielPlan({ broll: [], overlays: [] })));
    expect(await reelQuellen(home, ID, { bogen: bogen({}), lauf: lauf() }).bereit("kontaktbogen")).toEqual({ fehlt: expect.stringContaining("weder Grafik noch B-Roll") });
  });

  it("wenn kein Standbild entsteht, sagt der Hinweis, was zu tun ist", async () => {
    schreibe("plan.json", JSON.stringify(beispielPlan()));
    const r = await reelQuellen(home, ID, { bogen: bogen({}), lauf: lauf() }).bereit("kontaktbogen");
    expect(r).toEqual({ fehlt: expect.stringContaining("schnitt kontaktbogen") });
  });

  it("ein kaputter Plan ist ein Hinweis ohne Inhalt der Datei", async () => {
    schreibe("plan.json", "{kaputt Müller");
    const r = await reelQuellen(home, ID).bereit("kontaktbogen");
    expect(r).toEqual({ fehlt: "Der Plan lässt sich nicht lesen." });
  });

  it("wird die Collage grösser als 8 MB, ist das ein Hinweis statt einer zu grossen Datei", async () => {
    lege(beispielPlan());
    schreibe("plan.json", JSON.stringify(beispielPlan()));
    const gross: Ausfuehrer = async (_c, args) => (fs.writeFileSync(args[args.length - 1]!, Buffer.alloc(8 * 1024 * 1024 + 1)), { code: 0, stdout: "", stderr: "" });
    const r = await reelQuellen(home, ID, { bogen: bogen({ 1: Buffer.from("a").toString("base64") }), lauf: gross }).bereit("kontaktbogen");
    expect(r).toEqual({ fehlt: expect.stringContaining("zusammensetzen") });
  });

  it("scheitert ffmpeg beim Zusammensetzen, ist das ein Hinweis", async () => {
    lege(beispielPlan());
    schreibe("plan.json", JSON.stringify(beispielPlan()));
    const r = await reelQuellen(home, ID, { bogen: bogen({ 1: Buffer.from("a").toString("base64") }), lauf: async () => ({ code: 1, stdout: "", stderr: "kaputt" }) }).bereit("kontaktbogen");
    expect(r).toEqual({ fehlt: expect.stringContaining("zusammensetzen") });
  });
});
