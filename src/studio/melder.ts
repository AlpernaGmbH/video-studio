import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { SchrittEreignis } from "../schnitt/stoppuhr";
import type { ToolKonfig } from "./konfig";

/**
 * Der Melder (Plan v4, Phase 2, Mac-Client C2): schickt Fortschritt an das Alperna-Tool und blockiert nie die Arbeit.
 *
 * Regeln:
 *  - Er wirft nie, ändert nie den Exit-Code und nie die Ausgabe eines Befehls. Ohne Verbindung tut er nichts.
 *  - Ein Ereignis wird zuerst synchron in den Ausgangskorb geschrieben (eine Datei je Ereignis), erst dann gesendet. So geht beim `process.exit` nichts verloren,
 *    und ohne Netz wird nachgesendet, sobald es wieder geht. Der Korb liegt neben `tool.json` (`~/.config/video-studio/ausgang/`), ausserhalb von OneDrive.
 *  - Jedes Ereignis hat eine eigene Kennung, die im Korb mitgespeichert wird: Eine Wiederholung erzeugt im Tool nichts doppelt.
 *  - 200: gesendet. 422 und 413: nie wiederholen, die Datei geht nach `abgelehnt/`. 401: das Token gilt nicht mehr, es wird nicht mehr gesendet und einmal gemeldet.
 *    404, 429, 503, Netzfehler, Zeitüberschreitung: später wieder, mit Wartezeit (30 s, verdoppelt bis höchstens 1 Stunde, `Retry-After` gilt als Untergrenze).
 *  - Die Beschreibung eines Fehlers enthält nie einen Pfad: Pfade tragen Kundennamen. Das Detail eines Ereignisses ist höchstens 4 KB (Grenze des Tools).
 */

export type Zustand = "start" | "ok" | "error" | "info";

export interface Ereignis {
  id: string;
  step: string;
  state: Zustand;
  /** ISO 8601, Zeit auf diesem Rechner. */
  at: string;
  span?: string;
  ms?: number;
  /** Code des Inhalts, `c-0007`. */
  code?: string;
  job?: string;
  detail?: Record<string, unknown>;
}

export type Eingabe = Omit<Ereignis, "id" | "at"> & { at?: string };

export interface MelderStand {
  verbunden: boolean;
  wartend: number;
  abgelehnt: number;
  /** Gesperrt, weil das Tool das Token abgelehnt hat (401). */
  gesperrt: boolean;
  /** Frühestens wieder senden (Epoch-Millisekunden), nach einem Fehler. */
  nichtVor?: number;
}

export interface Melder {
  melde(e: Eingabe): void;
  /** Wartet höchstens `maxMs`, bis der Korb leer ist. Was bis dahin nicht gesendet ist, bleibt im Korb. */
  leeren(maxMs: number): Promise<void>;
  /** Ein Beobachter für die Stoppuhr (`stoppuhr(jetzt, melder.schritte(code))`): meldet Beginn, Ende und Fehler jedes Schritts. */
  schritte(code?: string): (e: SchrittEreignis) => void;
  /** Ein Satz für die Ausgabe, einmal: wenn das Tool das Token abgelehnt hat. Danach undefined. */
  hinweis(): string | undefined;
  stand(): MelderStand;
}

/** Ein Melder, der nichts tut: ohne Verbindung. */
export const keinMelder: Melder = {
  melde: () => undefined,
  leeren: async () => undefined,
  schritte: () => () => undefined,
  hinweis: () => undefined,
  stand: () => ({ verbunden: false, wartend: 0, abgelehnt: 0, gesperrt: false }),
};

export const ENDPUNKT = "/api/studio-geraet/events";
export const BATCH = 50;
/** Höchstens so viele Sendungen je Durchgang: Das Tool erlaubt 1000 Ereignisse in 10 Minuten, ein grosser Rückstau läuft in mehreren Durchgängen. */
const MAX_SENDUNGEN = 15;
/** Das Tool lehnt Ereignisse ab, die älter als 30 Tage sind: Was älter als 29 Tage ist, wird gar nicht erst gesendet. */
const MAX_ALTER_MS = 29 * 24 * 3600_000;
const MAX_KORB = 5000;
const MAX_ABGELEHNT = 100;
const WARTE_START = 30_000;
const WARTE_MAX = 3600_000;
export const DETAIL_MAX_BYTES = 4000;

