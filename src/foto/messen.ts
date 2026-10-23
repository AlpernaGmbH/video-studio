/**
 * Messen und Auswählen, rein (kein Dateizugriff, kein ffmpeg): Aus einem kleinen Graubild (Bytes, 0 bis 255) werden Mittelwert und die Ränder der
 * Helligkeit; daraus erkennt der Batch, ob die Fotos flach (Log) sind, und wählt die Muster.
 */

export interface BildMass {
  /** Pfad der Datei, wie ihn der Aufrufer führt (relativ zum Fotoordner). */
  pfad: string;
  /** Mittlere Helligkeit, 0 bis 1. */
  mittel: number;
  /** 2. und 98. Perzentil der Helligkeit, 0 bis 1: die Ränder, ohne einzelne Ausreisser. */
  p2: number;
  p98: number;
}

export type Profil = "vlog" | "standard";

/**
 * Ab wann ein Foto als flach (Log) gilt. Herleitung aus dem Handbuch von Panasonic: 0 % Reflexion liegt bei Code 128 von 1023 (0,125), 90 % bei 602 (0,588)
 * (`src/schnitt/vlog.ts`). Ein V-Log-Foto hat darum kaum Pixel unter 0,09 und selten welche über 0,82. Ein fertig gerechnetes Foto (sRGB) reicht in den meisten
 * Szenen fast bis Schwarz und fast bis Weiss. **Die Grenzen sind eine Annahme für JPEG-Dateien**: Wie die Kamera V-Log in JPEG schreibt, ist an echtem Material
 * nicht belegt. Darum nimmt `--profil` immer Vorrang, und das Muster zeigt die reine Umrechnung zur Kontrolle.
 */
export const FLACH = { schwarzMin: 0.09, lichterMax: 0.82 } as const;

/** Anteil flacher Fotos, ab dem der Ordner als V-Log gilt (und darunter als Standard, wenn er klein genug ist). */
export const FLACH_ANTEIL = { vlogAb: 0.8, standardBis: 0.2 } as const;

/** Mass aus den Bytes eines Graubilds (ein Byte je Pixel). Leere Eingabe ist ein Fehler. */
export function grauMass(pfad: string, pixel: Uint8Array): BildMass {
  if (pixel.length === 0) throw new Error(`Kein Bild gemessen: ${pfad}`);
  const zaehler = new Array<number>(256).fill(0);
  let summe = 0;
  for (const v of pixel) {
    zaehler[v]! += 1;
    summe += v;
  }
  const perzentil = (anteil: number): number => {
    const ziel = Math.ceil(pixel.length * anteil);
    let lauf = 0;
    for (let v = 0; v < 256; v++) {
      lauf += zaehler[v]!;
      if (lauf >= ziel) return v / 255;
    }
    return 1;
  };
  return { pfad, mittel: summe / pixel.length / 255, p2: perzentil(0.02), p98: perzentil(0.98) };
}

export interface ProfilErkennung {
  /** "unklar", wenn weder die meisten noch die wenigsten Fotos flach sind. */
  profil: Profil | "unklar";
  /** Anteil flacher Fotos, 0 bis 1. */
  flach: number;
  /** Mittelwerte der Ränder über alle Fotos (zur Anzeige). */
  p2: number;
  p98: number;
}

export function istFlach(m: BildMass): boolean {
  return m.p2 >= FLACH.schwarzMin && m.p98 <= FLACH.lichterMax;
}

export function erkenneProfil(masse: BildMass[]): ProfilErkennung {
  if (masse.length === 0) throw new Error("Keine Fotos zum Erkennen");
  const flach = masse.filter(istFlach).length / masse.length;
  const mittel = (f: (m: BildMass) => number): number => masse.reduce((s, m) => s + f(m), 0) / masse.length;
  const profil: ProfilErkennung["profil"] = flach >= FLACH_ANTEIL.vlogAb ? "vlog" : flach <= FLACH_ANTEIL.standardBis ? "standard" : "unklar";
  return { profil, flach, p2: mittel((m) => m.p2), p98: mittel((m) => m.p98) };
}

/**
 * Die Muster: `n` Fotos aus der Reihe, nach Helligkeit verteilt (ein dunkles, ein mittleres, ein helles), damit der Look an den schwierigen Stellen sichtbar wird.
 * Deterministisch: gleiche Eingabe, gleiche Auswahl (Gleichstand entscheidet der Pfad). Gibt es weniger Fotos als `n`, sind es alle.
 */
export function waehleMuster(masse: BildMass[], n = 3): BildMass[] {
  if (!Number.isInteger(n) || n < 1) throw new Error("Die Zahl der Muster muss eine ganze Zahl ab 1 sein");
  const sortiert = [...masse].sort((a, b) => a.mittel - b.mittel || (a.pfad < b.pfad ? -1 : a.pfad > b.pfad ? 1 : 0));
  if (sortiert.length <= n) return sortiert;
  if (n === 1) return [sortiert[Math.floor((sortiert.length - 1) / 2)]!];
  const stellen = Array.from({ length: n }, (_, i) => 0.1 + (0.8 * i) / (n - 1));
  const gewaehlt: BildMass[] = [];
  for (const s of stellen) {
    let idx = Math.round(s * (sortiert.length - 1));
    while (idx < sortiert.length && gewaehlt.includes(sortiert[idx]!)) idx += 1;
    if (idx >= sortiert.length) idx = sortiert.findIndex((m) => !gewaehlt.includes(m));
    gewaehlt.push(sortiert[idx]!);
  }
  return gewaehlt.sort((a, b) => a.mittel - b.mittel || (a.pfad < b.pfad ? -1 : 1));
}
