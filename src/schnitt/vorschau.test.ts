import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { leseSchnittplan, type Schnittplan } from "./plan";
import { erzeugeVorschau, fehlendeDateien, kannUntertitel, vorschauArgs, vorschauHinweis, VORSCHAU_BREITE, VORSCHAU_HOEHE } from "./vorschau";

const hatFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
const loese = (rel: string, art: string) => `/m/${art}/${rel}`;
const plan = (extra: Record<string, unknown> = {}): Schnittplan =>
  leseSchnittplan({
    version: 1,
    projekt: { name: "Test", marke: "alperna" },
    quellen: [
      { id: "sprache", pfad: "rohmaterial/farben.mp4", art: "video", dauer: 4, fps: 25, breite: 320, hoehe: 568, hatAudio: true },
      { id: "stumm", pfad: "rohmaterial/stumm.mp4", art: "video", dauer: 2, fps: 25, breite: 320, hoehe: 568, hatAudio: false },
      { id: "broll-k-0001", pfad: "rohmaterial/magenta.mp4", art: "video", dauer: 2, fps: 25, breite: 640, hoehe: 360 },
      { id: "musik", pfad: "rohmaterial/musik.wav", art: "audio", dauer: 10, hatAudio: true },
    ],
    clips: [
      { id: "k01", quelle: "sprache", von: 0, bis: 1 },
      { id: "k02", quelle: "sprache", von: 2, bis: 3, zoom: 1.1 },
    ],
    ...extra,
  });

describe("vorschauArgs", () => {
  const args = (p: Schnittplan, o: Record<string, unknown> = {}) => vorschauArgs({ plan: p, loese, ausgabe: "/tmp/v.mp4", ...o });
  const graph = (a: string[]) => a[a.indexOf("-filter_complex") + 1]!;

  it("öffnet jeden Clip mit Sprung und Dauer als eigenen Eingang und hängt sie mit concat aneinander", () => {
    const a = args(plan());
    expect(a.join(" ")).toContain("-ss 0 -t 1.08 -i /m/quelle/rohmaterial/farben.mp4");
    expect(a.join(" ")).toContain("-ss 2 -t 1.08 -i /m/quelle/rohmaterial/farben.mp4");
    expect(graph(a)).toContain("[v0][a0][v1][a1]concat=n=2:v=1:a=1[vbasis][abasis]");
    expect(graph(a)).toContain("trim=end_frame=25");
  });

  it("wendet den Look als 3D-LUT auf die Sprach-Clips an (vor dem Zoom), nicht auf B-Roll, und lässt ihn weg, wenn die Datei fehlt", () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "vorschau-lut-"));
    try {
      const lut = path.join(d, "look.cube");
      fs.writeFileSync(lut, "LUT_3D_SIZE 2\n");
      const mitLook = plan({ look: { lut: "renders/look/alperna-kino.cube" }, broll: [{ quelle: "broll-k-0001", katalog: "k-0001", t: 0.2, dauer: 0.4, von: 0, begruendung: "Zeigt die Aussage" }] });
      const g = graph(vorschauArgs({ plan: mitLook, loese: (rel, art) => (rel.endsWith(".cube") ? lut : `/m/${art}/${rel}`), ausgabe: "/tmp/v.mp4" }));
      expect(g).toContain(`crop=540:960,lut3d=file='${lut}',setsar=1`);
      expect(g).toContain(`crop=540:960,lut3d=file='${lut}',scale=594:1056,crop=540:960,setsar=1`);
      expect(g.match(/lut3d/g)).toHaveLength(2);
      // ohne Datei kein lut3d, aber die Datei steht bei den fehlenden
      expect(graph(args(mitLook))).not.toContain("lut3d");
      expect(fehlendeDateien(mitLook, loese)).toContain("/m/quelle/renders/look/alperna-kino.cube");
    } finally {
      fs.rmSync(d, { recursive: true, force: true });
    }
  });

  it("füllt 540 mal 960 und zoomt nur Clips mit Zoom", () => {
    const g = graph(args(plan()));
    expect(g).toContain(`scale=${VORSCHAU_BREITE}:${VORSCHAU_HOEHE}:force_original_aspect_ratio=increase,crop=${VORSCHAU_BREITE}:${VORSCHAU_HOEHE},setsar=1,setpts`);
    expect(g).toContain("scale=594:1056,crop=540:960");
    expect(g.match(/scale=594:1056/g)).toHaveLength(1);
  });

  it("ersetzt fehlenden Ton einer Quelle durch Stille in der Länge des Clips", () => {
    const g = graph(args(plan({ clips: [{ id: "k01", quelle: "stumm", von: 0, bis: 1 }] })));
    expect(g).toContain("anullsrc=r=48000:cl=stereo,atrim=duration=1");
    expect(g).not.toContain("[0:a]");
  });

  it("legt B-Roll vor Grafiken und beide über die Sprache, mit Zeitfenster", () => {
    const g = graph(args(plan({ broll: [{ quelle: "broll-k-0001", katalog: "k-0001", t: 0.4, dauer: 0.4, von: 1, begruendung: "Zeigt die Aussage" }], overlays: [{ datei: "renders/g.webm", effekt: "x", t: 1.2, dauer: 0.4, begruendung: "Kennzahl im Skript" }] })));
    expect(g).toContain("[vbasis][b0]overlay=enable='between(t,0.4,0.8)':eof_action=pass:format=auto[vl1]");
    expect(g).toContain("[vl1][g0]overlay=enable='between(t,1.2,1.6)':eof_action=pass:format=auto[vl2]");
    expect(g).toContain("[vl2]format=yuv420p[vout]");
    expect(g).toContain("setpts=PTS-STARTPTS+0.4/TB[b0]");
    expect(g).toContain("setpts=PTS-STARTPTS+1.2/TB[g0]");
  });

  it("liest Grafiken mit dem libvpx-Decoder, sonst geht der Alphakanal verloren", () => {
    const a = args(plan({ overlays: [{ datei: "renders/g.webm", effekt: "x", t: 1, dauer: 0.5, begruendung: "Kennzahl im Skript" }] }));
    expect(a.join(" ")).toContain("-c:v libvpx-vp9 -i /m/overlay/renders/g.webm");
  });

  it("mischt die Musik mit ihrem Pegel und Beginn unter die Sprache", () => {
    const g = graph(args(plan({ musik: { quelle: "musik", t: 0.48, von: 3, pegelDb: -20 } })));
    expect(g).toContain("volume=-20dB");
    expect(g).toContain("adelay=480|480");
    expect(g).toContain("[abasis][musik]amix=inputs=2:duration=first:normalize=0[amix]");
    expect(g).toContain("[amix]alimiter");
  });

  it("brennt Untertitel ein, wenn eine SRT angegeben ist, und maskiert den Pfad", () => {
    const g = graph(args(plan(), { untertitel: "C:\\Daten\\it's.srt" }));
    expect(g).toContain("subtitles='C\\:/Daten/it\\\\\\'s.srt'");
    expect(g).toContain("[vtitel]format=yuv420p[vout]");
    expect(graph(args(plan()))).not.toContain("subtitles");
  });

  it("kodiert H.264 und AAC mit Schnellstart", () => {
    const a = args(plan());
    expect(a.join(" ")).toMatch(/-r 25\/1 -c:v libx264 -preset veryfast -crf 27 -c:a aac -b:a 128k -movflags \+faststart \/tmp\/v\.mp4$/);
  });

  it("rechnet NTSC-Bildraten als Bruch", () => {
    const p = plan({ projekt: { name: "T", marke: "alperna", fps: 29.97 } });
    expect(args(p).join(" ")).toContain("-r 30000/1001");
  });
});

