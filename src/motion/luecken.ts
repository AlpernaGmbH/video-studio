import { aehnlichkeit, ausloesenderText, type Idee, type IdeeEntwurf } from "./idee";
import { erkenneSignale, type Signal } from "./signale";
import { VORHANDEN_AB, type Param, type SignalTyp, type Stueck } from "./stueck";

/**
 * Lückenanalyse: Für jede Zeile eines Skripts oder Transkripts prüfen, ob eine Grafik besser erklären würde
 * und ob die Bibliothek sie schon zeigen kann. Wo nicht, entsteht ein Ideen-Entwurf mit dem genauen Satz
 * und einer Begründung, die aus den Datenblättern der vorhandenen Stücke abgeleitet ist.
 */

export interface Zeile {
  id: string;
  t?: number;
  text: string;
}

export interface Fit {
  stueck: string;
  name: string;
  passt: boolean;
  grund: string;
  /** Was noch fehlt, damit das Stück den Satz zeigen kann (z. B. Zwischenwerte einer Reihe). */
  fehlend: string[];
  signal: SignalTyp;
}

export type Urteil = "abgedeckt" | "luecke" | "bereits-erfasst" | "bereits-abgelehnt" | "unsicher";

export interface Kandidat {
  zeile: Zeile;
  signale: Signal[];
  fits: Fit[];
  urteil: Urteil;
  /** Bei «abgedeckt»: das beste passende Stück. */
  vorschlag?: Fit;
  /** Bei «bereits-…»: die ähnliche Idee. */
  verweis?: { idee: string; status: string; aehnlichkeit: number; grund?: string };
  /** Reihenfolge der Lücken. Höher = wichtiger. */
  prioritaet: number;
}

export interface LueckenBericht {
  kandidaten: Kandidat[];
  bibliothekGroesse: number;
  zaehlung: Record<Urteil, number>;
  hinweise: string[];
}

export interface AnalyseOptionen {
  /** Von Claude ergänzte Signale (Typ «frei»), nach Zeilen-ID. */
  zusatzSignale?: Record<string, Signal[]>;
  /** Schwelle, ab der eine Idee als «ähnlich» gilt. */
  aehnlichSchwelle?: number;
}

/* ---------- Fit ---------- */

const SICHERHEIT_WERT = { hoch: 3, mittel: 2, niedrig: 1 } as const;
const TYP_GEWICHT: Record<SignalTyp, number> = { verlauf: 5, vergleich: 4, prozess: 4, aufzaehlung: 3, anteil: 3, zahl: 2, zeitraum: 2, frei: 4 };

function param<T extends Param["typ"]>(s: Stueck, typ: T): Extract<Param, { typ: T }> | undefined {
  return s.parameter.find((p): p is Extract<Param, { typ: T }> => p.typ === typ);
}

export function fitSignal(s: Stueck, sig: Signal): Fit {
  const basis = { stueck: s.id, name: s.name, signal: sig.typ as SignalTyp, fehlend: [] as string[] };
  const typen = s.ausloeser.typen.join(", ");

  if (!s.ausloeser.typen.includes(sig.typ)) {
    return {
      ...basis,
      passt: false,
      grund: `«${s.name}» ${s.zweck.replace(/\.$/, "")} und deckt ${typen} ab. Der Satz verlangt «${sig.typ}» («${sig.text}»).`,
    };
  }

  if (sig.typ === "verlauf") {
    const reihe = param(s, "zahlenreihe");
    if (reihe) {
      if (sig.schritte !== undefined && sig.schritte > reihe.maxAnzahl) {
        return { ...basis, passt: false, grund: `«${s.name}» zeigt höchstens ${reihe.maxAnzahl} Werte, der Satz nennt ${sig.schritte} Schritte.` };
      }
      const bekannt = [sig.von, sig.auf].filter((x) => x !== undefined).length;
      const gebraucht = Math.max(reihe.minAnzahl, sig.schritte ?? 0);
      const fehlend = bekannt < gebraucht ? [`${gebraucht - bekannt} Zwischenwerte der Reihe (im Satz stehen nur ${bekannt})`] : [];
      return { ...basis, passt: true, fehlend, grund: `«${s.name}» kann einen Verlauf zeigen (${reihe.minAnzahl} bis ${reihe.maxAnzahl} Werte).` };
    }
  }
  if (sig.typ === "aufzaehlung") {
    const liste = param(s, "textliste");
    if (liste && sig.anzahl !== undefined && (sig.anzahl < liste.minAnzahl || sig.anzahl > liste.maxAnzahl)) {
      return { ...basis, passt: false, grund: `«${s.name}» zeigt ${liste.minAnzahl} bis ${liste.maxAnzahl} Punkte, der Satz nennt ${sig.anzahl}.` };
    }
  }
  return { ...basis, passt: true, grund: `«${s.name}» deckt «${sig.typ}» ab.` };
}

