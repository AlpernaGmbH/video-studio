import { describe, expect, it } from "vitest";
import { bauePlan, NACHLAUF, rasteEin, STANDARD_SCHNITTPROFIL, verschmelzeKleine, VORLAUF, type PlanbauOptionen } from "./planbau";
import type { Segment, TWort } from "./transkript";
import { PlanFehler, platziere, SchnittQuelle } from "./plan";
import { pruefeSchnittplan } from "./pruefung";
import { testLoeser, testSatz as satz } from "./testdaten";
import { schreibeFcpxml } from "./fcpxml";
import { schreibeOtio } from "./otio";
import { gruppiere, schreibeSrt, woerterAufTimeline } from "./untertitel";
import { ordneZu, type QuelleTranskript } from "./zuordnung";

const quellen = [SchnittQuelle.parse({ id: "a", pfad: "rohmaterial/t/a.mov", art: "video", dauer: 60, fps: 25, breite: 1080, hoehe: 1920, hatAudio: true })];
const projekt = { name: "Test", marke: "alperna" };
const bau = (zeilen: string[], t: QuelleTranskript[], extra: Partial<PlanbauOptionen> = {}) => bauePlan(ordneZu(zeilen, t), { projekt, quellen, ...extra });
const mat = (...s: ReturnType<typeof satz>[]): QuelleTranskript[] => [{ quelle: "a", segmente: s }];

const Z1 = "Wir haben diese Woche eine Küche komplett umgebaut.";
const Z2 = "Der Kunde wollte mehr Stauraum.";

describe("bauePlan: Reihenfolge und Ränder", () => {
  it("legt die Clips in der Reihenfolge des Skripts, auch wenn die Takes umgekehrt aufgenommen wurden", () => {
    const { plan } = bau([Z1, Z2], mat(satz(3, Z2), satz(20, Z1)));
    expect([...new Set(plan.clips.map((c) => c.zeile))]).toEqual([1, 2]);
    expect(plan.clips[0]!.zeile).toBe(1);
    expect(plan.clips[0]!.von).toBeGreaterThan(19);
    expect(plan.clips[plan.clips.length - 1]!.von).toBeLessThan(5);
  });

  it("lässt Vor- und Nachlauf stehen", () => {
    const s = satz(10, Z2);
    const { plan } = bau([Z2], mat(s));
    expect(plan.clips[0]!.von).toBeCloseTo(s.von - VORLAUF, 3);
    expect(plan.clips[plan.clips.length - 1]!.bis).toBeCloseTo(s.bis + NACHLAUF, 3);
  });

  it("schneidet nie in das Nachbarwort: höchstens 40 Prozent der Lücke", () => {
    // direkt vor und nach dem Take spricht jemand, 0,1 s Abstand: Vor- und Nachlauf werden auf 0,04 s gekürzt
    const davor = satz(5, "Danke");
    const take = satz(davor.bis + 0.1, Z2);
    const danach = satz(take.bis + 0.1, "Danke");
    const { plan } = bau([Z2], mat(davor, take, danach));
    expect(take.von - plan.clips[0]!.von).toBeCloseTo(0.04, 3);
    expect(plan.clips[plan.clips.length - 1]!.bis - take.bis).toBeCloseTo(0.04, 3);
  });

  it("begrenzt Vor- und Nachlauf zusammen auf 80 Prozent der längsten Pause", () => {
    const profil = { ...STANDARD_SCHNITTPROFIL, laengstePause: 0.1, laengsteEinstellung: 10 };
    const s = satz(10, Z2);
    const { plan } = bau([Z2], mat(s), { profil });
    expect(plan.clips).toHaveLength(1);
    const c = plan.clips[0]!;
    const vor = s.von - c.von;
    const nach = c.bis - s.bis;
    expect(vor + nach).toBeLessThanOrEqual(0.08 + 1e-3);
    expect(vor).toBeGreaterThan(0);
  });

  it("hält die Grenzen der Quelle ein", () => {
    const { plan } = bau([Z2], mat(satz(0.02, Z2)));
    expect(plan.clips[0]!.von).toBe(0);
    const spaet = satz(58.5, Z2);
    const p2 = bau([Z2], mat(spaet)).plan;
    expect(p2.clips[p2.clips.length - 1]!.bis).toBeLessThanOrEqual(60);
  });
});

