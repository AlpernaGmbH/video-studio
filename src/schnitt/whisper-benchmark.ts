import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { lauf } from "../presets/messen";
import { leseTranskript, normiere, rohWoerter } from "./transkript";
import { transkribiere, type TranskribiereOptionen } from "./whisper";

/**
 * Whisper-Benchmark (Plan v4, 1.7, Test T2b): Welches Modell ist schnell genug und gut genug? Dasselbe Stück Aufnahme wird mit jedem Modell transkribiert und gemessen:
 * Zeit, Faktor zur Echtzeit und Abweichung vom Referenztext (Wortfehlerrate). Als Referenz dient ein Text, den ein Mensch korrigiert hat (`--referenz`), sonst das erste Modell der Liste.
 * Im zweiten Fall zeigt die Zahl nur, wie weit ein Modell vom ersten abweicht, nicht, wer richtig liegt.
 */

/** Wortfehlerrate: Editierabstand der Wortlisten (Einfügen, Löschen, Ersetzen) durch die Länge der Referenz. */
export function wortFehlerrate(referenz: string[], hypothese: string[]): { fehler: number; rate: number } {
  const n = referenz.length;
  const m = hypothese.length;
  if (n === 0) return { fehler: m, rate: m === 0 ? 0 : 1 };
  let vor = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const jetzt = [i];
    for (let j = 1; j <= m; j++) jetzt[j] = Math.min(vor[j]! + 1, jetzt[j - 1]! + 1, vor[j - 1]! + (referenz[i - 1] === hypothese[j - 1] ? 0 : 1));
    vor = jetzt;
  }
  return { fehler: vor[m]!, rate: vor[m]! / n };
}

/** Die normierten Wörter eines Textes (klein, ohne Satzzeichen), leere fallen weg. */
export const normierteWoerter = (text: string): string[] => rohWoerter(text).map(normiere).filter(Boolean);

export interface ModellLauf {
  modell: string;
  /** Sekunden Wanduhrzeit der Transkription. */
  sekunden: number;
  /** Sekunden Wanduhr je Sekunde Aufnahme (unter 1 ist schneller als Echtzeit). */
  faktor: number;
  woerter: number;
  /** Abweichung vom Referenztext in Prozent der Referenzwörter. */
  abweichung?: number;
  fehler?: string;
}

export interface BenchmarkErgebnis {
  datei: string;
  ab: number;
  sekunden: number;
  referenz: "text" | "erstes-modell";
  rechner: string;
  laeufe: ModellLauf[];
}

export interface BenchmarkOptionen {
  datei: string;
  modelle: string[];
  /** Beginn des Stücks in Sekunden und seine Länge. */
  ab?: number;
  sekunden?: number;
  /** Von einem Menschen korrigierter Text zum Stück. */
  referenzText?: string;
  sprache?: string;
  arbeitsDir?: string;
  /** Ersetzbar für Tests. */
  transkribiere?: (o: TranskribiereOptionen) => Promise<unknown>;
  schneide?: (datei: string, ab: number, sekunden: number, ziel: string) => Promise<void>;
  jetzt?: () => number;
}

export async function schneideProbe(datei: string, ab: number, sekunden: number, ziel: string): Promise<void> {
  const r = await lauf("ffmpeg", ["-v", "error", "-y", "-ss", String(ab), "-t", String(sekunden), "-i", datei, "-vn", "-ac", "1", "-ar", "16000", ziel]);
  if (r.code !== 0) throw new Error(`ffmpeg konnte das Stück nicht schneiden: ${r.stderr.trim().split("\n").pop()}`);
}

export const rechnerText = (): string => `${os.platform()} ${os.arch()}, ${os.cpus().length} Kerne (${os.cpus()[0]?.model ?? "?"}), ${(os.totalmem() / 2 ** 30).toFixed(0)} GB RAM`;

