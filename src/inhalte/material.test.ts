import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { haengeAn, liesMaterial, MATERIAL_MAX_ZEICHEN, materialFehlt, pruefeVorhanden, pruefeZiel, schreibeMaterial } from "./material";

describe("Material lesen und schreiben", () => {
  it("liest Art, Ziel und Notiz je Zeile", () => {
    const l = liesMaterial("Footage: rohmaterial/hofer/empfang 01.mov | Empfang, Totale\nFoto: https://onedrive.test/s/abc");
    expect(l).toEqual([
      { art: "Footage", ziel: "rohmaterial/hofer/empfang 01.mov", notiz: "Empfang, Totale" },
      { art: "Foto", ziel: "https://onedrive.test/s/abc", notiz: "" },
    ]);
  });

  it("lässt Zeilen ohne bekannte Art unverändert, damit nichts verloren geht", () => {
    const text = "reel-final.mp4\nFootage: rohmaterial/a.mov";
    expect(liesMaterial(text)[0]).toEqual({ art: "", ziel: "reel-final.mp4", notiz: "" });
    expect(schreibeMaterial(liesMaterial(text))).toBe(text);
  });

  it("schreibt wieder, was es liest (Lesen und Schreiben sind umkehrbar)", () => {
    const text = "Footage: rohmaterial/a.mov | erste Aufnahme\nRender: renders/c-0007.mp4\nSonstiges: https://x.test/y | Moodboard | mit Strich";
    expect(schreibeMaterial(liesMaterial(text))).toBe(text);
  });

  it("ein Zeilenumbruch in der Notiz wird zu einem Leerzeichen, sonst würde eine Zeile zu zwei", () => {
    expect(schreibeMaterial([{ art: "Foto", ziel: "a.jpg", notiz: "oben\nunten" }])).toBe("Foto: a.jpg | oben unten");
  });

  it("leerer Text gibt keine Einträge", () => {
    expect(liesMaterial("")).toEqual([]);
    expect(liesMaterial("  \n \n")).toEqual([]);
  });
});

describe("Ziel prüfen", () => {
  it("nimmt einen Pfad relativ zu Studio, mit Schrägstrichen und NFC", () => {
    const nfd = "rohmaterial/Pra\u0308xis/clip.mov"; // «ä» zerlegt, wie macOS es liefert
    const r = pruefeZiel(nfd);
    expect(r).toEqual({ ok: true, ziel: "rohmaterial/Pr\u00e4xis/clip.mov", link: false });
    expect(pruefeZiel("rohmaterial\\a\\b.mov")).toEqual({ ok: true, ziel: "rohmaterial/a/b.mov", link: false });
  });

  it("lässt ein führendes «Studio/» weg", () => {
    expect(pruefeZiel("Studio/rohmaterial/a.mov")).toEqual({ ok: true, ziel: "rohmaterial/a.mov", link: false });
  });

  it("lehnt absolute Pfade, Benutzerordner und Ausbrüche ab", () => {
    for (const roh of ["/Users/andrej/Movies/a.mov", "C:\\Users\\a.mov", "~/Movies/a.mov", "../a.mov", "rohmaterial/../../a.mov"]) {
      expect(pruefeZiel(roh).ok, roh).toBe(false);
    }
  });

  it("lässt https-Links zu, aber kein http, keine Leerzeichen und keine anderen Schemata", () => {
    expect(pruefeZiel("https://onedrive.test/s/abc?e=1")).toEqual({ ok: true, ziel: "https://onedrive.test/s/abc?e=1", link: true });
    expect(pruefeZiel("http://x.test/a").ok).toBe(false);
    expect(pruefeZiel("https://x.test/mit leerzeichen").ok).toBe(false);
    expect(pruefeZiel("file:///Users/a").ok).toBe(false);
    expect(pruefeZiel("ftp://x.test/a").ok).toBe(false);
  });

  it("lehnt den Trenner «|», leere und zu lange Ziele ab", () => {
    expect(pruefeZiel("a|b.mov").ok).toBe(false);
    expect(pruefeZiel("   ").ok).toBe(false);
    expect(pruefeZiel("a/".padEnd(401, "x")).ok).toBe(false);
  });
});

