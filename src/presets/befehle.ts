import path from "node:path";
import type { Args } from "../args";
import { werteAusSet } from "../args";
import { ladeBibliothek } from "../motion/bibliothek";
import { ladeMarke, type Umgebung } from "../motion/werkstatt";
import { captionFuerMarke, platzierung, presetZuOverlay } from "./grafik";
import { findePreset, ladePresets, lintGrafikPresets } from "./lader";
import { PRESET_ARTEN, type PresetArt } from "./schema";

/** Befehle `studio presets …`. */

export const PRESETS_HILFE = `Presets (Export, Ton, Untertitel, Grafik; Dateien unter presets/<art>/<id>.json)
  presets liste [--art export|audio|untertitel|grafik]   Alle Presets mit Herkunft (entschieden, annahme, unbelegt)
  presets lint                        Dateien prüfen und Grafik-Presets gegen die Motion-Bibliothek halten; Presets ohne Stück stehen als Lücke
  presets zeigen <art> <id>           Ein Preset als JSON
  presets overlay <id> --t 1.2 [--dauer s] [--begruendung "…"] --set k=v …
                                      Aus einem Grafik-Preset den Eintrag fürs Storyboard machen (prüft Dauer, Textgrenzen, Datenblatt des Stücks)
  presets platz <id> [--breite 1080 --hoehe 1920]        Wo das Preset im Bild steht (Ankerpunkt und grösste Breite in Pixeln, ohne Sicherheitsrand)
  presets caption <id> [--marke alperna]                 Untertitel-Preset als Caption-Preset der Marke ausgeben (Vorschlag, den ein Mensch bei Gate 0 übernimmt)
`;

export function presetsBefehl(sub: string, a: Args, env: Umgebung): number {
  const lib = ladePresets(path.join(env.studioRoot, "presets"));
  const stuecke = ladeBibliothek(env.bibliothek).stuecke.map((g) => g.stueck);
  const art = (v: unknown): PresetArt => {
    if (typeof v !== "string" || !(PRESET_ARTEN as readonly string[]).includes(v)) throw new Error(`Art fehlt oder unbekannt (${PRESET_ARTEN.join(", ")})`);
    return v as PresetArt;
  };
  switch (sub) {
    case "liste": {
      const arten = typeof a.opt["art"] === "string" ? [art(a.opt["art"])] : [...PRESET_ARTEN];
      for (const k of arten) {
        console.log(`${k}`);
        for (const p of lib[k] as { id: string; name: string; herkunft: { stand: string }; stueck?: string }[]) {
          console.log(`  ${p.id.padEnd(16)} ${p.herkunft.stand.padEnd(11)} ${p.name}${k === "grafik" ? (p.stueck ? `  [Stück ${p.stueck}]` : "  [Stück fehlt]") : ""}`);
        }
      }
      return 0;
    }
    case "lint": {
      const b = [...lib.befunde, ...lintGrafikPresets(lib.grafik, stuecke)];
      for (const x of b) console.log(`${x.stufe === "fehler" ? "FEHLER " : "Lücke  "} ${x.preset ? `[${x.preset}] ` : ""}${x.code}: ${x.text}`);
      const fehler = b.filter((x) => x.stufe === "fehler").length;
      console.log(`${lib.export.length + lib.audio.length + lib.untertitel.length + lib.grafik.length} Presets, ${fehler} Fehler, ${b.length - fehler} Lücken`);
      return fehler ? 1 : 0;
    }
    case "zeigen": {
      const k = art(a.pos[2]);
      const id = a.pos[3];
      if (!id) throw new Error("Aufruf: presets zeigen <art> <id>");
      console.log(JSON.stringify(findePreset(lib, k, id), null, 2));
      return 0;
    }
    case "overlay": {
      const id = a.pos[2];
      if (!id) throw new Error("Aufruf: presets overlay <id> --t <s> --set k=v …");
      if (typeof a.opt["t"] !== "string" || Number.isNaN(Number(a.opt["t"]))) throw new Error("--t <Sekunden> fehlt");
      const r = presetZuOverlay(
        findePreset(lib, "grafik", id),
        { t: Number(a.opt["t"]), dauer: typeof a.opt["dauer"] === "string" ? Number(a.opt["dauer"]) : undefined, werte: werteAusSet(a.set), begruendung: typeof a.opt["begruendung"] === "string" ? a.opt["begruendung"] : undefined },
        stuecke,
      );
      if (!r.ok) {
        for (const f of r.fehler) console.error(`FEHLER ${f}`);
        return 1;
      }
      console.log(JSON.stringify(r.overlay, null, 2));
      return 0;
    }
    case "platz": {
      const id = a.pos[2];
      if (!id) throw new Error("Aufruf: presets platz <id>");
      const breite = typeof a.opt["breite"] === "string" ? Number(a.opt["breite"]) : 1080;
      const hoehe = typeof a.opt["hoehe"] === "string" ? Number(a.opt["hoehe"]) : 1920;
      console.log(JSON.stringify(platzierung(findePreset(lib, "grafik", id), breite, hoehe), null, 2));
      return 0;
    }
    case "caption": {
      const id = a.pos[2];
      if (!id) throw new Error("Aufruf: presets caption <id> [--marke alperna]");
      const marke = ladeMarke(env, typeof a.opt["marke"] === "string" ? a.opt["marke"] : "alperna");
      console.log(JSON.stringify({ captionPreset: captionFuerMarke(findePreset(lib, "untertitel", id), marke), hinweis: `Vorschlag für marken/${marke.schluessel}.json, Feld «captionPreset». Übernehmen und freigeben tut ein Mensch bei Gate 0, mit dem Probebild.` }, null, 2));
      return 0;
    }
    default:
      console.error(`Unbekannter Befehl «presets ${sub}»\n`);
      console.error(PRESETS_HILFE);
      return 2;
  }
}
