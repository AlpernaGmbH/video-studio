import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findeOneDrive, formatiere, hatFehler, initialisiere, medienOrdner, nurWegZu, onedriveWurzel, pruefeUmgebung, studioHome, UNTERORDNER, type Sonde } from "./setup";

let user: string;
beforeEach(() => {
  user = fs.mkdtempSync(path.join(os.tmpdir(), "studio-setup-"));
});
afterEach(() => fs.rmSync(user, { recursive: true, force: true }));

const env = (): NodeJS.ProcessEnv => ({});
const onedrive = (name = "OneDrive-AlpernaGmbH") => {
  const d = path.join(user, "Library", "CloudStorage", name);
  fs.mkdirSync(d, { recursive: true });
  return d;
};

/** Studio-Pfad in einem bestehenden Ordner: init legt keine Elternordner an. */
const studioIn = (...teile: string[]): string => {
  const eltern = path.join(user, ...teile);
  fs.mkdirSync(eltern, { recursive: true });
  return path.join(eltern, "Studio");
};

describe("init", () => {
  it("findet den OneDrive-Ordner, legt Studio samt Unterordnern an und merkt sich den Pfad", () => {
    const od = onedrive();
    const r = initialisiere({ env: env(), userHome: user });
    expect(r.home).toBe(path.join(od, "Studio"));
    for (const u of UNTERORDNER) expect(fs.existsSync(path.join(r.home, u))).toBe(true);
    expect(studioHome(env(), user)).toEqual({ pfad: r.home, quelle: "config" });
    expect(r.config).toBe(path.join(user, ".config", "video-studio", "config.json"));
  });

  it("zweiter Lauf lässt Bestehendes unberührt", () => {
    onedrive();
    const erst = initialisiere({ env: env(), userHome: user });
    fs.writeFileSync(path.join(erst.home, "daten", "ideen.json"), "{}");
    const zweit = initialisiere({ env: env(), userHome: user });
    expect(zweit.angelegt).toEqual([]);
    expect(fs.readFileSync(path.join(erst.home, "daten", "ideen.json"), "utf8")).toBe("{}");
  });

  it("rät nicht, wenn zwei OneDrive-Ordner da sind", () => {
    onedrive("OneDrive-AlpernaGmbH");
    onedrive("OneDrive-Personal");
    expect(() => initialisiere({ env: env(), userHome: user })).toThrow(/Mehrere OneDrive-Ordner/);
    expect(fs.existsSync(path.join(user, ".config"))).toBe(false);
  });

  it("zeigt bei mehreren Ordnern je einen fertigen Befehl und warnt vor Schul- und Fremdkonten", () => {
    const a = onedrive("OneDrive-AlpernaGmbH");
    const b = onedrive("OneDrive-KantonsschuleTrogen");
    let meldung = "";
    try {
      initialisiere({ env: env(), userHome: user });
    } catch (e) {
      meldung = (e as Error).message;
    }
    expect(meldung).toContain(`./studio init --home "${a}/Studio"`);
    expect(meldung).toContain(`./studio init --home "${b}/Studio"`);
    expect(meldung).toMatch(/Schulkonten/);
    expect(meldung).toMatch(/ich rate nicht/);
  });

  it("meldet, wenn es kein OneDrive gibt", () => {
    expect(() => initialisiere({ env: env(), userHome: user })).toThrow(/Kein OneDrive-Ordner/);
  });

  it("nimmt einen angegebenen Pfad ohne zu suchen", () => {
    const eigen = studioIn("Irgendwo");
    const r = initialisiere({ home: eigen, env: env(), userHome: user });
    expect(r.home).toBe(eigen);
    expect(fs.existsSync(path.join(eigen, "renders"))).toBe(true);
  });

  it("erkennt auch ältere OneDrive-Ordner direkt im Home", () => {
    fs.mkdirSync(path.join(user, "OneDrive - Alperna GmbH"));
    expect(findeOneDrive(user)).toEqual([path.join(user, "OneDrive - Alperna GmbH")]);
  });
});

