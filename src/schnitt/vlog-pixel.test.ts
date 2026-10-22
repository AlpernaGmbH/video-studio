import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { leseCube, wendeCubeAn, type Rgb } from "./lut";
import { leseSchnittplan } from "./plan";
import { erzeugeVorschau } from "./vorschau";
import { VLOG_LUT_GROESSE, baueVlogCube } from "./vlog-lut";
import { vlogZuRec709, linearZuVlog } from "./vlog";
import { rechneFarbe } from "./lut";

/**
 * Die Gegenprobe zur Mathematik (vlog.test.ts, vlog-lut.test.ts): Dort stimmt jede Rechnung mit sich selbst überein. Hier läuft ein Testbild mit bekannten V-Log-Codes
 * durch die echte Vorschau-Kette (ffmpeg: Umwandlung nach RGB, LUT, zurück, H.264) und wird als Bild gelesen. Erst das zeigt, dass Bereich, Matrix und Etiketten stimmen.
 *
 * Das Testbild ist künstlich (vier Streifen aus berechneten Codes), keine Aufnahme der Kamera: Es belegt die Kette, nicht das Verhalten der Lumix-Dateien (Test T11).
 */

const hatFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

const B = 320;
const H = 568;
/** Vier Streifen: Schwarz (Code 128), 18 % Grau (433), 90 % Weiss (602) und eine kräftige Farbe, damit eine falsche Matrix auffällt. Codes 0 bis 1 (durch 1023). */
const STREIFEN: Rgb[] = [
  { r: 128 / 1023, g: 128 / 1023, b: 128 / 1023 },
  { r: 433 / 1023, g: 433 / 1023, b: 433 / 1023 },
  { r: 602 / 1023, g: 602 / 1023, b: 602 / 1023 },
  { r: 0.55, g: 0.3, b: 0.25 },
];
const NAMEN = ["Schwarz", "18 % Grau", "90 % Weiss", "Farbe"];
const look = { gamma: 1, kontrast: 0.3, saettigung: 0.92, kuehle: 0.35 };

