import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { leseLink } from "./embed";
import { bogenFilter, folienBoegen, ueberblickFilter, zellenFilter, pruefeAusgabe, schnittZeiten, sichteAlle, sichteLink, stillenAus, WARTEN_BEI_429_MS, type SichtDeps } from "./sichten";

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "studio-sichten-"));
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("pruefeAusgabe", () => {
  it("lehnt einen Zielordner im Repo ab, auch den Repo-Ordner selbst und Unterordner", () => {
    expect(() => pruefeAusgabe("/work/repo", "/work/repo")).toThrow(/im Repo/);
    expect(() => pruefeAusgabe("/work/repo/ausgabe", "/work/repo")).toThrow(/im Repo/);
    expect(() => pruefeAusgabe("/work/repo/../repo/x", "/work/repo")).toThrow(/im Repo/);
  });
  it("nimmt einen Ordner daneben an, auch wenn der Name mit dem des Repos beginnt", () => {
    expect(pruefeAusgabe("/work/repo-medien/inspiration", "/work/repo")).toBe("/work/repo-medien/inspiration");
    expect(pruefeAusgabe("/medien/inspiration", "/work/repo")).toBe("/medien/inspiration");
  });
});

describe("Messwerte lesen", () => {
  it("schnittZeiten liest die Zeitpunkte aus showinfo und ignoriert Zeit 0", () => {
    const err = "[Parsed_showinfo_1] n:   0 pts:      0 pts_time:0 pos:1\n[Parsed_showinfo_1] n:   1 pts:  45000 pts_time:1.5 pos:2\n[Parsed_showinfo_1] n:   2 pts: 120000 pts_time:12.34 pos:3";
    expect(schnittZeiten(err)).toEqual([1.5, 12.34]);
  });
  it("stillenAus zählt die Pausen und addiert ihre Dauer", () => {
    expect(stillenAus("silence_duration: 0.62\nfoo\nsilence_duration: 1.4")).toEqual({ anzahl: 2, sekunden: 2 });
    expect(stillenAus("nichts")).toEqual({ anzahl: 0, sekunden: 0 });
  });
});

describe("bogenFilter", () => {
  it("nimmt im Normalfall Szenenwechsel dazu, bei dichter Abtastung nur das feste Raster", () => {
    const normal = bogenFilter({ dicht: false });
    const dicht = bogenFilter({ dicht: true });
    expect(normal).toContain("gt(scene,0.25)");
    expect(normal).toContain("gte(t-prev_selected_t,2.5)");
    expect(normal).toContain("tile=3x2");
    expect(dicht).not.toContain("scene");
    expect(dicht).toContain("gte(t-prev_selected_t,0.5)");
    expect(dicht).toContain("tile=4x3");
  });
  it("stempelt die Zeit nur, wenn es eine Schrift gibt, und maskiert den Doppelpunkt der Zeitmarke", () => {
    expect(bogenFilter({ dicht: false })).not.toContain("drawtext");
    const mit = bogenFilter({ dicht: false, schrift: "/f/Arial.ttf" });
    expect(mit).toContain("fontfile='/f/Arial.ttf'");
    expect(mit).toContain("%{pts\\:hms}");
  });
});

/* ---------- Ablauf mit Ersatz für Netz, ffmpeg und Whisper ---------- */

function seite(medium: unknown, kontext: Record<string, unknown> = {}): string {
  const inner = JSON.stringify({ context: { copyright_blocked: false, ...kontext }, gql_data: { shortcode_media: medium } });
  return `<script>"contextJSON":${JSON.stringify(inner).replace(/\//g, "\\/")}</script>`;
}

const REEL = seite({ shortcode: "REELCODE01", is_video: true, display_url: "https://cdn.example/r.jpg", video_url: "https://cdn.example/r.mp4", video_duration: 30, owner: { username: "konto" }, edge_media_to_caption: { edges: [{ node: { text: "Text" } }] } });
const KARUSSELL = seite({
  shortcode: "KARUSSELL01",
  edge_sidecar_to_children: {
    edges: [
      { node: { is_video: false, display_url: "https://cdn.example/1.jpg" } },
      { node: { is_video: true, display_url: "https://cdn.example/2.jpg", video_url: "https://cdn.example/2.mp4" } },
    ],
  },
});

interface Gebaut {
  d: SichtDeps;
  texte: string[];
  dateien: string[];
  ffmpegAufrufe: string[][];
  transkripte: string[];
}