describe("studioHome", () => {
  it("STUDIO_HOME gilt vor der Konfiguration", () => {
    onedrive();
    initialisiere({ env: env(), userHome: user });
    expect(studioHome({ STUDIO_HOME: "/x/y" }, user)).toEqual({ pfad: "/x/y", quelle: "STUDIO_HOME" });
  });

  it("ohne Einrichtung gibt es keinen Pfad", () => {
    expect(studioHome(env(), user)).toBeUndefined();
  });

  it("eine kaputte Konfiguration wird benannt statt still ignoriert", () => {
    fs.mkdirSync(path.join(user, ".config", "video-studio"), { recursive: true });
    fs.writeFileSync(path.join(user, ".config", "video-studio", "config.json"), '{"schema":2}');
    expect(() => studioHome(env(), user)).toThrow(/ungültig/);
  });
});

function sonde(over: Partial<Sonde> = {}): Sonde {
  return {
    nodeVersion: "v22.11.0",
    platform: "darwin",
    env: env(),
    userHome: user,
    befehl: (cmd) => (cmd === "ffmpeg" ? "ffmpeg version 7.1" : cmd === "ffprobe" ? "ffprobe version 7.1" : "10.9.0"),
    ideenProtokollPruefen: () => undefined,
    bibliothekPruefen: () => ({ fehler: 0, warnungen: 0 }),
    notionZielPruefen: () => undefined,
    freierPlatzGB: () => 500,
    ...over,
  };
}

describe("doctor", () => {
  it("meldet auf einem frisch eingerichteten Mac keinen Fehler und weist auf die Dateien-auf-Abruf-Falle hin", () => {
    onedrive();
    initialisiere({ env: env(), userHome: user });
    const p = pruefeUmgebung(sonde());
    expect(hatFehler(p)).toBe(false);
    expect(p.find((x) => x.name === "OneDrive")?.stufe).toBe("ok");
    expect(p.find((x) => x.name === "OneDrive-Dateien")?.text).toMatch(/Immer auf diesem Gerät behalten/);
  });

  it("Whisper fehlt: Warnung mit der Installation, kein Fehler; vorhanden oder über STUDIO_WHISPER_BIN eingetragen: ok", () => {
    onedrive();
    initialisiere({ env: env(), userHome: user });
    const ohne = pruefeUmgebung(sonde({ befehl: (cmd) => (cmd === "whisper" ? undefined : "vorhanden") }));
    expect(ohne.find((x) => x.name === "Whisper")).toMatchObject({ stufe: "warnung" });
    expect(ohne.find((x) => x.name === "Whisper")?.text).toMatch(/whisper einrichten/);
    expect(hatFehler(ohne)).toBe(false);
    expect(pruefeUmgebung(sonde()).find((x) => x.name === "Whisper")?.stufe).toBe("ok");
    const eigenes = pruefeUmgebung(sonde({ env: { ...env(), STUDIO_WHISPER_BIN: "/opt/w" }, befehl: (cmd) => (cmd === "/opt/w" ? "vorhanden" : undefined) }));
    expect(eigenes.find((x) => x.name === "Whisper")).toMatchObject({ stufe: "ok" });
    expect(eigenes.find((x) => x.name === "Whisper")?.text).toContain("/opt/w");
  });

  it("ohne Einrichtung: Fehler mit dem nächsten Schritt", () => {
    const p = pruefeUmgebung(sonde());
    expect(hatFehler(p)).toBe(true);
    expect(formatiere(p)).toMatch(/Studio-Ordner: nicht eingerichtet.*init/);
  });

  it("zu altes Node und fehlendes ffmpeg sind Fehler", () => {
    onedrive();
    initialisiere({ env: env(), userHome: user });
    const p = pruefeUmgebung(sonde({ nodeVersion: "v20.1.0", befehl: () => undefined }));
    expect(p.filter((x) => x.stufe === "fehler").map((x) => x.name)).toEqual(expect.arrayContaining(["Node", "ffmpeg", "ffprobe", "npx"]));
  });

  it("ein Studio-Ordner ausserhalb von OneDrive ist eine Warnung, kein Fehler", () => {
    initialisiere({ home: studioIn("Lokal"), env: env(), userHome: user });
    const p = pruefeUmgebung(sonde());
    expect(p.find((x) => x.name === "OneDrive")?.stufe).toBe("warnung");
    expect(hatFehler(p)).toBe(false);
  });

  it("ein Pfad, der nicht (mehr) existiert, ist ein Fehler mit Hinweis auf die Synchronisierung", () => {
    const od = onedrive();
    const r = initialisiere({ env: env(), userHome: user });
    fs.rmSync(od, { recursive: true });
    const p = pruefeUmgebung(sonde());
    expect(p.find((x) => x.name === "Studio-Ordner")).toMatchObject({ stufe: "fehler" });
    expect(p.find((x) => x.name === "Studio-Ordner")?.text).toContain(r.home);
    expect(p.find((x) => x.name === "Studio-Ordner")?.text).toMatch(/synchronisiert/);
  });

  it("fehlende Unterordner und ein beschädigtes Ideenprotokoll werden einzeln benannt", () => {
    onedrive();
    const r = initialisiere({ env: env(), userHome: user });
    fs.rmSync(path.join(r.home, "renders"), { recursive: true });
    fs.writeFileSync(path.join(r.home, "daten", "ideen.json"), "kaputt");
    const p = pruefeUmgebung(sonde({ ideenProtokollPruefen: () => "ist kein gültiges JSON" }));
    expect(p.find((x) => x.name === "Unterordner")).toMatchObject({ stufe: "warnung" });
    expect(p.find((x) => x.name === "Unterordner")?.text).toContain("renders");
    expect(p.find((x) => x.name === "Ideenprotokoll")).toMatchObject({ stufe: "fehler", text: "ist kein gültiges JSON" });
  });

  it("Lint-Fehler der Bibliothek und ein ungültiges Notion-Ziel brechen doctor", () => {
    onedrive();
    initialisiere({ env: env(), userHome: user });
    const p = pruefeUmgebung(sonde({ bibliothekPruefen: () => ({ fehler: 2, warnungen: 0 }), notionZielPruefen: () => "notion.json ist ungültig" }));
    expect(p.find((x) => x.name === "Motion-Bibliothek")?.stufe).toBe("fehler");
    expect(p.find((x) => x.name === "Notion")?.stufe).toBe("fehler");
  });

  it("auf Linux gibt es den macOS-Hinweis zu OneDrive nicht", () => {
    onedrive();
    initialisiere({ env: env(), userHome: user });
    expect(pruefeUmgebung(sonde({ platform: "linux" })).some((x) => x.name === "OneDrive-Dateien")).toBe(false);
  });
});

