import { describe, expect, it } from "vitest";
import { inhaltZuProperties, seitenId, zeileZuInhalt, type Inhalt } from "./inhalt";

const MARKE_SEITE = "3fc6be18-6e9b-8183-b761-000cc79d3f56";
const markenNachId = new Map([["3fc6be186e9b8183b761000cc79d3f56", "alperna"]]);

const zeile = (p: Record<string, unknown> = {}) => ({
  url: "https://www.notion.so/Wartezeit-3fc6be186e9b81a0af4bfa3182e64f54",
  "Inhalt-ID": "c-0007",
  Titel: "Wartezeit beim Zahnarzt",
  Format: "Reel",
  Plattformen: '["Instagram","LinkedIn","Fax"]',
  Marke: `["https://www.notion.so/${MARKE_SEITE}"]`,
  Profil: "Alperna",
  Quelle: "Viral-Liste",
  Referenz: "https://www.instagram.com/reel/abc",
  Hook: "Dreissig Minuten Wartezeit.<br>Muss das sein?",
  Winkel: "Neuer Ablauf",
  Beleg: "32 auf 14 Minuten",
  Aufwand: "Dreh nötig",
  Status: "Pitch bereit",
  "Tor I Entscheid": "freigegeben",
  "Tor I Grund": "",
  "Tor I von": "Leander",
  "date:Tor I am:start": "2026-10-17T08:00:00.000Z",
  "Tor P Entscheid": "offen",
  "date:Geplant für:start": "2026-10-20",
  Publishing: "Auto",
  "Offene Markierungen": 2,
  createdTime: "2026-10-10T08:00:00.000Z",
  ...p,
});

describe("zeileZuInhalt", () => {
  it("liest Felder, Mehrfachauswahl, Verknüpfung und Umbrüche", () => {
    const i = zeileZuInhalt(zeile(), markenNachId);
    expect(i.id).toBe("c-0007");
    expect(i.format).toBe("Reel");
    expect(i.plattformen).toEqual(["Instagram", "LinkedIn"]);
    expect(i.marke).toBe("alperna");
    expect(i.hook).toBe("Dreissig Minuten Wartezeit.\nMuss das sein?");
    expect(i.status).toBe("Pitch bereit");
    expect(i.torI).toEqual({ entscheid: "freigegeben", grund: "", von: "Leander", am: "2026-10-17T08:00:00.000Z" });
    expect(i.torP.entscheid).toBe("offen");
    expect(i.geplantFuer).toBe("2026-10-20");
    expect(i.offeneMarkierungen).toBe(2);
    expect(i.seite).toBe("3fc6be186e9b81a0af4bfa3182e64f54");
    expect(i.erstellt).toBe("2026-10-10T08:00:00.000Z");
  });

  it("unbekannte Auswahlwerte werden zu leer, nicht zu etwas Gültigem", () => {
    const i = zeileZuInhalt(zeile({ Format: "Podcast", Status: "Fertig", "Tor I Entscheid": "ja" }), markenNachId);
    expect(i.format).toBeUndefined();
    expect(i.status).toBe("");
    expect(i.torI.entscheid).toBe("");
  });

  it("eine nicht auflösbare Marke bleibt leer, die Adresse bleibt erhalten", () => {
    const i = zeileZuInhalt(zeile(), new Map());
    expect(i.marke).toBe("");
    expect(i.markeUrls).toHaveLength(1);
  });

  it("nimmt Listen als Array oder als JSON-Text, kaputtes JSON ergibt leer", () => {
    expect(zeileZuInhalt(zeile({ Plattformen: ["Blog"] })).plattformen).toEqual(["Blog"]);
    expect(zeileZuInhalt(zeile({ Plattformen: "{kaputt" })).plattformen).toEqual([]);
    expect(zeileZuInhalt(zeile({ Plattformen: "" })).plattformen).toEqual([]);
  });

  it("eine leere Zeile ergibt einen leeren Inhalt ohne Absturz", () => {
    const i = zeileZuInhalt({});
    expect(i.id).toBe("");
    expect(i.plattformen).toEqual([]);
    expect(i.offeneMarkierungen).toBe(0);
    expect(i.status).toBe("");
  });
});

