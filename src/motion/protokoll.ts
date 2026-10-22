import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { Akteur } from "../core/schemas";
import { Ereignis } from "../core/schemas";
import { FamilienStand, FamilienStaende, type FamilienLook } from "./familie";
import {
  Idee,
  istMensch,
  neueIdee,
  pruefungErfassen,
  weiter,
  type IdeeEntwurf,
  type IdeeStatus,
  type PruefRunde,
  type WeiterDaten,
} from "./idee";

/**
 * Ideenprotokoll als Datei. Übergangslösung bis zur Notion-Anbindung (Bauplan Kap. 6): Das Format ist so
 * geschnitten, dass jede Idee eine Notion-Zeile werden kann. Zwei Rechner dürfen nicht gleichzeitig dieselbe
 * Datei ändern (OneDrive würde Konfliktkopien anlegen). Deshalb trägt die Datei eine Versionsnummer und
 * `speichere` bricht bei einem Konflikt ab, statt still zu überschreiben.
 */

/**
 * Schema 1: nur Ideen. Schema 2 kennt zusätzlich den Stand je Familie (`familien`). Eine Datei ohne Familien bleibt Schema 1, damit ein Rechner,
 * der noch nichts von Familien weiss, sie weiter lesen kann; sobald eine Familie einen Stand hat, ist es Schema 2 und der ältere Code
 * weist die Datei mit einer klaren Meldung ab (statt den Stand der Familien still zu verlieren).
 */
const Datei = z.object({
  schema: z.union([z.literal(1), z.literal(2)]),
  version: z.number().int().min(0),
  ideen: z.array(Idee),
  familien: FamilienStaende.default({}),
});

export class KonfliktFehler extends Error {}
export class ProtokollFehler extends Error {
  constructor(
    message: string,
    readonly details: string[] = [],
  ) {
    super(details.length ? `${message}\n- ${details.join("\n- ")}` : message);
  }
}

export interface Zustand {
  version: number;
  ideen: Idee[];
  /** Stand je Familie (Schlüssel = Familie). Fehlt er beim Speichern, bleibt der Stand auf der Platte unverändert. */
  familien?: Record<string, FamilienStand>;
}

export class Ideenprotokoll {
  /**
   * @param familienIds Die gültigen Familien (aus `library/motion/_familien.json`). Ohne Liste wird die Familie einer neuen Idee nicht geprüft;
   *   der Befehlsaufruf übergibt sie immer, damit ein Tippfehler keine neue Familie anlegt.
   */
  constructor(
    private readonly datei: string,
    private readonly ereignisse?: string,
    private readonly familienIds?: readonly string[],
  ) {}

  lade(): Zustand & { familien: Record<string, FamilienStand> } {
    if (!fs.existsSync(this.datei)) return { version: 0, ideen: [], familien: {} };
    const roh = fs.readFileSync(this.datei, "utf8");
    let json: unknown;
    try {
      json = JSON.parse(roh);
    } catch (e) {
      throw new ProtokollFehler(`${this.datei} ist kein gültiges JSON`, [(e as Error).message]);
    }
    const p = Datei.safeParse(json);
    if (!p.success) throw new ProtokollFehler(`${this.datei} entspricht nicht dem Ideen-Schema`, p.error.issues.slice(0, 8).map((i) => `${i.path.join(".")}: ${i.message}`));
    return { version: p.data.version, ideen: p.data.ideen, familien: p.data.familien };
  }

  /** Schreibt atomar (temporäre Datei, dann umbenennen) und nur, wenn niemand dazwischen gespeichert hat. */
  speichere(z: Zustand): Zustand & { familien: Record<string, FamilienStand> } {
    const aufDisk = fs.existsSync(this.datei) ? this.lade() : { version: 0, ideen: [], familien: {} as Record<string, FamilienStand> };
    if (aufDisk.version !== z.version) {
      throw new KonfliktFehler(`Das Ideenprotokoll wurde inzwischen geändert (Version ${aufDisk.version}, erwartet ${z.version}). Neu laden und wiederholen.`);
    }
    const neu = { version: z.version + 1, ideen: z.ideen, familien: z.familien ?? aufDisk.familien };
    fs.mkdirSync(path.dirname(this.datei), { recursive: true });
    const tmp = `${this.datei}.${process.pid}.tmp`;
    const schema = Object.keys(neu.familien).length > 0 ? 2 : 1;
    fs.writeFileSync(tmp, JSON.stringify({ schema, version: neu.version, ideen: neu.ideen, ...(schema === 2 ? { familien: neu.familien } : {}) }, null, 2) + "\n");
    fs.renameSync(tmp, this.datei);
    return neu;
  }