const CODE = /^[a-z0-9-]{1,32}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DATEIENDUNG = /[^\s"'«»<>|]+\.(?:mov|mp4|m4v|mkv|wav|mp3|aac|aiff?|jpe?g|png|heic|srt|md|json|fcpxml|otio|cube|txt|csv|pdf)\b/gi;

/**
 * Nimmt aus einem Fehlertext alles, was ein Pfad oder ein Dateiname sein könnte (sie tragen oft den Namen eines Kunden), und kürzt ihn.
 * Ordnernamen mit Leerzeichen («Kunde Müller») gehören zum Pfad; bei einem Pfad mitten im Satz geht dafür auch der Text bis zum nächsten Schrägstrich mit: Lieber zu viel als ein Kundenname im Tool.
 * Jedes Wort mit Schrägstrich und einem Buchstaben gilt als Pfad (auch «und/oder»: Lieber ein Wort zu viel weg). «12/13» bleibt.
 * Grenze: Ein Dateiname mit Leerzeichen und ohne Pfad («Interview Müller.mov») verliert nur seinen letzten Teil.
 */
export function bereinige(text: string, max = 200): string {
  const ohne = text
    .replace(/(?<!\w)(?:[A-Za-z]:)?[\\/](?:[^\\/\n"'«»<>|]*[\\/])+[^\s\\/"'«»<>|]*/g, "<pfad>")
    .replace(/(?=\S*[A-Za-zÀ-ÿ])\S*[\\/]\S*/g, "<pfad>")
    .replace(DATEIENDUNG, "<datei>")
    .replace(/\s+/g, " ")
    .trim();
  return ohne.length > max ? `${ohne.slice(0, max - 1)}…` : ohne;
}

function detailBegrenzt(d: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!d) return undefined;
  try {
    return Buffer.byteLength(JSON.stringify(d), "utf8") <= DETAIL_MAX_BYTES ? d : { gekuerzt: true };
  } catch {
    return { gekuerzt: true };
  }
}

/** Macht aus einer Eingabe ein Ereignis, das die Datenbank annimmt. Gibt undefined, wenn es das nicht kann (kein Schritt). */
export function baueEreignis(e: Eingabe, id: string, jetzt: Date): Ereignis | undefined {
  const step = e.step?.trim().slice(0, 80);
  if (!step) return undefined;
  const state: Zustand = e.state === "start" || e.state === "ok" || e.state === "error" ? e.state : "info";
  const aus: Ereignis = { id, step, state, at: e.at ?? jetzt.toISOString() };
  if (e.span) aus.span = e.span.slice(0, 64);
  if (e.ms !== undefined && Number.isFinite(e.ms)) aus.ms = Math.max(0, Math.round(e.ms));
  if (e.code && CODE.test(e.code)) aus.code = e.code;
  if (e.job && UUID.test(e.job)) aus.job = e.job;
  const detail = detailBegrenzt(e.detail);
  if (detail) aus.detail = detail;
  return aus;
}

export interface MelderOptionen {
  konfig: ToolKonfig | undefined;
  /** Ordner des Ausgangskorbs. */
  ausgang: string;
  fetch?: typeof fetch;
  jetzt?: () => number;
  /** Zeitlimit je Sendung in Millisekunden. */
  zeitlimit?: number;
  neueId?: () => string;
  /** Wie lange nach einem Ereignis gewartet wird, damit mehrere in einer Sendung ankommen (Millisekunden). Standard 200. */
  verzoegerung?: number;
}

interface Zustandsdatei {
  gesperrt?: { seit: string };
  nichtVor?: number;
  fehlversuche?: number;
}

export function erzeugeMelder(o: MelderOptionen): Melder {
  if (!o.konfig) return keinMelder;
  const konfig = o.konfig;
  const jetzt = o.jetzt ?? Date.now;
  const holen = o.fetch ?? globalThis.fetch;
  const zeitlimit = o.zeitlimit ?? 3000;
  const neueId = o.neueId ?? randomUUID;
  const verzoegerung = o.verzoegerung ?? 200;
  const dir = o.ausgang;
  const abgelehntDir = path.join(dir, "abgelehnt");
  const zustandsPfad = path.join(dir, "zustand.json");
  const lauf = randomUUID().slice(0, 8);
  let folge = 0;
  let laeuft: Promise<void> | undefined;
  let nochmal = false;
  let hinweisText: string | undefined;
  let timer: NodeJS.Timeout | undefined;

  const stillIgnorieren = (f: () => void): void => {
    try {
      f();
    } catch {
      // Der Melder stört nie
    }
  };

  function liesZustand(): Zustandsdatei {
    try {
      return JSON.parse(fs.readFileSync(zustandsPfad, "utf8")) as Zustandsdatei;
    } catch {
      return {};
    }
  }
  function schreibeZustand(z: Zustandsdatei): void {
    stillIgnorieren(() => {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      fs.writeFileSync(zustandsPfad, JSON.stringify(z), { mode: 0o600 });
    });
  }
  const korbDateien = (): string[] => {
    try {
      return fs.readdirSync(dir).filter((n) => n.endsWith(".json") && n !== "zustand.json").sort();
    } catch {
      return [];
    }
  };
  function nachAbgelehnt(datei: string, grund: string): void {
    stillIgnorieren(() => {
      fs.mkdirSync(abgelehntDir, { recursive: true, mode: 0o700 });
      const quelle = path.join(dir, datei);
      let inhalt = "";
      try {
        inhalt = fs.readFileSync(quelle, "utf8");
      } catch {
        // Datei schon weg: nichts zu sichern
      }
      fs.writeFileSync(path.join(abgelehntDir, datei), JSON.stringify({ grund: bereinige(grund), ereignis: tryParse(inhalt) }), { mode: 0o600 });
      fs.rmSync(quelle, { force: true });
      const alle = fs.readdirSync(abgelehntDir).sort();
      for (const alt of alle.slice(0, Math.max(0, alle.length - MAX_ABGELEHNT))) fs.rmSync(path.join(abgelehntDir, alt), { force: true });
    });
  }

  function melde(e: Eingabe): void {
    stillIgnorieren(() => {
      const id = neueId();
      const ereignis = baueEreignis(e, id, new Date(jetzt()));
      if (!ereignis) return;
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      const name = `${String(jetzt()).padStart(13, "0")}-${String(++folge).padStart(5, "0")}-${id}.json`;
      fs.writeFileSync(path.join(dir, name), JSON.stringify(ereignis), { flag: "wx", mode: 0o600 });
      plane();
    });
  }

  /** Sendet kurz nach dem letzten Ereignis, damit eine Folge von Ereignissen in einer Sendung ankommt. Der Zeitgeber hält den Prozess nie am Leben. */
  function plane(): void {
    nochmal = true;
    if (laeuft || timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      starte();
    }, verzoegerung);
    timer.unref();
  }

  function starte(): void {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    nochmal = true;
    if (laeuft) return;
    laeuft = sende()
      .catch(() => undefined)
      .finally(() => {
        laeuft = undefined;
      });
  }

  async function sende(): Promise<void> {
    for (let runde = 0; runde < MAX_SENDUNGEN; runde++) {
      nochmal = false;
      const z = liesZustand();
      if (z.gesperrt) return;
      if (z.nichtVor !== undefined && jetzt() < z.nichtVor) return;
      let dateien = korbDateien();
      if (dateien.length > MAX_KORB) {
        for (const d of dateien.slice(0, dateien.length - MAX_KORB)) stillIgnorieren(() => fs.rmSync(path.join(dir, d), { force: true }));
        dateien = dateien.slice(-MAX_KORB);
      }
      const gueltig: { datei: string; ereignis: Ereignis }[] = [];
      for (const d of dateien) {
        if (gueltig.length >= BATCH) break;
        let ereignis: Ereignis;
        try {
          ereignis = JSON.parse(fs.readFileSync(path.join(dir, d), "utf8")) as Ereignis;
        } catch {
          nachAbgelehnt(d, "Datei unlesbar");
          continue;
        }
        const alter = jetzt() - Date.parse(ereignis.at);
        if (!(alter <= MAX_ALTER_MS)) {
          nachAbgelehnt(d, "älter als 29 Tage");
          continue;
        }
        gueltig.push({ datei: d, ereignis });
      }
      if (!gueltig.length) {
        if (nochmal) continue;
        return;
      }
      const ergebnis = await sendung(gueltig.map((g) => g.ereignis));
      if (ergebnis.art === "gesendet") {
        const rep = ergebnis.bericht;
        const abgewiesen = new Map(rep.rejected.map((r) => [r.index, r.reason]));
        gueltig.forEach((g, i) => {
          if (abgewiesen.has(i)) nachAbgelehnt(g.datei, abgewiesen.get(i) ?? "abgewiesen");
          else stillIgnorieren(() => fs.rmSync(path.join(dir, g.datei), { force: true }));
        });
        if (z.fehlversuche || z.nichtVor !== undefined) schreibeZustand({ ...z, fehlversuche: 0, nichtVor: undefined });
        continue;
      }
      if (ergebnis.art === "verworfen") {
        for (const g of gueltig) nachAbgelehnt(g.datei, ergebnis.grund);
        continue;
      }
      if (ergebnis.art === "gesperrt") {
        schreibeZustand({ ...z, gesperrt: { seit: new Date(jetzt()).toISOString() } });
        hinweisText = "Tool: Das Geräte-Token wurde abgelehnt (widerrufen oder abgelaufen). Es wird nichts mehr gesendet. Neues Token holen und «./studio tool verbinden <Adresse>» ausführen. Die Arbeit ist davon nicht betroffen.";
        return;
      }
      // später wieder
      const n = (z.fehlversuche ?? 0) + 1;
      const wartezeit = Math.max(WARTE_START * 2 ** (n - 1), (ergebnis.retryNach ?? 0) * 1000);
      schreibeZustand({ ...z, fehlversuche: n, nichtVor: jetzt() + Math.min(wartezeit, WARTE_MAX) });
      return;
    }
  }

  type Sendung = { art: "gesendet"; bericht: { accepted: number; duplicates: number; rejected: { index: number; reason: string }[] } } | { art: "verworfen"; grund: string } | { art: "gesperrt" } | { art: "spaeter"; retryNach?: number };

  async function sendung(events: Ereignis[]): Promise<Sendung> {
    const abbruch = new AbortController();
    const timer = setTimeout(() => abbruch.abort(), zeitlimit);
    try {
      const res = await holen(`${konfig.url}${ENDPUNKT}`, {
        method: "POST",
        headers: { authorization: `Bearer ${konfig.token}`, "content-type": "application/json" },
        body: JSON.stringify({ events }),
        signal: abbruch.signal,
      });
      if (res.status === 200) {
        const b = (await res.json().catch(() => undefined)) as { accepted?: unknown; duplicates?: unknown; rejected?: unknown } | undefined;
        const rejected = Array.isArray(b?.rejected) ? (b.rejected as { index?: unknown; reason?: unknown }[]).filter((r) => Number.isInteger(r.index)).map((r) => ({ index: r.index as number, reason: String(r.reason ?? "abgewiesen") })) : [];
        return { art: "gesendet", bericht: { accepted: Number(b?.accepted ?? 0), duplicates: Number(b?.duplicates ?? 0), rejected } };
      }
      if (res.status === 401) return { art: "gesperrt" };
      if (res.status === 413 || res.status === 422) return { art: "verworfen", grund: `Tool antwortete ${res.status}` };
      const ra = Number(res.headers.get("retry-after"));
      return { art: "spaeter", ...(Number.isFinite(ra) && ra > 0 ? { retryNach: ra } : {}) };
    } catch {
      return { art: "spaeter" };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    melde,
    async leeren(maxMs) {
      stillIgnorieren(() => {
        if (korbDateien().length && !laeuft) starte();
      });
      const aktuell = laeuft;
      if (!aktuell) return;
      let frist: NodeJS.Timeout | undefined;
      await Promise.race([aktuell, new Promise<void>((r) => (frist = setTimeout(r, maxMs)))]).finally(() => frist && clearTimeout(frist));
    },
    schritte(code) {
      return (e) => {
        const span = `${lauf}-${e.nr}`;
        if (e.zustand === "start") melde({ step: e.name, state: "start", span, ...(code ? { code } : {}) });
        else if (e.zustand === "ok") melde({ step: e.name, state: "ok", span, ...(e.ms !== undefined ? { ms: e.ms } : {}), ...(code ? { code } : {}) });
        else melde({ step: e.name, state: "error", span, ...(e.ms !== undefined ? { ms: e.ms } : {}), ...(code ? { code } : {}), detail: { fehler: bereinige(e.fehler ?? "Fehler") } });
      };
    },
    hinweis() {
      const t = hinweisText;
      hinweisText = undefined;
      return t;
    },
    stand() {
      const z = liesZustand();
      let abgelehnt = 0;
      try {
        abgelehnt = fs.readdirSync(abgelehntDir).length;
      } catch {
        abgelehnt = 0;
      }
      return { verbunden: true, wartend: korbDateien().length, abgelehnt, gesperrt: !!z.gesperrt, ...(z.nichtVor !== undefined ? { nichtVor: z.nichtVor } : {}) };
    },
  };
}

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Hebt die Sperre nach einem 401 auf (nach `./studio tool verbinden`). */
export function entsperre(ausgang: string): void {
  try {
    fs.rmSync(path.join(ausgang, "zustand.json"), { force: true });
  } catch {
    // nichts zu tun
  }
}

/** Hebt eine Wartezeit nach einem Fehler auf (`./studio tool senden`). Eine Sperre nach 401 bleibt. */
export function setzeWartezeitZurueck(ausgang: string): void {
  try {
    const pfad = path.join(ausgang, "zustand.json");
    const z = JSON.parse(fs.readFileSync(pfad, "utf8")) as Zustandsdatei;
    delete z.nichtVor;
    delete z.fehlversuche;
    fs.writeFileSync(pfad, JSON.stringify(z), { mode: 0o600 });
  } catch {
    // Keine Zustandsdatei: nichts zurückzusetzen
  }
}

/**
 * Führt einen Befehl als einen gemeldeten Schritt aus: Beginn, dann Ende mit Dauer. Ein Exit-Code ungleich 0 und eine Ausnahme sind Fehler (die Ausnahme geht unverändert weiter).
 * Der Befehl selbst läuft in jedem Fall genau einmal und liefert dasselbe wie ohne Melder, auch wenn der Melder kaputt ist.
 */
export async function alsSchritt(melder: Melder | undefined, name: string, code: string | undefined, lauf: () => Promise<number>, jetzt: () => number = Date.now): Promise<number> {
  let beobachter: ((e: SchrittEreignis) => void) | undefined;
  try {
    beobachter = melder?.schritte(code);
  } catch {
    beobachter = undefined;
  }
  if (!beobachter) return lauf();
  const meld = (e: SchrittEreignis): void => {
    try {
      beobachter(e);
    } catch {
      // Der Melder stört den Befehl nie
    }
  };
  const t0 = jetzt();
  meld({ nr: 0, name, zustand: "start" });
  let rc: number;
  try {
    rc = await lauf();
  } catch (e) {
    meld({ nr: 0, name, zustand: "error", ms: jetzt() - t0, fehler: e instanceof Error ? e.message : String(e) });
    throw e;
  }
  meld(rc === 0 ? { nr: 0, name, zustand: "ok", ms: jetzt() - t0 } : { nr: 0, name, zustand: "error", ms: jetzt() - t0, fehler: `Exit-Code ${rc}` });
  return rc;
}
