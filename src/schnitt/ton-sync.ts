import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { lauf } from "../presets/messen";

/**
 * Getrennter Ton (Plan v4): Videos und Tonaufnahmen (externes Mikrofon, Recorder) liegen oft in getrennten Dateien. Das System erkennt sie und legt sie aufeinander.
 * Verfahren: Von der Kameraspur und der Tonaufnahme wird die Lautstärkehüllkurve gebildet (100 Werte je Sekunde). Wo beide am besten übereinstimmen, liegt der Versatz.
 * Die Hüllkurve verträgt unterschiedliche Mikrofone, Pegel und Raumklang, die rohe Wellenform nicht. Genauigkeit: 10 Millisekunden, ein Bild bei 25p sind 40.
 * Ohne Tonspur in der Kamera gibt es nichts zu vergleichen: Dann hilft nur ein von Hand angegebener Versatz.
 *
 * Versatz: Zeit in der Tonaufnahme = Zeit im Video + Versatz. Beginnt der Recorder 5 s vor der Kamera, ist der Versatz +5.
 */

export const TON_ENDUNGEN = [".wav", ".aif", ".aiff", ".m4a", ".mp3", ".flac", ".aac"];
/** Hüllkurven-Werte je Sekunde. */
export const HUELL_RATE = 100;

export interface Versatz {
  /** Zeit in der Tonaufnahme = Zeit im Video + versatz, in Sekunden. */
  versatz: number;
  /** Korrelationskoeffizient der Hüllkurven am besten Versatz (−1 bis 1, bei gleichem Ton nahe 1). */
  wert: number;
  sicherheit: "hoch" | "mittel" | "niedrig";
  /** Anteil des Videos, den die Tonaufnahme am besten Versatz abdeckt (0 bis 1). */
  ueberlappung: number;
}

/** Die Tondateien eines Ordners (nicht rekursiv, ohne versteckte Dateien), natürlich sortiert. */
export function listeTonDateien(dir: string): string[] {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
  return fs
    .readdirSync(dir)
    .filter((n) => !n.startsWith(".") && TON_ENDUNGEN.includes(path.extname(n).toLowerCase()) && fs.statSync(path.join(dir, n)).isFile())
    .sort((x, y) => x.localeCompare(y, "de", { numeric: true }));
}

/* ---------- Hüllkurve ---------- */

/** Hüllkurve aus Samples (Mono, 8 kHz): log(RMS) je 10 Millisekunden, ohne Mittelwert. */
export function huellkurve(samples: Int16Array, rate = 8000): Float64Array {
  const rahmen = Math.round(rate / HUELL_RATE);
  const n = Math.floor(samples.length / rahmen);
  const aus = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < rahmen; j++) {
      const x = samples[i * rahmen + j]! / 32768;
      s += x * x;
    }
    aus[i] = Math.log(1e-5 + Math.sqrt(s / rahmen));
  }
  let mittel = 0;
  for (const x of aus) mittel += x;
  mittel /= Math.max(1, n);
  for (let i = 0; i < n; i++) aus[i]! -= mittel;
  return aus;
}

/** Hat die Datei eine Tonspur? (ffprobe) */
export async function hatTonspur(datei: string): Promise<boolean> {
  const r = await lauf("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", datei]);
  if (r.code !== 0) throw new Error(`ffprobe schlug fehl: ${r.stderr.trim().split("\n").pop()}`);
  return r.stdout.trim().length > 0;
}

/** Dekodiert die Tonspur einer Datei mit ffmpeg zu Mono, 8 kHz, 16 Bit. Eine Datei ohne Tonspur ergibt ein leeres Feld. */
export async function dekodiereMono(datei: string): Promise<Int16Array> {
  if (!(await hatTonspur(datei))) return new Int16Array(0);
  return new Promise((resolve, reject) => {
    const c = spawn("ffmpeg", ["-v", "error", "-i", datei, "-vn", "-ac", "1", "-ar", "8000", "-f", "s16le", "-"], { stdio: ["ignore", "pipe", "pipe"] });
    const teile: Buffer[] = [];
    let fehler = "";
    c.stdout.on("data", (d: Buffer) => teile.push(d));
    c.stderr.on("data", (d: Buffer) => (fehler += d.toString()));
    c.on("error", (e) => reject(new Error(`ffmpeg lässt sich nicht starten: ${e.message}`)));
    c.on("close", (code) => {
      const roh = Buffer.concat(teile);
      if (code !== 0 && roh.length === 0) return reject(new Error(`ffmpeg schlug fehl: ${fehler.trim().split("\n").pop()}`));
      const n = Math.floor(roh.length / 2);
      const aus = new Int16Array(n);
      for (let i = 0; i < n; i++) aus[i] = roh.readInt16LE(i * 2);
      resolve(aus);
    });
  });
}

/* ---------- Kreuzkorrelation über FFT ---------- */

