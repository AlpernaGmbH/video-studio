import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ladeBibliothek, lintBibliothek, lintStueck } from "./bibliothek";
import { stueckFamilieAus, type FamilienLook } from "./familie";
import { GeruestFehler, legeStueckAn } from "./geruest";
import { SIGNAL_TYPEN, loeseVariablen } from "./stueck";
import { looks } from "../testing/fixtures";

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-geruest-"));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const lade = (id: string) => ladeBibliothek(root).stuecke.find((g) => g.stueck.id === id)!;

describe("legeStueckAn", () => {
  it("legt ein Stück an, das den Vertrag erfüllt: Es lädt, Deklaration und Parameter stimmen überein", () => {
    legeStueckAn(root, { id: "wert-verlauf", name: "Wert-Verlauf", typen: ["verlauf"], idee: "m-001" });
    const b = ladeBibliothek(root);
    expect(b.befunde).toEqual([]);
    const g = b.stuecke[0]!;
    expect(g.stueck).toMatchObject({ id: "wert-verlauf", status: "entwurf", herkunft: { idee: "m-001" }, ausloeser: { typen: ["verlauf"] } });
    expect(g.stueck.parameter.map((p) => p.id)).toEqual(["werte", "titel"]);
    // Als Entwurf ist das Gerüst lint-sauber (keine Abweichung zwischen piece.json und index.html)
    expect(lintStueck(g).filter((x) => x.stufe === "fehler")).toEqual([]);
  });

  it("wählt die Start-Parameter nach Signaltyp", () => {
    const ids = (typen: Parameters<typeof legeStueckAn>[1]["typen"], id: string) => {
      legeStueckAn(root, { id, name: id, typen });
      return lade(id).stueck.parameter.map((p) => p.id);
    };
    expect(ids(["aufzaehlung"], "liste")).toEqual(["punkte", "titel"]);
    expect(ids(["zahl"], "kennzahl")).toEqual(["wert", "titel"]);
    expect(ids(["vergleich"], "gegenueber")).toEqual(["text", "titel"]);
    expect(ids(["verlauf", "aufzaehlung"], "beides")).toEqual(["werte", "punkte", "titel"]);
  });

  it.each(SIGNAL_TYPEN)("jeder Signaltyp «%s» ergibt ein gültiges Gerüst", (typ) => {
    legeStueckAn(root, { id: `test-${typ}`, name: `Test ${typ}`, typen: [typ] });
    expect(ladeBibliothek(root).befunde).toEqual([]);
  });

  it("das Gerüst ist ab «gebaut» gesperrt, solange noch TODO drinsteht", () => {
    legeStueckAn(root, { id: "wert-verlauf", name: "Wert-Verlauf", typen: ["verlauf"] });
    const g = lade("wert-verlauf");
    const gebaut = { ...g, stueck: { ...g.stueck, status: "gebaut" as const } };
    const codes = lintStueck(gebaut).map((b) => `${b.stufe}:${b.code}`);
    expect(codes.filter((c) => c === "fehler:todo")).toHaveLength(2); // piece.json und index.html
  });

  it("die Start-Parameter lassen sich mit Beispielwerten auflösen", () => {
    legeStueckAn(root, { id: "wert-verlauf", name: "Wert-Verlauf", typen: ["verlauf"] });
    const s = lade("wert-verlauf").stueck;
    const r = loeseVariablen(s, { werte: [90, 70, 50] }, { ohneMarke: true });
    expect(r.ok && r.variablen["werte"]).toBe("[90,70,50]");
  });

  it("die Komposition folgt dem Vertrag: kein data-duration am Root, synchrone Timeline, Ende bei «dauer»", () => {
    legeStueckAn(root, { id: "wert-verlauf", name: "Wert-Verlauf", typen: ["verlauf"] });
    const html = fs.readFileSync(path.join(root, "wert-verlauf", "index.html"), "utf8");
    expect(html).toMatch(/data-composition-id="wert-verlauf"[^>]*data-width="1080"[^>]*data-height="1920"/);
    expect(html).not.toMatch(/data-composition-id[^>]*data-duration/);
    expect(html).toContain("tl.set({}, {}, d)");
    expect(html).toContain('window.__timelines["wert-verlauf"] = tl');
    expect(html).toContain("assets/vendor/gsap.min.js");
    expect(html).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
  });

  it("lehnt ungültige Angaben und vorhandene Stücke ab", () => {
    expect(() => legeStueckAn(root, { id: "Falsch Er Name", name: "x", typen: ["verlauf"] })).toThrow(GeruestFehler);
    expect(() => legeStueckAn(root, { id: "ohne-typ", name: "x", typen: [] })).toThrow(/Mindestens ein Signaltyp/);
    expect(() => legeStueckAn(root, { id: "kurzer-name", name: "x", typen: ["zahl"] })).toThrow(/Angaben ungültig: name/);
    expect(() => legeStueckAn(root, { id: "falscher-typ", name: "x", typen: ["gibt-es-nicht" as never] })).toThrow(/Unbekannter Signaltyp/);
    legeStueckAn(root, { id: "da", name: "Da", typen: ["zahl"] });
    expect(() => legeStueckAn(root, { id: "da", name: "Da", typen: ["zahl"] })).toThrow(/existiert schon/);
  });

  it("die ganze Bibliothek bleibt lint-sauber, solange das Gerüst Entwurf ist", () => {
    legeStueckAn(root, { id: "a-neu", name: "A-Neu", typen: ["zahl"] });
    expect(lintBibliothek(ladeBibliothek(root)).filter((b) => b.stufe === "fehler")).toEqual([]);
  });
});

