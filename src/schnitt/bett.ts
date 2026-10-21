import fs from "node:fs";
import path from "node:path";

/**
 * Musik und Soundeffekte für ein Video, selbst synthetisiert (Plan v2 Kap. 3.8). Alles entsteht aus Rechnung: keine Samples, keine Lizenz, kein Netz.
 *
 *  - Musik: ein ruhiges Klangbett in d-Moll (weicher Pad-Klang, Sub-Bass, leiser Puls, sparsame Glockentöne, Hall), 72 Schläge pro Minute.
 *  - SFX: Whoosh, Einschlag, Tick, Pop, Riser, Sweep (Rauschen und Sinus mit Hüllkurven).
 *  - Absenken: Die Musik geht unter die Stimme (Sidechain aus der Hüllkurve der Sprache) und kommt in den Pausen zurück.
 *
 * Grenzen: Das ist ein Klangbett, keine Komposition. Gemessen wird Pegel, Spitze und Lautheit, ob es gefällt, hört ein Mensch. Das Markenprofil Alperna setzt
 * `sfxDichte` auf 0: Die SFX sind hier ausdrücklich bestellt (Andrej, 21.10.) und bleiben leise.
 */

export const SAMPLERATE = 48000;

export type SfxArt = "whoosh" | "impact" | "tick" | "pop" | "riser" | "sweep";

export interface SfxEreignis {
  /** Zeit in Sekunden der Timeline. */
  t: number;
  art: SfxArt;
  /** Länge für Riser, Sweep und Whoosh. */
  dauer?: number;
  /** Pegel relativ zum Standard der Art, in dB. */
  pegelDb?: number;
  /** Richtung des Whoosh: «auf» steigt, «ab» fällt. */
  richtung?: "auf" | "ab";
}

export interface Stereo {
  l: Float32Array;
  r: Float32Array;
}

const lin = (db: number): number => Math.pow(10, db / 20);
const dB = (x: number): number => 20 * Math.log10(Math.max(1e-12, x));

/** Kleiner, deterministischer Zufallsgenerator (xorshift32). */
export function rng(seed: number): () => number {
  let x = seed | 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) / 4294967296) * 2 - 1;
  };
}

/* ---------- Filter ---------- */

