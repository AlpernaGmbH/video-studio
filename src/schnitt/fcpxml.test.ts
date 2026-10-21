import { describe, expect, it } from "vitest";
import { schreibeFcpxml } from "./fcpxml";
import { platziere } from "./plan";
import { beispielPlan, beispielPlanMitTon, testLoeser } from "./testdaten";
import { finde, findeAlle, liesXml, zeitZuSekunden } from "./testxml";

const xml = (plan = beispielPlan()) => schreibeFcpxml(plan, testLoeser);

describe("FCPXML 1.8", () => {
  it("ist wohlgeformt, trägt Version 1.8 und beginnt mit dem XML-Kopf und dem DOCTYPE von FCPXML", () => {
    const text = xml();
    expect(text.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE fcpxml>\n<fcpxml version="1.8">')).toBe(true);
    expect(liesXml(text).name).toBe("fcpxml");
  });

  it("hat Projektformat 1080×1920 bei 1/25 s und die Rec.-709-Angabe", () => {
    const w = liesXml(xml());
    const formate = findeAlle(w, "format");
    const projekt = formate.find((f) => f.attr["width"] === "1080" && f.attr["height"] === "1920")!;
    expect(projekt.attr["frameDuration"]).toBe("1/25s");
    expect(projekt.attr["colorSpace"]).toContain("Rec. 709");
  });

  it("die Sequenz dauert so lang wie die Clips des Spine zusammen, und die Clips liegen lückenlos hintereinander", () => {
    const plan = beispielPlan();
    const w = liesXml(xml(plan));
    const seq = findeAlle(w, "sequence")[0]!;
    const spine = finde(seq, "spine")[0]!;
    const clips = finde(spine, "asset-clip");
    let t = 0;
    for (const c of clips) {
      expect(zeitZuSekunden(c.attr["offset"]!)).toBeCloseTo(t, 9);
      t += zeitZuSekunden(c.attr["duration"]!);
    }
    expect(zeitZuSekunden(seq.attr["duration"]!)).toBeCloseTo(t, 9);
    expect(t).toBeCloseTo(platziere(plan).gesamtFrames / 25, 9);
  });

  it("jeder Clip verweist auf eine Quelle mit file://-Adresse", () => {
    const w = liesXml(xml());
    const assets = new Map(findeAlle(w, "asset").map((a) => [a.attr["id"]!, a]));
    for (const c of findeAlle(w, "asset-clip")) {
      const a = assets.get(c.attr["ref"]!);
      expect(a, `Asset ${c.attr["ref"]}`).toBeDefined();
      expect(a!.attr["src"]).toMatch(/^file:\/\/\/studio\//);
    }
  });

  it("verbundene Clips: Lane 1 B-Roll, Lane 2 Grafik, Lane −1 Musik, Offset in der Zeit des Elternclips", () => {
    const plan = beispielPlan();
    const w = liesXml(xml(plan));
    const spine = findeAlle(w, "spine")[0]!;
    const [k01, k02, k03] = finde(spine, "asset-clip");
    const kinder = (k: typeof k01) => finde(k!, "asset-clip");
    // B-Roll beginnt bei 1,2 s (Frame 30), liegt also im ersten Clip: Elternbeginn in der Quelle 2 s + 1,2 s
    const broll = kinder(k01).find((c) => c.attr["lane"] === "1")!;
    expect(zeitZuSekunden(broll.attr["offset"]!)).toBeCloseTo(2 + 1.2, 9);
    expect(broll.attr["name"]).toBe("broll-k-0142");
    expect(zeitZuSekunden(broll.attr["start"]!)).toBeCloseTo(3, 9); // von = 3 s in der Quelle (50 fps)
    expect(zeitZuSekunden(broll.attr["duration"]!)).toBeCloseTo(1, 9);
    // B-Roll ist stumm
    expect(finde(broll, "adjust-volume")[0]!.attr["amount"]).toBe("-96dB");
    // Grafik bei 2,6 s (Frame 65) liegt im zweiten Clip (ab Frame 51): Beginn in der Quelle 6,2 s plus 14 Frames
    const grafik = kinder(k02).find((c) => c.attr["lane"] === "2")!;
    expect(zeitZuSekunden(grafik.attr["offset"]!)).toBeCloseTo(6.2 + 14 / 25, 9);
    expect(grafik.attr["name"]).toBe("overlay-zahl-zaehler");
    // Musik beginnt bei 0 s, hängt am ersten Clip, Pegel −20 dB, läuft bis zum Ende des Videos
    const musik = kinder(k01).find((c) => c.attr["lane"] === "-1")!;
    expect(finde(musik, "adjust-volume")[0]!.attr["amount"]).toBe("-20dB");
    expect(zeitZuSekunden(musik.attr["duration"]!)).toBeCloseTo(136 / 25, 9);
    expect(kinder(k03)).toHaveLength(0);
  });

  it("Zoom steht als adjust-transform am Clip, Zoom 1 schreibt nichts", () => {
    const w = liesXml(xml());
    const [k01, k02] = finde(findeAlle(w, "spine")[0]!, "asset-clip");
    expect(finde(k01!, "adjust-transform")).toHaveLength(0);
    expect(finde(k02!, "adjust-transform")[0]!.attr["scale"]).toBe("1.1 1.1");
  });

  it("Quellen mit 50 fps bekommen ihr eigenes Format, damit Resolve die Bildrate nicht rät", () => {
    const w = liesXml(xml());
    const asset = findeAlle(w, "asset").find((a) => a.attr["name"] === "empfang")!;
    const format = findeAlle(w, "format").find((f) => f.attr["id"] === asset.attr["format"])!;
    expect(format.attr["frameDuration"]).toBe("1/50s");
    expect(format.attr["width"]).toBe("1920");
  });

  it("29,97-fps-Quelle: Einstieg und Dauer als exakte Brüche, keine Dezimalzahlen", () => {
    const plan = beispielPlan({
      quellen: [{ id: "sprache", pfad: "rohmaterial/a.mov", art: "video", dauer: 30, fps: 29.97, breite: 1920, hoehe: 1080, hatAudio: true }],
      clips: [{ id: "k01", quelle: "sprache", von: 1, bis: 3 }],
      broll: [],
      overlays: [],
      musik: undefined,
      woerter: [],
    });
    const text = xml(plan);
    expect(text).toContain('frameDuration="1001/30000s"');
    expect(text).toMatch(/start="1001\/1000s"/);
    expect(text).not.toMatch(/="[0-9]+\.[0-9]+s"/);
  });

  it("Timecode-Beginn der Datei steht im Asset und im Clipstart, nicht im Offset", () => {
    const plan = beispielPlan({
      quellen: [{ id: "sprache", pfad: "rohmaterial/a.mov", art: "video", dauer: 30, start: 3600, fps: 25, breite: 1080, hoehe: 1920, hatAudio: true }],
      clips: [{ id: "k01", quelle: "sprache", von: 2, bis: 4 }],
      broll: [],
      overlays: [],
      musik: undefined,
      woerter: [],
    });
    const w = liesXml(xml(plan));
    const asset = findeAlle(w, "asset")[0]!;
    expect(zeitZuSekunden(asset.attr["start"]!)).toBe(3600);
    const clip = findeAlle(w, "asset-clip")[0]!;
    expect(zeitZuSekunden(clip.attr["start"]!)).toBe(3602);
    expect(clip.attr["offset"]).toBe("0s");
  });

  it("maskiert Sonderzeichen in Namen und Pfaden", () => {
    const plan = beispielPlan({ projekt: { name: 'Praxis "Hofer" & Söhne <neu>', marke: "alperna" } });
    const text = xml(plan);
    expect(text).toContain("Praxis &quot;Hofer&quot; &amp; Söhne &lt;neu&gt;");
    expect(() => liesXml(text)).not.toThrow();
  });

  it("Leerzeichen und Umlaute im Pfad werden zu einer gültigen file-Adresse", () => {
    const plan = beispielPlan();
    plan.quellen[0]!.pfad = "rohmaterial/Praxis Hofer/Empfang Käse.mov";
    expect(xml(plan)).toContain("file:///studio/rohmaterial/Praxis%20Hofer/Empfang%20K%C3%A4se.mov");
  });

  it("ohne B-Roll, Grafik und Musik gibt es keine verbundenen Clips", () => {
    const plan = beispielPlan({ broll: [], overlays: [], musik: undefined });
    const w = liesXml(xml(plan));
    for (const c of finde(findeAlle(w, "spine")[0]!, "asset-clip")) expect(finde(c, "asset-clip")).toHaveLength(0);
  });
});

describe("FCPXML mit getrenntem Ton", () => {
  const plan = () => beispielPlanMitTon(5.5);
  const w = () => liesXml(xml(plan()));

  it("das Video-Asset der Quelle ist stumm, die Tonaufnahme ist ein eigenes Audio-Asset mit ihrer Datei", () => {
    const assets = findeAlle(w(), "asset");
    const sprache = assets.find((a) => a.attr["name"] === "sprache")!;
    expect(sprache.attr["hasVideo"]).toBe("1");
    expect(sprache.attr["hasAudio"]).toBeUndefined();
    const ton = assets.find((a) => a.attr["name"] === "ton-1")!;
    expect(ton.attr["hasAudio"]).toBe("1");
    expect(ton.attr["hasVideo"]).toBeUndefined();
    expect(ton.attr["src"]).toBe("file:///studio/rohmaterial/praxis-hofer/ton-01.wav");
    expect(ton.attr["audioChannels"]).toBe("1");
  });

  it("jeder Clip der Sprache trägt einen Audio-Clip der Tonaufnahme auf Lane −1, um den Versatz verschoben und so lang wie der Clip", () => {
    const [k01, k02, k03] = finde(findeAlle(w(), "spine")[0]!, "asset-clip");
    for (const [k, von] of [[k01, 2], [k02, 6.2], [k03, 11]] as const) {
      expect(k!.attr["audioRole"]).toBeUndefined();
      const ton = finde(k!, "asset-clip").find((c) => c.attr["lane"] === "-1")!;
      expect(ton.attr["name"]).toBe(`ton-${k!.attr["name"]}`);
      expect(ton.attr["audioRole"]).toBe("dialogue");
      expect(zeitZuSekunden(ton.attr["start"]!)).toBeCloseTo(von + 5.5, 6);
      expect(zeitZuSekunden(ton.attr["duration"]!)).toBeCloseTo(zeitZuSekunden(k!.attr["duration"]!), 9);
      // hängt am Anfang des Elternclips: Offset = Beginn des Elternclips in dessen Quelle
      expect(zeitZuSekunden(ton.attr["offset"]!)).toBeCloseTo(zeitZuSekunden(k!.attr["start"]!), 9);
    }
  });

  it("die Musik rückt auf Lane −2, damit die Sprache Lane −1 hat", () => {
    const [k01] = finde(findeAlle(w(), "spine")[0]!, "asset-clip");
    const lanes = finde(k01!, "asset-clip").map((c) => c.attr["lane"]);
    expect(lanes).toContain("-2");
    expect(lanes.filter((l) => l === "-1")).toHaveLength(1);
    expect(finde(k01!, "asset-clip").find((c) => c.attr["lane"] === "-2")!.attr["name"]).toBe("musik");
  });

  it("ohne getrennten Ton hat die Quelle ihren eigenen Ton und die Musik bleibt auf Lane −1", () => {
    const [k01] = finde(findeAlle(liesXml(xml()), "spine")[0]!, "asset-clip");
    expect(k01!.attr["audioRole"]).toBe("dialogue");
    expect(finde(k01!, "asset-clip").map((c) => c.attr["lane"]).sort()).toEqual(["-1", "1"]);
    expect(findeAlle(liesXml(xml()), "asset").find((a) => a.attr["name"] === "sprache")!.attr["hasAudio"]).toBe("1");
  });

  it("zeigt die Tonaufnahme nur einmal als Asset, auch wenn mehrere Clips sie benutzen", () => {
    expect(findeAlle(w(), "asset").filter((a) => a.attr["name"] === "ton-1")).toHaveLength(1);
  });

  it("ist wohlgeformt und alle Verweise zeigen auf vorhandene Assets", () => {
    const assets = new Set(findeAlle(w(), "asset").map((a) => a.attr["id"]));
    for (const c of findeAlle(w(), "asset-clip")) expect(assets.has(c.attr["ref"]!)).toBe(true);
  });
});
