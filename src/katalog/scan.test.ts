import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { artVonDatei, findeDateien, gpsAusIso6709, metadatenAusProbe, scanne, vorschauZeiten, type ScanWerkzeuge } from "./scan";
import { naechsterSchluessel } from "./katalog";

const video = (extra: Record<string, unknown> = {}, format: Record<string, unknown> = {}) => ({
  streams: [{ codec_type: "video", width: 1920, height: 1080, avg_frame_rate: "25/1", ...extra }, { codec_type: "audio", sample_rate: "48000", channels: 2 }],
  format: { duration: "8.4", ...format },
});

describe("artVonDatei", () => {
  it("erkennt Videos, Fotos und Sounds an der Endung, ohne auf Gross- und Kleinschreibung zu achten", () => {
    expect(artVonDatei("A7C_0412.MOV")).toBe("video");
    expect(artVonDatei("x.jpeg")).toBe("foto");
    expect(artVonDatei("whoosh.wav")).toBe("sound");
    expect(artVonDatei("notiz.txt")).toBeUndefined();
    expect(artVonDatei("ohne-endung")).toBeUndefined();
  });
});

describe("metadatenAusProbe", () => {
  it("liest ein Querformat-Video: Dauer, Bildrate, Orientierung, Ton", () => {
    expect(metadatenAusProbe(video(), "video")).toMatchObject({ art: "video", dauer: 8.4, bildrate: 25, breite: 1920, hoehe: 1080, orientierung: "quer", zeitlupe: false, hatTon: true, log: false });
  });
  it("50p und 60p gelten als Zeitlupe, 29,97p nicht", () => {
    expect(metadatenAusProbe(video({ avg_frame_rate: "50/1" }), "video").zeitlupe).toBe(true);
    expect(metadatenAusProbe(video({ avg_frame_rate: "60000/1001" }), "video").zeitlupe).toBe(true);
    expect(metadatenAusProbe(video({ avg_frame_rate: "30000/1001" }), "video").zeitlupe).toBe(false);
    expect(metadatenAusProbe(video({ avg_frame_rate: "30000/1001" }), "video").bildrate).toBeCloseTo(29.97, 2);
  });
  it("gibt die Orientierung nach der Drehung an: ein iPhone-Video mit Drehung ist hochkant", () => {
    expect(metadatenAusProbe(video({ side_data_list: [{ side_data_type: "Display Matrix", rotation: -90 }] }), "video")).toMatchObject({ breite: 1080, hoehe: 1920, orientierung: "hoch" });
    expect(metadatenAusProbe(video({ width: 1080, height: 1080 }), "video").orientierung).toBe("quadrat");
  });
  it("liest Aufnahmezeit, Kamera und Ort", () => {
    const m = metadatenAusProbe(video({}, { tags: { creation_time: "2026-09-12T08:15:00.000000Z", "com.apple.quicktime.make": "Apple", "com.apple.quicktime.model": "iPhone 15 Pro", "com.apple.quicktime.location.ISO6709": "+47.3769+008.5417+410.2/" } }), "video");
    expect(m).toMatchObject({ aufnahme: "2026-09-12T08:15:00.000000Z", kamera: "Apple iPhone 15 Pro", gps: "47.3769, 8.5417" });
  });
  it("Fotos haben keine Dauer und keine Bildrate, Sounds keine Grösse", () => {
    const foto = metadatenAusProbe({ streams: [{ codec_type: "video", width: 4000, height: 6000, avg_frame_rate: "25/1" }], format: { duration: "0.04" } }, "foto");
    expect(foto).toMatchObject({ art: "foto", orientierung: "hoch", hatTon: false });
    expect(foto.dauer).toBeUndefined();
    expect(foto.bildrate).toBeUndefined();
    const sound = metadatenAusProbe({ streams: [{ codec_type: "audio", sample_rate: "44100", channels: 1 }], format: { duration: "1.5" } }, "sound");
    expect(sound).toMatchObject({ art: "sound", dauer: 1.5, hatTon: true });
    expect(sound.breite).toBeUndefined();
  });
});

describe("gpsAusIso6709 und vorschauZeiten", () => {
  it("liest Breite und Länge, auch mit Minuszeichen, und nichts bei Unbrauchbarem", () => {
    expect(gpsAusIso6709("+47.3769-008.5417/")).toBe("47.3769, -8.5417");
    expect(gpsAusIso6709("irgendwo")).toBeUndefined();
    expect(gpsAusIso6709(undefined)).toBeUndefined();
  });
  it("legt die drei Vorschaubilder auf 5, 50 und 95 Prozent", () => {
    expect(vorschauZeiten(10)).toEqual([0.5, 5, 9.5]);
  });
});

