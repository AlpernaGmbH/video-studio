import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { KatalogEintrag } from "../core/schemas";
import type { FotoWerkzeuge, LaufErgebnis } from "../foto/werkzeug";
import type { StudioHome } from "../setup";
import { reelPfade } from "./reel";
import { baueKacheln, fuehreShotlisteAus, type ShotlisteEingabe } from "./shotliste-befehl";
import type { Shotliste } from "./shotliste";

const ID = "c-0007";
const leer: LaufErgebnis = { code: 0, stdout: Buffer.alloc(0), stderr: "" };

let tmp: string;
let home: StudioHome;
let daten: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vs-shotliste-"));
  home = { pfad: path.join(tmp, "studio"), quelle: "STUDIO_HOME" };
  daten = path.join(tmp, "daten");
  fs.mkdirSync(path.join(daten, "katalog", "vorschau"), { recursive: true });
  fs.mkdirSync(reelPfade(home, ID).ergebnis, { recursive: true });
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const eintrag = (schluessel: string, o: Partial<KatalogEintrag> = {}): KatalogEintrag => ({
  schluessel,
  art: "video",
  pfad: `rohmaterial/${schluessel}.mov`,
  titel: "Werkstatt_Gossau_Hände_Pinsel_2026",
  beschreibung: "Hände führen einen Pinsel über eine Holzleiste",
  tags: ["hände", "pinsel"],
  zeitlupe: false,
  log: false,
  personen: false,
  freigabe: "alles erlaubt",
  sicherheit: "hoch",
  ...o,
});
const KATALOG = [eintrag("k-0001"), eintrag("k-0002", { art: "foto", titel: "Fassade_Herisau_Gerüst_2026", beschreibung: "Fassade mit Gerüst im Morgenlicht", tags: ["fassade", "gerüst"] })];

