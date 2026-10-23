import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { parseArgs } from "../args";
import { Markenprofil } from "../core/schemas";
import { umgebung, type Umgebung } from "../motion/werkstatt";
import { batchDir, batchId, erzeugeMuster, FotoStand, liesStand, pruefeTypUndMarke, pruefsumme, standardBelichtung, wendeAn, baueLookCube } from "./batch";
import { fotoBefehl } from "./befehle";
import { ladeFotoLooks, FotoLook } from "./looks";
import { messeFoto } from "./werkzeug";
import { echteWerkzeuge, jpegMitDrehung } from "./werkzeug";
import { loeseOrdnerAuf } from "./ordner";

const hatFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
const root = path.resolve(import.meta.dirname, "..", "..");
const ablageDir = path.join(root, "library", "foto-looks");

/* ---------- Hilfen ---------- */

/**
 * Ein Verlauf von links nach rechts: Helligkeitscode `von` bis `bis` (je 0 bis 255) als JPEG mit vollem Bereich.
 * Ohne `scale=in_range=pc:out_range=pc` hält ffmpeg die Werte für begrenzten Bereich und dehnt sie beim Schreiben (30 wird 16): Ein unabhängiger Leser (PIL) hat es gezeigt.
 */
function schreibeVerlauf(datei: string, von: number, bis: number): void {
  fs.mkdirSync(path.dirname(datei), { recursive: true });
  const r = spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", `nullsrc=s=320x240:d=1,format=yuv420p,geq=lum='${von}+(${bis - von})*X/W':cb=128:cr=128,scale=in_range=pc:out_range=pc,format=yuvj420p`, "-frames:v", "1", "-q:v", "2", datei]);
  if (r.status !== 0) throw new Error(`Testfoto nicht geschrieben: ${r.stderr}`);
}

const sha = (datei: string): string => createHash("sha256").update(fs.readFileSync(datei)).digest("hex");
const alleDateien = (ordner: string): string[] => {
  const aus: string[] = [];
  const gehe = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) gehe(path.join(d, e.name));
      else aus.push(path.join(d, e.name));
    }
  };
  gehe(ordner);
  return aus.sort();
};
const masse = (datei: string): { breite: number; hoehe: number } => {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", datei], { encoding: "utf8" });
  const [b, h] = r.stdout.trim().split(",").map(Number);
  return { breite: b!, hoehe: h! };
};
const istJpeg = (datei: string): boolean => {
  const kopf = fs.readFileSync(datei).subarray(0, 3);
  return kopf[0] === 0xff && kopf[1] === 0xd8 && kopf[2] === 0xff;
};

interface Arbeitsplatz {
  tmp: string;
  medien: string;
  env: Umgebung;
  ausgabe: string[];
  befehl: (...argv: string[]) => Promise<number>;
  text: () => string;
}

function baueArbeitsplatz(): Arbeitsplatz {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "studio-foto-"));
  const medien = path.join(tmp, "Medien");
  fs.mkdirSync(medien);
  const markenDir = path.join(tmp, "marken");
  fs.mkdirSync(markenDir);
  for (const n of ["alperna", "nordlicht"]) fs.copyFileSync(path.join(root, "marken", `${n}.json`), path.join(markenDir, `${n}.json`));
  const env: Umgebung = { ...umgebung(root), markenDir, datenDir: path.join(tmp, "daten") };
  const ausgabe: string[] = [];
  return {
    tmp,
    medien,
    env,
    ausgabe,
    befehl: (...argv) => fotoBefehl(argv[0]!, parseArgs(["foto", ...argv]), env, { schrift: null, oeffne: () => {} }),
    text: () => ausgabe.join("\n"),
  };
}

