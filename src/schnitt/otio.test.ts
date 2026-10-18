import { describe, expect, it } from "vitest";
import { schreibeOtio } from "./otio";
import { beispielPlan, testLoeser } from "./testdaten";

interface Zeit { value: number; rate: number }
interface Bereich { start_time: Zeit; duration: Zeit }
interface Element { OTIO_SCHEMA: string; name: string; source_range: Bereich; media_reference?: { target_url: string; available_range: Bereich }; metadata: { studio?: Record<string, unknown> } }
interface Spur { name: string; kind: string; children: Element[] }

const lies = (plan = beispielPlan()) => {
  const t = JSON.parse(schreibeOtio(plan, testLoeser)) as { OTIO_SCHEMA: string; name: string; global_start_time: Zeit; tracks: { children: Spur[] } };
  const spuren = new Map(t.tracks.children.map((s) => [s.name, s]));
  return { t, spuren };
};
const sek = (z: Zeit): number => z.value / z.rate;

describe("OTIO", () => {
  it("hat fünf Spuren: V1 V2 V3 A1 A2", () => {
    const { t, spuren } = lies();
    expect(t.OTIO_SCHEMA).toBe("Timeline.1");
    expect([...spuren.keys()]).toEqual(["V1", "V2", "V3", "A1", "A2"]);
    expect(spuren.get("V1")!.kind).toBe("Video");
    expect(spuren.get("A1")!.kind).toBe("Audio");
  });

  it("V1 und A1 tragen dieselben Clips mit denselben Längen", () => {
    const { spuren } = lies();
    const v1 = spuren.get("V1")!.children.map((c) => sek(c.source_range.duration));
    const a1 = spuren.get("A1")!.children.map((c) => sek(c.source_range.duration));
    expect(v1).toEqual([2.04, 1.8, 1.6]);
    expect(a1).toEqual(v1);
  });

  it("B-Roll und Grafik liegen hinter einer echten Lücke bis zur Timeline-Position", () => {
    const { spuren } = lies();
    const [lueckeB, broll] = spuren.get("V2")!.children;
    expect(lueckeB!.OTIO_SCHEMA).toBe("Gap.1");
    expect(sek(lueckeB!.source_range.duration)).toBeCloseTo(1.2, 9);
    expect(sek(broll!.source_range.duration)).toBeCloseTo(1, 9);
    // 50-fps-Quelle: Einstieg 3 s = Frame 150
    expect(broll!.source_range.start_time).toMatchObject({ value: 150, rate: 50 });
    expect(broll!.metadata.studio!["katalog"]).toBe("k-0142");
    const [lueckeG, grafik] = spuren.get("V3")!.children;
    expect(sek(lueckeG!.source_range.duration)).toBeCloseTo(2.6, 9);
    expect(sek(grafik!.source_range.duration)).toBeCloseTo(2, 9);
  });

  it("Musik beginnt in der Quelle bei 10 s und läuft bis zum Ende des Videos", () => {
    const { spuren } = lies();
    const musik = spuren.get("A2")!.children[0]!;
    expect(sek(musik.source_range.start_time)).toBeCloseTo(10, 9);
    expect(sek(musik.source_range.duration)).toBeCloseTo(5.44, 3);
    expect(musik.media_reference!.target_url).toBe("file:///studio/rohmaterial/musik/bett-01.wav");
  });

  it("jede Spur ist so lang wie das Video oder kürzer (nichts ragt über das Ende)", () => {
    const { spuren } = lies();
    for (const s of spuren.values()) {
      const summe = s.children.reduce((a, c) => a + sek(c.source_range.duration), 0);
      expect(summe).toBeLessThanOrEqual(5.44 + 1e-6);
    }
  });

  it("29,97 fps bleibt exakt: Rate 30000/1001, nicht 29,97", () => {
    const plan = beispielPlan({
      quellen: [{ id: "sprache", pfad: "rohmaterial/a.mov", art: "video", dauer: 30, fps: 29.97, breite: 1920, hoehe: 1080, hatAudio: true }],
      clips: [{ id: "k01", quelle: "sprache", von: 1, bis: 3 }],
      broll: [],
      overlays: [],
      musik: undefined,
      woerter: [],
    });
    const { spuren } = lies(plan);
    expect(spuren.get("V1")!.children[0]!.source_range.start_time.rate).toBeCloseTo(30000 / 1001, 9);
    expect(spuren.get("V1")!.children[0]!.source_range.start_time.value).toBe(30);
  });

  it("ohne Musik gibt es keine Spur A2", () => {
    const { spuren } = lies(beispielPlan({ musik: undefined }));
    expect(spuren.has("A2")).toBe(false);
  });
});
