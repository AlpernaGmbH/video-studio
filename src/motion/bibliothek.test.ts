import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { kompakterIndex, ladeBibliothek, leseDeklaration, lintBibliothek, lintStueck, setzeDeklaration, vorhandene, aktive } from "./bibliothek";
import { erzeugeDeklaration, type Stueck } from "./stueck";
import { stueckVerlauf, stueckZahl } from "../testing/fixtures";

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-bib-"));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

/** Eine gültige index.html für ein Stück, mit passender Deklaration. */
function htmlFuer(s: Stueck, aendern: (html: string) => string = (h) => h): string {
  const basis = `<!doctype html>
<html lang="de-CH">
<head><meta charset="utf-8"><link rel="stylesheet" href="assets/brand.css"><script src="assets/vendor/gsap.min.js"></script>
<style>html,body{background:transparent}</style></head>
<body><div id="root" data-composition-id="${s.id}" data-start="0" data-width="1080" data-height="1920"></div>
<script>var v = window.__hyperframes.getVariables(); var d = Number(v.dauer); var tl = gsap.timeline({paused:true}); tl.set({}, {}, d);</script>
</body></html>`;
  return aendern(setzeDeklaration(basis, erzeugeDeklaration(s)));
}

function legeAn(s: Stueck, html = htmlFuer(s), vorschau = true) {
  const dir = path.join(root, s.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "piece.json"), JSON.stringify(s, null, 2));
  if (html) fs.writeFileSync(path.join(dir, "index.html"), html);
  if (vorschau) {
    fs.mkdirSync(path.join(dir, "vorschau"), { recursive: true });
    fs.writeFileSync(path.join(dir, "vorschau", "at-1s.png"), "png");
  }
  return dir;
}

const codes = (s: Stueck, html?: string) => {
  legeAn(s, html);
  const g = ladeBibliothek(root).stuecke.find((x) => x.stueck.id === s.id)!;
  return lintStueck(g).map((b) => `${b.stufe}:${b.code}`);
};

describe("Deklaration im HTML", () => {
  it("liest und schreibt sie verlustfrei, auch mit Apostroph und Anführungszeichen im Text", () => {
    const s = stueckZahl({ parameter: [{ id: "wert", typ: "number", label: "W", beschreibung: "Der «Wert» der 'Kennzahl' & mehr", pflicht: true, default: 7 }] });
    const html = setzeDeklaration("<html lang=\"de\"><body></body></html>", erzeugeDeklaration(s));
    const r = leseDeklaration(html);
    expect(r.ok && r.variablen.find((v) => v.id === "wert")?.description).toBe("Der «Wert» der 'Kennzahl' & mehr");
  });

  it("ersetzt eine bestehende Deklaration statt eine zweite anzuhängen", () => {
    const a = setzeDeklaration("<html lang=\"de\"></html>", erzeugeDeklaration(stueckZahl()));
    const b = setzeDeklaration(a, erzeugeDeklaration(stueckVerlauf()));
    expect(b.match(/data-composition-variables/g)).toHaveLength(1);
    const r = leseDeklaration(b);
    expect(r.ok && r.variablen.some((v) => v.id === "werte")).toBe(true);
  });

  it("meldet fehlende oder kaputte Deklaration verständlich", () => {
    expect(leseDeklaration("<html></html>")).toEqual({ ok: false, grund: expect.stringContaining("fehlt") });
    expect(leseDeklaration("<html data-composition-variables='{kaputt'></html>")).toEqual({ ok: false, grund: expect.stringContaining("kein gültiges JSON") });
    expect(leseDeklaration("<html data-composition-variables='{\"a\":1}'></html>")).toEqual({ ok: false, grund: expect.stringContaining("keine Liste") });
  });
});

describe("ladeBibliothek", () => {
  it("lädt gültige Stücke sortiert und überspringt _ und . Ordner", () => {
    legeAn(stueckVerlauf());
    legeAn(stueckZahl());
    fs.mkdirSync(path.join(root, "_vorlage"));
    fs.mkdirSync(path.join(root, ".git"));
    const b = ladeBibliothek(root);
    expect(b.stuecke.map((s) => s.stueck.id)).toEqual(["wert-verlauf", "zahl-zaehler"]);
    expect(b.befunde).toEqual([]);
  });

  it("meldet fehlende, kaputte und ungültige piece.json mit Grund", () => {
    fs.mkdirSync(path.join(root, "ohne-datei"));
    fs.mkdirSync(path.join(root, "kaputt"));
    fs.writeFileSync(path.join(root, "kaputt", "piece.json"), "{nope");
    fs.mkdirSync(path.join(root, "ungueltig"));
    fs.writeFileSync(path.join(root, "ungueltig", "piece.json"), JSON.stringify({ schema: 1, id: "ungueltig" }));
    const b = ladeBibliothek(root);
    expect(b.stuecke).toEqual([]);
    expect(b.befunde.map((x) => `${x.stueck}:${x.code}`)).toEqual(expect.arrayContaining(["ohne-datei:piece_json_fehlt", "kaputt:piece_json_ungueltig", "ungueltig:datenblatt"]));
  });

  it("lehnt eine ID ab, die nicht zum Ordnernamen passt", () => {
    const dir = legeAn(stueckZahl());
    fs.renameSync(dir, path.join(root, "anderer-name"));
    const b = ladeBibliothek(root);
    expect(b.befunde[0]).toMatchObject({ code: "id_ordner" });
  });

  it("eine fehlende Bibliothek ist leer, kein Fehler", () => {
    expect(ladeBibliothek(path.join(root, "gibt-es-nicht"))).toEqual({ stuecke: [], befunde: [] });
  });
});

