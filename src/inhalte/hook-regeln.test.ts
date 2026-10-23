import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ersterSatz, HookRegeln, hookPruefung, ladeHookRegeln } from "./hook-regeln";
import { textBestanden, textpruefung } from "./textpruefung";

const root = path.resolve(import.meta.dirname, "..", "..");
const datei = path.join(root, "library", "hook-regeln.json");
const regeln = ladeHookRegeln(datei);
const worte = (n: number): string => Array.from({ length: n }, (_, i) => `wort${i}`).join(" ");
const codes = (o: Parameters<typeof hookPruefung>[0]): string[] => hookPruefung(o).empfehlungen.map((e) => e.code);
const basis = { text: "Kurzer erster Satz. Dann geht es weiter.", hook: "Ein Hook", beleg: "ohne Zahl", format: "Reel" as const, regeln };

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "studio-hook-"));
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("die Datei mit den Regeln", () => {
  it("ist gültig, ehrlich als unbelegt gekennzeichnet und nennt die drei Fragen mit ihrer Quelle", () => {
    expect(regeln.belegt).toBe(false);
    expect(regeln.herkunft).toMatch(/nicht belegt/);
    expect(regeln.herkunft).toMatch(/Empfehlungen und nie Fehler/);
    expect(regeln.fragen.map((f) => f.id)).toEqual(["was-verpasse-ich", "ist-das-fuer-mich", "warum-kuemmert-es-mich"]);
    for (const f of regeln.fragen) expect(f.quelle).toMatch(/^[A-Za-z0-9_-]{8,}$/);
  });

  it("lehnt unbekannte Felder, Zahlen ausser Bereich und kaputte Ausdrücke ab", () => {
    const gut = JSON.parse(fs.readFileSync(datei, "utf8"));
    expect(HookRegeln.safeParse({ ...gut, extra: 1 }).success).toBe(false);
    expect(HookRegeln.safeParse({ ...gut, pruefungen: { ...gut.pruefungen, ersterSatzMaxWoerter: 2 } }).success).toBe(false);
    const kaputt = path.join(tmp, "kaputt.json");
    fs.writeFileSync(kaputt, JSON.stringify({ ...gut, pruefungen: { ...gut.pruefungen, kommentarKoeder: ["(offen"] } }));
    expect(() => ladeHookRegeln(kaputt)).toThrow(/kein gültiger Ausdruck/);
    expect(() => ladeHookRegeln(path.join(tmp, "gibt-es-nicht.json"))).toThrow(/fehlen/);
  });
});

describe("ersterSatz", () => {
  it("bis zum ersten Satzzeichen mit Leerraum danach, oder bis zum Zeilenende", () => {
    expect(ersterSatz("Erster Satz. Zweiter Satz.")).toBe("Erster Satz.");
    expect(ersterSatz("Erste Zeile ohne Punkt\nZweite Zeile")).toBe("Erste Zeile ohne Punkt");
    expect(ersterSatz("Wirklich? Ja.")).toBe("Wirklich?");
    expect(ersterSatz("  # Titel mit Raute. Danach")).toBe("Titel mit Raute.");
    expect(ersterSatz("Nur ein Satz ohne Ende")).toBe("Nur ein Satz ohne Ende");
    expect(ersterSatz("")).toBe("");
  });
  it("ein Punkt mitten in einer Zahl oder Abkürzung ohne Leerraum trennt nicht", () => {
    expect(ersterSatz("Das kostet 1.200 Franken. Danach")).toBe("Das kostet 1.200 Franken.");
  });
});

