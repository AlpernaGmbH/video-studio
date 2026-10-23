import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { findeSchrift } from "../katalog/bogen";
import { bogenGraph, echteWerkzeuge, filterPfad, jpegMitDrehung, kachelHoehe, kornSaat, KACHEL, KACHEL_HOEHE, lookArgumente, pruefeWerkzeug, schreibeBogen, wendeLookAn, type FotoWerkzeuge, type LaufErgebnis } from "./werkzeug";

const leer: LaufErgebnis = { code: 0, stdout: Buffer.alloc(0), stderr: "" };

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "studio-werkzeug-"));
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("lookArgumente", () => {
  const basis = { eingang: "/m/a.jpg", ausgang: "/m/aus/a.jpg" };

  it("wendet die LUT tetraedrisch an und streicht standardmässig alle Metadaten (auch den Aufnahmeort)", () => {
    const a = lookArgumente({ ...basis, cube: "/t/look.cube" });
    const kette = a[a.indexOf("-vf") + 1]!;
    expect(kette).toBe("format=rgb24,lut3d=file='/t/look.cube':interp=tetrahedral,format=yuvj420p");
    expect(a).toContain("-map_metadata");
    expect(a[a.indexOf("-map_metadata") + 1]).toBe("-1");
    expect(a[a.length - 1]).toBe("/m/aus/a.jpg");
  });

  it("mit exifBehalten fehlt das Streichen der Metadaten", () => {
    expect(lookArgumente({ ...basis, cube: "/t/l.cube", exifBehalten: true })).not.toContain("-map_metadata");
  });

  it("ohne LUT wird nur neu codiert (Foto ohne Look)", () => {
    const kette = lookArgumente(basis)[lookArgumente(basis).indexOf("-vf") + 1]!;
    expect(kette).toBe("format=rgb24,format=yuvj420p");
  });

  it("Korn kommt nur bei Stärke über 0, mit fester Saat je Dateiname", () => {
    const ohne = lookArgumente({ ...basis, korn: 0 }).join(" ");
    expect(ohne).not.toContain("noise");
    const mit = lookArgumente({ ...basis, korn: 0.25 }).join(" ");
    expect(mit).toContain(`noise=alls=5:allf=u:all_seed=${kornSaat("a.jpg")}`);
    expect(lookArgumente({ ...basis, korn: 0.25 }).join(" ")).toBe(mit);
  });

  it("zum Verkleinern kommt die Skalierung zuerst, vor der Umrechnung", () => {
    const kette = lookArgumente({ ...basis, laengsteSeite: 720 })[lookArgumente({ ...basis, laengsteSeite: 720 }).indexOf("-vf") + 1]!;
    expect(kette.startsWith("scale=720:720:force_original_aspect_ratio=decrease")).toBe(true);
  });

  it("Pfade mit Doppelpunkt und Hochkomma werden für den Filter geschützt", () => {
    expect(filterPfad("/a b/c:d/e'f.cube")).toBe("/a b/c\\:d/e\\\\\\'f.cube");
    expect(lookArgumente({ ...basis, cube: "/x/c:d.cube" }).join(" ")).toContain("file='/x/c\\:d.cube'");
  });

  it("die Saat ist stabil und hängt vom Namen ab", () => {
    expect(kornSaat("IMG_1.jpg")).toBe(kornSaat("IMG_1.jpg"));
    expect(kornSaat("IMG_1.jpg")).not.toBe(kornSaat("IMG_2.jpg"));
    expect(kornSaat("x")).toBeGreaterThan(0);
  });
});