describe("lintStueck", () => {
  it("ein sauberes Stück hat keinen Befund", () => {
    expect(codes(stueckZahl())).toEqual([]);
  });

  it("erkennt Abweichung zwischen piece.json und HTML: Variable fehlt, Typ, Default, unbekannt", () => {
    const s = stueckZahl();
    const sub = (von: string, nach: string) => (h: string) => {
      expect(h).toContain(von);
      return h.replace(von, nach);
    };
    expect(codes(s, htmlFuer(s, sub('{"id":"suffix"', '{"id":"suffix2"')))).toEqual(expect.arrayContaining(["fehler:variable_fehlt", "fehler:variable_unbekannt"]));
    expect(codes(s, htmlFuer(s, sub('"id":"wert","type":"number"', '"id":"wert","type":"string"')))).toContain("fehler:variable_typ");
    expect(codes(s, htmlFuer(s, sub('"default":7', '"default":8')))).toContain("fehler:variable_default");
  });

  it("verbietet data-duration am Root (die Länge kommt aus «dauer»)", () => {
    const s = stueckZahl();
    expect(codes(s, htmlFuer(s, (h) => h.replace('data-start="0"', 'data-start="0" data-duration="3"')))).toContain("fehler:root_dauer");
  });

  it("verlangt das Format 1080×1920 und lesende Variablen", () => {
    const s = stueckZahl();
    expect(codes(s, htmlFuer(s, (h) => h.replace('data-width="1080"', 'data-width="1920"')))).toContain("fehler:format");
    expect(codes(s, htmlFuer(s, (h) => h.replace("window.__hyperframes.getVariables()", "{}")))).toContain("fehler:variablen_nicht_gelesen");
  });

  it("verbietet Nachladen aus dem Netz, lässt den SVG-Namensraum zu", () => {
    const s = stueckZahl();
    expect(codes(s, htmlFuer(s, (h) => h.replace("<style>", '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins"><style>')))).toContain("fehler:extern");
    expect(codes(s, htmlFuer(s, (h) => h.replace('<div id="root"', '<svg xmlns="http://www.w3.org/2000/svg"></svg><div id="root"')))).not.toContain("fehler:extern");
  });

  it("verlangt GSAP aus assets/vendor", () => {
    const s = stueckZahl();
    expect(codes(s, htmlFuer(s, (h) => h.replace("assets/vendor/gsap.min.js", "gsap.min.js")))).toContain("fehler:gsap_quelle");
  });

  it("warnt ohne transparenten Hintergrund und ohne Vorschaubilder", () => {
    const s = stueckZahl();
    expect(codes(s, htmlFuer(s, (h) => h.replace("background:transparent", "background:red")))).toContain("warnung:transparent");
    const dir = legeAn(s);
    fs.rmSync(path.join(dir, "vorschau"), { recursive: true });
    const g = ladeBibliothek(root).stuecke[0]!;
    expect(lintStueck(g).map((b) => b.code)).toContain("vorschau_fehlt");
  });

  it("prüft die Einsatzbeispiele gegen die Parameter", () => {
    const s = stueckZahl({ einsatz: { wann: ["Eine einzelne Kennzahl."], wannNicht: ["Ein Verlauf über Messungen."], beispiele: [{ satz: "Sieben von zehn.", variablen: { wert: 7, farbe: "rot" } }] } });
    expect(codes(s)).toContain("fehler:beispiel");
  });

  it("fehlende index.html ist ein Fehler", () => {
    const dir = legeAn(stueckZahl());
    fs.rmSync(path.join(dir, "index.html"));
    expect(lintStueck(ladeBibliothek(root).stuecke[0]!).map((b) => b.code)).toEqual(["index_fehlt"]);
  });
});

describe("lintBibliothek und Index", () => {
  it("meldet kombinierbarMit auf ein unbekanntes Stück", () => {
    legeAn(stueckZahl({ einsatz: { wann: ["Eine einzelne Kennzahl."], wannNicht: ["Ein Verlauf."], beispiele: [{ satz: "Sieben von zehn.", variablen: { wert: 7 } }], kombinierbarMit: ["gibt-es-nicht"] } }));
    expect(lintBibliothek(ladeBibliothek(root)).map((b) => b.code)).toContain("kombination_unbekannt");
  });

  it("kompakterIndex ist eine Zeile pro Stück und markiert Pflichtparameter", () => {
    const idx = kompakterIndex([stueckZahl(), stueckVerlauf()]);
    expect(idx.split("\n")).toHaveLength(2);
    expect(idx).toContain("wert*:number");
    expect(idx).toContain("Auslöser: verlauf");
    expect(kompakterIndex([])).toContain("leer");
  });

  it("vorhanden = ab «gebaut», aktiv = nur «aktiv»", () => {
    legeAn(stueckZahl());
    legeAn(stueckVerlauf({ status: "entwurf", freigabe: undefined, einsatz: undefined }));
    const b = ladeBibliothek(root);
    expect(vorhandene(b).map((s) => s.id)).toEqual(["zahl-zaehler"]);
    expect(aktive(b).map((s) => s.id)).toEqual(["zahl-zaehler"]);
  });
});

describe("die echte Bibliothek im Repo", () => {
  it("besteht den Lint ohne Fehler", () => {
    const echt = ladeBibliothek(path.resolve(import.meta.dirname, "../../library/motion"));
    const fehler = lintBibliothek(echt).filter((b) => b.stufe === "fehler");
    expect(fehler).toEqual([]);
    expect(echt.stuecke.length).toBeGreaterThan(0);
  });
});
