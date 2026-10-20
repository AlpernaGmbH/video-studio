import { describe, expect, it } from "vitest";
import { zuordnungBericht } from "./bericht";
import { bauePlan } from "./planbau";
import { SchnittQuelle } from "./plan";
import { testSatz as satz } from "./testdaten";
import { ordneZu } from "./zuordnung";

const quellen = [SchnittQuelle.parse({ id: "a", pfad: "rohmaterial/t/a.mov", art: "video", dauer: 60, fps: 25, breite: 1080, hoehe: 1920, hatAudio: true })];
const Z1 = "Wir haben diese Woche eine Küche komplett umgebaut.";
const Z2 = "Der Kunde wollte mehr Stauraum.";
const Z3 = "Das Ergebnis siehst du hier.";

describe("zuordnungBericht", () => {
  const z = ordneZu(
    [Z1, Z2, Z3],
    [{ quelle: "a", segmente: [satz(1, "Wir haben diese Woche ähm eine Küche komplett umgebaut."), satz(6, "Moment nochmal von vorne."), satz(9, "Wir haben diese Woche eine Küche komplett neu umgebaut."), satz(20, Z2)] }],
  );
  const text = zuordnungBericht(z).join("\n");

  it("fasst die Zahlen zusammen", () => {
    expect(text.split("\n")[0]).toBe("3 Skriptzeilen: 2 gefunden, 0 gelb (nur Takes mit Füllwort oder Abbruch), 1 fehlen im Material; 1 Segmente ohne Bezug zum Skript verworfen");
  });

  it("nennt den Anteil zugeordneter Zeilen für Test T2", () => {
    expect(text.split("\n")[1]).toBe("Zugeordnet: 2 von 3 (67 Prozent; Test T2 verlangt mindestens 95 Prozent)");
    const leer = zuordnungBericht({ zeilen: [], verworfen: [] }).join("\n");
    expect(leer).toContain("Zugeordnet: 0 von 0 (0 Prozent");
  });

  it("zeigt pro Zeile den besten und den zweitbesten Take mit dem Grund des Ausscheidens", () => {
    expect(text).toMatch(/Zeile 1 ok\s+Wir haben diese Woche/);
    expect(text).toMatch(/Bester\s+a 9,0 bis [\d,]+ s, Punkte [\d,]+/);
    expect(text).toMatch(/Zweitbester a 1,0 bis [\d,]+ s, Punkte [\d,]+; ausgeschieden: Füllwort «ähm»/);
  });

  it("zeigt Abweichung und gesprochenen Text, markiert fehlende Zeilen und nennt verworfene Segmente", () => {
    expect(text).toContain("Abweichung: zusätzlich gesprochen: neu");
    expect(text).toContain("Gesprochen: «Wir haben diese Woche eine Küche komplett neu umgebaut.»");
    expect(text).toMatch(/Zeile 3 FEHLT/);
    expect(text).toContain("fehlt im Material");
    expect(text).toMatch(/Verworfene Segmente[\s\S]*a 6,0 bis [\d,]+ s: «Moment nochmal von vorne\.»/);
  });

  it("nennt geschätzte Wortzeiten und gewählten Gesprochen-Text im Abschnitt Hinweise zum Schnitt", () => {
    const g = ordneZu([Z1], [{ quelle: "a", segmente: [{ von: 5, bis: 9, text: "Wir haben diese Woche ähm eine Küche komplett umgebaut." }] }]);
    const { markierungen } = bauePlan(g, { projekt: { name: "t", marke: "alperna" }, quellen, gesprochen: [1] });
    const t = zuordnungBericht(g, markierungen).join("\n");
    expect(t).toContain("Hinweise zum Schnitt:");
    expect(t).toMatch(/Zeile 1: Füllwort «ähm».*bleibt drin/);
    expect(t).toMatch(/Zeile 1: Untertitel nehmen den gesprochenen Text/);
  });

  it("kürzt lange Zeilen", () => {
    const lang = "Wort ".repeat(40).trim();
    const g = ordneZu([lang], [{ quelle: "a", segmente: [satz(1, lang)] }]);
    expect(zuordnungBericht(g).join("\n")).toContain("…");
  });
});