describe("hookPruefung", () => {
  it("ein sauberer Entwurf ergibt keine Empfehlung, aber immer die drei Fragen und den Hinweis auf die fehlende Belegung", () => {
    const r = hookPruefung(basis);
    expect(r.empfehlungen).toEqual([]);
    expect(r.fragen).toHaveLength(3);
    expect(r.hinweis).toMatch(/nicht belegt/);
    expect(r.hinweis).toMatch(/Empfehlungen, keine Fehler/);
  });

  it("jede Empfehlung beginnt mit «Empfehlung:», sie ist nie ein Befehl oder Fehler", () => {
    const r = hookPruefung({ ...basis, hook: "", text: `${worte(40)}. Kommentiere Hook und ich schicke dir den Link.` });
    expect(r.empfehlungen.length).toBeGreaterThanOrEqual(3);
    for (const e of r.empfehlungen) expect(e.text.startsWith("Empfehlung: ")).toBe(true);
  });

  it("fehlt der Hook bei einem Format mit Hook, kommt eine Empfehlung; bei einem Blog nicht", () => {
    for (const f of ["Reel", "Carousel", "Story", "LinkedIn-Post"] as const) expect(codes({ ...basis, hook: "  ", format: f })).toContain("hook_fehlt");
    for (const f of ["Blog", "Google-Maps-Beitrag", "Sonstiges", "ungeklärt"] as const) expect(codes({ ...basis, hook: "", format: f })).not.toContain("hook_fehlt");
    expect(codes({ ...basis, hook: "", format: undefined })).not.toContain("hook_fehlt");
  });

  it("der erste Satz: genau an der Grenze noch in Ordnung, ein Wort mehr bringt die Empfehlung mit der Zahl", () => {
    const grenze = regeln.pruefungen.ersterSatzMaxWoerter;
    expect(codes({ ...basis, text: `${worte(grenze)}. Danach.` })).not.toContain("erster_satz_lang");
    const r = hookPruefung({ ...basis, text: `${worte(grenze + 1)}. Danach.` });
    expect(r.empfehlungen.map((e) => e.code)).toContain("erster_satz_lang");
    expect(r.empfehlungen.find((e) => e.code === "erster_satz_lang")!.text).toContain(`${grenze + 1} Wörter`);
  });

  it("nur der erste Satz zählt, nicht die folgenden", () => {
    expect(codes({ ...basis, text: `Kurz. ${worte(80)}.` })).not.toContain("erster_satz_lang");
  });

  it("Zeilen des Hooks: mehr als erlaubt wird empfohlen zu kürzen", () => {
    const max = regeln.pruefungen.titelMaxZeilen;
    expect(codes({ ...basis, hook: Array.from({ length: max }, (_, i) => `Zeile ${i}`).join("\n") })).not.toContain("hook_zeilen");
    expect(codes({ ...basis, hook: Array.from({ length: max + 1 }, (_, i) => `Zeile ${i}`).join("\n") })).toContain("hook_zeilen");
    // leere Zeilen zählen nicht
    expect(codes({ ...basis, hook: "Eins\n\nZwei\n" })).not.toContain("hook_zeilen");
  });

  it("hat der Beleg eine Zahl und der Hook keine, kommt die Empfehlung; sonst nicht", () => {
    expect(codes({ ...basis, beleg: "Wartezeit von 32 auf 14 Minuten", hook: "Die Wartezeit sinkt" })).toContain("hook_ohne_zahl");
    expect(codes({ ...basis, beleg: "Wartezeit von 32 auf 14 Minuten", hook: "14 Minuten statt 32" })).not.toContain("hook_ohne_zahl");
    expect(codes({ ...basis, beleg: "keine Zahl", hook: "Ohne Zahl" })).not.toContain("hook_ohne_zahl");
  });

  it("Kommentar-Köder werden erkannt, ein normaler Aufruf nicht", () => {
    for (const t of ["Kommentiere «Hook» und ich schicke dir den Link.", "Schreib es in die Kommentare, dann melde ich mich.", "Kommentier einfach HOOK, ich sende dir die Liste."]) {
      expect(codes({ ...basis, text: `Erster Satz. ${t}` }), t).toContain("kommentar_koeder");
    }
    for (const t of ["Der Link steht im Profil.", "Schreib uns eine Nachricht.", "Mehr dazu im Blog."]) expect(codes({ ...basis, text: `Erster Satz. ${t}` }), t).not.toContain("kommentar_koeder");
    // höchstens eine Meldung, auch wenn zwei Muster passen
    const r = hookPruefung({ ...basis, text: "Kommentiere Hook und ich schicke dir was. Schreib es in die Kommentare." });
    expect(r.empfehlungen.filter((e) => e.code === "kommentar_koeder")).toHaveLength(1);
  });

  it("ein leerer Text bricht nichts: keine Empfehlung zum ersten Satz", () => {
    expect(codes({ ...basis, text: "" })).not.toContain("erster_satz_lang");
  });
});

describe("Empfehlungen sind nie Fehler", () => {
  it("die Textprüfung selbst bleibt unverändert: derselbe Entwurf besteht, auch wenn alle Empfehlungen anschlagen", () => {
    const text = `${worte(40)}. Kommentiere Hook und ich schicke dir den Link.`;
    const befunde = textpruefung({ text, beleg: "", verboteneWoerter: [] });
    expect(textBestanden(befunde)).toBe(true);
    expect(hookPruefung({ ...basis, text, hook: "" }).empfehlungen.length).toBeGreaterThan(0);
    expect(befunde.some((b) => b.code.startsWith("hook_") || b.code === "kommentar_koeder" || b.code === "erster_satz_lang")).toBe(false);
  });
});