describe("bauePlan: Pausen und Füllwörter", () => {
  it("schneidet eine lange Pause im Satz heraus, und der Plan verletzt dann die Pausenregel nicht", () => {
    const s = satz(10, Z1, { 4: 0.9 });
    const { plan } = bau([Z1], mat(s));
    const von = plan.clips.filter((c) => c.zeile === 1);
    expect(von.length).toBeGreaterThanOrEqual(2);
    const befunde = pruefeSchnittplan(plan, { profil: STANDARD_SCHNITTPROFIL });
    expect(befunde.filter((b) => b.code === "pause-zu-lang")).toEqual([]);
  });

  it("verletzt dieselbe Regel, wenn man die Pausen stehen lässt (Gegenprobe zur Prüfung)", () => {
    const s = satz(10, Z1, { 4: 0.9 });
    const { plan } = bau([Z1], mat(s));
    // ein einziger Clip über die ganze Zeile: die Pause bleibt drin
    const roh = { ...plan, clips: [{ ...plan.clips[0]!, von: s.von - 0.06, bis: s.bis + 0.1 }] };
    const befunde = pruefeSchnittplan(roh, { profil: STANDARD_SCHNITTPROFIL });
    expect(befunde.some((b) => b.code === "pause-zu-lang")).toBe(true);
  });

  it("lässt Pausen bis zur erlaubten Länge stehen: ein Satz, ein Clip", () => {
    const s = satz(10, Z1, { 4: 0.2 });
    const { plan } = bau([Z1], mat(s));
    expect(plan.clips.filter((c) => c.zeile === 1)).toHaveLength(1);
  });

  it("schneidet bei einem gelben Take das Füllwort heraus und vermerkt es", () => {
    const s = satz(10, "Wir haben diese Woche ähm eine Küche komplett umgebaut.");
    const ae = s.woerter![4]!;
    const { plan, markierungen } = bau([Z1], mat(s));
    expect(markierungen.some((m) => m.art === "gelb")).toBe(true);
    // kein Clip enthält die Mitte des Füllworts
    const mitte = (ae.von + ae.bis) / 2;
    expect(plan.clips.some((c) => mitte > c.von && mitte < c.bis)).toBe(false);
    expect(plan.clips.map((c) => c.notiz).join(" ")).toMatch(/Füllwort «ähm»/);
    // das Wort davor und das Wort danach sind noch drin
    const vorher = s.woerter![3]!;
    const nachher = s.woerter![5]!;
    expect(plan.clips.some((c) => vorher.von >= c.von && vorher.bis <= c.bis)).toBe(true);
    expect(plan.clips.some((c) => nachher.von >= c.von && nachher.bis <= c.bis)).toBe(true);
    // die Untertitel zeigen das Füllwort nicht
    expect(plan.woerter.some((w) => /äh/i.test(w.text))).toBe(false);
  });

  it("lässt ein Füllwort stehen und sagt es, wenn die Wortzeiten nur geschätzt sind", () => {
    const text = "Wir haben diese Woche ähm eine Küche komplett umgebaut.";
    const { plan, markierungen } = bau([Z1], mat({ von: 10, bis: 14, text }));
    expect(plan.clips.filter((c) => c.zeile === 1)[0]!.von).toBeLessThan(10.1);
    expect(markierungen.some((m) => m.art === "geschaetzt" && /ähm/.test(m.text))).toBe(true);
  });
});

/** Ein Segment mit Wörtern von eigener Länge: [Text, Dauer, Pause davor]. */
const segment = (start: number, woerter: [string, number, number?][]): Segment => {
  let t = start;
  const w = woerter.map(([text, dauer, pause]) => {
    t += pause ?? 0.05;
    const von = t;
    t += dauer;
    return { text, von, bis: t };
  });
  return { von: w[0]!.von, bis: w[w.length - 1]!.bis, text: w.map((x) => x.text).join(" "), woerter: w };
};

