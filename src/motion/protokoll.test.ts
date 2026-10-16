import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Ereignis } from "../core/schemas";
import { entwurf, JETZT, looks, MENSCH, pitch, SPAETER, SYSTEM } from "../testing/fixtures";
import { Ideenprotokoll, KonfliktFehler, ProtokollFehler } from "./protokoll";

let dir: string;
let pr: Ideenprotokoll;
const ereignisse = () => fs.readFileSync(path.join(dir, "e.jsonl"), "utf8").trim().split("\n").map((l) => Ereignis.parse(JSON.parse(l)));

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-proto-"));
  pr = new Ideenprotokoll(path.join(dir, "ideen.json"), path.join(dir, "e.jsonl"));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("Ideenprotokoll: Speichern", () => {
  it("vergibt fortlaufende IDs und zählt die Version hoch", () => {
    expect(pr.neu(entwurf(), SYSTEM, JETZT).id).toBe("m-001");
    expect(pr.neu(entwurf(), SYSTEM, JETZT).id).toBe("m-002");
    expect(pr.lade()).toMatchObject({ version: 2 });
    expect(pr.lade().ideen.map((i) => i.id)).toEqual(["m-001", "m-002"]);
  });

  it("vergibt keine ID doppelt, auch wenn eine Idee in der Mitte fehlt", () => {
    pr.neu(entwurf(), SYSTEM, JETZT);
    pr.neu(entwurf(), SYSTEM, JETZT);
    const z = pr.lade();
    pr.speichere({ version: z.version, ideen: [z.ideen[1]!] });
    expect(pr.neu(entwurf(), SYSTEM, JETZT).id).toBe("m-003");
  });

  it("bricht bei gleichzeitiger Änderung ab, statt still zu überschreiben", () => {
    pr.neu(entwurf(), SYSTEM, JETZT);
    const meins = pr.lade();
    pr.neu(entwurf(), SYSTEM, JETZT); // jemand anderes speichert dazwischen
    expect(() => pr.speichere({ version: meins.version, ideen: meins.ideen })).toThrow(KonfliktFehler);
    expect(pr.lade().ideen).toHaveLength(2);
  });

  it("hinterlässt keine temporären Dateien", () => {
    pr.neu(entwurf(), SYSTEM, JETZT);
    expect(fs.readdirSync(dir).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });

  it("meldet eine kaputte oder fremde Datei mit Grund und überschreibt sie nicht", () => {
    const datei = path.join(dir, "ideen.json");
    fs.writeFileSync(datei, "{nope");
    expect(() => pr.lade()).toThrow(ProtokollFehler);
    fs.writeFileSync(datei, JSON.stringify({ schema: 1, version: 1, ideen: [{ id: "m-001" }] }));
    expect(() => pr.lade()).toThrow(/Ideen-Schema/);
    expect(() => pr.neu(entwurf(), SYSTEM, JETZT)).toThrow(ProtokollFehler);
    expect(fs.readFileSync(datei, "utf8")).toContain('"m-001"');
  });

  it("holen und liste filtern nach Status", () => {
    pr.neu(entwurf(), SYSTEM, JETZT);
    pr.weiter("m-001", "pitch", SYSTEM, JETZT, { daten: { pitch: pitch() } });
    pr.neu(entwurf(), SYSTEM, JETZT);
    expect(pr.liste({ status: "pitch" }).map((i) => i.id)).toEqual(["m-001"]);
    expect(pr.liste({ status: ["idee", "pitch"] })).toHaveLength(2);
    expect(() => pr.holen("m-099")).toThrow("existiert nicht");
  });
});

describe("Ideenprotokoll: Übergänge", () => {
  it("erzwingt die Gates auch über den Speicher", () => {
    pr.neu(entwurf(), SYSTEM, JETZT);
    pr.weiter("m-001", "pitch", SYSTEM, JETZT, { daten: { pitch: pitch() } });
    expect(() => pr.weiter("m-001", "freigegeben", SYSTEM, JETZT)).toThrow(/nur ein Mensch/);
    expect(pr.holen("m-001").status).toBe("pitch");
    pr.weiter("m-001", "freigegeben", MENSCH, JETZT);
    expect(() => pr.weiter("m-001", "in_bau", SYSTEM, JETZT, { daten: { stueck: "wert-verlauf" } })).toThrow(/nicht vorgesehen/);
  });

  it("zählt Pitches und Bauten der anderen Ideen für die Limits", () => {
    for (let n = 0; n < 6; n++) pr.neu(entwurf(), SYSTEM, JETZT);
    for (let n = 1; n <= 5; n++) pr.weiter(`m-00${n}`, "pitch", SYSTEM, JETZT, { daten: { pitch: pitch() } });
    expect(() => pr.weiter("m-006", "pitch", SYSTEM, JETZT, { daten: { pitch: pitch() } })).toThrow(/5 Pitches liegen schon/);
    pr.weiter("m-001", "abgelehnt", MENSCH, JETZT, { grund: "Zu speziell für uns" });
    expect(pr.weiter("m-006", "pitch", SYSTEM, JETZT, { daten: { pitch: pitch() } }).status).toBe("pitch");
  });

  it("begrenzt parallele Bauten über alle Ideen", () => {
    const weg = (id: string) => {
      pr.weiter(id, "pitch", SYSTEM, JETZT, { daten: { pitch: pitch() } });
      pr.weiter(id, "freigegeben", MENSCH, JETZT);
      pr.weiter(id, "looks", SYSTEM, JETZT, { daten: { looks: looks() } });
      pr.weiter(id, "look_gewaehlt", MENSCH, JETZT, { daten: { gewaehlt: "a" } });
    };
    for (let n = 0; n < 3; n++) {
      pr.neu(entwurf(), SYSTEM, JETZT);
      weg(`m-00${n + 1}`);
    }
    pr.weiter("m-001", "in_bau", SYSTEM, JETZT, { daten: { stueck: "stueck-eins" } });
    pr.weiter("m-002", "in_bau", SYSTEM, JETZT, { daten: { stueck: "stueck-zwei" } });
    expect(() => pr.weiter("m-003", "in_bau", SYSTEM, JETZT, { daten: { stueck: "stueck-drei" } })).toThrow(/schon im Bau/);
  });

  it("Selbstprüfung wird erfasst und führt zu «render_geprueft»", () => {
    pr.neu(entwurf(), SYSTEM, JETZT);
    pr.weiter("m-001", "pitch", SYSTEM, JETZT, { daten: { pitch: pitch() } });
    pr.weiter("m-001", "freigegeben", MENSCH, JETZT);
    pr.weiter("m-001", "looks", SYSTEM, JETZT, { daten: { looks: looks() } });
    pr.weiter("m-001", "look_gewaehlt", MENSCH, JETZT, { daten: { gewaehlt: "c" } });
    pr.weiter("m-001", "in_bau", SYSTEM, JETZT, { daten: { stueck: "wert-verlauf" } });
    const r1 = pr.pruefung("m-001", { am: JETZT, bestanden: false, befunde: [{ stufe: "fehler", code: "leer", text: "Render ist leer" }] }, SYSTEM);
    expect(r1).toMatchObject({ bestanden: false, naechsteKorrekturErlaubt: true });
    expect(() => pr.weiter("m-001", "render_geprueft", SYSTEM, JETZT)).toThrow(/nicht bestanden/);
    pr.pruefung("m-001", { am: SPAETER, bestanden: true, befunde: [] }, SYSTEM);
    expect(pr.weiter("m-001", "render_geprueft", SYSTEM, SPAETER).status).toBe("render_geprueft");
    expect(pr.holen("m-001").bau?.pruefungen.map((p) => p.bestanden)).toEqual([false, true]);
  });
});

describe("Ideenprotokoll: Ereignisse als Lernsignale", () => {
  it("schreibt Entscheide als gültige Ereignisse mit Grund", () => {
    pr.neu(entwurf(), SYSTEM, JETZT);
    pr.weiter("m-001", "pitch", SYSTEM, JETZT, { daten: { pitch: pitch() } });
    pr.weiter("m-001", "abgelehnt", MENSCH, SPAETER, { grund: "Zu speziell, kommt einmal im Jahr vor" });
    const e = ereignisse();
    expect(e.map((x) => `${x.stufe}:${x.art}`)).toEqual(["motion-idee:bestaetigt", "motion-pitch:bestaetigt", "motion-pitch:abgelehnt"]);
    expect(e[2]).toMatchObject({ projekt: "P-023", wer: MENSCH, detail: { idee: "m-001", grund: "Zu speziell, kommt einmal im Jahr vor", vonStatus: "pitch" } });
  });

  it("hält die Wahl des Looks samt Notiz fest", () => {
    pr.neu(entwurf(), SYSTEM, JETZT);
    pr.weiter("m-001", "pitch", SYSTEM, JETZT, { daten: { pitch: pitch() } });
    pr.weiter("m-001", "freigegeben", MENSCH, JETZT);
    pr.weiter("m-001", "looks", SYSTEM, JETZT, { daten: { looks: looks() } });
    pr.weiter("m-001", "look_gewaehlt", MENSCH, JETZT, { daten: { gewaehlt: "b", notizen: ["Linie dünner"] } });
    const letzte = ereignisse().at(-1)!;
    expect(letzte).toMatchObject({ stufe: "motion-looks", art: "look-gewaehlt", detail: { gewaehlt: "b", notizen: ["Linie dünner"] } });
  });

  it("schreibt nichts, wenn kein Ereignis-Pfad gesetzt ist", () => {
    const ohne = new Ideenprotokoll(path.join(dir, "x.json"));
    ohne.neu(entwurf(), SYSTEM, JETZT);
    expect(fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl"))).toEqual([]);
    expect(fs.readdirSync(dir)).toContain("x.json");
  });

  it("ein misslungener Übergang schreibt kein Ereignis", () => {
    pr.neu(entwurf(), SYSTEM, JETZT);
    const vorher = ereignisse().length;
    expect(() => pr.weiter("m-001", "freigegeben", MENSCH, JETZT)).toThrow();
    expect(ereignisse()).toHaveLength(vorher);
  });
});

describe("Ideenprotokoll: Idee schärfen", () => {
  it("ändert Titel, Beschreibung und Zusammenfassung im Status «idee» und merkt sich das als Ereignis", () => {
    pr.neu(entwurf(), SYSTEM, JETZT);
    const i = pr.bearbeite("m-001", { titel: "Mess-Verlauf", beschreibung: "Eine Linie über mehrere Messungen mit beschriftetem Anfangs- und Endwert." }, SYSTEM, SPAETER);
    expect(i).toMatchObject({ titel: "Mess-Verlauf", beschreibung: expect.stringContaining("Linie") });
    expect(i.quelle).toMatchObject({ satz: expect.stringContaining("97 auf 60") }); // der genaue Satz bleibt unangetastet
    expect(ereignisse().at(-1)).toMatchObject({ art: "text-geaendert", detail: { felder: ["titel", "beschreibung"] } });
  });

  it("sobald ein Pitch vorliegt, ist Schluss: Der Mensch entscheidet über genau diesen Text", () => {
    pr.neu(entwurf(), SYSTEM, JETZT);
    pr.weiter("m-001", "pitch", SYSTEM, JETZT, { daten: { pitch: pitch() } });
    expect(() => pr.bearbeite("m-001", { titel: "Anderer Titel" }, SYSTEM, JETZT)).toThrow(/nur im Status «idee»/);
    expect(pr.holen("m-001").titel).toBe("Wert-Verlauf");
  });

  it("lehnt ungültige Änderungen ab und lässt die Idee unberührt", () => {
    pr.neu(entwurf(), SYSTEM, JETZT);
    expect(() => pr.bearbeite("m-001", { titel: "x" }, SYSTEM, JETZT)).toThrow(/Änderung ungültig/);
    expect(pr.holen("m-001").titel).toBe("Wert-Verlauf");
  });
});
