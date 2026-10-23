import { describe, expect, it } from "vitest";
import { leseAnzeige } from "./anzeige";

describe("leseAnzeige", () => {
  it("liest Listenpunkte unter den drei Überschriften", () => {
    const a = leseAnzeige(["## Hook", "- Erster Hook", "- Zweiter Hook", "", "## Körper", "- Ein Körper", "", "## Aufruf", "- Jetzt anfragen"].join("\n"));
    expect(a).toEqual({ hook: ["Erster Hook", "Zweiter Hook"], koerper: ["Ein Körper"], aufruf: ["Jetzt anfragen"], gefunden: ["hook", "koerper", "aufruf"] });
  });

  it("nummerierte Listen, Sternchen und Aufzählungspunkte zählen auch, mit Fortsetzungszeilen", () => {
    const a = leseAnzeige(["## Hook", "1. Erste Variante", "   die sich über zwei Zeilen zieht", "2) Zweite Variante", "* Dritte", "• Vierte"].join("\n"));
    expect(a.hook).toEqual(["Erste Variante die sich über zwei Zeilen zieht", "Zweite Variante", "Dritte", "Vierte"]);
  });

  it("ohne Liste ist jeder Absatz eine Variante", () => {
    const a = leseAnzeige(["## Körper", "Erster Absatz", "geht weiter.", "", "Zweiter Absatz."].join("\n"));
    expect(a.koerper).toEqual(["Erster Absatz geht weiter.", "Zweiter Absatz."]);
  });

  it("die Überschrift darf auch «Koerper» heissen, in jeder Gross- und Kleinschreibung, mit einer oder mehreren Rauten und einem Zusatz", () => {
    const a = leseAnzeige(["# HOOK (drei Stück)", "- a", "### koerper", "- b", "#### Aufruf:", "- c"].join("\n"));
    expect(a).toMatchObject({ hook: ["a"], koerper: ["b"], aufruf: ["c"] });
  });

  it("eine andere Überschrift beendet den Teil; was davor oder danach steht, gehört zu keinem", () => {
    const a = leseAnzeige(["Vorspann", "", "## Hook", "- a", "", "## Notizen", "- gehört nicht zum Hook", "", "## Aufruf", "- c"].join("\n"));
    expect(a.hook).toEqual(["a"]);
    expect(a.aufruf).toEqual(["c"]);
    expect(a.koerper).toEqual([]);
    expect(a.gefunden).toEqual(["hook", "aufruf"]);
  });

  it("ein Teil mit Überschrift, aber ohne Variante ist gefunden und leer", () => {
    const a = leseAnzeige("## Hook\n\n## Körper\n- x");
    expect(a.gefunden).toEqual(["hook", "koerper"]);
    expect(a.hook).toEqual([]);
  });

  it("leerer Text und Text ohne Überschriften ergeben nichts", () => {
    expect(leseAnzeige("")).toEqual({ hook: [], koerper: [], aufruf: [], gefunden: [] });
    expect(leseAnzeige("Nur ein Satz ohne Überschrift.").gefunden).toEqual([]);
  });

  it("Windows-Zeilenenden stören nicht", () => {
    expect(leseAnzeige("## Hook\r\n- a\r\n- b\r\n").hook).toEqual(["a", "b"]);
  });
});
