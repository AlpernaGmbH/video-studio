import type { Zeile } from "../notion/abbild";
import { istMensch } from "../motion/idee";
import { seitenId } from "./inhalt";

/**
 * Eine Zeile der Datenbank «Marken» (Eigene und Kunden). Gate 0 (Plan v3, 4.1): Erst wenn ein Mensch die Marke freigegeben hat, gelten Tor I und Tor P.
 * Die Freigabe zählt nur mit dem Namen eines Menschen in «Gate 0 von».
 */

export type Gate0 = "offen" | "freigegeben" | "Änderung";

export interface Marke {
  /** Schlüssel wie «alperna». Entspricht `marken/<id>.json`. */
  id: string;
  name: string;
  typ: "Eigene" | "Kunde" | "";
  gate0: Gate0;
  gate0Von: string;
  gate0Am: string;
  kundenfreigabe: string;
  raum: string;
  url: string;
  seite: string;
}

function text(z: Zeile, name: string): string {
  const v = z[name];
  return typeof v === "string" ? v.replace(/<br\s*\/?>/gi, "\n").trim() : "";
}

export function zeileZuMarke(z: Zeile): Marke {
  const g = text(z, "Gate 0");
  const typ = text(z, "Typ");
  const url = text(z, "url");
  return {
    id: text(z, "Marken-ID"),
    name: text(z, "Name"),
    typ: typ === "Eigene" || typ === "Kunde" ? typ : "",
    gate0: g === "freigegeben" || g === "Änderung" ? g : "offen",
    gate0Von: text(z, "Gate 0 von"),
    gate0Am: text(z, "date:Gate 0 am:start"),
    kundenfreigabe: text(z, "Kundenfreigabe"),
    raum: text(z, "Raum"),
    url,
    seite: seitenId(url),
  };
}

/** Gate 0, wie es gilt: «freigegeben» nur mit einem Menschen mit Namen im Feld «Gate 0 von». */
export function gate0Wirksam(m: Marke): Gate0 {
  if (m.gate0 === "freigegeben" && !(m.gate0Von && istMensch({ typ: "mensch", name: m.gate0Von }))) return "offen";
  return m.gate0;
}

/** Seiten-Kennung → Marken-ID, damit sich die Verknüpfung eines Inhalts auflösen lässt. */
export const markenNachSeite = (marken: Marke[]): Map<string, string> => new Map(marken.filter((m) => m.id).map((m) => [m.seite, m.id]));

/** Marken-ID → Gate 0 (wirksam). Eine unbekannte Marke ist «offen». */
export function gate0Funktion(marken: Marke[]): (markenId: string) => Gate0 {
  const nach = new Map(marken.map((m) => [m.id, gate0Wirksam(m)]));
  return (id) => nach.get(id) ?? "offen";
}
