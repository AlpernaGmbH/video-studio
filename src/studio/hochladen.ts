import type { ToolKonfig } from "./konfig";
import { bereinige } from "./melder";
import { VERBINDUNGSTEXT } from "./texte";

/**
 * Dateien zu einem Inhalt ans Alperna-Tool hochladen (Plan v4, Phase 2, Scheibe S3): Vorschau-Video, Kontaktbogen, Gegenlesen-Text und Messwerte.
 * Das Tool bestimmt den Pfad und prüft alles (Art, Typ, Grösse, Fassung, Datenschutz-Schalter); der Rechner lädt nur auf den Link hoch, den das Tool für genau diese Datei gibt,
 * und meldet danach, dass er fertig ist. Der Typ im Header ist immer der der Art, nie einer, den das Tool nennt. Die Adresse des Links und das Token stehen nie in einer Ausgabe.
 * Regel 11: Das Tool ist freiwillig. Dieser Befehl ist ausdrücklich, nicht Teil eines anderen Ablaufs; ein Ausfall des Tools lässt ihn mit Hinweis enden, ändert aber nie etwas an der Arbeit.
 */

const MiB = 1024 * 1024;

export type Art = "vorschau" | "kontaktbogen" | "gegenlesen" | "qualitaet";

/** Dieselben Werte stehen in `docs/studio/vertrag.json` (`artifacts.arten`); der Test `hochladen.test.ts` vergleicht. */
export const ARTEN: Record<Art, { name: string; mime: string; maxBytes: number; schalter: boolean }> = {
  vorschau: { name: "Vorschau", mime: "video/mp4", maxBytes: 50 * MiB, schalter: true },
  kontaktbogen: { name: "Kontaktbogen", mime: "image/jpeg", maxBytes: 8 * MiB, schalter: true },
  gegenlesen: { name: "Gegenlesen", mime: "text/plain", maxBytes: 1 * MiB, schalter: true },
  qualitaet: { name: "Messwerte", mime: "application/json", maxBytes: 1 * MiB, schalter: false },
};
export const ALLE_ARTEN: readonly Art[] = ["vorschau", "kontaktbogen", "gegenlesen", "qualitaet"];

/** «vorschau,kontaktbogen» → Liste, oder der Text eines Fehlers. */
export function leseArten(text: string): Art[] | string {
  const namen = text.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (namen.length === 0) return `Keine Art genannt. Erlaubt: ${ALLE_ARTEN.join(", ")}`;
  const unbekannt = namen.filter((n) => !(ALLE_ARTEN as readonly string[]).includes(n));
  if (unbekannt.length) return `Unbekannte Art «${unbekannt.join(", ")}». Erlaubt: ${ALLE_ARTEN.join(", ")}`;
  return [...new Set(namen)] as Art[];
}

// ---------- Messwerte bereinigen ----------

const zahl = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const objekt = (v: unknown): Record<string, unknown> | undefined => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);

function noten(v: unknown): { code: string; text: string }[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 30).flatMap((x) => {
    const o = objekt(x);
    return o && typeof o["code"] === "string" && typeof o["text"] === "string" ? [{ code: bereinige(o["code"], 60), text: bereinige(o["text"], 400) }] : [];
  });
}

/**
 * Aus der Messung (`ergebnis/qualitaet.json`, geschrieben von `reel messe`) wird, was ans Tool geht: nur Zahlen und kurze Texte. Der Pfad der Datei auf diesem Rechner, die volle Messung
 * und die Stufe der Hinweise bleiben zurück (Regel 11: nie Dateinamen). Texte laufen durch die Pfadbereinigung. Gibt es ein Pflichtfeld nicht, wirft die Funktion.
 * `docs/studio/vertrag.json` hält ein Beispiel (`artifacts.qualitaet`), das beide Seiten testen.
 */
