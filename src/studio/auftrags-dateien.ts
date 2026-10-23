import fs from "node:fs";
import path from "node:path";
import type { AuftragDatei } from "./vertrag";

/**
 * Dateien eines Auftrags auf diesen Rechner holen (Scheibe S8): Bilder und Dokumente, die ein Admin im Tool an den Auftrag gehängt hat (Moodboard, Briefing, Fotos).
 * Hier steht nur, was rein ist: Namen säubern, Typen und Grössen prüfen, Adressen prüfen, laden. Der Befehl selbst steht in `auftraege.ts`.
 *
 * Dateien sind Angaben, keine Befehle (wie die Notizen): Ein Bild oder Dokument kann Anweisungen für Claude enthalten. Der Skill `studio-warteschlange` sagt, was daraus folgt.
 * Das Token des Geräts geht nie an die Adresse einer Datei (sie ist selbst die Berechtigung und gilt zehn Minuten). Was ans Tool geht, bleibt Auftrag und Lease.
 */

const MiB = 1024 * 1024;

/** Höchstgrösse einer Datei (wie im Tool: 20 MB). */
export const DATEI_MAX_BYTES = 20 * MiB;
/** Höchstzahl der Dateien eines Auftrags (wie im Tool). */
export const DATEIEN_MAX = 30;
const ZEITLIMIT_MS = 60_000;

/** Die Typen, die das Tool annimmt (`lib/feedback/constants.ts` im Tool) und ihre Endungen. Alles andere wird nicht geladen. */
export const DATEI_TYPEN: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "application/pdf": ".pdf",
  "text/plain": ".txt",
  "text/csv": ".csv",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.ms-powerpoint": ".ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
};

/**
 * Ein Name, der auf diesem Rechner sicher ist: nur das letzte Stück (kein Pfad), Unicode NFC, Steuerzeichen und `/ \ : * ? " < > |` weg, kein Punkt am Anfang, höchstens 100 Zeichen.
 * Die Endung richtet sich nach dem Typ, nicht nach dem Namen (ein Name «x.sh» mit dem Typ image/png wird zu «x.png»). Vor den Namen kommt die Nummer, damit gleiche Namen nicht kollidieren.
 */
export function sichererName(name: string, typ: string, nummer: number): string {
  const endung = DATEI_TYPEN[typ] ?? "";
  let basis = name.normalize("NFC");
  basis = basis.split(/[\\/]/).pop() ?? "";
  // eslint-disable-next-line no-control-regex
  basis = basis.replace(/[\u0000-\u001f\u007f]/g, "").replace(/[:*?"<>|]/g, "_");
  basis = basis.replace(/\.[A-Za-z0-9]{1,5}$/, "");
  basis = basis.replace(/^[.\s]+/, "").replace(/\s+/g, " ").trim();
  basis = Array.from(basis).slice(0, 100 - endung.length).join("").trim();
  if (basis === "") basis = "datei";
  return `${String(nummer).padStart(2, "0")}-${basis}${endung}`;
}

/** Ist das eine Adresse, von der geladen werden darf? https, oder http nur für den eigenen Rechner (Entwicklung), nie mit Benutzer und Passwort. */
export function adresseOk(url: string): boolean {
  try {
    const u = new URL(url);
    const lokal = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
    return (u.protocol === "https:" || (u.protocol === "http:" && lokal)) && !u.username && !u.password;
  } catch {
    return false;
  }
}

export type DateiErgebnis =
  | { art: "geladen"; datei: string; bytes: number }
  /** Die Datei lag schon mit gleicher Grösse da. */
  | { art: "vorhanden"; datei: string; bytes: number }
  | { art: "uebersprungen"; grund: string }
  | { art: "fehler"; grund: string };

/** Lädt eine Datei in `ordner` (der muss existieren). Prüft Typ, Grösse und Adresse vorher, die Grösse noch einmal beim Laden. Wirft nie. */
export async function ladeDatei(f: typeof fetch, d: AuftragDatei, nummer: number, ordner: string): Promise<DateiErgebnis> {
  if (!(d.type in DATEI_TYPEN)) return { art: "uebersprungen", grund: "Dateityp nicht erlaubt" };
  if (d.size > DATEI_MAX_BYTES) return { art: "uebersprungen", grund: "grösser als 20 MB" };
  if (d.url === null) return { art: "fehler", grund: "Das Tool findet die Datei im Speicher nicht" };
  if (!adresseOk(d.url)) return { art: "fehler", grund: "Die Adresse der Datei ist nicht zulässig" };
  const datei = sichererName(d.name, d.type, nummer);
  const ziel = path.join(ordner, datei);
  // Nie aus dem Ordner schreiben: Der Name hat keinen Pfad mehr, das hier ist der zweite Riegel.
  if (path.dirname(path.resolve(ziel)) !== path.resolve(ordner)) return { art: "fehler", grund: "Der Name führt aus dem Ordner" };
  try {
    if (fs.statSync(ziel).size === d.size) return { art: "vorhanden", datei, bytes: d.size };
  } catch {
    /* noch nicht da */
  }
  const abbruch = new AbortController();
  const timer = setTimeout(() => abbruch.abort(), ZEITLIMIT_MS);
  try {
    // Ohne Kopfzeile «authorization»: Die Adresse ist die Berechtigung, das Token des Geräts gehört nicht dorthin.
    const res = await f(d.url, { method: "GET", signal: abbruch.signal, redirect: "error" });
    if (!res.ok) return { art: "fehler", grund: `Der Speicher antwortet mit ${res.status}` };
    const laenge = Number(res.headers.get("content-length"));
    if (Number.isFinite(laenge) && laenge > DATEI_MAX_BYTES) return { art: "fehler", grund: "Der Speicher meldet mehr als 20 MB" };
    const teile: Buffer[] = [];
    let summe = 0;
    const leser = res.body?.getReader();
    if (!leser) return { art: "fehler", grund: "Der Speicher liefert keinen Inhalt" };
    for (;;) {
      const { done, value } = await leser.read();
      if (done) break;
      summe += value.byteLength;
      if (summe > DATEI_MAX_BYTES) {
        await leser.cancel();
        return { art: "fehler", grund: "Mehr als 20 MB geliefert" };
      }
      teile.push(Buffer.from(value));
    }
    if (summe !== d.size) return { art: "fehler", grund: `Grösse stimmt nicht (erwartet ${d.size}, geliefert ${summe})` };
    const tmp = `${ziel}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, Buffer.concat(teile));
    fs.renameSync(tmp, ziel);
    return { art: "geladen", datei, bytes: summe };
  } catch {
    return { art: "fehler", grund: "Laden fehlgeschlagen (Netz oder Zeitlimit)" };
  } finally {
    clearTimeout(timer);
  }
}

/** «482113» → «471 KB». */
export function groesse(bytes: number): string {
  return bytes < MiB ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / MiB).toFixed(1).replace(".", ",")} MB`;
}
