import { describe, expect, it } from "vitest";
import { bauePlan, NACHLAUF, STANDARD_SCHNITTPROFIL, teileEinstellung, VORLAUF, ZOOM_STUFE, type PlanbauOptionen } from "./planbau";
import type { TWort } from "./transkript";
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
    // jede Zeile ist länger als 1,5 s und wird darum in mehrere Clips geteilt
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

  it("lässt Pausen bis zur erlaubten Länge stehen", () => {
    const s = satz(10, Z1, { 4: 0.2 });
    const { plan } = bau([Z1], mat(s));
    expect(plan.clips.filter((c) => c.zeile === 1)).toHaveLength(Math.ceil((s.bis - s.von + 0.16) / 1.5));
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

describe("bauePlan: Bildwechsel und Zoom", () => {
  it("teilt einen langen Clip ohne Pause an Wortgrenzen und entfernt dabei keine Zeit", () => {
    const text = "Wir haben diese Woche in Gossau eine Küche mit viel Stauraum komplett für eine Familie umgebaut.";
    const s = satz(10, text);
    const { plan } = bau([text], mat(s));
    const clips = plan.clips;
    expect(clips.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < clips.length; i++) expect(clips[i]!.von).toBeCloseTo(clips[i - 1]!.bis, 3);
    for (const c of clips) expect(c.bis - c.von).toBeLessThanOrEqual(1.5 + 0.4);
    expect(pruefeSchnittplan(plan, { profil: STANDARD_SCHNITTPROFIL }).filter((b) => b.code === "einstellung-zu-lang")).toEqual([]);
  });

  it("schneidet bevorzugt an einer Lücke zwischen Wörtern, wenn eine in der Nähe des gleichmässigen Schnitts liegt", () => {
    const text = "Wir haben diese Woche in Gossau eine Küche mit viel Stauraum komplett umgebaut.";
    // eine 0,2-s-Lücke (unter der längsten Pause) vor dem Wort mit der Nummer j
    for (const j of [3, 6, 10]) {
      const s = satz(10, text, { [j]: 0.2 });
      const w = s.woerter!;
      const luecke = (w[j - 1]!.bis + w[j]!.von) / 2;
      const { plan } = bau([text], mat(s));
      expect(plan.clips.slice(1).some((c) => Math.abs(c.von - luecke) < 1e-3), `Lücke vor Wort ${j}`).toBe(true);
      for (const c of plan.clips) expect(c.bis - c.von).toBeLessThanOrEqual(1.5 + 1e-6);
    }
  });

  it("setzt den Zoom-Punch bei jedem zweiten Schnitt", () => {
    const { plan } = bau([Z1, Z2], mat(satz(3, Z1), satz(20, Z2)));
    const n = plan.clips.length;
    expect(n).toBeGreaterThanOrEqual(2);
    plan.clips.forEach((c, i) => expect(c.zoom).toBe(i % 2 === 1 ? ZOOM_STUFE.mittel : 1));
  });

  it("zoomt bei «langsam» nicht und teilt auch nicht", () => {
    const text = "Wir haben diese Woche in Gossau eine Küche mit viel Stauraum komplett für eine Familie umgebaut.";
    const { plan } = bau([text, Z2], mat(satz(10, text), satz(30, Z2)), { profil: { ...STANDARD_SCHNITTPROFIL, zoomTempo: "langsam" } });
    expect(plan.clips).toHaveLength(2);
    expect(plan.clips.every((c) => c.zoom === 1)).toBe(true);
  });

  it("nimmt die Stufe aus dem Zoom-Tempo", () => {
    const { plan } = bau([Z1, Z2], mat(satz(3, Z1), satz(20, Z2)), { profil: { ...STANDARD_SCHNITTPROFIL, zoomTempo: "schnell" } });
    expect(plan.clips[1]!.zoom).toBe(ZOOM_STUFE.schnell);
  });
});

describe("bauePlan: Zoom-Modus", () => {
  const lang = "Wir haben diese Woche in Gossau eine Küche mit viel Stauraum komplett für eine Familie umgebaut.";

  it("«bei-schnitt» teilt einen durchgehenden Take nicht und zoomt nur an echten Schnitten", () => {
    const { plan } = bau([lang, Z2], mat(satz(10, lang), satz(30, Z2)), { zoom: "bei-schnitt" });
    expect(plan.clips).toHaveLength(2);
    expect(plan.clips.map((c) => c.zoom)).toEqual([1, ZOOM_STUFE.mittel]);
    expect(plan.clips.map((c) => c.notiz ?? "").join(" ")).not.toMatch(/geteilt/);
  });

  it("«bei-schnitt» zoomt abwechselnd, wenn eine Pause herausgeschnitten wurde", () => {
    const { plan } = bau([Z1], mat(satz(10, Z1, { 4: 0.9 })), { zoom: "bei-schnitt" });
    expect(plan.clips).toHaveLength(2);
    expect(plan.clips.map((c) => c.zoom)).toEqual([1, ZOOM_STUFE.mittel]);
  });

  it("«aus» zoomt nie und teilt nicht", () => {
    const { plan } = bau([lang, Z2], mat(satz(10, lang), satz(30, Z2)), { zoom: "aus" });
    expect(plan.clips).toHaveLength(2);
    expect(plan.clips.every((c) => c.zoom === 1)).toBe(true);
  });

  it("«profil» ist der Standard: Ohne Angabe wird geteilt und gezoomt wie bisher", () => {
    const ohne = bau([lang, Z2], mat(satz(10, lang), satz(30, Z2))).plan;
    const mit = bau([lang, Z2], mat(satz(10, lang), satz(30, Z2)), { zoom: "profil" }).plan;
    expect(ohne.clips.length).toBeGreaterThan(2);
    expect(mit.clips).toEqual(ohne.clips);
  });
});

describe("bauePlan: Zuruf zwischen den Skriptwörtern", () => {
  const mitZuruf = (pausen: Record<number, number>) => satz(10, "Wir haben Erfindest du was diese Woche eine Küche komplett umgebaut.", pausen);

  it("schneidet einen Lauf aus lauter fremden Wörtern heraus und sagt es", () => {
    const s = mitZuruf({ 2: 1.0, 5: 1.0 });
    const w = s.woerter!;
    const { plan, markierungen } = bau([Z1], mat(s), { zoom: "aus" });
    // kein Clip berührt die Wörter «Erfindest du was»
    for (const c of plan.clips) expect(c.bis <= w[2]!.von || c.von >= w[4]!.bis, `Clip ${c.id} enthält den Zuruf`).toBe(true);
    const m = markierungen.find((x) => /Zuruf/.test(x.text));
    expect(m?.text).toMatch(/Erfindest du was/);
    // Skriptwörter davor und danach bleiben
    expect(plan.clips.some((c) => w[0]!.von >= c.von && w[1]!.bis <= c.bis)).toBe(true);
    expect(plan.clips.some((c) => w[5]!.von >= c.von && w[9]!.bis <= c.bis)).toBe(true);
  });

  it("lässt fremde Wörter stehen, die ohne Pause an Skriptwörter anschliessen", () => {
    const s = mitZuruf({});
    const w = s.woerter!;
    const { plan, markierungen } = bau([Z1], mat(s), { zoom: "aus" });
    expect(markierungen.some((x) => /Zuruf/.test(x.text))).toBe(false);
    expect(plan.clips.some((c) => w[2]!.von >= c.von && w[4]!.bis <= c.bis)).toBe(true);
  });
});

describe("teileEinstellung", () => {
  /** Wörter von `dauer` Sekunden, 0,05 s Abstand; vor Wort `luecke` eine Pause von 0,24 s; Wort `komma` endet mit Komma. */
  const woerter = (n: number, o: { luecke?: number; komma?: number; dauer?: number } = {}): TWort[] => {
    let t = 0;
    return Array.from({ length: n }, (_, i) => {
      t += i === o.luecke ? 0.24 : 0;
      const von = t;
      t += o.dauer ?? 0.3;
      const bis = t;
      t += 0.05;
      return { text: i === o.komma ? `w${i},` : `w${i}`, von, bis, echt: true };
    });
  };
  const schnitte = (w: TWort[], grenze = 1.5): number[] => teileEinstellung(w, 0, w[w.length - 1]!.bis, grenze).slice(1).map((x) => x.von);
  const laengen = (w: TWort[], grenze = 1.5): number[] => teileEinstellung(w, 0, w[w.length - 1]!.bis, grenze).map((x) => x.bis - x.von);

  it("lässt einen kurzen Clip ganz", () => {
    const w = woerter(4);
    expect(teileEinstellung(w, 0, w[3]!.bis, 1.5)).toEqual([{ von: 0, bis: w[3]!.bis }]);
  });

  it("teilt lückenlos: jedes Stück beginnt, wo das vorige endet, und die Summe bleibt die Dauer", () => {
    const w = woerter(10);
    const teile = teileEinstellung(w, 0, w[9]!.bis, 1.5);
    for (let i = 1; i < teile.length; i++) expect(teile[i]!.von).toBe(teile[i - 1]!.bis);
    expect(teile[0]!.von).toBe(0);
    expect(teile[teile.length - 1]!.bis).toBe(w[9]!.bis);
  });

  it("zieht eine Lücke zwischen Wörtern einem gleichmässigeren Schnitt mitten im Satz vor", () => {
    const w = woerter(9, { luecke: 4 });
    const mitte = (w[3]!.bis + w[4]!.von) / 2;
    expect(schnitte(w)[0]).toBeCloseTo(mitte, 6);
    expect(Math.max(...laengen(w))).toBeLessThanOrEqual(1.5);
  });

  it("zieht eine Stelle nach einem Komma vor", () => {
    const w = woerter(7, { komma: 3 });
    expect(schnitte(w)[0]).toBeCloseTo((w[3]!.bis + w[4]!.von) / 2, 6);
  });

  it("wählt die Schnitte so, dass kein Stück über die Grenze hinaus wächst, wenn das möglich ist", () => {
    const w = woerter(9, { luecke: 2 });
    expect(Math.max(...laengen(w))).toBeLessThanOrEqual(1.5);
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

  it("nimmt für die Untertitel standardmässig den Skripttext und auf Wunsch den gesprochenen", () => {
    const text = "Wir haben diese Woche eine Küche komplett neu umgebaut.";
    const s = satz(10, text);
    const skript = bau([Z1], mat(s)).plan.woerter.map((w) => w.text).join(" ");
    expect(skript).toBe(Z1);
    const gesprochen = bau([Z1], mat(s), { gesprochen: [1] });
    expect(gesprochen.plan.woerter.map((w) => w.text).join(" ")).toBe(text);
    expect(gesprochen.markierungen.some((m) => m.art === "gesprochen")).toBe(true);
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
