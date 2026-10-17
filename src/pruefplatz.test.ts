import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ladeBibliothek } from "./motion/bibliothek";
import { ladeNotionZiel } from "./notion/ziel";
import { baueDaten, jsonFuerScript, setzeDatenEin, vorschauAlsDatenAdresse } from "./pruefplatz";
import { marke } from "./testing/fixtures";

const wurzel = path.resolve(import.meta.dirname, "..");
const vorlage = () => fs.readFileSync(path.join(wurzel, "pruefplatz", "index.html"), "utf8");
const notion = () => ladeNotionZiel(wurzel);

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "studio-pp-"));
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("Prüfplatz: Daten", () => {
  it("nimmt die echte Bibliothek mit Standbild und Einsatzangaben auf", () => {
    const d = baueDaten({ bibliothek: ladeBibliothek(path.join(wurzel, "library", "motion")), marke: marke(), notion: notion(), jetzt: "2026-10-17T10:00:00.000Z" });
    const z = d.bibliothek.find((s) => s.id === "zahl-zaehler");
    expect(z).toBeDefined();
    expect(z!.vorschau).toMatch(/^data:image\/png;base64,/);
    expect(z!.wann.length).toBeGreaterThan(0);
    expect(z!.parameter.some((p) => p.pflicht)).toBe(true);
    expect(d.notion.datenquelle).toMatch(/^collection:\/\//);
  });

  it("gibt von der Marke nur Anzeigefelder weiter", () => {
    const d = baueDaten({ bibliothek: { stuecke: [], befunde: [] }, marke: marke(), notion: notion(), jetzt: "x" });
    expect(Object.keys(d.marke!).sort()).toEqual(["farben", "look", "name", "schriften", "status", "tonalitaet"]);
    expect(baueDaten({ bibliothek: { stuecke: [], befunde: [] }, marke: null, notion: notion(), jetzt: "x" }).marke).toBeNull();
  });

  it("ein Stück ohne Standbild bekommt null statt eines kaputten Bildes", () => {
    expect(vorschauAlsDatenAdresse(tmp)).toBeNull();
    fs.mkdirSync(path.join(tmp, "vorschau"));
    expect(vorschauAlsDatenAdresse(tmp)).toBeNull();
  });
});

describe("Prüfplatz: Seite", () => {
  it("setzt die Daten in den Block der Vorlage und lässt sich als JSON zurücklesen", () => {
    const daten = baueDaten({ bibliothek: ladeBibliothek(path.join(wurzel, "library", "motion")), marke: marke(), notion: notion(), jetzt: "2026-10-17T10:00:00.000Z" });
    const html = setzeDatenEin(vorlage(), daten);
    const roh = html.match(/<script type="application\/json" id="daten">([\s\S]*?)<\/script>/)![1]!;
    expect(JSON.parse(roh)).toEqual(daten);
    expect(html).not.toContain("__DATEN__");
  });

  it("ein Text mit </script> in den Daten bricht nicht aus dem Block aus", () => {
    const daten = baueDaten({ bibliothek: { stuecke: [], befunde: [] }, marke: marke(), notion: notion(), jetzt: "x" });
    daten.marke!.look = "Böse </script><script>alert(1)</script>   Ende";
    const html = setzeDatenEin(vorlage(), daten);
    expect(html.match(/<\/script>/g)!.length).toBe(vorlage().match(/<\/script>/g)!.length);
    const roh = html.match(/<script type="application\/json" id="daten">([\s\S]*?)<\/script>/)![1]!;
    expect(JSON.parse(roh).marke.look).toContain("</script><script>alert(1)");
    expect(jsonFuerScript({ a: "<" })).toBe('{"a":"\\u003c"}');
  });

  it("verlangt den Datenblock in der Vorlage", () => {
    expect(() => setzeDatenEin("<p>nichts</p>", baueDaten({ bibliothek: { stuecke: [], befunde: [] }, marke: null, notion: notion(), jetzt: "x" }))).toThrow(/Datenblock|id="daten"/);
  });

  it("die Vorlage hält die Regeln der Seite ein: nur erlaubte Hosts, keine Icons, kein Emoji, Du-Form ohne ß", () => {
    const v = vorlage();
    const hosts = [...v.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1]!.toLowerCase());
    expect([...new Set(hosts)].sort()).toEqual(["fonts.googleapis.com", "fonts.gstatic.com"]);
    expect(v).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(v).not.toContain("ß");
    expect(v).not.toMatch(/\b(alert|confirm|prompt)\(/);
    expect(v).toContain('<meta name="claude:viewport-fit-sides" content="cover">');
    expect(v).toMatch(/padding-left:\s*max\(var\(--gutter\)/);
  });
});