describe("vorschauArgs im Export-Modus", () => {
  const exp = { videoKbit: 9000, audioKbit: 192, spitzeDbtp: -1 };
  const args = (e?: typeof exp) => vorschauArgs({ plan: plan(), loese, ausgabe: "/o/aus.mp4", export: e });
  const wert = (a: string[], flag: string) => a[a.indexOf(flag) + 1];

  it("nimmt die Grösse des Projekts statt der Vorschau-Grösse und kodiert nach dem Preset (H.264 High, Bitrate, AAC, bt709)", () => {
    const a = args(exp);
    const graph = wert(a, "-filter_complex")!;
    expect(graph).toContain("scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920");
    expect(graph).not.toContain(`scale=${VORSCHAU_BREITE}:${VORSCHAU_HOEHE}`);
    expect(graph).toContain("out_color_matrix=bt709");
    expect(graph).toContain("setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709");
    expect(wert(a, "-profile:v")).toBe("high");
    expect(wert(a, "-b:v")).toBe("9000k");
    expect(wert(a, "-maxrate")).toBe("9000k");
    expect(wert(a, "-bufsize")).toBe("18000k");
    expect(wert(a, "-b:a")).toBe("192k");
    expect(wert(a, "-colorspace")).toBe("bt709");
    expect(a).not.toContain("-crf");
  });
  it("der Limiter liegt 0,6 dB unter dem True-Peak-Ziel", () => {
    const graph = wert(args(exp), "-filter_complex")!;
    expect(graph).toContain(`alimiter=limit=${Math.pow(10, -1.6 / 20).toFixed(4)}`);
  });
  it("ohne Export-Feld bleibt es die kleine Vorschau", () => {
    const a = args();
    expect(wert(a, "-crf")).toBe("27");
    expect(wert(a, "-filter_complex")).toContain(`scale=${VORSCHAU_BREITE}:${VORSCHAU_HOEHE}`);
    expect(a).not.toContain("-colorspace");
  });
});

