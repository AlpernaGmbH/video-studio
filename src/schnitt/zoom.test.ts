import { describe, expect, it } from "vitest";
import { leseSchnittplan, platziere, SchnittQuelle } from "./plan";
import { entferneZooms, wendeZoomsAn } from "./zoom";

const quelle = SchnittQuelle.parse({ id: "a", pfad: "rohmaterial/t/a.mov", art: "video", dauer: 60, fps: 25, breite: 1080, hoehe: 1920, hatAudio: true });
const basis = () =>
  leseSchnittplan({
    version: 1,
    projekt: { name: "t", marke: "alperna" },
    quellen: [quelle],
    clips: [
      { id: "z01-1", quelle: "a", von: 10, bis: 14, zeile: 1, notiz: "gelb: Füllwort" },
      { id: "z02-1", quelle: "a", von: 30, bis: 33, zeile: 2 },
    ],
  });
const gesamt = (p: ReturnType<typeof basis>) => platziere(p).gesamtFrames;
const z = (t: number, dauer = 1.2, stufe = 1.1) => ({ t, dauer, stufe, begruendung: "Betontes Wort, Zahl" });

describe("wendeZoomsAn", () => {
  it("trennt den Clip an Anfang und Ende des Zooms, das Mittelstück bekommt den Zoom, es geht keine Zeit verloren", () => {
    const p = basis();
    const r = wendeZoomsAn(p, [z(1, 1.2)]);
    expect(r.clips.map((c) => c.id)).toEqual(["z01-1-s1", "z01-1-s2", "z01-1-s3", "z02-1"]);
    expect(r.clips.map((c) => c.zoom)).toEqual([1, 1.1, 1, 1]);
    // Quellzeiten: 10 bis 11, 11 bis 12,2, 12,2 bis 14: lückenlos
    expect(r.clips[0]!.von).toBe(10);
    expect(r.clips[0]!.bis).toBeCloseTo(11, 5);
    expect(r.clips[1]!.von).toBeCloseTo(11, 5);
    expect(r.clips[1]!.bis).toBeCloseTo(12.2, 5);
    expect(r.clips[2]!.von).toBeCloseTo(12.2, 5);
    expect(r.clips[2]!.bis).toBe(14);
    expect(gesamt(r)).toBe(gesamt(p));
  });

  it("legt den Zoom auch über eine Clipgrenze, jedes Stück bekommt ihn", () => {
    const p = basis(); // Clip 1 endet bei 4 s der Timeline
    const r = wendeZoomsAn(p, [z(3.2, 1.6)]);
    const gezoomt = r.clips.filter((c) => c.zoom > 1).map((c) => c.id);
    expect(gezoomt).toEqual(["z01-1-s2", "z02-1-s1"]);
    expect(gesamt(r)).toBe(gesamt(p));
  });

  it("macht keinen Mikro-Schnitt nahe einer Grenze", () => {
    const p = basis();
    // Zoom beginnt 0,1 s nach dem Anfang des Clips: kein Schnitt dort, der Clip beginnt gleich mit dem Zoom
    const r = wendeZoomsAn(p, [z(0.1, 1.2)]);
    expect(r.clips[0]!.zoom).toBe(1.1);
    expect(r.clips[0]!.id).toBe("z01-1-s1");
    expect(r.clips.length).toBe(3);
  });

  it("behält die Notiz des Clips und hängt die Begründung des Zooms an", () => {
    const r = wendeZoomsAn(basis(), [z(1, 1.2)]);
    expect(r.clips[0]!.notiz).toBe("gelb: Füllwort");
    expect(r.clips[1]!.notiz).toMatch(/^gelb: Füllwort; Zoom 1,10-fach: Betontes Wort, Zahl$/);
  });

  it("setzt keinen Zoom ohne Einsatz", () => {
    const p = basis();
    expect(wendeZoomsAn(p, []).clips.map((c) => c.zoom)).toEqual([1, 1]);
  });

  it("ist wiederholbar: Ein zweiter Lauf ersetzt die Zooms des ersten", () => {
    const eins = wendeZoomsAn(basis(), [z(1, 1.2)]);
    const zwei = wendeZoomsAn(eins, [z(2, 1.0, 1.15)]);
    expect(zwei.clips.filter((c) => c.zoom > 1)).toHaveLength(1);
    expect(zwei.clips.find((c) => c.zoom > 1)!.zoom).toBe(1.15);
    expect(gesamt(zwei)).toBe(gesamt(basis()));
  });
});

describe("entferneZooms", () => {
  it("setzt die Clips wieder zusammen und stellt Zoom, Kennung und Notiz her", () => {
    const p = basis();
    const r = entferneZooms(wendeZoomsAn(p, [z(1, 1.2), z(5, 1)]));
    expect(r.clips.map((c) => c.id)).toEqual(["z01-1", "z02-1"]);
    expect(r.clips.map((c) => c.zoom)).toEqual([1, 1]);
    expect(r.clips[0]!.von).toBe(10);
    expect(r.clips[0]!.bis).toBe(14);
    expect(r.clips[0]!.notiz).toBe("gelb: Füllwort");
    expect(r.clips[1]!.bis).toBe(33);
  });
});
