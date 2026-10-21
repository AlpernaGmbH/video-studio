import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { erkenneFarbe, FLACH_SAETTIGUNG, FLACH_SPANNE, liesTransfer, loeseLook, messeBilder, parseSignalstats, schlageLevelsVor, urteileFarbe } from "./farbe";

const hatFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
const m = (x: Partial<Parameters<typeof urteileFarbe>[0]> = {}) => ({ saettigung: 0.2, yLow: 0.1, yHigh: 0.8, bilder: 5, ...x });

describe("urteileFarbe", () => {
  it("ein Etikett für normales Material gilt, auch wenn die Messung flach aussieht", () => {
    for (const t of ["bt709", "smpte170m", "iec61966-2-1"]) {
      const u = urteileFarbe(m({ transfer: t, saettigung: 0.02, yLow: 0.3, yHigh: 0.5 }));
      expect(u).toMatchObject({ farbe: "rec709", sicher: true });
      expect(u.grund).toContain(t);
    }
  });

  it("HLG, PQ und alles mit «log» im Etikett sind flaches Material, sicher", () => {
    for (const t of ["arib-std-b67", "smpte2084", "slog3", "log100"]) expect(urteileFarbe(m({ transfer: t, saettigung: 0.3, yLow: 0, yHigh: 1 }))).toMatchObject({ farbe: "log", sicher: true });
  });

  it("ohne Etikett entscheidet die Messung und bleibt unsicher: flach heisst wenig Sättigung und schmale Spanne", () => {
    expect(urteileFarbe(m({ saettigung: 0.03, yLow: 0.3, yHigh: 0.6 }))).toMatchObject({ farbe: "log", sicher: false });
    expect(urteileFarbe(m({ saettigung: 0.2, yLow: 0.1, yHigh: 0.8 }))).toMatchObject({ farbe: "rec709", sicher: false });
    expect(urteileFarbe(m({ saettigung: 0.03, yLow: 0.3, yHigh: 0.6 })).grund).toContain("[Vermutung]");
  });

  it("beides muss zutreffen: Nur wenig Sättigung bei breiter Spanne (zum Beispiel Schwarzweiss) oder nur schmale Spanne mit Farbe (Nebel) ist nicht flach", () => {
    expect(urteileFarbe(m({ saettigung: 0.01, yLow: 0.05, yHigh: 0.9 })).farbe).toBe("rec709");
    expect(urteileFarbe(m({ saettigung: 0.3, yLow: 0.3, yHigh: 0.6 })).farbe).toBe("rec709");
  });

  it("die Schwellen sind scharf: knapp darunter flach, genau darauf nicht", () => {
    expect(urteileFarbe(m({ saettigung: FLACH_SAETTIGUNG - 0.001, yLow: 0, yHigh: FLACH_SPANNE - 0.001 })).farbe).toBe("log");
    expect(urteileFarbe(m({ saettigung: FLACH_SAETTIGUNG, yLow: 0, yHigh: FLACH_SPANNE - 0.001 })).farbe).toBe("rec709");
    expect(urteileFarbe(m({ saettigung: FLACH_SAETTIGUNG - 0.001, yLow: 0, yHigh: FLACH_SPANNE })).farbe).toBe("rec709");
  });
});

describe("urteileFarbe: die Schwellen als feste Zahlen (Vermutung, an echtem Material zu prüfen)", () => {
  it("Sättigung 0,075 mit schmaler Spanne ist flach, 0,085 nicht; Spanne 0,44 ist flach, 0,46 nicht", () => {
    expect(urteileFarbe(m({ saettigung: 0.075, yLow: 0.2, yHigh: 0.5 })).farbe).toBe("log");
    expect(urteileFarbe(m({ saettigung: 0.085, yLow: 0.2, yHigh: 0.5 })).farbe).toBe("rec709");
    expect(urteileFarbe(m({ saettigung: 0.03, yLow: 0.2, yHigh: 0.64 })).farbe).toBe("log");
    expect(urteileFarbe(m({ saettigung: 0.03, yLow: 0.2, yHigh: 0.66 })).farbe).toBe("rec709");
  });
});

describe("parseSignalstats", () => {
  const bild = (sat: number, low: number, high: number, bits = 8) => `frame:0 pts:0 pts_time:0\nlavfi.signalstats.YLOW=${low}\nlavfi.signalstats.YHIGH=${high}\nlavfi.signalstats.SATAVG=${sat}\nlavfi.signalstats.YBITDEPTH=${bits}\n`;

  it("rechnet 8-Bit-Werte auf 0 bis 1: Sättigung durch 256, Helligkeit vom Video-Pegel 16 bis 235", () => {
    const r = parseSignalstats(bild(25.6, 16, 235))!;
    expect(r.saettigung).toBeCloseTo(0.1, 9);
    expect(r.yLow).toBeCloseTo(0, 9);
    expect(r.yHigh).toBeCloseTo(1, 9);
    expect(r.bilder).toBe(1);
  });

  it("10 Bit ergibt dasselbe wie 8 Bit mit vierfachen Werten", () => {
    const a = parseSignalstats(bild(25.6, 41, 210, 8))!;
    const b = parseSignalstats(bild(102.4, 164, 840, 10))!;
    expect(b.saettigung).toBeCloseTo(a.saettigung, 9);
    // 10-Bit-Werte sind vierfach, aber Vollbereich ist 1023 statt 1020: Unterschied unter 0,5 Prozent
    expect(b.yLow).toBeCloseTo(a.yLow, 2);
    expect(b.yHigh).toBeCloseTo(a.yHigh, 2);
  });

  it("mittelt über mehrere Bilder, klemmt Werte ausserhalb des Pegels und gibt bei Leerem nichts zurück", () => {
    const r = parseSignalstats(bild(0, 16, 100) + bild(51.2, 16, 235))!;
    expect(r.bilder).toBe(2);
    expect(r.saettigung).toBeCloseTo(0.1, 9);
    expect(r.yHigh).toBeCloseTo((((100 - 16) / 219) + 1) / 2, 9);
    expect(parseSignalstats(bild(10, 0, 255))!.yLow).toBe(0);
    expect(parseSignalstats("nichts")).toBeUndefined();
  });
});