const vorschau = (name: string): string => {
  const p = path.join(daten, "katalog", "vorschau", name);
  fs.writeFileSync(p, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  return p;
};

const liste = (): Shotliste => ({
  schema: 1,
  inhalt: ID,
  titel: "Fassade streichen",
  einstellungen: [
    { nr: 1, abschnitt: "Hook", sprechtext: "Die meisten Fassaden werden im falschen Monat gestrichen.", bild: "Nahaufnahme Hände mit Pinsel", groesse: "nah", dauer: 4, beispiel: "k-0001" },
    { nr: 2, bild: "Fassade im Morgenlicht mit Gerüst", groesse: "totale", dauer: 3, beispiel: "k-0002" },
    { nr: 3, bild: "Handy mit Wetter-App in der Hand", dauer: 2 },
  ],
});

const SKRIPT = "# Fassade streichen\n\nDie meisten Fassaden werden im falschen Monat gestrichen. Das kostet Jahre.\nWir sagen dir, wann es sich lohnt.\nMelde dich bei uns und lass dich beraten.\n";

function eingabe(o: Partial<ShotlisteEingabe> = {}): { e: ShotlisteEingabe; aus: string[]; fehl: string[]; ffmpeg: string[][] } {
  const aus: string[] = [];
  const fehl: string[] = [];
  const ffmpeg: string[][] = [];
  const p = reelPfade(home, ID);
  const werkzeuge: FotoWerkzeuge = {
    ffmpeg: async (args) => {
      ffmpeg.push(args);
      if (args.includes("-filters")) return { ...leer, stdout: Buffer.from(" T.. drawtext  V->V\n") };
      fs.writeFileSync(args[args.length - 1]!, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
      return leer;
    },
    ffprobe: async () => leer,
  };
  fs.writeFileSync(path.join(daten, "katalog.json"), JSON.stringify(KATALOG));
  const e: ShotlisteEingabe = {
    id: ID,
    pfade: p,
    skriptDatei: p.skript,
    titel: "Fassade streichen",
    datenDir: daten,
    geruest: false,
    neu: false,
    werkzeuge,
    schrift: "/f/Arial.ttf",
    jetzt: () => new Date(2026, 9, 23, 10, 0, 0),
    aus: (z) => aus.push(z),
    fehl: (z) => fehl.push(z),
    ...o,
  };
  return { e, aus, fehl, ffmpeg };
}
const schreibeListe = (l: unknown = liste()): void => fs.writeFileSync(reelPfade(home, ID).shotliste, JSON.stringify(l));

describe("--geruest", () => {
  it("schreibt das Gerüst aus dem Skript nach ergebnis/shotliste.json und nennt den nächsten Schritt", async () => {
    const { e, aus, fehl } = eingabe({ geruest: true });
    fs.mkdirSync(path.dirname(e.skriptDatei), { recursive: true });
    fs.writeFileSync(e.skriptDatei, SKRIPT);
    expect(await fuehreShotlisteAus(e)).toBe(0);
    const g = JSON.parse(fs.readFileSync(e.pfade.shotliste, "utf8")) as Shotliste;
    expect(g.inhalt).toBe(ID);
    expect(g.einstellungen.length).toBeGreaterThan(0);
    expect(g.einstellungen.map((x) => x.sprechtext).join(" ")).toContain("Melde dich bei uns und lass dich beraten.");
    expect(fehl).toEqual([]);
    expect(aus.join("\n")).toContain("Annahme");
    expect(aus.join("\n")).toContain(`./studio reel shotliste ${ID}`);
    expect(aus.join("\n")).toContain("./studio katalog liste --suche");
  });

  it("überschreibt eine vorhandene Liste nur mit --neu (die Beschreibungen gingen sonst verloren)", async () => {
    const { e, fehl } = eingabe({ geruest: true });
    fs.mkdirSync(path.dirname(e.skriptDatei), { recursive: true });
    fs.writeFileSync(e.skriptDatei, SKRIPT);
    schreibeListe();
    expect(await fuehreShotlisteAus(e)).toBe(1);
    expect(fehl.join("\n")).toContain("--neu");
    expect(JSON.parse(fs.readFileSync(e.pfade.shotliste, "utf8")).titel).toBe("Fassade streichen");
    expect(await fuehreShotlisteAus({ ...e, neu: true })).toBe(0);
    expect(fs.existsSync(`${e.pfade.shotliste}.neu`)).toBe(false);
  });

  it("ohne Skript sagt der Befehl, was zu tun ist, und schreibt nichts", async () => {
    const { e, fehl } = eingabe({ geruest: true });
    expect(await fuehreShotlisteAus(e)).toBe(1);
    expect(fehl.join("\n")).toContain("Das Skript fehlt");
    expect(fehl.join("\n")).toContain(`reel neu ${ID}`);
    expect(fs.existsSync(e.pfade.shotliste)).toBe(false);
  });

  it("ein Skript ohne Sätze ist ein Fehler, keine leere Liste", async () => {
    const { e, fehl } = eingabe({ geruest: true });
    fs.mkdirSync(path.dirname(e.skriptDatei), { recursive: true });
    fs.writeFileSync(e.skriptDatei, "# Nur ein Titel\n");
    expect(await fuehreShotlisteAus(e)).toBe(1);
    expect(fehl.join("\n")).toContain("keine Sätze");
    expect(fs.existsSync(e.pfade.shotliste)).toBe(false);
  });
});

describe("Prüfen und schreiben", () => {
  it("schreibt den Text und den Bogen, nennt Zahlen, Lücken und den Weg aufs Handy", async () => {
    vorschau("k-0001-b.jpg");
    vorschau("k-0002-a.jpg");
    schreibeListe();
    const { e, aus, fehl, ffmpeg } = eingabe();
    expect(await fuehreShotlisteAus(e)).toBe(0);
    expect(fehl).toEqual([]);
    const text = fs.readFileSync(e.pfade.shotlisteText, "utf8");
    expect(text).toContain("# Shotliste c-0007: Fassade streichen");
    expect(text).toContain("Stand 23.10.2026");
    expect(fs.readFileSync(e.pfade.shotlisteBogen).subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    const aus2 = aus.join("\n");
    expect(aus2).toContain("3 Einstellungen, 2 mit Beispielbild, 1 ohne");
    expect(aus2).toContain("Hinweis: Einstellung 3 hat kein Beispielbild");
    expect(aus2).toContain(`./studio tool hochladen ${ID} --art shotliste,shotliste_bogen`);
    expect(aus2).toContain("Admin Vorschauen");
    // ffmpeg bekommt nur die zwei Vorschaubilder aus dem Katalog als Eingang, nichts aus dem Netz
    const lauf = ffmpeg.find((a) => !a.includes("-filters"))!;
    expect(lauf.filter((x) => x === "-i")).toHaveLength(2);
    expect(lauf.join(" ")).not.toMatch(/https?:/);
    // keine Zwischendatei bleibt liegen
    expect(fs.readdirSync(e.pfade.ergebnis).filter((n) => n.endsWith(".neu"))).toEqual([]);
  });

  it("ohne Liste: Hinweis auf --geruest, nichts geschrieben", async () => {
    const { e, fehl } = eingabe();
    expect(await fuehreShotlisteAus(e)).toBe(1);
    expect(fehl.join("\n")).toContain("Es gibt noch keine Shotliste");
    expect(fehl.join("\n")).toContain("--geruest");
    expect(fs.existsSync(e.pfade.shotlisteText)).toBe(false);
  });

  it("kein gültiges JSON: Fehler mit Grund", async () => {
    fs.writeFileSync(reelPfade(home, ID).shotliste, "{ kaputt");
    const { e, fehl } = eingabe();
    expect(await fuehreShotlisteAus(e)).toBe(1);
    expect(fehl.join("\n")).toContain("kein gültiges JSON");
  });

  it("eine ungültige Liste schreibt weder Text noch Bogen, und eine alte Datei bleibt, wie sie war", async () => {
    const l = liste();
    l.einstellungen[0]!.beispiel = "k-9999";
    schreibeListe(l);
    fs.writeFileSync(reelPfade(home, ID).shotlisteText, "alter Text");
    const { e, fehl } = eingabe();
    expect(await fuehreShotlisteAus(e)).toBe(1);
    expect(fehl.join("\n")).toContain("nichts geschrieben");
    expect(fehl.join("\n")).toContain("«k-9999» gibt es nicht");
    expect(fs.readFileSync(e.pfade.shotlisteText, "utf8")).toBe("alter Text");
    expect(fs.existsSync(e.pfade.shotlisteBogen)).toBe(false);
  });

  it("das nicht ausgefüllte Gerüst besteht die Prüfung nicht", async () => {
    const { e, fehl } = eingabe({ geruest: true });
    fs.mkdirSync(path.dirname(e.skriptDatei), { recursive: true });
    fs.writeFileSync(e.skriptDatei, SKRIPT);
    await fuehreShotlisteAus(e);
    expect(await fuehreShotlisteAus({ ...e, geruest: false })).toBe(1);
    expect(fehl.join("\n")).toContain("Nicht ausgefüllt");
  });

  it("zu Einstellungen ohne Bild nennt der Befehl Vorschläge und übernimmt keinen", async () => {
    const l = liste();
    l.einstellungen[2]!.bild = "Gerüst an der Fassade im Morgenlicht";
    schreibeListe(l);
    vorschau("k-0001-b.jpg");
    vorschau("k-0002-a.jpg");
    const { e, aus } = eingabe();
    expect(await fuehreShotlisteAus(e)).toBe(0);
    expect(aus.join("\n")).toContain("Vorschlag für Einstellung 3 (nach Wörtern gefunden, nicht übernommen): k-0002 «Fassade_Herisau_Gerüst_2026»");
    expect(fs.readFileSync(e.pfade.shotlisteText, "utf8")).toContain("Beispielbild: keines (Lücke im Katalog)");
  });

  it("fehlt der Katalog, ist jeder gewählte Schlüssel ein Fehler, und der Befehl sagt es", async () => {
    schreibeListe();
    const { e, fehl } = eingabe();
    fs.rmSync(path.join(daten, "katalog.json"));
    expect(await fuehreShotlisteAus(e)).toBe(1);
    expect(fehl.join("\n")).toContain("Kein Katalog gefunden");
    expect(fehl.join("\n")).toContain("gibt es nicht");
  });

  it("--katalog mit einer Datei, die es nicht gibt, ist ein Fehler", async () => {
    schreibeListe();
    const { e, fehl } = eingabe({ katalogDatei: path.join(tmp, "nein.json") });
    expect(await fuehreShotlisteAus(e)).toBe(1);
    expect(fehl.join("\n")).toContain("Katalog fehlt");
  });

  it("--datei liest die Liste von woanders und legt die geprüfte Fassung nach ergebnis/shotliste.json", async () => {
    vorschau("k-0001-b.jpg");
    vorschau("k-0002-a.jpg");
    const fremd = path.join(tmp, "antwort.json");
    fs.writeFileSync(fremd, JSON.stringify(liste()));
    const { e } = eingabe({ datei: fremd });
    expect(await fuehreShotlisteAus(e)).toBe(0);
    expect(JSON.parse(fs.readFileSync(e.pfade.shotliste, "utf8")).titel).toBe("Fassade streichen");
    expect(fs.existsSync(e.pfade.shotlisteText)).toBe(true);
  });

  it("ohne Schrift ist der Text geschrieben, der Bogen nicht, und der Befehl endet mit Exit 1 und einem Rat", async () => {
    schreibeListe();
    const { e, fehl } = eingabe();
    // eine leere Angabe übersteuert die Suche nach einer Systemschrift: so fehlt sie auch auf einem Rechner, der eine hat
    expect(await fuehreShotlisteAus({ ...e, schrift: "" })).toBe(1);
    expect(fehl.join("\n")).toContain("STUDIO_FONT");
    expect(fs.existsSync(e.pfade.shotlisteText)).toBe(true);
    expect(fs.existsSync(e.pfade.shotlisteBogen)).toBe(false);
  });

  it("schlägt ffmpeg fehl, bleibt der Text, der Bogen fehlt, Exit 1 mit dem Grund", async () => {
    schreibeListe();
    const { e, fehl } = eingabe();
    const kaputt: FotoWerkzeuge = {
      ffmpeg: async (args) => (args.includes("-filters") ? { ...leer, stdout: Buffer.from(" T.. drawtext  V->V\n") } : { code: 1, stdout: Buffer.alloc(0), stderr: "Invalid argument" }),
      ffprobe: async () => leer,
    };
    expect(await fuehreShotlisteAus({ ...e, werkzeuge: kaputt })).toBe(1);
    expect(fehl.join("\n")).toContain("schlug beim Bogen der Shotliste fehl");
    expect(fs.existsSync(e.pfade.shotlisteText)).toBe(true);
    expect(fs.existsSync(e.pfade.shotlisteBogen)).toBe(false);
  });

  it("der Text trägt keinen Pfad des Rechners", async () => {
    vorschau("k-0001-b.jpg");
    vorschau("k-0002-a.jpg");
    schreibeListe();
    const { e } = eingabe();
    await fuehreShotlisteAus(e);
    const text = fs.readFileSync(e.pfade.shotlisteText, "utf8");
    expect(text).not.toContain(tmp);
    expect(text).not.toContain("rohmaterial/");
    expect(text).not.toMatch(/\.(mov|mp4|jpg)\b/i);
  });
});

describe("baueKacheln", () => {
  it("nimmt bei einem Video die Mitte, sonst Anfang und Ende; bei einem Foto das Bild a", () => {
    const b = vorschau("k-0001-b.jpg");
    const a2 = vorschau("k-0002-a.jpg");
    const k = baueKacheln(liste(), KATALOG, daten);
    expect(k[0]!.bild).toBe(b);
    expect(k[1]!.bild).toBe(a2);
    fs.rmSync(b);
    vorschau("k-0001-c.jpg");
    expect(baueKacheln(liste(), KATALOG, daten)[0]!.bild).toBe(path.join(daten, "katalog", "vorschau", "k-0001-c.jpg"));
  });

  it("ein Schlüssel ohne Vorschaubild auf der Platte ist «Vorschaubild fehlt», keine Einstellung ohne Beispiel «Kein Beispielbild»", () => {
    const k = baueKacheln(liste(), KATALOG, daten);
    expect(k[0]!.bild).toBeUndefined();
    expect(k[0]!.platzhalter).toBe("Vorschaubild fehlt");
    expect(k[2]!.platzhalter).toBe("Kein Beispielbild");
  });

  it("der Streifen: Kopf, Schlüssel oder «kein Beispielbild», dann höchstens drei Zeilen Beschreibung", () => {
    const l = liste();
    l.einstellungen[0]!.bild = "Nahaufnahme: Hände führen ruhig einen breiten Pinsel über die Holzleiste, Licht von links und noch viel mehr Text";
    const k = baueKacheln(l, KATALOG, daten);
    const zeilen = k[0]!.text.split("\n");
    expect(zeilen[0]).toBe("1 · Nah · 4 s");
    expect(zeilen[1]).toBe("k-0001");
    expect(zeilen.length).toBeLessThanOrEqual(5);
    expect(zeilen.at(-1)!.endsWith("…")).toBe(true);
    expect(k[2]!.text.split("\n")[1]).toBe("kein Beispielbild");
  });
});