describe("Anhängen", () => {
  it("hängt an und prüft das Ziel", () => {
    expect(haengeAn("", "Footage", "Studio/rohmaterial/a.mov", " Totale ")).toBe("Footage: rohmaterial/a.mov | Totale");
    expect(haengeAn("Foto: b.jpg", "Footage", "rohmaterial/a.mov")).toBe("Foto: b.jpg\nFootage: rohmaterial/a.mov");
    expect(() => haengeAn("", "Footage", "/Users/x/a.mov")).toThrow(/relativ/);
  });

  it("verweigert, wenn das Feld über 1900 Zeichen käme (Notion schneidet bei 2000 ab)", () => {
    let t = "";
    expect(() => {
      for (let i = 0; i < 40; i++) t = haengeAn(t, "Footage", `rohmaterial/${"x".repeat(60)}-${i}.mov`, "Notiz");
    }).toThrow(/voll/);
    expect(t.length).toBeLessThanOrEqual(MATERIAL_MAX_ZEICHEN);
  });
});

describe("Fehlendes Material", () => {
  it("«Dreh nötig» ohne Footage oder Foto fehlt", () => {
    expect(materialFehlt({ aufwand: "Dreh nötig", dateien: "" })).toBe(true);
    expect(materialFehlt({ aufwand: "Dreh nötig", dateien: "Skript: s.md\nLogo: l.svg" })).toBe(true);
    expect(materialFehlt({ aufwand: "Dreh nötig", dateien: "Footage: rohmaterial/a.mov" })).toBe(false);
    expect(materialFehlt({ aufwand: "Dreh nötig", dateien: "Foto: https://x.test/a" })).toBe(false);
  });

  it("andere Aufwände brauchen kein Material, und eine freie Zeile zählt nicht als Footage", () => {
    expect(materialFehlt({ aufwand: "Nur Text", dateien: "" })).toBe(false);
    expect(materialFehlt({ aufwand: "Nur Katalog", dateien: "" })).toBe(false);
    expect(materialFehlt({ aufwand: undefined, dateien: "" })).toBe(false);
    expect(materialFehlt({ aufwand: "Dreh nötig", dateien: "Footage ist unterwegs" })).toBe(true);
  });
});

describe("Auf dem Rechner prüfen", () => {
  const tmp: string[] = [];
  afterEach(() => { for (const d of tmp.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });
  const ordner = (): string => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "material-")); tmp.push(d); return d; };

  it("meldet vorhanden, fehlend und nicht prüfbar (Link)", () => {
    const studio = ordner();
    fs.mkdirSync(path.join(studio, "rohmaterial"), { recursive: true });
    fs.writeFileSync(path.join(studio, "rohmaterial", "a.mov"), Buffer.alloc(2 * 1024 * 1024));
    const r = pruefeVorhanden(liesMaterial("Footage: rohmaterial/a.mov\nFootage: rohmaterial/fehlt.mov\nFoto: https://x.test/a\nSkript: ordner-ohne-datei"), studio);
    expect(r.map((x) => x.vorhanden)).toEqual([true, false, null, false]);
    expect(r[0]?.megabyte).toBe(2);
  });

  it("sucht grosse Ordner im Medien-Ordner, wenn es einen gibt", () => {
    const studio = ordner();
    const medien = ordner();
    fs.mkdirSync(path.join(medien, "rohmaterial"), { recursive: true });
    fs.writeFileSync(path.join(medien, "rohmaterial", "a.mov"), "x");
    fs.mkdirSync(path.join(studio, "daten"), { recursive: true });
    fs.writeFileSync(path.join(studio, "daten", "skript.md"), "x");
    const r = pruefeVorhanden(liesMaterial("Footage: rohmaterial/a.mov\nSkript: daten/skript.md"), studio, medien);
    expect(r.map((x) => x.vorhanden)).toEqual([true, true]);
    // ohne Medien-Ordner liegt rohmaterial im Studio-Ordner: dort fehlt die Datei
    expect(pruefeVorhanden(liesMaterial("Footage: rohmaterial/a.mov"), studio)[0]?.vorhanden).toBe(false);
  });

  it("ein Pfad, der ausbricht, gilt als nicht vorhanden und liest nichts ausserhalb", () => {
    const studio = ordner();
    const aussen = path.join(path.dirname(studio), "aussen.txt");
    fs.writeFileSync(aussen, "x");
    tmp.push(aussen);
    expect(pruefeVorhanden([{ art: "Footage", ziel: "../aussen.txt", notiz: "" }], studio)[0]?.vorhanden).toBe(false);
  });
});