  naechsteId(ideen: Idee[]): string {
    const hoechste = ideen.reduce((m, i) => Math.max(m, Number(i.id.slice(2))), 0);
    return `m-${String(hoechste + 1).padStart(3, "0")}`;
  }

  neu(entwurf: IdeeEntwurf, akteur: Akteur, jetzt: string): Idee {
    const z = this.lade();
    this.pruefeFamilie(entwurf.familie);
    const idee = neueIdee(entwurf, this.naechsteId(z.ideen), akteur, jetzt);
    this.speichere({ version: z.version, ideen: [...z.ideen, idee] });
    this.ereignis(idee, "motion-idee", "bestaetigt", akteur, jetzt, { titel: idee.titel });
    return idee;
  }

  holen(id: string): Idee {
    const i = this.lade().ideen.find((x) => x.id === id);
    if (!i) throw new ProtokollFehler(`Idee «${id}» existiert nicht`);
    return i;
  }

  liste(filter: { status?: IdeeStatus | IdeeStatus[] } = {}): Idee[] {
    const s = filter.status === undefined ? undefined : Array.isArray(filter.status) ? filter.status : [filter.status];
    return this.lade().ideen.filter((i) => !s || s.includes(i.status));
  }

  weiter(id: string, nach: IdeeStatus, akteur: Akteur, jetzt: string, opt: { grund?: string; daten?: WeiterDaten; stueckAktiviert?: boolean; wipLimit?: number; maxOffenePitches?: number; stueckFamilie?: { id?: string; fassung?: number } } = {}): Idee {
    const z = this.lade();
    const idee = z.ideen.find((x) => x.id === id);
    if (!idee) throw new ProtokollFehler(`Idee «${id}» existiert nicht`);
    const andere = z.ideen.filter((x) => x.id !== id);
    const r = weiter(idee, nach, {
      akteur,
      jetzt,
      grund: opt.grund,
      daten: opt.daten,
      stueckAktiviert: opt.stueckAktiviert,
      stueckFamilie: opt.stueckFamilie,
      wipLimit: opt.wipLimit,
      maxOffenePitches: opt.maxOffenePitches,
      imBau: andere.filter((x) => x.status === "in_bau").length,
      offenePitches: andere.filter((x) => x.status === "pitch").length,
      familie: idee.familie ? { bekannt: this.familieBekannt(idee.familie), stand: z.familien[idee.familie] } : undefined,
    });
    if (!r.ok) throw new ProtokollFehler(`${id}: «${idee.status}» → «${nach}» nicht möglich`, r.fehler);
    this.speichere({ version: z.version, ideen: z.ideen.map((x) => (x.id === id ? r.idee : x)), familien: this.familienNachUebergang(z.familien, idee, r.idee, akteur, jetzt) });
    this.ereignisZuUebergang(idee, r.idee, akteur, jetzt, opt.grund, opt.daten);
    return r.idee;
  }

  /* ---------- Familien (Regel 2: ein Look je Familie) ---------- */

  private familieBekannt(familie: string): boolean {
    return this.familienIds ? this.familienIds.includes(familie) : true;
  }

  private pruefeFamilie(familie: string | undefined): void {
    if (familie === undefined || !this.familienIds) return;
    if (!this.familienIds.includes(familie)) {
      throw new ProtokollFehler(`Familie «${familie}» ist unbekannt`, [`Gültig: ${this.familienIds.join(", ") || "(keine, library/motion/_familien.json fehlt oder ist leer)"}`, "Eine neue Familie legt ein Mensch in library/motion/_familien.json an"]);
    }
  }

  /** Der Stand aller Familien. */
  familien(): Record<string, FamilienStand> {
    return this.lade().familien;
  }