function bauen(seiten: Record<string, { status: number; text: string }>, opt: { ohneTon?: string[]; leer?: boolean; kaputteDatei?: string } = {}): Gebaut {
  const g: Gebaut = { texte: [], dateien: [], ffmpegAufrufe: [], transkripte: [], d: undefined as unknown as SichtDeps };
  g.d = {
    async holeText(url) {
      g.texte.push(url);
      return seiten[url] ?? { status: 404, text: "" };
    },
    async holeDatei(url, ziel) {
      g.dateien.push(url);
      if (opt.kaputteDatei && url.includes(opt.kaputteDatei)) return { status: 403, bytes: 0 };
      fs.writeFileSync(ziel, "x");
      return { status: 200, bytes: 1 };
    },
    async ffmpeg(args) {
      g.ffmpegAufrufe.push(args);
      const ziel = args[args.length - 1]!;
      if (ziel.includes("%02d")) fs.writeFileSync(ziel.replace("%02d", "01"), "jpg");
      else if (ziel.endsWith(".jpg")) fs.writeFileSync(ziel, "jpg");
      const stderr = args.join(" ").includes("showinfo") ? "pts_time:2.0\npts_time:9.0\npts_time:20.0" : args.join(" ").includes("ebur128") ? "Summary:\n\n  Integrated loudness:\n    I:         -16.2 LUFS\n  True peak:\n    Peak:       -1.5 dBFS\nsilence_duration: 0.8" : "";
      return { code: 0, stdout: "", stderr };
    },
    async ffprobe(args) {
      const datei = args[args.length - 1]!;
      const ton = !(opt.ohneTon ?? []).some((n) => datei.includes(n));
      return { code: 0, stdout: JSON.stringify({ streams: [{ codec_type: "video" }, ...(ton ? [{ codec_type: "audio" }] : [])], format: { duration: "30" } }), stderr: "" };
    },
    async transkribiere(o) {
      g.transkripte.push(path.basename(o.eingang));
      if (opt.leer) throw new Error("Das Transkript ist leer: Whisper hat keine Sprache gefunden");
      fs.writeFileSync(o.ziel, "{}");
      return { segmente: 4 };
    },
    schrift: () => "/f/Arial.ttf",
    pause: vi.fn(async () => undefined),
    jetzt: () => "2026-10-23T08:00:00.000Z",
  };
  return g;
}

const REEL_URL = "https://www.instagram.com/reel/REELCODE01/embed/captioned/";
const KARUSSELL_URL = "https://www.instagram.com/p/KARUSSELL01/embed/captioned/";
const aus = () => path.join(tmp, "aus");

