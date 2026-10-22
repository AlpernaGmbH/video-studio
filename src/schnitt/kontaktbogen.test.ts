import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bogenCollage, bogenHtml, collageSpalten, echterBogen, erzeugeBogen, planeBogen, type Ausfuehrer, type BogenWerkzeuge } from "./kontaktbogen";
import { leseSchnittplan } from "./plan";

const plan = (extra: Record<string, unknown> = {}) =>
  leseSchnittplan({
    version: 1,
    projekt: { name: "Küche <Gossau>", inhalt: "c-0007", marke: "alperna" },
    quellen: [
      { id: "sprache", pfad: "rohmaterial/sprache.mp4", art: "video", dauer: 60, fps: 25, breite: 1080, hoehe: 1920, hatAudio: true },
      { id: "broll-k-0001", pfad: "rohmaterial/bib/laptop.mp4", art: "video", dauer: 8, fps: 25, breite: 1920, hoehe: 1080 },
    ],
    // zwei Clips aus verschiedenen Stellen der Datei: Timeline 0 bis 2 s aus 10 s, 2 bis 5 s aus 30 s
    clips: [
      { id: "k01", quelle: "sprache", von: 10, bis: 12, zeile: 1 },
      { id: "k02", quelle: "sprache", von: 30, bis: 33, zeile: 2 },
    ],
    broll: [{ quelle: "broll-k-0001", katalog: "k-0001", t: 3, dauer: 1.5, von: 2, begruendung: "Zeigt <Laptop>" }],
    overlays: [
      { datei: "renders/c-0007/zahl-zaehler-02.webm", effekt: "zahl-zaehler", t: 4, dauer: 1, begruendung: "Zahl wirkt stärker" },
      { datei: "renders/c-0007/zahl-zaehler-01.webm", effekt: "zahl-zaehler", t: 0.5, dauer: 1.2, begruendung: "Kennzahl" },
    ],
    ...extra,
  });

describe("planeBogen", () => {
  it("nummeriert nach Zeit, Grafiken und B-Roll gemischt", () => {
    const e = planeBogen(plan());
    expect(e.map((x) => [x.nr, x.art, x.name, x.t])).toEqual([
      [1, "grafik", "zahl-zaehler", 0.5],
      [2, "broll", "k-0001", 3],
      [3, "grafik", "zahl-zaehler", 4],
    ]);
  });

  it("nimmt für Grafiken das Bild der Sprache an der Mitte der Grafik, in der Zeit der Quelldatei", () => {
    const e = planeBogen(plan());
    // Grafik 1: Mitte bei 1,1 s der Timeline, im ersten Clip (ab 10 s der Datei): 11,1 s
    expect(e[0]!.basis).toEqual({ pfad: "rohmaterial/sprache.mp4", zeit: expect.closeTo(11.1, 6) });
    // Grafik 3: Mitte bei 4,5 s der Timeline, im zweiten Clip (Beginn bei 2 s): 30 + 2,5 s
    expect(e[2]!.basis).toEqual({ pfad: "rohmaterial/sprache.mp4", zeit: expect.closeTo(32.5, 6) });
    expect(e[0]!.grafik).toEqual({ pfad: "renders/c-0007/zahl-zaehler-01.webm", zeit: expect.closeTo(0.6, 6) });
  });

  it("nimmt für B-Roll die Mitte des gewählten Ausschnitts in der B-Roll-Datei", () => {
    expect(planeBogen(plan())[1]!.basis).toEqual({ pfad: "rohmaterial/bib/laptop.mp4", zeit: 2.75 });
  });

  it("liefert nichts, wenn das Storyboard leer ist", () => {
    expect(planeBogen(plan({ broll: [], overlays: [] }))).toEqual([]);
  });
});