/** Biquad nach dem «Audio EQ Cookbook», die Koeffizienten lassen sich im Lauf ändern. */
class Biquad {
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;
  constructor(private readonly sr: number) {}
  setze(art: "lp" | "hp" | "bp", f: number, q: number): void {
    const fc = Math.min(f, this.sr * 0.45);
    const w = (2 * Math.PI * fc) / this.sr;
    const cos = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    let b0: number, b1: number, b2: number;
    if (art === "lp") {
      b0 = (1 - cos) / 2;
      b1 = 1 - cos;
      b2 = (1 - cos) / 2;
    } else if (art === "hp") {
      b0 = (1 + cos) / 2;
      b1 = -(1 + cos);
      b2 = (1 + cos) / 2;
    } else {
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
    }
    const a0 = 1 + alpha;
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = (-2 * cos) / a0;
    this.a2 = (1 - alpha) / a0;
  }
  rechne(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/** Hall nach Schroeder: vier gedämpfte Kammfilter, zwei Allpässe. Gibt nur den nassen Anteil zurück. */
function hall(eingang: Float32Array, sr: number, abklingzeit = 2.2, daempfung = 0.35, versatz = 0): Float32Array {
  const laengen = [1557, 1617, 1491, 1422].map((n) => Math.round(((n + versatz) * sr) / 44100));
  const rueck = laengen.map((n) => Math.pow(10, (-3 * n) / sr / abklingzeit));
  const aus = new Float32Array(eingang.length);
  const kamm = laengen.map((n) => ({ puffer: new Float32Array(n), i: 0, tief: 0 }));
  const allpass = [225, 556].map((n) => ({ puffer: new Float32Array(Math.round((n * sr) / 44100)), i: 0 }));
  for (let n = 0; n < eingang.length; n++) {
    const x = eingang[n]!;
    let s = 0;
    kamm.forEach((k, j) => {
      const y = k.puffer[k.i]!;
      k.tief = y * (1 - daempfung) + k.tief * daempfung;
      k.puffer[k.i] = x + k.tief * rueck[j]!;
      k.i = (k.i + 1) % k.puffer.length;
      s += y;
    });
    s *= 0.25;
    for (const a of allpass) {
      const y = a.puffer[a.i]!;
      const neu = s + 0.5 * y;
      a.puffer[a.i] = neu;
      s = y - 0.5 * neu;
      a.i = (a.i + 1) % a.puffer.length;
    }
    aus[n] = s;
  }
  return aus;
}

/* ---------- Musik ---------- */

const midi = (n: number): number => 440 * Math.pow(2, (n - 69) / 12);

/** Akkorde in d-Moll: Dm9, B♭maj7, Fmaj7, Gm7 → A (Dominante), Dm zum Schluss. MIDI-Nummern, tief zu hoch. */
const AKKORDE: { ab: number; noten: number[]; wurzel: number }[] = [
  { ab: 0, noten: [50, 57, 62, 65, 69, 72], wurzel: 38 },
  { ab: 7.5, noten: [46, 58, 62, 65, 69], wurzel: 34 },
  { ab: 15, noten: [53, 57, 60, 64, 69], wurzel: 41 },
  { ab: 22.5, noten: [43, 55, 58, 62, 65], wurzel: 43 },
  { ab: 27.5, noten: [45, 57, 61, 64, 69], wurzel: 45 },
  { ab: 31, noten: [50, 57, 62, 65, 69, 74], wurzel: 38 },
];

/** Hüllkurve eines Akkords: weich ein, weich aus, die Akkorde gehen ineinander über. */
function akkordHuelle(t: number, von: number, bis: number, an = 1.6, ab = 2.4): number {
  if (t < von || t > bis + ab) return 0;
  if (t < von + an) return Math.pow((t - von) / an, 1.5);
  if (t <= bis) return 1;
  return Math.pow(1 - (t - bis) / ab, 1.5);
}

export function synthMusik(dauer: number, sr = SAMPLERATE, seed = 7): Stereo {
  const n = Math.round(dauer * sr);
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  const rand = rng(seed);
  const tpiSr = (2 * Math.PI) / sr;

  // 1. Pad: je Note zwei leicht verstimmte Stimmen mit sechs Obertönen (weicher Sägezahn), langsames Vibrato
  const padL = new Float32Array(n);
  const padR = new Float32Array(n);
  AKKORDE.forEach((ak, ai) => {
    const bis = ai + 1 < AKKORDE.length ? AKKORDE[ai + 1]!.ab : dauer + 2;
    const i0 = Math.max(0, Math.floor((ak.ab - 0.01) * sr));
    const i1 = Math.min(n, Math.floor((bis + 2.4) * sr));
    ak.noten.forEach((note, ni) => {
      const f0 = midi(note);
      const phase = [rand() * Math.PI, rand() * Math.PI];
      const pan = ((ni % 2 === 0 ? -1 : 1) * (0.25 + 0.5 * ((ni * 37) % 5) / 5)) * 0.8;
      const gl = Math.cos(((pan + 1) * Math.PI) / 4);
      const gr = Math.sin(((pan + 1) * Math.PI) / 4);
      const lautstaerke = 0.05 / Math.sqrt(ak.noten.length / 5);
      for (let i = i0; i < i1; i++) {
        const t = i / sr;
        const h = akkordHuelle(t, ak.ab, bis);
        if (h <= 0) continue;
        const vib = 1 + 0.0015 * Math.sin(2 * Math.PI * 0.23 * t + ni);
        let s = 0;
        for (let v = 0; v < 2; v++) {
          const f = f0 * vib * (v === 0 ? 0.9985 : 1.0015);
          for (let o = 1; o <= 6; o++) s += Math.sin(tpiSr * f * o * i + phase[v]! * o) / Math.pow(o, 1.3);
        }
        const x = s * lautstaerke * h;
        padL[i] = padL[i]! + x * gl;
        padR[i] = padR[i]! + x * gr;
      }
    });
  });
  // Tiefpass mit langsam öffnender Grenzfrequenz (dunkel zum Anfang, heller bis zur Mitte, am Schluss wieder zu)
  const lpL = new Biquad(sr);
  const lpR = new Biquad(sr);
  const BLOCK = 256;
  for (let i = 0; i < n; i++) {
    if (i % BLOCK === 0) {
      const t = i / sr;
      const offen = 0.5 - 0.5 * Math.cos((2 * Math.PI * Math.min(1, t / dauer)) * 1.0);
      const fc = 650 + 1500 * offen;
      lpL.setze("lp", fc, 0.6);
      lpR.setze("lp", fc, 0.6);
    }
    l[i] = lpL.rechne(padL[i]!);
    r[i] = lpR.rechne(padR[i]!);
  }

  // 2. Sub-Bass: Sinus auf dem Grundton des Akkords
  AKKORDE.forEach((ak, ai) => {
    const bis = ai + 1 < AKKORDE.length ? AKKORDE[ai + 1]!.ab : dauer + 2;
    const f = midi(ak.wurzel);
    const i0 = Math.max(0, Math.floor(ak.ab * sr));
    const i1 = Math.min(n, Math.floor((bis + 2.4) * sr));
    for (let i = i0; i < i1; i++) {
      const t = i / sr;
      const x = Math.sin(tpiSr * f * i) * 0.05 * akkordHuelle(t, ak.ab, bis, 1.2, 2.0);
      l[i] = l[i]! + x;
      r[i] = r[i]! + x;
    }
  });

  // 3. Puls: weicher Herzschlag auf jedem zweiten Schlag (72 bpm), ab 1,7 s, nimmt bis zur Mitte zu
  const schlag = 60 / 72;
  for (let k = 2; k * schlag < dauer; k += 2) {
    const t0 = k * schlag;
    const staerke = 0.5 + 0.5 * Math.sin(Math.PI * Math.min(1, t0 / dauer));
    const i0 = Math.floor(t0 * sr);
    const len = Math.min(n - i0, Math.floor(0.55 * sr));
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const f = 42 + 38 * Math.exp(-t * 22);
      const x = Math.sin(2 * Math.PI * (42 * t + (38 / 22) * (1 - Math.exp(-t * 22)))) * Math.exp(-t * 7.5) * 0.1 * staerke;
      void f;
      l[i0 + i] = l[i0 + i]! + x;
      r[i0 + i] = r[i0 + i]! + x;
    }
  }

  // 4. Glockentöne: sparsam, aus dem Akkord, Sinus mit Oktave, rechts und links im Wechsel
  const glocken = new Float32Array(n);
  const glockenR = new Float32Array(n);
  const achtel = schlag / 2;
  for (let k = 6; k * achtel < dauer - 1; k++) {
    if ((k * 7919) % 5 > 1) continue;
    const t0 = k * achtel;
    const ak = [...AKKORDE].reverse().find((a) => a.ab <= t0) ?? AKKORDE[0]!;
    const note = ak.noten[(k * 3) % ak.noten.length]! + 24;
    const f = midi(note);
    const i0 = Math.floor(t0 * sr);
    const len = Math.min(n - i0, Math.floor(1.6 * sr));
    const links = k % 2 === 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const x = (Math.sin(tpiSr * f * i) + 0.35 * Math.sin(tpiSr * f * 2.01 * i)) * Math.exp(-t * 3.2) * 0.022 * Math.min(1, t * 400);
      const ziel = links ? glocken : glockenR;
      ziel[i0 + i] = ziel[i0 + i]! + x;
    }
  }