export function bereinigeQualitaet(roh: unknown): Record<string, unknown> {
  const o = objekt(roh);
  if (!o) throw new Error("Die Messwerte haben nicht die erwartete Form");
  const dauer = zahl(o["dauer"]);
  const breite = zahl(o["breite"]);
  const hoehe = zahl(o["hoehe"]);
  const fps = zahl(o["fps"]);
  const schnitte = objekt(o["schnitte"]);
  const farbe = objekt(o["farbe"]);
  const stille = objekt(o["stille"]);
  const erste = objekt(o["ersteAussage"]);
  const quelle = (v: unknown, erlaubt: string[]): string | undefined => (typeof v === "string" && erlaubt.includes(v) ? v : undefined);
  if (dauer === undefined || breite === undefined || hoehe === undefined || fps === undefined || !schnitte || !farbe || !stille || !erste) throw new Error("Die Messwerte sind unvollständig");
  const sAnzahl = zahl(schnitte["anzahl"]);
  const sProMinute = zahl(schnitte["proMinute"]);
  const sQuelle = quelle(schnitte["quelle"], ["plan", "bild"]);
  const saettigung = zahl(farbe["saettigung"]);
  const spanne = zahl(farbe["spanne"]);
  const anteil = zahl(stille["anteil"]);
  const laengste = zahl(stille["laengste"]);
  const sekunden = zahl(erste["sekunden"]);
  const eQuelle = quelle(erste["quelle"], ["plan", "ton"]);
  if (sAnzahl === undefined || sProMinute === undefined || !sQuelle || saettigung === undefined || spanne === undefined || anteil === undefined || laengste === undefined || sekunden === undefined || !eQuelle) throw new Error("Die Messwerte sind unvollständig");
  const zooms = objekt(o["zooms"]);
  const zAnzahl = zahl(zooms?.["anzahl"]);
  const zProMinute = zahl(zooms?.["proMinute"]);
  const mit = <T>(k: string, v: T | undefined): Record<string, T> => (v === undefined ? {} : { [k]: v });
  return {
    ...(typeof o["gemessen"] === "string" ? { gemessen: o["gemessen"].slice(0, 40) } : {}),
    dauer,
    breite,
    hoehe,
    fps,
    ...mit("videoMbit", zahl(o["videoMbit"])),
    ...mit("lufs", zahl(o["lufs"])),
    ...mit("truePeak", zahl(o["truePeak"])),
    schnitte: { anzahl: sAnzahl, proMinute: sProMinute, quelle: sQuelle },
    ...(zAnzahl !== undefined && zProMinute !== undefined ? { zooms: { anzahl: zAnzahl, proMinute: zProMinute } } : {}),
    ...mit("grafikAnteil", zahl(o["grafikAnteil"])),
    ...mit("brollAnteil", zahl(o["brollAnteil"])),
    farbe: { saettigung, spanne },
    stille: { anteil, laengste },
    ersteAussage: { sekunden, quelle: eQuelle },
    ...(typeof o["planHinweis"] === "string" ? { planHinweis: bereinige(o["planHinweis"], 400) } : {}),
    abweichungen: noten(o["abweichungen"]),
    hinweise: noten(o["hinweise"]),
  };
}

// ---------- Hochladen einer Datei ----------

export type ArtErgebnis =
  | { art: Art; ergebnis: "hochgeladen"; bytes: number }
  | { art: Art; ergebnis: "uebersprungen"; grund: string }
  | {
      art: Art;
      ergebnis: "fehler";
      grund: string;
      /** Ein späterer Versuch mit demselben Befehl kann gelingen. */
      spaeter: boolean;
      /** Die übrigen Dateien gar nicht erst versuchen (Token abgelehnt, Tool aus, Tool überlastet). */
      stop: boolean;
    };

interface Zeitlimits {
  api: number;
  upload: number;
}
export const ZEITLIMITS: Zeitlimits = { api: 15_000, upload: 600_000 };

