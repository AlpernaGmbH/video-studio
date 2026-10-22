import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Ideenprotokoll } from "../motion/protokoll";
import type { Idee, IdeeStatus } from "../motion/idee";
import { JETZT, MENSCH, SPAETER, SYSTEM, entwurf, ideeNeu, looks, pitch } from "../testing/fixtures";
import { bilderZeilen, ideeZuZeile, leseAlle, leseZeile, zeilenAusAbfrage, type Zeile } from "./abbild";
import { ladeNotionZiel } from "./ziel";

let dir: string;
let pr: Ideenprotokoll;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-notion-"));
  pr = new Ideenprotokoll(path.join(dir, "ideen.json"), path.join(dir, "e.jsonl"));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

/** Führt eine Idee bis zu einem Status, so wie es Claude und ein Mensch im Betrieb täten. */
function bis(ziel: IdeeStatus): Idee {
  pr.neu(entwurf(), SYSTEM, JETZT);
  const schritte: [IdeeStatus, () => void][] = [
    ["pitch", () => pr.weiter("m-001", "pitch", SYSTEM, JETZT, { daten: { pitch: pitch() } })],
    ["freigegeben", () => pr.weiter("m-001", "freigegeben", MENSCH, JETZT)],
    ["looks", () => pr.weiter("m-001", "looks", SYSTEM, JETZT, { daten: { looks: looks() } })],
    ["look_gewaehlt", () => pr.weiter("m-001", "look_gewaehlt", MENSCH, JETZT, { daten: { gewaehlt: "b" } })],
    ["in_bau", () => pr.weiter("m-001", "in_bau", SYSTEM, JETZT, { daten: { stueck: "wert-verlauf" } })],
    [
      "render_geprueft",
      () => {
        pr.pruefung("m-001", { am: JETZT, bestanden: true, befunde: [] }, SYSTEM);
        pr.weiter("m-001", "render_geprueft", SYSTEM, JETZT);
      },
    ],
  ];
  for (const [status, tue] of schritte) {
    if (pr.holen("m-001").status === ziel) break;
    tue();
    if (status === ziel) break;
  }
  return pr.holen("m-001");
}

const ENTSCHEIDFELDER = ["Entscheid", "Entscheid-Grund", "Entscheid von", "date:Entscheid am:start", "Look-Wahl", "Look-Notiz", "Look-Wahl von", "date:Look-Wahl am:start", "Abnahme", "Abnahme-Notiz", "Abnahme von", "date:Abnahme am:start"];

