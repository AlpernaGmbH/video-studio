/**
 * Colorgrading als 3D-LUT (Plan v2 Kap. 3.9, Markenprofil «look»): Aus Panasonic V-Log (V-Gamut) wird Rec.709, darauf liegt der Look der Marke Alperna
 * («Cine-Look: kühl, kontraststark, leicht entsättigt»). Das Ergebnis ist eine `.cube`-Datei mit 33 Punkten je Achse, die ffmpeg (`lut3d`, Vorschau) und DaVinci Resolve lesen.
 *
 * Annahmen, die ein Mensch am Bild prüft:
 *  - Das Material ist V-Log. Gemessen am Reel c-9001: weisse Wand (90 % Reflexion) bei Code 0,59, Hemd bei 0,22 bis 0,30, Haut bei 0,45 bis 0,51, genau die Werte
 *    von V-Log (90 % Weiss: 0,588). Bei einem anderen Profil (S-Log, Cinelike D) stimmt die Umrechnung nicht.
 *  - Die V-Gamut-Primärvalenzen stammen aus der Panasonic-Beschreibung (R 0,730/0,280, G 0,165/0,840, B 0,100/−0,030). Die Matrix zu Rec.709 wird daraus gerechnet, sie ist nicht abgeschrieben.
 *  - Der Look (Kontrast, Entsättigung, kühle Schatten, leicht warme Lichter) ist eine Annahme. Hauttöne kalibriert ein Mensch am Vectorscope (Markenprofil).
 *
 * Die Funktion ist deterministisch und hat keine Abhängigkeiten.
 */

export type Rgb = [number, number, number];
type Matrix = [Rgb, Rgb, Rgb];

/* ---------- V-Log ---------- */

/** V-Log-Codewert (0 bis 1) zu linearem Licht (Reflexion, 1 = 100 %). Panasonic V-Log/V-Gamut Reference Manual. */
export function vlogZuLinear(v: number): number {
  if (v < 0.181) return (v - 0.125) / 5.6;
  return Math.pow(10, (v - 0.598206) / 0.241514) - 0.00873;
}

/** Umkehrung: lineares Licht zu V-Log-Code. */
export function linearZuVlog(x: number): number {
  if (x < 0.01) return 5.6 * x + 0.125;
  return 0.241514 * Math.log10(x + 0.00873) + 0.598206;
}

/* ---------- Gamut ---------- */

const D65: [number, number] = [0.3127, 0.329];
const VGAMUT: [number, number][] = [
  [0.73, 0.28],
  [0.165, 0.84],
  [0.1, -0.03],
];
const REC709: [number, number][] = [
  [0.64, 0.33],
  [0.3, 0.6],
  [0.15, 0.06],
];

const xyz = ([x, y]: [number, number]): Rgb => [x / y, 1, (1 - x - y) / y];
const mul = (a: Matrix, b: Matrix): Matrix => a.map((_, i) => [0, 1, 2].map((j) => a[i]![0]! * b[0]![j]! + a[i]![1]! * b[1]![j]! + a[i]![2]! * b[2]![j]!) as Rgb) as Matrix;