describe("vorschauHinweis", () => {
  it("nennt ohne Look und Musik «kein Look» und «roher Ton»", () => {
    const t = vorschauHinweis({});
    expect(t).toContain("kein Look");
    expect(t).toContain("roher Ton");
  });
  it("nennt mit Look und Musik den Look und die grobe Tonmischung, nicht mehr «kein Look»", () => {
    const t = vorschauHinweis({ look: { lut: "renders/look/x.cube", name: "Alperna Kino" }, musik: { quelle: "musik-1", t: 0, von: 0, pegelDb: 0 } });
    expect(t).toContain("Look «Alperna Kino»");
    expect(t).toContain("Tonmischung grob");
    expect(t).not.toContain("kein Look");
    expect(t).not.toContain("roher Ton");
  });
});

describe("fehlendeDateien", () => {
  let dir: string;
  beforeEach(() => (dir = fs.mkdtempSync(path.join(os.tmpdir(), "vorschau-fehlt-"))));
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
  const lo = (rel: string, art: string) => path.join(dir, art, path.basename(rel));
  const lege = (art: string, name: string) => {
    fs.mkdirSync(path.join(dir, art), { recursive: true });
    fs.writeFileSync(path.join(dir, art, name), "x");
  };
  const p = () =>
    plan({
      broll: [{ quelle: "broll-k-0001", katalog: "k-0001", t: 0.4, dauer: 0.4, von: 1, begruendung: "Zeigt die Aussage" }],
      overlays: [{ datei: "renders/grafik.webm", effekt: "x", t: 1.2, dauer: 0.4, begruendung: "Kennzahl im Skript" }],
      musik: { quelle: "musik", t: 0, von: 0, pegelDb: -20 },
    });
  it("nennt jede benutzte Datei, die fehlt, einmal", () => {
    lege("quelle", "farben.mp4");
    expect(fehlendeDateien(p(), lo).map((x) => path.relative(dir, x)).sort()).toEqual(["overlay/grafik.webm", "quelle/magenta.mp4", "quelle/musik.wav"]);
  });
  it("meldet nichts, wenn alles da ist, und verlangt keine Quellen, die der Plan nicht benutzt", () => {
    for (const [art, n] of [["quelle", "farben.mp4"], ["quelle", "magenta.mp4"], ["quelle", "musik.wav"], ["overlay", "grafik.webm"]] as const) lege(art, n);
    expect(fehlendeDateien(p(), lo)).toEqual([]);
    expect(fehlendeDateien(plan(), (rel, art) => (art === "quelle" && rel.includes("farben") ? path.join(dir, "quelle", "farben.mp4") : "/gibt/es/nicht"))).toEqual([]);
  });
});

describe.skipIf(!hatFfmpeg)("kannUntertitel", () => {
  it("fragt ffmpeg nach dem Filter «subtitles»", async () => {
    const hat = /\ssubtitles\s/.test(spawnSync("ffmpeg", ["-hide_banner", "-filters"]).stdout.toString());
    expect(await kannUntertitel()).toBe(hat);
  });
});

