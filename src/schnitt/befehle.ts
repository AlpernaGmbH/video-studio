import fs from "node:fs";
import path from "node:path";
import type { Args } from "../args";
import { ladeMarke, type Umgebung } from "../motion/werkstatt";
import { ladeBibliothek } from "../motion/bibliothek";
import { pruefeAudio, pruefeExport } from "../presets/export";
import { findePreset, ladePresets } from "../presets/lader";
import { messeDatei, sondiere } from "../presets/messen";
import { GROSSE_UNTERORDNER, medienOrdner, studioHome } from "../setup";
import { markeFuerExportFreigegeben } from "../core/schemas";
import { leseSchnittplan } from "./plan";
import { pruefeSchnittplan } from "./pruefung";
import { erzeugeUebergabe } from "./uebergabe";

/** Befehle `studio schnitt …`: Schnittplan prüfen, an Resolve übergeben, Quellen sondieren, fertigen Export prüfen. */

export const SCHNITT_HILFE = `Schnitt und Übergabe an DaVinci Resolve (docs/plan/editing-blueprint.md)
  schnitt beispiel                    Beispiel eines Schnittplans (JSON) ausgeben. Aufbau: prompts/beispiele/schnittplan.json
  schnitt sondiere <datei...>         Länge, Bildrate, Grösse, Ton und Timecode-Beginn mit ffprobe lesen (für die Liste «quellen» im Plan)
  schnitt pruefe --plan plan.json [--marke key] [--entwurf]
                                      Plan prüfen: Quellen, Grenzen, Regeln des Schnittprofils der Marke (Pausen, Bildwechsel, Hook, Sprechtempo)
  schnitt resolve --plan plan.json [--aus ordner] [--preset reel] [--audio standard] [--marke key] [--nicht-strikt] [--entwurf]
                                      Ordner für Resolve schreiben: timeline.fcpxml, timeline.otio, untertitel.srt, Grafiken als ProRes 4444, LIESMICH.md.
                                      Ohne --aus: <Studio>/inhalte/<Inhalt-ID>/ergebnis/resolve. Ein vorhandener Ordner wird nie überschrieben (resolve-v2).
                                      --entwurf: auch Stücke zulassen, die noch nicht «aktiv» sind (sonst gilt Regel 3: nur aktive Stücke).
  schnitt export-pruefen <datei> [--preset reel] [--audio standard]
                                      Fertiges Video messen (ffprobe, ffmpeg ebur128) und gegen Export- und Audio-Preset vergleichen. Exit-Code 1 bei Abweichung.
`;

const lesJson = (datei: string): unknown => JSON.parse(fs.readFileSync(datei, "utf8"));
const pflicht = (a: Args, name: string, hilfe: string): string => {
  const v = a.opt[name];
  if (typeof v !== "string" || !v) throw new Error(`--${name} fehlt (${hilfe})`);
  return v;
};
const opt = (a: Args, name: string, standard: string): string => (typeof a.opt[name] === "string" ? (a.opt[name] as string) : standard);
const zeige = (b: { stufe: string; code: string; text: string }[]): void => {
  for (const x of b) console.log(`${x.stufe === "fehler" ? "FEHLER " : "Hinweis"} ${x.code}: ${x.text}`);
};

