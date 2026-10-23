import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ausgabeDatei, ausgabeName, loeseOrdnerAuf, pruefeAusgabeNamen, sammleFotos, type Wurzel } from "./ordner";

let tmp: string;
let medien: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "studio-ordner-"));
  medien = path.join(tmp, "Medien");
  fs.mkdirSync(medien);
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const datei = (...teile: string[]): void => {
  const p = path.join(...teile);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, "x");
};

const nurMedien = (): Wurzel[] => [{ name: "medien", pfad: medien }];

describe("loeseOrdnerAuf", () => {
  it("relative Angaben gelten ab der Wurzel; Wurzel und relativer Pfad kommen mit", () => {
    fs.mkdirSync(path.join(medien, "fotos", "kunde-a"), { recursive: true });
    expect(loeseOrdnerAuf("fotos/kunde-a", nurMedien())).toEqual({ abs: fs.realpathSync(path.join(medien, "fotos", "kunde-a")), wurzel: "medien", rel: "fotos/kunde-a" });
  });

  it("absolute Angaben sind erlaubt, wenn sie in der Wurzel liegen", () => {
    const ziel = path.join(medien, "x");
    fs.mkdirSync(ziel);
    expect(loeseOrdnerAuf(ziel, nurMedien()).abs).toBe(fs.realpathSync(ziel));
  });

  it("die Wurzel selbst heisst «.»", () => {
    expect(loeseOrdnerAuf(medien, nurMedien())).toMatchObject({ rel: ".", wurzel: "medien" });
  });

  it("ein Ordner ausserhalb der Wurzel wird abgelehnt, auch mit «..»", () => {
    fs.mkdirSync(path.join(tmp, "anderswo"));
    expect(() => loeseOrdnerAuf(path.join(tmp, "anderswo"), nurMedien())).toThrow(/nicht im Studio- oder Medien-Ordner/);
    expect(() => loeseOrdnerAuf("../anderswo", nurMedien())).toThrow(/nicht im Studio- oder Medien-Ordner/);
  });

  it("eine Verknüpfung, die aus der Wurzel hinausführt, wird abgelehnt", () => {
    fs.mkdirSync(path.join(tmp, "geheim"));
    fs.symlinkSync(path.join(tmp, "geheim"), path.join(medien, "abkuerzung"));
    expect(() => loeseOrdnerAuf("abkuerzung", nurMedien())).toThrow(/nicht im Studio- oder Medien-Ordner/);
  });

  it("ein Ordner, dessen Name nur mit dem der Wurzel beginnt, zählt nicht als darin (Medien2 neben Medien)", () => {
    fs.mkdirSync(path.join(tmp, "Medien2"));
    expect(() => loeseOrdnerAuf(path.join(tmp, "Medien2"), nurMedien())).toThrow(/nicht im Studio- oder Medien-Ordner/);
  });

  it("eine Datei, ein fehlender Ordner und eine leere Angabe sind Fehler", () => {
    datei(medien, "a.jpg");
    expect(() => loeseOrdnerAuf("a.jpg", nurMedien())).toThrow(/kein Ordner/);
    expect(() => loeseOrdnerAuf("gibt-es-nicht", nurMedien())).toThrow(/nicht gefunden/);
    expect(() => loeseOrdnerAuf("  ", nurMedien())).toThrow(/fehlt/);
  });

  it("fehlt jede Wurzel, sagt die Meldung, welche gesucht wurden", () => {
    expect(() => loeseOrdnerAuf("x", [{ name: "studio", pfad: path.join(tmp, "nirgends") }])).toThrow(/Weder der Studio-Ordner noch der Medien-Ordner.*nirgends/);
  });

  it("Umlaute im Pfad kommen normalisiert (NFC) zurück", () => {
    // die Eingabe (zum Beispiel aus dem Terminal auf dem Mac) kommt zerlegt (NFD), der Ordner heisst in NFC
    fs.mkdirSync(path.join(medien, "Küche".normalize("NFC")));
    expect(loeseOrdnerAuf("Küche".normalize("NFD"), nurMedien()).rel).toBe("Küche".normalize("NFC"));
  });

  describe("Studio-Ordner und eigener Medien-Ordner", () => {
    let studio: string;
    const beide = (): Wurzel[] => [
      { name: "studio", pfad: studio },
      { name: "medien", pfad: medien },
    ];
    beforeEach(() => {
      studio = path.join(tmp, "Studio");
      fs.mkdirSync(studio);
    });

    it("relative Angaben gelten zuerst im Studio-Ordner (so nennt es das Tool)", () => {
      fs.mkdirSync(path.join(studio, "Fotos", "Herbst"), { recursive: true });
      fs.mkdirSync(path.join(medien, "Fotos", "Herbst"), { recursive: true });
      expect(loeseOrdnerAuf("Fotos/Herbst", beide())).toMatchObject({ wurzel: "studio", rel: "Fotos/Herbst" });
    });

    it("fehlt der Ordner im Studio-Ordner, wird im Medien-Ordner gesucht", () => {
      fs.mkdirSync(path.join(medien, "rohmaterial", "c-1000"), { recursive: true });
      expect(loeseOrdnerAuf("rohmaterial/c-1000", beide())).toMatchObject({ wurzel: "medien", rel: "rohmaterial/c-1000" });
    });

    it("absolute Angaben im Medien-Ordner sind erlaubt, ausserhalb beider nicht", () => {
      fs.mkdirSync(path.join(medien, "a"));
      fs.mkdirSync(path.join(tmp, "draussen"));
      expect(loeseOrdnerAuf(path.join(medien, "a"), beide())).toMatchObject({ wurzel: "medien", rel: "a" });
      expect(() => loeseOrdnerAuf(path.join(tmp, "draussen"), beide())).toThrow(/nicht im Studio- oder Medien-Ordner/);
    });

    it("eine Verknüpfung im Studio-Ordner, die nach draussen führt, wird abgelehnt, auch wenn der Medien-Ordner einen gleichnamigen Ordner hat", () => {
      fs.mkdirSync(path.join(tmp, "geheim"));
      fs.symlinkSync(path.join(tmp, "geheim"), path.join(studio, "x"));
      expect(() => loeseOrdnerAuf("x", beide())).toThrow(/nicht im Studio- oder Medien-Ordner/);
      fs.mkdirSync(path.join(medien, "x"));
      // der Medien-Ordner hat ihn wirklich: dann gilt der
      expect(loeseOrdnerAuf("x", beide())).toMatchObject({ wurzel: "medien" });
    });

    it("sind beide Wurzeln derselbe Ordner, zählt nur «studio»", () => {
      fs.mkdirSync(path.join(studio, "f"));
      expect(loeseOrdnerAuf("f", [{ name: "studio", pfad: studio }, { name: "medien", pfad: studio }])).toMatchObject({ wurzel: "studio" });
    });

    it("ein fehlender Medien-Ordner stört nicht, solange der Studio-Ordner da ist", () => {
      fs.mkdirSync(path.join(studio, "f"));
      expect(loeseOrdnerAuf("f", [{ name: "studio", pfad: studio }, { name: "medien", pfad: path.join(tmp, "Laufwerk-fehlt") }])).toMatchObject({ wurzel: "studio" });
    });

    it("die Meldung bei einem unbekannten Ordner nennt beide Orte", () => {
      expect(() => loeseOrdnerAuf("gibt-es-nicht", beide())).toThrow(/gesucht im Studio-Ordner und im Medien-Ordner/);
    });
  });
});

