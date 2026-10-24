import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseArgs } from "../args";
import { inspirationBefehl } from "./befehle";
import type { FolienErgebnis, Sichtung } from "./sichten";
import { bauStilStudie, presetKennung, schnittKlasse, stilAlsMarkdown, untertitelAusUrteil, woerterProMinuteAus } from "./stil";

const root = path.resolve(import.meta.dirname, "..", "..");
const CODE = "DaVK-JQRWmg";
const folie = (extra: Partial<FolienErgebnis> = {}): FolienErgebnis => ({ nr: 1, art: "video", datei: "folie-01.mp4", dauer: 60, boegen: ["bogen-01.jpg"], schnitte: 11, schnitteProMinute: 11, lufs: -14.2, truePeak: -1.1, stillen: { anzahl: 3, sekunden: 3 }, transkript: { datei: "folie-01-transkript.json", segmente: 2 }, ...extra });
const sichtung = (extra: Partial<Sichtung> = {}, f: Partial<FolienErgebnis> = {}): Sichtung => ({
  link: { art: "reel", url: `https://www.instagram.com/reel/${CODE}/`, code: CODE },
  status: "ok",
  abgerufenAm: "2026-10-24T10:00:00.000Z",
  konto: "beispielkonto",
  typ: "video",
  folien: [folie(f)],
  folienBoegen: [],
  ...extra,
});
const whisper = (woerter: number) => ({ segments: [{ start: 0, end: 30, text: Array.from({ length: woerter }, (_, i) => `w${i}`).join(" ") }] });
const URTEIL = "schrift=titel,groesse=48,position=unten,animation=pop,hervorhebung=akzent,grossschreibung=ja,kasten=nein";

describe("schnittKlasse (Klassen aus der Messung an 22 Reels)", () => {
  it("trennt an den Grenzen 2, 11, 25 und 50", () => {
    expect(schnittKlasse(0)).toContain("kaum");
    expect(schnittKlasse(2)).toContain("kaum");
    expect(schnittKlasse(2.1)).toContain("wenige");
    expect(schnittKlasse(11.9)).toContain("wenige");
    expect(schnittKlasse(12)).toContain("viele harte");
    expect(schnittKlasse(25)).toContain("viele harte");
    expect(schnittKlasse(25.1)).toContain("sehr viele");
    expect(schnittKlasse(50)).toContain("sehr viele");
    expect(schnittKlasse(53)).toContain("Schnittgewitter");
  });
});

describe("bauStilStudie", () => {
  it("übernimmt die Messwerte und rechnet nur mit Dauer und Schnitten", () => {
    const r = bauStilStudie(sichtung(), { transkript: whisper(150), jetzt: new Date("2026-10-24T12:00:00Z") });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s = r.studie;
    expect(s).toMatchObject({ code: CODE, konto: "beispielkonto", erstellt: "2026-10-24T12:00:00.000Z" });
    expect(s.messwerte).toEqual({ dauer: 60, schnitte: 11, schnitteProMinute: 11, mittlereEinstellung: 5, lufs: -14.2, truePeak: -1.1, pausen: { anzahl: 3, sekunden: 3, anteil: 0.05 }, woerterProMinute: 150 });
    expect(s.einordnung[0]).toBe("11 harte Schnitte je Minute: wenige harte Schnitte (3 bis 11 je Minute)");
    expect(s.einordnung.join("\n")).toContain("Sprechtempo rund 150 Wörter je Minute");
  });

  it("sagt, was die Messung nicht hergibt, und dass es nur intern ist", () => {
    const r = bauStilStudie(sichtung());
    if (!r.ok) throw new Error(r.grund);
    expect(r.studie.nichtGemessen.join("\n")).toMatch(/Schriftgrösse, Lage, Animation/);
    expect(r.studie.nichtGemessen.join("\n")).toMatch(/ich höre nichts/);
    expect(r.studie.hinweis).toMatch(/nur intern.*Nie Material für Kunden/);
    expect(r.studie.untertitel).toBeUndefined();
  });

  it("ohne Schnitte gibt es keine mittlere Einstellung, und das steht in der Einordnung", () => {
    const r = bauStilStudie(sichtung({}, { schnitte: 0, schnitteProMinute: 0 }));
    if (!r.ok) throw new Error(r.grund);
    expect(r.studie.messwerte.mittlereEinstellung).toBeUndefined();
    expect(r.studie.einordnung[1]).toMatch(/Keine harten Schnitte.*Einblendungen und Bewegung/);
  });

  it("ohne Ton gibt es keine Pausen in der Einordnung; ein True Peak über 0 wird eingeordnet, nicht bewertet", () => {
    const stumm = bauStilStudie(sichtung({}, { ohneTon: true, stillen: undefined, lufs: undefined, truePeak: undefined }));
    if (!stumm.ok) throw new Error(stumm.grund);
    expect(stumm.studie.einordnung.join("\n")).toContain("Ohne Ton");
    expect(stumm.studie.einordnung.join("\n")).not.toContain("Pausen");
    const laut = bauStilStudie(sichtung({}, { truePeak: 2.4 }));
    if (!laut.ok) throw new Error(laut.grund);
    expect(laut.studie.einordnung.join("\n")).toMatch(/über 0.*sagt nichts über die Mischung/);
  });

  it("lehnt eine Sichtung ohne Video mit Messwerten, ohne Kurzcode und mit Fehlerstatus ab, mit Grund", () => {
    const bilder = bauStilStudie(sichtung({ typ: "karussell" as never, folien: [{ nr: 1, art: "bild", datei: "folie-01.jpg", boegen: [] }] }));
    expect(bilder).toEqual({ ok: false, grund: expect.stringContaining("kein Video mit Messwerten") });
    expect(bauStilStudie(sichtung({ link: { art: "reel", url: "https://x" } }))).toEqual({ ok: false, grund: "Die Sichtung hat keinen Kurzcode" });
    expect(bauStilStudie(sichtung({ status: "gesperrt", grund: "Anmeldung nötig" }))).toEqual({ ok: false, grund: expect.stringMatching(/Status «gesperrt».*Anmeldung nötig/) });
  });
});