describe.skipIf(!hatFfmpeg)("Vorschau mit echtem ffmpeg", () => {
  let dir: string;
  beforeEach(() => (dir = fs.mkdtempSync(path.join(os.tmpdir(), "vorschau-"))));
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
  const ff = (...a: string[]) => expect(spawnSync("ffmpeg", ["-loglevel", "error", "-y", ...a]).status, a.join(" ")).toBe(0);
  const farbe = (c: string, s = "320x568", d = 1) => ["-f", "lavfi", "-i", `color=c=${c}:s=${s}:r=25:d=${d}`];
  /** Mittlere Farbe (R, G, B) des Bildes bei `t` Sekunden der Vorschau. */
  const bildBei = (datei: string, t: number): number[] => {
    const r = spawnSync("ffmpeg", ["-loglevel", "error", "-ss", String(t), "-i", datei, "-frames:v", "1", "-vf", "crop=100:100:220:430,scale=1:1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]);
    return [...r.stdout];
  };
  const probe = (datei: string) => JSON.parse(spawnSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", datei]).stdout.toString());

  const material = () => {
    // 4 s: rot, grün, blau, gelb, mit Ton
    ff(...farbe("red"), ...farbe("green"), ...farbe("blue"), ...farbe("yellow"), "-f", "lavfi", "-i", "sine=frequency=440:duration=4", "-filter_complex", "[0:v][1:v][2:v][3:v]concat=n=4:v=1[v]", "-map", "[v]", "-map", "4:a", "-shortest", path.join(dir, "farben.mp4"));
    ff(...farbe("magenta", "640x360", 2), path.join(dir, "magenta.mp4"));
    ff("-f", "lavfi", "-i", "sine=frequency=880:duration=10", path.join(dir, "musik.wav"));
    ff("-f", "lavfi", "-i", "color=c=white@0.7:s=1080x1920:r=25:d=1,format=yuva420p", "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", path.join(dir, "grafik.webm"));
  };
  const lo = (rel: string) => path.join(dir, path.basename(rel));

  it("Export: 1080×1920, H.264 High, bt709 getaggt, 25p, mit Ton, Farbe bleibt (rot bleibt rot)", async () => {
    material();
    const aus = path.join(dir, "export.mp4");
    await erzeugeVorschau({ plan: plan(), loese: lo, ausgabe: aus, export: { videoKbit: 9000, audioKbit: 192, spitzeDbtp: -1 } });
    const pr = probe(aus);
    const v = pr.streams.find((s: any) => s.codec_type === "video");
    const a = pr.streams.find((s: any) => s.codec_type === "audio");
    expect([v.width, v.height, v.avg_frame_rate, v.codec_name, v.profile, v.pix_fmt]).toEqual([1080, 1920, "25/1", "h264", "High", "yuv420p"]);
    expect([v.color_space, v.color_transfer, v.color_primaries]).toEqual(["bt709", "bt709", "bt709"]);
    expect([a.codec_name, a.sample_rate, a.channels]).toEqual(["aac", "48000", 2]);
    // Mit bt709 getaggt und mit bt709 gerechnet: Der rote Clip bleibt rot, auch wenn man ihn als bt709 zurückrechnet
    const r = spawnSync("ffmpeg", ["-loglevel", "error", "-ss", "0.5", "-i", aus, "-frames:v", "1", "-vf", "crop=100:100:500:900,scale=1:1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]);
    const rgb = [...r.stdout];
    expect(rgb[0]).toBeGreaterThan(220);
    expect(rgb[1]).toBeLessThan(40);
    expect(rgb[2]).toBeLessThan(40);
  }, 120_000);

  it("der Look verändert das Bild: eine LUT, die Rot und Blau tauscht, macht aus dem roten Clip einen blauen", async () => {
    material();
    // 3D-LUT mit 2 Punkten je Achse: Ausgabe = (B, G, R)
    const eintraege: string[] = [];
    for (let b = 0; b < 2; b++) for (let g = 0; g < 2; g++) for (let r = 0; r < 2; r++) eintraege.push(`${b} ${g} ${r}`);
    fs.writeFileSync(path.join(dir, "tausch.cube"), `LUT_3D_SIZE 2\n${eintraege.join("\n")}\n`);
    const ohne = path.join(dir, "ohne.mp4");
    const mit = path.join(dir, "mit.mp4");
    const loLut = (rel: string) => (rel.endsWith(".cube") ? path.join(dir, "tausch.cube") : lo(rel));
    await erzeugeVorschau({ plan: plan(), loese: loLut, ausgabe: ohne });
    await erzeugeVorschau({ plan: plan({ look: { lut: "renders/look/tausch.cube" } }), loese: loLut, ausgabe: mit });
    // der erste Clip (0 bis 1 s) ist rot
    const rot = bildBei(ohne, 0.5);
    const blau = bildBei(mit, 0.5);
    expect(rot[0]).toBeGreaterThan(200);
    expect(rot[2]).toBeLessThan(60);
    expect(blau[2]).toBeGreaterThan(200);
    expect(blau[0]).toBeLessThan(60);
  }, 60_000);

  it("setzt Clips in der Reihenfolge des Plans, mit B-Roll und Grafik an der richtigen Zeit, und liefert Länge, Grösse und Ton", async () => {
    material();
    const p = plan({
      broll: [{ quelle: "broll-k-0001", katalog: "k-0001", t: 0.4, dauer: 0.4, von: 0.2, begruendung: "Zeigt die Aussage" }],
      overlays: [{ datei: "renders/grafik.webm", effekt: "x", t: 1.2, dauer: 0.4, begruendung: "Kennzahl im Skript" }],
      musik: { quelle: "musik", t: 0, von: 0, pegelDb: -20 },
    });
    const aus = path.join(dir, "v.mp4");
    const r = await erzeugeVorschau({ plan: p, loese: lo, ausgabe: aus });
    expect(r.dauer).toBe(2);
    const pr = probe(aus);
    const v = pr.streams.find((s: any) => s.codec_type === "video");
    const a = pr.streams.find((s: any) => s.codec_type === "audio");
    expect([v.width, v.height, v.avg_frame_rate, v.codec_name]).toEqual([540, 960, "25/1", "h264"]);
    expect(a).toBeDefined();
    expect(Number(pr.format.duration)).toBeGreaterThan(1.95);
    expect(Number(pr.format.duration)).toBeLessThan(2.1);

    const [r1, g1, b1] = bildBei(aus, 0.1);
    expect(r1!).toBeGreaterThan(g1! + 100); // erster Clip: rot
    expect(r1!).toBeGreaterThan(b1! + 100);
    const [r2, g2, b2] = bildBei(aus, 0.6);
    expect(r2!).toBeGreaterThan(g2! + 100); // B-Roll: magenta (rot und blau, kein grün)
    expect(b2!).toBeGreaterThan(g2! + 100);
    const [r3, g3, b3] = bildBei(aus, 1.1);
    expect(b3!).toBeGreaterThan(r3! + 100); // zweiter Clip: blau
    expect(b3!).toBeGreaterThan(g3! + 100);
    const [r4, g4] = bildBei(aus, 1.4);
    expect(r4!).toBeGreaterThan(100); // weisse Grafik darüber hellt das Blau auf
    expect(g4!).toBeGreaterThan(100);
    const [r5, g5] = bildBei(aus, 1.8);
    expect(r5!).toBeLessThan(60); // danach wieder reines Blau
    expect(g5!).toBeLessThan(60);
  }, 120_000);

  it("beginnt die B-Roll bei den besten Sekunden der Datei: erst magenta, dann ab 1 s cyan", async () => {
    material();
    ff(...farbe("magenta", "640x360", 1), ...farbe("cyan", "640x360", 1), "-filter_complex", "[0:v][1:v]concat=n=2:v=1[v]", "-map", "[v]", path.join(dir, "zweifarbig.mp4"));
    const p = plan({
      quellen: [...plan().quellen.filter((q) => q.id !== "broll-k-0001"), { id: "broll-k-0001", pfad: "rohmaterial/zweifarbig.mp4", art: "video", dauer: 2, fps: 25, breite: 640, hoehe: 360 }],
      broll: [{ quelle: "broll-k-0001", katalog: "k-0001", t: 0.4, dauer: 0.4, von: 1.2, begruendung: "Zeigt die Aussage" }],
    });
    const aus = path.join(dir, "v.mp4");
    await erzeugeVorschau({ plan: p, loese: lo, ausgabe: aus });
    const [r, g, b] = bildBei(aus, 0.6);
    expect(g!).toBeGreaterThan(r! + 100);
    expect(b!).toBeGreaterThan(r! + 100);
  }, 120_000);

  it("brennt Untertitel ins Bild", async () => {
    material();
    const srt = path.join(dir, "u.srt");
    fs.writeFileSync(srt, "1\n00:00:00,000 --> 00:00:01,900\nHALLO HALLO HALLO\n");
    const ohne = path.join(dir, "ohne.mp4");
    const mit = path.join(dir, "mit.mp4");
    await erzeugeVorschau({ plan: plan(), loese: lo, ausgabe: ohne });
    await erzeugeVorschau({ plan: plan(), loese: lo, ausgabe: mit, untertitel: srt });
    // untere Bildhälfte: im ersten Clip ist alles rot, mit Text weicht das Bild vom einfarbigen Grund ab
    const spiel = (f: string) => {
      const r = spawnSync("ffmpeg", ["-loglevel", "error", "-ss", "0.5", "-i", f, "-frames:v", "1", "-vf", "crop=540:400:0:560", "-f", "rawvideo", "-pix_fmt", "gray", "-"]);
      let lo = 255;
      let hi = 0;
      for (const v of r.stdout) {
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
      return hi - lo;
    };
    expect(spiel(ohne)).toBeLessThan(10);
    expect(spiel(mit)).toBeGreaterThan(60);
  }, 120_000);

  it("meldet den Fehler von ffmpeg, wenn eine Quelle fehlt", async () => {
    await expect(erzeugeVorschau({ plan: plan(), loese: (r) => path.join(dir, "nicht-da", r), ausgabe: path.join(dir, "v.mp4") })).rejects.toThrow(/ffmpeg schlug fehl/);
  }, 60_000);
});