describe("findeDateien und scanne", () => {
  let dir: string;
  const datei = (rel: string, inhalt = "x") => {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, inhalt);
    return p;
  };
  beforeEach(() => (dir = fs.mkdtempSync(path.join(os.tmpdir(), "scan-"))));
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("findet Dateien bekannter Art in Unterordnern, sortiert, ohne versteckte Dateien und Ordner", () => {
    datei("kunde/gossau/b.mov");
    datei("kunde/gossau/a.JPG");
    datei("kunde/._a.mov");
    datei(".Spotlight/x.mov");
    datei("notiz.txt");
    datei("whoosh.wav");
    expect(findeDateien(dir).map((p) => path.relative(dir, p))).toEqual(["kunde/gossau/a.JPG", "kunde/gossau/b.mov", "whoosh.wav"]);
  });

  const werkzeuge = (probes: Record<string, unknown>, vorschauen: string[] = []): ScanWerkzeuge => ({
    probe: async (d) => {
      const p = probes[path.basename(d)];
      if (!p) throw new Error("ffprobe: Datei nicht lesbar");
      return p;
    },
    vorschau: async (d, zeit, ziel) => {
      vorschauen.push(`${path.basename(d)}@${zeit ?? "-"}`);
      fs.mkdirSync(path.dirname(ziel), { recursive: true });
      fs.writeFileSync(ziel, "jpg");
    },
  });
  const opt = (extra: Record<string, unknown> = {}) => ({
    ordner: dir,
    relativ: (abs: string) => path.relative(dir, abs).split(path.sep).join("/") && `rohmaterial/${path.relative(dir, abs).split(path.sep).join("/")}`,
    bekannt: new Set<string>(),
    naechster: naechsterSchluessel([]),
    datenDir: path.join(dir, "..", `daten-${path.basename(dir)}`),
    ...extra,
  });

  it("legt je Datei einen offenen Eintrag an: Schlüssel, Pfad, Ordnerhinweis, Vorschaubilder je nach Art", async () => {
    datei("kunde-x/gossau/clip.mov");
    datei("kunde-x/gossau/foto.jpg");
    datei("kunde-x/whoosh.wav");
    const vor: string[] = [];
    const r = await scanne(
      opt({
        werkzeuge: werkzeuge(
          { "clip.mov": video({}, { duration: "10" }), "foto.jpg": { streams: [{ codec_type: "video", width: 3000, height: 2000 }], format: { duration: "0.04" } }, "whoosh.wav": { streams: [{ codec_type: "audio", sample_rate: "48000", channels: 2 }], format: { duration: "1" } } },
          vor,
        ),
      }),
    );
    expect(r.neu.map((e) => [e.schluessel, e.art, e.pfad])).toEqual([
      ["k-0001", "video", "rohmaterial/kunde-x/gossau/clip.mov"],
      ["k-0002", "foto", "rohmaterial/kunde-x/gossau/foto.jpg"],
      ["k-0003", "sound", "rohmaterial/kunde-x/whoosh.wav"],
    ]);
    expect(r.neu[0]!.ordnerHinweis).toEqual(["kunde-x", "gossau"]);
    expect(r.neu[2]!.ordnerHinweis).toEqual(["kunde-x"]);
    expect(r.neu[0]!.vorschau).toEqual(["katalog/vorschau/k-0001-a.jpg", "katalog/vorschau/k-0001-b.jpg", "katalog/vorschau/k-0001-c.jpg"]);
    expect(r.neu[1]!.vorschau).toEqual(["katalog/vorschau/k-0002-a.jpg"]);
    expect(r.neu[2]!.vorschau).toEqual([]);
    expect(vor).toEqual(["clip.mov@0.5", "clip.mov@5", "clip.mov@9.5", "foto.jpg@-"]);
    fs.rmSync(opt().datenDir, { recursive: true, force: true });
  });

  it("überspringt bekannte Pfade, vergibt weiter nach dem höchsten Schlüssel und merkt sich unlesbare Dateien", async () => {
    datei("a.mov");
    datei("b.mov");
    datei("kaputt.mov");
    const r = await scanne(opt({ bekannt: new Set(["rohmaterial/a.mov"]), naechster: naechsterSchluessel(["k-0041"]), ohneVorschau: true, werkzeuge: werkzeuge({ "a.mov": video(), "b.mov": video() }) }));
    expect(r.bekannt).toBe(1);
    expect(r.neu.map((e) => [e.schluessel, e.pfad])).toEqual([["k-0042", "rohmaterial/b.mov"]]);
    expect(r.uebersprungen).toEqual([{ datei: path.join(dir, "kaputt.mov"), grund: "ffprobe: Datei nicht lesbar" }]);
    expect(r.neu[0]!.vorschau).toEqual([]);
  });

  it("hört beim Maximum auf und meldet, wie viele zurückgestellt sind", async () => {
    for (const n of ["a", "b", "c", "d"]) datei(`${n}.mov`);
    const r = await scanne(opt({ maximal: 2, ohneVorschau: true, werkzeuge: werkzeuge({ "a.mov": video(), "b.mov": video(), "c.mov": video(), "d.mov": video() }) }));
    expect(r.neu).toHaveLength(2);
    expect(r.zurueckgestellt).toBe(2);
  });

  it("meldet Dateien ausserhalb von Studio- und Medien-Ordner, statt einen falschen Pfad zu schreiben", async () => {
    datei("a.mov");
    const r = await scanne(opt({ relativ: () => null, werkzeuge: werkzeuge({ "a.mov": video() }) }));
    expect(r.neu).toEqual([]);
    expect(r.uebersprungen[0]!.grund).toContain("ausserhalb");
  });

  it("schreibt ein Foto mit missglücktem Vorschaubild trotzdem auf und nennt das Problem", async () => {
    datei("a.mov");
    const w = werkzeuge({ "a.mov": video({}, { duration: "4" }) });
    let n = 0;
    const r = await scanne(opt({ werkzeuge: { ...w, vorschau: async (d: string, z: number | undefined, ziel: string) => (++n === 2 ? Promise.reject(new Error("ffmpeg: kein Bild")) : w.vorschau(d, z, ziel)) } }));
    expect(r.neu[0]!.vorschau).toHaveLength(2);
    expect(r.uebersprungen.map((u) => u.grund)).toEqual(["Vorschaubild b: ffmpeg: kein Bild"]);
    fs.rmSync(opt().datenDir, { recursive: true, force: true });
  });
});