describe("seitenId", () => {
  it("nimmt die letzten 32 Hex-Zeichen", () => {
    expect(seitenId("https://www.notion.so/Seite-3fc6be186e9b81a0af4bfa3182e64f54")).toBe("3fc6be186e9b81a0af4bfa3182e64f54");
    expect(seitenId("https://www.notion.so/abc")).toBe("");
  });

  it("versteht auch die Schreibweise mit Bindestrichen und Grossbuchstaben", () => {
    expect(seitenId("3fc6be18-6e9b-81a0-af4b-fa3182e64f54")).toBe("3fc6be186e9b81a0af4bfa3182e64f54");
    expect(seitenId("https://www.notion.so/3FC6BE186E9B81A0AF4BFA3182E64F54?v=1")).toBe("3fc6be186e9b81a0af4bfa3182e64f54");
  });

  it("eine Wortendung aus Hex-Buchstaben im Titel stört nicht", () => {
    expect(seitenId("https://www.notion.so/Beef-Cafe-3fc6be186e9b81a0af4bfa3182e64f54")).toBe("3fc6be186e9b81a0af4bfa3182e64f54");
  });
});

describe("inhaltZuProperties", () => {
  const basis = (p: Partial<Inhalt> = {}): Inhalt => ({ ...zeileZuInhalt(zeile(), markenNachId), ...p });
  const ENTSCHEIDE = ["Tor I Entscheid", "Tor I Grund", "Tor I von", "date:Tor I am:start", "Tor P Entscheid", "Tor P Grund", "Tor P von", "date:Tor P am:start"];

  it("schreibt die Felder, die Claude schreiben darf", () => {
    const p = inhaltZuProperties(basis());
    expect(p["Inhalt-ID"]).toBe("c-0007");
    expect(p.Plattformen).toEqual(["Instagram", "LinkedIn"]);
    expect(p.Status).toBe("Pitch bereit");
    expect(p.Marke).toBeUndefined();
  });

  it("schreibt in «Pitch bereit» und «Entwurf fertig» keine Entscheide ausser dem Leeren von Tor P in «Pitch bereit»", () => {
    const pitch = inhaltZuProperties(basis({ status: "Pitch bereit" }));
    expect(pitch["Tor I Entscheid"]).toBeUndefined();
    expect(pitch["Tor P Entscheid"]).toBe("offen");
    const entwurf = inhaltZuProperties(basis({ status: "Entwurf fertig", torP: { entscheid: "freigegeben", grund: "", von: "Leander", am: "" } }));
    for (const k of ENTSCHEIDE) expect(entwurf, k).not.toHaveProperty(k);
  });

  it("setzt nie «freigegeben», «abgelehnt» oder «Änderung»", () => {
    const stati = ["Neu", "Pitch bereit", "In Produktion", "Entwurf fertig", "Freigegeben", "Geplant", "Veröffentlicht", "Ausgewertet", "Pausiert", "Verworfen"] as const;
    for (const status of stati) {
      for (const entscheid of ["freigegeben", "abgelehnt", "Rückfrage"] as const) {
        const p = inhaltZuProperties(basis({ status, torI: { entscheid, grund: "x", von: "Leander", am: "" }, torP: { entscheid: "freigegeben", grund: "x", von: "Leander", am: "" } }));
        for (const k of ENTSCHEIDE) expect(["offen", null, undefined], `${status}/${entscheid}/${k}`).toContain(p[k]);
      }
    }
  });

  it("«Neu» setzt Tor I zurück, ausser nach einer Rückfrage: Die Frage bleibt lesbar", () => {
    const neu = inhaltZuProperties(basis({ status: "Neu", torI: { entscheid: "freigegeben", grund: "", von: "Leander", am: "" } }));
    expect(neu).toMatchObject({ "Tor I Entscheid": "offen", "Tor I Grund": null, "Tor I von": null });
    const rueck = inhaltZuProperties(basis({ status: "Neu", torI: { entscheid: "Rückfrage", grund: "Gibt es dazu eine Zahl?", von: "Leander", am: "" } }));
    expect(rueck).not.toHaveProperty("Tor I Entscheid");
    expect(rueck).not.toHaveProperty("Tor I Grund");
  });

  it("«In Produktion» leert Tor P, ausser nach einer Änderung", () => {
    const frisch = inhaltZuProperties(basis({ status: "In Produktion", torP: { entscheid: "freigegeben", grund: "", von: "Leander", am: "" } }));
    expect(frisch["Tor P Entscheid"]).toBe("offen");
    const aenderung = inhaltZuProperties(basis({ status: "In Produktion", torP: { entscheid: "Änderung", grund: "Schluss kürzer", von: "Leander", am: "" } }));
    expect(aenderung).not.toHaveProperty("Tor P Entscheid");
  });

  it("leere Felder werden als null geschrieben, damit Notion sie leert", () => {
    const p = inhaltZuProperties(basis({ hook: "", ziel: "", aufwand: undefined }));
    expect(p.Hook).toBeNull();
    expect(p.Ziel).toBeNull();
    expect(p.Aufwand).toBeNull();
  });
});
