import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { z } from "zod";
import type { Pruefpunkt } from "../setup";

/**
 * Verbindung zum Alperna-Tool (Plan v4, Phase 2, Mac-Client C1): Adresse und Geräte-Token.
 *
 * Das Token ist ein Geheimnis (`vsd_<geräte-id>_<geheimnis>`, Aufbau und Gültigkeit: `docs/studio-tool.md`). Es liegt im macOS-Schlüsselbund; nur wo das nicht geht, in `tool.json` mit Rechten 0600.
 * Die Adresse steht immer in `tool.json`, neben `config.json` (`~/.config/video-studio/`), also ausserhalb von Repo und OneDrive. `init` fasst die Datei nie an.
 * Das Token kommt nie in eine Ausgabe, ein Ereignis, einen Fehlertext oder den Doctor. Die Umgebungsvariablen `STUDIO_TOOL_URL` und `STUDIO_TOOL_TOKEN` gelten vor der Datei (Cloud-Sitzungen, Tests).
 */

export const KEYCHAIN_DIENST = "video-studio-tool";
export const KEYCHAIN_KONTO = "tool";

const TOKEN = /^vsd_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_([A-Za-z0-9_-]{43})$/;

/** Prüft ein Token auf die Form und gibt die Geräte-ID zurück (nur die ID, nie das Geheimnis). */
export function geraeteIdAusToken(token: string): string | undefined {
  return TOKEN.exec(token.trim())?.[1];
}

export function pruefeToken(token: string): string {
  const t = token.trim();
  if (!TOKEN.test(t)) throw new Error("Das ist kein Geräte-Token (erwartet wird «vsd_<Geräte-ID>_<43 Zeichen>», so wie das Skript «studio-geraet.mjs anlegen» es ausgibt)");
  return t;
}

/** Normalisiert die Adresse des Tools auf `https://host[:port]`. http nur für den eigenen Rechner (Entwicklung), nie mit Benutzer und Passwort. */
export function pruefeUrl(eingabe: string): string {
  let u: URL;
  try {
    u = new URL(eingabe.trim());
  } catch {
    throw new Error(`«${eingabe}» ist keine Adresse (zum Beispiel https://alperna-tool.vercel.app)`);
  }
  const lokal = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  if (u.protocol !== "https:" && !(u.protocol === "http:" && lokal)) throw new Error("Die Adresse muss mit https:// beginnen (http:// gilt nur für localhost)");
  if (u.username || u.password) throw new Error("Die Adresse darf keinen Benutzer und kein Passwort enthalten");
  return u.origin;
}

/* ---------- Schlüsselbund ---------- */

export interface Schluesselbund {
  vorhanden(): boolean;
  lies(): string | undefined;
  /** true, wenn das Token jetzt im Schlüsselbund liegt. */
  schreibe(token: string): boolean;
  loesche(): void;
}

export type Ausfuehrer = (cmd: string, args: string[]) => { status: number | null; stdout: string };

const echterAusfuehrer: Ausfuehrer = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  return { status: r.error ? null : r.status, stdout: r.stdout ?? "" };
};

/**
 * Der macOS-Schlüsselbund über das Programm `security`. Auf anderen Systemen gibt es ihn nicht: `schreibe` meldet false, und das Token landet in `tool.json`.
 * Hinweis: `security add-generic-password -w` bekommt das Token als Argument, es ist auf diesem Mac für Sekundenbruchteile in der Prozessliste sichtbar (nur für Benutzer dieses Rechners).
 */
export function schluesselbund(plattform: string = process.platform, run: Ausfuehrer = echterAusfuehrer): Schluesselbund {
  if (plattform !== "darwin") return { vorhanden: () => false, lies: () => undefined, schreibe: () => false, loesche: () => undefined };
  const ziel = ["-a", KEYCHAIN_KONTO, "-s", KEYCHAIN_DIENST];
  return {
    vorhanden: () => run("security", ["find-generic-password", ...ziel]).status === 0,
    lies() {
      const r = run("security", ["find-generic-password", ...ziel, "-w"]);
      const t = r.stdout.trim();
      return r.status === 0 && t ? t : undefined;
    },
    schreibe: (token) => run("security", ["add-generic-password", "-U", ...ziel, "-w", token]).status === 0,
    loesche: () => void run("security", ["delete-generic-password", ...ziel]),
  };
}

/* ---------- Datei ---------- */

export interface KonfigOrt {
  /** Ordner neben `config.json`. */
  dir: string;
  env: NodeJS.ProcessEnv;
  schluessel: Schluesselbund;
}

const DateiInhalt = z.object({ schema: z.literal(1), url: z.string(), token: z.string().optional() });

export const toolDatei = (ort: KonfigOrt): string => path.join(ort.dir, "tool.json");

export interface ToolKonfig {
  url: string;
  token: string;
}

export type Quelle = "umgebung" | "schluesselbund" | "datei";

export interface Geladen {
  konfig?: ToolKonfig;
  quelle?: Quelle;
  /** Warum es keine Verbindung gibt, wenn etwas eingerichtet, aber unbrauchbar ist. Nie mit Token. */
  hinweis?: string;
}