describe("Idee → Zeile", () => {
  it("überträgt Satz, Begründung und Pitch genau", () => {
    const i = bis("pitch");
    const { properties: p, inhalt } = ideeZuZeile(i, { onedriveOrdner: "daten/ideen/m-001" });
    expect(p["Idee-ID"]).toBe("m-001");
    expect(p["Status"]).toBe("pitch");
    expect(p["Satz"]).toBe("Die Läuferin fiel über fünf Scans von 97 auf 60.");
    expect(p["Signale"]).toEqual(["verlauf"]);
    expect(p["Aufwand"]).toBe("mittel");
    expect(p["OneDrive-Ordner"]).toBe("Studio/daten/ideen/m-001");
    expect(String(p["Pitch"])).toContain("als Linie sieht man es sofort");
    expect(inhalt).toContain("## Warum nichts Bestehendes passt");
    expect(inhalt).toContain("zahl-zaehler");
    expect(inhalt).toContain("## Verlauf");
  });

  it("schreibt nie einen Entscheid, in keinem Status", () => {
    const erlaubt: Record<string, unknown[]> = { Entscheid: ["offen", null], Abnahme: ["offen", null] };
    const gesehen = new Set<string>();
    for (const status of ["idee", "pitch", "freigegeben", "looks", "look_gewaehlt", "in_bau", "render_geprueft"] as const) {
      fs.rmSync(path.join(dir, "ideen.json"), { force: true });
      const { properties } = ideeZuZeile(bis(status));
      for (const feld of ENTSCHEIDFELDER) {
        if (!(feld in properties)) continue;
        gesehen.add(feld);
        expect(erlaubt[feld] ?? [null], `${status}: ${feld}`).toContain(properties[feld]);
      }
    }
    // Gegenprobe: Die Prüfung sieht die Felder tatsächlich.
    expect(gesehen.has("Look-Wahl")).toBe(true);
    expect(gesehen.has("Abnahme")).toBe(true);
  });

  it("lässt Entscheidfelder der erreichten Stufe unberührt, damit ein frisch gesetzter Entscheid bleibt", () => {
    expect(ideeZuZeile(bis("pitch")).properties).not.toHaveProperty("Entscheid");
    fs.rmSync(path.join(dir, "ideen.json"));
    expect(ideeZuZeile(bis("looks")).properties).not.toHaveProperty("Look-Wahl");
    fs.rmSync(path.join(dir, "ideen.json"));
    expect(ideeZuZeile(bis("render_geprueft")).properties).not.toHaveProperty("Abnahme");
  });

  it("leert zu früh oder veraltet gesetzte Entscheide späterer Stufen", () => {
    const p = ideeZuZeile(bis("freigegeben")).properties;
    expect(p["Look-Wahl"]).toBeNull();
    expect(p["Abnahme"]).toBe("offen");
  });

  it("schreibt die Looks als Bildzeilen mit Adresse und Beschriftung, die der Prüfplatz lesen kann", () => {
    const i = bis("looks");
    const { properties } = ideeZuZeile(i, { bildUrls: { a: "https://x/a.png", b: "https://x/b.png", c: "https://x/c.png" } });
    const zeilen = String(properties["Bilder"]).split("\n");
    expect(zeilen).toHaveLength(3);
    expect(zeilen[0]).toBe("a: https://x/a.png | Plakat. Grosse Zahl, Akzentfläche, wenig Beiwerk");
    expect(properties["Look-Runde"]).toBe(1);
  });

  it("zeigt bei der Abnahme die Standbilder des Renders statt der Looks", () => {
    const i = bis("render_geprueft");
    const { properties } = ideeZuZeile(i, { renderBilder: [{ id: "r1", url: "https://x/r1.png", text: "bei 1,2 s" }, { id: "r2", url: "https://x/r2.png" }] });
    expect(properties["Bilder"]).toBe("r1: https://x/r1.png | bei 1,2 s\nr2: https://x/r2.png");
    // In einem anderen Status ignoriert: dort gehören die Looks hin.
    fs.rmSync(path.join(dir, "ideen.json"));
    expect(String(ideeZuZeile(bis("looks"), { renderBilder: [{ id: "r1", url: "https://x/r1.png" }] }).properties["Bilder"])).toMatch(/^a: /);
  });

  it("lässt Beschriftungen weg, wenn die Bildzeilen sonst zu lang würden", () => {
    const viele = Array.from({ length: 12 }, (_, n) => ({ id: `r${n}`, url: `https://x/${n}.png`, text: "Beschriftung ".repeat(12) }));
    const z = bilderZeilen(viele)!;
    expect(z.length).toBeLessThanOrEqual(1800);
    expect(z).not.toContain("|");
    expect(bilderZeilen([])).toBeNull();
  });

  it("maskiert Zeichen, die Notion als Formatierung lesen würde", () => {
    const i = ideeNeu();
    i.warumNichtsPasst.zusammenfassung = "Der Wert fiel von *97* auf [60] <schnell> und _tief_ ab.";
    const { inhalt } = ideeZuZeile(i);
    expect(inhalt).toContain("\\*97\\*");
    expect(inhalt).toContain("\\[60\\]");
    expect(inhalt).toContain("\\<schnell\\>");
  });

  it("kürzt lange Texte in der Eigenschaft, der Seitentext bleibt vollständig", () => {
    const i = ideeNeu();
    i.warumNichtsPasst.zusammenfassung = "Lang. ".repeat(500);
    const { properties, inhalt } = ideeZuZeile(i);
    expect(String(properties["Warum nichts passt"]).length).toBeLessThanOrEqual(1800);
    expect(inhalt).toContain("Lang. ".repeat(500).trim());
  });
});

function zeile(i: Idee, over: Zeile): Zeile {
  return { "Idee-ID": i.id, Status: i.status, ...over };
}