describe.skipIf(!hatFfmpeg)("V-Log durch die echte Vorschau-Kette (Pixelprobe)", () => {
  let dir: string;
  let lutDatei: string;
  let cube: { groesse: number; werte: Rgb[] };
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "vlog-pixel-"));
    lutDatei = path.join(dir, "farbe-log.cube");
    fs.writeFileSync(lutDatei, baueVlogCube("Test", look));
    cube = leseCube(fs.readFileSync(lutDatei, "utf8"));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const ff = (...a: string[]) => {
    const r = spawnSync("ffmpeg", ["-loglevel", "error", "-y", ...a]);
    expect(r.status, `${a.join(" ")}\n${r.stderr?.toString()}`).toBe(0);
  };

  /**
   * Schreibt ein Video, so wie eine Kamera V-Log ablegt: die Codes als Y'CbCr mit BT.709, 10 Bit, 4:2:0.
   * `daten`: ob die Codes den vollen Bereich (0 bis 1023) oder den begrenzten (64 bis 940) belegen. `etikett`: was die Datei dazu behauptet.
   */
  const vlogVideo = (name: string, daten: "voll" | "begrenzt", etikett: "voll" | "begrenzt" | "keines"): string => {
    const roh = Buffer.alloc(B * H * 6);
    for (let y = 0; y < H; y++) {
      const c = STREIFEN[Math.min(3, Math.floor((y * 4) / H))]!;
      for (let x = 0; x < B; x++) {
        const o = (y * B + x) * 6;
        roh.writeUInt16LE(Math.round(c.r * 65535), o);
        roh.writeUInt16LE(Math.round(c.g * 65535), o + 2);
        roh.writeUInt16LE(Math.round(c.b * 65535), o + 4);
      }
    }
    const rohDatei = path.join(dir, `${name}.rgb`);
    fs.writeFileSync(rohDatei, roh);
    const ziel = path.join(dir, `${name}.mkv`);
    const tags = etikett === "keines" ? [] : ["-color_range", etikett === "voll" ? "pc" : "tv", "-colorspace", "bt709"];
    ff("-f", "rawvideo", "-pix_fmt", "rgb48le", "-s", `${B}x${H}`, "-framerate", "25", "-i", rohDatei, "-vf", `scale=out_range=${daten === "voll" ? "full" : "limited"}:out_color_matrix=bt709,format=yuv420p10le,tpad=stop_mode=clone:stop_duration=1`, "-t", "1", ...tags, "-c:v", "ffv1", ziel);
    return ziel;
  };

  const vorschau = async (video: string, quelle: Record<string, unknown> = {}): Promise<string> => {
    const plan = leseSchnittplan({
      version: 1,
      projekt: { name: "T", marke: "alperna" },
      quellen: [{ id: "q1", pfad: path.basename(video), art: "video", dauer: 1, fps: 25, breite: B, hoehe: H, farbe: "log", ...quelle }],
      clips: [{ id: "c1", quelle: "q1", von: 0, bis: 0.8 }],
    });
    const aus = path.join(dir, `${path.basename(video, ".mkv")}.mp4`);
    await erzeugeVorschau({ plan, loese: (rel) => path.join(dir, path.basename(rel)), ausgabe: aus, lut: { log: lutDatei } });
    return aus;
  };

  /** Mittlere Farbe (0 bis 255) in der Mitte eines Streifens der Vorschau, gelesen wie ein Player: mit den Etiketten der Datei. */
  const streifen = (datei: string, i: number): number[] => {
    const y = Math.round((960 * (i + 0.5)) / 4) - 50;
    const r = spawnSync("ffmpeg", ["-loglevel", "error", "-ss", "0.2", "-i", datei, "-frames:v", "1", "-vf", `crop=100:100:220:${y},scale=1:1`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]);
    return [...r.stdout];
  };
  const erwartet = (i: number): number[] => {
    const o = wendeCubeAn(cube, STREIFEN[i]!);
    return [o.r * 255, o.g * 255, o.b * 255];
  };
  const abstand = (datei: string): number[] => STREIFEN.map((_, i) => Math.max(...streifen(datei, i).map((v, k) => Math.abs(v - erwartet(i)[k]!))));
  const probe = (datei: string) => (JSON.parse(spawnSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", datei]).stdout.toString()) as { streams: { codec_type: string; color_space?: string; color_range?: string; color_primaries?: string; color_transfer?: string }[] }).streams.find((s) => s.codec_type === "video")!;

  it("der Rechenweg der LUT stimmt mit der Mathematik überein (Gegenprobe zu den Zahlen unten)", () => {
    // Die Erwartung der Pixelproben kommt aus der LUT; hier steht, dass die LUT an diesen Streifen die exakte Kette trifft (Grauachse höchstens 1 von 255, Farbe etwas mehr).
    for (const [i, c] of STREIFEN.entries()) {
      const exakt = rechneFarbe(vlogZuRec709(c), { ...look, schwarz: 0, weiss: 1 });
      const lut = wendeCubeAn(cube, c);
      expect(VLOG_LUT_GROESSE).toBe(65);
      expect(Math.max(Math.abs(exakt.r - lut.r), Math.abs(exakt.g - lut.g), Math.abs(exakt.b - lut.b)) * 255, NAMEN[i]).toBeLessThan(i === 3 ? 4 : 1);
    }
    // und die Streifen liegen dort, wo V-Log sie erwartet: 18 % Grau ist Code 433
    expect(Math.round(linearZuVlog(0.18) * 1023)).toBe(Math.round(STREIFEN[1]!.g * 1023));
  });

  it("voller Bereich, Datei sagt «pc»: Schwarz, Grau, Weiss und Farbe kommen wie berechnet an (höchstens 3 von 255 daneben)", async () => {
    const aus = await vorschau(vlogVideo("voll-pc", "voll", "voll"));
    abstand(aus).forEach((d, i) => expect(d, NAMEN[i]).toBeLessThan(3));
  }, 120_000);

  it("begrenzter Bereich, Datei sagt «tv»: ebenso", async () => {
    const aus = await vorschau(vlogVideo("begrenzt-tv", "begrenzt", "begrenzt"));
    abstand(aus).forEach((d, i) => expect(d, NAMEN[i]).toBeLessThan(3));
  }, 120_000);

  it("ohne Etikett für Bereich und Matrix: Die Matrix ist ausdrücklich BT.709 (ohne Angabe nähme ffmpeg BT.601, und die Farbe wäre sichtbar falsch)", async () => {
    const aus = await vorschau(vlogVideo("ohne-etikett", "begrenzt", "keines"));
    abstand(aus).forEach((d, i) => expect(d, NAMEN[i]).toBeLessThan(3));
  }, 120_000);

  it("falsch etikettiert (Daten voll, Datei sagt «tv»): ohne Eingriff kippt Schwarz und Weiss, mit --bereich voll stimmt es wieder", async () => {
    const video = vlogVideo("falsch-tv", "voll", "begrenzt");
    const ohne = abstand(await vorschau(video));
    expect(Math.max(...ohne), "ohne Eingriff liegt mindestens ein Streifen weit daneben").toBeGreaterThan(10);
    const mit = abstand(await vorschau(video, { bereich: "voll" }));
    mit.forEach((d, i) => expect(d, NAMEN[i]).toBeLessThan(3));
  }, 180_000);

  it("umgekehrt (Daten begrenzt, Datei sagt «pc»): mit --bereich begrenzt stimmt es", async () => {
    const video = vlogVideo("falsch-pc", "begrenzt", "voll");
    expect(Math.max(...abstand(await vorschau(video)))).toBeGreaterThan(10);
    abstand(await vorschau(video, { bereich: "begrenzt" })).forEach((d, i) => expect(d, NAMEN[i]).toBeLessThan(3));
  }, 180_000);

  it("die Vorschau trägt ihre Etiketten: BT.709 und begrenzter Bereich, damit jeder Player sie so darstellt, wie sie gerechnet ist", async () => {
    const s = probe(await vorschau(vlogVideo("tags", "voll", "voll")));
    expect(s).toMatchObject({ color_space: "bt709", color_range: "tv", color_primaries: "bt709", color_transfer: "bt709" });
  }, 120_000);
});