describe("Medien auf einem eigenen Laufwerk", () => {
  const laufwerk = () => {
    const d = path.join(user, "Volumes", "Gross");
    fs.mkdirSync(d, { recursive: true });
    return d;
  };

  it("init --medien legt daten im Studio-Ordner an, die grossen Ordner auf dem Laufwerk, und merkt beides", () => {
    const od = studioIn("OneDrive-Firma");
    const medien = path.join(laufwerk(), "Studio-Medien");
    const r = initialisiere({ home: od, medien, env: env(), userHome: user });
    expect(fs.existsSync(path.join(od, "daten"))).toBe(true);
    for (const u of ["rohmaterial", "renders", "inspiration"]) {
      expect(fs.existsSync(path.join(medien, u))).toBe(true);
      expect(fs.existsSync(path.join(od, u)), `${u} gehört nicht in OneDrive`).toBe(false);
    }
    expect(r.medien).toBe(medien);
    const h = studioHome(env(), user)!;
    expect(h).toMatchObject({ pfad: od, medien });
    expect(medienOrdner(h)).toBe(medien);
  });

  it("ohne --medien liegt alles im Studio-Ordner wie bisher", () => {
    const od = studioIn("OneDrive-Firma");
    initialisiere({ home: od, env: env(), userHome: user });
    const h = studioHome(env(), user)!;
    expect(h.medien).toBeUndefined();
    expect(medienOrdner(h)).toBe(od);
    expect(fs.existsSync(path.join(od, "rohmaterial"))).toBe(true);
  });

  it("ein Laufwerk, das nicht angeschlossen ist, wird nicht stillschweigend als Ordner im Home angelegt", () => {
    expect(() => initialisiere({ home: studioIn("OneDrive-Firma"), medien: path.join(user, "Volumes", "Nicht-da", "Studio-Medien"), env: env(), userHome: user })).toThrow(/Laufwerk angeschlossen/);
    expect(fs.existsSync(path.join(user, "Volumes", "Nicht-da"))).toBe(false);
    expect(fs.existsSync(path.join(user, ".config"))).toBe(false);
  });

  it("STUDIO_MEDIEN gilt vor der Konfiguration", () => {
    initialisiere({ home: studioIn("OneDrive-Firma"), medien: path.join(laufwerk(), "A"), env: env(), userHome: user });
    expect(studioHome({ STUDIO_MEDIEN: "/Volumes/B" }, user)!.medien).toBe("/Volumes/B");
  });

  it("doctor: Laufwerk abgezogen ist ein Fehler mit dem Hinweis, nachzusehen", () => {
    const medien = path.join(laufwerk(), "Studio-Medien");
    initialisiere({ home: studioIn("OneDrive-Firma"), medien, env: env(), userHome: user });
    fs.rmSync(path.join(user, "Volumes"), { recursive: true });
    const p = pruefeUmgebung(sonde());
    expect(p.find((x) => x.name === "Medien-Ordner")).toMatchObject({ stufe: "fehler" });
    expect(p.find((x) => x.name === "Medien-Ordner")?.text).toMatch(/Laufwerk angeschlossen/);
  });

  it("doctor: Platz je Datenträger, Warnung unter 100 GB, Fehler unter 10 GB, Meldung nennt den Ausweg", () => {
    const medien = path.join(laufwerk(), "Studio-Medien");
    const od = studioIn("OneDrive-Firma");
    initialisiere({ home: od, medien, env: env(), userHome: user });
    const frei: Record<string, number> = { [od]: 80, [medien]: 3000 };
    let p = pruefeUmgebung(sonde({ freierPlatzGB: (pfad) => frei[pfad] }));
    expect(p.find((x) => x.name === "Platz Studio-Ordner")).toMatchObject({ stufe: "warnung" });
    expect(p.find((x) => x.name === "Platz Studio-Ordner")?.text).toMatch(/nur kleine Daten/);
    expect(p.find((x) => x.name === "Platz Medien")).toMatchObject({ stufe: "ok", text: "3000 GB frei" });
    expect(hatFehler(p)).toBe(false);
    p = pruefeUmgebung(sonde({ freierPlatzGB: () => 5 }));
    expect(p.filter((x) => x.name.startsWith("Platz")).every((x) => x.stufe === "fehler")).toBe(true);
    expect(hatFehler(p)).toBe(true);
  });

  it("doctor ohne Medien-Ordner: Warnung bei knappem Platz verweist auf init --medien", () => {
    initialisiere({ home: studioIn("OneDrive-Firma"), env: env(), userHome: user });
    const p = pruefeUmgebung(sonde({ freierPlatzGB: () => 80 }));
    expect(p.find((x) => x.name === "Platz")).toMatchObject({ stufe: "warnung" });
    expect(p.find((x) => x.name === "Platz")?.text).toMatch(/init --medien/);
  });
});