describe("Idee → Zeile: Familie", () => {
  const pitchZeile = (i: Idee, familieName?: string) => ideeZuZeile(i, { onedriveOrdner: `daten/ideen/${i.id}`, familieName });

  it("eine Idee ohne Familie hat weder eine Familienzeile im Pitch noch im Seitentext", () => {
    pr.neu(entwurf(), SYSTEM, JETZT);
    pr.weiter("m-001", "pitch", SYSTEM, JETZT, { daten: { pitch: pitch() } });
    const z = pitchZeile(pr.holen("m-001"));
    expect(String(z.properties["Pitch"])).not.toContain("Familie");
    expect(z.inhalt).not.toContain("Familie");
  });

  it("die Familie steht in der ersten Zeile des Pitchs: Der Prüfplatz sagt daraus, dass die Wahl für die Familie gilt", () => {
    pr.neu(entwurf({ familie: "mockups" }), SYSTEM, JETZT);
    pr.weiter("m-001", "pitch", SYSTEM, JETZT, { daten: { pitch: pitch() } });
    const z = pitchZeile(pr.holen("m-001"), "Handy-Mockups");
    expect(String(z.properties["Pitch"]).split("\n")[0]).toBe("Familie: Handy-Mockups");
    expect(String(z.properties["Pitch"])).toContain("Jedes Stück nimmst du trotzdem einzeln ab.");
    expect(z.inhalt).toContain("**Familie:** Handy-Mockups");
    // auch ein langer Pitch kürzt die Familienzeile nicht weg
    const lang = { ...pr.holen("m-001"), pitch: { ...pr.holen("m-001").pitch!, text: "x".repeat(3000) } } as Idee;
    expect(String(pitchZeile(lang, "Handy-Mockups").properties["Pitch"]).startsWith("Familie: Handy-Mockups")).toBe(true);
  });

  it("die Runde einer Familie sagt im Seitentext, dass die Wahl für alle Stücke gilt", () => {
    pr.neu(entwurf({ familie: "mockups" }), SYSTEM, JETZT);
    pr.weiter("m-001", "pitch", SYSTEM, JETZT, { daten: { pitch: pitch() } });
    pr.weiter("m-001", "freigegeben", MENSCH, JETZT);
    pr.weiter("m-001", "looks", SYSTEM, JETZT, { daten: { looks: looks() } });
    expect(pitchZeile(pr.holen("m-001"), "Handy-Mockups").inhalt).toContain("Die Wahl gilt für alle Stücke der Familie Handy-Mockups.");
  });

  it("ein geerbter Look steht als Look der Familie im Seitentext, die Standbilder zeigen auf den Ordner der Idee mit der Runde", () => {
    for (const n of [1, 2]) {
      pr.neu(entwurf({ familie: "mockups" }), SYSTEM, JETZT);
      pr.weiter(`m-00${n}`, "pitch", SYSTEM, JETZT, { daten: { pitch: pitch() } });
      pr.weiter(`m-00${n}`, "freigegeben", MENSCH, JETZT);
    }
    pr.weiter("m-001", "looks", SYSTEM, JETZT, { daten: { looks: looks() } });
    pr.weiter("m-001", "look_gewaehlt", { typ: "mensch", name: "Leander" }, SPAETER, { daten: { gewaehlt: "c" } });
    pr.weiter("m-002", "look_gewaehlt", SYSTEM, SPAETER);
    const z = pitchZeile(pr.holen("m-002"), "Handy-Mockups");
    expect(z.inhalt).toContain("## Look der Familie Handy-Mockups, geerbt");
    expect(z.inhalt).toContain("Leander hat am 2026-10-16 für die Familie gewählt");
    expect(z.inhalt).toContain("gezeigt in m-001");
    expect(z.inhalt).toContain("Leitidee");
    expect(z.inhalt).not.toContain("## Looks, Runde");
    expect(String(z.properties["Bilder"])).toContain("c: daten/ideen/m-001/looks/c.png");
    // Entscheid der Stufe «Look» bleibt leer: Claude schreibt nie eine Wahl, auch keine geerbte
    expect(z.properties).not.toHaveProperty("Look-Wahl");
  });
});

