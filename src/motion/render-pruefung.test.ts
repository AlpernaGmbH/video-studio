import { describe, expect, it } from "vitest";
import { stueckZahl } from "../testing/fixtures";
import {
  BildUrteile,
  bildUrteileZuBefunden,
  parseFfprobe,
  parseHfCheck,
  probenZeiten,
  pruefeRender,
  statAusAlpha,
  type FrameStat,
  type ProbeInfo,
} from "./render-pruefung";

/** So sieht die echte ffprobe-Ausgabe eines HyperFrames-WebM aus (aus einem Lauf auf Linux, HyperFrames 0.8.164). */
const echtesFfprobe = {
  streams: [{ codec_name: "vp9", codec_type: "video", width: 1080, height: 1920, pix_fmt: "yuv420p", r_frame_rate: "25/1", tags: { ALPHA_MODE: "1" } }],
  format: { duration: "2.400000" },
};
const gut: ProbeInfo = { codec: "vp9", breite: 1080, hoehe: 1920, fps: 25, dauer: 2.4, alpha: true };
const frame = (t: number, abdeckung: number, bbox: FrameStat["bbox"] = { x0: 0.06, y0: 0.36, x1: 0.79, y1: 0.6 }): FrameStat => ({ t, abdeckung, bbox: abdeckung > 0 ? bbox : null });
const verlauf = [frame(0, 0), frame(0.3, 0.17), frame(1.2, 0.17), frame(2.36, 0)];
const codes = (e: Parameters<typeof pruefeRender>[0]) => pruefeRender(e).befunde.map((b) => `${b.stufe}:${b.code}`);
const basis = () => ({ stueck: stueckZahl(), dauer: 2.4, probe: gut, frames: verlauf });

describe("parseFfprobe", () => {
  it("liest die echte Ausgabe: Codec, Format, Bildrate, Dauer, Alpha", () => {
    expect(parseFfprobe(echtesFfprobe)).toEqual(gut);
  });
  it("erkennt Alpha an ALPHA_MODE (Gross-/Kleinschreibung egal) oder am Pixelformat", () => {
    expect(parseFfprobe({ ...echtesFfprobe, streams: [{ ...echtesFfprobe.streams[0], tags: { alpha_mode: "1" } }] }).alpha).toBe(true);
    expect(parseFfprobe({ ...echtesFfprobe, streams: [{ ...echtesFfprobe.streams[0], tags: {} }] }).alpha).toBe(false);
    expect(parseFfprobe({ ...echtesFfprobe, streams: [{ ...echtesFfprobe.streams[0], pix_fmt: "yuva420p", tags: {} }] }).alpha).toBe(true);
    expect(parseFfprobe({ ...echtesFfprobe, streams: [{ ...echtesFfprobe.streams[0], pix_fmt: "gray", tags: {} }] }).alpha).toBe(false);
  });
  it("versteht Bruch-Bildraten und wählt den Videostrom", () => {
    const p = parseFfprobe({ streams: [{ codec_type: "audio", codec_name: "aac" }, { ...echtesFfprobe.streams[0], r_frame_rate: "30000/1001" }], format: { duration: "1" } });
    expect(p.codec).toBe("vp9");
    expect(p.fps).toBeCloseTo(29.97, 2);
  });
  it("wirft ohne Videostrom", () => {
    expect(() => parseFfprobe({ streams: [] })).toThrow("kein Videostrom");
  });
});