describe("bauePlan: kein Zoom-Automatismus, keine Mikro-Schnitte", () => {
  it("setzt keinen Zoom und teilt einen langen Satz nicht in Zoom-Wechsel", () => {
    const text = "Wir haben diese Woche in Gossau eine Küche mit viel Stauraum komplett für eine Familie umgebaut.";
    const { plan } = bau([text, Z2], mat(satz(10, text), satz(30, Z2)));
    expect(plan.clips).toHaveLength(2);
    expect(plan.clips.every((c) => c.zoom === 1)).toBe(true);
  });

  it("zoomt auch bei Zoom-Tempo «schnell» nicht von allein", () => {
    const { plan } = bau([Z1, Z2], mat(satz(3, Z1), satz(20, Z2)), { profil: { ...STANDARD_SCHNITTPROFIL, zoomTempo: "schnell" } });
    expect(plan.clips.every((c) => c.zoom === 1)).toBe(true);
  });

  it("verschmilzt Stücke unter minClip mit dem Nachbarn, die Pause bleibt im Clip", () => {
    // sechs Wörter à 0,3 s, vor Wort 1, 2 und 4 je 0,5 s Pause: Läufe aus einem oder zwei Wörtern, jeder unter 0,7 s
    const s = satz(10, "Wir haben diese Woche eine Küche", { 1: 0.5, 2: 0.5, 4: 0.5 });
    const { plan, markierungen } = bau(["Wir haben diese Woche eine Küche"], mat(s));
    for (const c of plan.clips) expect(c.bis - c.von).toBeGreaterThanOrEqual(0.7 - 1e-6);
    expect(markierungen.some((m) => m.art === "verschmolzen")).toBe(true);
    // Gegenprobe: ohne minClip bleiben es die kurzen Stücke
    const roh = bau(["Wir haben diese Woche eine Küche"], mat(s), { profil: { ...STANDARD_SCHNITTPROFIL, minClip: 0 } }).plan;
    expect(roh.clips.length).toBeGreaterThan(plan.clips.length);
  });
});

describe("verschmelzeKleine", () => {
  const w = (von: number, bis: number): TWort => ({ text: "x", von, bis, echt: true });
  it("lässt genügend lange Läufe stehen", () => {
    const r = verschmelzeKleine([[w(0, 1)], [w(2, 3)]], 0.7, 0.3);
    expect(r.laeufe).toHaveLength(2);
  });
  it("verschmilzt einen kurzen Lauf mit dem folgenden und den letzten mit dem vorigen", () => {
    expect(verschmelzeKleine([[w(0, 0.2)], [w(1, 2)]], 0.7, 0.3).laeufe).toHaveLength(1);
    expect(verschmelzeKleine([[w(0, 1)], [w(2, 2.1)]], 0.7, 0.3).laeufe).toHaveLength(1);
  });
  it("überbrückt einen harten Bruch nie (dort wurde ein Füllwort herausgeschnitten)", () => {
    const r = verschmelzeKleine([[w(0, 0.2)], [w(1, 1.1)]], 0.7, 0.3, [true, false]);
    expect(r.laeufe).toHaveLength(2);
  });
});

describe("rasteEin", () => {
  const stille = [{ von: 5.1, bis: 5.6 }];
  it("verlängert das Ende bis kurz nach dem Beginn der Stille, wenn Whisper das Wort zu früh beendet hat", () => {
    const r = rasteEin({ von: 4.0, bis: 4.95 }, stille, { von: 4.2, bis: 4.85, danach: 5.7 });
    expect(r.bis).toBeCloseTo(5.1 + 0.14, 3);
  });
  it("schneidet nie in das nächste Wort", () => {
    const r = rasteEin({ von: 4.0, bis: 4.95 }, stille, { von: 4.2, bis: 4.85, danach: 5.15 });
    expect(r.bis).toBeLessThanOrEqual(5.15 - 0.03 + 1e-9);
  });
  it("lässt das Ende, wenn keine Stille in der Nähe liegt", () => {
    expect(rasteEin({ von: 4.0, bis: 4.95 }, [{ von: 9, bis: 9.5 }], { von: 4.2, bis: 4.85 }).bis).toBe(4.95);
  });
  it("beginnt kurz vor dem echten Einsatz, wenn Whisper das Wort zu spät beginnen lässt", () => {
    const r = rasteEin({ von: 5.12, bis: 6 }, [{ von: 4.5, bis: 5.0 }], { von: 5.2, bis: 5.9 });
    expect(r.von).toBeCloseTo(5.0 - 0.07, 3);
  });
  it("lässt den Anfang nicht vor das Ende des Wortes davor rutschen", () => {
    const r = rasteEin({ von: 5.3, bis: 6 }, [{ von: 4.9, bis: 5.3 }], { von: 5.4, bis: 5.9, davor: 5.27 });
    expect(r.von).toBeGreaterThanOrEqual(5.27 + 0.02 - 1e-9);
  });
  it("ignoriert Stillen unter 60 Millisekunden", () => {
    expect(rasteEin({ von: 4.0, bis: 4.95 }, [{ von: 5.0, bis: 5.05 }], { von: 4.2, bis: 4.85 }).bis).toBe(4.95);
  });
});

