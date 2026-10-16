import { describe, expect, it } from "vitest";
import { KatalogEintrag } from "./schemas";
import { StoryboardFehler, pruefeStoryboard } from "./storyboard";
import { stueckVerlauf, stueckZahl } from "../testing/fixtures";

const katalog = [
  KatalogEintrag.parse({ schluessel: "k-0142", art: "video", pfad: "Bibliothek/B-Roll/a.mov", titel: "Intern_Gossau_Laptop", beschreibung: "Hände auf Laptop", tags: ["Laptop"], dauer: 8.4, besteSekunden: { von: 1.2, bis: 5.0 }, sicherheit: "hoch" }),
  KatalogEintrag.parse({ schluessel: "k-0200", art: "foto", pfad: "Bibliothek/Fotos/b.jpg", titel: "Intern_Speicher_Dorfplatz", beschreibung: "Dorfplatz", tags: ["Speicher"], sicherheit: "mittel" }),
  KatalogEintrag.parse({ schluessel: "k-0300", art: "sound", pfad: "Bibliothek/Sounds/c.wav", titel: "Whoosh_kurz", beschreibung: "Whoosh", tags: ["Whoosh"], sicherheit: "hoch" }),
];
const ctx = { stuecke: [stueckZahl(), stueckVerlauf()], katalog };
const kopf = { hook: "Warum deine Website Kunden verliert" };
const ov = (o: Record<string, unknown>) => ({ effekt: "zahl-zaehler", t: 6.4, dauer: 2.6, params: { wert: 7 }, begruendung: "Kennzahl im Skript, Zahl wirkt stärker als Wort", ...o });

