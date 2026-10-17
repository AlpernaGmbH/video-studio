import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findeOneDrive, formatiere, hatFehler, initialisiere, pruefeUmgebung, studioHome, UNTERORDNER, type Sonde } from "./setup";

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
    expect(meldung).toContain(`npm run studio -- init --home "${a}/Studio"`);
    expect(meldung).toContain(`npm run studio -- init --home "${b}/Studio"`);
    expect(meldung).toMatch(/Schulkonten/);
    expect(meldung).toMatch(/ich rate nicht/);
  });

  it("meldet, wenn es kein OneDrive gibt", () => {
    expect(() => initialisiere({ env: env(), userHome: user })).toThrow(/Kein OneDrive-Ordner/);
  });

  it("nimmt einen angegebenen Pfad ohne zu suchen", () => {
    const eigen = path.join(user, "Irgendwo", "Studio");
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
    initialisiere({ home: path.join(user, "Lokal", "Studio"), env: env(), userHome: user });
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