describe("bauePlan: Stille, Regie und Füllwörter", () => {
  it("nimmt die Stille der Tonspur für Anfang und Ende des Clips", () => {
    const s = satz(10, Z2);
    const ende = s.bis;
    const stille = new Map([["a", [{ von: ende + 0.05, bis: ende + 0.9 }]]]);
    const { plan } = bau([Z2], mat(s), { stille });
    expect(plan.clips[plan.clips.length - 1]!.bis).toBeCloseTo(ende + 0.05 + 0.14, 2);
    // Gegenprobe: ohne Stille gilt der Nachlauf
    expect(bau([Z2], mat(s)).plan.clips[0]!.bis).toBeCloseTo(ende + NACHLAUF, 2);
  });

  it("schneidet ein kurzes Füllwort restlos heraus, auch wenn der Abstand unter der längsten Pause liegt", () => {
    // «ähm» dauert 0,15 s mit 0,05 s Abstand: Wörter links und rechts liegen nur 0,25 s auseinander (unter 0,4 s)
    const s = segment(10, [["Wir", 0.3], ["haben", 0.3], ["diese", 0.3], ["Woche", 0.3], ["ähm", 0.15], ["eine", 0.3], ["Küche", 0.3], ["komplett", 0.4], ["umgebaut.", 0.5]]);
    const aem = s.woerter![4]!;
    const { plan } = bau([Z1], mat(s));
    const mitte = (aem.von + aem.bis) / 2;
    expect(plan.clips.some((c) => mitte > c.von && mitte < c.bis)).toBe(false);
    // und kein Clip streift es am Rand
    expect(plan.clips.some((c) => aem.von < c.bis - 1e-6 && aem.bis > c.von + 1e-6)).toBe(false);
  });

  it("schneidet eine Regieanweisung im Take heraus und vermerkt sie", () => {
    const s = satz(10, "Wir haben diese Woche okay eine Küche komplett umgebaut.");
    const okay = s.woerter![4]!;
    const { plan, markierungen } = bau([Z1], mat(s));
    expect(markierungen.some((m) => m.art === "regie" && /okay/.test(m.text))).toBe(true);
    const mitte = (okay.von + okay.bis) / 2;
    expect(plan.clips.some((c) => mitte > c.von && mitte < c.bis)).toBe(false);
    expect(plan.woerter.some((w) => /okay/i.test(w.text))).toBe(false);
  });

  it("lässt ein Wort stehen, das zum Skript gehört, auch wenn es sonst eine Regieanweisung wäre", () => {
    const skript = "Dann sagte er okay und ging nach Hause.";
    const { plan, markierungen } = bau([skript], mat(satz(10, skript)));
    expect(markierungen.some((m) => m.art === "regie")).toBe(false);
    expect(plan.woerter.map((w) => w.text)).toContain("okay");
  });
});