function invers(m: Matrix): Matrix {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  return [
    [(e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det],
    [(f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det],
    [(d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det],
  ];
}

/** Matrix von RGB (mit diesen Primärvalenzen und Weisspunkt) nach XYZ. */
function rgbNachXyz(prim: [number, number][], weiss: [number, number]): Matrix {
  const spalten = prim.map(xyz);
  const m: Matrix = [
    [spalten[0]![0], spalten[1]![0], spalten[2]![0]],
    [spalten[0]![1], spalten[1]![1], spalten[2]![1]],
    [spalten[0]![2], spalten[1]![2], spalten[2]![2]],
  ];
  const w = xyz(weiss);
  const mi = invers(m);
  const s: Rgb = [0, 1, 2].map((i) => mi[i]![0]! * w[0] + mi[i]![1]! * w[1] + mi[i]![2]! * w[2]) as Rgb;
  return m.map((zeile) => zeile.map((v, j) => v * s[j]!) as Rgb) as Matrix;
}

/** Lineares V-Gamut nach linearem Rec.709. */
export const VGAMUT_ZU_REC709: Matrix = mul(invers(rgbNachXyz(REC709, D65)), rgbNachXyz(VGAMUT, D65));

/* ---------- Look ---------- */

export interface LookParameter {
  name: string;
  /** Belichtung in Blenden, bevor die Kurve greift. */
  belichtung: number;
  /** Steilheit der S-Kurve um den Mittelpunkt, 1 = keine. */
  kontrast: number;
  /** Mittelpunkt der Kurve im Anzeigewert (0 bis 1). */
  mitte: number;
  /** Sättigung, 1 = unverändert. */
  saettigung: number;
  /** Farbstich der Schatten (RGB-Zuschlag bei Schwarz, nimmt zu den Mitten hin ab). */
  schatten: Rgb;
  /** Farbstich der Lichter (RGB-Zuschlag bei Weiss). */
  lichter: Rgb;
}

/** Der Look der Marke Alperna: kühl, kontraststark, leicht entsättigt. Die Zahlen sind Annahmen, am Bild geprüft (Hautton, Wand, Hemd). */
export const ALPERNA_KINO: LookParameter = {
  name: "Alperna Kino",
  belichtung: -1.2,
  kontrast: 1.6,
  mitte: 0.4,
  saettigung: 0.86,
  schatten: [-0.02, 0.008, 0.05],
  lichter: [0.012, 0.004, -0.012],
};

const klemme = (x: number, a = 0, b = 1): number => Math.min(b, Math.max(a, x));

/** Rec.709-Anzeigekodierung (OETF) mit Gamma 2,2 als Näherung der üblichen Wiedergabe; lineares Licht → Anzeigewert. */
const anzeige = (x: number): number => Math.pow(klemme(x, 0, 1), 1 / 2.2);

/** S-Kurve um `mitte`: gleicht Anzeigewerte an, ohne Schwarz und Weiss zu verschieben. */
function sKurve(x: number, mitte: number, staerke: number): number {
  if (staerke === 1) return x;
  // Normierte logistische Kurve, deren Endpunkte bei 0 und 1 liegen und die bei `mitte` die Steigung `staerke` hat (näherungsweise)
  const k = staerke * 4;
  const f = (t: number): number => 1 / (1 + Math.exp(-k * (t - mitte)));
  const a = f(0);
  const b = f(1);
  return (f(x) - a) / (b - a);
}

/** Der Look als Funktion: V-Log-Codewerte (0 bis 1, RGB) → Anzeige-RGB (0 bis 1). */
export function lookFunktion(p: LookParameter): (rgb: Rgb) => Rgb {
  const gain = Math.pow(2, p.belichtung);
  return ([r, g, b]) => {
    const lin = [vlogZuLinear(r), vlogZuLinear(g), vlogZuLinear(b)];
    const m = VGAMUT_ZU_REC709;
    const lin709 = [0, 1, 2].map((i) => Math.max(0, (m[i]![0]! * lin[0]! + m[i]![1]! * lin[1]! + m[i]![2]! * lin[2]!) * gain));
    let d = lin709.map((x) => sKurve(anzeige(x), p.mitte, p.kontrast));
    const y = 0.2126 * d[0]! + 0.7152 * d[1]! + 0.0722 * d[2]!;
    d = d.map((c) => y + (c - y) * p.saettigung);
    const s = Math.pow(1 - y, 2);
    const l = Math.pow(y, 2);
    d = d.map((c, i) => c + p.schatten[i]! * s + p.lichter[i]! * l);
    return [klemme(d[0]!), klemme(d[1]!), klemme(d[2]!)];
  };
}

/** Eine `.cube`-Datei (Adobe/Resolve-Format): Rot läuft am schnellsten, dann Grün, dann Blau. */
export function schreibeCube(f: (rgb: Rgb) => Rgb, titel: string, groesse = 33): string {
  const z: string[] = [`TITLE "${titel}"`, `LUT_3D_SIZE ${groesse}`, "DOMAIN_MIN 0.0 0.0 0.0", "DOMAIN_MAX 1.0 1.0 1.0"];
  for (let b = 0; b < groesse; b++) {
    for (let g = 0; g < groesse; g++) {
      for (let r = 0; r < groesse; r++) {
        const o = f([r / (groesse - 1), g / (groesse - 1), b / (groesse - 1)]);
        z.push(`${o[0].toFixed(6)} ${o[1].toFixed(6)} ${o[2].toFixed(6)}`);
      }
    }
  }
  return `${z.join("\n")}\n`;
}

/** Liest eine `.cube`-Datei (nur 3D) und gibt Grösse und Einträge zurück. Für Tests und Prüfungen. */
export function leseCube(text: string): { groesse: number; werte: Rgb[] } {
  const zeilen = text.split("\n").map((x) => x.trim());
  const g = zeilen.find((x) => x.startsWith("LUT_3D_SIZE"));
  if (!g) throw new Error("Keine 3D-LUT (LUT_3D_SIZE fehlt)");
  const groesse = Number(g.split(/\s+/)[1]);
  const werte = zeilen.filter((x) => /^-?\d/.test(x)).map((x) => x.split(/\s+/).map(Number) as Rgb);
  if (werte.length !== groesse ** 3) throw new Error(`Die LUT hat ${werte.length} Einträge, erwartet ${groesse ** 3}`);
  return { groesse, werte };
}