describe("pruefeStoryboard", () => {
  it("lässt gültige Einträge durch (Beispiel A1)", () => {
    const r = pruefeStoryboard({ ...kopf, overlays: [ov({}), ov({ effekt: "broll", t: 9.8, dauer: 1.5, params: { katalog: "k-0142" }, begruendung: "Zeigt die Aussage, bringt Bildwechsel" })] }, ctx);
    expect(r.plan.overlays).toHaveLength(2);
    expect(r.verworfen).toEqual([]);
  });

  it("verwirft B-Roll ohne gültigen Katalog-Schlüssel", () => {
    const r = pruefeStoryboard({ ...kopf, overlays: [ov({ effekt: "broll", params: { katalog: "k-9999" } }), ov({ effekt: "broll", params: {} })] }, ctx);
    expect(r.plan.overlays).toHaveLength(0);
    expect(r.verworfen.map((v) => v.grund)).toEqual([expect.stringContaining("existiert nicht"), expect.stringContaining("ohne Katalog-Schlüssel")]);
  });

  it("verwirft B-Roll, das in diesem Video schon vorkam oder im letzten Video der Marke lief", () => {
    const b = (t: number, key: string) => ov({ effekt: "broll", t, dauer: 1.5, params: { katalog: key } });
    const r = pruefeStoryboard({ ...kopf, overlays: [b(1, "k-0142"), b(5, "k-0142"), b(9, "k-0200")] }, { ...ctx, imLetztenVideoDerMarke: ["k-0200"] });
    expect(r.plan.overlays.map((o) => o.params["katalog"])).toEqual(["k-0142"]);
    expect(r.verworfen.map((v) => v.grund)).toEqual([expect.stringContaining("schon vor"), expect.stringContaining("letzten Video")]);
  });

  it("verwirft B-Roll, die kürzer ist als das Overlay (nach besten Sekunden)", () => {
    const r = pruefeStoryboard({ ...kopf, overlays: [ov({ effekt: "broll", dauer: 4.5, params: { katalog: "k-0142" } })] }, ctx);
    expect(r.verworfen[0]?.grund).toContain("nur 3.8 s");
  });

  it("nimmt Fotos ohne Dauerprüfung (Ken Burns) und lehnt Sounds als Bild ab", () => {
    const r = pruefeStoryboard({ ...kopf, overlays: [ov({ effekt: "broll", dauer: 3, params: { katalog: "k-0200" } }), ov({ effekt: "broll", t: 12, params: { katalog: "k-0300" } })] }, ctx);
    expect(r.plan.overlays).toHaveLength(1);
    expect(r.verworfen[0]?.grund).toContain("Sound");
  });

  it("verwirft unbekannte Effekte und Stücke, die noch nicht aktiv sind", () => {
    const gebaut = stueckZahl({ id: "neue-karte", status: "gebaut", freigabe: undefined, einsatz: undefined });
    const geprueft = stueckZahl({ id: "geprueft-karte", status: "geprueft", freigabe: undefined });
    const r = pruefeStoryboard(
      { ...kopf, overlays: [ov({ effekt: "orbit" }), ov({ effekt: "neue-karte" }), ov({ effekt: "geprueft-karte" })] },
      { ...ctx, stuecke: [...ctx.stuecke, gebaut, geprueft] },
    );
    expect(r.plan.overlays).toHaveLength(0);
    expect(r.verworfen.map((v) => v.grund)).toEqual([
      expect.stringContaining("kein Stück der Bibliothek"),
      expect.stringContaining("Status «gebaut»"),
      expect.stringContaining("Status «geprueft»"),
    ]);
  });

  it("erlaubt Entwürfe nur, wenn der Aufrufer es ausdrücklich verlangt (Test-Render)", () => {
    const gebaut = stueckZahl({ id: "neue-karte", status: "gebaut", freigabe: undefined, einsatz: undefined });
    const r = pruefeStoryboard({ ...kopf, overlays: [ov({ effekt: "neue-karte" })] }, { ...ctx, stuecke: [gebaut], nurAktive: false });
    expect(r.plan.overlays).toHaveLength(1);
  });

  it("prüft die Parameter gegen das Datenblatt", () => {
    const r = pruefeStoryboard(
      {
        ...kopf,
        overlays: [
          ov({ params: { wert: 7, farbe: "rot" } }),
          ov({ t: 10, params: {} }),
          ov({ t: 14, dauer: 9 }),
          ov({ effekt: "wert-verlauf", t: 20, dauer: 3, params: { werte: [97, 80, 60] } }),
          ov({ effekt: "wert-verlauf", t: 25, dauer: 3, params: { werte: [97] } }),
        ],
      },
      ctx,
    );
    expect(r.plan.overlays.map((o) => o.effekt)).toEqual(["wert-verlauf"]);
    expect(r.verworfen.map((v) => v.grund)).toEqual([
      expect.stringContaining("Unbekannter Parameter «farbe»"),
      expect.stringContaining("Pflichtparameter «wert» fehlt"),
      expect.stringContaining("Dauer 9"),
      expect.stringContaining("hat 1 Werte"),
    ]);
  });

  it("verwirft Overlays ohne Begründung", () => {
    const r = pruefeStoryboard({ ...kopf, overlays: [ov({ begruendung: "" }), ov({ begruendung: undefined })] }, ctx);
    expect(r.plan.overlays).toHaveLength(0);
    expect(r.verworfen).toHaveLength(2);
  });

  it("verwirft Overlays, die über das Videoende hinausragen", () => {
    const r = pruefeStoryboard({ ...kopf, overlays: [ov({ t: 29 })] }, { ...ctx, videoDauer: 30 });
    expect(r.verworfen[0]?.grund).toContain("nur 30 s lang");
  });

  it("meldet überlappende Einsätze, ohne sie zu verwerfen", () => {
    const r = pruefeStoryboard({ ...kopf, overlays: [ov({ t: 5 }), ov({ t: 6 })] }, ctx);
    expect(r.plan.overlays).toHaveLength(2);
    expect(r.warnungen[0]).toContain("überlappen");
  });

  it("wirft bei kaputter Hülle", () => {
    expect(() => pruefeStoryboard(null, ctx)).toThrow(StoryboardFehler);
    expect(() => pruefeStoryboard({ hook: "x" }, ctx)).toThrow("overlays");
    expect(() => pruefeStoryboard({ overlays: [] }, ctx)).toThrow(StoryboardFehler);
  });
});
