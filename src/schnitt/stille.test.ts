import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findeStille, parseSilencedetect } from "./stille";

const hatFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

describe("parseSilencedetect", () => {
  it("liest Beginn und Ende jeder Stille", () => {
    const log = [
      "[silencedetect @ 0x1] silence_start: 0",
      "[silencedetect @ 0x1] silence_end: 1.00002 | silence_duration: 1.00002",
      "[silencedetect @ 0x1] silence_start: 4.3",
      "[silencedetect @ 0x1] silence_end: 10 | silence_duration: 5.7",
    ].join("\n");
    expect(parseSilencedetect(log)).toEqual([{ von: 0, bis: 1.00002 }, { von: 4.3, bis: 10 }]);
  });

  it("lässt eine Stille ohne Ende bis zur Dauer der Datei reichen, sonst fällt sie weg", () => {
    const log = "silence_start: 28.5";
    expect(parseSilencedetect(log, 30)).toEqual([{ von: 28.5, bis: 30 }]);
    expect(parseSilencedetect(log)).toEqual([]);
  });

  it("ignoriert Zeilen ohne Stille", () => {
    expect(parseSilencedetect("size=N/A time=00:00:30 bitrate=N/A")).toEqual([]);
  });
});

describe.skipIf(!hatFfmpeg)("findeStille mit echtem ffmpeg", () => {
  it("findet die Stille zwischen zwei Tönen, und eine leise Schwelle findet weniger", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-stille-"));
    try {
      const datei = path.join(dir, "t.wav");
      expect(spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "aevalsrc='if(between(t,1,3)+between(t,5,6),0.5*sin(2*PI*300*t),0)':s=48000:d=8", datei]).status).toBe(0);
      const s = await findeStille(datei, { dauer: 8 });
      expect(s).toHaveLength(3);
      expect(s[0]!.von).toBe(0);
      expect(s[0]!.bis).toBeCloseTo(1, 2);
      expect(s[1]!.von).toBeCloseTo(3, 2);
      expect(s[1]!.bis).toBeCloseTo(5, 2);
      expect(s[2]!.von).toBeCloseTo(6, 2);
      // Stillen unter der Mindestdauer zählen nicht (die erste ist 1 s lang)
      expect((await findeStille(datei, { mindestdauer: 1.5 })).map((x) => Math.round(x.von))).toEqual([3, 6]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("meldet ein klares Problem, wenn die Datei fehlt", async () => {
    await expect(findeStille("/gibt/es/nicht.wav")).rejects.toThrow(/Stille-Messung/);
  });
});