describe("jpegMitDrehung", () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9]);

  it("setzt einen EXIF-Block direkt hinter den Dateianfang, mit der richtigen Länge und Drehung", () => {
    const r = jpegMitDrehung(jpeg, 6);
    expect([...r.subarray(0, 4)]).toEqual([0xff, 0xd8, 0xff, 0xe1]);
    expect(r.readUInt16BE(4)).toBe(34);
    expect(r.subarray(6, 12).toString("latin1")).toBe("Exif\0\0");
    expect(r[12 + 8 + 2 + 8 + 1]).toBe(6);
    // der Rest der Datei folgt unverändert
    expect(r.subarray(2 + 2 + 34)).toEqual(jpeg.subarray(2));
  });

  it("lehnt Dateien ohne JPEG-Anfang und ungültige Drehungen ab", () => {
    expect(() => jpegMitDrehung(Buffer.from("kein jpeg"), 6)).toThrow(/kein JPEG/);
    expect(() => jpegMitDrehung(jpeg, 0)).toThrow(/1 bis 8/);
    expect(() => jpegMitDrehung(jpeg, 9)).toThrow(/1 bis 8/);
  });
});

describe("bogenGraph", () => {
  it("ohne Beschriftung: Zeilen aus Kacheln, untereinander", () => {
    const g = bogenGraph(3, 2);
    expect(g).toContain("hstack=inputs=3[h0]");
    expect(g).toContain("hstack=inputs=3[h1]");
    expect(g).toContain("[h0][h1]vstack=inputs=2[aus]");
    expect(g).not.toContain("drawtext");
    expect(g.match(/scale=360:360/g)).toHaveLength(6);
  });

  it("mit Beschriftung: Kopfzeile mit den Spalten, ein Streifen über jeder Zeile", () => {
    const texte = ["s0", "s1", "z0", "z1"].map((n) => `/t/${n}.txt`);
    const g = bogenGraph(2, 2, texte, "/fonts/Arial.ttf");
    expect(g.match(/drawtext/g)).toHaveLength(4);
    expect(g).toContain("[kopf][z0][h0][z1][h1]vstack=inputs=5[aus]");
    expect(g).toContain(`s=${KACHEL.breite * 2}x${KACHEL.streifen}`);
  });

  it("die Zellenhöhe lässt sich vorgeben (Hochformat)", () => {
    const g = bogenGraph(2, 1, undefined, undefined, 640);
    expect(g).toContain("scale=360:640");
    expect(g).toContain("pad=360:640");
    expect(g).not.toContain("scale=360:360");
  });

  it("eine einzige Spalte braucht kein hstack", () => {
    expect(bogenGraph(1, 1)).toContain("null[h0]");
    expect(bogenGraph(1, 1)).not.toContain("hstack");
  });
});

