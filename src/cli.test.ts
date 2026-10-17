import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { entwurf, pitch } from "./testing/fixtures";

/**
 * Ruft die CLI als Prozess auf, so wie Claude Code und das Team sie benutzen.
 * Daten gehen in ein Temp-Verzeichnis (STUDIO_DATA_DIR), die Bibliothek ist die echte.
 */
const studioRoot = path.resolve(import.meta.dirname, "..");
let tmp: string;
let skript: string;

let tmpLib: string;
function studio(...args: string[]) {
  const r = spawnSync("npx", ["tsx", "src/cli.ts", ...args], { cwd: studioRoot, encoding: "utf8", env: { ...process.env, STUDIO_DATA_DIR: tmp, STUDIO_LIBRARY_DIR: tmpLib } });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "studio-cli-"));
  // Eigene Bibliothek für den Test: eine Kopie des echten Referenzstücks, damit nichts im Repo verändert wird
  tmpLib = path.join(tmp, "lib");
  fs.cpSync(path.join(studioRoot, "library", "motion"), tmpLib, { recursive: true });
  skript = path.join(tmp, "p-023.md");
  fs.writeFileSync(skript, "# Skript P-023\n\n7 von 10 Websites laden zu langsam.\nDie Läuferin fiel über fünf Scans von 97 auf 60.\nSchön, dass du da bist.\n");
  fs.writeFileSync(path.join(tmp, "pitch.json"), JSON.stringify({ pitch: pitch() }));
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("studio CLI", () => {
  it("motion lint besteht für die Bibliothek", () => {
    const r = studio("motion", "lint");
    expect(r.code).toBe(0);
    expect(r.out).toContain("0 Fehler");
  });

  it("motion vars löst auf und lehnt unbekannte Parameter ab", () => {
    const ok = studio("motion", "vars", "zahl-zaehler", "--set", "wert=7", "--set", "suffix= von 10", "--set", "label=Termine vergeben", "--dauer", "2.6");
    expect(ok.code).toBe(0);
    expect(JSON.parse(ok.out)).toMatchObject({ wert: 7, suffix: " von 10", label: "Termine vergeben", dauer: 2.6 });
    // Marken-Regel «nie eine Zahl ohne Kontext»: ohne Beschriftung gibt es keinen Einsatz
    const ohneKontext = studio("motion", "vars", "zahl-zaehler", "--set", "wert=7");
    expect(ohneKontext.code).toBe(1);
    expect(ohneKontext.err).toContain("Pflichtparameter «label» fehlt");
    const schlecht = studio("motion", "vars", "zahl-zaehler", "--set", "wert=7", "--set", "farbe=rot");
    expect(schlecht.code).toBe(1);
    expect(schlecht.err).toContain("Unbekannter Parameter «farbe»");
  });

  it("luecken: Zahl ist abgedeckt, der Verlauf eine Lücke; Trockenlauf schreibt nichts", () => {
    const r = studio("motion", "luecken", "--skript", skript, "--projekt", "P-023");
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/z01 \[abgedeckt\] anteil → zahl-zaehler/);
    expect(r.out).toMatch(/z02 \[luecke\] verlauf/);
    expect(r.out).not.toContain("z03");
    expect(r.out).toContain("Trockenlauf");
    expect(fs.existsSync(path.join(tmp, "ideen.json"))).toBe(false);
  });

  it("luecken --schreiben legt die Idee mit dem genauen Satz an", () => {
    const r = studio("motion", "luecken", "--skript", skript, "--projekt", "P-023", "--schreiben");
    expect(r.code).toBe(0);
    expect(r.out).toContain("Idee m-001 angelegt");
    const idee = JSON.parse(studio("ideen", "zeigen", "m-001").out) as { quelle: { satz: string; projekt: string }; warumNichtsPasst: { geprueft: { stueck: string }[] } };
    expect(idee.quelle).toMatchObject({ projekt: "P-023", satz: "Die Läuferin fiel über fünf Scans von 97 auf 60." });
    expect(idee.warumNichtsPasst.geprueft[0]?.stueck).toBe("zahl-zaehler");
  });

  it("dieselbe Stelle wird beim zweiten Lauf nicht noch einmal zur Idee", () => {
    const r = studio("motion", "luecken", "--skript", skript, "--projekt", "P-023", "--schreiben");
    expect(r.out).toMatch(/z02 \[bereits-erfasst\] verlauf → m-001/);
    expect(r.out).not.toContain("angelegt");
  });

  it("das Freigabe-Gate hält: Claude kommt nicht an der Freigabe vorbei, ein Mensch schon", () => {
    expect(studio("ideen", "weiter", "m-001", "pitch", "--system", "--json", path.join(tmp, "pitch.json")).code).toBe(0);
    const system = studio("ideen", "weiter", "m-001", "freigegeben", "--system", "--by", "claude");
    expect(system.code).toBe(1);
    expect(system.err).toContain("nur ein Mensch");
    const getarnt = studio("ideen", "weiter", "m-001", "freigegeben", "--mensch", "--by", "Claude");
    expect(getarnt.code).toBe(1);
    const ohneName = studio("ideen", "weiter", "m-001", "freigegeben", "--mensch");
    expect(ohneName.code).toBe(1);
    expect(ohneName.err).toContain("--by");
    expect(studio("ideen", "weiter", "m-001", "freigegeben", "--mensch", "--by", "Andrej").code).toBe(0);
  });

  it("nach der Freigabe lässt sich nichts bauen, bevor Looks gewählt sind", () => {
    const r = studio("ideen", "weiter", "m-001", "in_bau", "--system", "--stueck", "wert-verlauf");
    expect(r.code).toBe(1);
    expect(r.err).toContain("nicht vorgesehen");
    expect(studio("ideen", "liste", "--status", "freigegeben").out).toContain("m-001");
  });

  it("ideen pitch gibt den Pitch als Text aus", () => {
    // m-001 ist freigegeben und hat den Pitch aus dem Schritt davor
    const r = studio("ideen", "pitch", "m-001");
    expect(r.code).toBe(0);
    expect(r.out).toContain("# Pitch m-001");
    expect(r.out).toContain("> «Die Läuferin fiel über fünf Scans von 97 auf 60.»");
  });

  it("motion neu legt ein lint-sauberes Gerüst an, das ab «gebaut» an den TODO scheitert", () => {
    const r = studio("motion", "neu", "wert-verlauf", "--name", "Wert-Verlauf", "--typen", "verlauf", "--idee", "m-001");
    expect(r.code).toBe(0);
    expect(r.out).toContain("alle TODO ersetzen");
    expect(fs.existsSync(path.join(tmpLib, "wert-verlauf", "piece.json"))).toBe(true);
    expect(studio("motion", "lint").code).toBe(0);
    const doppelt = studio("motion", "neu", "wert-verlauf", "--name", "Nochmal", "--typen", "verlauf");
    expect(doppelt.code).toBe(1);
    expect(doppelt.err).toContain("existiert schon");
    const status = studio("motion", "status", "wert-verlauf", "gebaut");
    expect(status.code).toBe(1);
    expect(status.err).toContain("besteht den Lint nicht");
    expect(studio("motion", "status", "wert-verlauf", "aktiv").err).toContain("nur über «motion aktivieren»");
  });

  it("ideen bearbeiten schärft eine Idee im Status «idee» und nur dort", () => {
    studio("motion", "luecken", "--skript", path.join(tmp, "p-023.md"), "--projekt", "P-024", "--schreiben");
    // m-001 ist freigegeben (Test davor), die Idee aus P-024 ist m-002 oder bereits erfasst: wir legen eine frische an
    fs.writeFileSync(path.join(tmp, "neu.md"), "Der Anteil der Anfragen stieg über vier Wochen von 12 auf 31 Prozent.\n");
    const neu = studio("motion", "luecken", "--skript", path.join(tmp, "neu.md"), "--projekt", "P-025", "--schreiben");
    const id = /Idee (m-\d+) angelegt/.exec(neu.out)?.[1];
    expect(id).toBeDefined();
    expect(studio("ideen", "bearbeiten", id!, "--titel", "Anfragen-Verlauf").code).toBe(0);
    expect(JSON.parse(studio("ideen", "zeigen", id!).out)).toMatchObject({ titel: "Anfragen-Verlauf" });
    const gesperrt = studio("ideen", "bearbeiten", "m-001", "--titel", "Anderer Titel");
    expect(gesperrt.code).toBe(1);
    expect(gesperrt.err).toContain("nur im Status «idee»");
    expect(studio("ideen", "bearbeiten", id!).err).toContain("Nichts zu ändern");
  });

  it("ein Stück aktiviert nie das System", () => {
    const r = studio("motion", "aktivieren", "zahl-zaehler", "--system");
    expect(r.code).toBe(1);
    expect(r.err).toContain("nur ein Mensch");
  });

  it("unbekannter Befehl: Hilfe und Exit-Code 2", () => {
    const r = studio("motion", "gibt-es-nicht");
    expect(r.code).toBe(2);
    expect(r.err).toContain("Unbekannter Befehl");
  });
});

