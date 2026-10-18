import type { Akteur } from "../core/schemas";
import { aehnlichkeit, istMensch } from "../motion/idee";
import { istTextformat, type Inhalt, type Status } from "./inhalt";

/**
 * Lebenslauf eines Inhalts (Plan v3, 3.1) als Regeln, die der Code vor jedem Statuswechsel prüft:
 *
 *   Neu → Pitch bereit → [Tor I] → In Produktion → Entwurf fertig → [Tor P] → Freigegeben → Geplant → Veröffentlicht → Ausgewertet
 *   Tor I «abgelehnt» → Verworfen (mit Grund), «Rückfrage» → zurück zu Neu. Tor P «Änderung» → zurück zu In Produktion.
 *   Jederzeit Pausiert oder Verworfen (mit Grund).
 *
 * Tor I und Tor P entscheidet ein Mensch im Prüfplatz. Die Statuswechsel danach führt der Code aus, aber nur, wenn die Zeile den Entscheid
 * eines Menschen mit Namen trägt und alles stimmt, was der Plan vorher verlangt.
 */

export type Ergebnis = { ok: true } | { ok: false; fehler: string[] };

export interface UebergangsKontext {
  jetzt: string;
  /** Wer den Wechsel auslöst. Bei Tor-Entscheiden prüft der Code zusätzlich den Namen im Entscheid selbst. */
  akteur: Akteur;
  grund?: string;
  /** Alle anderen Inhalte, für die Dublettenprüfung. */
  andere?: Inhalt[];
  /** Gate 0 der Marke dieses Inhalts. Ohne Angabe gilt es als offen. */
  gate0?: "offen" | "freigegeben" | "Änderung";
  /** Status vor der Pause, zu dem «Pausiert» zurückführen darf. */
  vorPause?: Status;
  /** Ergebnis der Prüfung des Entwurfs (Textprüfung oder Qualitätsprüfung des Renders). */
  entwurfGeprueft?: { bestanden: boolean; text?: string };
}

const FINAL: readonly Status[] = ["Verworfen", "Ausgewertet"];
const NICHT_PAUSIERBAR: readonly Status[] = ["Verworfen", "Ausgewertet", "Veröffentlicht"];

/** 90 Tage, in denen ein gleicher Fakt nicht noch einmal auftauchen soll (Plan v3, 4.2). */
export const DUBLETTE_TAGE = 90;
/** Ab dieser Ähnlichkeit der Belege (Wortmenge, Zahlen vereinheitlicht) gilt ein Fakt als gleich. */
export const DUBLETTE_SCHWELLE = 0.85;

const woerter = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;

/** Ablehnung und Verwerfen brauchen einen Grund aus mindestens zwei Wörtern: Er verhindert, dass dieselbe Idee wiederkommt. */
export const grundGenuegt = (g: string | undefined): boolean => !!g && g.trim().length >= 10 && woerter(g) >= 2;