describe("Stücke mit Familie (Regel 2)", () => {
  const familienLook = (over: Partial<FamilienLook> = {}): FamilienLook => ({ vonIdee: "m-001", runde: 1, briefs: looks().briefs, bilder: looks().bilder, gewaehlt: "b", von: "Andrej", am: "2026-10-22T08:00:00.000Z", fassung: 1, notizen: [], ...over });
  const familie = (over: Partial<FamilienLook> = {}) => ({ name: "Handy-Mockups", look: stueckFamilieAus("mockups", familienLook(over)) });
  const liste = (...ids: string[]) => ids.map((id) => ({ id, name: id, beschreibung: "Eine Familie für den Test der Bibliothek." }));
  const codes = (id: string, familien?: ReturnType<typeof liste>) => lintStueck(lade(id), familien).map((b) => `${b.stufe}:${b.code}`);

  it("legt den gewählten Look ins Stück: Familie im Datenblatt, look.md und das Referenzbild", () => {
    const bild = path.join(root, "b.png");
    fs.writeFileSync(bild, "png");
    legeStueckAn(root, { id: "mockup-seite", name: "Mockup Seite", typen: ["zahl"], idee: "m-002", familie: { ...familie({ von: "Leander", fassung: 2 }), referenzBild: bild } });
    expect(ladeBibliothek(root).befunde).toEqual([]);
    const g = lade("mockup-seite");
    expect(g.stueck.familie).toMatchObject({ id: "mockups", fassung: 2, look: { gewaehlt: "b", name: "Interface", von: "Leander", vonIdee: "m-001" } });
    const md = fs.readFileSync(path.join(g.dir, "look", "look.md"), "utf8");
    expect(md).toContain("Karte mit feinem Raster wie ein Dashboard");
    expect(md).toContain("Leander");
    expect(fs.readFileSync(path.join(g.dir, "look", "referenz.png"), "utf8")).toBe("png");
    expect(codes("mockup-seite", liste("mockups"))).toEqual([]);
  });

  it("ohne Standbild entsteht das Stück trotzdem, der Lint warnt aber", () => {
    legeStueckAn(root, { id: "mockup-seite", name: "Mockup Seite", typen: ["zahl"], familie: familie() });
    legeStueckAn(root, { id: "mockup-zwei", name: "Mockup Zwei", typen: ["zahl"], familie: { ...familie(), referenzBild: path.join(root, "gibt-es-nicht.png") } });
    for (const id of ["mockup-seite", "mockup-zwei"]) expect(codes(id, liste("mockups"))).toEqual(["warnung:look_referenz_fehlt"]);
  });

  it("der Lint verlangt für ein Stück mit Familie den Look im Stück und eine Familie aus der Liste", () => {
    legeStueckAn(root, { id: "mockup-seite", name: "Mockup Seite", typen: ["zahl"], familie: familie() });
    expect(codes("mockup-seite", liste("rankings"))).toContain("fehler:familie_unbekannt");
    expect(codes("mockup-seite", liste("mockups"))).not.toContain("fehler:familie_unbekannt");
    // ohne Liste (Bibliothek von Hand gebaut) wird die Familie nicht gegen die Liste geprüft
    expect(codes("mockup-seite")).not.toContain("fehler:familie_unbekannt");
    fs.rmSync(path.join(root, "mockup-seite", "look", "look.md"));
    expect(codes("mockup-seite", liste("mockups"))).toContain("fehler:look_fehlt");
  });

  it("ein Stück ohne Familie braucht weder Look-Ordner noch Eintrag in der Liste", () => {
    legeStueckAn(root, { id: "einzeln", name: "Einzeln", typen: ["zahl"] });
    expect(codes("einzeln", liste("mockups"))).toEqual([]);
    expect(lade("einzeln").stueck.familie).toBeUndefined();
    expect(fs.existsSync(path.join(root, "einzeln", "look"))).toBe(false);
  });

  it("die ganze Bibliothek liest _familien.json mit und meldet eine kaputte Datei als Fehler", () => {
    legeStueckAn(root, { id: "mockup-seite", name: "Mockup Seite", typen: ["zahl"], familie: familie() });
    fs.writeFileSync(path.join(root, "_familien.json"), JSON.stringify({ schema: 1, familien: liste("mockups") }));
    expect(ladeBibliothek(root).familien?.map((f) => f.id)).toEqual(["mockups"]);
    expect(lintBibliothek(ladeBibliothek(root)).filter((b) => b.stufe === "fehler")).toEqual([]);
    fs.writeFileSync(path.join(root, "_familien.json"), JSON.stringify({ schema: 1, familien: liste("anderes") }));
    expect(lintBibliothek(ladeBibliothek(root)).map((b) => b.code)).toContain("familie_unbekannt");
    fs.writeFileSync(path.join(root, "_familien.json"), "{nope");
    expect(lintBibliothek(ladeBibliothek(root)).map((b) => b.code)).toContain("familien_ungueltig");
  });
});