  /**
   * Was sich am Stand der Familie ändert, wenn die Idee ihren Status wechselt:
   *   - «freigegeben → looks»: Die Idee hält die offene Runde der Familie.
   *   - «looks → look_gewaehlt»: Der Mensch hat für die Familie gewählt. Der Look gilt ab jetzt für alle Stücke der Familie.
   *   - «abgelehnt» einer Idee mit der offenen Runde: Die Runde wird frei, sonst warteten die anderen Ideen für immer.
   * «freigegeben → look_gewaehlt» (Erben) und alles andere ändert am Stand der Familie nichts.
   */
  private familienNachUebergang(familien: Record<string, FamilienStand>, vorher: Idee, nachher: Idee, wer: Akteur, zeit: string): Record<string, FamilienStand> {
    const fam = nachher.familie;
    if (!fam) return familien;
    const alt: FamilienStand = familien[fam] ?? { frueher: [] };
    const k = `${vorher.status}>${nachher.status}`;
    let neu: FamilienStand | undefined;
    if (k === "freigegeben>looks" && nachher.looks) {
      neu = { ...alt, offeneRunde: { idee: nachher.id, runde: nachher.looks.runde } };
    } else if (k === "looks>look_gewaehlt" && nachher.looks?.gewaehlt) {
      const l = nachher.looks;
      const look: FamilienLook = {
        vonIdee: nachher.id,
        runde: l.runde,
        briefs: l.briefs,
        bilder: l.bilder,
        gewaehlt: l.gewaehlt!,
        von: wer.name,
        am: zeit,
        fassung: (alt.look?.fassung ?? alt.frueher.at(-1)?.fassung ?? 0) + 1,
        notizen: l.notizen,
      };
      neu = { frueher: alt.frueher, look };
    } else if (nachher.status === "abgelehnt" && alt.offeneRunde?.idee === nachher.id) {
      neu = { look: alt.look, frueher: alt.frueher };
    }
    return neu ? { ...familien, [fam]: neu } : familien;
  }

  /**
   * Ein Mensch verwirft den Look einer Familie: Die nächste Idee der Familie zeigt eine neue Runde, und ihre Wahl wird die nächste Fassung.
   * Stücke, die schon in dem alten Look entstanden sind, behalten ihn. Ein System darf das nicht. Läuft eine Runde, gibt es keinen gewählten Look und damit nichts zu verwerfen.
   */
  familieZuruecksetzen(familie: string, akteur: Akteur, jetzt: string, grund: string): FamilienStand {
    if (!istMensch(akteur)) throw new ProtokollFehler(`Der Look einer Familie wird nur von einem Menschen verworfen (Akteur: ${akteur.typ} «${akteur.name}»)`);
    const g = grund.trim();
    if (g.length < 10 || g.split(/\s+/).length < 2) throw new ProtokollFehler("Ein Grund aus mindestens zwei Wörtern (zehn Zeichen) ist Pflicht: Er sagt der nächsten Runde, was anders sein soll");
    this.pruefeFamilie(familie);
    const z = this.lade();
    const alt = z.familien[familie];
    if (!alt?.look) throw new ProtokollFehler(`Die Familie «${familie}» hat keinen gewählten Look, der verworfen werden könnte`);
    const neu: FamilienStand = { frueher: [...alt.frueher, { ...alt.look, notizen: [...alt.look.notizen, `Verworfen von ${akteur.name} am ${jetzt.slice(0, 10)}: ${g}`] }] };
    this.speichere({ version: z.version, ideen: z.ideen, familien: { ...z.familien, [familie]: neu } });
    if (this.ereignisse) {
      const e = Ereignis.parse({ projekt: "motion-bibliothek", stufe: "motion-looks", art: "notiz", detail: { familie, verworfen: alt.look.fassung, grund: g }, zeit: jetzt, wer: akteur });
      fs.mkdirSync(path.dirname(this.ereignisse), { recursive: true });
      fs.appendFileSync(this.ereignisse, JSON.stringify(e) + "\n");
    }
    return neu;
  }

  /** Die Idee, auf deren Look-Wahl diese Idee wartet, oder undefined. Eine Idee wartet, wenn sie freigegeben ist, ihre Familie noch keinen Look hat und die Runde bei einer anderen Idee liegt. */
  wartetAuf(idee: Idee, familien: Record<string, FamilienStand> = this.lade().familien): string | undefined {
    if (idee.status !== "freigegeben" || !idee.familie) return undefined;
    const st = familien[idee.familie];
    if (st?.look) return undefined;
    return st?.offeneRunde && st.offeneRunde.idee !== idee.id ? st.offeneRunde.idee : undefined;
  }