/** Pflichtangaben für «Pitch bereit» (Plan v3, 4.2). Gibt zurück, was fehlt. */
export function pflichtLuecken(i: Inhalt): string[] {
  const l: string[] = [];
  if (!i.format || i.format === "ungeklärt") l.push("Format (nicht «ungeklärt»)");
  if (i.plattformen.length === 0) l.push("Plattform");
  if (!i.marke) l.push("Marke");
  if (!i.quelle) l.push("Quelle");
  else if (i.quelle !== "Manuell" && !/^https?:\/\//i.test(i.referenz)) l.push("Referenz als Link (Quelle mit Link)");
  if (i.hook.trim().length < 10) l.push("Hook (erster Satz)");
  if (i.winkel.trim().length < 10) l.push("Winkel (was ist neu oder anders)");
  if (i.beleg.trim().length < 10) l.push("Beleg (echter Fakt, echte Zahl oder Erlebnis)");
  if (!i.aufwand) l.push("Aufwand");
  return l;
}

/** «Kein Post ohne Rohstoff» (Cockpit, Plan v3, 5.2): Ein LinkedIn-Post braucht den Verweis auf einen Rohstoff-Eintrag in Notion. */
export function rohstoffFehlt(i: Inhalt): boolean {
  if (i.format !== "LinkedIn-Post") return false;
  const notion = /https?:\/\/(?:[\w-]+\.)*notion\.(?:so|com|site)\//i;
  return !(notion.test(i.beleg) || (i.quelle === "Rohstoff" && notion.test(i.referenz)));
}

export interface Dublette {
  id: string;
  titel: string;
  aehnlichkeit: number;
}

/** Inhalte der letzten 90 Tage (nicht verworfen) mit fast gleichem Beleg. Zeigt sie, damit Menschen entscheiden. */
export function dubletten(i: Inhalt, andere: Inhalt[], jetzt: string): Dublette[] {
  const grenze = Date.parse(jetzt) - DUBLETTE_TAGE * 86_400_000;
  const treffer: Dublette[] = [];
  for (const a of andere) {
    if (a.id === i.id || a.status === "Verworfen") continue;
    // Bei Beiträgen aus dem Archiv zählt, wann sie erschienen sind («Geplant für»), nicht wann die Zeile in Notion entstand.
    const t = Date.parse(a.geplantFuer || a.erstellt);
    if (!Number.isNaN(t) && t < grenze) continue;
    const s = aehnlichkeit(i.beleg, a.beleg);
    if (s >= DUBLETTE_SCHWELLE) treffer.push({ id: a.id, titel: a.titel, aehnlichkeit: Math.round(s * 100) / 100 });
  }
  return treffer.sort((x, y) => y.aehnlichkeit - x.aehnlichkeit);
}

const menschMitName = (von: string): boolean => !!von.trim() && istMensch({ typ: "mensch", name: von.trim() });

export function pruefeUebergang(i: Inhalt, nach: Status, ctx: UebergangsKontext): Ergebnis {
  const von: Status = i.status || "Neu";
  const f: string[] = [];
  const grund = ctx.grund?.trim();

  if (von === nach) return { ok: false, fehler: [`Der Inhalt ist schon «${nach}»`] };

  if (nach === "Pausiert") {
    if (NICHT_PAUSIERBAR.includes(von)) f.push(`Aus «${von}» lässt sich nicht pausieren`);
    if (!grund || grund.length < 5) f.push("Pausieren braucht einen Grund");
    return f.length ? { ok: false, fehler: f } : { ok: true };
  }

  const key = `${von}>${nach}` as const;
  switch (key) {
    case "Neu>Pitch bereit": {
      const l = pflichtLuecken(i);
      if (l.length) f.push(`Es fehlt: ${l.join(", ")}. Ohne Beleg bleibt die Idee in «Neu»`);
      break;
    }
    case "Pitch bereit>In Produktion": {
      if (i.torI.entscheid !== "freigegeben") f.push("Tor I ist nicht freigegeben");
      else if (!menschMitName(i.torI.von)) f.push("Tor I trägt keinen Menschen mit Namen als Entscheider");
      if (ctx.gate0 !== "freigegeben") f.push("Gate 0 der Marke ist nicht freigegeben: Tor I und Tor P gelten erst danach");
      const l = pflichtLuecken(i);
      if (l.length) f.push(`Es fehlt: ${l.join(", ")}`);
      if (rohstoffFehlt(i)) f.push("Kein Post ohne Rohstoff: Der Beleg verweist nicht auf einen Rohstoff-Eintrag in Notion");
      const d = dubletten(i, ctx.andere ?? [], ctx.jetzt);
      if (d.length) f.push(`Gleicher Fakt in den letzten ${DUBLETTE_TAGE} Tagen schon vorhanden: ${d.map((x) => `${x.id} «${x.titel}»`).join(", ")}`);
      break;
    }
    case "Pitch bereit>Verworfen":
      if (i.torI.entscheid !== "abgelehnt") f.push("Tor I ist nicht abgelehnt");
      else if (!menschMitName(i.torI.von)) f.push("Tor I trägt keinen Menschen mit Namen als Entscheider");
      if (!grundGenuegt(i.torI.grund)) f.push("Eine Ablehnung braucht einen Grund aus mindestens zwei Wörtern");
      break;
    case "Pitch bereit>Neu":
      if (i.torI.entscheid !== "Rückfrage") f.push("Tor I ist keine Rückfrage");
      else if (!menschMitName(i.torI.von)) f.push("Tor I trägt keinen Menschen mit Namen als Entscheider");
      if (!i.torI.grund.trim()) f.push("Eine Rückfrage braucht die Frage im Feld «Tor I Grund»");
      break;
    case "Neu>Verworfen":
      if (!grundGenuegt(grund)) f.push("Verwerfen braucht einen Grund aus mindestens zwei Wörtern");
      break;
    case "In Produktion>Entwurf fertig":
      if (!ctx.entwurfGeprueft?.bestanden) f.push(`Die Prüfung des Entwurfs ist nicht bestanden${ctx.entwurfGeprueft?.text ? `: ${ctx.entwurfGeprueft.text}` : ""}`);
      break;
    case "Entwurf fertig>Freigegeben":
      if (i.torP.entscheid !== "freigegeben") f.push("Tor P ist nicht freigegeben");
      else if (!menschMitName(i.torP.von)) f.push("Tor P trägt keinen Menschen mit Namen als Entscheider");
      if (i.offeneMarkierungen > 0) f.push(`${i.offeneMarkierungen} Markierung(en) der Schwere «muss» sind offen`);
      if (!ctx.entwurfGeprueft?.bestanden) f.push(`Die Prüfung des Entwurfs ist nicht bestanden${ctx.entwurfGeprueft?.text ? `: ${ctx.entwurfGeprueft.text}` : ""}`);
      if (ctx.gate0 !== "freigegeben") f.push("Gate 0 der Marke ist nicht freigegeben");
      break;
    case "Entwurf fertig>In Produktion":
      if (i.torP.entscheid !== "Änderung") f.push("Tor P ist keine Änderung");
      else if (!menschMitName(i.torP.von)) f.push("Tor P trägt keinen Menschen mit Namen als Entscheider");
      if (!i.torP.grund.trim()) f.push("Eine Änderung braucht im Feld «Tor P Grund», was anders sein soll");
      break;
    case "Freigegeben>Geplant":
      if (!i.geplantFuer) f.push("«Geplant für» fehlt");
      if (!i.publishing) f.push("«Publishing» fehlt (Auto, Paket oder Manuell)");
      if (i.plattformen.length === 0) f.push("Plattform fehlt");
      break;
    case "Geplant>Veröffentlicht":
      if (i.publishing === "Auto") {
        if (!/^https?:\/\//i.test(i.ziel)) f.push("Bei «Auto» steht die Adresse des Beitrags oder Entwurfs im Feld «Ziel»");
      } else if (!istMensch(ctx.akteur)) {
        f.push(`Bei «${i.publishing ?? "Manuell"}» bestätigt ein Mensch, dass veröffentlicht wurde`);
      }
      break;
    case "Veröffentlicht>Ausgewertet":
      break;
    default:
      if (nach === "Verworfen") {
        if (FINAL.includes(von)) f.push(`Aus «${von}» geht es nicht weiter`);
        else if (!istMensch(ctx.akteur)) f.push(`«${von}» → «Verworfen» darf nur ein Mensch auslösen`);
        else if (!grundGenuegt(grund)) f.push("Verwerfen braucht einen Grund aus mindestens zwei Wörtern");
      } else if (von === "Pausiert" && nach === ctx.vorPause) {
        break;
      } else {
        f.push(`Übergang «${von}» → «${nach}» ist nicht vorgesehen`);
      }
  }
  return f.length ? { ok: false, fehler: f } : { ok: true };
}

/** Formate, bei denen Entwürfe ohne Render entstehen und die Textprüfung vor «Entwurf fertig» läuft. */
export const brauchtTextpruefung = (i: Inhalt): boolean => istTextformat(i.format);
