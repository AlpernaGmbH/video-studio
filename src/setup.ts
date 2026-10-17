import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";

/**
 * Einrichtung je Mac. Der Code kommt per git, die Daten und Medien liegen in OneDrive im Ordner «Studio».
 * Was von Rechner zu Rechner anders ist (der Pfad zu OneDrive), steht in einer kleinen Datei ausserhalb von
 * Repo und OneDrive: ~/.config/video-studio/config.json. Die Umgebungsvariable STUDIO_HOME gilt vor der Datei.
 *
 *   Studio/daten/        Ideenprotokoll, Ereignisse, Standbilder der Looks (data/ideen/<id>/…)
 *   Studio/rohmaterial/  Aufnahmen und B-Roll (Phase 2)
 *   Studio/renders/      fertige Videos (Phase 2)
 *   Studio/inspiration/  gespeicherte Inspirationsvideos
 */

export const UNTERORDNER = ["daten", "rohmaterial", "renders", "inspiration"] as const;

const Config = z.object({ schema: z.literal(1), studioHome: z.string().min(1) });
export type Config = z.infer<typeof Config>;

export function configPfad(env: NodeJS.ProcessEnv = process.env, home = os.homedir()): string {
  return env["STUDIO_CONFIG"] ?? path.join(home, ".config", "video-studio", "config.json");
}

export interface StudioHome {
  pfad: string;
  quelle: "STUDIO_HOME" | "config";
}

/** Der Studio-Ordner dieses Rechners, oder undefined, wenn noch nicht eingerichtet. */
export function studioHome(env: NodeJS.ProcessEnv = process.env, home = os.homedir()): StudioHome | undefined {
  const aus = env["STUDIO_HOME"];
  if (aus) return { pfad: path.resolve(aus), quelle: "STUDIO_HOME" };
  const datei = configPfad(env, home);
  if (!fs.existsSync(datei)) return undefined;
  const p = Config.safeParse(JSON.parse(fs.readFileSync(datei, "utf8")));
  if (!p.success) throw new Error(`${datei} ist ungültig. Mit «studio init --home <Pfad>» neu schreiben`);
  return { pfad: p.data.studioHome, quelle: "config" };
}

/** OneDrive-Ordner dieses Rechners: macOS legt sie unter ~/Library/CloudStorage ab, ältere Versionen direkt im Home. */
export function findeOneDrive(home = os.homedir()): string[] {
  const treffer: string[] = [];
  for (const basis of [path.join(home, "Library", "CloudStorage"), home]) {
    if (!fs.existsSync(basis)) continue;
    for (const name of fs.readdirSync(basis)) {
      if (/^OneDrive/i.test(name) && fs.statSync(path.join(basis, name)).isDirectory()) treffer.push(path.join(basis, name));
    }
  }
  return treffer;
}

/** Meldung bei mehreren OneDrive-Ordnern: je Ordner ein fertiger Befehl, dazu was nicht in Frage kommt. */
export function mehrereOrdner(kandidaten: string[]): string {
  const befehle = kandidaten.map((k) => `  npm run studio -- init --home "${k}/Studio"`).join("\n");
  return [
    "Mehrere OneDrive-Ordner gefunden. Welcher gilt, entscheidest du, ich rate nicht. Befehl für den gewählten Ordner kopieren:",
    "",
    befehle,
    "",
    "Nicht in Frage kommen Schulkonten, Konten anderer Firmen und Ordner mit «FreigegebeneBibliotheken» im Namen (Systemordner).",
    "Firmendaten gehören in das OneDrive der Firma. Ist keines angemeldet, nimmst du für einen Test das persönliche Konto und verschiebst den Ordner später.",
    "Enthält der Name ein «ö» und das Einfügen klappt nicht, hilft: --home \"$(ls -d ~/Library/CloudStorage/OneDrive-Pers*)/Studio\"",
  ].join("\n");
}

export interface InitErgebnis {
  home: string;
  config: string;
  angelegt: string[];
}

/** Legt den Studio-Ordner an und merkt sich den Pfad. Bestehendes bleibt unberührt. */
export function initialisiere(opt: { home?: string; env?: NodeJS.ProcessEnv; userHome?: string }): InitErgebnis {
  const env = opt.env ?? process.env;
  const userHome = opt.userHome ?? os.homedir();
  let home = opt.home ? path.resolve(opt.home) : undefined;
  if (!home) {
    const kandidaten = findeOneDrive(userHome);
    if (kandidaten.length === 0) throw new Error("Kein OneDrive-Ordner gefunden. OneDrive installieren und anmelden, oder den Pfad mit --home angeben");
    if (kandidaten.length > 1) throw new Error(mehrereOrdner(kandidaten));
    home = path.join(kandidaten[0]!, "Studio");
  }
  const angelegt: string[] = [];
  for (const d of [home, ...UNTERORDNER.map((u) => path.join(home!, u))]) {
    if (!fs.existsSync(d)) {
      fs.mkdirSync(d, { recursive: true });
      angelegt.push(d);
    }
  }
  const datei = configPfad(env, userHome);
  fs.mkdirSync(path.dirname(datei), { recursive: true });
  fs.writeFileSync(datei, JSON.stringify({ schema: 1, studioHome: home } satisfies Config, null, 2) + "\n");
  return { home, config: datei, angelegt };
}

/* ---------- doctor ---------- */