/** In-place Radix-2-FFT. `re` und `im` haben eine Zweierpotenz als Länge. */
export function fft(re: Float64Array, im: Float64Array, invers = false): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const w = ((invers ? -2 : 2) * Math.PI) / len;
    const wr = Math.cos(w);
    const wi = Math.sin(w);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = i + j;
        const b = a + len / 2;
        const tr = re[b]! * cr - im[b]! * ci;
        const ti = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - tr;
        im[b] = im[a]! - ti;
        re[a]! += tr;
        im[a]! += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
  if (invers) for (let i = 0; i < n; i++) {
    re[i]! /= n;
    im[i]! /= n;
  }
}

/**
 * Kreuzkorrelation c[lag] = Σ x[t] · y[t + lag] für alle Verschiebungen von −(x.length−1) bis y.length−1.
 * Der Index `k` des Ergebnisses gehört zur Verschiebung `k − (x.length − 1)`.
 */
export function kreuzkorrelation(x: Float64Array, y: Float64Array): Float64Array {
  const laenge = x.length + y.length - 1;
  let n = 1;
  while (n < laenge) n <<= 1;
  const xr = new Float64Array(n);
  const xi = new Float64Array(n);
  const yr = new Float64Array(n);
  const yi = new Float64Array(n);
  xr.set(x);
  yr.set(y);
  fft(xr, xi);
  fft(yr, yi);
  // conj(X) · Y
  for (let i = 0; i < n; i++) {
    const r = xr[i]! * yr[i]! + xi[i]! * yi[i]!;
    const m = xr[i]! * yi[i]! - xi[i]! * yr[i]!;
    xr[i] = r;
    xi[i] = m;
  }
  fft(xr, xi, true);
  // zirkuläre Lage ordnen: Verschiebungen −(nx−1) .. ny−1
  const aus = new Float64Array(laenge);
  for (let k = 0; k < laenge; k++) {
    const lag = k - (x.length - 1);
    aus[k] = xr[(lag + n) % n]!;
  }
  return aus;
}

/**
 * Findet, wo die Hüllkurve des Videos (`video`) in der der Tonaufnahme (`ton`) liegt: der Versatz mit dem höchsten Korrelationskoeffizienten (normiert, über die jeweils
 * gemeinsame Zeit). Die Aufnahme muss mindestens 80 Prozent des Videos abdecken: Bei weniger Gemeinsamem gleichen sich auch fremde Aufnahmen zufällig.
 * «hoch» heisst Koeffizient ab 0,75 und ein zweitbester Versatz (mehr als eine Sekunde entfernt) mit mindestens 0,2 Abstand, «mittel» ab 0,55 und 0,15 Abstand.
 * Die Schwellen sind Annahmen und gehören an echtem Material geprüft (Test T10).
 */
export function findeVersatzAusHuellkurven(video: Float64Array, ton: Float64Array): Versatz | undefined {
  const nv = video.length;
  const ny = ton.length;
  if (nv < HUELL_RATE * 3 || ny < HUELL_RATE * 3) return undefined;
  const c = kreuzkorrelation(video, ton);
  const vor = (a: Float64Array): { s: Float64Array; q: Float64Array } => {
    const s = new Float64Array(a.length + 1);
    const q = new Float64Array(a.length + 1);
    for (let i = 0; i < a.length; i++) {
      s[i + 1] = s[i]! + a[i]!;
      q[i + 1] = q[i]! + a[i]! * a[i]!;
    }
    return { s, q };
  };
  const px = vor(video);
  const py = vor(ton);
  const mindest = Math.ceil(0.8 * nv);
  const werte: { lag: number; ncc: number; n: number }[] = [];
  for (let k = 0; k < c.length; k++) {
    const lag = k - (nv - 1);
    const t0 = Math.max(0, -lag);
    const t1 = Math.min(nv, ny - lag);
    const n = t1 - t0;
    if (n < mindest) continue;
    const sx = px.s[t1]! - px.s[t0]!;
    const sxx = px.q[t1]! - px.q[t0]!;
    const sy = py.s[t1 + lag]! - py.s[t0 + lag]!;
    const syy = py.q[t1 + lag]! - py.q[t0 + lag]!;
    const den = Math.sqrt(Math.max(1e-12, (sxx - (sx * sx) / n) * (syy - (sy * sy) / n)));
    werte.push({ lag, ncc: (c[k]! - (sx * sy) / n) / den, n });
  }
  if (!werte.length) return undefined;
  const beste = werte.reduce((a, b) => (b.ncc > a.ncc ? b : a));
  const zweite = werte.filter((w) => Math.abs(w.lag - beste.lag) > HUELL_RATE).reduce((m, w) => Math.max(m, w.ncc), -1);
  const abstand = beste.ncc - Math.max(zweite, -1);
  const sicherheit = beste.ncc >= 0.75 && abstand >= 0.2 ? "hoch" : beste.ncc >= 0.55 && abstand >= 0.15 ? "mittel" : "niedrig";
  return { versatz: Math.round(beste.lag) / HUELL_RATE, wert: Math.round(beste.ncc * 100) / 100, sicherheit, ueberlappung: Math.round((beste.n / nv) * 100) / 100 };
}

