import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { whisperProgramm } from "./schnitt/whisper";

/**
 * Einrichtung je Mac. Der Code kommt per git, die Daten und Medien liegen in OneDrive im Ordner «Studio».
 * Was von Rechner zu Rechner anders ist (der Pfad zu OneDrive), steht in einer kleinen Datei ausserhalb von
 * Repo und OneDrive: ~/.config/video-studio/config.json. Die Umgebungsvariable STUDIO_HOME gilt vor der Datei.
 *
 *   Studio/daten/        Ideenprotokoll, Ereignisse, Standbilder der Looks (data/ideen/<id>/…). Klein.
 *   Studio/rohmaterial/  Aufnahmen und B-Roll (Phase 2). Gross.
 *   Studio/renders/      fertige Videos (Phase 2). Gross.
 *   Studio/inspiration/  gespeicherte Inspirationsvideos. Gross.
 *
 * Reicht der Platz auf dem Mac nicht, liegen die grossen Ordner auf einem eigenen Laufwerk («Medien-Ordner», `--medien`). OneDrive auf einem
 * externen Laufwerk geht laut Microsoft nur mit APFS und einem nicht auswerfbaren Laufwerk, ein USB-Laufwerk gilt als auswerfbar. Darum bleibt
 * `daten/` im Studio-Ordner (klein, per OneDrive abgesichert) und nur die Medien wandern auf das Laufwerk.
 */

export const KLEINE_UNTERORDNER = ["daten"] as const;
export const GROSSE_UNTERORDNER = ["rohmaterial", "renders", "inspiration"] as const;
export const UNTERORDNER = [...KLEINE_UNTERORDNER, ...GROSSE_UNTERORDNER] as const;

/** Unter diesen freien Gigabyte meldet doctor eine Warnung beziehungsweise einen Fehler. */
export const PLATZ_WARNUNG_GB = 100;
export const PLATZ_FEHLER_GB = 10;

const Config = z.object({ schema: z.literal(1), studioHome: z.string().min(1), medienHome: z.string().min(1).optional() });
export type Config = z.infer<typeof Config>;

export function configPfad(env: NodeJS.ProcessEnv = process.env, home = os.homedir()): string {
  return env["STUDIO_CONFIG"] ?? path.join(home, ".config", "video-studio", "config.json");
}

export interface StudioHome {
  pfad: string;
  quelle: "STUDIO_HOME" | "config";
  /** Ordner für die grossen Medien, wenn sie nicht im Studio-Ordner liegen. */
  medien?: string;
}

/** Wo `rohmaterial`, `renders` und `inspiration` liegen: im Medien-Ordner, sonst im Studio-Ordner. */
export function medienOrdner(h: StudioHome): string {
  return h.medien ?? h.pfad;
}