let platz: Arbeitsplatz;
const stub = (p: Arbeitsplatz): void => {
  // Studio-Ordner und Medien-Ordner sind derselbe Ordner (kein eigenes Laufwerk): die Wurzel heisst dann «studio»
  vi.stubEnv("STUDIO_HOME", p.medien);
  vi.stubEnv("STUDIO_MEDIEN", p.medien);
  vi.spyOn(console, "log").mockImplementation((...x: unknown[]) => void p.ausgabe.push(x.join(" ")));
  vi.spyOn(console, "error").mockImplementation((...x: unknown[]) => void p.ausgabe.push(x.join(" ")));
};

/* ---------- reine Regeln ---------- */

describe("Typ und Marke", () => {
  it("Kundenfotos brauchen die Marke des Kunden, nie die eigene", () => {
    expect(() => pruefeTypUndMarke("kunde", undefined)).toThrow(/--marke/);
    expect(() => pruefeTypUndMarke("kunde", "alperna")).toThrow(/nicht «alperna»/);
    expect(pruefeTypUndMarke("kunde", "nordlicht")).toBe("nordlicht");
  });

  it("hinter den Kulissen gilt standardmässig die eigene Marke, eine andere ist erlaubt", () => {
    expect(pruefeTypUndMarke("bts", undefined)).toBe("alperna");
    expect(pruefeTypUndMarke("bts", "nordlicht")).toBe("nordlicht");
  });
});

describe("Kennung der Ablage", () => {
  it("lesbar, ohne Umlaute und Sonderzeichen, mit Prüfsumme gegen Verwechslung", () => {
    const a = batchId("Kunde Küche/Tag 1");
    expect(a).toMatch(/^kunde-kuche-tag-1-[0-9a-f]{6}$/);
    expect(batchId("kunde-kuche-tag-1")).not.toBe(a);
    expect(batchId("Kunde Küche/Tag 1".normalize("NFD"))).toBe(a);
  });

  it("ein Name nur aus Sonderzeichen bekommt trotzdem eine Kennung", () => {
    expect(batchId("???")).toMatch(/^fotos-[0-9a-f]{6}$/);
  });
});

describe("Belichtung ohne Log", () => {
  it("0 Blenden ändert nichts, +1 verdoppelt das Licht (Mitte 0,5 wird 0,5·2^(1/2,2) im Bild)", () => {
    expect(standardBelichtung(0)).toBeUndefined();
    const f = standardBelichtung(1)!;
    const aus = f({ r: 0.5, g: 0.5, b: 0.5 });
    expect(aus.r).toBeCloseTo(Math.pow(Math.pow(0.5, 2.2) * 2, 1 / 2.2), 9);
    expect(aus.r).toBeGreaterThan(0.5);
    expect(f({ r: 1, g: 1, b: 1 }).r).toBe(1);
    expect(f({ r: 0, g: 0, b: 0 }).r).toBe(0);
  });
});

describe("Prüfsumme eines Looks", () => {
  const look = ladeFotoLooks(ablageDir)[0]!;
  it("ändert sich mit allem, was das Bild bestimmt, und mit sonst nichts", () => {
    const p = pruefsumme(look, "vlog", 0);
    expect(pruefsumme(look, "vlog", 0)).toBe(p);
    expect(pruefsumme({ ...look, name: "Anders", stimmung: "Anders" }, "vlog", 0)).toBe(p);
    expect(pruefsumme({ ...look, farblook: { ...look.farblook, kontrast: look.farblook.kontrast + 0.1 } }, "vlog", 0)).not.toBe(p);
    expect(pruefsumme({ ...look, korn: 0.5 }, "vlog", 0)).not.toBe(p);
    expect(pruefsumme(look, "standard", 0)).not.toBe(p);
    expect(pruefsumme(look, "vlog", 0.5)).not.toBe(p);
    expect(pruefsumme(null, "vlog", 0)).not.toBe(p);
  });
});