const sicherheitVon = (sig: Signal) => SICHERHEIT_WERT[sig.sicherheit];

/* ---------- Analyse ---------- */

export function analysiere(zeilen: Zeile[], stuecke: Stueck[], ideen: Idee[], opt: AnalyseOptionen = {}): LueckenBericht {
  const vorhanden = stuecke.filter((s) => VORHANDEN_AB.includes(s.status));
  const schwelle = opt.aehnlichSchwelle ?? 0.55;
  const kandidaten: Kandidat[] = [];

  for (const zeile of zeilen) {
    const signale = [...erkenneSignale(zeile.text), ...(opt.zusatzSignale?.[zeile.id] ?? [])];
    if (signale.length === 0) continue;

    // Passt ein Stück zu irgendeinem Signal? Pro Stück zählt das beste Signal.
    const fits: Fit[] = [];
    for (const s of vorhanden) {
      const pro = signale.map((sig) => ({ sig, fit: fitSignal(s, sig) }));
      pro.sort((a, b) => Number(b.fit.passt) - Number(a.fit.passt) || sicherheitVon(b.sig) - sicherheitVon(a.sig) || TYP_GEWICHT[b.sig.typ] - TYP_GEWICHT[a.sig.typ]);
      fits.push(pro[0]!.fit);
    }
    fits.sort((a, b) => Number(b.passt) - Number(a.passt) || a.fehlend.length - b.fehlend.length || a.name.localeCompare(b.name));

    const staerkstes = Math.max(...signale.map(sicherheitVon));
    const prioritaet = Math.max(...signale.map((s) => TYP_GEWICHT[s.typ] * 10 + sicherheitVon(s)));

    const passend = fits.find((f) => f.passt);
    if (passend) {
      kandidaten.push({ zeile, signale, fits, urteil: "abgedeckt", vorschlag: passend, prioritaet });
      continue;
    }

    // Nur schwache Signale: nicht als Lücke behandeln, Claude entscheidet.
    if (staerkstes < SICHERHEIT_WERT.mittel) {
      kandidaten.push({ zeile, signale, fits, urteil: "unsicher", prioritaet });
      continue;
    }

    // Gab es diese Art von Lücke schon?
    const typen = new Set(signale.map((s) => s.typ));
    const aehnlich = ideen
      .map((i) => ({ i, a: aehnlichkeit(zeile.text, ausloesenderText(i.quelle)), geteilt: i.signale.some((s) => typen.has(s.typ)) }))
      .filter((x) => x.a >= schwelle && x.geteilt)
      .sort((x, y) => y.a - x.a)[0];
    if (aehnlich) {
      const abgelehnt = aehnlich.i.status === "abgelehnt";
      kandidaten.push({
        zeile,
        signale,
        fits,
        urteil: abgelehnt ? "bereits-abgelehnt" : "bereits-erfasst",
        verweis: { idee: aehnlich.i.id, status: aehnlich.i.status, aehnlichkeit: Number(aehnlich.a.toFixed(2)), grund: aehnlich.i.entscheidung?.grund },
        prioritaet,
      });
      continue;
    }

    kandidaten.push({ zeile, signale, fits, urteil: "luecke", prioritaet });
  }

  const zaehlung: Record<Urteil, number> = { abgedeckt: 0, luecke: 0, "bereits-erfasst": 0, "bereits-abgelehnt": 0, unsicher: 0 };
  for (const k of kandidaten) zaehlung[k.urteil]++;

  const hinweise: string[] = [];
  if (vorhanden.length === 0) hinweise.push("Die Bibliothek ist leer: Jede Stelle erscheint als Lücke. Erst Welle 1 bauen, dann ist die Analyse aussagekräftig.");
  else if (vorhanden.length < 5) hinweise.push(`Die Bibliothek hat erst ${vorhanden.length} Stücke: Viele Lücken sind erwartbar.`);
  if (zaehlung["bereits-abgelehnt"] > 0) hinweise.push("Ähnliche Ideen wurden schon abgelehnt: nicht erneut pitchen, ausser ein Mensch verlangt es.");
  if (zaehlung.unsicher > 0) hinweise.push("«unsicher» heisst: nur schwache Signale. Skript selbst lesen und entscheiden, ob dort eine Grafik besser erklärt.");

  return { kandidaten, bibliothekGroesse: vorhanden.length, zaehlung, hinweise };
}