describe("Zeile → Entscheid", () => {
  it("übernimmt die Freigabe eines Menschen mit Name und Zeitpunkt", () => {
    const i = bis("pitch");
    const b = leseZeile(i, zeile(i, { Entscheid: "freigegeben", "Entscheid von": "Andrej", "date:Entscheid am:start": SPAETER }), JETZT);
    expect(b.aktion).toMatchObject({ nach: "freigegeben", akteur: { typ: "mensch", name: "Andrej" }, wann: SPAETER });
    const neu = pr.weiter(i.id, b.aktion!.nach, b.aktion!.akteur, b.aktion!.wann, { grund: b.aktion!.grund });
    expect(neu.entscheidung).toMatchObject({ art: "freigegeben", wer: "Andrej", wann: SPAETER });
  });

  it("verlangt einen Namen: ohne ihn wird nichts übernommen", () => {
    const i = bis("pitch");
    const b = leseZeile(i, zeile(i, { Entscheid: "freigegeben" }), JETZT);
    expect(b.aktion).toBeUndefined();
    expect(b.hinweise.join(" ")).toMatch(/ohne Namen/);
  });

  it("ein Systemname als «Mensch» kommt am Zustandsautomaten nicht vorbei", () => {
    const i = bis("pitch");
    const b = leseZeile(i, zeile(i, { Entscheid: "freigegeben", "Entscheid von": "Claude" }), JETZT);
    expect(b.aktion).toBeDefined();
    expect(() => pr.weiter(i.id, b.aktion!.nach, b.aktion!.akteur, b.aktion!.wann)).toThrow(/nur ein Mensch/);
  });

  it("Ablehnung bringt den Grund mit; ohne Grund lehnt der Automat ab", () => {
    const i = bis("pitch");
    const mit = leseZeile(i, zeile(i, { Entscheid: "abgelehnt", "Entscheid von": "Andrej", "Entscheid-Grund": "Zu speziell für unsere Videos" }), JETZT);
    expect(mit.aktion?.grund).toBe("Zu speziell für unsere Videos");
    const ohne = leseZeile(i, zeile(i, { Entscheid: "abgelehnt", "Entscheid von": "Andrej" }), JETZT);
    expect(() => pr.weiter(i.id, ohne.aktion!.nach, ohne.aktion!.akteur, JETZT, { grund: ohne.aktion!.grund })).toThrow(/Grund/);
  });

  it("Look-Wahl a/b/c führt zu «look_gewaehlt» und nimmt die Notiz in die Looks auf", () => {
    const i = bis("looks");
    const b = leseZeile(i, zeile(i, { "Look-Wahl": "c", "Look-Wahl von": "Andrej", "Look-Notiz": "Schrift etwas kleiner" }), JETZT);
    expect(b.aktion).toMatchObject({ nach: "look_gewaehlt", daten: { gewaehlt: "c", notizen: ["Schrift etwas kleiner"] } });
    const neu = pr.weiter(i.id, "look_gewaehlt", b.aktion!.akteur, JETZT, { daten: b.aktion!.daten });
    expect(neu.looks?.gewaehlt).toBe("c");
    expect(neu.looks?.notizen).toContain("Schrift etwas kleiner");
  });

  it("«keiner» verlangt eine Notiz und geht zurück zu «freigegeben»", () => {
    const i = bis("looks");
    const ohne = leseZeile(i, zeile(i, { "Look-Wahl": "keiner", "Look-Wahl von": "Andrej" }), JETZT);
    expect(ohne.aktion).toBeUndefined();
    expect(ohne.hinweise.join(" ")).toMatch(/ohne Notiz/);
    const mit = leseZeile(i, zeile(i, { "Look-Wahl": "keiner", "Look-Wahl von": "Andrej", "Look-Notiz": "Alle drei zu laut" }), JETZT);
    expect(mit.aktion).toMatchObject({ nach: "freigegeben", grund: "Alle drei zu laut" });
    expect(pr.weiter(i.id, "freigegeben", mit.aktion!.akteur, JETZT, { grund: mit.aktion!.grund }).status).toBe("freigegeben");
  });

  it("Abnahme: «abgenommen» braucht ein aktives Stück, «aenderung» eine Notiz", () => {
    const i = bis("render_geprueft");
    const ok = leseZeile(i, zeile(i, { Abnahme: "abgenommen", "Abnahme von": "Andrej" }), JETZT);
    expect(ok.aktion?.nach).toBe("in_bibliothek");
    expect(() => pr.weiter(i.id, "in_bibliothek", ok.aktion!.akteur, JETZT, { stueckAktiviert: false })).toThrow(/nicht aktiviert/);

    const ohne = leseZeile(i, zeile(i, { Abnahme: "aenderung", "Abnahme von": "Andrej" }), JETZT);
    expect(ohne.aktion).toBeUndefined();
    const mit = leseZeile(i, zeile(i, { Abnahme: "aenderung", "Abnahme von": "Andrej", "Abnahme-Notiz": "Linie dünner" }), JETZT);
    expect(mit.aktion).toMatchObject({ nach: "in_bau", grund: "Linie dünner" });
    expect(pr.weiter(i.id, "in_bau", mit.aktion!.akteur, JETZT, { grund: mit.aktion!.grund }).bau?.versuche).toBe(2);
  });

  it("ignoriert Entscheide für Stufen, die noch nicht dran sind, und sagt es", () => {
    const i = bis("pitch");
    const b = leseZeile(i, zeile(i, { "Look-Wahl": "a", Abnahme: "abgenommen" }), JETZT);
    expect(b.aktion).toBeUndefined();
    expect(b.hinweise.join(" ")).toMatch(/Look-Wahl «a» gesetzt, bevor Looks vorliegen/);
    expect(b.hinweise.join(" ")).toMatch(/Abnahme «abgenommen» gesetzt/);
  });

  it("tut nichts, wenn nichts entschieden ist", () => {
    const i = bis("pitch");
    const b = leseZeile(i, zeile(i, { Entscheid: "offen" }), JETZT);
    expect(b).toEqual({ idee: "m-001", hinweise: [] });
  });

  it("meldet Abweichung zwischen Notion-Status und Protokoll", () => {
    const i = bis("freigegeben");
    const b = leseZeile(i, zeile(i, { Status: "pitch" }), JETZT);
    expect(b.hinweise.join(" ")).toMatch(/Notion zeigt «pitch», das Protokoll «freigegeben»/);
  });

  it("liest Zeilenumbrüche, die Notion als <br> liefert, als Zeilenumbruch", () => {
    const i = bis("looks");
    const b = leseZeile(i, zeile(i, { "Look-Wahl": "keiner", "Look-Wahl von": "Andrej", "Look-Notiz": "Zu laut.<br>Linie dünner." }), JETZT);
    expect(b.aktion?.grund).toBe("Zu laut.\nLinie dünner.");
  });

  it("ein kaputtes Datum fällt auf den Lesezeitpunkt zurück", () => {
    const i = bis("pitch");
    const b = leseZeile(i, zeile(i, { Entscheid: "freigegeben", "Entscheid von": "Andrej", "date:Entscheid am:start": "gestern" }), JETZT);
    expect(b.aktion?.wann).toBe(JETZT);
  });
});