describe.skipIf(!hatFfmpeg)("Look als LUT", () => {
  it("Standard-Profil ohne Look und ohne Belichtung braucht keine LUT; mit Look gibt es eine 33er-LUT", () => {
    expect(baueLookCube(null, "standard", 0)).toBeUndefined();
    expect(baueLookCube(ladeFotoLooks(ablageDir)[0]!, "standard", 0)).toMatch(/LUT_3D_SIZE 33/);
  });
  it("V-Log hat immer eine LUT (die Umrechnung), auch ohne Look: 65er-Gitter", () => {
    expect(baueLookCube(null, "vlog", 0)).toMatch(/LUT_3D_SIZE 65/);
  });
});

/* ---------- der Ablauf auf der Platte ---------- */

describe.skipIf(!hatFfmpeg)("Foto-Batch mit V-Log-Fotos", () => {
  let originale: Record<string, string>;
  let ordner: string;

  beforeAll(async () => {
    platz = baueArbeitsplatz();
    stub(platz);
    ordner = path.join(platz.medien, "kunde-a");
    schreibeVerlauf(path.join(ordner, "IMG_0001.JPG"), 30, 130);
    schreibeVerlauf(path.join(ordner, "IMG_0002.jpg"), 45, 150);
    schreibeVerlauf(path.join(ordner, "tag1", "IMG_0003.jpg"), 60, 170);
    schreibeVerlauf(path.join(ordner, "tag1", "IMG_0004.jpg"), 38, 120);
    schreibeVerlauf(path.join(ordner, "tag1", "IMG_0005.jpg"), 52, 160);
    fs.writeFileSync(path.join(ordner, "kaputt.jpg"), "das ist kein Foto");
    fs.writeFileSync(path.join(ordner, "IMG_0006.RW2"), "roh");
    originale = Object.fromEntries(alleDateien(ordner).map((d) => [d, sha(d)]));
  }, 120_000);

  afterAll(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    fs.rmSync(platz.tmp, { recursive: true, force: true });
  });

  it("muster: erkennt V-Log, wählt drei lesbare Fotos und zeichnet den Bogen (Basis und fünf Looks)", { timeout: 180_000 }, async () => {
    expect(await platz.befehl("muster", "kunde-a", "--typ", "kunde", "--marke", "nordlicht", "--nicht-oeffnen")).toBe(0);
    const dir = batchDir(platz.env.datenDir, batchId("kunde-a"));
    const stand = FotoStand.parse(JSON.parse(fs.readFileSync(path.join(dir, "foto.json"), "utf8")));
    expect(stand).toMatchObject({ typ: "kunde", marke: "nordlicht", ordner: "kunde-a", profil: "vlog", profilQuelle: "erkannt", belichtung: 0, fotos: 6, unlesbar: ["kaputt.jpg"] });
    expect(stand.muster).toHaveLength(3);
    expect(stand.muster.map((m) => m.datei)).not.toContain("kaputt.jpg");
    expect(stand.looks.map((l) => l.id)).toEqual(["klare-kante", "klare-luft", "leiser-film", "stiller-morgen", "warmes-licht"]);
    expect(stand.gewaehlt).toBeUndefined();

    const bogen = path.join(dir, "muster.jpg");
    expect(istJpeg(bogen)).toBe(true);
    // ohne Schrift keine Beschriftungsstreifen: 6 Spalten (Basis und fünf Looks) mal 360; die Testfotos sind 320 mal 240, also ist jede Zelle 360 mal 270
    expect(masse(bogen)).toEqual({ breite: 6 * 360, hoehe: 3 * 270 });
    const legende = fs.readFileSync(path.join(dir, "muster.md"), "utf8");
    expect(legende).toContain("Basis (nur Umrechnung)");
    expect(legende).toContain("1 Bilder in einem anderen Format übersprungen");
    expect(legende).toContain("--mensch --by");
    expect(legende).toMatch(/nicht belegt/);
    expect(platz.text()).toContain("Nicht lesbar: kaputt.jpg");
  });

  it("die Originale sind nach dem Muster unverändert, und es entstehen keine Dateien im Fotoordner", () => {
    expect(Object.fromEntries(alleDateien(ordner).map((d) => [d, sha(d)]))).toEqual(originale);
  });

  it("anwenden ohne Mensch, ohne Namen oder mit einem Look, der nicht gezeigt wurde: abgelehnt, nichts geschrieben", async () => {
    await expect(platz.befehl("anwenden", "kunde-a", "--look", "klare-luft")).rejects.toThrow(/trifft ein Mensch/);
    await expect(platz.befehl("anwenden", "kunde-a", "--look", "klare-luft", "--mensch")).rejects.toThrow(/--by/);
    await expect(platz.befehl("anwenden", "kunde-a", "--look", "gibt-es-nicht", "--mensch", "--by", "Andrej")).rejects.toThrow(/nicht auf dem Muster.*klare-kante, klare-luft/);
    await expect(platz.befehl("anwenden", "kunde-a", "--mensch", "--by", "Andrej")).rejects.toThrow(/--look/);
    expect(fs.existsSync(path.join(ordner, "bearbeitet-klare-luft"))).toBe(false);
    expect(liesStand(batchDir(platz.env.datenDir, batchId("kunde-a")))?.gewaehlt).toBeUndefined();
  });

  it("anwenden: alle lesbaren Fotos bearbeitet, die Struktur der Unterordner bleibt, das kaputte Foto steht als Fehler", { timeout: 240_000 }, async () => {
    expect(await platz.befehl("anwenden", "kunde-a", "--look", "klare-luft", "--mensch", "--by", "Andrej")).toBe(1);
    const aus = path.join(ordner, "bearbeitet-klare-luft");
    expect(alleDateien(aus).map((d) => path.relative(aus, d))).toEqual(["IMG_0001.jpg", "IMG_0002.jpg", "foto-batch.json", "tag1/IMG_0003.jpg", "tag1/IMG_0004.jpg", "tag1/IMG_0005.jpg"]);
    for (const d of alleDateien(aus).filter((x) => x.endsWith(".jpg"))) {
      expect(istJpeg(d)).toBe(true);
      expect(masse(d)).toEqual({ breite: 320, hoehe: 240 });
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(aus, "foto-batch.json"), "utf8"));
    expect(manifest).toMatchObject({ look: "klare-luft", gewaehltVon: "Andrej", neu: 5, schonVorhanden: 0, profil: "vlog", typ: "kunde", marke: "nordlicht" });
    expect(manifest.fehler.map((f: { datei: string }) => f.datei)).toEqual(["kaputt.jpg"]);
    const stand = liesStand(batchDir(platz.env.datenDir, batchId("kunde-a")))!;
    expect(stand.gewaehlt).toMatchObject({ look: "klare-luft", von: "Andrej" });
    expect(stand.angewendet).toMatchObject({ look: "klare-luft", ok: 5, vorhanden: 0, ausgabe: "kunde-a/bearbeitet-klare-luft" });
    expect(platz.text()).toContain("Die Originale sind unverändert");
  });

  it("die Originale sind nach dem Anwenden Byte für Byte dieselben", () => {
    const jetzt = Object.fromEntries(alleDateien(ordner).filter((d) => !d.includes(`${path.sep}bearbeitet-`)).map((d) => [d, sha(d)]));
    expect(jetzt).toEqual(originale);
  });

  it("die V-Log-Umrechnung wirkt: der Tonumfang der Ergebnisse ist deutlich grösser als der der flachen Originale", async () => {
    const vorher = await messeFoto(echteWerkzeuge, path.join(ordner, "IMG_0002.jpg"), "a");
    const nachher = await messeFoto(echteWerkzeuge, path.join(ordner, "bearbeitet-klare-luft", "IMG_0002.jpg"), "b");
    const umfangVorher = vorher.p98 - vorher.p2;
    const umfangNachher = nachher.p98 - nachher.p2;
    expect(umfangVorher).toBeLessThan(0.5);
    expect(umfangNachher).toBeGreaterThan(umfangVorher * 1.4);
  });

  it("ein zweiter Lauf rührt Vorhandenes nicht an; --neu rechnet alles neu", { timeout: 240_000 }, async () => {
    const aus = path.join(ordner, "bearbeitet-klare-luft");
    const vorher = sha(path.join(aus, "IMG_0001.jpg"));
    const zeit = fs.statSync(path.join(aus, "IMG_0001.jpg")).mtimeMs;
    expect(await platz.befehl("anwenden", "kunde-a", "--look", "klare-luft", "--mensch", "--by", "Andrej")).toBe(1);
    expect(platz.text()).toContain("0 neu bearbeitet, 5 waren schon da, 1 Fehler");
    expect(fs.statSync(path.join(aus, "IMG_0001.jpg")).mtimeMs).toBe(zeit);
    expect(sha(path.join(aus, "IMG_0001.jpg"))).toBe(vorher);
    expect(await platz.befehl("anwenden", "kunde-a", "--look", "klare-luft", "--mensch", "--by", "Andrej", "--neu")).toBe(1);
    expect(platz.text()).toContain("5 neu bearbeitet, 0 waren schon da");
  });

  it("ein früheres Ergebnis wird beim nächsten Muster nicht als Foto gezählt", { timeout: 180_000 }, async () => {
    expect(await platz.befehl("muster", "kunde-a", "--typ", "kunde", "--marke", "nordlicht", "--nicht-oeffnen")).toBe(0);
    const stand = liesStand(batchDir(platz.env.datenDir, batchId("kunde-a")))!;
    expect(stand.fotos).toBe(6);
    // ein neues Muster setzt Wahl und Ergebnis zurück
    expect(stand.gewaehlt).toBeUndefined();
    expect(stand.angewendet).toBeUndefined();
  });

  it("status berichtet den Stand", async () => {
    await platz.befehl("status", "kunde-a");
    expect(platz.text()).toContain("Gewählt: noch nichts");
    await platz.befehl("status", "gibt-es-noch-nicht-aber-ordner").catch(() => {});
  });
});

