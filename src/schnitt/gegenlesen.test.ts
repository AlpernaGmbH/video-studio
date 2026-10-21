import { describe, expect, it } from "vitest";
import { baueGegenlesen, GegenlesenAntwort, gegenlesenMarkdown, planHash, wendeGegenlesenAn } from "./gegenlesen";
import { bauePlan } from "./planbau";
import { platziere, SchnittQuelle } from "./plan";
import { testSatz as satz } from "./testdaten";
import { ordneZu } from "./zuordnung";

const quellen = [SchnittQuelle.parse({ id: "a", pfad: "rohmaterial/t/a.mov", art: "video", dauer: 60, fps: 25, breite: 1080, hoehe: 1920, hatAudio: true })];
const Z1 = "Wir haben diese Woche eine Küche komplett umgebaut.";
const Z2 = "Der Kunde wollte mehr Stauraum.";
const segmente = [satz(1, "Und Action"), satz(3, Z1), satz(10, "Moment, Kamera läuft noch nicht"), satz(14, "Der Kunde wollte mehr Stauraum.")];
const zuordnung = ordneZu([Z1, Z2], [{ quelle: "a", segmente }]);
const { plan } = bauePlan(zuordnung, { projekt: { name: "Test", marke: "alperna" }, quellen });
const transkripte = [{ quelle: "a", segmente }];

describe("baueGegenlesen", () => {
  const clips = baueGegenlesen(plan, zuordnung, transkripte);

  it("liefert je Clip das Gehörte, das Skript und die Wörter davor und danach", () => {
    expect(clips).toHaveLength(plan.clips.length);
    const c1 = clips[0]!;
    expect(c1.clip).toBe(plan.clips[0]!.id);
    expect(c1.zeile).toBe(1);
    expect(c1.skript).toBe(Z1);
    expect(c1.gehoert).toBe(Z1);
    // «Und Action» endet fast zwei Sekunden vor dem Satz: nicht innerhalb der einen Sekunde davor
    expect(c1.davor).toBe("");
    const c2 = clips[clips.length - 1]!;
    expect(c2.zeile).toBe(2);
    expect(c2.gehoert).toBe(Z2);
    // das Gerede dazwischen («Moment, Kamera läuft noch nicht») gehört in keinen Clip
    expect(clips.some((c) => /Kamera/.test(c.gehoert))).toBe(false);
  });

  it("nimmt Hinweise der Zuordnung auf, nur einmal je Zeile", () => {
    const mitRegie = ordneZu([Z1], [{ quelle: "a", segmente: [satz(3, "Wir haben diese Woche okay eine Küche komplett umgebaut.")] }]);
    const p = bauePlan(mitRegie, { projekt: { name: "Test", marke: "alperna" }, quellen }).plan;
    const c = baueGegenlesen(p, mitRegie, [{ quelle: "a", segmente: [satz(3, "Wir haben diese Woche okay eine Küche komplett umgebaut.")] }]);
    const hinweise = c.flatMap((x) => x.hinweise);
    expect(hinweise.some((h) => /Regieanweisung erkannt/.test(h))).toBe(true);
    expect(hinweise.filter((h) => /Regieanweisung erkannt/.test(h))).toHaveLength(1);
  });

  it("zeigt Wörter direkt vor dem Clip als Einordnung (der Director spricht kurz vor dem Satz)", () => {
    const sg = [satz(1.0, "und Action"), satz(2.2, Z2)];
    const z = ordneZu([Z2], [{ quelle: "a", segmente: sg }]);
    const p = bauePlan(z, { projekt: { name: "Test", marke: "alperna" }, quellen }).plan;
    const c = baueGegenlesen(p, z, [{ quelle: "a", segmente: sg }]);
    expect(c[0]!.davor).toMatch(/Action/);
  });

  it("schreibt eine Datei mit Anleitung, jedem Clip und dem Format der Antwort", () => {
    const md = gegenlesenMarkdown("Test", clips);
    expect(md).toContain("# Gegenlesen: Test");
    expect(md).toContain(`## Clip ${clips[0]!.clip} (Zeile 1)`);
    expect(md).toContain(`- Gehört: «${Z1}»`);
    expect(md).toContain('"gelesen": true');
    expect(md).toContain("Regie");
  });
});

describe("GegenlesenAntwort", () => {
  it("verlangt gelesen: true und gültige Zeitbereiche", () => {
    expect(GegenlesenAntwort.safeParse({ schnitte: [], woerter: [] }).success).toBe(false);
    expect(GegenlesenAntwort.safeParse({ gelesen: false }).success).toBe(false);
    expect(GegenlesenAntwort.safeParse({ gelesen: true }).success).toBe(true);
    expect(GegenlesenAntwort.safeParse({ gelesen: true, schnitte: [{ quelle: "a", von: 5, bis: 4, grund: "Regie" }] }).success).toBe(false);
    expect(GegenlesenAntwort.safeParse({ gelesen: true, woerter: [{ quelle: "a", von: 1, bis: 2, text: "", grund: "Verhörer" }] }).success).toBe(false);
  });
});