describe("woerterProMinuteAus", () => {
  it("zählt die Wörter durch die Dauer; Unlesbares ergibt nichts statt eines Fehlers", () => {
    expect(woerterProMinuteAus(whisper(100), 60)).toBe(100);
    expect(woerterProMinuteAus(whisper(100), 30)).toBe(200);
    expect(woerterProMinuteAus({ unbekannt: true }, 60)).toBeUndefined();
    expect(woerterProMinuteAus(whisper(100), 0)).toBeUndefined();
    expect(woerterProMinuteAus({ segments: [] }, 60)).toBeUndefined();
  });
});

describe("untertitelAusUrteil", () => {
  it("baut ein Preset mit Herkunft «unbelegt» und dem Code der Aufnahme als Quelle", () => {
    const r = untertitelAusUrteil(URTEIL, CODE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.preset).toMatchObject({ art: "untertitel", id: "stil-davk-jqrwmg", schriftRolle: "titel", groesse: 48, position: "unten", animation: "pop", hervorhebung: "akzent", grossschreibung: true, kasten: false });
    expect(r.preset.herkunft).toEqual({ stand: "unbelegt", quelle: `Inspiration ${CODE}: Urteil nach Ansicht der Bögen, nicht gemessen` });
  });

  it("verlangt alle sieben Angaben und nennt jede fehlende, statt zu raten", () => {
    const r = untertitelAusUrteil("schrift=titel,groesse=48", CODE);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.fehler).toHaveLength(5);
    expect(r.fehler.join("\n")).toMatch(/«position» fehlt: Was nicht beurteilt wurde, wird nicht geraten/);
  });

  it("lehnt Unbekanntes, falsche Werte und kaputte Form ab", () => {
    const ungueltig = (spec: string) => {
      const r = untertitelAusUrteil(spec, CODE);
      return r.ok ? [] : r.fehler.join("\n");
    };
    expect(ungueltig(`${URTEIL},farbe=rot`)).toMatch(/Unbekannte Angabe «farbe»/);
    expect(ungueltig(URTEIL.replace("position=unten", "position=links"))).toMatch(/position/);
    expect(ungueltig(URTEIL.replace("groesse=48", "groesse=gross"))).toMatch(/groesse/);
    expect(ungueltig(URTEIL.replace("groesse=48", "groesse=-4"))).toMatch(/groesse/);
    expect(ungueltig(URTEIL.replace("grossschreibung=ja", "grossschreibung=vielleicht"))).toMatch(/grossschreibung: ja oder nein/);
    expect(ungueltig("quatsch")).toMatch(/keine Angabe der Form/);
  });

  it("nimmt ja und nein in mehreren Schreibweisen", () => {
    const r = untertitelAusUrteil(URTEIL.replace("grossschreibung=ja", "grossschreibung=true").replace("kasten=nein", "kasten=JA"), CODE);
    expect(r.ok && r.preset.grossschreibung).toBe(true);
    expect(r.ok && r.preset.kasten).toBe(true);
  });

  it("presetKennung macht aus dem Kurzcode eine gültige Kennung", () => {
    expect(presetKennung("DaVK-JQRWmg")).toBe("stil-davk-jqrwmg");
    expect(presetKennung("A_b__C")).toBe("stil-a-b-c");
  });
});

describe("stilAlsMarkdown", () => {
  it("nennt Gemessenes, Einordnung, Nicht-Gemessenes und das Urteil, wenn es eines gibt", () => {
    const r = bauStilStudie(sichtung(), { transkript: whisper(150) });
    if (!r.ok) throw new Error(r.grund);
    const ohne = stilAlsMarkdown(r.studie);
    expect(ohne).toContain(`# Stil-Studie ${CODE} (@beispielkonto)`);
    expect(ohne).toContain("## Gemessen");
    expect(ohne).toContain("Dauer 60 s, 11 harte Schnitte (11 je Minute)");
    expect(ohne).toContain("## Nicht gemessen");
    expect(ohne).toContain("Noch keines");
    const u = untertitelAusUrteil(URTEIL, CODE);
    if (!u.ok) throw new Error("Urteil");
    const mit = stilAlsMarkdown({ ...r.studie, untertitel: u.preset });
    expect(mit).toContain("## Urteil über die Untertitel (nach Ansicht der Bögen)");
    expect(mit).toContain("Grösse 48, Lage unten, Animation pop");
    expect(mit).toContain("Herkunft: unbelegt");
  });
});