describe.skipIf(!hatFfmpeg)("Foto-Batch: Fälle am Rand", () => {
  beforeEach(() => {
    platz = baueArbeitsplatz();
    stub(platz);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    fs.rmSync(platz.tmp, { recursive: true, force: true });
  });

  it("fertig gerechnete Fotos: Profil Standard, die erste Spalte heisst «Original», kein V-Log-Aufhellen", { timeout: 180_000 }, async () => {
    for (const [n, v] of [["a", 0], ["b", 10], ["c", 5]] as const) schreibeVerlauf(path.join(platz.medien, "std", `${n}.jpg`), v, 255);
    expect(await platz.befehl("muster", "std", "--typ", "bts", "--nicht-oeffnen")).toBe(0);
    const stand = liesStand(batchDir(platz.env.datenDir, batchId("std")))!;
    expect(stand).toMatchObject({ typ: "bts", marke: "alperna", profil: "standard", profilQuelle: "erkannt" });
    // Alperna hat einen Look über der V-Log-Basis: er kommt als erster dazu
    expect(stand.looks.map((l) => l.id)).toEqual(["marke", "klare-kante", "klare-luft", "leiser-film", "stiller-morgen", "warmes-licht"]);
    expect(fs.readFileSync(path.join(batchDir(platz.env.datenDir, batchId("std")), "muster.md"), "utf8")).toContain("1. Original");
    expect(masse(path.join(batchDir(platz.env.datenDir, batchId("std")), "muster.jpg")).breite).toBe(7 * 360);
  });

  it("Standard-Profil: das Ergebnis behält den Tonumfang, Schwarz bleibt Schwarz", { timeout: 180_000 }, async () => {
    schreibeVerlauf(path.join(platz.medien, "std2", "a.jpg"), 0, 255);
    expect(await platz.befehl("muster", "std2", "--typ", "bts", "--nicht-oeffnen")).toBe(0);
    expect(await platz.befehl("anwenden", "std2", "--look", "klare-luft", "--mensch", "--by", "Leander")).toBe(0);
    const vorher = await messeFoto(echteWerkzeuge, path.join(platz.medien, "std2", "a.jpg"), "a");
    const nachher = await messeFoto(echteWerkzeuge, path.join(platz.medien, "std2", "bearbeitet-klare-luft", "a.jpg"), "a");
    expect(nachher.p2).toBeLessThan(0.06);
    expect(nachher.p98).toBeGreaterThan(0.9);
    expect(Math.abs(nachher.p98 - nachher.p2 - (vorher.p98 - vorher.p2))).toBeLessThan(0.1);
  });

  it("Hälfte flach, Hälfte nicht: der Batch verlangt das Profil und nennt die Zahlen; mit --profil läuft es", { timeout: 180_000 }, async () => {
    schreibeVerlauf(path.join(platz.medien, "gemischt", "a.jpg"), 30, 130);
    schreibeVerlauf(path.join(platz.medien, "gemischt", "b.jpg"), 40, 140);
    schreibeVerlauf(path.join(platz.medien, "gemischt", "c.jpg"), 0, 255);
    schreibeVerlauf(path.join(platz.medien, "gemischt", "d.jpg"), 0, 250);
    await expect(platz.befehl("muster", "gemischt", "--typ", "bts", "--nicht-oeffnen")).rejects.toThrow(/50 % sind flach.*--profil vlog oder --profil standard/);
    expect(fs.existsSync(path.join(platz.env.datenDir, "foto"))).toBe(false);
    expect(await platz.befehl("muster", "gemischt", "--typ", "bts", "--profil", "vlog", "--nicht-oeffnen")).toBe(0);
    expect(liesStand(batchDir(platz.env.datenDir, batchId("gemischt")))).toMatchObject({ profil: "vlog", profilQuelle: "angegeben" });
  });

  it("Hochformat nach EXIF-Drehung kommt aufrecht heraus (Metadaten werden gestrichen, die Drehung bleibt im Bild)", { timeout: 180_000 }, async () => {
    const roh = path.join(platz.tmp, "quer.jpg");
    schreibeVerlauf(roh, 0, 255);
    const ziel = path.join(platz.medien, "dreh", "hoch.jpg");
    fs.mkdirSync(path.dirname(ziel), { recursive: true });
    fs.writeFileSync(ziel, jpegMitDrehung(fs.readFileSync(roh), 6));
    // ffprobe nennt die Grösse der Pixel, die Drehung steht nur in den Metadaten
    expect(masse(ziel)).toEqual({ breite: 320, hoehe: 240 });
    expect(await platz.befehl("muster", "dreh", "--typ", "bts", "--nicht-oeffnen")).toBe(0);
    // das aufgerichtete Foto ist 240 mal 320 (Seitenverhältnis 4:3 hoch): die Zelle wird 360 mal 480, nicht quadratisch
    expect(masse(path.join(batchDir(platz.env.datenDir, batchId("dreh")), "muster.jpg")).hoehe).toBe(480);
    expect(await platz.befehl("anwenden", "dreh", "--look", "klare-luft", "--mensch", "--by", "Andrej")).toBe(0);
    expect(masse(path.join(platz.medien, "dreh", "bearbeitet-klare-luft", "hoch.jpg"))).toEqual({ breite: 240, hoehe: 320 });
  });

  it("mit eigenem Medien-Ordner: Fotos dort werden gefunden, die Wurzel steht im Stand, die Kennung unterscheidet die Wurzeln", { timeout: 180_000 }, async () => {
    const studio = path.join(platz.tmp, "Studio");
    fs.mkdirSync(studio);
    vi.stubEnv("STUDIO_HOME", studio);
    schreibeVerlauf(path.join(platz.medien, "laufwerk", "a.jpg"), 30, 130);
    expect(await platz.befehl("muster", "laufwerk", "--typ", "bts", "--nicht-oeffnen")).toBe(0);
    const stand = liesStand(batchDir(platz.env.datenDir, batchId("laufwerk", "medien")))!;
    expect(stand).toMatchObject({ wurzel: "medien", ordner: "laufwerk" });
    expect(liesStand(batchDir(platz.env.datenDir, batchId("laufwerk", "studio")))).toBeUndefined();
    // derselbe relative Pfad im Studio-Ordner ist ein anderer Ordner mit eigenem Muster
    schreibeVerlauf(path.join(studio, "laufwerk", "b.jpg"), 40, 140);
    expect(await platz.befehl("muster", "laufwerk", "--typ", "bts", "--nicht-oeffnen")).toBe(0);
    expect(liesStand(batchDir(platz.env.datenDir, batchId("laufwerk", "studio")))).toMatchObject({ wurzel: "studio" });
    expect(liesStand(batchDir(platz.env.datenDir, batchId("laufwerk", "medien")))).toMatchObject({ wurzel: "medien" });
  });

  it("Regeln für Typ und Marke gelten schon im Befehl", async () => {
    schreibeVerlauf(path.join(platz.medien, "x", "a.jpg"), 0, 255);
    await expect(platz.befehl("muster", "x", "--nicht-oeffnen")).rejects.toThrow(/--typ/);
    await expect(platz.befehl("muster", "x", "--typ", "privat", "--nicht-oeffnen")).rejects.toThrow(/--typ/);
    await expect(platz.befehl("muster", "x", "--typ", "kunde", "--nicht-oeffnen")).rejects.toThrow(/--marke/);
    await expect(platz.befehl("muster", "x", "--typ", "kunde", "--marke", "alperna", "--nicht-oeffnen")).rejects.toThrow(/nicht «alperna»/);
    await expect(platz.befehl("muster", "x", "--typ", "kunde", "--marke", "gibt-es-nicht", "--nicht-oeffnen")).rejects.toThrow(/Markenprofil/);
    await expect(platz.befehl("muster", "x", "--typ", "bts", "--profil", "rot", "--nicht-oeffnen")).rejects.toThrow(/--profil/);
    await expect(platz.befehl("muster", "x", "--typ", "bts", "--belichtung", "7", "--nicht-oeffnen")).rejects.toThrow(/--belichtung/);
    expect(fs.existsSync(path.join(platz.env.datenDir, "foto"))).toBe(false);
  });

  it("ein Ordner ausserhalb des Medien-Ordners wird abgelehnt, bevor irgendetwas gelesen wird", async () => {
    schreibeVerlauf(path.join(platz.tmp, "draussen", "a.jpg"), 0, 255);
    await expect(platz.befehl("muster", path.join(platz.tmp, "draussen"), "--typ", "bts", "--nicht-oeffnen")).rejects.toThrow(/nicht im Studio- oder Medien-Ordner/);
    await expect(platz.befehl("muster", "../draussen", "--typ", "bts", "--nicht-oeffnen")).rejects.toThrow(/nicht im Studio- oder Medien-Ordner/);
  });

  it("ein Ordner ohne JPEG-Fotos sagt, was stattdessen da ist", async () => {
    fs.mkdirSync(path.join(platz.medien, "roh"));
    fs.writeFileSync(path.join(platz.medien, "roh", "a.RW2"), "roh");
    await expect(platz.befehl("muster", "roh", "--typ", "bts", "--nicht-oeffnen")).rejects.toThrow(/keine JPEG-Fotos.*1 Bilder in einem anderen Format/);
  });

  it("anwenden ohne Muster verweist auf den Befehl dafür", async () => {
    schreibeVerlauf(path.join(platz.medien, "neu", "a.jpg"), 0, 255);
    await expect(platz.befehl("anwenden", "neu", "--look", "klare-luft", "--mensch", "--by", "Andrej")).rejects.toThrow(/noch kein Muster.*foto muster/);
  });

  it("zwei Fotos mit demselben Ergebnisnamen werden vor dem Rechnen abgelehnt", async () => {
    schreibeVerlauf(path.join(platz.medien, "dop", "a.jpg"), 0, 255);
    schreibeVerlauf(path.join(platz.medien, "dop", "a.jpeg"), 0, 255);
    await expect(platz.befehl("muster", "dop", "--typ", "bts", "--nicht-oeffnen")).rejects.toThrow(/dieselbe Datei/);
  });

  it("looks listet die Looks, mit dem der Marke zuerst", async () => {
    expect(await platz.befehl("looks", "--marke", "alperna")).toBe(0);
    const t = platz.text();
    expect(t).toMatch(/marke\s+Look von Alperna/);
    expect(t).toContain("warmes-licht");
    expect(t).toContain("6 Looks");
  });
});

