import os from "node:os";
import path from "node:path";
import { configPfad } from "../setup";
import { ladeToolKonfig, schluesselbund, type KonfigOrt } from "./konfig";
import { erzeugeMelder, keinMelder, type Melder } from "./melder";

/** Wo auf diesem Rechner die Verbindung zum Tool liegt: neben `config.json` (`~/.config/video-studio/`, ausserhalb von Repo und OneDrive). */
export function standardOrt(env: NodeJS.ProcessEnv = process.env, home: string = os.homedir()): KonfigOrt {
  return { dir: path.dirname(configPfad(env, home)), env, schluessel: schluesselbund() };
}

export const ausgangsordner = (ort: KonfigOrt): string => path.join(ort.dir, "ausgang");

/**
 * Der Melder für diesen Rechner. Ohne eingerichtete Verbindung, bei jedem Fehler beim Lesen der Einstellungen und für Tests ohne Konfiguration
 * (`STUDIO_CONFIG` zeigt dort ins Leere) ist er ein Melder, der nichts tut.
 */
export function standardMelder(ort: KonfigOrt = standardOrt()): Melder {
  try {
    const g = ladeToolKonfig(ort);
    if (!g.konfig) return keinMelder;
    return erzeugeMelder({ konfig: g.konfig, ausgang: ausgangsordner(ort) });
  } catch {
    return keinMelder;
  }
}

/**
 * Vor dem Beenden eines Befehls: wartet höchstens `maxMs` auf den Rest im Ausgangskorb und gibt den einen Hinweis aus (Token abgelehnt), wenn es ihn gibt.
 * Wirft nie und ändert den Exit-Code nie, auch wenn der Melder selbst kaputt ist.
 */
export async function beendeMelder(melder: Melder, maxMs = 1500, meldung: (text: string) => void = (t) => console.error(t)): Promise<void> {
  try {
    await melder.leeren(maxMs);
    const hinweis = melder.hinweis();
    if (hinweis) meldung(hinweis);
  } catch {
    // Der Melder stört das Ende eines Befehls nie
  }
}
