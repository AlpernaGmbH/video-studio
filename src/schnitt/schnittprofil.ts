import path from "node:path";
import { Schnittprofil, type Markenprofil } from "../core/schemas";
import type { Umgebung } from "../motion/werkstatt";
import { findePreset, ladePresets, type PresetBibliothek } from "../presets/lader";
import type { SchnittprofilPreset } from "../presets/schema";

/**
 * Welches Schnittprofil gilt für einen Inhalt (M9)? Eine einzige Stelle entscheidet, damit Zuordnung, Prüfung, Storyboard, Untertitel und Qualitätsmessung
 * dasselbe Profil sehen:
 *  - ohne Wahl das Profil der Marke (so war es immer; Alperna: ruhig und hochwertig),
 *  - mit Wahl das Preset (`presets/schnittprofil/<id>.json`) über dem Profil der Marke; die Textlängen der Marke bleiben,
 *  - ein schnelles Preset nur, wenn ein Mensch es ausdrücklich verlangt hat (`schnell`).
 * Die Wahl steht im Plan (`projekt.schnittprofil`) und im `reel.json`, damit sie nicht bei jedem Befehl neu angegeben werden muss.
 */

export interface ProfilWahl {
  id: string;
  /** Ein Mensch hat das schnelle Profil ausdrücklich verlangt. Ohne dieses Zeichen weist ein schnelles Preset ab. */
  schnell?: boolean | undefined;
}

export class ProfilFehler extends Error {}

/** Legt ein Preset über das Profil der Marke. Die Textlängen gehören der Marke, nicht dem Format. */
export function wendeProfilAn(marke: Markenprofil, preset: SchnittprofilPreset, schnell: boolean): Schnittprofil {
  if (preset.tempo === "schnell" && !schnell) {
    throw new ProfilFehler(`Das Schnittprofil «${preset.id}» ist schnell und wird nur auf ausdrücklichen Wunsch benutzt: mit --schnell bestätigen (die Marke «${marke.name}» ist ruhig)`);
  }
  return Schnittprofil.parse({ ...preset.profil, textlaengen: marke.schnittprofil?.textlaengen ?? {} });
}

/** Das gültige Profil: das der Marke, oder das gewählte Preset über der Marke. `undefined` heisst: weder Marke noch Wahl nennen eines (die Aufrufer nehmen dann ihren Standard). */
export function schnittprofilFuer(marke: Markenprofil, wahl: ProfilWahl | undefined, presets: PresetBibliothek): Schnittprofil | undefined {
  if (!wahl) return marke.schnittprofil;
  const ids = presets.schnittprofil.map((p) => p.id);
  if (!ids.includes(wahl.id)) throw new ProfilFehler(`Schnittprofil «${wahl.id}» gibt es nicht. Vorhanden: ${ids.join(", ") || "keine"}`);
  return wendeProfilAn(marke, findePreset(presets, "schnittprofil", wahl.id), wahl.schnell === true);
}

/** Wie `schnittprofilFuer`, lädt die Presets aber nur, wenn es eine Wahl gibt (ohne Wahl bleibt alles beim Alten). */
export function ladeSchnittprofil(env: Umgebung, marke: Markenprofil, wahl: ProfilWahl | undefined): Schnittprofil | undefined {
  if (!wahl) return marke.schnittprofil;
  return schnittprofilFuer(marke, wahl, ladePresets(path.join(env.studioRoot, "presets")));
}

/** Die Wahl aus den Befehlsoptionen: `--schnittprofil <id>` (`standard` hebt eine frühere Wahl auf), `--schnell` bestätigt ein schnelles Profil. */
export function wahlAusOptionen(opt: Record<string, string | boolean | undefined>, alt?: ProfilWahl): ProfilWahl | undefined {
  const v = opt["schnittprofil"];
  if (v === undefined) {
    if (opt["schnell"] === true && !alt) throw new ProfilFehler("--schnell gehört zu --schnittprofil <id>");
    return alt ? { id: alt.id, ...(alt.schnell || opt["schnell"] === true ? { schnell: true } : {}) } : undefined;
  }
  if (typeof v !== "string" || v.trim() === "") throw new ProfilFehler("--schnittprofil erwartet die ID eines Schnittprofils oder «standard»");
  if (v === "standard") return undefined;
  return { id: v, ...(opt["schnell"] === true ? { schnell: true } : {}) };
}