describe("Die Seite rechnet wie das Modul", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "..", "pruefplatz", "index.html"), "utf8");
  const block = /\/\* MATERIAL-START \*\/([\s\S]*?)\/\* MATERIAL-ENDE \*\//.exec(html);

  it("die Seite enthält den markierten Block", () => {
    expect(block).not.toBeNull();
  });

  const seite = block
    ? (new Function(`${block[1]}; return { liesMaterial, schreibeMaterial, pruefeZiel, haengeAn, materialFehlt, MATERIAL_ARTEN_MENSCH };`)() as {
        liesMaterial: typeof liesMaterial;
        schreibeMaterial: typeof schreibeMaterial;
        pruefeZiel: typeof pruefeZiel;
        haengeAn: typeof haengeAn;
        materialFehlt: typeof materialFehlt;
        MATERIAL_ARTEN_MENSCH: string[];
      })
    : null;

  const texte = [
    "",
    "Footage: rohmaterial/a.mov | Totale",
    "reel-final.mp4\nFootage: rohmaterial/a b.mov\nFoto: https://x.test/a | mit | Strich",
    "Render: renders/c-0007.mp4\nSonstiges: x",
  ];
  const ziele = [
    "rohmaterial/a.mov", "Studio/rohmaterial/a.mov", "rohmaterial\\a\\b.mov", "rohmaterial/Pra\u0308xis/c.mov", "/Users/a/b.mov", "C:\\a.mov", "~/a", "../a", "a/../../b",
    "http://x.test/a", "https://x.test/a", "https://x.test/mit leerzeichen", "file:///a", "a|b", "", "   ", "a".repeat(401),
  ];

  it("lesen und schreiben stimmen überein", () => {
    for (const t of texte) {
      expect(seite!.liesMaterial(t), t).toEqual(liesMaterial(t));
      expect(seite!.schreibeMaterial(seite!.liesMaterial(t)), t).toBe(schreibeMaterial(liesMaterial(t)));
    }
  });

  it("die Prüfung des Ziels stimmt überein, Fehlertext eingeschlossen", () => {
    for (const z of ziele) expect(seite!.pruefeZiel(z), JSON.stringify(z)).toEqual(pruefeZiel(z));
  });

  it("Anhängen und «Material fehlt» stimmen überein", () => {
    for (const t of texte) {
      expect(seite!.haengeAn(t, "Footage", "rohmaterial/neu.mov", " Notiz "), t).toBe(haengeAn(t, "Footage", "rohmaterial/neu.mov", " Notiz "));
      for (const aufwand of ["Dreh nötig", "Nur Text", undefined]) expect(seite!.materialFehlt({ aufwand, dateien: t })).toBe(materialFehlt({ aufwand, dateien: t }));
    }
    const lauf = (f: (t: string) => string): string => { let t = ""; try { for (let i = 0; i < 10; i++) t = f(t); } catch (e) { return `${t.length}|${(e as Error).message}`; } return String(t.length); };
    expect(lauf((t) => seite!.haengeAn(t, "Footage", "rohmaterial/" + "x".repeat(300), "n"))).toBe(lauf((t) => haengeAn(t, "Footage", "rohmaterial/" + "x".repeat(300), "n")));
  });

  it("die Seite bietet dem Menschen die richtigen Arten an (kein «Render»)", () => {
    expect(seite!.MATERIAL_ARTEN_MENSCH).toEqual(["Footage", "Foto", "Audio", "Skript", "Logo", "Sonstiges"]);
  });
});