describe("Ganze Abfrage", () => {
  it("ordnet Zeilen den Ideen zu und meldet Fremdes", () => {
    const i = bis("pitch");
    const roh = { results: [zeile(i, { Entscheid: "freigegeben", "Entscheid von": "Andrej" }), { Titel: "Neue Idee von Hand", url: "https://app.notion.com/p/x" }], has_more: false };
    const bericht = leseAlle([i, { ...i, id: "m-002" }], zeilenAusAbfrage(roh), JETZT);
    expect(bericht.befunde.map((b) => b.idee)).toEqual(["m-001"]);
    expect(bericht.befunde[0]!.aktion?.nach).toBe("freigegeben");
    expect(bericht.ohneIdee).toEqual([{ url: "https://app.notion.com/p/x", titel: "Neue Idee von Hand" }]);
    expect(bericht.ohneZeile).toEqual(["m-002"]);
  });

  it("liest nur die erste von zwei Zeilen mit derselben Idee-ID", () => {
    const i = bis("pitch");
    const b = leseAlle([i], [zeile(i, { Entscheid: "freigegeben", "Entscheid von": "A" }), zeile(i, { Entscheid: "abgelehnt", "Entscheid von": "B" })], JETZT);
    expect(b.befunde[0]!.aktion?.nach).toBe("freigegeben");
    expect(b.befunde[1]!.hinweise.join(" ")).toMatch(/Zwei Zeilen/);
  });

  it("verlangt das Abfrageformat statt still nichts zu lesen", () => {
    expect(() => zeilenAusAbfrage({ foo: 1 })).toThrow(/results/);
    expect(zeilenAusAbfrage([{ a: 1 }, 5, null])).toEqual([{ a: 1 }]);
  });
});

describe("notion.json", () => {
  it("ist gültig und zeigt auf die Datenbank «Ideen»", () => {
    const z = ladeNotionZiel(path.resolve(__dirname, "../.."));
    expect(z.motionIdeen.datenquelle).toMatch(/^collection:\/\//);
    expect(z.inhalte.ansicht).toMatch(/^view:\/\//);
    expect(z.marken.ansicht).toMatch(/^view:\/\//);
  });
});
