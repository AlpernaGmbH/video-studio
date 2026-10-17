import { Markenprofil, markeFuerExportFreigegeben } from "../core/schemas";
import { gate0Wirksam, type Marke } from "./marken";

/**
 * Gate 0 gilt in Notion (Ansicht «Marken», entschieden im Prüfplatz) und im Repo (`marken/<id>.json`, steuert den finalen Export).
 * Dieser Abgleich zieht das Profil nach: Eine Freigabe mit Namen in Notion setzt das Profil auf «freigegeben» mit Name und Zeit,
 * ein Widerruf in Notion setzt es zurück auf «Platzhalter». Der Eingriff ist eine Textänderung an zwei Zeilen, der Rest der Datei bleibt, wie er ist.
 */

export type Gate0Art = "uebernommen" | "zurueckgesetzt" | "unveraendert" | "hinweis";

export interface Gate0Befund {
  marke: string;
  art: Gate0Art;
  text: string;
  /** Neuer Inhalt der Profildatei, wenn sie sich ändert. */
  neuerText?: string;
}

const STATUS_ZEILE = /^([ \t]*)"status":[ \t]*"(platzhalter|freigegeben)"(,?)[ \t]*$/m;

/** Zeitpunkt als ISO mit Zone, wie das Profil ihn verlangt. Ein reines Datum oder ein Fehlendes wird zu `jetzt`. */
function iso(wann: string, jetzt: string): string {
  const t = Date.parse(wann);
  return wann && !Number.isNaN(t) ? new Date(t).toISOString() : jetzt;
}

function pruefeProfil(text: string): { ok: true; profil: Markenprofil } | { ok: false; fehler: string } {
  try {
    return { ok: true, profil: Markenprofil.parse(JSON.parse(text)) };
  } catch (e) {
    return { ok: false, fehler: (e as Error).message.split("\n")[0] ?? "ungültig" };
  }
}

export function gate0Abgleich(marken: Marke[], profilText: (id: string) => string | undefined, jetzt: string): Gate0Befund[] {
  const out: Gate0Befund[] = [];
  for (const m of marken) {
    if (!m.id) continue;
    const text = profilText(m.id);
    if (text === undefined) {
      out.push({ marke: m.id, art: "hinweis", text: `Kein Profil marken/${m.id}.json im Repo. Gate 0 steht in Notion auf «${m.gate0}», es gibt nichts nachzuziehen` });
      continue;
    }
    const p = pruefeProfil(text);
    if (!p.ok) {
      out.push({ marke: m.id, art: "hinweis", text: `Das Profil marken/${m.id}.json ist ungültig (${p.fehler}). Nichts geändert` });
      continue;
    }
    const wirksam = gate0Wirksam(m);
    const imRepo = p.profil.status;

    if (wirksam === "freigegeben" && imRepo === "platzhalter") {
      const wer = m.gate0Von.trim();
      const basis = ohneFreigabe(text);
      if (basis === undefined) {
        out.push({ marke: m.id, art: "hinweis", text: `Das Profil marken/${m.id}.json hat eine mehrzeilige «freigabe». Bitte von Hand auf «freigegeben» setzen: wer ${wer}` });
        continue;
      }
      const neu = basis.replace(STATUS_ZEILE, (_z, einzug: string) => `${einzug}"status": "freigegeben",\n${einzug}"freigabe": { "wer": ${JSON.stringify(wer)}, "wann": ${JSON.stringify(iso(m.gate0Am, jetzt))} },`);
      const geprueft = pruefeProfil(neu);
      if (!geprueft.ok || !markeFuerExportFreigegeben(geprueft.profil).ok) {
        out.push({ marke: m.id, art: "hinweis", text: `Die Änderung an marken/${m.id}.json ergäbe kein gültiges freigegebenes Profil. Nichts geändert` });
        continue;
      }
      out.push({ marke: m.id, art: "uebernommen", text: `Gate 0 von ${wer} übernommen: Profil «${m.id}» ist freigegeben, der finale Export ist möglich`, neuerText: neu });
      continue;
    }

    if (wirksam !== "freigegeben" && imRepo === "freigegeben") {
      const basis = ohneFreigabe(text);
      const ohne = basis?.replace(STATUS_ZEILE, (_z, einzug: string, _s: string, komma: string) => `${einzug}"status": "platzhalter"${komma}`);
      if (ohne === undefined || !pruefeProfil(ohne).ok) {
        out.push({ marke: m.id, art: "hinweis", text: `Gate 0 ist in Notion nicht mehr freigegeben, das Profil marken/${m.id}.json lässt sich nicht automatisch zurücksetzen. Bitte von Hand auf «platzhalter»` });
        continue;
      }
      out.push({ marke: m.id, art: "zurueckgesetzt", text: `Gate 0 in Notion ist «${m.gate0}»${m.gate0 === "freigegeben" ? " ohne Namen" : ""}: Profil «${m.id}» zurück auf Platzhalter, der finale Export ist gesperrt`, neuerText: ohne });
      continue;
    }

    if (m.gate0 === "freigegeben" && wirksam === "offen") {
      out.push({ marke: m.id, art: "hinweis", text: `Gate 0 steht in Notion auf «freigegeben», aber ohne den Namen eines Menschen. So gilt es nicht` });
      continue;
    }
    if (wirksam === "freigegeben" && imRepo === "freigegeben" && p.profil.freigabe && p.profil.freigabe.wer !== m.gate0Von.trim()) {
      out.push({ marke: m.id, art: "hinweis", text: `Die Freigabe im Profil nennt ${p.profil.freigabe.wer}, in Notion steht ${m.gate0Von.trim()}. Nichts geändert` });
      continue;
    }
    out.push({ marke: m.id, art: "unveraendert", text: `Gate 0 und Profil «${m.id}» stimmen überein (${imRepo})` });
  }
  return out;
}

/** Entfernt die einzeilige «freigabe»-Zeile. Gibt undefined zurück, wenn «freigabe» sich über mehrere Zeilen erstreckt. */
function ohneFreigabe(text: string): string | undefined {
  const zeilen = text.split("\n");
  const ziel: number[] = [];
  zeilen.forEach((z, i) => {
    if (/^[ \t]*"freigabe":/.test(z)) ziel.push(i);
  });
  for (const i of ziel) if (!/^[ \t]*"freigabe":[ \t]*\{[^\n]*\},?[ \t]*$/.test(zeilen[i]!)) return undefined;
  return zeilen.filter((_z, i) => !ziel.includes(i)).join("\n");
}
