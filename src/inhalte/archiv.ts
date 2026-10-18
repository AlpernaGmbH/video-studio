import { wortmenge } from "../motion/idee";
import { DUBLETTE_TAGE } from "./regeln";
import type { Inhalt, Status } from "./inhalt";

/**
 * Der Bestand als Hilfe bei der Ideenfindung (Entscheid 18.10.2026: Altbeiträge bleiben in Notion und werden genutzt, nicht gelöscht).
 * Zwei Fragen beantwortet dieses Modul, ohne etwas zu bewerten:
 *   1. Was gibt es schon? Ein Thema, das schon einmal kam, mit Datum und Alter, auch über das 90-Tage-Fenster hinaus.
 *   2. Wo steht der Bestand? Beiträge je Pillar, Hook-Muster, Format und Plattform, und wann jeder Pillar zuletzt dran war.
 * Leistungszahlen (Likes, Reichweite) stehen nicht in «Inhalte», sondern im Cockpit «Beiträge · Archiv & Analytics»; hier gibt es sie nicht.
 */

/** Stati, die als Archiv gelten: veröffentlicht oder ausgewertet. */
export const ARCHIV_STATI: readonly Status[] = ["Veröffentlicht", "Ausgewertet"];
const LAUFEND: readonly Status[] = ["Neu", "Pitch bereit", "In Produktion", "Entwurf fertig", "Freigegeben", "Geplant"];

export interface WinkelMeta {
  pillar?: string;
  hookMuster?: string;
  cta?: string;
}

/** «Pillar: B Gruender-Journey · Hook-Muster: Curiosity Gap · CTA: keiner» (so schreibt der Import aus dem Cockpit den Winkel). */
export function winkelMeta(winkel: string): WinkelMeta {
  const feld = (name: string): string | undefined => {
    const m = new RegExp(`${name}:\\s*([^·]+?)\\s*(?:·|$)`, "i").exec(winkel);
    return m ? m[1]!.trim() || undefined : undefined;
  };
  const meta: WinkelMeta = {};
  const pillar = feld("Pillar");
  const hook = feld("Hook-Muster");
  const cta = feld("CTA");
  if (pillar) meta.pillar = pillar;
  if (hook) meta.hookMuster = hook;
  if (cta) meta.cta = cta;
  return meta;
}

/** Notion macht aus Verweisen Erwähnungen; für den Vergleich zählt nur der Name. */
const ohneMarkup = (s: string): string => s.replace(/<mention-[a-z-]+ url="[^"]*"[^>]*>([^<]*)<\/mention-[a-z-]+>/gi, "$1").replace(/<br\s*\/?>/gi, " ");

/** Datum eines Inhalts: wann er erscheint oder erschien («Geplant für»), sonst wann die Zeile entstand. */
export function inhaltsDatum(i: Inhalt): string {
  return i.geplantFuer || i.erstellt || "";
}

const tageZwischen = (von: string, bis: string): number | null => {
  const a = Date.parse(von);
  const b = Date.parse(bis);
  return Number.isNaN(a) || Number.isNaN(b) ? null : Math.floor((b - a) / 86_400_000);
};

export interface ArchivTreffer {
  id: string;
  titel: string;
  status: Status | "";
  datum: string;
  /** Alter in Tagen, null wenn kein Datum bekannt. */
  tage: number | null;
  /** Liegt der Treffer in den letzten 90 Tagen? Dann gilt die Regel «gleicher Fakt nicht noch einmal», sonst darf das Thema mit neuem Winkel wiederkommen. */
  imFenster: boolean;
  /** Anteil der Wörter des Themas, die im Treffer vorkommen (0 bis 1). */
  abdeckung: number;
  pillar?: string;
  hookMuster?: string;
  /** Bei verworfenen Inhalten der Grund. Er steht da, damit dieselbe Idee nicht wiederkommt. */
  grund?: string;
}

export interface Zaehlung {
  gesamt: number;
  letzte90Tage: number;
}

export interface PillarStand extends Zaehlung {
  pillar: string;
  zuletzt: string;
  tageSeitZuletzt: number | null;
}