  // 5. Hall über Pad und Glocken, links und rechts leicht versetzt
  const mischL = new Float32Array(n);
  const mischR = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    mischL[i] = l[i]! * 0.7 + glocken[i]!;
    mischR[i] = r[i]! * 0.7 + glockenR[i]!;
  }
  const hl = hall(mischL, sr, 2.6, 0.4, 0);
  const hr = hall(mischR, sr, 2.6, 0.4, 23);
  for (let i = 0; i < n; i++) {
    l[i] = l[i]! + glocken[i]! + hl[i]! * 0.9;
    r[i] = r[i]! + glockenR[i]! + hr[i]! * 0.9;
  }

  // 6. Tiefen unter 45 Hz weg (Platz für die Stimme und den Lautsprecher), Ein- und Ausblenden, weiche Sättigung
  const hpL = new Biquad(sr);
  const hpR = new Biquad(sr);
  hpL.setze("hp", 45, 0.7);
  hpR.setze("hp", 45, 0.7);
  for (let i = 0; i < n; i++) {
    l[i] = hpL.rechne(l[i]!);
    r[i] = hpR.rechne(r[i]!);
  }
  const ein = Math.floor(1.2 * sr);
  const aus = Math.floor(2.5 * sr);
  for (let i = 0; i < n; i++) {
    const g = Math.min(1, i / ein, (n - i) / aus);
    const w = g * g * (3 - 2 * g);
    l[i] = Math.tanh(l[i]! * 1.4) * w;
    r[i] = Math.tanh(r[i]! * 1.4) * w;
  }
  return { l, r };
}

