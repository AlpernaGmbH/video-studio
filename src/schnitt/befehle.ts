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
import { z } from "zod";
import { erzeugeBogen } from "./kontaktbogen";
import { fehlendeDateien, erzeugeVorschau, kannUntertitel } from "./vorschau";
import { STANDARD_SCHNITTPROFIL } from "./planbau";
import { gruppiere, schreibeSrt, woerterAufTimeline } from "./untertitel";
import { auftragBefehl, storyboardBefehl } from "./storyboard-befehle";
import { zuordnungBericht } from "./bericht";
import { leseSchnittplan, platziere, SchnittQuelle } from "./plan";
import { pruefeSchnittplan } from "./pruefung";
import { erzeugeUebergabe, loesePfad, relativierePfad } from "./uebergabe";
import { leseTranskript } from "./transkript";
import { STANDARD_MODELL, transkribiere } from "./whisper";
import { fuehreZuordnungAus } from "./zuordnen";

/** Befehle `studio schnitt …`: Schnittplan prüfen, an Resolve übergeben, Quellen sondieren, fertigen Export prüfen. */

export const SCHNITT_HILFE = `Schnitt und Übergabe an DaVinci Resolve (docs/plan/editing-blueprint.md)
  schnitt beispiel                    Beispiel eines Schnittplans (JSON) ausgeben. Aufbau: prompts/beispiele/schnittplan.json
  schnitt sondiere <datei...>         Länge, Bildrate, Grösse, Ton und Timecode-Beginn mit ffprobe lesen (für die Liste «quellen» im Plan)
  schnitt transkribiere <aufnahme> [--modell large-v3] [--sprache de] [-o transkript.json]
                                      Whisper lokal aufrufen (openai-whisper, STUDIO_WHISPER_BIN ersetzt das Programm) und das JSON mit Wortzeiten ablegen,
                                      Standard <Datenordner>/transkripte/<Name>.json. Das Modell «large-v3» ist eine Annahme, Test T2 entscheidet.
  schnitt zuordnen --skript skript.md --transkript <quelle>=<whisper.json>[,…] --quellen quellen.json --marke key -o plan.json
                                      [--name "Titel"] [--inhalt c-0007] [--gesprochen 3,5] [--ohne-pegel] [--bericht bericht.json]
                                      Skript und Whisper-Transkript zu einem Schnittplan: pro Zeile der beste Take (Bauplan v2, Kap. 3.3), Pausen, Füllwörter und Bildwechsel
                                      nach dem Schnittprofil der Marke (Kap. 3.4). Die Quelle im Transkript ist die Kennung aus quellen.json (Ausgabe von «./studio schnitt sondiere»).
                                      --gesprochen: Zeilen, deren Untertitel den gesprochenen statt den Skripttext nehmen. B-Roll, Grafiken und Musik kommen später ins Storyboard.
  schnitt auftrag --plan plan.json [--katalog katalog.json] [--regeln regeln.json] [--marke key] [-o auftrag.md]
                                      Auftrag für das Storyboard (Bauplan v2, Kap. 3.5): Skript mit Zeiten der Timeline, aktive Stücke, B-Roll aus dem Katalog, aktive Regeln, Format der Antwort.
                                      Katalog: Liste von Katalog-Einträgen (JSON), Standard <Datenordner>/katalog.json
  schnitt storyboard --plan plan.json --storyboard sb.json -o plan-storyboard.json [--katalog …] [--entwurf] [--rendern [--final]]
                                      Antwort von Claude prüfen und in den Plan übernehmen: B-Roll auf V2 (Dateien werden sondiert), Grafiken auf V3 (Verweis auf renders/<Inhalt>/…webm),
                                      betonte Wörter. Verworfenes steht mit Grund in der Ausgabe. --rendern rendert die Grafiken (HyperFrames), sonst steht der Befehl dafür in der Ausgabe.
                                      Ein früheres Storyboard im Plan wird ersetzt. Das Ergebnis ist ein Entwurf: Freigeben tut ein Mensch.
  schnitt kontaktbogen --plan plan.json [-o kontaktbogen.html]
                                      Ein Standbild pro Grafik und B-Roll mit Zeit und Begründung als eine HTML-Datei (ohne externe Teile) für die Bestätigung des Storyboards.
                                      Standard: .cache/kontaktbogen-<Inhalt>.html im Repo. Nicht gerenderte Grafiken und fehlende Dateien stehen im Bild und in der Ausgabe.
  schnitt vorschau --plan plan.json [-o vorschau.mp4] [--ohne-untertitel]
                                      Vorschau-Video (540x960, 25p) mit Clips, Zoom, B-Roll, Grafiken, Musik und eingebrannten Untertiteln. Eine Näherung zum Ansehen, kein Export.
                                      Standard: <Studio>/inhalte/<Inhalt-ID>/ergebnis/vorschau.mp4, eine vorhandene Datei wird nie überschrieben (vorschau-v2.mp4).
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
        const pfad = home ? relativierePfad(home, path.resolve(d)) : null;
        aus.push({ id: path.basename(d, path.extname(d)).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), pfad: pfad ?? `(ausserhalb von Studio und Medien-Ordner: ${path.resolve(d)})`, ...s });
      }
      console.log(JSON.stringify(aus, null, 2));
      if (aus.some((x) => x.pfad.startsWith("("))) {
        console.error(`Hinweis: Pfade im Plan sind relativ zum Studio-Ordner (Rohmaterial und Renders zum Medien-Ordner, Unterordner ${GROSSE_UNTERORDNER.join(", ")}).`);
        return 1;
      }
      return 0;
    }
    case "transkribiere": {
      const eingang = a.pos[2];
      if (!eingang) throw new Error("Aufruf: schnitt transkribiere <aufnahme>");
      const name = path.basename(eingang, path.extname(eingang)).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "aufnahme";
      const ziel = typeof a.opt["o"] === "string" ? (a.opt["o"] as string) : path.join(env.datenDir, "transkripte", `${name}.json`);
      const r = await transkribiere({ eingang, ziel, modell: typeof a.opt["modell"] === "string" ? (a.opt["modell"] as string) : STANDARD_MODELL, sprache: typeof a.opt["sprache"] === "string" ? (a.opt["sprache"] as string) : "de" });
      console.log(`${r.datei}: ${r.segmente} Segmente über ${r.spanne.toFixed(1).replace(".", ",")} s, ${r.mitWortzeiten} mit Wortzeiten, ${r.ueberLimit} über ${4} s (werden geteilt)`);
      if (r.mitWortzeiten < r.segmente) console.log(`Hinweis: ${r.segmente - r.mitWortzeiten} Segmente ohne Wortzeiten. Sie werden nach Zeichenzahl verteilt, Pausen im Satz und Füllwörter lassen sich dort nicht schneiden (--word_timestamps True).`);
      console.log(`Nächster Schritt: «./studio schnitt zuordnen --transkript <quelle>=${r.datei} …»`);
      return 0;
    }
    case "zuordnen": {
      const marke = ladeMarke(env, pflicht(a, "marke", "Schlüssel des Markenprofils, zum Beispiel alperna"));
      const skriptDatei = pflicht(a, "skript", "Skript als Text oder Markdown");
      const quellen = z.array(SchnittQuelle).min(1).parse(lesJson(pflicht(a, "quellen", "Liste der Quellen als JSON, Ausgabe von «./studio schnitt sondiere»")));
      const ausDatei = pflicht(a, "o", "Zieldatei für den Schnittplan, zum Beispiel -o plan.json");
      const videos = quellen.filter((q) => q.art === "video");
      const roh = pflicht(a, "transkript", "Quelle=Datei, mehrere durch Komma getrennt");
      const eintraege = roh.split(",").map((x) => x.trim()).filter(Boolean).map((x) => {
        if (x.includes("=")) return [x.slice(0, x.indexOf("=")), x.slice(x.indexOf("=") + 1)] as const;
        if (videos.length !== 1) throw new Error(`--transkript ${x}: Bei mehreren Videoquellen braucht jedes Transkript die Kennung (<quelle>=<datei>)`);
        return [videos[0]!.id, x] as const;
      });
      const transkripte = eintraege.map(([id, datei]) => {
        if (!quellen.some((q) => q.id === id && q.art === "video")) throw new Error(`--transkript: «${id}» ist keine Videoquelle aus ${a.opt["quellen"]}`);
        return { quelle: id, segmente: leseTranskript(lesJson(datei)) };
      });
      const gesprochen = typeof a.opt["gesprochen"] === "string" ? (a.opt["gesprochen"] as string).split(",").map((x) => Number(x.trim())).filter((x) => Number.isInteger(x) && x > 0) : [];
      const name = typeof a.opt["name"] === "string" ? (a.opt["name"] as string) : path.basename(skriptDatei, path.extname(skriptDatei));
      const inhalt = typeof a.opt["inhalt"] === "string" ? (a.opt["inhalt"] as string) : undefined;
      const { plan, zuordnung, markierungen, pegelNotiz } = await fuehreZuordnungAus({
        marke,
        skriptText: fs.readFileSync(skriptDatei, "utf8"),
        skriptQuelle: skriptDatei,
        quellen,
        transkripte,
        name,
        ...(inhalt ? { inhalt } : {}),
        gesprochen,
        ...(studioHome() ? { home: studioHome()! } : {}),
        ohnePegel: a.opt["ohne-pegel"] === true,
      });

      fs.writeFileSync(ausDatei, `${JSON.stringify(plan, null, 2)}\n`);
      if (typeof a.opt["bericht"] === "string") fs.writeFileSync(a.opt["bericht"] as string, `${JSON.stringify({ zuordnung, markierungen }, null, 2)}\n`);

      for (const l of zuordnungBericht(zuordnung, markierungen)) console.log(l);
      if (pegelNotiz) console.log(`\n${pegelNotiz}`);
      const befunde = pruefeSchnittplan(plan, { profil: marke.schnittprofil });
      if (befunde.length) {
        console.log("\nPrüfung des Plans:");
        zeige(befunde);
      }
      const dauerPlan = platziere(plan);
      console.log(`\nPlan: ${ausDatei} (${plan.clips.length} Clips, ${(dauerPlan.gesamtFrames / plan.projekt.fps).toFixed(1).replace(".", ",")} s)\nNächster Schritt: Abweichungen und gelbe Stellen entscheiden, B-Roll und Grafiken im Storyboard ergänzen, dann «./studio schnitt pruefe --plan ${ausDatei}» und «./studio schnitt resolve».`);
      return 0;
    }
    case "auftrag":
      return auftragBefehl(a, env);
    case "storyboard":
      return storyboardBefehl(a, env);
    case "vorschau": {
      const home = studioHome();
      if (!home) throw new Error("Der Studio-Ordner ist auf diesem Rechner nicht eingerichtet: «./studio init» ausführen");
      const plan = leseSchnittplan(lesJson(pflicht(a, "plan", "Schnittplan als JSON")));
      const loese = (rel: string): string => loesePfad(home, rel);
      const fehlt = fehlendeDateien(plan, loese);
      if (fehlt.length) throw new Error(`Für die Vorschau fehlen Dateien auf diesem Rechner (Grafiken: zuerst «./studio schnitt storyboard … --rendern»):\n- ${fehlt.join("\n- ")}`);
      let ziel: string;
      if (typeof a.opt["o"] === "string") ziel = path.resolve(a.opt["o"] as string);
      else {
        const basis = path.join(home.pfad, "inhalte", plan.projekt.inhalt ?? "ohne-inhalt", "ergebnis");
        ziel = path.join(basis, "vorschau.mp4");
        for (let n = 2; fs.existsSync(ziel); n++) ziel = path.join(basis, `vorschau-v${n}.mp4`);
      }
      fs.mkdirSync(path.dirname(ziel), { recursive: true });
      let srt: string | undefined;
      let notiz = "";
      if (a.opt["ohne-untertitel"] === true) notiz = "ohne Untertitel (--ohne-untertitel)";
      else if (!plan.woerter.length) notiz = "ohne Untertitel (der Plan hat keine Wörter)";
      else if (!(await kannUntertitel())) notiz = "ohne Untertitel: dieses ffmpeg hat keinen Filter «subtitles» (libass)";
      else {
        const profil = ladeMarke(env, plan.projekt.marke).schnittprofil ?? STANDARD_SCHNITTPROFIL;
        srt = path.join(path.dirname(ziel), `.vorschau-${process.pid}.srt`);
        fs.writeFileSync(srt, schreibeSrt(gruppiere(woerterAufTimeline(plan, platziere(plan)), profil), plan.projekt.fps));
      }
      try {
        const r = await erzeugeVorschau({ plan, loese: (rel) => loese(rel), ausgabe: ziel, untertitel: srt });
        console.log(`${r.datei}\n${(fs.statSync(ziel).size / 1024 / 1024).toFixed(1).replace(".", ",")} MB, ${r.dauer.toFixed(1).replace(".", ",")} s${notiz ? `, ${notiz}` : ""}`);
      } finally {
        if (srt) fs.rmSync(srt, { force: true });
      }
      console.log("Eine Näherung zum Ansehen: kein Look, keine Übergänge, roher Ton, 540p. Als Video taugt erst der Export aus Resolve.");
      return 0;
    }
    case "kontaktbogen": {
      const home = studioHome();
      if (!home) throw new Error("Der Studio-Ordner ist auf diesem Rechner nicht eingerichtet: «./studio init» ausführen");
      const plan = leseSchnittplan(lesJson(pflicht(a, "plan", "Schnittplan als JSON")));
      const ziel = typeof a.opt["o"] === "string" ? path.resolve(a.opt["o"] as string) : path.join(env.studioRoot, ".cache", `kontaktbogen-${plan.projekt.inhalt ?? "plan"}.html`);
      const r = await erzeugeBogen({ plan, loese: (p) => loesePfad(home, p) });
      fs.mkdirSync(path.dirname(ziel), { recursive: true });
      fs.writeFileSync(ziel, r.html);
      console.log(`${ziel}\n${(Buffer.byteLength(r.html) / 1024).toFixed(0)} KB, ${r.eintraege.length} Einträge, ${r.eintraege.length - r.ohneBild.length} mit Standbild`);
      if (r.nichtGerendert.length) console.log(`Nicht gerendert: Eintrag ${r.nichtGerendert.join(", ")} (zuerst «./studio schnitt storyboard … --rendern»)`);
      if (r.ohneBild.length) console.log(`Ohne Standbild: Eintrag ${r.ohneBild.join(", ")}`);
      return r.ohneBild.length || r.nichtGerendert.length ? 1 : 0;
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
      if (!home) throw new Error("Der Studio-Ordner ist auf diesem Rechner nicht eingerichtet: «./studio init» ausführen");
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