describe("inspiration stil (Befehl)", () => {
  let tmp: string;
  let ausgabe: string[];
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "studio-stil-"));
    ausgabe = [];
    vi.spyOn(console, "log").mockImplementation((...x: unknown[]) => void ausgabe.push(x.join(" ")));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  const lege = (s: Sichtung = sichtung(), transkript: unknown = whisper(150)): string => {
    // null heisst: kein Transkript (undefined würde den Standardwert auslösen)
    const dir = path.join(tmp, CODE);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(s));
    if (transkript !== null) fs.writeFileSync(path.join(dir, "folie-01-transkript.json"), JSON.stringify(transkript));
    return dir;
  };
  const lauf = (...argv: string[]) => inspirationBefehl("stil", parseArgs(["inspiration", "stil", ...argv]), root);

  it("schreibt stil.json und stil.md, ohne Urteil über die Untertitel, und sagt, was fehlt", async () => {
    const dir = lege();
    expect(await lauf(CODE, "--out", tmp)).toBe(0);
    const j = JSON.parse(fs.readFileSync(path.join(dir, "stil.json"), "utf8"));
    expect(j.messwerte).toMatchObject({ schnitte: 11, woerterProMinute: 150 });
    expect(fs.readFileSync(path.join(dir, "stil.md"), "utf8")).toContain("# Stil-Studie");
    expect(fs.existsSync(path.join(dir, "untertitel-vorschlag.json"))).toBe(false);
    expect(ausgabe.join("\n")).toContain("Urteil über die Untertitel fehlt");
    expect(ausgabe.join("\n")).toContain("Nicht gemessen: Schriftgrösse, Lage, Animation und Hervorhebung der Untertitel");
  });

  it("mit Urteil kommt ein Vorschlag mit Herkunft «unbelegt» und das Caption-Preset der Marke, aber nichts im Repo", async () => {
    const dir = lege();
    const vorher = fs.readdirSync(path.join(root, "presets", "untertitel")).sort();
    expect(await lauf(CODE, "--out", tmp, "--untertitel", URTEIL, "--marke", "alperna")).toBe(0);
    const v = JSON.parse(fs.readFileSync(path.join(dir, "untertitel-vorschlag.json"), "utf8"));
    expect(v).toMatchObject({ art: "untertitel", id: "stil-davk-jqrwmg", herkunft: { stand: "unbelegt" } });
    const text = ausgabe.join("\n");
    expect(text).toContain('"captionPreset"');
    expect(text).toContain("Übernehmen und freigeben tut ein Mensch bei Gate 0");
    expect(text).toContain("presets/untertitel/stil-davk-jqrwmg.json");
    expect(fs.readdirSync(path.join(root, "presets", "untertitel")).sort()).toEqual(vorher);
  });

  it("ein unvollständiges Urteil schreibt nichts und nennt die fehlenden Angaben", async () => {
    const dir = lege();
    expect(await lauf(CODE, "--out", tmp, "--untertitel", "schrift=titel")).toBe(1);
    expect(fs.existsSync(path.join(dir, "stil.json"))).toBe(false);
    expect(ausgabe.join("\n")).toMatch(/«groesse» fehlt/);
  });

  it("ein Karussell aus Bildern hat keine Stil-Studie, mit Grund und Exit 1", async () => {
    lege(sichtung({ folien: [{ nr: 1, art: "bild", datei: "folie-01.jpg", boegen: [] }] }), null);
    expect(await lauf(CODE, "--out", tmp)).toBe(1);
    expect(ausgabe.join("\n")).toContain("kein Video mit Messwerten");
  });

  it("arbeitet auch ohne Transkript", async () => {
    const dir = lege(sichtung(), null);
    expect(await lauf(CODE, "--out", tmp)).toBe(0);
    expect(JSON.parse(fs.readFileSync(path.join(dir, "stil.json"), "utf8")).messwerte.woerterProMinute).toBeUndefined();
  });

  it("klare Fehler: kein Code, kein --out, keine Sichtung, Ordner im Repo, ungültiger Code", async () => {
    await expect(lauf()).rejects.toThrow(/Aufruf: inspiration stil/);
    await expect(lauf(CODE)).rejects.toThrow(/--out/);
    await expect(lauf(CODE, "--out", tmp)).rejects.toThrow(/Keine Sichtung gefunden/);
    await expect(lauf(CODE, "--out", path.join(root, "docs"))).rejects.toThrow(/im Repo/);
    await expect(lauf("../x", "--out", tmp)).rejects.toThrow(/kein Kurzcode/);
  });
});
