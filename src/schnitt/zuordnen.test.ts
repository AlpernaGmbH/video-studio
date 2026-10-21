import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Markenprofil } from "../core/schemas";
import { leseSchnittplan } from "./plan";
import { testSatz } from "./testdaten";
import { fuehreZuordnungAus } from "./zuordnen";

const hatFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
const root = path.resolve(import.meta.dirname, "..", "..");
const marke = Markenprofil.parse(JSON.parse(fs.readFileSync(path.join(root, "marken", "alperna.json"), "utf8")));
const SATZ = "Wir haben diese Woche eine Küche komplett umgebaut.";

describe.skipIf(!hatFfmpeg)("Zuordnung: Pegel bei getrenntem Ton", () => {
  let tmp: string;
  beforeEach(() => void (tmp = fs.mkdtempSync(path.join(os.tmpdir(), "studio-zuordnen-"))));
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const ff = (...a: string[]): void => void expect(spawnSync("ffmpeg", ["-loglevel", "error", "-y", ...a]).status, a.join(" ")).toBe(0);

  /**
   * Derselbe Satz zweimal: bei 2 s und bei 10 s des Videos. Die Kamera hört den ersten Take laut und den zweiten leise.
   * Die Tonaufnahme (Versatz +3) hört es umgekehrt: Take 1 liegt bei 5 s der Aufnahme (leise), Take 2 bei 13 s (laut).
   * Die Aufnahme ist ausserdem bei 0 bis 4,8 s laut: Wer sie ohne Versatz misst, hört bei Take 1 (2 s) laut und bei Take 2 (10 s) leise und wählt falsch.
   * Wer die Kamera misst, wählt Take 1; wer die Aufnahme am verschobenen Ort misst, wählt Take 2.
   */
  const bereite = (versatz: number | undefined) => {
    fs.mkdirSync(path.join(tmp, "rohmaterial"), { recursive: true });
    ff("-f", "lavfi", "-i", "testsrc2=size=160x284:rate=25:duration=20", "-f", "lavfi", "-i", "aevalsrc=if(lt(t\\,6)\\,0.5\\,0.02)*sin(2*PI*300*t):s=48000:d=20", "-shortest", path.join(tmp, "rohmaterial", "kamera.mp4"));
    ff("-f", "lavfi", "-i", "aevalsrc=if(lt(t\\,4.8)+gt(t\\,12.9)\\,0.5\\,0.02)*sin(2*PI*300*t):s=48000:d=30", "-ac", "1", path.join(tmp, "rohmaterial", "ton.wav"));
    const quellen = leseSchnittplan({
      version: 1,
      projekt: { name: "T", marke: "alperna" },
      quellen: [
        { id: "kamera", pfad: "rohmaterial/kamera.mp4", art: "video", dauer: 20, fps: 25, breite: 160, hoehe: 284, hatAudio: true, ...(versatz !== undefined ? { ton: { quelle: "ton", versatz } } : {}) },
        { id: "ton", pfad: "rohmaterial/ton.wav", art: "audio", dauer: 30, hatAudio: true, audioKanaele: 1 },
      ],
      clips: [{ id: "k01", quelle: "kamera", von: 0, bis: 1 }],
    }).quellen;
    return fuehreZuordnungAus({
      marke,
      skriptText: SATZ,
      skriptQuelle: "skript.md",
      quellen,
      transkripte: [{ quelle: "kamera", segmente: [testSatz(2, SATZ), testSatz(10, SATZ)] }],
      name: "T",
      home: { pfad: tmp, quelle: "STUDIO_HOME" },
    });
  };

  it("misst die Tonaufnahme an der um den Versatz verschobenen Stelle und wählt den lauteren Take dort", async () => {
    const r = await bereite(3);
    const z = r.zuordnung.zeilen[0]!;
    expect(z.takes).toHaveLength(2);
    expect(z.gewaehlt!.von).toBeGreaterThan(9);
    expect(r.pegelNotiz).toBe("");
  }, 120_000);

  it("ohne getrennten Ton misst die Kameraspur: dort ist der erste Take der lautere", async () => {
    const r = await bereite(undefined);
    expect(r.zuordnung.zeilen[0]!.gewaehlt!.von).toBeLessThan(3);
  }, 120_000);

  it("fehlt die Tonaufnahme auf diesem Rechner, steht das in der Pegel-Notiz (nicht die Kameradatei)", async () => {
    fs.mkdirSync(path.join(tmp, "rohmaterial"), { recursive: true });
    ff("-f", "lavfi", "-i", "testsrc2=size=160x284:rate=25:duration=20", "-f", "lavfi", "-i", "sine=frequency=300:duration=20", "-shortest", path.join(tmp, "rohmaterial", "kamera.mp4"));
    const quellen = leseSchnittplan({
      version: 1,
      projekt: { name: "T", marke: "alperna" },
      quellen: [
        { id: "kamera", pfad: "rohmaterial/kamera.mp4", art: "video", dauer: 20, fps: 25, breite: 160, hoehe: 284, hatAudio: true, ton: { quelle: "ton", versatz: 3 } },
        { id: "ton", pfad: "rohmaterial/ton.wav", art: "audio", dauer: 30, hatAudio: true, audioKanaele: 1 },
      ],
      clips: [{ id: "k01", quelle: "kamera", von: 0, bis: 1 }],
    }).quellen;
    const r = await fuehreZuordnungAus({ marke, skriptText: SATZ, skriptQuelle: "skript.md", quellen, transkripte: [{ quelle: "kamera", segmente: [testSatz(2, SATZ)] }], name: "T", home: { pfad: tmp, quelle: "STUDIO_HOME" } });
    expect(r.pegelNotiz).toContain("ton.wav");
  }, 60_000);
});