export async function schnittBefehl(sub: string, a: Args, env: Umgebung): Promise<number> {
  const presetDir = path.join(env.studioRoot, "presets");
  switch (sub) {
    case "beispiel": {
      console.log(fs.readFileSync(path.join(env.studioRoot, "prompts", "beispiele", "schnittplan.json"), "utf8").trimEnd());
      return 0;
    }
    case "sondiere": {
      const dateien = a.pos.slice(2);
      if (!dateien.length) throw new Error("Aufruf: schnitt sondiere <datei...>");
      const home = studioHome();
      const aus = [];
      for (const d of dateien) {
        const s = await sondiere(d);
        const abs = path.resolve(d);
        let pfad: string | null = null;
        if (home) {
          for (const wurzel of [medienOrdner(home), home.pfad]) {
            const rel = path.relative(wurzel, abs);
            if (!rel.startsWith("..") && !path.isAbsolute(rel)) {
              pfad = rel.split(path.sep).join("/");
              break;
            }
          }
        }
        aus.push({ id: path.basename(d, path.extname(d)).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), pfad: pfad ?? `(ausserhalb von Studio und Medien-Ordner: ${abs})`, ...s });
      }
      console.log(JSON.stringify(aus, null, 2));
      if (aus.some((x) => x.pfad.startsWith("("))) {
        console.error(`Hinweis: Pfade im Plan sind relativ zum Studio-Ordner (Rohmaterial und Renders zum Medien-Ordner, Unterordner ${GROSSE_UNTERORDNER.join(", ")}).`);
        return 1;
      }
      return 0;
    }
    case "pruefe": {
      const plan = leseSchnittplan(lesJson(pflicht(a, "plan", "Schnittplan als JSON")));
      const marke = typeof a.opt["marke"] === "string" ? ladeMarke(env, a.opt["marke"]) : ladeMarke(env, plan.projekt.marke);
      const stuecke = ladeBibliothek(env.bibliothek).stuecke.map((g) => g.stueck);
      const b = pruefeSchnittplan(plan, { profil: marke.schnittprofil, stuecke, nurAktive: a.opt["entwurf"] !== true });
      zeige(b);
      const fehler = b.filter((x) => x.stufe === "fehler").length;
      console.log(`${fehler} Fehler, ${b.length - fehler} Hinweise`);
      return fehler ? 1 : 0;
    }
    case "resolve": {
      const home = studioHome();
      if (!home) throw new Error("Der Studio-Ordner ist auf diesem Rechner nicht eingerichtet: «studio init» ausführen");
      const plan = leseSchnittplan(lesJson(pflicht(a, "plan", "Schnittplan als JSON")));
      const lib = ladePresets(presetDir);
      const marke = ladeMarke(env, typeof a.opt["marke"] === "string" ? a.opt["marke"] : plan.projekt.marke);
      const stuecke = ladeBibliothek(env.bibliothek).stuecke.map((g) => g.stueck);
      const r = erzeugeUebergabe({
        plan,
        home,
        aus: typeof a.opt["aus"] === "string" ? a.opt["aus"] : undefined,
        profil: marke.schnittprofil,
        stuecke,
        nurAktive: a.opt["entwurf"] !== true,
        export: findePreset(lib, "export", opt(a, "preset", "reel")),
        audio: findePreset(lib, "audio", opt(a, "audio", "standard")),
        strikt: a.opt["nicht-strikt"] !== true,
      });
      zeige(r.befunde);
      const freigabe = markeFuerExportFreigegeben(marke);
      if (!freigabe.ok) console.log(`Hinweis marke: ${freigabe.grund}. Der Ordner ist ein Entwurf, kein Material zum Veröffentlichen`);
      console.log(`\nOrdner: ${r.ordner}\nDateien: ${r.dateien.join(", ")}${r.umgewandelt.length ? `\nGrafiken umgewandelt: ${r.umgewandelt.join(", ")}` : ""}\nLänge ${r.dauer.toFixed(1)} s, ${r.untertitel} Untertitel-Seiten\n\nNächster Schritt: ${path.join(r.ordner, "LIESMICH.md")} lesen, dann in Resolve importieren.`);
      return 0;
    }
    case "export-pruefen": {
      const datei = a.pos[2];
      if (!datei) throw new Error("Aufruf: schnitt export-pruefen <datei> [--preset reel] [--audio standard]");
      const lib = ladePresets(presetDir);
      const exp = findePreset(lib, "export", opt(a, "preset", "reel"));
      const aud = findePreset(lib, "audio", opt(a, "audio", "standard"));
      const m = await messeDatei(datei);
      const abw = [...pruefeExport(m, exp), ...pruefeAudio(m, aud)];
      console.log(JSON.stringify({ messung: m, preset: exp.id, audio: aud.id, abweichungen: abw }, null, 2));
      return abw.length ? 1 : 0;
    }
    default:
      console.error(`Unbekannter Befehl «schnitt ${sub}»\n`);
      console.error(SCHNITT_HILFE);
      return 2;
  }
}
