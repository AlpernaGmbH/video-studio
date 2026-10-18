import { describe, expect, it } from "vitest";
import { archivBericht, inhaltsDatum, winkelMeta } from "./archiv";
import { dubletten } from "./regeln";
import { inhalt } from "./testdaten";

const JETZT = "2026-10-18T09:00:00Z";
const beitrag = (id: string, p: Parameters<typeof inhalt>[0] = {}) => inhalt({ id, status: "Ausgewertet", plattformen: ["LinkedIn"], format: "LinkedIn-Post", erstellt: "", ...p });

describe("winkelMeta", () => {
  it("liest Pillar, Hook-Muster und CTA aus dem Winkel des Imports", () => {
    expect(winkelMeta("Pillar: A Digitaler Auftritt · Hook-Muster: Number Tension · CTA: keiner")).toEqual({ pillar: "A Digitaler Auftritt", hookMuster: "Number Tension", cta: "keiner" });
  });
  it("fehlende Teile fehlen, ein normaler Winkel ergibt nichts", () => {
    expect(winkelMeta("Pillar: E Social Proof")).toEqual({ pillar: "E Social Proof" });
    expect(winkelMeta("Ein Praxisteam zeigt, wie es die Wartezeit halbiert hat")).toEqual({});
  });
});

describe("inhaltsDatum", () => {
  it("«Geplant für» geht vor dem Entstehen der Zeile", () => {
    expect(inhaltsDatum(inhalt({ geplantFuer: "2025-04-22", erstellt: "2026-10-17T08:00:00Z" }))).toBe("2025-04-22");
    expect(inhaltsDatum(inhalt({ geplantFuer: "", erstellt: "2026-10-17T08:00:00Z" }))).toBe("2026-10-17T08:00:00Z");
  });
});

describe("archivBericht: Überblick", () => {
  const bestand = [
    beitrag("c-0001", { winkel: "Pillar: A Digitaler Auftritt · Hook-Muster: Number Tension · CTA: keiner", geplantFuer: "2026-09-02" }),
    beitrag("c-0002", { winkel: "Pillar: A Digitaler Auftritt · Hook-Muster: Curiosity Gap · CTA: keiner", geplantFuer: "2025-05-10" }),
    beitrag("c-0003", { winkel: "Pillar: E Social Proof", geplantFuer: "2026-07-01", status: "Veröffentlicht" }),
    inhalt({ id: "c-0004", status: "Neu", winkel: "Pillar: D Branche" }), // laufend: zählt nicht zum Archiv
    inhalt({ id: "c-0005", status: "Verworfen", winkel: "Pillar: A Digitaler Auftritt" }), // verworfen: kein Archiv
  ];
  const b = archivBericht(bestand, JETZT);

  it("zählt Archiv (veröffentlicht und ausgewertet) und laufende Inhalte getrennt", () => {
    expect(b.archiv).toMatchObject({ gesamt: 3, letzte90Tage: 1, von: "2025-05-10", bis: "2026-09-02" });
    expect(b.laufend).toBe(1);
  });

  it("zählt je Pillar mit dem letzten Datum und den Tagen seitdem", () => {
    const a = b.proPillar.find((p) => p.pillar === "A Digitaler Auftritt")!;
    expect(a).toMatchObject({ gesamt: 2, letzte90Tage: 1, zuletzt: "2026-09-02", tageSeitZuletzt: 46 });
    expect(b.proPillar.find((p) => p.pillar === "E Social Proof")).toMatchObject({ gesamt: 1, letzte90Tage: 0, tageSeitZuletzt: 109 });
    expect(b.proPillar.map((p) => p.pillar)).not.toContain("D Branche"); // nicht im Archiv
  });

  it("zählt Hook-Muster, Format und Plattform; Beiträge ohne Angabe stehen unter «ohne Angabe»", () => {
    expect(b.proHookMuster["Number Tension"]).toEqual({ gesamt: 1, letzte90Tage: 1 });
    expect(b.proHookMuster["ohne Angabe"]).toEqual({ gesamt: 1, letzte90Tage: 0 });
    expect(b.proFormat["LinkedIn-Post"]?.gesamt).toBe(3);
    expect(b.proPlattform["LinkedIn"]?.gesamt).toBe(3);
  });

  it("ein leerer Bestand ergibt Nullen statt Fehler", () => {
    const leer = archivBericht([], JETZT);
    expect(leer.archiv).toMatchObject({ gesamt: 0, von: "", bis: "" });
    expect(leer.proPillar).toEqual([]);
  });
});