/**
 * Ein Messer mit Gedächtnis: Hüllkurven jeder Datei werden nur einmal berechnet, auch wenn mehrere Videos gegen mehrere Aufnahmen gemessen werden
 * (3 Videos gegen 2 Aufnahmen dekodieren 5 Dateien, nicht 12).
 */
export function messerMitCache(): (videoDatei: string, tonDatei: string) => Promise<Versatz | undefined> {
  const gemerkt = new Map<string, Promise<Float64Array | undefined>>();
  const huell = (datei: string): Promise<Float64Array | undefined> => {
    let p = gemerkt.get(datei);
    if (!p) {
      p = dekodiereMono(datei).then((s) => (s.length ? huellkurve(s) : undefined));
      gemerkt.set(datei, p);
    }
    return p;
  };
  return async (v, t) => {
    const [hv, ht] = await Promise.all([huell(v), huell(t)]);
    return hv && ht ? findeVersatzAusHuellkurven(hv, ht) : undefined;
  };
}

/**
 * ffmpeg-Argumente für das Stück einer Tonaufnahme, das zu einem Video gehört: Mono, 16 kHz, genau so lang wie das Video, und die Zeit 0 der Datei ist die Zeit 0 des Videos.
 * Beginnt die Aufnahme erst nach dem Video (negativer Versatz), steht vorne Stille. So rechnen Whisper, Stille-Messung und Pegel mit den Zeiten des Videos und nur auf dem Stück, das gebraucht wird,
 * nicht auf einer Aufnahme von einer Stunde.
 */
export function fensterArgs(ton: string, versatz: number, dauer: number, ziel: string): string[] {
  const vor = Math.max(0, versatz);
  const luft = Math.max(0, -versatz);
  const zahl = (x: number): string => String(Math.round(x * 1000) / 1000);
  return ["-y", "-v", "error", "-ss", zahl(vor), "-i", ton, ...(luft > 0 ? ["-af", `adelay=${Math.round(luft * 1000)}:all=1`] : []), "-t", zahl(dauer), "-ac", "1", "-ar", "16000", ziel];
}

export async function schneideTonFenster(ton: string, versatz: number, dauer: number, ziel: string): Promise<void> {
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  const r = await lauf("ffmpeg", fensterArgs(ton, versatz, dauer, ziel));
  if (r.code !== 0) throw new Error(`ffmpeg konnte das Stück der Tonaufnahme nicht schneiden: ${r.stderr.trim().split("\n").pop()}`);
}

/** Misst den Versatz zwischen einer Videodatei (Kameraton) und einer Tonaufnahme. `undefined`, wenn eine der beiden nicht genug Ton hat. */
export async function findeVersatz(videoDatei: string, tonDatei: string): Promise<Versatz | undefined> {
  const [v, t] = await Promise.all([dekodiereMono(videoDatei), dekodiereMono(tonDatei)]);
  if (!v.length || !t.length) return undefined;
  return findeVersatzAusHuellkurven(huellkurve(v), huellkurve(t));
}

/* ---------- Paare ---------- */

export interface TonPaar {
  video: string;
  ton: string;
  versatz: Versatz;
}

/**
 * Ordnet Tonaufnahmen den Videos zu: Für jedes Video die Aufnahme mit dem besten Treffer, und zwar nur, wenn er mindestens «mittel» sicher ist.
 * Eine Aufnahme darf zu mehreren Videos passen (eine lange Aufnahme über mehrere Clips). Unsichere Treffer werden gemeldet, aber nicht benutzt:
 * Ein falsch gelegter Ton ist schlimmer als keiner. `messe` ist ersetzbar für Tests.
 */
export async function paareTon(videos: string[], tonDateien: string[], messe: (v: string, t: string) => Promise<Versatz | undefined> = findeVersatz): Promise<{ paare: TonPaar[]; unsicher: { video: string; ton: string; versatz: Versatz }[]; ohneTreffer: string[] }> {
  const paare: TonPaar[] = [];
  const unsicher: { video: string; ton: string; versatz: Versatz }[] = [];
  const ohneTreffer: string[] = [];
  for (const v of videos) {
    const treffer: { ton: string; versatz: Versatz }[] = [];
    for (const t of tonDateien) {
      const r = await messe(v, t);
      if (r) treffer.push({ ton: t, versatz: r });
    }
    treffer.sort((a, b) => b.versatz.wert - a.versatz.wert);
    const erster = treffer[0];
    if (!erster) {
      ohneTreffer.push(v);
      continue;
    }
    if (erster.versatz.sicherheit === "niedrig") unsicher.push({ video: v, ...erster });
    else paare.push({ video: v, ton: erster.ton, versatz: erster.versatz });
  }
  return { paare, unsicher, ohneTreffer };
}
