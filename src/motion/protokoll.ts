import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { Akteur } from "../core/schemas";
import { Ereignis } from "../core/schemas";
import {
  Idee,
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

const Datei = z.object({ schema: z.literal(1), version: z.number().int().min(0), ideen: z.array(Idee) });

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
}

export class Ideenprotokoll {
  constructor(
    private readonly datei: string,
    private readonly ereignisse?: string,
  ) {}

  lade(): Zustand {
    if (!fs.existsSync(this.datei)) return { version: 0, ideen: [] };
    const roh = fs.readFileSync(this.datei, "utf8");
    let json: unknown;
    try {
      json = JSON.parse(roh);
    } catch (e) {
      throw new ProtokollFehler(`${this.datei} ist kein gültiges JSON`, [(e as Error).message]);
    }
    const p = Datei.safeParse(json);
    if (!p.success) throw new ProtokollFehler(`${this.datei} entspricht nicht dem Ideen-Schema`, p.error.issues.slice(0, 8).map((i) => `${i.path.join(".")}: ${i.message}`));
    return { version: p.data.version, ideen: p.data.ideen };
  }

  /** Schreibt atomar (temporäre Datei, dann umbenennen) und nur, wenn niemand dazwischen gespeichert hat. */
  speichere(z: Zustand): Zustand {
    const aufDisk = fs.existsSync(this.datei) ? this.lade().version : 0;
    if (aufDisk !== z.version) {
      throw new KonfliktFehler(`Das Ideenprotokoll wurde inzwischen geändert (Version ${aufDisk}, erwartet ${z.version}). Neu laden und wiederholen.`);
    }
    const neu: Zustand = { version: z.version + 1, ideen: z.ideen };
    fs.mkdirSync(path.dirname(this.datei), { recursive: true });
    const tmp = `${this.datei}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ schema: 1, ...neu }, null, 2) + "\n");
    fs.renameSync(tmp, this.datei);
    return neu;
  }

  naechsteId(ideen: Idee[]): string {
    const hoechste = ideen.reduce((m, i) => Math.max(m, Number(i.id.slice(2))), 0);
    return `m-${String(hoechste + 1).padStart(3, "0")}`;
  }

  neu(entwurf: IdeeEntwurf, akteur: Akteur, jetzt: string): Idee {
    const z = this.lade();
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

  weiter(id: string, nach: IdeeStatus, akteur: Akteur, jetzt: string, opt: { grund?: string; daten?: WeiterDaten; stueckAktiviert?: boolean; wipLimit?: number; maxOffenePitches?: number } = {}): Idee {
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
      wipLimit: opt.wipLimit,
      maxOffenePitches: opt.maxOffenePitches,
      imBau: andere.filter((x) => x.status === "in_bau").length,
      offenePitches: andere.filter((x) => x.status === "pitch").length,
    });
    if (!r.ok) throw new ProtokollFehler(`${id}: «${idee.status}» → «${nach}» nicht möglich`, r.fehler);
    this.speichere({ version: z.version, ideen: z.ideen.map((x) => (x.id === id ? r.idee : x)) });
    this.ereignisZuUebergang(idee, r.idee, akteur, jetzt, opt.grund, opt.daten);
    return r.idee;
  }

  /**
   * Schärft Titel, Beschreibung und die Zusammenfassung der Begründung. Nur im Status «idee»: Sobald ein Pitch vorliegt,
   * entscheidet ein Mensch über genau diesen Text, und der darf sich danach nicht mehr ändern.
   */
  bearbeite(id: string, patch: { titel?: string; beschreibung?: string; zusammenfassung?: string }, akteur: Akteur, jetzt: string): Idee {
    const z = this.lade();
    const idee = z.ideen.find((x) => x.id === id);
    if (!idee) throw new ProtokollFehler(`Idee «${id}» existiert nicht`);
    if (idee.status !== "idee") throw new ProtokollFehler(`${id} ist «${idee.status}»: Titel und Beschreibung sind nur im Status «idee» änderbar (danach liegt ein Pitch zur Entscheidung vor)`);
    const neu = Idee.safeParse({
      ...idee,
      titel: patch.titel ?? idee.titel,
      beschreibung: patch.beschreibung ?? idee.beschreibung,
      warumNichtsPasst: { ...idee.warumNichtsPasst, zusammenfassung: patch.zusammenfassung ?? idee.warumNichtsPasst.zusammenfassung },
    });
    if (!neu.success) throw new ProtokollFehler(`${id}: Änderung ungültig`, neu.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
    this.speichere({ version: z.version, ideen: z.ideen.map((x) => (x.id === id ? neu.data : x)) });
    this.ereignis(neu.data, "motion-idee", "text-geaendert", akteur, jetzt, { felder: Object.keys(patch) });
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