describe("sichteLink", () => {
  it("lädt ein Reel, misst es und legt Bögen, Transkript und meta.json ab", async () => {
    const g = bauen({ [REEL_URL]: { status: 200, text: REEL } });
    const s = await sichteLink(leseLink("https://www.instagram.com/reel/REELCODE01/?x=1"), { aus: aus() }, g.d);
    expect(s.status).toBe("ok");
    expect(s).toMatchObject({ konto: "konto", typ: "video", beschreibung: "Text" });
    const f = s.folien[0]!;
    expect(f).toMatchObject({ nr: 1, art: "video", datei: "folie-01.mp4", dauer: 30, schnitte: 3, schnitteProMinute: 6, lufs: -16.2, truePeak: -1.5, stillen: { anzahl: 1, sekunden: 0.8 }, transkript: { datei: "folie-01-transkript.json", segmente: 4 } });
    expect(f.boegen).toEqual(["folie-01-bogen-01.jpg"]);
    expect(fs.existsSync(path.join(aus(), "REELCODE01", "meta.json"))).toBe(true);
    expect(s.folienBoegen).toEqual([]);
  });

  it("legt zusätzlich einen Überblick über die ganze Länge an, weil die Szenenbögen bei vielen Schnitten früh voll sind", async () => {
    const g = bauen({ [REEL_URL]: { status: 200, text: REEL } });
    const s = await sichteLink(leseLink("https://www.instagram.com/reel/REELCODE01/"), { aus: aus() }, g.d);
    expect(s.folien[0]!.ueberblick).toBe("folie-01-ueberblick.jpg");
    const u = g.ffmpegAufrufe.find((a) => a[a.length - 1]!.endsWith("folie-01-ueberblick.jpg"))!;
    expect(u[u.indexOf("-vf") + 1]).toContain("fps=10/30.000");
    expect(u[u.indexOf("-vf") + 1]).toContain("tile=4x3");
  });

  it("der Überblick verteilt höchstens zwölf Bilder gleichmässig über die Dauer", () => {
    expect(ueberblickFilter({ dauer: 55.24 })).toMatchObject({ bilder: 12 });
    expect(ueberblickFilter({ dauer: 55.24 }).filter).toContain("fps=12/55.240");
    expect(ueberblickFilter({ dauer: 9 })).toMatchObject({ bilder: 3 });
    expect(ueberblickFilter({ dauer: 9 }).filter).toContain("tile=3x1");
    expect(ueberblickFilter({ dauer: 20, schrift: "/f/a.ttf" }).filter).toContain("drawtext=fontfile='/f/a.ttf'");
  });

  it("ein Video ohne Tonspur wird nicht transkribiert und bleibt ohne Lautheit", async () => {
    const g = bauen({ [REEL_URL]: { status: 200, text: REEL } }, { ohneTon: ["folie-01"] });
    const s = await sichteLink(leseLink("https://www.instagram.com/reel/REELCODE01/"), { aus: aus() }, g.d);
    expect(s.folien[0]).toMatchObject({ ohneTon: true });
    expect(s.folien[0]!.lufs).toBeUndefined();
    expect(g.transkripte).toEqual([]);
  });

  it("Musik ohne Sprache ist kein Fehler, ein anderer Whisper-Fehler wird mit Text festgehalten", async () => {
    const g = bauen({ [REEL_URL]: { status: 200, text: REEL } }, { leer: true });
    expect((await sichteLink(leseLink("https://www.instagram.com/reel/REELCODE01/"), { aus: aus() }, g.d)).folien[0]!.transkript).toEqual({ keineSprache: true });
    const h = bauen({ [REEL_URL]: { status: 200, text: REEL } });
    h.d.transkribiere = async () => {
      throw new Error("Whisper schlug fehl (Exit 1): kein Speicher");
    };
    const s = await sichteLink(leseLink("https://www.instagram.com/reel/REELCODE01/"), { aus: aus(), neu: true }, h.d);
    expect(s.status).toBe("ok");
    expect(s.folien[0]!.transkript).toEqual({ fehler: "Whisper schlug fehl (Exit 1): kein Speicher" });
  });

  it("liest ein Karussell: Bild und Video, dazu ein Überblick über alle Folien", async () => {
    const g = bauen({ [KARUSSELL_URL]: { status: 200, text: KARUSSELL } });
    const s = await sichteLink(leseLink("https://www.instagram.com/p/KARUSSELL01/?img_index=2"), { aus: aus() }, g.d);
    expect(s.status).toBe("ok");
    expect(s.folien.map((f) => [f.nr, f.art, f.datei])).toEqual([
      [1, "bild", "folie-01.jpg"],
      [2, "video", "folie-02.mp4"],
    ]);
    expect(s.folienBoegen).toEqual(["folien-bogen-01.jpg"]);
    expect(g.dateien).toEqual(["https://cdn.example/1.jpg", "https://cdn.example/2.mp4"]);
  });

  it("der Überblick gibt allen Folien dieselbe Zellengrösse, damit Bild- und Videofolien gemischt nicht verloren gehen", async () => {
    const g = bauen({ [KARUSSELL_URL]: { status: 200, text: KARUSSELL } });
    const alt = g.d.ffprobe;
    g.d.ffprobe = async (args) => {
      const datei = args[args.length - 1]!;
      // Bild 4:5, Startbild des Videos 9:16: ohne gemeinsame Zelle verwirft ffmpeg beim Formatwechsel die angefangenen Bögen
      if (/folie-\d{2}\.jpg$/.test(datei)) return { code: 0, stdout: JSON.stringify({ streams: [{ codec_type: "video", width: 1080, height: datei.endsWith("folie-01.jpg") ? 1350 : 1920 }] }), stderr: "" };
      return alt(args);
    };
    await sichteLink(leseLink("https://www.instagram.com/p/KARUSSELL01/"), { aus: aus() }, g.d);
    const filterVon = (a: string[]) => a[a.indexOf("-vf") + 1]!;
    const zellen = g.ffmpegAufrufe.filter((a) => a.includes("-vf") && filterVon(a).includes("pad="));
    expect(zellen).toHaveLength(2);
    for (const z of zellen) expect(filterVon(z)).toContain("scale=540:960:force_original_aspect_ratio=decrease,pad=540:960:(ow-iw)/2:(oh-ih)/2");
    const kachel = g.ffmpegAufrufe.find((a) => a.includes("-vf") && filterVon(a).includes("tile=2x2"))!;
    expect(filterVon(kachel)).not.toContain("scale");
    expect(g.ffmpegAufrufe.indexOf(zellen[1]!)).toBeLessThan(g.ffmpegAufrufe.indexOf(kachel));
  });

  it("ohne lesbare Grössenangabe gilt die Standardhöhe und der Überblick entsteht trotzdem", async () => {
    const g = bauen({ [KARUSSELL_URL]: { status: 200, text: KARUSSELL } });
    const s = await sichteLink(leseLink("https://www.instagram.com/p/KARUSSELL01/"), { aus: aus() }, g.d);
    expect(s.folienBoegen).toEqual(["folien-bogen-01.jpg"]);
    expect(zellenFilter(675)).toContain("scale=540:675");
  });

  it("ein neuer Überblick ersetzt alte Bögen, statt sich an sie zu hängen", async () => {
    const g = bauen({ [KARUSSELL_URL]: { status: 200, text: KARUSSELL } });
    await sichteLink(leseLink("https://www.instagram.com/p/KARUSSELL01/"), { aus: aus() }, g.d);
    const ordner = path.join(aus(), "KARUSSELL01");
    fs.writeFileSync(path.join(ordner, "folien-bogen-07.jpg"), "alt");
    const neu = await folienBoegen(ordner, 2, g.d);
    expect(neu).toEqual(["folien-bogen-01.jpg"]);
    expect(fs.existsSync(path.join(ordner, "folien-bogen-07.jpg"))).toBe(false);
  });

  it("eine Folie, die sich nicht laden lässt, bricht die anderen nicht ab; der Grund steht im Ergebnis", async () => {
    const g = bauen({ [KARUSSELL_URL]: { status: 200, text: KARUSSELL } }, { kaputteDatei: "2.mp4" });
    const s = await sichteLink(leseLink("https://www.instagram.com/p/KARUSSELL01/"), { aus: aus() }, g.d);
    expect(s.status).toBe("ok");
    expect(s.folien.map((f) => f.nr)).toEqual([1]);
    expect(s.grund).toMatch(/Folie 2 nicht ladbar \(HTTP 403\)/);
  });

  it("wenn keine Folie ladbar ist, ist das ein Fehler und nicht «ok»", async () => {
    const g = bauen({ [REEL_URL]: { status: 200, text: REEL } }, { kaputteDatei: "r.mp4" });
    const s = await sichteLink(leseLink("https://www.instagram.com/reel/REELCODE01/"), { aus: aus() }, g.d);
    expect(s.status).toBe("fehler");
    expect(s.folien).toEqual([]);
  });

  it("meldet Seiten ohne Medien, gesperrte und unerreichbare Beiträge mit dem richtigen Status", async () => {
    const ohne = bauen({ [REEL_URL]: { status: 200, text: "<html>Anmelden</html>" } });
    expect((await sichteLink(leseLink("https://www.instagram.com/reel/REELCODE01/"), { aus: aus() }, ohne.d)).status).toBe("nur_text");
    const weg = bauen({});
    expect((await sichteLink(leseLink("https://www.instagram.com/reel/REELCODE01/"), { aus: aus() }, weg.d)).status).toBe("gesperrt");
    const kaputt = bauen({ [REEL_URL]: { status: 500, text: "" } });
    expect((await sichteLink(leseLink("https://www.instagram.com/reel/REELCODE01/"), { aus: aus() }, kaputt.d)).status).toBe("fehler");
    const netz = bauen({});
    netz.d.holeText = async () => {
      throw new Error("ECONNRESET");
    };
    const n = await sichteLink(leseLink("https://www.instagram.com/reel/REELCODE01/"), { aus: aus() }, netz.d);
    expect(n.status).toBe("fehler");
    expect(n.grund).toMatch(/ECONNRESET/);
  });

  it("wartet bei «zu viele Anfragen» und versucht es noch einmal; bleibt es dabei, gibt der Link mit klarem Grund auf", async () => {
    const g = bauen({});
    let n = 0;
    g.d.holeText = async () => (++n < 3 ? { status: 429, text: "" } : { status: 200, text: REEL });
    const s = await sichteLink(leseLink("https://www.instagram.com/reel/REELCODE01/"), { aus: aus() }, g.d);
    expect(s.status).toBe("ok");
    expect(n).toBe(3);
    expect(vi.mocked(g.d.pause).mock.calls.map((c) => c[0])).toEqual(WARTEN_BEI_429_MS.slice(0, 2));

    const h = bauen({});
    h.d.holeText = async () => ({ status: 429, text: "" });
    const k = await sichteLink(leseLink("https://www.instagram.com/reel/ANDERERCODE/"), { aus: aus() }, h.d);
    expect(k.status).toBe("fehler");
    expect(k.grund).toMatch(/begrenzt/);
    expect(vi.mocked(h.d.pause).mock.calls.map((c) => c[0])).toEqual(WARTEN_BEI_429_MS);
  });

  it("Profile und YouTube werden nicht abgerufen, sondern mit Grund gemeldet", async () => {
    const g = bauen({});
    const p = await sichteLink(leseLink("https://www.instagram.com/lemonadsstudio"), { aus: aus() }, g.d);
    const y = await sichteLink(leseLink("https://youtu.be/H9yhVi_8eVU"), { aus: aus() }, g.d);
    expect([p.status, y.status]).toEqual(["nicht_unterstuetzt", "nicht_unterstuetzt"]);
    expect(p.grund).toMatch(/Profile/);
    expect(g.texte).toEqual([]);
  });

  it("macht eine vorhandene Sichtung nicht noch einmal, ausser mit neu", async () => {
    const g = bauen({ [REEL_URL]: { status: 200, text: REEL } });
    const l = leseLink("https://www.instagram.com/reel/REELCODE01/");
    await sichteLink(l, { aus: aus() }, g.d);
    await sichteLink(l, { aus: aus() }, g.d);
    expect(g.texte).toHaveLength(1);
    await sichteLink(l, { aus: aus(), neu: true }, g.d);
    expect(g.texte).toHaveLength(2);
  });

  it("dichte Abtastung nimmt mehr Bögen und das dichtere Raster", async () => {
    const g = bauen({ [REEL_URL]: { status: 200, text: REEL } });
    await sichteLink(leseLink("https://www.instagram.com/reel/REELCODE01/"), { aus: aus(), dicht: true }, g.d);
    const bogen = g.ffmpegAufrufe.find((a) => a.join(" ").includes("tile=4x3"))!;
    expect(bogen).toBeDefined();
    expect(bogen[bogen.indexOf("-frames:v") + 1]).toBe("6");
  });
});