describe.skipIf(!hatFfmpeg)("Die Wahl beruht auf dem, was gezeigt wurde", () => {
  let tmp: string;
  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "studio-foto-api-"));
  });
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const nordlicht = (): Markenprofil => Markenprofil.parse(JSON.parse(fs.readFileSync(path.join(root, "marken", "nordlicht.json"), "utf8")));
  const eins: FotoLook = FotoLook.parse({ id: "test", name: "Test", stimmung: "Test", herkunft: "Test", farblook: { gamma: 1, kontrast: 0.2, saettigung: 1, kuehle: 0 } });

  it("ändert sich ein Look nach dem Muster, wird die alte Wahl nicht mehr angewendet", { timeout: 180_000 }, async () => {
    const medien = path.join(tmp, "Medien");
    const daten = path.join(tmp, "daten");
    schreibeVerlauf(path.join(medien, "f", "a.jpg"), 30, 130);
    const ordner = loeseOrdnerAuf("f", [{ name: "medien", pfad: medien }]);
    const gemeinsam = { ordner, datenDir: daten, werkzeuge: echteWerkzeuge, jetzt: () => "2026-10-23T10:00:00.000Z" };
    await erzeugeMuster({ ...gemeinsam, typ: "bts", marke: nordlicht(), ablage: [eins], profil: "auto", belichtung: 0 });
    const geaendert = { ...eins, farblook: { ...eins.farblook, kontrast: 0.9 } };
    const anwenden = { ...gemeinsam, neu: false, exifBehalten: false, parallel: 1, look: "test", von: "Andrej" };
    await expect(wendeAn({ ...anwenden, marke: nordlicht(), ablage: [geaendert] })).rejects.toThrow(/hat sich seit dem Muster geändert/);
    expect(fs.existsSync(path.join(ordner.abs, "bearbeitet-test"))).toBe(false);
    // und die Marke muss dieselbe sein wie die des Musters
    await expect(wendeAn({ ...anwenden, marke: { ...nordlicht(), schluessel: "regina-massagen" }, ablage: [eins] })).rejects.toThrow(/gehört zur Marke «nordlicht»/);
    // ein leerer Name ist keine Wahl
    await expect(wendeAn({ ...anwenden, von: "  ", marke: nordlicht(), ablage: [eins] })).rejects.toThrow(/Name des Menschen/);
    // unverändert geht es
    const r = await wendeAn({ ...anwenden, marke: nordlicht(), ablage: [eins] });
    expect(r).toMatchObject({ ok: 1, vorhanden: 0, fehler: [], ausgabe: "f/bearbeitet-test" });
  });
});