async function mitZeitlimit<T>(ms: number, lauf: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const abbruch = new AbortController();
  const timer = setTimeout(() => abbruch.abort(), ms);
  try {
    return await lauf(abbruch.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function post(konfig: ToolKonfig, f: typeof fetch, pfad: string, body: unknown, ms: number): Promise<{ status: number; json: unknown }> {
  return mitZeitlimit(ms, async (signal) => {
    const res = await f(`${konfig.url}${pfad}`, { method: "POST", headers: { authorization: `Bearer ${konfig.token}`, "content-type": "application/json" }, body: JSON.stringify(body), signal });
    return { status: res.status, json: await res.json().catch(() => undefined) };
  });
}

/** Der Text des Tools zu einer Ablehnung (422): sein eigener Satz, sonst die Fehler der Felder. */
function ablehnung(json: unknown): string {
  const j = objekt(json);
  const issues = Array.isArray(j?.["issues"]) ? (j["issues"] as unknown[]).flatMap((i) => (objekt(i) && typeof objekt(i)!["message"] === "string" ? [`${String(objekt(i)!["path"] ?? "")}: ${String(objekt(i)!["message"])}`] : [])) : [];
  return bereinige(issues.length ? issues.join("; ") : typeof j?.["error"] === "string" ? j["error"] : "ungültig", 200);
}

const SCHALTER_AUS = "Vorschauen sind für diesen Inhalt im Tool nicht erlaubt: Ein Admin schaltet das auf der Seite des Inhalts ein.";

/** Header, die ein Gerät beim Hochladen mitschickt: nur diese, der Typ ist immer der der Art. */
const ERLAUBTE_HEADER = ["apikey", "cache-control", "x-upsert"];

function uploadZiel(antwort: unknown, art: Art): { url: string; headers: Record<string, string> } | undefined {
  const j = objekt(antwort);
  const url = typeof j?.["uploadUrl"] === "string" ? j["uploadUrl"] : undefined;
  if (!url) return undefined;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return undefined;
  }
  const lokal = u.hostname === "127.0.0.1" || u.hostname === "localhost";
  if (u.protocol !== "https:" && !(u.protocol === "http:" && lokal)) return undefined;
  const headers: Record<string, string> = { "content-type": ARTEN[art].mime };
  const roh = objekt(j?.["headers"]) ?? {};
  for (const [k, v] of Object.entries(roh)) if (typeof v === "string" && ERLAUBTE_HEADER.includes(k.toLowerCase())) headers[k.toLowerCase()] = v;
  return { url, headers };
}

export interface HochladeDatei {
  konfig: ToolKonfig;
  fetch: typeof fetch;
  code: string;
  version: number;
  art: Art;
  bytes: Buffer;
  zeitlimits?: Zeitlimits;
}

/** Vorbereiten, hochladen, eintragen. Wirft nie: Jeder Ausgang ist ein Ergebnis mit Text für Menschen. */
export async function ladeDateiHoch(o: HochladeDatei): Promise<ArtErgebnis> {
  const art = o.art;
  const spec = ARTEN[art];
  const z = o.zeitlimits ?? ZEITLIMITS;
  const nichtErreichbar = (grund: string = VERBINDUNGSTEXT["nicht-erreichbar"]): ArtErgebnis => ({ art, ergebnis: "fehler", grund, spaeter: true, stop: true });
  const kopf = { code: o.code, kind: art, version: o.version };

  // 1. vorbereiten
  let ziel: { url: string; headers: Record<string, string> };
  try {
    const r = await post(o.konfig, o.fetch, "/api/studio-geraet/artifacts/target", { ...kopf, mime: spec.mime, size: o.bytes.length }, z.api);
    if (r.status === 401) return { art, ergebnis: "fehler", grund: VERBINDUNGSTEXT.abgelehnt, spaeter: false, stop: true };
    if (r.status === 403) return { art, ergebnis: "uebersprungen", grund: SCHALTER_AUS };
    if (r.status === 404) return { art, ergebnis: "fehler", grund: `Der Inhalt ${o.code} ist im Tool nicht bekannt, oder das Studio ist dort ausgeschaltet.`, spaeter: false, stop: true };
    if (r.status === 413 || r.status === 422) return { art, ergebnis: "fehler", grund: `Das Tool lehnt die Datei ab: ${ablehnung(r.json)}`, spaeter: false, stop: false };
    if (r.status === 429) return nichtErreichbar("Das Tool drosselt gerade (zu viele Anfragen). Später noch einmal versuchen.");
    if (r.status !== 200) return nichtErreichbar(`Das Tool antwortete ${r.status}.`);
    const gefunden = uploadZiel(r.json, art);
    if (!gefunden) return { art, ergebnis: "fehler", grund: "Das Tool hat keinen brauchbaren Upload-Link gegeben.", spaeter: true, stop: false };
    ziel = gefunden;
  } catch {
    return nichtErreichbar();
  }

  // 2. hochladen (an den Speicher, nicht ans Tool: ohne das Token)
  try {
    const status = await mitZeitlimit(z.upload, async (signal) => {
      const res = await o.fetch(ziel.url, { method: "PUT", headers: ziel.headers, body: o.bytes, signal });
      await res.arrayBuffer().catch(() => undefined);
      return res.status;
    });
    if (status !== 200 && status !== 201) return { art, ergebnis: "fehler", grund: `Der Speicher hat den Upload abgelehnt (Status ${status}).`, spaeter: status >= 500 || status === 429, stop: false };
  } catch {
    return { art, ergebnis: "fehler", grund: "Der Upload ist abgebrochen oder die Verbindung riss ab.", spaeter: true, stop: false };
  }

  // 3. eintragen
  try {
    const r = await post(o.konfig, o.fetch, "/api/studio-geraet/artifacts/register", kopf, z.api);
    if (r.status === 201) return { art, ergebnis: "hochgeladen", bytes: o.bytes.length };
    if (r.status === 401) return { art, ergebnis: "fehler", grund: VERBINDUNGSTEXT.abgelehnt, spaeter: false, stop: true };
    if (r.status === 403) return { art, ergebnis: "uebersprungen", grund: SCHALTER_AUS };
    if (r.status === 422) return { art, ergebnis: "fehler", grund: `Das Tool hat die hochgeladene Datei geprüft und abgewiesen: ${ablehnung(r.json)}`, spaeter: false, stop: false };
    return nichtErreichbar(`Die Datei liegt im Speicher, ist im Tool aber noch nicht eingetragen (Antwort ${r.status}). Derselbe Befehl später noch einmal.`);
  } catch {
    return nichtErreichbar("Die Datei liegt im Speicher, ist im Tool aber noch nicht eingetragen. Derselbe Befehl später noch einmal.");
  }
}

// ---------- Der Befehl ----------

/** Woher die Dateien kommen. Die Standard-Quelle liest den Reel-Ordner (`reel-quellen.ts`); die Tests geben eigene. */
export interface Quellen {
  bereit(art: Art): Promise<{ bytes: Buffer } | { fehlt: string }>;
}

export interface HochladenEingabe {
  id: string;
  /** Welche Arten; ohne Angabe alle vier. */
  arten?: Art[];
  konfig: ToolKonfig;
  fetch: typeof fetch;
  quellen: Quellen;
  aus: (zeile: string) => void;
  fehl: (zeile: string) => void;
  /** Meldet das Ergebnis als Ereignis (Schritt «Hochladen»), falls ein Melder da ist. */
  melde?: (e: { state: "ok" | "error"; detail: Record<string, unknown> }) => void;
  zeitlimits?: Zeitlimits;
}

function groesse(bytes: number): string {
  return bytes >= MiB ? `${(bytes / MiB).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Gibt den Exit-Code zurück: 0, wenn alles Gewünschte hochgeladen oder bewusst übersprungen wurde; 1 bei einem Fehler. */
export async function hochladen(o: HochladenEingabe): Promise<number> {
  const ausdruecklich = o.arten !== undefined;
  const arten = o.arten ?? [...ALLE_ARTEN];
  const z = o.zeitlimits ?? ZEITLIMITS;

  // Stand im Tool: Fassung und Datenschutz-Schalter
  let version: number;
  let erlaubt: boolean;
  try {
    const r = await mitZeitlimit(z.api, async (signal) => {
      const res = await o.fetch(`${o.konfig.url}/api/studio-geraet/contents/${o.id}`, { method: "GET", headers: { authorization: `Bearer ${o.konfig.token}` }, signal });
      return { status: res.status, json: await res.json().catch(() => undefined) };
    });
    if (r.status === 401) {
      o.fehl(VERBINDUNGSTEXT.abgelehnt);
      return 1;
    }
    if (r.status === 404) {
      o.fehl(`Im Tool ist ${o.id} nicht bekannt (oder das Studio ist dort ausgeschaltet). Zuerst anlegen: ./studio tool inhalt neu "<Titel>"`);
      return 1;
    }
    const j = objekt(r.json);
    if (r.status !== 200 || !j || typeof j["version"] !== "number" || typeof j["preview_allowed"] !== "boolean") {
      o.fehl(`Das Tool antwortete ${r.status}, der Stand von ${o.id} ist nicht lesbar.`);
      return 1;
    }
    version = j["version"];
    erlaubt = j["preview_allowed"];
  } catch {
    o.fehl(VERBINDUNGSTEXT["nicht-erreichbar"]);
    return 1;
  }

  o.aus(`${o.id}, Fassung ${version}: Vorschauen sind im Tool ${erlaubt ? "erlaubt" : "nicht erlaubt"}.`);
  const ergebnisse: ArtErgebnis[] = [];
  let fehlerCode = 0;
  for (const art of arten) {
    const spec = ARTEN[art];
    if (spec.schalter && !erlaubt) {
      ergebnisse.push({ art, ergebnis: "uebersprungen", grund: SCHALTER_AUS });
      continue;
    }
    let quelle: Awaited<ReturnType<Quellen["bereit"]>>;
    try {
      quelle = await o.quellen.bereit(art);
    } catch (e) {
      quelle = { fehlt: bereinige((e as Error).message, 200) };
    }
    if ("fehlt" in quelle) {
      if (ausdruecklich) {
        ergebnisse.push({ art, ergebnis: "fehler", grund: quelle.fehlt, spaeter: false, stop: false });
      } else ergebnisse.push({ art, ergebnis: "uebersprungen", grund: quelle.fehlt });
      continue;
    }
    if (quelle.bytes.length < 1 || quelle.bytes.length > spec.maxBytes) {
      ergebnisse.push({ art, ergebnis: "fehler", grund: quelle.bytes.length < 1 ? "Die Datei ist leer." : `Die Datei ist grösser als ${groesse(spec.maxBytes)} (${groesse(quelle.bytes.length)}).`, spaeter: false, stop: false });
      continue;
    }
    const r = await ladeDateiHoch({ konfig: o.konfig, fetch: o.fetch, code: o.id, version, art, bytes: quelle.bytes, zeitlimits: z });
    ergebnisse.push(r);
    if (r.ergebnis === "fehler" && r.stop) break;
  }

  for (const r of ergebnisse) {
    const name = ARTEN[r.art].name;
    if (r.ergebnis === "hochgeladen") o.aus(`  ${name}: hochgeladen (${groesse(r.bytes)})`);
    else if (r.ergebnis === "uebersprungen") o.aus(`  ${name}: übersprungen. ${r.grund}`);
    else {
      fehlerCode = 1;
      o.fehl(`  ${name}: ${r.grund}${r.spaeter ? " Derselbe Befehl später noch einmal." : ""}`);
    }
  }
  const nicht = arten.filter((a) => !ergebnisse.some((r) => r.art === a));
  if (nicht.length) {
    // Das gibt es nur nach einem Fehler mit Stopp; der Exit-Code ist dann schon 1.
    o.fehl(`  Nicht versucht: ${nicht.map((a) => ARTEN[a].name).join(", ")}`);
  }
  const hoch = ergebnisse.filter((r) => r.ergebnis === "hochgeladen").map((r) => r.art);
  if (hoch.length + ergebnisse.filter((r) => r.ergebnis === "fehler").length > 0) {
    o.melde?.({ state: fehlerCode ? "error" : "ok", detail: { hochgeladen: hoch, fehlgeschlagen: ergebnisse.filter((r) => r.ergebnis === "fehler").map((r) => r.art) } });
  }
  if (!hoch.length && !fehlerCode) o.aus("Es wurde nichts hochgeladen.");
  return fehlerCode;
}