/** Der Studio-Ordner dieses Rechners, oder undefined, wenn noch nicht eingerichtet. */
export function studioHome(env: NodeJS.ProcessEnv = process.env, home = os.homedir()): StudioHome | undefined {
  const aus = env["STUDIO_HOME"];
  const medienEnv = env["STUDIO_MEDIEN"] ? path.resolve(env["STUDIO_MEDIEN"]) : undefined;
  if (aus) return { pfad: path.resolve(aus), quelle: "STUDIO_HOME", medien: medienEnv };
  const datei = configPfad(env, home);
  if (!fs.existsSync(datei)) return undefined;
  const p = Config.safeParse(JSON.parse(fs.readFileSync(datei, "utf8")));
  if (!p.success) throw new Error(`${datei} ist ungültig. Mit «./studio init --home <Pfad>» neu schreiben`);
  return { pfad: p.data.studioHome, quelle: "config", medien: medienEnv ?? p.data.medienHome };
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

/** Einträge eines Ordners ohne versteckte Dateien (.DS_Store u. ä.). undefined, wenn er sich nicht lesen lässt. */
export function eintraege(dir: string): string[] | undefined {
  try {
    return fs.readdirSync(dir).filter((n) => !n.startsWith("."));
  } catch {
    return undefined;
  }
}

/** Der OneDrive-Ordner, in dem `pfad` liegt: direkt unter ~/Library/CloudStorage oder im Home, Name beginnt mit «OneDrive». */
export function onedriveWurzel(pfad: string, userHome = os.homedir()): string | undefined {
  const erlaubt = [path.join(userHome, "Library", "CloudStorage"), userHome];
  let d = path.resolve(pfad);
  for (;;) {
    const eltern = path.dirname(d);
    if (eltern === d) return undefined;
    if (erlaubt.includes(eltern) && /^OneDrive/i.test(path.basename(d))) return d;
    d = eltern;
  }
}

/** True, wenn im Ordner nichts liegt ausser dem Weg zu `ziel` (Ordner, die nur der Weg zu Studio sind). Dann ist das Konto vermutlich nicht angemeldet. */
export function nurWegZu(wurzel: string, ziel: string): boolean {
  let d = wurzel;
  const rest = path.relative(wurzel, ziel).split(path.sep).filter(Boolean);
  for (const naechster of rest) {
    const e = eintraege(d);
    if (!e || e.length === 0) return true;
    if (e.length !== 1 || e[0] !== naechster) return false;
    d = path.join(d, naechster);
  }
  return true;
}

const OHNE_ZAEHLER = (n: string): string => n.replace(/\s*\(\d+\)$/, "");

/** Meldung bei mehreren OneDrive-Ordnern: je Ordner ein fertiger Befehl mit Angabe, ob etwas darin liegt, dazu was nicht in Frage kommt. */
export function mehrereOrdner(kandidaten: string[]): string {
  const befehle = kandidaten
    .map((k) => {
      const e = eintraege(k);
      const inhalt = e === undefined ? "nicht lesbar" : e.length === 0 ? "LEER: vermutlich nicht angemeldet oder ein Doppel-Eintrag" : `${e.length} Einträge`;
      return `  ${path.basename(k)} (${inhalt})\n    ./studio init --home "${k}/Studio"`;
    })
    .join("\n\n");
  return [
    "Mehrere OneDrive-Ordner gefunden. Welcher gilt, entscheidest du, ich rate nicht. Befehl für den gewählten Ordner kopieren:",
    "",
    befehle,
    "",
    "Nicht in Frage kommen Schulkonten, Konten anderer Firmen und Ordner mit «FreigegebeneBibliotheken» im Namen (Systemordner).",
    "Ein Name mit «(2)» am Ende entsteht, wenn macOS ein Konto ein zweites Mal verbindet. Meist ist der Eintrag mit Inhalt der angemeldete.",
    "Firmendaten gehören in das OneDrive der Firma. Ist keines angemeldet, nimmst du für einen Test das persönliche Konto und verschiebst den Ordner später.",
    "Enthält der Name ein «ö» und das Einfügen klappt nicht, hilft: --home \"$(ls -d ~/Library/CloudStorage/OneDrive-Pers*)/Studio\"",
  ].join("\n");
}

export interface InitErgebnis {
  home: string;
  medien?: string;
  config: string;
  angelegt: string[];
  /** Dinge, die nach dem Anlegen auffallen und die ein Mensch ansehen soll. */
  hinweise: string[];
}

/** Legt den Studio-Ordner an und merkt sich den Pfad. Bestehendes bleibt unberührt. */
export function initialisiere(opt: { home?: string; medien?: string; env?: NodeJS.ProcessEnv; userHome?: string }): InitErgebnis {
  const env = opt.env ?? process.env;
  const userHome = opt.userHome ?? os.homedir();
  let home = opt.home ? path.resolve(opt.home) : undefined;
  if (!home) {
    const kandidaten = findeOneDrive(userHome);
    if (kandidaten.length === 0) throw new Error("Kein OneDrive-Ordner gefunden. OneDrive installieren und anmelden, oder den Pfad mit --home angeben");
    if (kandidaten.length > 1) throw new Error(mehrereOrdner(kandidaten));
    home = path.join(kandidaten[0]!, "Studio");
  }
  const eltern = path.dirname(home);
  if (!fs.existsSync(eltern)) {
    throw new Error(`Der Ordner ${eltern} gibt es nicht. Tippfehler im Pfad? Prüfen mit: ls "${path.dirname(eltern)}". Ich lege keine Elternordner an, sonst entsteht still ein zweiter Ordner neben deinem echten`);
  }
  const hinweise: string[] = [];
  const wurzel = onedriveWurzel(home, userHome);
  if (wurzel && !fs.existsSync(home) && nurWegZu(wurzel, home)) {
    hinweise.push(`Im OneDrive-Ordner «${path.basename(wurzel)}» liegt sonst nichts. Ist das Konto angemeldet und fertig synchronisiert? Gibt es einen zweiten Eintrag mit «(2)»? Prüfen mit: ls ~/Library/CloudStorage`);
  }
  const medien = opt.medien ? path.resolve(opt.medien) : undefined;
  if (medien && !fs.existsSync(path.dirname(medien))) {
    throw new Error(`Der Ordner ${path.dirname(medien)} gibt es nicht. Ist das Laufwerk angeschlossen? Prüfen mit: ls /Volumes`);
  }
  const angelegt: string[] = [];
  const stellen: string[] = [home, ...KLEINE_UNTERORDNER.map((u) => path.join(home!, u))];
  if (medien) stellen.push(medien, ...GROSSE_UNTERORDNER.map((u) => path.join(medien, u)));
  else stellen.push(...GROSSE_UNTERORDNER.map((u) => path.join(home!, u)));
  for (const d of stellen) {
    if (!fs.existsSync(d)) {
      fs.mkdirSync(d, { recursive: true });
      angelegt.push(d);
    }
  }
  const datei = configPfad(env, userHome);
  fs.mkdirSync(path.dirname(datei), { recursive: true });
  fs.writeFileSync(datei, JSON.stringify({ schema: 1, studioHome: home, ...(medien ? { medienHome: medien } : {}) } satisfies Config, null, 2) + "\n");
  return { home, medien, config: datei, angelegt, hinweise };
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
  /** Freier Platz auf dem Datenträger, auf dem `pfad` liegt, in Gigabyte. undefined, wenn nicht ermittelbar. */
  freierPlatzGB(pfad: string): number | undefined;
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
  // Whisper ist nur für «schnitt transkribiere» nötig: fehlt es, ist das eine Warnung, kein Fehler
  const whisper = whisperProgramm(s.env, s.userHome);
  if (s.befehl(whisper, ["--help"])) add("ok", "Whisper", `${whisper} vorhanden (schnitt transkribiere)`);
  else add("warnung", "Whisper", `«${whisper}» fehlt. Einrichten: «./studio whisper einrichten». Ohne Whisper lässt sich ein Transkript auch anderswo erzeugen und mit «./studio schnitt zuordnen» benutzen`);
  if (s.befehl("npx", ["--version"])) add("ok", "npx", "vorhanden (holt HyperFrames in der fest eingetragenen Version)");
  else add("fehler", "npx", "fehlt. Node samt npm installieren");

  let home: StudioHome | undefined;
  try {
    home = studioHome(s.env, s.userHome);
  } catch (e) {
    add("fehler", "Studio-Ordner", (e as Error).message);
  }
  if (!home) {
    if (!p.some((x) => x.name === "Studio-Ordner")) add("fehler", "Studio-Ordner", "nicht eingerichtet. «./studio init» ausführen");
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
  const wurzel = onedriveWurzel(home.pfad, s.userHome);
  if (wurzel) {
    if (nurWegZu(wurzel, home.pfad)) {
      add("warnung", "OneDrive-Konto", `Im OneDrive-Ordner «${path.basename(wurzel)}» liegt ausser dem Weg zu Studio nichts. Vermutlich ist das Konto nicht angemeldet oder der Eintrag ein Doppel. Der Ordner würde auf keinem anderen Mac erscheinen («ls ~/Library/CloudStorage» zeigt alle Einträge)`);
    }
    const basis = OHNE_ZAEHLER(path.basename(wurzel));
    const doppelt = findeOneDrive(s.userHome).filter((k) => OHNE_ZAEHLER(path.basename(k)) === basis);
    if (doppelt.length > 1) {
      const liste = doppelt.map((k) => `${path.basename(k)} (${eintraege(k)?.length ?? "nicht lesbar"} Einträge)`).join(", ");
      add("hinweis", "OneDrive-Doppel", `Dasselbe Konto erscheint mehrfach: ${liste}. Studio soll im Eintrag liegen, in dem deine Ordner wirklich sind`);
    }
  }
  if (s.platform === "darwin") {
    add("hinweis", "OneDrive-Dateien", "Im Finder Rechtsklick auf «Studio» → «Immer auf diesem Gerät behalten». Sonst sind Dateien nur Platzhalter, und das Rendern findet sie nicht");
  }

  try {
    fs.accessSync(home.pfad, fs.constants.W_OK);
    add("ok", "Schreibrecht", "vorhanden");
  } catch {
    add("fehler", "Schreibrecht", `Kein Schreibrecht auf ${home.pfad}`);
  }
  const medien = medienOrdner(home);
  if (home.medien) {
    if (!fs.existsSync(home.medien)) {
      add("fehler", "Medien-Ordner", `${home.medien} existiert nicht. Ist das Laufwerk angeschlossen? («ls /Volumes» zeigt die angeschlossenen Laufwerke)`);
    } else {
      add("ok", "Medien-Ordner", `${home.medien} (grosse Dateien liegen ausserhalb von OneDrive)`);
      try {
        fs.accessSync(home.medien, fs.constants.W_OK);
      } catch {
        add("fehler", "Schreibrecht Medien", `Kein Schreibrecht auf ${home.medien}`);
      }
    }
  }
  const fehlendKlein = KLEINE_UNTERORDNER.filter((u) => !fs.existsSync(path.join(home!.pfad, u)));
  const fehlendGross = fs.existsSync(medien) ? GROSSE_UNTERORDNER.filter((u) => !fs.existsSync(path.join(medien, u))) : [];
  const fehlend = [...fehlendKlein, ...fehlendGross];
  if (fehlend.length) add("warnung", "Unterordner", `fehlen: ${fehlend.join(", ")}. «./studio init» legt sie an`);
  else add("ok", "Unterordner", UNTERORDNER.join(", "));

  const orte: [string, string][] = home.medien ? [["Platz Studio-Ordner", home.pfad], ["Platz Medien", home.medien]] : [["Platz", home.pfad]];
  for (const [name, ort] of orte) {
    const gb = fs.existsSync(ort) ? s.freierPlatzGB(ort) : undefined;
    if (gb === undefined) continue;
    const text = `${gb.toFixed(0)} GB frei`;
    if (gb < PLATZ_FEHLER_GB) add("fehler", name, `${text}. Das reicht nicht einmal für ein Projekt`);
    else if (gb < PLATZ_WARNUNG_GB) {
      const ausweg = name === "Platz Studio-Ordner" ? "Der Studio-Ordner enthält nur kleine Daten, das ist in Ordnung." : "Für Phase 0 reicht das, für echte Rohvideos nicht. Grosse Dateien gehören auf ein grosses Laufwerk: init --medien";
      add("warnung", name, `${text}. ${ausweg}`);
    }
    else add("ok", name, text);
  }

  const ideen = path.join(home.pfad, "daten", "ideen.json");
  if (fs.existsSync(ideen)) {
    const f = s.ideenProtokollPruefen(ideen);
    if (f) add("fehler", "Ideenprotokoll", f);
    else add("ok", "Ideenprotokoll", "lesbar und gültig");
  } else add("hinweis", "Ideenprotokoll", "noch leer (entsteht mit der ersten Idee)");

  const bib = s.bibliothekPruefen();
  if (bib.fehler) add("fehler", "Motion-Bibliothek", `${bib.fehler} Fehler im Lint («./studio motion lint»)`);
  else add("ok", "Motion-Bibliothek", `Lint ohne Fehler${bib.warnungen ? `, ${bib.warnungen} Warnungen` : ""}`);

  const nz = s.notionZielPruefen();
  if (nz) add("fehler", "Notion", nz);
  else add("ok", "Notion", "notion.json ist gültig. Zugriff hängt am Notion-Konto in Claude (Seite «Video-Studio» muss geteilt sein)");

  add("hinweis", "HyperFrames", "Einmal je Mac: «npx hyperframes@0.8.164 browser ensure» und «npx hyperframes@0.8.164 telemetry disable» (wegen Kundenmaterial)");
  return p;
}

export function formatiere(punkte: Pruefpunkt[]): string {
  const zeichen: Record<Stufe, string> = { ok: "ok     ", hinweis: "Hinweis", warnung: "Warnung", fehler: "FEHLER " };
  return punkte.map((x) => `${zeichen[x.stufe]} ${x.name}: ${x.text}`).join("\n");
}

export const hatFehler = (p: Pruefpunkt[]): boolean => p.some((x) => x.stufe === "fehler");