describe("bogenHtml", () => {
  const e = planeBogen(plan());
  const html = bogenHtml(plan(), e, new Map([[1, "QUJD"], [2, "REVG"]]), new Map([[3, "Grafik noch nicht gerendert: renders/x.webm"]]));
  it("enthält Kopf, ein Bild je Eintrag mit Bild und die Liste mit Zeit und Begründung", () => {
    expect(html).toContain("<title>Kontaktbogen Küche &lt;Gossau&gt;</title>");
    expect(html).toContain("Länge 5,0 s, 2 Grafiken, 1 B-Roll");
    expect(html).toContain('src="data:image/jpeg;base64,QUJD"');
    expect(html).toContain("<b>2</b> · 3,0 bis 4,5 s · B-Roll <code>k-0001</code>");
    expect(html).toContain("Kennzahl");
  });
  it("schreibt «1 Grafik» im Singular", () => {
    const eins = plan({ overlays: [plan().overlays[0]] });
    expect(bogenHtml(eins, planeBogen(eins), new Map(), new Map())).toContain("1 Grafik, 1 B-Roll");
  });
  it("maskiert Text aus dem Plan", () => {
    expect(html).toContain("Zeigt &lt;Laptop&gt;");
    expect(html).not.toContain("<Laptop>");
  });
  it("zeigt fehlende Bilder als Platzhalter mit dem Hinweis und sagt, dass es ein Entwurf ist", () => {
    expect(html).toContain('class="leer"');
    expect(html).toContain("Grafik noch nicht gerendert: renders/x.webm");
    expect(html).toContain("erst freigegeben, wenn ein Mensch es bestätigt");
  });
  it("kommt ohne externe Adressen aus", () => {
    expect(html).not.toMatch(/(src|href)="https?:/);
    expect(html).not.toMatch(/<script|@import|url\(/);
  });
  it("sagt es, wenn das Storyboard leer ist", () => {
    expect(bogenHtml(plan({ broll: [], overlays: [] }), [], new Map(), new Map())).toContain("keine Grafiken und keine B-Roll");
  });
});

describe("erzeugeBogen", () => {
  let dir: string;
  beforeEach(() => (dir = fs.mkdtempSync(path.join(os.tmpdir(), "bogen-"))));
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
  const loese = (p: string) => path.join(dir, p);
  const lege = (rel: string) => {
    fs.mkdirSync(path.dirname(loese(rel)), { recursive: true });
    fs.writeFileSync(loese(rel), "x");
  };
  const aufrufe: { basis?: string; grafik?: string }[] = [];
  const w: BogenWerkzeuge = {
    bild: async (basis, grafik) => {
      aufrufe.push({ basis: basis && path.relative(dir, basis.datei), grafik: grafik && path.relative(dir, grafik.datei) });
      return basis ? "QUJD" : undefined;
    },
  };
  beforeEach(() => (aufrufe.length = 0));

  it("ruft für jeden Eintrag mit vorhandenen Dateien das Werkzeug mit Sprache und Grafik auf", async () => {
    for (const f of ["rohmaterial/sprache.mp4", "rohmaterial/bib/laptop.mp4", "renders/c-0007/zahl-zaehler-01.webm", "renders/c-0007/zahl-zaehler-02.webm"]) lege(f);
    const r = await erzeugeBogen({ plan: plan(), loese, werkzeuge: w });
    expect(r.ohneBild).toEqual([]);
    expect(r.nichtGerendert).toEqual([]);
    expect(aufrufe).toEqual([
      { basis: "rohmaterial/sprache.mp4", grafik: "renders/c-0007/zahl-zaehler-01.webm" },
      { basis: "rohmaterial/bib/laptop.mp4", grafik: undefined },
      { basis: "rohmaterial/sprache.mp4", grafik: "renders/c-0007/zahl-zaehler-02.webm" },
    ]);
    expect(r.html.match(/data:image\/jpeg/g)).toHaveLength(3);
  });

  it("zeigt eine nicht gerenderte Grafik trotzdem mit dem Bild der Sprache und vermerkt es", async () => {
    for (const f of ["rohmaterial/sprache.mp4", "rohmaterial/bib/laptop.mp4", "renders/c-0007/zahl-zaehler-02.webm"]) lege(f);
    const r = await erzeugeBogen({ plan: plan(), loese, werkzeuge: w });
    expect(r.nichtGerendert).toEqual([1]);
    expect(aufrufe[0]).toEqual({ basis: "rohmaterial/sprache.mp4", grafik: undefined });
    expect(r.html).toContain("Grafik noch nicht gerendert: renders/c-0007/zahl-zaehler-01.webm");
  });

  it("meldet Eintrag und Grund, wenn die Quelldatei auf diesem Rechner fehlt", async () => {
    lege("rohmaterial/bib/laptop.mp4");
    const r = await erzeugeBogen({ plan: plan(), loese, werkzeuge: w });
    expect(r.ohneBild).toEqual([1, 3]);
    expect(r.html).toContain("Datei fehlt auf diesem Rechner: rohmaterial/sprache.mp4");
    expect(aufrufe).toHaveLength(1);
  });

  it("meldet, wenn das Werkzeug kein Bild liefert", async () => {
    for (const f of ["rohmaterial/sprache.mp4", "rohmaterial/bib/laptop.mp4"]) lege(f);
    const r = await erzeugeBogen({ plan: plan(), loese, werkzeuge: { bild: async () => undefined } });
    expect(r.ohneBild).toEqual([1, 2, 3]);
    expect(r.html).toContain("Das Standbild liess sich nicht erzeugen");
  });
});

const hatFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
describe.skipIf(!hatFfmpeg)("echterBogen mit ffmpeg", () => {
  let dir: string;
  beforeEach(() => (dir = fs.mkdtempSync(path.join(os.tmpdir(), "bogen-ff-"))));
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
  const ff = (...a: string[]) => expect(spawnSync("ffmpeg", ["-loglevel", "error", "-y", ...a]).status).toBe(0);
  /** Mittlere Farbe (R, G, B) der Bildmitte eines JPEG. */
  const mitte = (b64: string): number[] => {
    const f = path.join(dir, "m.jpg");
    fs.writeFileSync(f, Buffer.from(b64, "base64"));
    const r = spawnSync("ffmpeg", ["-loglevel", "error", "-i", f, "-vf", "crop=100:100:85:190,scale=1:1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]);
    return [...r.stdout];
  };

  it("legt das Standbild einer halbtransparenten Grafik über das Bild der Sprache", async () => {
    const video = path.join(dir, "v.mp4");
    const webm = path.join(dir, "g.webm");
    ff("-f", "lavfi", "-i", "color=c=0x202020:s=320x568:r=25:d=3", video);
    ff("-f", "lavfi", "-i", "color=c=red@0.6:s=1080x1920:r=25:d=2,format=yuva420p", "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", webm);
    const ohne = await echterBogen.bild({ datei: video, zeit: 1 }, undefined);
    const mit = await echterBogen.bild({ datei: video, zeit: 1 }, { datei: webm, zeit: 0.5 });
    expect(ohne).toBeDefined();
    expect(mit).toBeDefined();
    const [r0, g0] = mitte(ohne!);
    const [r1, g1] = mitte(mit!);
    expect(r1! - r0!).toBeGreaterThan(60);
    expect(g1!).toBeLessThanOrEqual(g0! + 5);
  }, 60_000);

  it("nimmt das Standbild der Grafik an der gewünschten Zeit: erst rot, dann blau", async () => {
    const video = path.join(dir, "v.mp4");
    const webm = path.join(dir, "g.webm");
    ff("-f", "lavfi", "-i", "color=c=0x202020:s=320x568:r=25:d=3", video);
    ff("-f", "lavfi", "-i", "color=c=red@0.9:s=1080x1920:r=25:d=1,format=yuva420p", "-f", "lavfi", "-i", "color=c=blue@0.9:s=1080x1920:r=25:d=1,format=yuva420p", "-filter_complex", "[0:v][1:v]concat=n=2:v=1[v]", "-map", "[v]", "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", webm);
    const frueh = mitte((await echterBogen.bild({ datei: video, zeit: 1 }, { datei: webm, zeit: 0.4 }))!);
    const spaet = mitte((await echterBogen.bild({ datei: video, zeit: 1 }, { datei: webm, zeit: 1.6 }))!);
    expect(frueh[0]!).toBeGreaterThan(frueh[2]! + 60);
    expect(spaet[2]!).toBeGreaterThan(spaet[0]! + 60);
  }, 60_000);

  it("nimmt das Bild der Sprache an der gewünschten Zeit der Datei: erst rot, dann blau", async () => {
    const video = path.join(dir, "v.mp4");
    ff("-f", "lavfi", "-i", "color=c=red:s=320x568:r=25:d=1", "-f", "lavfi", "-i", "color=c=blue:s=320x568:r=25:d=1", "-filter_complex", "[0:v][1:v]concat=n=2:v=1[v]", "-map", "[v]", video);
    const frueh = mitte((await echterBogen.bild({ datei: video, zeit: 0.4 }, undefined))!);
    const spaet = mitte((await echterBogen.bild({ datei: video, zeit: 1.6 }, undefined))!);
    expect(frueh[0]!).toBeGreaterThan(frueh[2]! + 100);
    expect(spaet[2]!).toBeGreaterThan(spaet[0]! + 100);
  }, 60_000);

  it("zeigt ein Querformat-Bild in der Zelle von 270 mal 480 mit Rändern, und nichts ohne Basis", async () => {
    const video = path.join(dir, "q.mp4");
    ff("-f", "lavfi", "-i", "testsrc2=s=640x360:r=25:d=2", video);
    const b = await echterBogen.bild({ datei: video, zeit: 0.5 }, undefined);
    const f = path.join(dir, "z.jpg");
    fs.writeFileSync(f, Buffer.from(b!, "base64"));
    const p = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", f]);
    expect(p.stdout.toString().trim()).toBe("270,480");
    expect(await echterBogen.bild(undefined, undefined)).toBeUndefined();
  }, 60_000);
});

describe("bogenCollage", () => {
  const ffmpegDa = spawnSync("ffmpeg", ["-version"]).status === 0;
  const jpeg = (breite: number, hoehe: number, farbe: string): string => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vs-jpg-"));
    try {
      const f = path.join(tmp, "x.jpg");
      const r = spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", `color=c=${farbe}:s=${breite}x${hoehe}`, "-frames:v", "1", f]);
      if (r.status !== 0) throw new Error("ffmpeg");
      return fs.readFileSync(f).toString("base64");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  };
  const ausmasse = (b: Buffer): { w: number; h: number } => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vs-jpg-"));
    try {
      fs.writeFileSync(path.join(tmp, "c.jpg"), b);
      const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", path.join(tmp, "c.jpg")], { encoding: "utf8" });
      const [w, h] = r.stdout.trim().split(",").map(Number);
      return { w: w!, h: h! };
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  };

  it("collageSpalten: bis drei nebeneinander, darüber vier", () => {
    expect([1, 2, 3, 4, 5, 20].map(collageSpalten)).toEqual([1, 2, 3, 4, 4, 4]);
    expect(collageSpalten(0)).toBe(1);
  });

  it("ohne Bilder gibt es keine Collage und ffmpeg wird nicht aufgerufen", async () => {
    const aufrufe: string[][] = [];
    const lauf: Ausfuehrer = async (_c, a) => (aufrufe.push(a), { code: 0, stdout: "", stderr: "" });
    expect(await bogenCollage(new Map(), { maxBytes: 100, lauf })).toBeUndefined();
    expect(aufrufe).toHaveLength(0);
  });

  it("ruft ffmpeg mit der Kachelung und den Bildern in der Reihenfolge der Nummern auf", async () => {
    const gesehen: { args: string[]; dateien: string[]; inhalt: string[] }[] = [];
    const lauf: Ausfuehrer = async (_c, args) => {
      const i = args.indexOf("-i");
      const dir = path.dirname(args[i + 1]!);
      const dateien = fs.readdirSync(dir).sort();
      gesehen.push({ args, dateien, inhalt: dateien.map((n) => fs.readFileSync(path.join(dir, n), "utf8")) });
      fs.writeFileSync(args[args.length - 1]!, "KLEIN");
      return { code: 0, stdout: "", stderr: "" };
    };
    const bilder = new Map([
      [3, Buffer.from("drei").toString("base64")],
      [1, Buffer.from("eins").toString("base64")],
      [7, Buffer.from("sieben").toString("base64")],
      [2, Buffer.from("zwei").toString("base64")],
      [9, Buffer.from("neun").toString("base64")],
    ]);
    const r = await bogenCollage(bilder, { maxBytes: 100, lauf });
    expect(r?.toString()).toBe("KLEIN");
    expect(gesehen).toHaveLength(1);
    expect(gesehen[0]!.inhalt.filter((x) => x !== "KLEIN")).toEqual(["eins", "zwei", "drei", "sieben", "neun"]);
    const vf = gesehen[0]!.args[gesehen[0]!.args.indexOf("-vf") + 1]!;
    expect(vf).toContain("tile=4x2");
    expect(gesehen[0]!.args).toContain("-frames:v");
  });

  it("ist die Datei zu gross, wird eine halb so grosse und gröbere Stufe versucht; passt auch die nicht, gibt es nichts", async () => {
    const stufen: string[] = [];
    const lauf: Ausfuehrer = async (_c, args) => {
      stufen.push(args[args.indexOf("-vf") + 1]!);
      fs.writeFileSync(args[args.length - 1]!, Buffer.alloc(stufen.length === 1 ? 500 : 50));
      return { code: 0, stdout: "", stderr: "" };
    };
    const einBild = new Map([[1, Buffer.from("x").toString("base64")]]);
    expect((await bogenCollage(einBild, { maxBytes: 100, lauf }))?.length).toBe(50);
    expect(stufen).toHaveLength(2);
    expect(stufen[0]).not.toContain("scale");
    expect(stufen[1]).toContain("scale=iw/2:ih/2");
    stufen.length = 0;
    const zuGross: Ausfuehrer = async (_c, args) => (fs.writeFileSync(args[args.length - 1]!, Buffer.alloc(500)), { code: 0, stdout: "", stderr: "" });
    expect(await bogenCollage(einBild, { maxBytes: 100, lauf: zuGross })).toBeUndefined();
  });

  it("eine Datei genau an der Grenze ist erlaubt, ein Byte mehr nicht", async () => {
    const einBild = new Map([[1, Buffer.from("x").toString("base64")]]);
    const schreibt = (n: number): Ausfuehrer => async (_c, args) => (fs.writeFileSync(args[args.length - 1]!, Buffer.alloc(n)), { code: 0, stdout: "", stderr: "" });
    expect((await bogenCollage(einBild, { maxBytes: 100, lauf: schreibt(100) }))?.length).toBe(100);
    expect(await bogenCollage(einBild, { maxBytes: 99, lauf: schreibt(100) })).toBeUndefined();
  });

  it("schlägt ffmpeg fehl oder entsteht keine Datei, gibt es keine Collage und keinen Fehler", async () => {
    const einBild = new Map([[1, Buffer.from("x").toString("base64")]]);
    expect(await bogenCollage(einBild, { maxBytes: 100, lauf: async () => ({ code: 1, stdout: "", stderr: "kaputt" }) })).toBeUndefined();
    expect(await bogenCollage(einBild, { maxBytes: 100, lauf: async () => ({ code: 0, stdout: "", stderr: "" }) })).toBeUndefined();
  });

  it("räumt den Arbeitsordner auf, auch bei einem Fehler", async () => {
    let dir = "";
    const lauf: Ausfuehrer = async (_c, args) => {
      dir = path.dirname(args[args.indexOf("-i") + 1]!);
      throw new Error("ffmpeg fehlt");
    };
    await expect(bogenCollage(new Map([[1, "eA=="]]), { maxBytes: 100, lauf })).rejects.toThrow("ffmpeg fehlt");
    expect(fs.existsSync(dir)).toBe(false);
  });

  it.skipIf(!ffmpegDa)("mit echtem ffmpeg: fünf Zellen ergeben ein JPEG aus vier Spalten und zwei Zeilen", async () => {
    const farben = ["red", "green", "blue", "yellow", "white"];
    const bilder = new Map(farben.map((f, i) => [i + 1, jpeg(270, 480, f)] as const));
    const b = await bogenCollage(bilder, { maxBytes: 8 * 1024 * 1024 });
    expect(b).toBeDefined();
    expect([b![0], b![1], b![2]]).toEqual([0xff, 0xd8, 0xff]);
    const { w, h } = ausmasse(b!);
    // vier Zellen à 270 Pixel, drei Abstände und zwei Ränder zu je 8 Pixel; zwei Zeilen à 480
    expect(w).toBe(4 * 270 + 3 * 8 + 2 * 8);
    expect(h).toBe(2 * 480 + 1 * 8 + 2 * 8);
  });
});
