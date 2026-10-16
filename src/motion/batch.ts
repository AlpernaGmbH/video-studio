import { loeseVariablen, type Stueck, type Variablen } from "./stueck";
import type { Markenprofil } from "../core/schemas";

/**
 * Mehrere Fassungen desselben Stücks: «gleiches Stück, andere Wörter oder Zahlen».
 * Jede Zeile wird mit denselben Regeln geprüft wie ein einzelner Einsatz (Parameter, Bereiche, Dauer, Marke),
 * bevor HyperFrames startet. Ein Fehler in einer Zeile stoppt den ganzen Lauf, es entsteht nichts Halbes.
 */

export interface BatchZeile {
  /** Dateiname ohne Endung: Buchstaben, Ziffern, Bindestrich, Unterstrich. */
  name: string;
  dauer?: number;
  werte?: Record<string, unknown>;
}

export type BatchVorbereitet =
  | { ok: true; zeilen: (Variablen & { name: string })[]; dauern: Record<string, number> }
  | { ok: false; fehler: string[] };

export interface BatchOptionen {
  marke?: Markenprofil;
  /** Nur für Selbsttest und Entwürfe: ohne Markenprofil rendern, mit den Standardwerten der Komposition. */
  ohneMarke?: boolean;
}

export function batchVorbereiten(stueck: Stueck, zeilen: BatchZeile[], opt: BatchOptionen = {}): BatchVorbereitet {
  const fehler: string[] = [];
  const out: (Variablen & { name: string })[] = [];
  const dauern: Record<string, number> = {};
  const gesehen = new Set<string>();

  if (zeilen.length === 0) return { ok: false, fehler: ["Keine Zeilen"] };

  zeilen.forEach((z, i) => {
    const wo = `Zeile ${i + 1}${z.name ? ` («${z.name}»)` : ""}`;
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,60}$/.test(z.name ?? "")) {
      fehler.push(`${wo}: «name» muss aus Buchstaben, Ziffern, - und _ bestehen (wird zum Dateinamen)`);
      return;
    }
    if (gesehen.has(z.name.toLowerCase())) {
      fehler.push(`${wo}: «name» kommt schon vor (Dateien würden sich überschreiben)`);
      return;
    }
    gesehen.add(z.name.toLowerCase());
    const r = loeseVariablen(stueck, z.werte ?? {}, { dauer: z.dauer, marke: opt.marke, ohneMarke: opt.ohneMarke });
    if (!r.ok) {
      for (const f of r.fehler) fehler.push(`${wo}: ${f}`);
      return;
    }
    out.push({ name: z.name, ...r.variablen });
    dauern[z.name] = r.dauer;
  });

  return fehler.length > 0 ? { ok: false, fehler } : { ok: true, zeilen: out, dauern };
}