/* ---------- SFX ---------- */

/** Rauschen durch einen Bandpass, dessen Mitte von `f0` nach `f1` läuft. */
function rauschenMitSweep(dauer: number, f0: number, f1: number, q: number, sr: number, seed: number, huelle: (p: number) => number): Float32Array {
  const n = Math.round(dauer * sr);
  const aus = new Float32Array(n);
  const rand = rng(seed);
  const bp = new Biquad(sr);
  for (let i = 0; i < n; i++) {
    const p = i / n;
    if (i % 64 === 0) bp.setze("bp", f0 * Math.pow(f1 / f0, p), q);
    aus[i] = bp.rechne(rand()) * huelle(p) * 3;
  }
  return aus;
}

const glocke = (p: number): number => Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, p))), 1.6);

/** Eine SFX-Art als Stereo-Signal mit Standardpegel (Spitze etwa −12 dBFS). */
export function synthSfx(e: SfxEreignis, sr = SAMPLERATE): Stereo {
  const g = lin(e.pegelDb ?? 0);
  const mono = (x: Float32Array, pan = 0): Stereo => {
    const l = new Float32Array(x.length);
    const r = new Float32Array(x.length);
    const gl = Math.cos(((pan + 1) * Math.PI) / 4) * g;
    const gr = Math.sin(((pan + 1) * Math.PI) / 4) * g;
    for (let i = 0; i < x.length; i++) {
      l[i] = x[i]! * gl;
      r[i] = x[i]! * gr;
    }
    return { l, r };
  };
  switch (e.art) {
    case "whoosh": {
      const d = e.dauer ?? 0.7;
      const auf = (e.richtung ?? "auf") === "auf";
      const x = rauschenMitSweep(d, auf ? 350 : 4200, auf ? 4200 : 350, 1.1, sr, 11, glocke);
      for (let i = 0; i < x.length; i++) x[i] = x[i]! * 0.18;
      // Schwenk von links nach rechts
      const l = new Float32Array(x.length);
      const r = new Float32Array(x.length);
      for (let i = 0; i < x.length; i++) {
        const pan = -0.8 + (1.6 * i) / x.length;
        l[i] = x[i]! * Math.cos(((pan + 1) * Math.PI) / 4) * g;
        r[i] = x[i]! * Math.sin(((pan + 1) * Math.PI) / 4) * g;
      }
      return { l, r };
    }
    case "impact": {
      const n = Math.round(1.4 * sr);
      const x = new Float32Array(n);
      const rand = rng(23);
      const lp = new Biquad(sr);
      lp.setze("lp", 1800, 0.7);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const phase = 2 * Math.PI * (38 * t + (90 / 16) * (1 - Math.exp(-t * 16)));
        x[i] = Math.sin(phase) * Math.exp(-t * 4.2) * 0.5 + lp.rechne(rand()) * Math.exp(-t * 30) * 0.22;
      }
      const w = hall(x, sr, 1.4, 0.5);
      for (let i = 0; i < n; i++) x[i] = x[i]! + w[i]! * 0.5;
      return mono(x);
    }
    case "tick": {
      const n = Math.round(0.12 * sr);
      const x = new Float32Array(n);
      const rand = rng(31);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        x[i] = (Math.sin(2 * Math.PI * 2400 * t) * Math.exp(-t * 90) * 0.28 + rand() * Math.exp(-t * 400) * 0.08) * Math.min(1, t * 2000);
      }
      return mono(x);
    }
    case "pop": {
      const n = Math.round(0.22 * sr);
      const x = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const phase = 2 * Math.PI * (330 * t + 380 * (1 - Math.exp(-t * 40)) / 40);
        x[i] = Math.sin(phase) * Math.exp(-t * 26) * 0.34 * Math.min(1, t * 1500);
      }
      return mono(x);
    }
    case "riser": {
      const d = e.dauer ?? 1.2;
      const x = rauschenMitSweep(d, 300, 6500, 1.4, sr, 41, (p) => Math.pow(p, 2.2) * (p > 0.97 ? Math.max(0, (1 - p) / 0.03) : 1));
      for (let i = 0; i < x.length; i++) x[i] = x[i]! * 0.16;
      return mono(x);
    }
    case "sweep": {
      const d = e.dauer ?? 1.0;
      const n = Math.round(d * sr);
      const x = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const p = i / n;
        const f = 420 + 880 * p * p;
        x[i] = Math.sin(2 * Math.PI * ((420 * (i / sr)) + (880 * d * Math.pow(p, 3)) / 3)) * glocke(p) * 0.2;
        void f;
      }
      return mono(x);
    }
  }
}