describe("bauePlan: fehlende Zeilen, Abweichungen und Fehler", () => {
  it("lässt eine fehlende Zeile weg und meldet sie", () => {
    const { plan, markierungen } = bau([Z1, "Das Ergebnis siehst du hier.", Z2], mat(satz(3, Z1), satz(20, Z2)));
    expect(plan.clips.map((c) => c.zeile)).toEqual(expect.not.arrayContaining([2]));
    expect(markierungen.find((m) => m.art === "fehlt")!.zeile).toBe(2);
  });

  it("wirft, wenn keine einzige Zeile gefunden wurde", () => {
    expect(() => bau([Z1], mat(satz(3, "Etwas ganz anderes ohne Bezug.")))).toThrow(PlanFehler);
  });

  it("wirft, wenn die Quelle des Transkripts nicht in der Liste der Quellen steht", () => {
    expect(() => bauePlan(ordneZu([Z2], [{ quelle: "b", segmente: [satz(1, Z2)] }]), { projekt, quellen })).toThrow(/«b»/);
  });

  it("meldet eine Abweichung und schneidet das zusätzlich gesprochene Wort nicht heraus", () => {
    const s = satz(10, "Wir haben diese Woche eine Küche komplett neu umgebaut.");
    const neu = s.woerter![6]!;
    const { plan, markierungen } = bau([Z1], mat(s));
    expect(markierungen.find((m) => m.art === "abweichung")!.text).toMatch(/zusätzlich gesprochen: neu/);
    const mitte = (neu.von + neu.bis) / 2;
    expect(plan.clips.some((c) => mitte > c.von && mitte < c.bis)).toBe(true);
  });

  it("nimmt für die Untertitel standardmässig das Gehörte und auf Wunsch den Skripttext", () => {
    const text = "Wir haben diese Woche eine Küche komplett neu umgebaut.";
    const s = satz(10, text);
    const gehoert = bau([Z1], mat(s));
    expect(gehoert.plan.woerter.map((w) => w.text).join(" ")).toBe(text);
    expect(gehoert.markierungen.some((m) => m.art === "gesprochen")).toBe(true);
    const skript = bau([Z1], mat(s), { untertitel: "skript" });
    expect(skript.plan.woerter.map((w) => w.text).join(" ")).toBe(Z1);
    expect(bau([Z1], mat(s), { untertitel: "skript", gesprochen: [1] }).plan.woerter.map((w) => w.text).join(" ")).toBe(text);
  });
});

describe("bauePlan: Ergebnis", () => {
  it("liefert einen gültigen Plan, den Platzierung und Prüfung ohne Fehler annehmen", () => {
    const { plan } = bau([Z1, Z2], mat(satz(3, Z1), satz(20, Z2)));
    expect(plan.version).toBe(1);
    expect(plan.projekt).toMatchObject({ name: "Test", marke: "alperna", fps: 25, breite: 1080, hoehe: 1920 });
    expect(plan.broll).toEqual([]);
    expect(plan.overlays).toEqual([]);
    expect(platziere(plan).gesamtFrames).toBeGreaterThan(0);
    expect(pruefeSchnittplan(plan, { profil: STANDARD_SCHNITTPROFIL }).filter((b) => b.stufe === "fehler")).toEqual([]);
  });

  it("lässt sich als FCPXML, OTIO und SRT schreiben, die Untertitel zeigen das Skript und kein Füllwort", () => {
    const { plan } = bau([Z1, Z2], mat(satz(1, "Wir haben diese Woche ähm eine Küche komplett umgebaut.", { 8: 0.9 }), satz(20, Z2)));
    const xml = schreibeFcpxml(plan, testLoeser);
    expect(xml).toContain('<fcpxml version="1.8">');
    expect(xml.match(/<asset-clip /g)!.length).toBe(plan.clips.length);
    expect(JSON.parse(schreibeOtio(plan, testLoeser))).toHaveProperty("OTIO_SCHEMA");
    const zeit = platziere(plan);
    const seiten = gruppiere(woerterAufTimeline(plan, zeit), STANDARD_SCHNITTPROFIL);
    const srt = schreibeSrt(seiten, plan.projekt.fps);
    expect(srt.replace(/\d+\n[\d:,]+ --> [\d:,]+\n/g, "").replace(/\s+/g, " ").trim()).toBe(`${Z1} ${Z2}`.replace(/\s+/g, " "));
    expect(srt).not.toMatch(/ähm/);
  });

  it("vergibt eindeutige Kennungen und behält die Nummer der Skriptzeile", () => {
    const { plan } = bau([Z1, Z2], mat(satz(3, Z1, { 4: 0.9 }), satz(20, Z2)));
    const ids = plan.clips.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toMatch(/^z01-1$/);
    expect(plan.clips.every((c) => c.zeile === 1 || c.zeile === 2)).toBe(true);
  });

  it("legt die Untertitel-Wörter in Quellzeit mit dem Text des Skripts ab", () => {
    const s = satz(10, Z2);
    const { plan } = bau([Z2], mat(s));
    expect(plan.woerter.map((w) => w.text)).toEqual(Z2.split(" "));
    expect(plan.woerter.every((w) => w.quelle === "a")).toBe(true);
    expect(plan.woerter[0]!.von).toBeCloseTo(s.woerter![0]!.von, 3);
  });
});
