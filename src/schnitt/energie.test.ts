import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { messePegel, ordneZuMitPegel, pegelAusVolumedetect } from "./energie";
import { testSatz as satz } from "./testdaten";

const Z = "Der Kunde wollte mehr Stauraum.";

describe("pegelAusVolumedetect", () => {
  it("liest den mittleren Pegel", () => {
    expect(pegelAusVolumedetect("[Parsed_volumedetect_0 @ 0x1] mean_volume: -23.4 dB\n[Parsed_volumedetect_0 @ 0x1] max_volume: -9.0 dB")).toBe(-23.4);
  });
  it("gibt bei -inf oder fehlender Zeile nichts zurück", () => {
    expect(pegelAusVolumedetect("mean_volume: -inf dB")).toBeUndefined();
    expect(pegelAusVolumedetect("keine Messung")).toBeUndefined();
  });
});

describe("ordneZuMitPegel", () => {
  it("misst nur dort, wo es mehrere Takes gibt, und wählt den lauteren früheren Take", async () => {
    const aufrufe: string[] = [];
    const messe = async (q: string, von: number) => {
      aufrufe.push(`${q}@${von.toFixed(0)}`);
      return von < 5 ? -12 : -26;
    };
    const z = await ordneZuMitPegel([Z, "Das Ergebnis siehst du hier."], [{ quelle: "a", segmente: [satz(1, Z), satz(10, Z), satz(30, "Das Ergebnis siehst du hier.")] }], messe);
    expect(z.zeilen[0]!.gewaehlt!.von).toBeCloseTo(1, 6);
    expect(z.zeilen[0]!.gewaehlt!.energieDb).toBe(-12);
    expect(aufrufe.sort()).toEqual(["a@1", "a@10"]);
    expect(z.zeilen[1]!.gewaehlt!.energieDb).toBeUndefined();
  });

  it("misst jeden Take genau einmal", async () => {
    let n = 0;
    await ordneZuMitPegel([Z], [{ quelle: "a", segmente: [satz(1, Z), satz(10, Z), satz(20, Z)] }], async () => ++n && -20);
    expect(n).toBe(3);
  });

  it("kommt ohne Messwert aus: Energie zählt dann neutral", async () => {
    const z = await ordneZuMitPegel([Z], [{ quelle: "a", segmente: [satz(1, Z), satz(10, Z)] }], async () => undefined);
    expect(z.zeilen[0]!.gewaehlt!.kriterien.energie).toBe(0.5);
  });
});

const hatFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
describe.skipIf(!hatFfmpeg)("Pegelmessung mit echtem ffmpeg", () => {
  it("misst zwei Abschnitte mit 20 dB Unterschied", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pegel-"));
    const datei = path.join(dir, "ton.wav");
    const r = spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=4", "-af", "volume=enable='lt(t,2)':volume=0.5,volume=enable='gte(t,2)':volume=0.05", "-y", datei]);
    expect(r.status).toBe(0);
    const laut = await messePegel(datei, 0.2, 1.8);
    const leise = await messePegel(datei, 2.2, 3.8);
    expect(laut).toBeDefined();
    expect(leise).toBeDefined();
    expect(laut! - leise!).toBeGreaterThan(18);
    expect(laut! - leise!).toBeLessThan(22);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  it("gibt für einen leeren Bereich nichts zurück", async () => {
    expect(await messePegel("/nicht/da.wav", 2, 2)).toBeUndefined();
  });
  it("wirft bei einer fehlenden Datei", async () => {
    await expect(messePegel("/nicht/da.wav", 0, 1)).rejects.toThrow(/Pegelmessung/);
  });
});
