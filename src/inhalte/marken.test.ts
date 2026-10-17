import { describe, expect, it } from "vitest";
import { gate0Funktion, gate0Wirksam, markenNachSeite, zeileZuMarke } from "./marken";

/** So liefert die Ansicht «Marken» die Zeile (beobachtet am echten Abfrageergebnis). */
const zeile = (p: Record<string, unknown> = {}) => ({
  Typ: "Eigene",
  "Gate 0": "offen",
  "date:Gate 0 am:is_datetime": 0,
  Notizen: "Farben, Schriften, Ton und Schnittprofil stehen im Profil.",
  Kundenfreigabe: "nein",
  Raum: "",
  "Gate 0 von": "",
  "Marken-ID": "alperna",
  "Profil-Datei": "marken/alperna.json (Repo video-studio)",
  Name: "Alperna",
  url: "https://app.notion.com/p/3fc6be186e9b81df9141ebe5778a86ff",
  ...p,
});

describe("zeileZuMarke", () => {
  it("liest die echte Zeile", () => {
    expect(zeileZuMarke(zeile())).toMatchObject({ id: "alperna", name: "Alperna", typ: "Eigene", gate0: "offen", kundenfreigabe: "nein", seite: "3fc6be186e9b81df9141ebe5778a86ff" });
  });

  it("ein unbekannter Gate-0-Wert gilt als «offen», ein unbekannter Typ als leer", () => {
    expect(zeileZuMarke(zeile({ "Gate 0": "vielleicht", Typ: "Partner" }))).toMatchObject({ gate0: "offen", typ: "" });
  });
});

describe("Gate 0 gilt nur mit einem Menschen mit Namen", () => {
  it("«freigegeben» ohne Namen oder mit Systemnamen bleibt «offen»", () => {
    for (const von of ["", "  ", "Claude", "system"]) {
      expect(gate0Wirksam(zeileZuMarke(zeile({ "Gate 0": "freigegeben", "Gate 0 von": von }))), `von=«${von}»`).toBe("offen");
    }
  });

  it("«freigegeben» von Andrej gilt, «Änderung» bleibt «Änderung»", () => {
    expect(gate0Wirksam(zeileZuMarke(zeile({ "Gate 0": "freigegeben", "Gate 0 von": "Andrej" })))).toBe("freigegeben");
    expect(gate0Wirksam(zeileZuMarke(zeile({ "Gate 0": "Änderung" })))).toBe("Änderung");
  });
});

describe("Verknüpfungen", () => {
  it("löst die Seiten-Kennung in die Marken-ID auf", () => {
    const m = [zeileZuMarke(zeile()), zeileZuMarke(zeile({ "Marken-ID": "", url: "https://app.notion.com/p/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }))];
    expect([...markenNachSeite(m)]).toEqual([["3fc6be186e9b81df9141ebe5778a86ff", "alperna"]]);
  });

  it("gate0Funktion: eine unbekannte Marke ist «offen»", () => {
    const f = gate0Funktion([zeileZuMarke(zeile({ "Gate 0": "freigegeben", "Gate 0 von": "Andrej" }))]);
    expect(f("alperna")).toBe("freigegeben");
    expect(f("kunde-x")).toBe("offen");
    expect(f("")).toBe("offen");
  });
});