export interface ArchivBericht {
  stichtag: string;
  archiv: Zaehlung & { von: string; bis: string };
  laufend: number;
  proPillar: PillarStand[];
  proHookMuster: Record<string, Zaehlung>;
  proFormat: Record<string, Zaehlung>;
  proPlattform: Record<string, Zaehlung>;
  aehnlich: ArchivTreffer[];
}

const zaehle = (liste: Inhalt[], schluesselVon: (i: Inhalt) => string[], jetzt: string): Record<string, Zaehlung> => {
  const out: Record<string, Zaehlung> = {};
  for (const i of liste) {
    const tage = tageZwischen(inhaltsDatum(i), jetzt);
    for (const k of schluesselVon(i)) {
      const z = (out[k] ??= { gesamt: 0, letzte90Tage: 0 });
      z.gesamt++;
      if (tage !== null && tage <= DUBLETTE_TAGE) z.letzte90Tage++;
    }
  }
  return out;
};

export function archivBericht(inhalte: Inhalt[], jetzt: string, opt: { thema?: string; max?: number; mindestAbdeckung?: number } = {}): ArchivBericht {
  const archiv = inhalte.filter((i) => i.status && ARCHIV_STATI.includes(i.status as Status));
  const daten = archiv.map(inhaltsDatum).filter(Boolean).sort();

  const proPillarRoh = zaehle(archiv, (i) => [winkelMeta(i.winkel).pillar ?? "ohne Angabe"], jetzt);
  const proPillar: PillarStand[] = Object.entries(proPillarRoh)
    .map(([pillar, z]) => {
      const zuletzt = archiv.filter((i) => (winkelMeta(i.winkel).pillar ?? "ohne Angabe") === pillar).map(inhaltsDatum).filter(Boolean).sort().at(-1) ?? "";
      return { pillar, ...z, zuletzt, tageSeitZuletzt: zuletzt ? tageZwischen(zuletzt, jetzt) : null };
    })
    .sort((a, b) => a.pillar.localeCompare(b.pillar));

  const bericht: ArchivBericht = {
    stichtag: jetzt,
    archiv: { ...(zaehle(archiv, () => ["x"], jetzt)["x"] ?? { gesamt: 0, letzte90Tage: 0 }), von: daten[0] ?? "", bis: daten.at(-1) ?? "" },
    laufend: inhalte.filter((i) => LAUFEND.includes((i.status || "Neu") as Status)).length,
    proPillar,
    proHookMuster: zaehle(archiv, (i) => [winkelMeta(i.winkel).hookMuster ?? "ohne Angabe"], jetzt),
    proFormat: zaehle(archiv, (i) => [i.format ?? "ohne Angabe"], jetzt),
    proPlattform: zaehle(archiv, (i) => (i.plattformen.length ? i.plattformen : ["ohne Angabe"]), jetzt),
    aehnlich: [],
  };

  if (opt.thema) {
    const thema = wortmenge(opt.thema);
    const mindest = opt.mindestAbdeckung ?? 0.5;
    if (thema.size > 0) {
      for (const i of inhalte) {
        const text = wortmenge([i.titel, i.hook, i.winkel.replace(/Pillar:|Hook-Muster:|CTA:/g, " "), ohneMarkup(i.beleg)].join(" "));
        let treffer = 0;
        for (const w of thema) if (text.has(w)) treffer++;
        const abdeckung = treffer / thema.size;
        if (abdeckung < mindest) continue;
        const datum = inhaltsDatum(i);
        const tage = datum ? tageZwischen(datum, jetzt) : null;
        const meta = winkelMeta(i.winkel);
        bericht.aehnlich.push({
          id: i.id,
          titel: i.titel,
          status: i.status,
          datum,
          tage,
          imFenster: tage === null || tage <= DUBLETTE_TAGE,
          abdeckung: Math.round(abdeckung * 100) / 100,
          ...(meta.pillar ? { pillar: meta.pillar } : {}),
          ...(meta.hookMuster ? { hookMuster: meta.hookMuster } : {}),
          ...(i.status === "Verworfen" && i.statusGrund ? { grund: i.statusGrund } : {}),
        });
      }
      bericht.aehnlich.sort((a, b) => b.abdeckung - a.abdeckung || (a.tage ?? 1e9) - (b.tage ?? 1e9));
      bericht.aehnlich = bericht.aehnlich.slice(0, opt.max ?? 8);
    }
  }
  return bericht;
}
