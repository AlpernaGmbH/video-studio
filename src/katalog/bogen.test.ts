import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { beschriftung, BOGEN_BREITE, bogenFilter, CLIPS_PRO_BOGEN, erzeugeBoegen, findeSchrift, planeBoegen, ZEILE_HOEHE } from "./bogen";
import { OffenerEintrag } from "./katalog";
import { extrahiereListe } from "./befehle";

const eintrag = (n: number, o: Record<string, unknown> = {}) =>
  OffenerEintrag.parse({ schluessel: `k-${String(n).padStart(4, "0")}`, art: "video", pfad: `rohmaterial/kunde-x/clip${n}.mov`, dauer: 4.5, bildrate: 25, orientierung: "hoch", ordnerHinweis: ["kunde-x", "gossau"], vorschau: [`katalog/vorschau/k-${n}-a.jpg`, `katalog/vorschau/k-${n}-b.jpg`, `katalog/vorschau/k-${n}-c.jpg`], ...o });

describe("beschriftung", () => {
  it("nennt Nummer, Art, Länge, Format, Bildrate, Ordner und Dateiname", () => {
    expect(beschriftung(eintrag(1))).toBe("k-0001  video  4,5 s  hoch  25p  kunde-x/gossau  clip1.mov");
  });
  it("vermerkt Zeitlupe und lässt Fehlendes weg", () => {
    expect(beschriftung(eintrag(2, { zeitlupe: true, ordnerHinweis: [], bildrate: 50, dauer: undefined, orientierung: undefined }))).toBe("k-0002  video  50p  Zeitlupe  clip2.mov");
  });
});

describe("planeBoegen", () => {
  it("verteilt auf Bögen zu vier Clips und trennt Einträge ohne Bild ab", () => {
    const offen = [...Array.from({ length: 9 }, (_, i) => eintrag(i + 1)), eintrag(10, { art: "sound", vorschau: [] })];
    const p = planeBoegen(offen);
    expect(p.boegen.map((b) => b.length)).toEqual([4, 4, 1]);
    expect(CLIPS_PRO_BOGEN).toBe(4);
    expect(p.ohneBild.map((o) => o.schluessel)).toEqual(["k-0010"]);
  });
  it("kein Bogen ohne Clips", () => {
    expect(planeBoegen([]).boegen).toEqual([]);
  });
});

describe("bogenFilter", () => {
  const f = bogenFilter([{ bilder: 3, textDatei: "/tmp/t0.txt" }, { bilder: 1, textDatei: "/tmp/t1.txt" }], "/fonts/Arial.ttf");
  it("setzt je Zeile drei Zellen nebeneinander, eine einzelne Zelle ohne hstack, und stapelt Beschriftung und Zeile", () => {
    expect(f).toContain("[c0_0][c0_1][c0_2]hstack=inputs=3[h0]");
    expect(f).toContain("[c1_0]null[h1]");
    expect(f).not.toContain("hstack=inputs=1");
    expect(f).toContain("[t0][p0][t1][p1]vstack=inputs=4[aus]");
  });
  it("liest die Beschriftung aus einer Textdatei und nimmt die angegebene Schrift", () => {
    expect(f).toContain("fontfile='/fonts/Arial.ttf'");
    expect(f).toContain("textfile='/tmp/t0.txt'");
  });
  it("maskiert Doppelpunkt und Apostroph in Pfaden", () => {
    const g = bogenFilter([{ bilder: 1, textDatei: "C:\\t's.txt" }], "/f.ttf");
    expect(g).toContain("textfile='C\\:/t\\\\\\'s.txt'");
  });
});

describe("findeSchrift", () => {
  it("nimmt die erste vorhandene und ignoriert leere Einträge", () => {
    expect(findeSchrift([undefined, "/gibt/es/nicht.ttf", process.execPath])).toBe(process.execPath);
    expect(findeSchrift([undefined, "/gibt/es/nicht.ttf"])).toBeUndefined();
  });
});

describe("extrahiereListe", () => {
  const eins = '{"schluessel":"k-0001","titel":"Ab_c","beschreibung":"Text [mit] Klammern","tags":["a"],"sicherheit":"hoch"}';
  it("liest eine nackte Liste", () => {
    expect(extrahiereListe(`[${eins}]`)).toHaveLength(1);
  });
  it("liest eine Liste mit Text und Codezaun darum und Klammern in Zeichenketten", () => {
    const t = `Hier die Beschreibungen:\n\n\`\`\`json\n[${eins},\n${eins.replace("k-0001", "k-0002")}]\n\`\`\`\nViel Erfolg.`;
    const l = extrahiereListe(t) as { schluessel: string }[];
    expect(l.map((x) => x.schluessel)).toEqual(["k-0001", "k-0002"]);
    expect((l[0] as unknown as { beschreibung: string }).beschreibung).toBe("Text [mit] Klammern");
  });
  it("meldet fehlende Liste, abgeschnittene Liste und kaputtes JSON verständlich", () => {
    expect(() => extrahiereListe("nur Text")).toThrow(/Keine Liste/);
    expect(() => extrahiereListe(`[${eins}`)).toThrow(/schliessende \]/);
    expect(() => extrahiereListe("[{'a': 1}]")).toThrow(/kein gültiges JSON/);
  });
});

const hatFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
const hatDrawtext = hatFfmpeg && /\sdrawtext\s/.test(spawnSync("ffmpeg", ["-hide_banner", "-filters"]).stdout.toString());
describe.skipIf(!hatDrawtext || !findeSchrift())("erzeugeBoegen mit echtem ffmpeg", () => {
  let dir: string;
  beforeEach(() => (dir = fs.mkdtempSync(path.join(os.tmpdir(), "bogen-test-"))));
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
  const ff = (...a: string[]) => expect(spawnSync("ffmpeg", ["-loglevel", "error", "-y", ...a]).status).toBe(0);
  const mitBildern = (n: number, quer = false, bilder = 3) => {
    const e = eintrag(n, { orientierung: quer ? "quer" : "hoch" });
    const vorschau: string[] = [];
    for (let i = 0; i < bilder; i++) {
      const rel = `katalog/vorschau/k-${String(n).padStart(4, "0")}-${"abc"[i]}.jpg`;
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      ff("-f", "lavfi", "-i", `color=c=${["red", "green", "blue"][i]}:s=${quer ? "480x270" : "270x480"}`, "-frames:v", "1", path.join(dir, rel));
      vorschau.push(rel);
    }
    return { ...e, vorschau };
  };
  const mass = (f: string) => {
    const p = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", f]).stdout.toString().trim().split(",").map(Number);
    return { b: p[0]!, h: p[1]! };
  };
  const bereich = (f: string, filter: string): number[] => [...spawnSync("ffmpeg", ["-loglevel", "error", "-i", f, "-vf", filter, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]).stdout];

  it("macht aus fünf Clips zwei Bögen mit je Zeile 444 Pixel und 900 Pixel Breite", async () => {
    const offen = [1, 2, 3, 4, 5].map((n) => mitBildern(n, n === 2));
    const r = await erzeugeBoegen(offen, dir, path.join(dir, "bogen"));
    expect(r.dateien.map((d) => path.basename(d))).toEqual(["bogen-01.jpg", "bogen-02.jpg"]);
    expect(r.inhalt).toEqual([["k-0001", "k-0002", "k-0003", "k-0004"], ["k-0005"]]);
    expect(mass(r.dateien[0]!)).toEqual({ b: BOGEN_BREITE, h: 4 * ZEILE_HOEHE });
    expect(mass(r.dateien[1]!)).toEqual({ b: BOGEN_BREITE, h: ZEILE_HOEHE });
  }, 60_000);

  it("zeigt die drei Bilder eines Clips nebeneinander (rot, grün, blau) und die Nummer als Text darüber", async () => {
    const r = await erzeugeBoegen([mitBildern(1)], dir, path.join(dir, "bogen"));
    const f = r.dateien[0]!;
    // Mitte der drei Zellen unterhalb der Beschriftung
    const farbe = (x: number) => bereich(f, `crop=40:40:${x}:${44 + 180},scale=1:1`);
    const [r1, g1] = farbe(130);
    const [r2, g2] = farbe(430);
    const [, g3, b3] = farbe(730);
    expect(r1!).toBeGreaterThan(g1! + 100);
    expect(g2!).toBeGreaterThan(r2! + 100);
    expect(b3!).toBeGreaterThan(g3! + 100);
    // Beschriftungsstreifen: dunkler Grund, heller Text, also grosse Spanne
    let lo = 255;
    let hi = 0;
    for (const v of bereich(f, "crop=900:44:0:0")) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    expect(hi - lo).toBeGreaterThan(120);
    // ohne Beschriftung wäre der Streifen einfarbig: die linke Hälfte der Textzeile (Buchstaben) und der Grund rechts unterscheiden sich
    const text = bereich(f, "crop=300:24:12:10,format=gray");
    let spanne = 0;
    let min = 255;
    for (const v of text) {
      min = Math.min(min, v);
      spanne = Math.max(spanne, v);
    }
    expect(spanne - min).toBeGreaterThan(120);
  }, 60_000);

  it("kommt mit einem Foto (ein Bild) und einem Querformat zurecht und löscht alte Bögen", async () => {
    fs.mkdirSync(path.join(dir, "bogen"), { recursive: true });
    fs.writeFileSync(path.join(dir, "bogen", "bogen-07.jpg"), "alt");
    const r = await erzeugeBoegen([mitBildern(1, true), mitBildern(2, false, 1)], dir, path.join(dir, "bogen"));
    expect(fs.readdirSync(path.join(dir, "bogen"))).toEqual(["bogen-01.jpg"]);
    expect(mass(r.dateien[0]!).h).toBe(2 * ZEILE_HOEHE);
  }, 60_000);

  it("meldet fehlende Schrift verständlich und nennt STUDIO_FONT", async () => {
    await expect(erzeugeBoegen([mitBildern(1)], dir, path.join(dir, "bogen"), { kandidaten: ["/gibt/es/nicht.ttf"] })).rejects.toThrow(/STUDIO_FONT/);
  }, 60_000);
});