function leseDatei(ort: KonfigOrt): { url: string; token?: string } | undefined | Error {
  let text: string;
  try {
    text = fs.readFileSync(toolDatei(ort), "utf8");
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "ENOENT" ? undefined : new Error("tool.json lässt sich nicht lesen");
  }
  try {
    return DateiInhalt.parse(JSON.parse(text));
  } catch {
    return new Error("tool.json ist beschädigt. «./studio tool verbinden <Adresse>» legt sie neu an");
  }
}

export function ladeToolKonfig(ort: KonfigOrt): Geladen {
  const eu = ort.env["STUDIO_TOOL_URL"];
  const et = ort.env["STUDIO_TOOL_TOKEN"];
  if (eu || et) {
    if (!eu || !et) return { hinweis: "STUDIO_TOOL_URL und STUDIO_TOOL_TOKEN gehören zusammen" };
    try {
      return { konfig: { url: pruefeUrl(eu), token: pruefeToken(et) }, quelle: "umgebung" };
    } catch (e) {
      return { hinweis: `Umgebungsvariablen: ${(e as Error).message}` };
    }
  }
  const d = leseDatei(ort);
  if (!d) return {};
  if (d instanceof Error) return { hinweis: d.message };
  let url: string;
  try {
    url = pruefeUrl(d.url);
  } catch (e) {
    return { hinweis: `tool.json: ${(e as Error).message}` };
  }
  const ausBund = d.token ? undefined : ort.schluessel.lies();
  const token = d.token ?? ausBund;
  if (!token) return { hinweis: "Die Adresse ist gespeichert, das Token fehlt (Schlüsselbund leer). «./studio tool verbinden <Adresse>» legt es neu an" };
  try {
    return { konfig: { url, token: pruefeToken(token) }, quelle: d.token ? "datei" : "schluesselbund" };
  } catch (e) {
    return { hinweis: (e as Error).message };
  }
}

function schreibeDatei(ort: KonfigOrt, inhalt: z.infer<typeof DateiInhalt>): void {
  fs.mkdirSync(ort.dir, { recursive: true, mode: 0o700 });
  const ziel = toolDatei(ort);
  const tmp = `${ziel}.${process.pid}.tmp`;
  // Die neue Datei entsteht mit 0600 und ersetzt die alte beim Umbenennen: Eine alte Datei mit offeneren Rechten bleibt nicht stehen.
  fs.writeFileSync(tmp, `${JSON.stringify(inhalt, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, ziel);
}

/** Speichert Adresse und Token. Das Token geht in den Schlüsselbund; nur wenn das nicht geht, in die Datei (0600). Gibt zurück, wo es liegt. */
export function speichereToolKonfig(ort: KonfigOrt, url: string, token: string): { quelle: "schluesselbund" | "datei"; url: string } {
  const u = pruefeUrl(url);
  const t = pruefeToken(token);
  if (ort.schluessel.schreibe(t)) {
    schreibeDatei(ort, { schema: 1, url: u });
    return { quelle: "schluesselbund", url: u };
  }
  schreibeDatei(ort, { schema: 1, url: u, token: t });
  return { quelle: "datei", url: u };
}

export function trenneTool(ort: KonfigOrt): void {
  fs.rmSync(toolDatei(ort), { force: true });
  ort.schluessel.loesche();
}

/** Der Doctor-Punkt «Tool»: prüft nur, was da ist und ob es die richtige Form hat. Nie das Netz, nie eine Ausgabe des Tokens. «Nicht eingerichtet» ist ein Hinweis, kein Fehler. */
export function toolPunkt(ort: KonfigOrt): Pruefpunkt {
  const name = "Tool";
  const geladen = ladeToolKonfig(ort);
  if (geladen.konfig) {
    const wo = geladen.quelle === "umgebung" ? "aus den Umgebungsvariablen" : geladen.quelle === "schluesselbund" ? "Token im Schlüsselbund" : "Token in tool.json";
    const id = geraeteIdAusToken(geladen.konfig.token)?.slice(0, 8);
    let offen = "";
    if (geladen.quelle === "datei") {
      try {
        if ((fs.statSync(toolDatei(ort)).mode & 0o077) !== 0) offen = " ACHTUNG: tool.json ist für andere Benutzer lesbar («chmod 600»)";
      } catch {
        // Datei eben noch gelesen: Rechte nicht prüfbar, kein Grund zur Warnung
      }
    }
    return { stufe: offen ? "warnung" : "ok", name, text: `verbunden mit ${geladen.konfig.url} (Gerät ${id}…, ${wo}). Erreichbarkeit prüft der Doctor nicht${offen}` };
  }
  if (geladen.hinweis) return { stufe: "warnung", name, text: geladen.hinweis };
  return { stufe: "hinweis", name, text: "nicht eingerichtet (freiwillig). Ohne Tool läuft alles wie bisher. Verbinden: «./studio tool verbinden <Adresse>»" };
}
