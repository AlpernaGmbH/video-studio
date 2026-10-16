import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ladeBibliothek, lintBibliothek, lintStueck } from "./bibliothek";
import { GeruestFehler, legeStueckAn } from "./geruest";
import { SIGNAL_TYPEN, loeseVariablen } from "./stueck";

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