  /**
   * Schärft Titel, Beschreibung und die Zusammenfassung der Begründung. Nur im Status «idee»: Sobald ein Pitch vorliegt,
   * entscheidet ein Mensch über genau diesen Text, und der darf sich danach nicht mehr ändern.
   */
  bearbeite(id: string, patch: { titel?: string; beschreibung?: string; zusammenfassung?: string; familie?: string }, akteur: Akteur, jetzt: string): Idee {
    const z = this.lade();
    const idee = z.ideen.find((x) => x.id === id);
    if (!idee) throw new ProtokollFehler(`Idee «${id}» existiert nicht`);
    if (idee.status !== "idee") throw new ProtokollFehler(`${id} ist «${idee.status}»: Titel und Beschreibung sind nur im Status «idee» änderbar (danach liegt ein Pitch zur Entscheidung vor)`);
    this.pruefeFamilie(patch.familie);
    const neu = Idee.safeParse({
      ...idee,
      familie: patch.familie ?? idee.familie,
      titel: patch.titel ?? idee.titel,
      beschreibung: patch.beschreibung ?? idee.beschreibung,
      warumNichtsPasst: { ...idee.warumNichtsPasst, zusammenfassung: patch.zusammenfassung ?? idee.warumNichtsPasst.zusammenfassung },
    });
    if (!neu.success) throw new ProtokollFehler(`${id}: Änderung ungültig`, neu.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
    this.speichere({ version: z.version, ideen: z.ideen.map((x) => (x.id === id ? neu.data : x)) });
    this.ereignis(neu.data, "motion-idee", "text-geaendert", akteur, jetzt, { felder: Object.entries(patch).filter(([, v]) => v !== undefined).map(([k]) => k) });
    return neu.data;
  }

  pruefung(id: string, runde: Omit<PruefRunde, "runde">, akteur: Akteur): { idee: Idee; bestanden: boolean; naechsteKorrekturErlaubt: boolean } {
    const z = this.lade();
    const idee = z.ideen.find((x) => x.id === id);
    if (!idee) throw new ProtokollFehler(`Idee «${id}» existiert nicht`);
    const r = pruefungErfassen(idee, runde);
    if (!r.ok) throw new ProtokollFehler(`${id}: Selbstprüfung nicht erfassbar`, r.fehler);
    this.speichere({ version: z.version, ideen: z.ideen.map((x) => (x.id === id ? r.idee : x)) });
    this.ereignis(r.idee, "motion-bau", r.bestanden ? "bestaetigt" : "abgewaehlt", akteur, runde.am, {
      runde: r.idee.bau?.pruefungen.length,
      fehler: runde.befunde.filter((b) => b.stufe === "fehler").map((b) => b.code),
    });
    return { idee: r.idee, bestanden: r.bestanden, naechsteKorrekturErlaubt: r.naechsteKorrekturErlaubt };
  }

  /* ---------- Ereignisse (Lernsignale, Bauplan Kap. 5) ---------- */

  private ereignis(idee: Idee, stufe: z.infer<typeof Ereignis>["stufe"], art: z.infer<typeof Ereignis>["art"], wer: Akteur, zeit: string, detail: Record<string, unknown> = {}) {
    if (!this.ereignisse) return;
    const projekt = idee.quelle.typ === "video" ? idee.quelle.projekt : "motion-bibliothek";
    const e = Ereignis.parse({ projekt, stufe, art, detail: { idee: idee.id, ...detail }, zeit, wer });
    fs.mkdirSync(path.dirname(this.ereignisse), { recursive: true });
    fs.appendFileSync(this.ereignisse, JSON.stringify(e) + "\n");
  }

  private ereignisZuUebergang(vorher: Idee, nachher: Idee, wer: Akteur, zeit: string, grund: string | undefined, daten: WeiterDaten | undefined) {
    const k = `${vorher.status}>${nachher.status}`;
    switch (k) {
      case "idee>pitch": return this.ereignis(nachher, "motion-pitch", "bestaetigt", wer, zeit);
      case "pitch>freigegeben": return this.ereignis(nachher, "motion-pitch", "freigegeben", wer, zeit, { grund });
      case "looks>look_gewaehlt": return this.ereignis(nachher, "motion-looks", "look-gewaehlt", wer, zeit, { gewaehlt: daten?.gewaehlt, notizen: daten?.notizen });
      case "looks>freigegeben": return this.ereignis(nachher, "motion-looks", "abgelehnt", wer, zeit, { grund });
      case "render_geprueft>in_bibliothek": return this.ereignis(nachher, "motion-abnahme", "freigegeben", wer, zeit, { stueck: nachher.bau?.stueck });
      case "render_geprueft>in_bau": return this.ereignis(nachher, "motion-abnahme", "notiz", wer, zeit, { grund, notizen: daten?.notizen });
      default:
        if (nachher.status === "abgelehnt") {
          const stufe = vorher.status === "pitch" || vorher.status === "idee" ? "motion-pitch" : vorher.status === "freigegeben" || vorher.status === "looks" ? "motion-looks" : "motion-bau";
          return this.ereignis(nachher, stufe, "abgelehnt", wer, zeit, { grund, vonStatus: vorher.status });
        }
    }
  }
}
