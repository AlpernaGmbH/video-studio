import { describe, expect, it } from "vitest";
import { gruppiere, gruppiereMitWoertern, MINDEST_ANZEIGE, schreibeSrt, seitenFuerOverlay, seitenGroessen, woerterAufTimeline, type TimelineWort } from "./untertitel";
import { platziere } from "./plan";
import { beispielPlan } from "./testdaten";

const profil = { woerterJeUntertitel: { min: 2, max: 3 } };
const w = (text: string, von: number, bis: number): TimelineWort => ({ text, von, bis });

describe("seitenGroessen", () => {
  it("verteilt gleichmässig, höchstens max je Seite", () => {
    expect(seitenGroessen(5, 3)).toEqual([3, 2]);
    expect(seitenGroessen(7, 3)).toEqual([3, 2, 2]);
    expect(seitenGroessen(8, 3)).toEqual([3, 3, 2]);
    expect(seitenGroessen(4, 3)).toEqual([2, 2]);
    expect(seitenGroessen(6, 3)).toEqual([3, 3]);
  });
  it("ein einzelnes Wort bleibt allein, nichts bleibt leer", () => {
    expect(seitenGroessen(1, 3)).toEqual([1]);
    expect(seitenGroessen(0, 3)).toEqual([]);
  });
});

describe("woerterAufTimeline", () => {
  it("legt Wörter über die Clips und verschiebt sie auf die Timeline", () => {
    const plan = beispielPlan();
    const t = woerterAufTimeline(plan, platziere(plan));
    // Clip k01 beginnt in der Quelle bei 2,0 s und in der Timeline bei 0: «Wir» (2,1 bis 2,3) liegt bei 0,1 bis 0,3
    expect(t[0]).toMatchObject({ text: "Wir", von: 0.12, bis: 0.28 });
    // Clip k02 beginnt in der Quelle bei 6,2 s und in der Timeline bei 51 Frames (2,04 s): «Heute» (6,3 bis 6,7) liegt bei 2,14 bis 2,54
    const heute = t.find((x) => x.text === "Heute")!;
    expect(heute.von).toBeCloseTo(2.04 + 0.1, 1);
  });

  it("Wörter ausserhalb aller Clips (herausgeschnitten) fallen weg", () => {
    const plan = beispielPlan();
    const t = woerterAufTimeline(plan, platziere(plan));
    // «Gefällt» liegt bei 8,5 bis 9,0 s, Clip k02 endet bei 8,0 s
    expect(t.map((x) => x.text)).not.toContain("Gefällt");
  });

  it("ein Wort wird nur dem Clip seiner eigenen Quelle zugeordnet", () => {
    const plan = beispielPlan({ woerter: [{ text: "Fremd", quelle: "empfang", von: 2.1, bis: 2.3 }] });
    expect(woerterAufTimeline(plan, platziere(plan))).toEqual([]);
  });

  it("ein Wort, das vor dem Clip beginnt und überwiegend im Clip liegt, gehört zum Clip und beginnt an dessen Anfang", () => {
    // Clip k01 beginnt in der Quelle bei 2,0 s. Das Wort liegt von 1,9 bis 2,5 s, seine Mitte (2,2 s) ist im Clip.
    const plan = beispielPlan({ woerter: [{ text: "Anlauf", quelle: "sprache", von: 1.9, bis: 2.5 }] });
    const t = woerterAufTimeline(plan, platziere(plan));
    expect(t).toHaveLength(1);
    expect(t[0]!.von).toBe(0);
    // Ein Wort, dessen Mitte vor dem Clip liegt (1,0 bis 2,1 s: Mitte 1,55 s), fällt weg
    const draussen = beispielPlan({ woerter: [{ text: "Davor", quelle: "sprache", von: 1.0, bis: 2.1 }] });
    expect(woerterAufTimeline(draussen, platziere(draussen))).toEqual([]);
  });

  it("ein Wort über der Clipgrenze wird an die Grenze gekürzt", () => {
    const plan = beispielPlan({ woerter: [{ text: "Grenze", quelle: "sprache", von: 3.7, bis: 4.2 }] });
    const t = woerterAufTimeline(plan, platziere(plan));
    expect(t[0]!.bis).toBeLessThanOrEqual(2.04 + 1e-9);
  });
});

