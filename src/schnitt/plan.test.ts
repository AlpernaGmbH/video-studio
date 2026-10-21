import { describe, expect, it } from "vitest";
import { externerTon, leseSchnittplan, PlanFehler, platziere, quelleNach } from "./plan";
import { beispielPlan, beispielPlanMitTon } from "./testdaten";

describe("Schnittplan lesen", () => {
  it("füllt Voreinstellungen (Zoom 1, 25 fps) und nimmt Pfade als NFC", () => {
    const p = leseSchnittplan({
      version: 1,
      projekt: { name: "x", marke: "alperna" },
      quellen: [{ id: "a", pfad: "rohmaterial/Käse.mov".normalize("NFD"), art: "video", dauer: 5, fps: 25, breite: 1080, hoehe: 1920 }],
      clips: [{ id: "c1", quelle: "a", von: 0, bis: 1 }],
    });
    expect(p.projekt.fps).toBe(25);
    expect(p.clips[0]!.zoom).toBe(1);
    expect(p.quellen[0]!.pfad).toBe("rohmaterial/Käse.mov".normalize("NFC"));
  });

  it("lehnt absolute Pfade ab", () => {
    expect(() => leseSchnittplan({ version: 1, projekt: { name: "x", marke: "alperna" }, quellen: [{ id: "a", pfad: "/Users/x/a.mov", art: "video", dauer: 5, fps: 25, breite: 10, hoehe: 10 }], clips: [{ id: "c", quelle: "a", von: 0, bis: 1 }] })).toThrow(PlanFehler);
  });

  it("verlangt für Videoquellen Bildrate und Grösse", () => {
    expect(() => leseSchnittplan({ version: 1, projekt: { name: "x", marke: "alperna" }, quellen: [{ id: "a", pfad: "a.mov", art: "video", dauer: 5 }], clips: [{ id: "c", quelle: "a", von: 0, bis: 1 }] })).toThrow(/fps/);
  });

  it("verlangt «bis» nach «von»", () => {
    expect(() => leseSchnittplan({ ...beispielPlan(), clips: [{ id: "c", quelle: "sprache", von: 3, bis: 3 }] })).toThrow(/bis/);
  });

  it("verlangt einen Katalog-Schlüssel und eine Begründung bei B-Roll", () => {
    const basis = beispielPlan();
    expect(() => leseSchnittplan({ ...basis, broll: [{ quelle: "empfang", katalog: "empfang", t: 1, dauer: 1, begruendung: "Empfang zeigen" }] })).toThrow(/k-0142/);
    expect(() => leseSchnittplan({ ...basis, broll: [{ quelle: "empfang", katalog: "k-0142", t: 1, dauer: 1, begruendung: "" }] })).toThrow();
  });
});

describe("platziere", () => {
  it("legt Clips ohne Lücke hintereinander, jede Länge auf ganze Frames", () => {
    const z = platziere(beispielPlan());
    expect(z.clips.map((c) => [c.startFrame, c.frames])).toEqual([
      [0, 51], // 2,04 s
      [51, 45], // 1,8 s
      [96, 40], // 1,6 s
    ]);
    expect(z.gesamtFrames).toBe(136);
  });

  it("der Einstieg in die Quelle liegt auf dem Raster der Quelle, nicht der Timeline", () => {
    const p = beispielPlan({
      quellen: [
        { id: "sprache", pfad: "a.mov", art: "video", dauer: 30, fps: 29.97, breite: 1080, hoehe: 1920, hatAudio: true },
      ],
      clips: [{ id: "k01", quelle: "sprache", von: 1, bis: 2 }],
      broll: [],
      overlays: [],
      musik: undefined,
      woerter: [],
    });
    // 1 s bei 29,97 fps sind 30 Frames (29,97 gerundet), also 30 × 1001/30000 s = 1001/1000 s
    expect(platziere(p).clips[0]!.quellStart).toEqual({ n: 1001, d: 1000 });
  });

  it("eine unbekannte Quelle ist ein Fehler, kein stilles Weglassen", () => {
    const p = beispielPlan({ clips: [{ id: "k01", quelle: "gibts-nicht", von: 0, bis: 1 }] });
    expect(() => platziere(p)).toThrow(/gibts-nicht/);
  });
});

describe("getrennter Ton im Plan", () => {
  it("externerTon liefert Tonaufnahme und Versatz, wenn die Quelle einen getrennten Ton hat", () => {
    const p = beispielPlanMitTon(5.5);
    const q = quelleNach(p);
    const t = externerTon(q.get("sprache")!, q)!;
    expect(t.audio.id).toBe("ton-1");
    expect(t.versatz).toBe(5.5);
  });

  it("externerTon liefert nichts ohne «ton», bei fehlender Quelle oder bei einer Videoquelle als Ton", () => {
    const p = beispielPlanMitTon(5.5);
    const q = quelleNach(p);
    expect(externerTon(q.get("empfang")!, q)).toBeUndefined();
    p.quellen.find((x) => x.id === "sprache")!.ton = { quelle: "gibt-es-nicht", versatz: 1 };
    expect(externerTon(quelleNach(p).get("sprache")!, quelleNach(p))).toBeUndefined();
    p.quellen.find((x) => x.id === "sprache")!.ton = { quelle: "empfang", versatz: 1 };
    expect(externerTon(quelleNach(p).get("sprache")!, quelleNach(p))).toBeUndefined();
  });

  it("nur eine Videoquelle darf einen getrennten Ton haben", () => {
    const roh = { version: 1, projekt: { name: "x", marke: "alperna" }, clips: [{ id: "c1", quelle: "a", von: 0, bis: 1 }] };
    const video = { id: "a", pfad: "rohmaterial/a.mov", art: "video", dauer: 5, fps: 25, breite: 1080, hoehe: 1920 };
    expect(() => leseSchnittplan({ ...roh, quellen: [{ ...video, ton: { quelle: "b", versatz: 2 } }] })).not.toThrow();
    expect(() => leseSchnittplan({ ...roh, quellen: [video, { id: "b", pfad: "rohmaterial/b.wav", art: "audio", dauer: 5, hatAudio: true, ton: { quelle: "a", versatz: 2 } }] })).toThrow(/getrennten Ton/);
  });
});
