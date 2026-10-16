import fs from "node:fs";
import path from "node:path";
import type { Akteur } from "../core/schemas";
import { STUECK_DATEI, ladeBibliothek, lintStueck, type GeladenesStueck } from "./bibliothek";
import { istMensch } from "./idee";
import { Stueck, type StueckStatus } from "./stueck";

export class AktivierungsFehler extends Error {
  constructor(
    message: string,
    readonly details: string[] = [],
  ) {
    super(details.length ? `${message}\n- ${details.join("\n- ")}` : message);
  }
}

function schreibe(g: GeladenesStueck, neu: Stueck) {
  const geprueft = Stueck.parse(neu);
  fs.writeFileSync(path.join(g.dir, STUECK_DATEI), JSON.stringify(geprueft, null, 2) + "\n");
}

function lade(libRoot: string, id: string): GeladenesStueck {
  const bib = ladeBibliothek(libRoot);
  const g = bib.stuecke.find((s) => s.stueck.id === id);
  if (!g) {
    const probleme = bib.befunde.filter((b) => b.stueck === id).map((b) => `${b.code}: ${b.text}`);
    throw new AktivierungsFehler(`Stück «${id}» nicht gefunden oder ungültig`, probleme);
  }
  return g;
}

const REIHENFOLGE: StueckStatus[] = ["entwurf", "gebaut", "geprueft", "aktiv"];

/** Hebt den Status bis «geprueft» an (nach bestandener Selbstprüfung). «aktiv» geht nur über `aktiviere`. */
export function setzeStatus(libRoot: string, id: string, status: "gebaut" | "geprueft"): Stueck {
  const g = lade(libRoot, id);
  if (REIHENFOLGE.indexOf(g.stueck.status) > REIHENFOLGE.indexOf(status)) {
    throw new AktivierungsFehler(`«${id}» ist schon «${g.stueck.status}», Rückstufen auf «${status}» ist nicht vorgesehen`);
  }
  const neu = { ...g.stueck, status };
  const probe = lintStueck({ ...g, stueck: Stueck.parse(neu) }).filter((b) => b.stufe === "fehler");
  if (probe.length) throw new AktivierungsFehler(`«${id}» besteht den Lint nicht`, probe.map((b) => `${b.code}: ${b.text}`));
  schreibe(g, neu);
  return neu;
}

/**
 * Nimmt ein Stück in die Bibliothek auf. Nur ein Mensch darf das («er gibt frei»), das Stück muss
 * «geprueft» sein und den Lint ohne Fehler bestehen.
 */
export function aktiviere(libRoot: string, id: string, wer: Akteur, jetzt: string): Stueck {
  if (!istMensch(wer)) throw new AktivierungsFehler(`Ein Stück aktiviert nur ein Mensch (Akteur: ${wer.typ} «${wer.name}»)`);
  const g = lade(libRoot, id);
  if (g.stueck.status !== "geprueft") throw new AktivierungsFehler(`«${id}» hat den Status «${g.stueck.status}». Aktiviert wird nur ein geprüftes Stück`);
  const neu: Stueck = { ...g.stueck, status: "aktiv", freigabe: { wer: wer.name, wann: jetzt } };
  const fehler = lintStueck({ ...g, stueck: Stueck.parse(neu) }).filter((b) => b.stufe === "fehler");
  if (fehler.length) throw new AktivierungsFehler(`«${id}» besteht den Lint nicht`, fehler.map((b) => `${b.code}: ${b.text}`));
  schreibe(g, neu);
  return neu;
}