describe("wendeGegenlesenAn", () => {
  const antwort = (extra: Record<string, unknown>) => GegenlesenAntwort.parse({ gelesen: true, ...extra });

  it("schneidet einen Bereich aus einem Clip: Der Clip wird getrennt, die Untertitel darin entfallen, der Film wird kürzer", () => {
    const c = plan.clips[0]!;
    const w = plan.woerter.filter((x) => x.quelle === "a" && x.von >= c.von && x.bis <= c.bis);
    const mitte = w[3]!; // «Woche»
    const r = wendeGegenlesenAn(plan, antwort({ schnitte: [{ quelle: "a", von: mitte.von - 0.02, bis: mitte.bis + 0.02, grund: "Regie: Zwischenruf" }] }));
    expect(r.geschnitten).toBe(1);
    expect(r.plan.clips.length).toBe(plan.clips.length + 1);
    expect(r.plan.woerter.some((x) => x.text === mitte.text && x.von === mitte.von)).toBe(false);
    expect(platziere(r.plan).gesamtFrames).toBeLessThan(platziere(plan).gesamtFrames);
    expect(r.plan.clips.some((x) => x.von < mitte.von && x.bis > mitte.von)).toBe(false);
    expect(r.plan.clips.map((x) => x.id)).toEqual(expect.arrayContaining([expect.stringMatching(/-g1$/), expect.stringMatching(/-g2$/)]));
  });

  it("entfernt einen Rand: Beginnt der Clip mit Regie, entsteht kein Mikro-Stück", () => {
    const c = plan.clips[0]!;
    const r = wendeGegenlesenAn(plan, antwort({ schnitte: [{ quelle: "a", von: c.von - 0.5, bis: c.von + 0.5, grund: "Regie am Anfang" }] }));
    expect(r.plan.clips.length).toBe(plan.clips.length);
    expect(r.plan.clips[0]!.von).toBeGreaterThanOrEqual(c.von + 0.5 - 1e-6);
  });

  it("meldet einen Schnitt, der in keinem Clip liegt, und lässt den Plan unverändert", () => {
    const r = wendeGegenlesenAn(plan, antwort({ schnitte: [{ quelle: "a", von: 40, bis: 41, grund: "Regie" }] }));
    expect(r.geschnitten).toBe(0);
    expect(r.ignoriert[0]).toMatch(/liegt in keinem Clip/);
    expect(r.plan.clips).toEqual(plan.clips);
  });

  it("korrigiert ein Untertitel-Wort an der Stelle des Verhörers", () => {
    const k = plan.woerter.find((w) => w.text === "Küche")!;
    const r = wendeGegenlesenAn(plan, antwort({ woerter: [{ quelle: "a", von: k.von, bis: k.bis, text: "Kirche", grund: "Verhörer, Whisper schrieb das so" }] }));
    expect(r.korrigiert).toBe(1);
    expect(r.plan.woerter.find((w) => w.von === k.von)!.text).toBe("Kirche");
    const keins = wendeGegenlesenAn(plan, antwort({ woerter: [{ quelle: "a", von: 50, bis: 51, text: "x", grund: "Verhörer, nirgends" }] }));
    expect(keins.korrigiert).toBe(0);
    expect(keins.ignoriert[0]).toMatch(/kein Untertitel-Wort/);
  });

  it("verweigert, wenn nichts übrig bleibt", () => {
    expect(() => wendeGegenlesenAn(plan, antwort({ schnitte: [{ quelle: "a", von: 0, bis: 100, grund: "alles Regie" }] }))).toThrow(/kein Clip übrig/);
  });

  it("ändert den Plan nicht an Ort und Stelle", () => {
    const vorher = JSON.stringify(plan);
    wendeGegenlesenAn(plan, antwort({ schnitte: [{ quelle: "a", von: plan.clips[0]!.von, bis: plan.clips[0]!.von + 1, grund: "Regie" }] }));
    expect(JSON.stringify(plan)).toBe(vorher);
  });
});

describe("planHash", () => {
  it("ändert sich mit dem Inhalt und bleibt für denselben Text gleich", () => {
    expect(planHash("a")).toBe(planHash("a"));
    expect(planHash("a")).not.toBe(planHash("b"));
    expect(planHash("a")).toHaveLength(16);
  });
});
