/**
 * Eine Stoppuhr für die Schritte eines Ablaufs (Plan v4, 1.7): Wo bleibt die Zeit? Die Zahlen stehen am Ende der Ausgabe und sind die Grundlage für den Fortschritt im Alperna-Tool (Phase 2).
 * `jetzt` ist ersetzbar für Tests. Ein `beobachter` (der Melder des Studios, `src/studio/melder.ts`) hört Beginn, Ende und Fehler jedes Schritts mit; er kann den Ablauf nie stören:
 * Wirft er, wird das ignoriert.
 */

export interface Schritt {
  name: string;
  ms: number;
}

/** Ein Schritt beginnt, endet oder bricht ab. `nr` zählt die Schritte dieser Stoppuhr ab 1; Beginn und Ende desselben Schritts tragen dieselbe Nummer. */
export interface SchrittEreignis {
  nr: number;
  name: string;
  zustand: "start" | "ok" | "error";
  /** Nur bei «ok» und «error»: wie lange der Schritt gedauert hat. */
  ms?: number;
  /** Nur bei «error»: die Meldung des Fehlers, unbereinigt. Wer sie weitergibt, bereinigt sie zuerst. */
  fehler?: string;
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

export function stoppuhr(jetzt: () => number = Date.now, beobachter?: (e: SchrittEreignis) => void): Stoppuhr {
  const liste: Schritt[] = [];
  let zaehler = 0;
  const melde = (e: SchrittEreignis): void => {
    try {
      beobachter?.(e);
    } catch {
      // Ein Beobachter darf den Ablauf nie stören
    }
  };
  return {
    async messe<T>(name: string, f: () => Promise<T>): Promise<T> {
      const nr = ++zaehler;
      const t0 = jetzt();
      melde({ nr, name, zustand: "start" });
      let fehler: string | undefined;
      try {
        return await f();
      } catch (e) {
        fehler = e instanceof Error ? e.message : String(e);
        throw e;
      } finally {
        // Ein Schritt, der wirft, steht trotzdem in der Liste: Auch ein Fehler hat gedauert
        const ms = jetzt() - t0;
        liste.push({ name, ms });
        melde(fehler === undefined ? { nr, name, zustand: "ok", ms } : { nr, name, zustand: "error", ms, fehler });
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