describe("statAusAlpha", () => {
  it("rechnet Abdeckung und Umfang aus dem Alphakanal", () => {
    const b = 10;
    const h = 20;
    const g = new Uint8Array(b * h);
    for (let y = 5; y < 10; y++) for (let x = 2; x < 6; x++) g[y * b + x] = 255; // 4 × 5 Pixel
    const s = statAusAlpha(g, b, h, 1.5);
    expect(s.abdeckung).toBeCloseTo(20 / 200);
    expect(s.bbox).toEqual({ x0: 0.2, y0: 0.25, x1: 0.6, y1: 0.5 });
    expect(s.t).toBe(1.5);
  });
  it("ein leeres Bild hat keinen Umfang; Rauschen unter der Schwelle zählt nicht", () => {
    const g = new Uint8Array(100).fill(3);
    expect(statAusAlpha(g, 10, 10, 0)).toEqual({ t: 0, abdeckung: 0, bbox: null });
  });
  it("wirft bei falscher Grösse", () => {
    expect(() => statAusAlpha(new Uint8Array(5), 10, 10, 0)).toThrow("erwartet 100");
  });
});

describe("probenZeiten", () => {
  it("verteilt gleichmässig bis zum letzten ganzen Bild", () => {
    const t = probenZeiten(2.4, 9);
    expect(t).toHaveLength(9);
    expect(t[0]).toBe(0);
    expect(t.at(-1)).toBe(2.36);
  });
});

describe("pruefeRender", () => {
  it("ein sauberer Render besteht", () => {
    expect(pruefeRender(basis())).toEqual({ bestanden: true, befunde: [] });
  });

  it("falsche Länge, Auflösung oder Bildrate sind Fehler", () => {
    expect(codes({ ...basis(), dauer: 3 })).toContain("fehler:dauer");
    expect(codes({ ...basis(), probe: { ...gut, dauer: 2.43 } })).toEqual([]); // innerhalb einer Bildlänge
    expect(codes({ ...basis(), probe: { ...gut, breite: 1920, hoehe: 1080 } })).toContain("fehler:format");
    expect(codes({ ...basis(), probe: { ...gut, fps: 30 } })).toContain("fehler:fps");
    expect(codes({ ...basis(), probe: { ...gut, dauer: NaN } })).toContain("fehler:dauer");
  });

  it("ein Overlay ohne Alphakanal ist ein Fehler; anderer Codec nur eine Warnung", () => {
    expect(codes({ ...basis(), probe: { ...gut, alpha: false } })).toContain("fehler:alpha");
    expect(codes({ ...basis(), probe: { ...gut, codec: "h264" } })).toContain("warnung:codec");
  });

  it("ein leerer Render ist ein Fehler", () => {
    const r = pruefeRender({ ...basis(), frames: [frame(0, 0), frame(1, 0.001), frame(2, 0)] });
    expect(r.bestanden).toBe(false);
    expect(r.befunde.map((b) => b.code)).toContain("leer");
  });

  it("Inhalt ausserhalb des Sicherheitsrands ist ein Fehler, mit Zeit und Lage", () => {
    const rechts = frame(1.2, 0.2, { x0: 0.06, y0: 0.36, x1: 0.95, y1: 0.6 });
    const r = pruefeRender({ ...basis(), frames: [frame(0, 0), frame(0.3, 0.17), rechts, frame(2.36, 0)] });
    expect(r.bestanden).toBe(false);
    expect(r.befunde.find((b) => b.code === "sicherheitsrand")?.text).toContain("1.20 s");
    const unten = frame(1.2, 0.2, { x0: 0.06, y0: 0.5, x1: 0.7, y1: 0.9 });
    expect(codes({ ...basis(), frames: [frame(0, 0), unten, frame(2.36, 0)] })).toContain("fehler:sicherheitsrand");
    const oben = frame(1.2, 0.2, { x0: 0.06, y0: 0.01, x1: 0.7, y1: 0.3 });
    expect(codes({ ...basis(), frames: [frame(0, 0), oben, frame(2.36, 0)] })).toContain("fehler:sicherheitsrand");
  });

  it("ein Stück ohne Sicherheitsrand-Pflicht wird nicht daran gemessen", () => {
    const voll = frame(1, 0.9, { x0: 0, y0: 0, x1: 1, y1: 1 });
    const s = stueckZahl({ sicherheitsrand: false });
    expect(codes({ stueck: s, dauer: 2.4, probe: gut, frames: [frame(0, 0), voll, frame(2.36, 0)] })).toEqual([]);
  });

  it("warnt, wenn das Overlay ins Bild springt oder hart endet", () => {
    expect(codes({ ...basis(), frames: [frame(0, 0.17), frame(1.2, 0.17), frame(2.36, 0)] })).toContain("warnung:anfang_nicht_leer");
    expect(codes({ ...basis(), frames: [frame(0, 0), frame(1.2, 0.17), frame(2.36, 0.17)] })).toContain("warnung:ende_nicht_leer");
  });

  it("keine Bilder: nichts zu prüfen ist ein Fehler, kein Bestehen", () => {
    expect(codes({ ...basis(), frames: [] })).toContain("fehler:keine_frames");
  });

  it("übernimmt Befunde von hyperframes check", () => {
    const hf = parseHfCheck({ ok: false, layout: { findings: [{ severity: "error", code: "overflow", message: "Text läuft über" }, { severity: "warning", code: "contrast", message: "Kontrast knapp" }] } });
    const r = pruefeRender({ ...basis(), hfCheck: hf });
    expect(r.bestanden).toBe(false);
    expect(r.befunde.map((b) => `${b.stufe}:${b.code}`)).toEqual(["fehler:hf:overflow", "warnung:hf:contrast"]);
  });

  it("«nicht ok» ohne Einzelbefund ist trotzdem ein Fehler; fehlender Browser eine Warnung", () => {
    expect(codes({ ...basis(), hfCheck: parseHfCheck({ ok: false }) })).toContain("fehler:hf_check");
    expect(codes({ ...basis(), hfCheck: parseHfCheck({ ok: true, browserSkipped: true }) })).toContain("warnung:hf_check_ohne_browser");
  });
});

