import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { echteWerkzeuge, type FotoWerkzeuge, type LaufErgebnis } from "../foto/werkzeug";
import { findeSchrift } from "../katalog/bogen";
import { bogenGraph, KACHEL, KACHEL_HOEHE, schreibeBogen, SPALTEN, type Kachel } from "./shotliste-bogen";

const leer: LaufErgebnis = { code: 0, stdout: Buffer.alloc(0), stderr: "" };
const dateien = (n: number) => Array.from({ length: n }, (_, i) => ({ streifen: `/t/s${i}.txt`, platzhalter: `/t/p${i}.txt` }));

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "studio-shotliste-test-"));
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("bogenGraph (rein)", () => {
  it("drei Kacheln mit Bild: eine Zeile, Bilder als Eingänge 0, 1, 2, jede Kachel mit Streifen darunter", () => {
    const g = bogenGraph([{ hatBild: true }, { hatBild: true }, { hatBild: true }], dateien(3), "/f/Arial.ttf");
    for (const i of [0, 1, 2]) {
      expect(g).toContain(`[${i}:v]scale=${KACHEL.breite}:${KACHEL.bild}:force_original_aspect_ratio=decrease,pad=${KACHEL.breite}:${KACHEL.bild}:(ow-iw)/2:(oh-ih)/2:color=0x1c1c1c[b${i}]`);
      expect(g).toContain(`[b${i}][s${i}]vstack=inputs=2[z${i}]`);
    }
    expect(g).toContain("[z0][z1][z2]hstack=inputs=3[r0]");
    expect(g).toContain("[r0]null[aus]");
    expect(g).not.toContain("vstack=inputs=1");
  });

  it("eine Kachel ohne Bild ist kein Eingang: die Eingänge zählen nur die Kacheln mit Bild", () => {
    const g = bogenGraph([{ hatBild: true }, { hatBild: false }, { hatBild: true }], dateien(3), "/f/Arial.ttf");
    expect(g).toContain("[0:v]scale");
    expect(g).toContain("[1:v]scale");
    expect(g).not.toContain("[2:v]");
    // die Kachel 1 ist eine einfarbige Fläche mit Text aus der Platzhalter-Datei
    expect(g).toContain("color=c=0x2a2a2a:s=320x400:d=1,drawtext=");
    expect(g).toContain("textfile='/t/p1.txt'");
    expect(g).toMatch(/\[1:v\]scale=[^;]*\[b2\]/);
  });

  it("die letzte Zeile wird mit dunklen Flächen aufgefüllt, damit alle Zeilen gleich breit sind", () => {
    const g = bogenGraph(Array.from({ length: 4 }, () => ({ hatBild: true })), dateien(4), "/f/Arial.ttf");
    expect(g).toContain("[z0][z1][z2]hstack=inputs=3[r0]");
    expect(g).toContain(`color=c=0x0d0d0d:s=${KACHEL.breite}x${KACHEL_HOEHE}:d=1[l4]`);
    expect(g).toContain("[z3][l4][l5]hstack=inputs=3[r1]");
    expect(g).toContain("[r0][r1]vstack=inputs=2[aus]");
  });

  it("jeder Text kommt aus einer Datei und wird nicht ausgewertet (expansion=none), sonst bleibt der Streifen bei einem «%» leer", () => {
    const g = bogenGraph([{ hatBild: true }, { hatBild: false }], dateien(2), "/f/Arial.ttf");
    const texte = g.match(/drawtext=[^\[]*/g) ?? [];
    expect(texte).toHaveLength(3);
    for (const t of texte) {
      expect(t).toContain("expansion=none");
      expect(t).toContain("textfile=");
      expect(t).not.toMatch(/[^e]text='/);
    }
  });

  it("Schrift- und Textpfade werden für den Filter geschützt (Doppelpunkt, Hochkomma, Schrägstrich)", () => {
    const g = bogenGraph([{ hatBild: true }], [{ streifen: "C:\\a'b\\s.txt", platzhalter: "/t/p.txt" }], "C:\\Fonts\\Ar'ial.ttf");
    expect(g).toContain("fontfile='C\\:/Fonts/Ar\\\\\\'ial.ttf'");
    expect(g).toContain("textfile='C\\:/a\\\\\\'b/s.txt'");
  });

  it("ohne Kacheln oder mit zu wenigen Textdateien wirft er", () => {
    expect(() => bogenGraph([], [], "/f/a.ttf")).toThrow(/keine Kacheln/);
    expect(() => bogenGraph([{ hatBild: true }], [], "/f/a.ttf")).toThrow(/zwei Textdateien/);
  });
});

const kachel = (o: Partial<Kachel> = {}): Kachel => ({ platzhalter: "Kein Beispielbild", text: "1 · Nah · 3 s\nkein Beispielbild\nHände mit Pinsel", ...o });

describe("schreibeBogen (mit Ersatz für ffmpeg)", () => {
  const ersatz = (filter: string, lauf: (args: string[]) => LaufErgebnis): FotoWerkzeuge & { aufrufe: string[][] } => {
    const aufrufe: string[][] = [];
    return {
      aufrufe,
      ffmpeg: async (args) => {
        aufrufe.push(args);
        if (args.includes("-filters")) return { ...leer, stdout: Buffer.from(filter) };
        return lauf(args);
      },
      ffprobe: async () => leer,
    };
  };
  const schreibt = (args: string[]): LaufErgebnis => {
    fs.writeFileSync(args[args.length - 1]!, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    return leer;
  };

  it("ein ffmpeg ohne drawtext wird mit dem Rat zur Neuinstallation benannt", async () => {
    const w = ersatz(" T.. scale  V->V\n", schreibt);
    await expect(schreibeBogen(w, { kacheln: [kachel()], schrift: "/f/a.ttf", ausgang: path.join(tmp, "b.jpg") })).rejects.toThrow(/drawtext.*brew reinstall ffmpeg/);
  });

  it("nur Kacheln mit Bild werden als Eingang übergeben, und der Bogen ist ein einziges Bild", async () => {
    const w = ersatz(" T.. drawtext  V->V\n", schreibt);
    const aus = path.join(tmp, "ergebnis", "b.jpg");
    await schreibeBogen(w, { kacheln: [kachel({ bild: "/m/a.jpg" }), kachel(), kachel({ bild: "/m/c.jpg" })], schrift: "/f/a.ttf", ausgang: aus });
    const args = w.aufrufe.find((a) => !a.includes("-filters"))!;
    expect(args.filter((x) => x === "-i")).toHaveLength(2);
    expect(args).toContain("/m/a.jpg");
    expect(args).toContain("/m/c.jpg");
    expect(args[args.indexOf("-frames:v") + 1]).toBe("1");
    expect(fs.existsSync(aus)).toBe(true);
    expect(fs.readdirSync(path.dirname(aus))).toEqual(["b.jpg"]);
  });

  it("schlägt ffmpeg fehl, bleibt nichts zurück, und ein vorhandener Bogen bleibt unangetastet", async () => {
    const aus = path.join(tmp, "b.jpg");
    fs.writeFileSync(aus, "alt");
    const w = ersatz(" T.. drawtext  V->V\n", (args) => {
      fs.writeFileSync(args[args.length - 1]!, "halb");
      return { code: 1, stdout: Buffer.alloc(0), stderr: "Invalid argument\nbeim Filter" };
    });
    await expect(schreibeBogen(w, { kacheln: [kachel()], schrift: "/f/a.ttf", ausgang: aus })).rejects.toThrow(/schlug beim Bogen der Shotliste fehl.*beim Filter/);
    expect(fs.readFileSync(aus, "utf8")).toBe("alt");
    expect(fs.readdirSync(tmp)).toEqual(["b.jpg"]);
  });

  it("ohne Kacheln wirft er, bevor er ffmpeg ruft", async () => {
    const w = ersatz(" T.. drawtext  V->V\n", schreibt);
    await expect(schreibeBogen(w, { kacheln: [], schrift: "/f/a.ttf", ausgang: path.join(tmp, "b.jpg") })).rejects.toThrow(/keine Kacheln/);
    expect(w.aufrufe).toHaveLength(0);
  });
});

const hatFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
const schrift = findeSchrift();

describe.skipIf(!hatFfmpeg || !schrift)("Bogen mit echtem ffmpeg", () => {
  const farbe = (name: string, c: string, s = "90x160"): string => {
    const aus = path.join(tmp, name);
    spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", `color=c=${c}:s=${s}:d=1`, "-frames:v", "1", aus]);
    return aus;
  };
  /** Die Pixel eines Ausschnitts als rohe Grauwerte oder RGB. */
  const ausschnitt = async (bild: string, w: number, h: number, x: number, y: number, format: "gray" | "rgb24"): Promise<Buffer> => {
    const r = await echteWerkzeuge.ffmpeg(["-loglevel", "error", "-i", bild, "-vf", `crop=${w}:${h}:${x}:${y},format=${format}`, "-frames:v", "1", "-f", "rawvideo", "-"]);
    return r.stdout;
  };

  it("zwei Zeilen: Bild, Platzhalter, ein Streifen mit «%» und aufgefüllte Flächen stehen an ihrem Platz", async () => {
    const rot = farbe("rot.jpg", "red");
    const aus = path.join(tmp, "bogen.jpg");
    await schreibeBogen(echteWerkzeuge, {
      kacheln: [
        kachel({ bild: rot, text: "1 · Nah · 3 s\nk-0001\nHände" }),
        kachel({ platzhalter: "Kein Beispielbild" }),
        kachel({ bild: rot }),
        kachel({ text: "Helligkeit 23 % und 100%\nzweite Zeile" }),
      ],
      schrift: schrift!,
      ausgang: aus,
    });
    expect(fs.readFileSync(aus).subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    expect(fs.statSync(aus).size).toBeLessThan(8 * 1024 * 1024);
    const probe = await echteWerkzeuge.ffprobe(["-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", aus]);
    expect(probe.stdout.toString().trim()).toBe(`${KACHEL.breite * SPALTEN},${KACHEL_HOEHE * 2}`);

    // Kachel 0: das Bild ist rot (Mitte des Bildbereichs)
    const [r0, g0] = await ausschnitt(aus, 8, 8, 156, 196, "rgb24");
    expect(r0).toBeGreaterThan(200);
    expect(g0).toBeLessThan(60);
    // Kachel 1: der Platzhalter ist grau mit hellem Text in der Mitte
    const mitte = await ausschnitt(aus, KACHEL.breite, 60, KACHEL.breite, 170, "gray");
    expect(Math.max(...mitte)).toBeGreaterThan(200);
    // Streifen von Kachel 0: Text ist da
    expect(Math.max(...(await ausschnitt(aus, KACHEL.breite, KACHEL.text, 0, KACHEL.bild, "gray")))).toBeGreaterThan(200);
    // Kachel 3 (zweite Zeile, links): der Streifen mit «%» zeigt Text (ohne expansion=none bliebe er leer)
    expect(Math.max(...(await ausschnitt(aus, KACHEL.breite, KACHEL.text, 0, KACHEL_HOEHE + KACHEL.bild, "gray")))).toBeGreaterThan(200);
    // aufgefüllte Fläche (zweite Zeile, rechts): dunkel
    const [rf] = await ausschnitt(aus, 8, 8, KACHEL.breite * 2 + 156, KACHEL_HOEHE + 196, "rgb24");
    expect(rf).toBeLessThan(40);
  });

  it("Zeichen, die ffmpeg auswerten würde, stehen im Streifen: «%{pts}», Doppelpunkt, Hochkomma, Umlaute", async () => {
    for (const text of ["%{pts} und 100%", "Zeit 10:30 Uhr", "Nathalies Pinsel's Haar", "Grüne Wände, schöne Äste"]) {
      const aus = path.join(tmp, "b2.jpg");
      await schreibeBogen(echteWerkzeuge, { kacheln: [kachel({ text })], schrift: schrift!, ausgang: aus });
      expect(Math.max(...(await ausschnitt(aus, KACHEL.breite, KACHEL.text, 0, KACHEL.bild, "gray"))), text).toBeGreaterThan(200);
    }
  });

  it("40 Kacheln ergeben ein Bild unter der Grenze für das Hochladen (8 MiB)", async () => {
    const rot = farbe("rot.jpg", "red");
    const aus = path.join(tmp, "gross.jpg");
    await schreibeBogen(echteWerkzeuge, { kacheln: Array.from({ length: 40 }, (_, i) => kachel(i % 2 ? { bild: rot } : {})), schrift: schrift!, ausgang: aus });
    expect(fs.statSync(aus).size).toBeLessThan(8 * 1024 * 1024);
  });
});