/** Alle Ereignisse an ihren Zeiten in ein Stereo-Signal der Länge `dauer`. */
export function synthSfxSpur(ereignisse: SfxEreignis[], dauer: number, sr = SAMPLERATE): Stereo {
  const n = Math.round(dauer * sr);
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  for (const e of ereignisse) {
    const s = synthSfx(e, sr);
    const i0 = Math.round(e.t * sr);
    for (let i = 0; i < s.l.length; i++) {
      const j = i0 + i;
      if (j < 0 || j >= n) continue;
      l[j] = l[j]! + s.l[i]!;
      r[j] = r[j]! + s.r[i]!;
    }
  }
  return { l, r };
}

/* ---------- Absenken unter die Stimme ---------- */

/**
 * Verstärkung (0 bis 1), die die Musik unter der Sprache absenkt: schnell hinein (`angriff`), langsam zurück (`freigabe`).
 * `sprache` ist die Sprache der Timeline als Mono-Signal, `tiefeDb` das Mass des Absenkens (positiv).
 */
export function duckKurve(sprache: Float32Array, sr: number, opt: { tiefeDb?: number; schwelleDb?: number; angriff?: number; freigabe?: number } = {}): Float32Array {
  const { tiefeDb = 10, schwelleDb = -42, angriff = 0.06, freigabe = 0.45 } = opt;
  const fenster = Math.round(0.025 * sr);
  const n = sprache.length;
  const g = new Float32Array(n);
  const aA = Math.exp(-1 / (angriff * sr));
  const aF = Math.exp(-1 / (freigabe * sr));
  let hue = 0;
  let glatt = 0;
  const tief = lin(-tiefeDb);
  let summe = 0;
  const quadrate = new Float32Array(fenster);
  for (let i = 0; i < n; i++) {
    const q = sprache[i]! * sprache[i]!;
    summe += q - quadrate[i % fenster]!;
    quadrate[i % fenster] = q;
    const rms = Math.sqrt(Math.max(0, summe) / fenster);
    const stimme = dB(rms) > schwelleDb ? 1 : 0;
    hue = stimme > hue ? hue * aA + stimme * (1 - aA) : hue * aF + stimme * (1 - aF);
    glatt = hue;
    g[i] = 1 - (1 - tief) * Math.min(1, glatt * 1.15);
  }
  return g;
}

