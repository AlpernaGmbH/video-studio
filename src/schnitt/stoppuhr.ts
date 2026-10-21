/**
 * Eine Stoppuhr für die Schritte eines Ablaufs (Plan v4, 1.7): Wo bleibt die Zeit? Die Zahlen stehen am Ende der Ausgabe und sind die Grundlage für den Fortschritt im Alperna-Tool (Phase 2).
 * `jetzt` ist ersetzbar für Tests.
 */

export interface Schritt {
  name: string;
  ms: number;
}

export interface Stoppuhr {
  messe<T>(name: string, f: () => Promise<T>): Promise<T>;
  schritte(): Schritt[];
  /** Eine Zeile je Schritt und die Summe, zum Ausgeben. Leer, wenn es keine Schritte gibt. */
  zeilen(): string[];
}

export function dauerText(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1).replace(".", ",")} s`;
  const min = Math.floor(s / 60);
  return `${min} min ${Math.round(s - min * 60)} s`;
}

export function stoppuhr(jetzt: () => number = Date.now): Stoppuhr {
  const liste: Schritt[] = [];
  return {
    async messe<T>(name: string, f: () => Promise<T>): Promise<T> {
      const t0 = jetzt();
      try {
        return await f();
      } finally {
        // Ein Schritt, der wirft, steht trotzdem in der Liste: Auch ein Fehler hat gedauert
        liste.push({ name, ms: jetzt() - t0 });
      }
    },
    schritte: () => [...liste],
    zeilen() {
      if (!liste.length) return [];
      const summe = liste.reduce((a, s) => a + s.ms, 0);
      const breit = Math.max(...liste.map((s) => s.name.length));
      return [...liste.map((s) => `  ${s.name.padEnd(breit)}  ${dauerText(s.ms)}`), `  ${"Summe".padEnd(breit)}  ${dauerText(summe)}`];
    },
  };
}