export async function messeWhisper(o: BenchmarkOptionen): Promise<BenchmarkErgebnis> {
  if (!o.modelle.length) throw new Error("Es fehlt mindestens ein Modell (--modelle large-v3,large-v3-turbo)");
  if (!fs.existsSync(o.datei)) throw new Error(`Datei fehlt: ${o.datei}`);
  const ab = o.ab ?? 0;
  const sekunden = o.sekunden ?? 60;
  if (!(sekunden > 0) || ab < 0) throw new Error("--sekunden muss positiv und --ab darf nicht negativ sein");
  const jetzt = o.jetzt ?? Date.now;
  const dir = fs.mkdtempSync(path.join(o.arbeitsDir ?? os.tmpdir(), "studio-whisper-bench-"));
  try {
    const probe = path.join(dir, "probe.wav");
    await (o.schneide ?? schneideProbe)(o.datei, ab, sekunden, probe);
    const laeufe: ModellLauf[] = [];
    const woerterNach = new Map<string, string[]>();
    for (const modell of o.modelle) {
      const ziel = path.join(dir, `${modell.replace(/[^A-Za-z0-9._-]/g, "_")}.json`);
      const t0 = jetzt();
      try {
        await (o.transkribiere ?? transkribiere)({ eingang: probe, ziel, modell, ...(o.sprache ? { sprache: o.sprache } : {}) });
      } catch (e) {
        laeufe.push({ modell, sekunden: (jetzt() - t0) / 1000, faktor: 0, woerter: 0, fehler: (e as Error).message });
        continue;
      }
      const s = (jetzt() - t0) / 1000;
      const woerter = normierteWoerter(leseTranskript(JSON.parse(fs.readFileSync(ziel, "utf8"))).map((x) => x.text).join(" "));
      woerterNach.set(modell, woerter);
      laeufe.push({ modell, sekunden: s, faktor: s / sekunden, woerter: woerter.length });
    }
    const referenz = o.referenzText !== undefined ? normierteWoerter(o.referenzText) : woerterNach.get(o.modelle[0]!);
    if (referenz) {
      for (const l of laeufe) {
        const w = woerterNach.get(l.modell);
        if (w) l.abweichung = Math.round(wortFehlerrate(referenz, w).rate * 1000) / 10;
      }
    }
    return { datei: o.datei, ab, sekunden, referenz: o.referenzText !== undefined ? "text" : "erstes-modell", rechner: rechnerText(), laeufe };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const f1 = (n: number): string => n.toFixed(1).replace(".", ",");

export function benchmarkZeilen(b: BenchmarkErgebnis): string[] {
  const z = [`Rechner: ${b.rechner}`, `Stück: ${f1(b.sekunden)} s ab ${f1(b.ab)} s aus ${path.basename(b.datei)}`, `Referenz: ${b.referenz === "text" ? "der Text, den du gegeben hast (Wortfehlerrate)" : `das erste Modell, ${b.laeufe[0]?.modell} (Abweichung von ihm, nicht von der Wahrheit)`}`, ""];
  const breit = Math.max(6, ...b.laeufe.map((l) => l.modell.length));
  z.push(`${"Modell".padEnd(breit)}  ${"Zeit".padStart(8)}  ${"Faktor".padStart(7)}  ${"Wörter".padStart(6)}  Abweichung`);
  for (const l of b.laeufe) {
    if (l.fehler) z.push(`${l.modell.padEnd(breit)}  FEHLER: ${l.fehler}`);
    else z.push(`${l.modell.padEnd(breit)}  ${(f1(l.sekunden) + " s").padStart(8)}  ${("×" + f1(l.faktor)).padStart(7)}  ${String(l.woerter).padStart(6)}  ${l.abweichung !== undefined ? `${f1(l.abweichung)} %` : "-"}`);
  }
  z.push("", "Faktor: Sekunden Rechenzeit je Sekunde Aufnahme (unter 1 ist schneller als Echtzeit).");
  return z;
}
