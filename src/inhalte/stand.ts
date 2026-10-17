import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { STATI } from "./inhalt";

/**
 * Der Stand, den der Abgleich zuletzt übernommen hat (Plan v3, 3.1: Notion erzwingt keine Übergangsregeln, der Code prüft und setzt zurück).
 * Er liegt lokal in `<Studio>/daten/inhalte-stand.json`. Er ist keine zweite Wahrheit für Texte, sondern das Gedächtnis dafür, was zuletzt gültig war.
 */

const TorStand = z.object({ entscheid: z.string(), von: z.string(), am: z.string() });

export const Eintrag = z.object({
  status: z.enum(STATI),
  /** Status vor «Pausiert»: nur dorthin führt die Pause zurück. */
  vorPause: z.enum(STATI).optional(),
  torI: TorStand,
  torP: TorStand,
  /** Wann der Abgleich diesen Status übernommen hat. */
  seit: z.string(),
});

export const Pruefung = z.object({ bestanden: z.boolean(), text: z.string().optional(), am: z.string() });

export const Stand = z.object({
  version: z.number().int().nonnegative(),
  inhalte: z.record(z.string(), Eintrag),
  /** Ergebnis der Prüfung des Entwurfs je Inhalt (Textprüfung oder Render-Prüfung). Ohne Eintrag gilt «nicht geprüft». */
  pruefungen: z.record(z.string(), Pruefung),
});

export type Stand = z.infer<typeof Stand>;
export type Eintrag = z.infer<typeof Eintrag>;
export type Pruefung = z.infer<typeof Pruefung>;

const Datei = Stand.extend({ schema: z.literal(1) });

export const leererStand = (): Stand => ({ version: 0, inhalte: {}, pruefungen: {} });

export class StandFehler extends Error {}

export function ladeStand(datei: string): Stand {
  if (!fs.existsSync(datei)) return leererStand();
  let json: unknown;
  try {
    json = JSON.parse(fs.readFileSync(datei, "utf8"));
  } catch (e) {
    throw new StandFehler(`${datei} ist kein gültiges JSON: ${(e as Error).message}`);
  }
  const p = Datei.safeParse(json);
  if (!p.success) throw new StandFehler(`${datei} entspricht nicht dem Stand-Schema: ${p.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  const { schema: _s, ...rest } = p.data;
  return rest;
}

/** Schreibt atomar und nur, wenn niemand dazwischen gespeichert hat (gleiche Regel wie beim Ideenprotokoll). */
export function speichereStand(datei: string, s: Stand): Stand {
  const aufDisk = fs.existsSync(datei) ? ladeStand(datei).version : 0;
  if (aufDisk !== s.version) throw new StandFehler(`Der Stand wurde inzwischen geändert (Version ${aufDisk}, erwartet ${s.version}). Neu laden und wiederholen.`);
  const neu: Stand = { ...s, version: s.version + 1 };
  fs.mkdirSync(path.dirname(datei), { recursive: true });
  const tmp = `${datei}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ schema: 1, ...neu }, null, 2) + "\n");
  fs.renameSync(tmp, datei);
  return neu;
}