describe("sammleFotos", () => {
  it("findet JPEG in Unterordnern, sortiert, mit allen Schreibweisen der Endung", () => {
    datei(medien, "b.jpg");
    datei(medien, "a.JPEG");
    datei(medien, "tag2", "c.jpeg");
    datei(medien, "tag1", "d.JPG");
    expect(sammleFotos(medien).fotos).toEqual(["a.JPEG", "b.jpg", "tag1/d.JPG", "tag2/c.jpeg"]);
  });

  it("betritt keine versteckten Ordner, keine Ordner mit «_» und keine früheren Ergebnisse", () => {
    datei(medien, "ok.jpg");
    datei(medien, ".versteckt", "a.jpg");
    datei(medien, "_alt", "b.jpg");
    datei(medien, ausgabeName("warmes-licht"), "ok.jpg");
    expect(sammleFotos(medien).fotos).toEqual(["ok.jpg"]);
  });

  it("überspringt versteckte Dateien (zum Beispiel ._IMG.jpg von macOS)", () => {
    datei(medien, "._a.jpg");
    datei(medien, "a.jpg");
    expect(sammleFotos(medien).fotos).toEqual(["a.jpg"]);
  });

  it("folgt keiner Verknüpfung und sagt, dass sie übersprungen wurde", () => {
    fs.mkdirSync(path.join(tmp, "draussen"));
    datei(tmp, "draussen", "geheim.jpg");
    fs.symlinkSync(path.join(tmp, "draussen", "geheim.jpg"), path.join(medien, "link.jpg"));
    fs.symlinkSync(path.join(tmp, "draussen"), path.join(medien, "ordner-link"));
    const r = sammleFotos(medien);
    expect(r.fotos).toEqual([]);
    expect(r.uebersprungen.map((u) => u.datei)).toEqual(["link.jpg"]);
    expect(r.uebersprungen[0]!.grund).toMatch(/Verknüpfung/);
  });

  it("andere Bildformate stehen als übersprungen mit dem Grund, ohne sie zu lesen", () => {
    datei(medien, "a.jpg");
    datei(medien, "b.RW2");
    datei(medien, "c.heic");
    datei(medien, "d.txt");
    const r = sammleFotos(medien);
    expect(r.fotos).toEqual(["a.jpg"]);
    expect(r.uebersprungen.map((u) => u.datei).sort()).toEqual(["b.RW2", "c.heic"]);
    expect(r.uebersprungen[0]!.grund).toMatch(/nur JPEG/);
  });

  it("Dateinamen mit Umlauten kommen normalisiert (NFC) zurück", () => {
    datei(medien, "Küche.jpg".normalize("NFD"));
    expect(sammleFotos(medien).fotos).toEqual(["Küche.jpg".normalize("NFC")]);
  });
});

describe("Ausgabenamen", () => {
  it("die Ausgabe heisst wie das Foto, mit der Endung .jpg", () => {
    expect(ausgabeDatei("tag1/IMG_0001.JPG")).toBe("tag1/IMG_0001.jpg");
    expect(ausgabeDatei("a.jpeg")).toBe("a.jpg");
    expect(ausgabeName("klare-luft")).toBe("bearbeitet-klare-luft");
  });

  it("zwei Fotos mit demselben Ergebnis sind ein Fehler, vorher", () => {
    expect(() => pruefeAusgabeNamen(["a.jpg", "a.jpeg"])).toThrow(/dieselbe Datei/);
    expect(() => pruefeAusgabeNamen(["a.jpg", "B.jpg", "t/a.jpg"])).not.toThrow();
  });
});