describe("schlageLevelsVor", () => {
  it("bildet das 10. Perzentil auf 0,12 und das 90. auf 0,82 ab", () => {
    const r = schlageLevelsVor([{ yLow: 0.25, yHigh: 0.55 }])!;
    const abb = (x: number) => (x - r.schwarz) / (r.weiss - r.schwarz);
    expect(abb(0.25)).toBeCloseTo(0.12, 2);
    expect(abb(0.55)).toBeCloseTo(0.82, 2);
  });

  it("mittelt über die Quellen, begrenzt auf den zulässigen Bereich und gibt bei zu schmaler Spanne oder ohne Messung nichts", () => {
    const r = schlageLevelsVor([{ yLow: 0.2, yHigh: 0.5 }, { yLow: 0.3, yHigh: 0.6 }])!;
    expect(r).toEqual(schlageLevelsVor([{ yLow: 0.25, yHigh: 0.55 }]));
    const tief = schlageLevelsVor([{ yLow: 0, yHigh: 0.2 }])!;
    expect(tief.schwarz).toBe(0);
    expect(schlageLevelsVor([{ yLow: 0.4, yHigh: 0.42 }])).toBeUndefined();
    expect(schlageLevelsVor([])).toBeUndefined();
    const breit = schlageLevelsVor([{ yLow: 0.05, yHigh: 0.95 }])!;
    expect(breit.weiss).toBeLessThanOrEqual(1);
    expect(breit.weiss).toBeGreaterThan(breit.schwarz + 0.1);
  });
});

describe("loeseLook", () => {
  const look = { gamma: 1, kontrast: 0, saettigung: 1, kuehle: 0 };
  it("feste Werte der Marke gelten vor den gemessenen, diese vor dem ganzen Bereich", () => {
    expect(loeseLook({ ...look, schwarz: 0.1 }, { schwarz: 0.3, weiss: 0.7 })).toMatchObject({ schwarz: 0.1, weiss: 0.7 });
    expect(loeseLook(look, { schwarz: 0.3, weiss: 0.7 })).toMatchObject({ schwarz: 0.3, weiss: 0.7 });
    expect(loeseLook(look)).toMatchObject({ schwarz: 0, weiss: 1 });
  });
});

describe.skipIf(!hatFfmpeg)("mit echten Dateien (ffmpeg)", () => {
  let dir: string;
  beforeEach(() => void (dir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-farbe-"))));
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
  const ff = (...a: string[]) => expect(spawnSync("ffmpeg", ["-loglevel", "error", "-y", ...a]).status, a.join(" ")).toBe(0);
  const quelle = ["-f", "lavfi", "-i", "testsrc2=size=320x240:rate=25:duration=4"];

  it("normales Bild ohne Etikett: gemessen als normal, unsicher", async () => {
    ff(...quelle, path.join(dir, "normal.mp4"));
    const r = (await erkenneFarbe(path.join(dir, "normal.mp4"), 4))!;
    expect(r.urteil).toMatchObject({ farbe: "rec709", sicher: false });
    expect(r.messung.bilder).toBe(5);
    expect(r.messung.saettigung).toBeGreaterThan(FLACH_SAETTIGUNG);
  }, 60_000);

  it("flaches Bild (wenig Kontrast, kaum Farbe) ohne Etikett: gemessen als Log", async () => {
    ff(...quelle, "-vf", "eq=contrast=0.35:saturation=0.15,format=yuv420p", path.join(dir, "flach.mp4"));
    const r = (await erkenneFarbe(path.join(dir, "flach.mp4"), 4))!;
    expect(r.urteil).toMatchObject({ farbe: "log", sicher: false });
    expect(r.messung.yHigh - r.messung.yLow).toBeLessThan(0.45);
  }, 60_000);

  it("das Etikett der Datei gewinnt: HLG ist Log, sicher; bt709 ist normal, sicher, auch bei flachem Bild", async () => {
    ff(...quelle, "-color_trc", "arib-std-b67", path.join(dir, "hlg.mp4"));
    expect(await liesTransfer(path.join(dir, "hlg.mp4"))).toBe("arib-std-b67");
    expect((await erkenneFarbe(path.join(dir, "hlg.mp4"), 4))!.urteil).toMatchObject({ farbe: "log", sicher: true });
    ff(...quelle, "-vf", "eq=contrast=0.35:saturation=0.15,format=yuv420p", "-color_trc", "bt709", path.join(dir, "flach709.mp4"));
    expect((await erkenneFarbe(path.join(dir, "flach709.mp4"), 4))!.urteil).toMatchObject({ farbe: "rec709", sicher: true });
  }, 60_000);

  it("ohne Etikett gibt liesTransfer nichts zurück, und eine Datei ohne Bild ergibt keine Messung", async () => {
    ff(...quelle, path.join(dir, "ohne.mp4"));
    expect(await liesTransfer(path.join(dir, "ohne.mp4"))).toBeUndefined();
    ff("-f", "lavfi", "-i", "sine=frequency=300:duration=2", path.join(dir, "ton.wav"));
    expect(await messeBilder(path.join(dir, "ton.wav"), 2)).toBeUndefined();
  }, 60_000);
});