describe("pruefeWerkzeug", () => {
  const ersatz = (filter: string, probe: string): FotoWerkzeuge => ({
    ffmpeg: async (args) => {
      if (args.includes("-filters")) return { ...leer, stdout: Buffer.from(filter) };
      const ziel = args[args.length - 1]!;
      fs.writeFileSync(ziel, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
      return leer;
    },
    ffprobe: async () => ({ ...leer, stdout: Buffer.from(probe) }),
  });

  it("ein ffmpeg ohne lut3d wird benannt", async () => {
    await expect(pruefeWerkzeug(ersatz(" T.. scale  V->V\n", "32,64"))).rejects.toThrow(/lut3d/);
  });

  it("ein ffmpeg, das nach EXIF nicht aufrichtet, wird benannt (sonst kämen Hochformat-Fotos gedreht heraus)", async () => {
    await expect(pruefeWerkzeug(ersatz(" TS. lut3d  V->V\n", "64,32"))).rejects.toThrow(/EXIF-Drehung/);
  });

  it("ein ffmpeg, das aufrichtet, besteht", async () => {
    await expect(pruefeWerkzeug(ersatz(" TS. lut3d  V->V\n", "32,64\n"))).resolves.toBeUndefined();
  });

  it("fehlt ffmpeg, sagt die Meldung, was zu tun ist", async () => {
    const w: FotoWerkzeuge = { ffmpeg: async () => Promise.reject(new Error("ENOENT")), ffprobe: async () => leer };
    await expect(pruefeWerkzeug(w)).rejects.toThrow(/brew install ffmpeg/);
  });
});

describe("wendeLookAn schreibt nie ein halbes Foto", () => {
  it("schlägt ffmpeg fehl, bleibt weder eine Zwischendatei noch ein Ergebnis zurück", async () => {
    const ausgang = path.join(tmp, "aus", "a.jpg");
    const w: FotoWerkzeuge = {
      ffmpeg: async (args) => {
        fs.writeFileSync(args[args.length - 1]!, "halb");
        return { code: 1, stdout: Buffer.alloc(0), stderr: "Invalid data found\nbeim Lesen" };
      },
      ffprobe: async () => leer,
    };
    await expect(wendeLookAn(w, { eingang: path.join(tmp, "a.jpg"), ausgang })).rejects.toThrow(/schlug fehl bei a\.jpg.*beim Lesen/);
    expect(fs.existsSync(ausgang)).toBe(false);
    expect(fs.readdirSync(path.join(tmp, "aus"))).toEqual([]);
  });

  it("ein vorhandenes Ergebnis bleibt bei einem Fehler unangetastet", async () => {
    const ausgang = path.join(tmp, "a.jpg");
    fs.writeFileSync(ausgang, "alt");
    const w: FotoWerkzeuge = { ffmpeg: async () => ({ code: 1, stdout: Buffer.alloc(0), stderr: "x" }), ffprobe: async () => leer };
    await expect(wendeLookAn(w, { eingang: "e.jpg", ausgang })).rejects.toThrow();
    expect(fs.readFileSync(ausgang, "utf8")).toBe("alt");
  });
});

const hatFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
const schrift = findeSchrift();

describe.skipIf(!hatFfmpeg || !schrift)("Beschriftung des Bogens mit echtem ffmpeg", () => {
  it("der Text in den Streifen erscheint auch mit «%», «\\», Hochkomma und Doppelpunkt im Namen (sonst bleibt der Streifen leer)", async () => {
    const kachel = path.join(tmp, "k.jpg");
    spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=gray:s=64x64:d=1", "-frames:v", "1", kachel]);
    for (const name of ["IMG_0003.JPG   (Helligkeit 23 %)", "100%.jpg", "C:\\a'b.jpg", "%{pts}"]) {
      const aus = path.join(tmp, "bogen.jpg");
      await schreibeBogen(echteWerkzeuge, { spalten: ["Spalte"], zeilen: [{ name, kacheln: [kachel] }], schrift, ausgang: aus });
      // die Zeilenbeschriftung liegt unter der Kopfzeile: y von 40 bis 80
      const r = await echteWerkzeuge.ffmpeg(["-loglevel", "error", "-i", aus, "-vf", `crop=${KACHEL.breite}:${KACHEL.streifen}:0:${KACHEL.streifen},format=gray`, "-frames:v", "1", "-f", "rawvideo", "-"]);
      expect(Math.max(...r.stdout), name).toBeGreaterThan(200);
    }
  });
});

describe("kachelHoehe", () => {
  it("ohne Angaben ist die Zelle ein Quadrat", () => {
    expect(kachelHoehe([])).toBe(KACHEL.hoehe);
    expect(kachelHoehe([Number.NaN, 0, -1])).toBe(KACHEL.hoehe);
  });
  it("folgt dem mittleren Seitenverhältnis: Hochformat 4:5 und 9:16, Querformat 3:2", () => {
    expect(kachelHoehe([1.25, 1.25, 1.25])).toBe(450);
    expect(kachelHoehe([16 / 9, 16 / 9])).toBe(640);
    expect(kachelHoehe([2 / 3, 2 / 3, 2 / 3])).toBe(240);
  });
  it("ein Ausreisser verschiebt die Höhe nicht (der mittlere Wert zählt)", () => {
    expect(kachelHoehe([1.25, 1.25, 0.3])).toBe(450);
  });
  it("bleibt in den Grenzen, auch bei einem Panorama und einem sehr hohen Foto", () => {
    expect(kachelHoehe([0.1])).toBe(KACHEL_HOEHE.min);
    expect(kachelHoehe([9])).toBe(KACHEL_HOEHE.max);
  });
  it("die Höhe ist gerade (Video-Filter von ffmpeg mögen ungerade Masse nicht)", () => {
    for (const a of [0.77, 1.11, 1.333, 1.5]) expect(kachelHoehe([a]) % 2).toBe(0);
  });
});