describe("parseHfCheck", () => {
  it("sammelt Befunde aus verschachtelten Abschnitten und stuft Hinweise als Warnung ein", () => {
    const r = parseHfCheck({ ok: true, lint: { findings: [{ level: "info", rule: "x", text: "Hinweis" }] }, runtime: { sub: { findings: [{ severity: "error", message: "Konsole: Fehler" }] } } });
    expect(r.befunde).toEqual([
      { stufe: "warnung", code: "x", text: "Hinweis" },
      { stufe: "fehler", code: "hf", text: "Konsole: Fehler" },
    ]);
  });
  it("kommt mit unerwartetem Format zurecht und gilt dann nicht als ok", () => {
    expect(parseHfCheck(null)).toEqual({ ok: false, befunde: [], browserUebersprungen: false });
    expect(parseHfCheck({ ok: "ja" }).ok).toBe(false);
  });
});

describe("Bildprüfung durch Claude", () => {
  it("«nicht ok» wird zum Fehler mit Zeitpunkt, ein Urteil ohne Begründung ist selbst ein Fehler", () => {
    const u = BildUrteile.parse({
      urteile: [
        { t: 0.4, ok: true },
        { t: 1.0, ok: false, probleme: ["Zahl wird vom Kartenrand angeschnitten"] },
        { t: 2.0, ok: false },
      ],
      gesamt: "Eine Stelle ist angeschnitten.",
    });
    expect(bildUrteileZuBefunden("zahl-zaehler", u).map((b) => `${b.code}: ${b.text}`)).toEqual([
      "bild: Bild bei 1.00 s: Zahl wird vom Kartenrand angeschnitten",
      "bild_ohne_grund: Bild bei 2.00 s als «nicht ok» markiert, aber ohne Begründung",
    ]);
  });
  it("lauter «ok» ergibt keine Befunde", () => {
    expect(bildUrteileZuBefunden("x", BildUrteile.parse({ urteile: [{ t: 0, ok: true }], gesamt: "Alles in Ordnung" }))).toEqual([]);
  });
});