describe("gruppiere", () => {
  it("macht nach Satzende immer eine neue Seite", () => {
    const s = gruppiere([w("Eins.", 0, 0.3), w("Zwei", 0.4, 0.6), w("drei", 0.6, 0.9)], profil);
    expect(s.map((x) => x.text)).toEqual(["Eins.", "Zwei drei"]);
  });

  it("teilt einen langen Satz gleichmässig auf (2 bis 3 Wörter)", () => {
    const woerter = ["a", "b", "c", "d", "e"].map((t, i) => w(t, i * 0.3, i * 0.3 + 0.3));
    expect(gruppiere(woerter, profil).map((x) => x.text)).toEqual(["a b c", "d e"]);
  });

  it("jede Seite bleibt mindestens MINDEST_ANZEIGE sichtbar, aber nie in die nächste hinein", () => {
    const s = gruppiere([w("Kurz.", 1, 1.05), w("danach", 2, 2.4), w("ende.", 2.4, 2.8)], profil);
    expect(s[0]!.bis - s[0]!.von).toBeGreaterThanOrEqual(MINDEST_ANZEIGE - 1e-9);
    expect(s[0]!.bis).toBeLessThanOrEqual(s[1]!.von);
  });

  it("Doppelpunkt und Anführungszeichen nach dem Satzzeichen zählen als Satzende", () => {
    const s = gruppiere([w("Sagt:", 0, 0.3), w("«Ja.»", 0.4, 0.7), w("Dann", 0.8, 1)], profil);
    expect(s.map((x) => x.text)).toEqual(["Sagt:", "«Ja.»", "Dann"]);
  });
});

describe("schreibeSrt", () => {
  it("schreibt Nummer, Zeitzeile mit Komma und Text, Seiten durch Leerzeile getrennt", () => {
    const srt = schreibeSrt([{ von: 0.12, bis: 0.84, text: "Wir haben" }, { von: 3725.52, bis: 3726, text: "Ende" }], 25);
    expect(srt).toBe("1\n00:00:00,120 --> 00:00:00,840\nWir haben\n\n2\n01:02:05,520 --> 01:02:06,000\nEnde\n");
  });
  it("legt die Zeiten auf das Frame-Raster", () => {
    // 0,1 s × 25 = 2,5 Frames, gerundet 3 Frames = 0,12 s; 0,5 s = 12,5 Frames, gerundet 13 Frames = 0,52 s
    expect(schreibeSrt([{ von: 0.1, bis: 0.5, text: "x" }], 25)).toContain("00:00:00,120 --> 00:00:00,520");
  });
});

describe("gruppiereMitWoertern und seitenFuerOverlay", () => {
  it("gruppiert wie gruppiere, behält aber die Wörter jeder Seite", () => {
    const ws = [w("Wir", 0, 0.3), w("haben", 0.3, 0.6), w("es", 0.6, 0.8), w("geschafft.", 0.8, 1.4), w("Danke", 2, 2.4)];
    const seiten = gruppiereMitWoertern(ws, profil);
    expect(seiten.map((s) => s.woerter.map((x) => x.text))).toEqual([["Wir", "haben"], ["es", "geschafft."], ["Danke"]]);
    expect(gruppiere(ws, profil).map((s) => s.text)).toEqual(seiten.map((s) => s.woerter.map((x) => x.text).join(" ")));
    expect(seiten.map((s) => [s.von, s.bis])).toEqual(gruppiere(ws, profil).map((s) => [s.von, s.bis]));
  });

  it("gibt Seiten in Timeline-Sekunden mit der Betonung aus dem Plan", () => {
    const plan = beispielPlan();
    const betont = { ...plan, woerter: plan.woerter.map((x) => (x.text === "Wartezimmer" ? { ...x, betont: true } : x)) };
    const seiten = seitenFuerOverlay(betont, platziere(betont), profil);
    const alle = seiten.flatMap((s) => s.woerter);
    expect(alle.map((x) => x.t)).toEqual(woerterAufTimeline(betont, platziere(betont)).map((x) => x.text));
    expect(alle.filter((x) => x.betont).map((x) => x.t)).toEqual(["Wartezimmer"]);
    for (const s of seiten) expect(s.bis).toBeGreaterThan(s.von);
    // Die erste Seite beginnt mit dem Wort «Wir» bei 0,12 s der Timeline, nicht bei der Quellzeit 2,1 s
    expect(seiten[0]!.woerter[0]).toMatchObject({ t: "Wir", von: 0.12 });
  });
});