describe("OneDrive-Konto: leere oder doppelte Einträge", () => {
  it("init legt keine Elternordner an: ein Tippfehler im Pfad erzeugt keinen zweiten Ordner", () => {
    const od = onedrive("OneDrive-Royalsocials");
    fs.mkdirSync(path.join(od, "03_marketing"));
    const falsch = path.join(od, "03_Marketing", "Studio");
    expect(() => initialisiere({ home: falsch, env: env(), userHome: user })).toThrow(/gibt es nicht.*Ich lege keine Elternordner an/);
    expect(fs.existsSync(path.join(od, "03_Marketing"))).toBe(false);
    expect(fs.existsSync(path.join(user, ".config"))).toBe(false);
  });

  it("init warnt, wenn der OneDrive-Ordner sonst leer ist (nicht angemeldet oder Doppel-Eintrag)", () => {
    onedrive("OneDrive-Royalsocials");
    const r = initialisiere({ env: env(), userHome: user });
    expect(r.hinweise).toHaveLength(1);
    expect(r.hinweise[0]).toMatch(/OneDrive-Royalsocials.*liegt sonst nichts.*\(2\)/);
  });

  it("init warnt nicht, wenn im OneDrive-Ordner schon andere Dinge liegen", () => {
    const od = onedrive("OneDrive-Royalsocials");
    fs.mkdirSync(path.join(od, "03_marketing"));
    fs.mkdirSync(path.join(od, "01_verwaltung"));
    const r = initialisiere({ home: path.join(od, "03_marketing", "Studio"), env: env(), userHome: user });
    expect(r.hinweise).toEqual([]);
  });

  it("versteckte Dateien zählen nicht als Inhalt", () => {
    const od = onedrive("OneDrive-Royalsocials");
    fs.writeFileSync(path.join(od, ".DS_Store"), "");
    expect(initialisiere({ env: env(), userHome: user }).hinweise).toHaveLength(1);
  });

  it("doctor warnt, wenn im OneDrive-Ordner ausser Studio nichts liegt", () => {
    onedrive("OneDrive-Royalsocials");
    initialisiere({ env: env(), userHome: user });
    const p = pruefeUmgebung(sonde());
    expect(hatFehler(p)).toBe(false);
    const k = p.find((x) => x.name === "OneDrive-Konto");
    expect(k?.stufe).toBe("warnung");
    expect(k?.text).toMatch(/nicht angemeldet oder der Eintrag ein Doppel/);
  });

  it("doctor warnt nicht, wenn der Ordner echten Inhalt hat", () => {
    const od = onedrive("OneDrive-Royalsocials");
    fs.mkdirSync(path.join(od, "Rechnungen"));
    initialisiere({ env: env(), userHome: user });
    expect(pruefeUmgebung(sonde()).find((x) => x.name === "OneDrive-Konto")).toBeUndefined();
  });

  it("doctor weist auf zwei Einträge desselben Kontos hin und nennt die Zahl der Einträge", () => {
    const leer = onedrive("OneDrive-Royalsocials");
    const echt = onedrive("OneDrive-Royalsocials(2)");
    fs.mkdirSync(path.join(echt, "03_marketing"));
    initialisiere({ home: path.join(echt, "03_marketing", "Studio"), env: env(), userHome: user });
    const d = pruefeUmgebung(sonde()).find((x) => x.name === "OneDrive-Doppel");
    expect(d?.stufe).toBe("hinweis");
    expect(d?.text).toContain("OneDrive-Royalsocials (0 Einträge)");
    expect(d?.text).toContain("OneDrive-Royalsocials(2) (1 Einträge)");
    expect(fs.readdirSync(leer)).toEqual([]);
  });

  it("die Auswahl bei mehreren Ordnern sagt, welcher leer ist", () => {
    onedrive("OneDrive-Royalsocials");
    const echt = onedrive("OneDrive-Royalsocials(2)");
    fs.mkdirSync(path.join(echt, "03_marketing"));
    let meldung = "";
    try {
      initialisiere({ env: env(), userHome: user });
    } catch (e) {
      meldung = (e as Error).message;
    }
    expect(meldung).toMatch(/OneDrive-Royalsocials \(LEER/);
    expect(meldung).toMatch(/OneDrive-Royalsocials\(2\) \(1 Einträge\)/);
  });

  it("onedriveWurzel findet den Ordner unter CloudStorage und im Home, sonst nichts", () => {
    const od = onedrive("OneDrive-X");
    expect(onedriveWurzel(path.join(od, "a", "b", "Studio"), user)).toBe(od);
    expect(onedriveWurzel(path.join(user, "Lokal", "Studio"), user)).toBeUndefined();
    const alt = path.join(user, "OneDrive - Firma");
    expect(onedriveWurzel(path.join(alt, "Studio"), user)).toBe(alt);
  });

  it("nurWegZu: wahr, wenn jede Ebene nur den Weg zum Ziel enthält", () => {
    const od = onedrive("OneDrive-X");
    const ziel = path.join(od, "a", "Studio");
    fs.mkdirSync(ziel, { recursive: true });
    expect(nurWegZu(od, ziel)).toBe(true);
    fs.mkdirSync(path.join(od, "andere"));
    expect(nurWegZu(od, ziel)).toBe(false);
    fs.rmdirSync(path.join(od, "andere"));
    fs.writeFileSync(path.join(od, "a", "Notiz.txt"), "");
    expect(nurWegZu(od, ziel)).toBe(false);
  });
});