describe("archivBericht: ähnliche Themen", () => {
  const bestand = [
    beitrag("c-0001", { titel: "9 gute Gründe, kein Google-Profil zu haben.", hook: "Neun Gründe gegen das Google-Profil", geplantFuer: "2026-09-02" }),
    beitrag("c-0002", { titel: "Das Google-Profil als Visitenkarte der Region", geplantFuer: "2025-05-10" }),
    inhalt({ id: "c-0003", titel: "Preise für Websites", hook: "Was eine Website kostet", status: "Neu" }),
    inhalt({ id: "c-0004", titel: "Google-Profil ohne Öffnungszeiten", status: "Verworfen", statusGrund: "Schon dreimal behandelt, nichts Neues", geplantFuer: "2026-10-01" }),
  ];

  it("findet Treffer über das 90-Tage-Fenster hinaus und sagt, ob die Regel «gleicher Fakt» noch gilt", () => {
    const r = archivBericht(bestand, JETZT, { thema: "Google-Profil für Handwerker" });
    const ids = r.aehnlich.map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(["c-0001", "c-0002", "c-0004"]));
    expect(ids).not.toContain("c-0003");
    expect(r.aehnlich.find((a) => a.id === "c-0001")).toMatchObject({ imFenster: true, tage: 46 });
    expect(r.aehnlich.find((a) => a.id === "c-0002")).toMatchObject({ imFenster: false, datum: "2025-05-10" });
  });

  it("ein verworfener Inhalt nennt seinen Grund, damit dieselbe Idee nicht wiederkommt", () => {
    const t = archivBericht(bestand, JETZT, { thema: "Google-Profil Öffnungszeiten" }).aehnlich.find((a) => a.id === "c-0004");
    expect(t).toMatchObject({ status: "Verworfen", grund: "Schon dreimal behandelt, nichts Neues" });
  });

  it("sortiert nach Abdeckung und begrenzt die Zahl", () => {
    const r = archivBericht(bestand, JETZT, { thema: "Google-Profil", max: 2 });
    expect(r.aehnlich).toHaveLength(2);
    expect(r.aehnlich[0]!.abdeckung).toBeGreaterThanOrEqual(r.aehnlich[1]!.abdeckung);
  });

  it("ohne Thema oder ohne brauchbare Wörter gibt es keine Treffer", () => {
    expect(archivBericht(bestand, JETZT).aehnlich).toEqual([]);
    expect(archivBericht(bestand, JETZT, { thema: "und der die" }).aehnlich).toEqual([]);
  });

  it("Erwähnungen von Notion im Beleg zählen mit ihrem Namen, nicht mit der Adresse", () => {
    const mit = beitrag("c-0009", { titel: "Etwas ganz anderes", beleg: 'Rohstoff r-1: Die Gründung dauerte zwei Monate (<mention-page url="https://app.notion.com/p/abc">Gründung dauerte zwei Monate</mention-page>)', geplantFuer: "2026-08-01" });
    expect(archivBericht([mit], JETZT, { thema: "Gründung dauerte zwei Monate" }).aehnlich.map((a) => a.id)).toEqual(["c-0009"]);
    expect(archivBericht([mit], JETZT, { thema: "notion abc" }).aehnlich).toEqual([]);
  });
});

describe("Dublettenfenster richtet sich nach dem Erscheinungsdatum", () => {
  const beleg = "Praxis Hofer, Herisau: Wartezeit von 32 auf 14 Minuten, gemessen im September 2026";
  const neu = inhalt({ id: "c-0100", beleg });

  it("ein gleicher Fakt in einem Beitrag, der vor mehr als 90 Tagen erschien, ist keine Dublette, auch wenn die Zeile gerade erst importiert wurde", () => {
    const alt = beitrag("c-0001", { beleg, geplantFuer: "2026-03-01", erstellt: "2026-10-17T08:00:00Z" });
    expect(dubletten(neu, [alt], JETZT)).toEqual([]);
  });

  it("derselbe Fakt in einem Beitrag der letzten 90 Tage ist eine Dublette", () => {
    const jung = beitrag("c-0002", { beleg, geplantFuer: "2026-09-20", erstellt: "2026-10-17T08:00:00Z" });
    expect(dubletten(neu, [jung], JETZT).map((d) => d.id)).toEqual(["c-0002"]);
  });
});
