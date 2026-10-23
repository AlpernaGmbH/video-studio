import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Markenprofil } from "../core/schemas";
import { ladeFotoLooks, looksFuerMuster, markenLook, MARKEN_LOOK_ID, MAX_LOOKS, FotoLook } from "./looks";

const root = path.resolve(import.meta.dirname, "..", "..");
const ablage = path.join(root, "library", "foto-looks");
const marke = (name: string): Markenprofil => Markenprofil.parse(JSON.parse(fs.readFileSync(path.join(root, "marken", `${name}.json`), "utf8")));

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "studio-looks-"));
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const gueltig = (id: string): Record<string, unknown> => ({
  id,
  name: id,
  stimmung: "Test",
  herkunft: "Test",
  farblook: { gamma: 1, kontrast: 0.2, saettigung: 1, kuehle: 0 },
});
const schreibe = (name: string, inhalt: unknown): void => fs.writeFileSync(path.join(tmp, name), typeof inhalt === "string" ? inhalt : JSON.stringify(inhalt));

describe("mitgelieferte Foto-Looks", () => {
  const looks = ladeFotoLooks(ablage);

  it("es sind fünf, jede id passt zum Dateinamen, jeder Look nennt seine Herkunft", () => {
    expect(looks.map((l) => l.id)).toEqual(["klare-kante", "klare-luft", "leiser-film", "stiller-morgen", "warmes-licht"]);
    for (const l of looks) {
      expect(l.herkunft).toMatch(/Vorschlag/);
      expect(l.herkunft).toMatch(/nicht belegt/);
    }
  });

  it("die fünf unterscheiden sich in dem, was das Bild bestimmt (keine zwei gleichen Rezepte)", () => {
    const schluessel = looks.map((l) => JSON.stringify({ f: l.farblook, p: l.farbpaar, k: l.korn }));
    expect(new Set(schluessel).size).toBe(looks.length);
  });

  it("Farbpaar und Korn kommen vor (die Rezeptteile Farbe und Textur)", () => {
    expect(looks.some((l) => l.farbpaar)).toBe(true);
    expect(looks.some((l) => l.korn > 0)).toBe(true);
  });
});

describe("ladeFotoLooks", () => {
  it("eine fehlende Ablage ist leer, kein Fehler", () => {
    expect(ladeFotoLooks(path.join(tmp, "gibt-es-nicht"))).toEqual([]);
  });

  it("ein ungültiger Look nennt Datei und Feld", () => {
    schreibe("kaputt.json", { ...gueltig("kaputt"), farblook: { gamma: 9 } });
    expect(() => ladeFotoLooks(tmp)).toThrow(/kaputt\.json.*farblook\.gamma/);
  });

  it("die id muss dem Dateinamen entsprechen", () => {
    schreibe("a.json", gueltig("b"));
    expect(() => ladeFotoLooks(tmp)).toThrow(/Dateinamen/);
  });

  it("«marke» ist für den Look der Marke reserviert", () => {
    schreibe("marke.json", gueltig(MARKEN_LOOK_ID));
    expect(() => ladeFotoLooks(tmp)).toThrow(/reserviert/);
  });

  it("unbekannte Felder werden abgelehnt (ein Tippfehler im Namen eines Feldes wird nicht still überhört)", () => {
    schreibe("x.json", { ...gueltig("x"), farbpar: {} });
    expect(() => ladeFotoLooks(tmp)).toThrow(/x\.json/);
  });

  it("Dateien mit «_» am Anfang und andere Endungen werden übergangen", () => {
    schreibe("_vorlage.json", "kein json");
    schreibe("notiz.txt", "nur ein Text");
    schreibe("ok.json", gueltig("ok"));
    expect(ladeFotoLooks(tmp).map((l) => l.id)).toEqual(["ok"]);
  });
});

describe("Look der Marke und Looks eines Musters", () => {
  it("Alperna hat einen Look über der V-Log-Basis, er kommt zuerst", () => {
    const m = markenLook(marke("alperna"));
    expect(m?.id).toBe(MARKEN_LOOK_ID);
    expect(m?.herkunft).toMatch(/farbe\.vlog/);
    const alle = looksFuerMuster(marke("alperna"), ladeFotoLooks(ablage));
    expect(alle.map((l) => l.id)).toEqual([MARKEN_LOOK_ID, "klare-kante", "klare-luft", "leiser-film", "stiller-morgen", "warmes-licht"]);
  });

  it("eine Marke ohne Look zeigt nur die Ablage", () => {
    const ohne = marke("nordlicht");
    expect(markenLook(ohne)).toBeUndefined();
    expect(looksFuerMuster(ohne, ladeFotoLooks(ablage))).toHaveLength(5);
  });

  it("ohne jeden Look gibt es keinen Bogen", () => {
    expect(() => looksFuerMuster(marke("nordlicht"), [])).toThrow(/keinen Foto-Look/);
  });

  it("zu viele Looks ergeben keinen lesbaren Bogen", () => {
    const viele = Array.from({ length: MAX_LOOKS + 1 }, (_, i) => FotoLook.parse(gueltig(`l${i}`)));
    expect(() => looksFuerMuster(marke("nordlicht"), viele)).toThrow(/Höchstens/);
  });
});