/* ---------- Entwurf ---------- */

const ARBEITSTITEL: Record<SignalTyp, string> = {
  verlauf: "Wert-Verlauf",
  vergleich: "Vergleich",
  aufzaehlung: "Aufzählung",
  prozess: "Ablauf",
  zahl: "Kennzahl",
  anteil: "Anteil",
  zeitraum: "Zeitstrahl",
  frei: "Neue Grafik",
};

/** Der stärkste Signaltyp einer Zeile, nach Wichtigkeit und Sicherheit. */
export function fuehrendesSignal(signale: Signal[]): Signal {
  return [...signale].sort((a, b) => TYP_GEWICHT[b.typ] * 10 + sicherheitVon(b) - (TYP_GEWICHT[a.typ] * 10 + sicherheitVon(a)))[0]!;
}

function kuerze(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n - 1).trimEnd()}…`;
}

/**
 * Macht aus einer «luecke» einen Ideen-Entwurf mit dem genauen Satz und der Begründung aus den Datenblättern.
 * Titel und Beschreibung sind Arbeitsfassungen: Claude schärft sie im Pitch.
 */
export function entwurfAusKandidat(k: Kandidat, ctx: { projekt: string; bibliothekGroesse: number; jetzt: string }): IdeeEntwurf {
  if (k.urteil !== "luecke") throw new Error(`Nur Lücken werden zu Ideen, dieses Urteil ist «${k.urteil}»`);
  const lead = fuehrendesSignal(k.signale);
  const titel = lead.typ === "frei" ? kuerze(lead.beschreibung, 40) : ARBEITSTITEL[lead.typ];
  const mindestens = Math.min(3, ctx.bibliothekGroesse);
  const geprueft = k.fits.slice(0, Math.max(mindestens, Math.min(5, k.fits.length))).map((f) => ({ stueck: f.stueck, grund: f.grund }));

  const zusammenfassung =
    ctx.bibliothekGroesse === 0
      ? `Die Bibliothek ist leer. Der Satz verlangt «${lead.typ}» («${lead.text}»).`
      : `Keines der ${ctx.bibliothekGroesse} vorhandenen Stücke zeigt «${lead.typ}» für diesen Satz. ${geprueft[0]?.grund ?? ""}`.trim();

  return {
    titel,
    beschreibung: `Der Satz «${kuerze(k.zeile.text, 120)}» braucht eine Grafik für «${lead.typ}». Arbeitsfassung, im Pitch zu schärfen.`,
    quelle: { typ: "video", projekt: ctx.projekt, zeile: k.zeile.id, t: k.zeile.t, satz: k.zeile.text.trim() },
    signale: k.signale,
    warumNichtsPasst: { zusammenfassung, geprueft, bibliothekGroesse: ctx.bibliothekGroesse, geprueftAm: ctx.jetzt },
  };
}

/** Die Lücken eines Berichts, wichtigste zuerst, begrenzt auf `limit` (damit ein Video keinen Berg Ideen erzeugt). */
export function luecken(b: LueckenBericht, limit = 5): { aufnehmen: Kandidat[]; zurueckgestellt: Kandidat[] } {
  const alle = b.kandidaten.filter((k) => k.urteil === "luecke").sort((x, y) => y.prioritaet - x.prioritaet || (x.zeile.t ?? 0) - (y.zeile.t ?? 0));
  return { aufnehmen: alle.slice(0, limit), zurueckgestellt: alle.slice(limit) };
}