/* ---------- Mischen und Schreiben ---------- */

export interface Bett {
  musik: Stereo;
  sfx: Stereo;
  /** Musik abgesenkt unter die Stimme plus SFX. */
  bett: Stereo;
}

export function mischeBett(o: { dauer: number; sfx: SfxEreignis[]; sprache?: Float32Array; sr?: number; musikPegelDb?: number }): Bett {
  const sr = o.sr ?? SAMPLERATE;
  const musik = synthMusik(o.dauer, sr);
  const sg = lin(o.musikPegelDb ?? -6);
  for (let i = 0; i < musik.l.length; i++) {
    musik.l[i] = musik.l[i]! * sg;
    musik.r[i] = musik.r[i]! * sg;
  }
  const sfx = synthSfxSpur(o.sfx, o.dauer, sr);
  const n = musik.l.length;
  const bl = new Float32Array(n);
  const br = new Float32Array(n);
  const duck = o.sprache ? duckKurve(o.sprache, sr) : undefined;
  for (let i = 0; i < n; i++) {
    const d = duck ? duck[Math.min(i, duck.length - 1)]! : 1;
    bl[i] = musik.l[i]! * d + sfx.l[i]!;
    br[i] = musik.r[i]! * d + sfx.r[i]!;
  }
  return { musik, sfx, bett: { l: bl, r: br } };
}

export function spitzeDb(s: Stereo): number {
  let m = 0;
  for (let i = 0; i < s.l.length; i++) m = Math.max(m, Math.abs(s.l[i]!), Math.abs(s.r[i]!));
  return dB(m);
}

export function rmsDb(s: Stereo): number {
  let a = 0;
  for (let i = 0; i < s.l.length; i++) a += s.l[i]! * s.l[i]! + s.r[i]! * s.r[i]!;
  return dB(Math.sqrt(a / (2 * s.l.length)));
}

/** WAV, Stereo, 24 Bit PCM. */
export function wavBytes(s: Stereo, sr = SAMPLERATE): Buffer {
  const n = s.l.length;
  const daten = Buffer.alloc(n * 6);
  for (let i = 0; i < n; i++) {
    for (const [k, x] of [s.l[i]!, s.r[i]!].entries()) {
      const v = Math.round(Math.max(-1, Math.min(1, x)) * 8388607);
      daten.writeIntLE(v, i * 6 + k * 3, 3);
    }
  }
  const kopf = Buffer.alloc(44);
  kopf.write("RIFF", 0);
  kopf.writeUInt32LE(36 + daten.length, 4);
  kopf.write("WAVEfmt ", 8);
  kopf.writeUInt32LE(16, 16);
  kopf.writeUInt16LE(1, 20);
  kopf.writeUInt16LE(2, 22);
  kopf.writeUInt32LE(sr, 24);
  kopf.writeUInt32LE(sr * 6, 28);
  kopf.writeUInt16LE(6, 32);
  kopf.writeUInt16LE(24, 34);
  kopf.write("data", 36);
  kopf.writeUInt32LE(daten.length, 40);
  return Buffer.concat([kopf, daten]);
}

export function schreibeWav(datei: string, s: Stereo, sr = SAMPLERATE): void {
  fs.mkdirSync(path.dirname(datei), { recursive: true });
  fs.writeFileSync(datei, wavBytes(s, sr));
}

/** Verstärkt ein Stereo-Signal um `db`. */
export function verstaerke(s: Stereo, db: number): void {
  const g = lin(db);
  for (let i = 0; i < s.l.length; i++) {
    s.l[i] = s.l[i]! * g;
    s.r[i] = s.r[i]! * g;
  }
}