describe("studio CLI: Notion", () => {
  let daten: string;
  const notion = (...args: string[]) => {
    const r = spawnSync("npx", ["tsx", "src/cli.ts", ...args], { cwd: studioRoot, encoding: "utf8", env: { ...process.env, STUDIO_DATA_DIR: daten, STUDIO_LIBRARY_DIR: tmpLib } });
    return { code: r.status, out: r.stdout, err: r.stderr };
  };
  const zeilen = (...z: Record<string, unknown>[]) => {
    const datei = path.join(daten, "zeilen.json");
    fs.writeFileSync(datei, JSON.stringify({ results: z, has_more: false }));
    return datei;
  };

  beforeAll(() => {
    daten = fs.mkdtempSync(path.join(os.tmpdir(), "studio-cli-notion-"));
    fs.writeFileSync(path.join(daten, "entwurf.json"), JSON.stringify(entwurf()));
    expect(notion("ideen", "neu", "--json", path.join(daten, "entwurf.json")).code).toBe(0);
    expect(notion("ideen", "weiter", "m-001", "pitch", "--system", "--json", path.join(tmp, "pitch.json")).code).toBe(0);
  });
  afterAll(() => fs.rmSync(daten, { recursive: true, force: true }));

  it("notion-zeile liefert Eigenschaften und Seitentext, aber keinen Entscheid", () => {
    const r = notion("ideen", "notion-zeile", "m-001");
    expect(r.code).toBe(0);
    const z = JSON.parse(r.out) as { properties: Record<string, unknown>; inhalt: string };
    expect(z.properties).toMatchObject({ "Idee-ID": "m-001", Status: "pitch", Quelle: "video", "OneDrive-Ordner": "Studio/daten/ideen/m-001" });
    expect(z.properties).not.toHaveProperty("Entscheid");
    expect(z.inhalt).toContain("## Pitch");
  });

  it("notion-alle nennt die Datenquelle aus notion.json", () => {
    const r = JSON.parse(notion("ideen", "notion-alle").out) as { datenquelle: string; zeilen: { idee: string }[] };
    expect(r.datenquelle).toMatch(/^collection:\/\/[0-9a-f-]{36}$/);
    expect(r.zeilen.map((x) => x.idee)).toEqual(["m-001"]);
  });

  it("notion-lesen zeigt ohne --anwenden nur eine Vorschau und ändert nichts", () => {
    const r = notion("ideen", "notion-lesen", "--json", zeilen({ "Idee-ID": "m-001", Status: "pitch", Entscheid: "freigegeben", "Entscheid von": "Andrej" }));
    expect(r.code).toBe(0);
    const b = JSON.parse(r.out) as { anwenden: boolean; angewendet: { text: string }[] };
    expect(b.anwenden).toBe(false);
    expect(b.angewendet[0]?.text).toMatch(/^\(Vorschau\)/);
    expect(JSON.parse(notion("ideen", "zeigen", "m-001").out)).toMatchObject({ status: "pitch" });
  });

  it("notion-lesen ohne Namen übernimmt nichts und sagt warum", () => {
    const r = notion("ideen", "notion-lesen", "--anwenden", "--json", zeilen({ "Idee-ID": "m-001", Status: "pitch", Entscheid: "freigegeben" }));
    const b = JSON.parse(r.out) as { angewendet: unknown[]; hinweise: { hinweise: string[] }[] };
    expect(b.angewendet).toEqual([]);
    expect(b.hinweise[0]?.hinweise.join(" ")).toMatch(/ohne Namen/);
    expect(JSON.parse(notion("ideen", "zeigen", "m-001").out)).toMatchObject({ status: "pitch" });
  });

  it("notion-lesen --anwenden führt die Freigabe eines Menschen nach, mit Name und Zeitpunkt", () => {
    const r = notion("ideen", "notion-lesen", "--anwenden", "--json", zeilen({ "Idee-ID": "m-001", Status: "pitch", Entscheid: "freigegeben", "Entscheid von": "Andrej", "date:Entscheid am:start": "2026-10-17T09:30:00.000Z" }));
    expect(r.code).toBe(0);
    const b = JSON.parse(r.out) as { angewendet: { nach: string }[]; zeileNeuSchreiben: string[] };
    expect(b.angewendet.map((x) => x.nach)).toEqual(["freigegeben"]);
    expect(b.zeileNeuSchreiben).toEqual(["m-001"]);
    const i = JSON.parse(notion("ideen", "zeigen", "m-001").out) as { status: string; entscheidung: { wer: string; wann: string } };
    expect(i.status).toBe("freigegeben");
    expect(i.entscheidung).toMatchObject({ wer: "Andrej", wann: "2026-10-17T09:30:00.000Z" });
  });

  it("notion-lesen ist wiederholbar: derselbe Entscheid ein zweites Mal ändert nichts", () => {
    const r = notion("ideen", "notion-lesen", "--anwenden", "--json", zeilen({ "Idee-ID": "m-001", Status: "freigegeben", Entscheid: "freigegeben", "Entscheid von": "Andrej" }));
    expect(r.code).toBe(0);
    expect((JSON.parse(r.out) as { angewendet: unknown[] }).angewendet).toEqual([]);
  });

  it("notion-lesen meldet Zeilen ohne Idee, zum Beispiel einen Auftrag von Hand", () => {
    const r = notion("ideen", "notion-lesen", "--json", zeilen({ Titel: "Karte mit Pin", url: "https://app.notion.com/p/abc" }));
    expect((JSON.parse(r.out) as { ohneIdee: { titel: string }[] }).ohneIdee).toEqual([{ url: "https://app.notion.com/p/abc", titel: "Karte mit Pin" }]);
  });
});
