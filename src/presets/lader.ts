import fs from "node:fs";
import path from "node:path";
import type { Stueck } from "../motion/stueck";
import { loeseVariablen } from "../motion/stueck";
import { AudioPreset, ExportPreset, GrafikPreset, PRESET_ARTEN, SCHEMAS, SchnittprofilPreset, UntertitelPreset, type Preset, type PresetArt } from "./schema";

export interface PresetBibliothek {
  export: ExportPreset[];
  audio: AudioPreset[];
  untertitel: UntertitelPreset[];
  grafik: GrafikPreset[];
  schnittprofil: SchnittprofilPreset[];
  befunde: PresetBefund[];
}

export interface PresetBefund {
  stufe: "fehler" | "warnung";
  preset?: string;
  code: string;
  text: string;
}

/** Lädt `presets/<art>/<id>.json`. Der Dateiname muss die ID tragen, jede ID kommt je Art nur einmal vor. */
export function ladePresets(root: string): PresetBibliothek {
  const lib: PresetBibliothek = { export: [], audio: [], untertitel: [], grafik: [], schnittprofil: [], befunde: [] };
  for (const art of PRESET_ARTEN) {
    const dir = path.join(root, art);
    if (!fs.existsSync(dir)) continue;
    const ids = new Set<string>();
    for (const datei of fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
      const name = `${art}/${datei}`;
      let roh: unknown;
      try {
        roh = JSON.parse(fs.readFileSync(path.join(dir, datei), "utf8"));
      } catch (e) {
        lib.befunde.push({ stufe: "fehler", code: "json", text: `${name} ist kein gültiges JSON: ${(e as Error).message}` });
        continue;
      }
      const p = SCHEMAS[art].safeParse(roh);
      if (!p.success) {
        for (const i of p.error.issues) lib.befunde.push({ stufe: "fehler", preset: datei.replace(/\.json$/, ""), code: "schema", text: `${name}: ${i.path.join(".") || "(Wurzel)"}: ${i.message}` });
        continue;
      }
      const preset = p.data as Preset;
      if (`${preset.id}.json` !== datei) lib.befunde.push({ stufe: "fehler", preset: preset.id, code: "dateiname", text: `${name}: Der Dateiname muss «${preset.id}.json» heissen` });
      if (ids.has(preset.id)) lib.befunde.push({ stufe: "fehler", preset: preset.id, code: "doppelt", text: `${name}: ID «${preset.id}» kommt in ${art} zweimal vor` });
      ids.add(preset.id);
      (lib[art] as Preset[]).push(preset);
    }
  }
  return lib;
}

/** Findet ein Preset einer Art. Wirft mit der Liste der vorhandenen IDs, wenn es fehlt. */
export function findePreset<A extends PresetArt>(lib: PresetBibliothek, art: A, id: string): PresetBibliothek[A][number] {
  const liste = lib[art] as { id: string }[];
  const p = liste.find((x) => x.id === id);
  if (!p) throw new Error(`Preset «${id}» gibt es nicht in «${art}». Vorhanden: ${liste.map((x) => x.id).join(", ") || "keine"}`);
  return p as PresetBibliothek[A][number];
}

/**
 * Prüft die Grafik-Presets gegen die Motion-Bibliothek. Ein Preset mit Stück muss zu dessen Datenblatt passen (Parameter, Wertebereich,
 * Dauer). Ein Preset ohne vorhandenes Stück ist eine Lücke: Es steht als Warnung in der Liste, gebaut wird das Stück nur über die Motion-Werkstatt
 * (Pitch, drei Looks, Abnahme), nie von diesem Lint.
 */
export function lintGrafikPresets(presets: GrafikPreset[], stuecke: Stueck[]): PresetBefund[] {
  const b: PresetBefund[] = [];
  const nachId = new Map(stuecke.map((s) => [s.id, s]));
  for (const p of presets) {
    if (!p.stueck) {
      b.push({ stufe: "warnung", preset: p.id, code: "ohne-stueck", text: `«${p.id}» hat noch kein Stück. Es fehlt in der Motion-Bibliothek: ${p.typ} (Idee über die Motion-Werkstatt)` });
      continue;
    }
    const s = nachId.get(p.stueck);
    if (!s) {
      b.push({ stufe: "fehler", preset: p.id, code: "stueck-unbekannt", text: `«${p.id}» nennt das Stück «${p.stueck}», das es in der Bibliothek nicht gibt` });
      continue;
    }
    if (p.dauer.min < s.dauer.min - 1e-9 || p.dauer.max > s.dauer.max + 1e-9) {
      b.push({ stufe: "fehler", preset: p.id, code: "dauer", text: `«${p.id}»: Dauer ${p.dauer.min} bis ${p.dauer.max} s reicht über den Bereich des Stücks (${s.dauer.min} bis ${s.dauer.max} s)` });
    }
    // Pflichtparameter sind Inhalt und stehen nie im Preset; für die Prüfung werden sie mit dem Vorschauwert gefüllt
    const probe: Record<string, unknown> = {};
    for (const par of s.parameter) if (par.pflicht && par.default !== undefined) probe[par.id] = par.default;
    const r = loeseVariablen(s, { ...probe, ...p.werte }, { dauer: p.dauer.standard, ohneMarke: true });
    if (!r.ok) for (const f of r.fehler) b.push({ stufe: "fehler", preset: p.id, code: "werte", text: `«${p.id}»: ${f}` });
    for (const k of Object.keys(p.text)) {
      if (!s.parameter.some((x) => x.id === k)) b.push({ stufe: "fehler", preset: p.id, code: "text-parameter", text: `«${p.id}»: Textgrenze für «${k}», aber das Stück «${s.id}» hat keinen solchen Parameter` });
    }
    for (const k of Object.keys(p.werte)) {
      const par = s.parameter.find((x) => x.id === k);
      if (par && par.rolle === "inhalt") b.push({ stufe: "fehler", preset: p.id, code: "inhalt-im-preset", text: `«${p.id}»: «${k}» ist Inhalt und gehört ins Storyboard, nicht ins Preset` });
    }
  }
  return b;
}