export type Stufe = "ok" | "hinweis" | "warnung" | "fehler";
export interface Pruefpunkt {
  stufe: Stufe;
  name: string;
  text: string;
}

/** Alles, was doctor von aussen braucht. Im Test ersetzt, im Betrieb `echteSonde`. */
export interface Sonde {
  nodeVersion: string;
  platform: string;
  env: NodeJS.ProcessEnv;
  userHome: string;
  befehl(cmd: string, args: string[]): string | undefined;
  ideenProtokollPruefen(datei: string): string | undefined;
  bibliothekPruefen(): { fehler: number; warnungen: number };
  notionZielPruefen(): string | undefined;
}

export function pruefeUmgebung(s: Sonde): Pruefpunkt[] {
  const p: Pruefpunkt[] = [];
  const add = (stufe: Stufe, name: string, text: string) => p.push({ stufe, name, text });

  const major = Number(s.nodeVersion.replace(/^v/, "").split(".")[0]);
  if (major >= 22) add("ok", "Node", s.nodeVersion);
  else add("fehler", "Node", `${s.nodeVersion} ist zu alt: HyperFrames verlangt Node 22 oder neuer`);

  for (const cmd of ["ffmpeg", "ffprobe"]) {
    const v = s.befehl(cmd, ["-version"]);
    if (v) add("ok", cmd, v.split("\n")[0] ?? "vorhanden");
    else add("fehler", cmd, `fehlt. Installieren mit «brew install ffmpeg»`);
  }
  if (s.befehl("npx", ["--version"])) add("ok", "npx", "vorhanden (holt HyperFrames in der fest eingetragenen Version)");
  else add("fehler", "npx", "fehlt. Node samt npm installieren");

  let home: StudioHome | undefined;
  try {
    home = studioHome(s.env, s.userHome);
  } catch (e) {
    add("fehler", "Studio-Ordner", (e as Error).message);
  }
  if (!home) {
    if (!p.some((x) => x.name === "Studio-Ordner")) add("fehler", "Studio-Ordner", "nicht eingerichtet. «npm run studio -- init» ausführen");
    return p;
  }

  const wo = home.quelle === "STUDIO_HOME" ? "aus STUDIO_HOME" : "aus der Konfiguration";
  if (!fs.existsSync(home.pfad)) {
    add("fehler", "Studio-Ordner", `${home.pfad} (${wo}) existiert nicht. OneDrive angemeldet und fertig synchronisiert?`);
    return p;
  }
  add("ok", "Studio-Ordner", `${home.pfad} (${wo})`);

  if (/onedrive/i.test(home.pfad)) add("ok", "OneDrive", "Der Ordner liegt in OneDrive und ist auf jedem Mac derselbe");
  else add("warnung", "OneDrive", "Der Ordner liegt nicht in OneDrive. Auf einem anderen Mac fehlen Daten und Medien");
  if (s.platform === "darwin") {
    add("hinweis", "OneDrive-Dateien", "Im Finder Rechtsklick auf «Studio» → «Immer auf diesem Gerät behalten». Sonst sind Dateien nur Platzhalter, und das Rendern findet sie nicht");
  }

  try {
    fs.accessSync(home.pfad, fs.constants.W_OK);
    add("ok", "Schreibrecht", "vorhanden");
  } catch {
    add("fehler", "Schreibrecht", `Kein Schreibrecht auf ${home.pfad}`);
  }
  const fehlend = UNTERORDNER.filter((u) => !fs.existsSync(path.join(home!.pfad, u)));
  if (fehlend.length) add("warnung", "Unterordner", `fehlen: ${fehlend.join(", ")}. «npm run studio -- init» legt sie an`);
  else add("ok", "Unterordner", UNTERORDNER.join(", "));

  const ideen = path.join(home.pfad, "daten", "ideen.json");
  if (fs.existsSync(ideen)) {
    const f = s.ideenProtokollPruefen(ideen);
    if (f) add("fehler", "Ideenprotokoll", f);
    else add("ok", "Ideenprotokoll", "lesbar und gültig");
  } else add("hinweis", "Ideenprotokoll", "noch leer (entsteht mit der ersten Idee)");

  const bib = s.bibliothekPruefen();
  if (bib.fehler) add("fehler", "Motion-Bibliothek", `${bib.fehler} Fehler im Lint («npm run studio -- motion lint»)`);
  else add("ok", "Motion-Bibliothek", `Lint ohne Fehler${bib.warnungen ? `, ${bib.warnungen} Warnungen` : ""}`);

  const nz = s.notionZielPruefen();
  if (nz) add("fehler", "Notion", nz);
  else add("ok", "Notion", "notion.json ist gültig. Zugriff hängt am Notion-Konto in Claude (Seite «Video-Studio» muss geteilt sein)");

  add("hinweis", "HyperFrames", "Einmal je Mac: «npx hyperframes browser ensure» und «npx hyperframes telemetry disable» (wegen Kundenmaterial)");
  return p;
}

export function formatiere(punkte: Pruefpunkt[]): string {
  const zeichen: Record<Stufe, string> = { ok: "ok     ", hinweis: "Hinweis", warnung: "Warnung", fehler: "FEHLER " };
  return punkte.map((x) => `${zeichen[x.stufe]} ${x.name}: ${x.text}`).join("\n");
}

export const hatFehler = (p: Pruefpunkt[]): boolean => p.some((x) => x.stufe === "fehler");