describe("Rückfall mit yt-dlp", () => {
  const GESPERRT = seite({ shortcode: "REELCODE01", is_video: true, video_url: "https://cdn.example/r.mp4" }, { copyright_blocked: true });
  const ytdlpOk = (g: Gebaut, info: Record<string, unknown> = { uploader: "wer", description: "Beschreibung", like_count: 12, view_count: 345 }) => {
    const aufrufe: { url: string; ziel: string }[] = [];
    g.d.ytdlp = async (url, ziel) => {
      aufrufe.push({ url, ziel });
      fs.writeFileSync(`${ziel}.mp4`, "x");
      fs.writeFileSync(`${ziel}.info.json`, JSON.stringify(info));
      return { ok: true };
    };
    return aufrufe;
  };

  it("holt ein gesperrtes Reel mit yt-dlp und behandelt es wie eine Videofolie; Angaben kommen aus der info.json", async () => {
    const g = bauen({ [REEL_URL]: { status: 200, text: GESPERRT } });
    const aufrufe = ytdlpOk(g);
    const s = await sichteLink(leseLink("https://www.instagram.com/reel/REELCODE01/?x=1"), { aus: aus() }, g.d);
    expect(s).toMatchObject({ status: "ok", konto: "wer", beschreibung: "Beschreibung", likes: 12, ansichten: 345, typ: "video" });
    expect(s.grund).toMatch(/über yt-dlp/);
    expect(s.grund).toMatch(/Urheberrecht/);
    expect(aufrufe).toEqual([{ url: "https://www.instagram.com/reel/REELCODE01/?x=1", ziel: path.join(aus(), "REELCODE01", "folie-01") }]);
    expect(s.folien[0]).toMatchObject({ nr: 1, art: "video", datei: "folie-01.mp4", transkript: { segmente: 4 } });
    // die info.json bleibt nicht liegen
    expect(fs.existsSync(path.join(aus(), "REELCODE01", "folie-01.info.json"))).toBe(false);
    expect(fs.existsSync(path.join(aus(), "REELCODE01", "meta.json"))).toBe(true);
  });

  it("versucht yt-dlp auch bei einer Einbettung ohne Medien und bei HTTP 404", async () => {
    const ohne = bauen({ [REEL_URL]: { status: 200, text: "<html>Anmelden</html>" } });
    ytdlpOk(ohne);
    expect((await sichteLink(leseLink("https://www.instagram.com/reel/REELCODE01/"), { aus: aus() }, ohne.d)).status).toBe("ok");
    const weg = bauen({});
    ytdlpOk(weg);
    expect((await sichteLink(leseLink("https://www.instagram.com/reel/REELCODE01/"), { aus: aus(), neu: true }, weg.d)).status).toBe("ok");
  });

  it("scheitert yt-dlp auch, steht beides im Grund und der Status ist «fehler»", async () => {
    const g = bauen({ [REEL_URL]: { status: 200, text: GESPERRT } });
    g.d.ytdlp = async () => ({ ok: false, fehler: "login required" });
    const s = await sichteLink(leseLink("https://www.instagram.com/reel/REELCODE01/"), { aus: aus() }, g.d);
    expect(s.status).toBe("fehler");
    expect(s.grund).toMatch(/Urheberrecht.*yt-dlp: login required/);
  });

  it("ein Treffer der Einbettung ruft yt-dlp nicht auf", async () => {
    const g = bauen({ [REEL_URL]: { status: 200, text: REEL } });
    const aufrufe = ytdlpOk(g);
    await sichteLink(leseLink("https://www.instagram.com/reel/REELCODE01/"), { aus: aus() }, g.d);
    expect(aufrufe).toEqual([]);
  });

  it("YouTube geht nur mit yt-dlp und liegt in einem Ordner mit Präfix, damit Kurzcodes nicht mit Instagram kollidieren", async () => {
    const ohne = bauen({});
    expect((await sichteLink(leseLink("https://youtu.be/H9yhVi_8eVU"), { aus: aus() }, ohne.d)).status).toBe("nicht_unterstuetzt");
    const g = bauen({});
    const aufrufe = ytdlpOk(g, { uploader: "Kanal" });
    const s = await sichteLink(leseLink("https://youtu.be/H9yhVi_8eVU"), { aus: aus() }, g.d);
    expect(s).toMatchObject({ status: "ok", konto: "Kanal" });
    expect(aufrufe[0]!.ziel).toBe(path.join(aus(), "youtube-H9yhVi_8eVU", "folie-01"));
  });

  it("Profile gehen auch mit yt-dlp nicht", async () => {
    const g = bauen({});
    const aufrufe = ytdlpOk(g);
    expect((await sichteLink(leseLink("https://www.instagram.com/lemonadsstudio"), { aus: aus() }, g.d)).status).toBe("nicht_unterstuetzt");
    expect(aufrufe).toEqual([]);
  });
});

describe("sichteAlle", () => {
  it("wartet zwischen echten Abrufen, nicht nach Links ohne Abruf, und meldet jeden Link", async () => {
    const g = bauen({ [REEL_URL]: { status: 200, text: REEL }, [KARUSSELL_URL]: { status: 200, text: KARUSSELL } });
    const links = ["https://www.instagram.com/reel/REELCODE01/", "https://www.instagram.com/lemonadsstudio", "https://www.instagram.com/p/KARUSSELL01/"].map(leseLink);
    const gemeldet: string[] = [];
    const r = await sichteAlle(links, { aus: aus() }, g.d, (s, i, n) => gemeldet.push(`${i}/${n}:${s.status}`));
    expect(r.map((s) => s.status)).toEqual(["ok", "nicht_unterstuetzt", "ok"]);
    expect(gemeldet).toEqual(["1/3:ok", "2/3:nicht_unterstuetzt", "3/3:ok"]);
    // nach dem Reel einmal gewartet; nach dem Profil nicht; nach dem letzten Link nicht
    expect(g.d.pause).toHaveBeenCalledTimes(1);
  });
});
