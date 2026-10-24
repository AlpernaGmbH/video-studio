import type { Markenprofil } from "../core/schemas";

/**
 * Klänge im Schnitt (M8): Zahlen und Grenzen an einer Stelle. Alperna hat `ton.sfxDichte` 0: Ohne Entscheid der Marke ändert sich kein Reel.
 * Die Obergrenzen sind unsere Annahmen (docs/inspiration/sound.md), nicht aus Messungen an eigenen Reels.
 */

/** Standardpegel eines Klangs relativ zur Datei, damit Effekte unter der Stimme bleiben. */
export const KLANG_PEGEL_STANDARD = -12;

/** Mehr als so viele Klänge in einer Sekunde sind kein Sounddesign mehr, sondern Lärm. */
export const KLAENGE_JE_SEKUNDE = 4;

/** Ein Klang darf höchstens so viele Sekunden vor dem Bildereignis liegen; danach ist er zu früh und wirkt wie ein Fehler. */
export const KLANG_VORLAUF_MAX = 0.5;

/** Anteil der Energie unter 200 Hz, ab dem ein Mix auffällig dumpf oder dröhnend wirkt. Annahme: In den Beispielen lag er bei 10 bis 25 Prozent. */
export const TIEFENANTEIL_MAX = 0.4;

/** Höchstens so viele Klänge in einem Video, wie die Marke erlaubt: `ton.sfxDichte` je Sekunde, mindestens einer, sobald die Marke Klänge will. 0 heisst: keine. */
export function hoechstensKlaenge(ton: Pick<Markenprofil["ton"], "sfxDichte"> | undefined, gesamt: number): number {
  const dichte = ton?.sfxDichte ?? 0;
  return dichte > 0 ? Math.max(1, Math.round(dichte * gesamt)) : 0;
}

/** Zeiten (Sekunden), bei denen in der folgenden Sekunde mehr als `KLAENGE_JE_SEKUNDE` Klänge liegen. */
export function zuDichteStellen(zeiten: number[]): number[] {
  const t = [...zeiten].sort((a, b) => a - b);
  const stellen: number[] = [];
  for (let i = 0; i < t.length; i++) {
    const inFenster = t.filter((x) => x >= t[i]! && x < t[i]! + 1).length;
    if (inFenster > KLAENGE_JE_SEKUNDE && !stellen.some((s) => Math.abs(s - t[i]!) < 1)) stellen.push(t[i]!);
  }
  return stellen;
}

/**
 * Verteilt Klänge auf Spuren: Was sich zeitlich überlappt, kommt auf verschiedene Spuren, damit Resolve keine Überlappung in einer Spur bekommt.
 * Gibt je Eintrag die Nummer der Spur zurück (0, 1, …), in der Reihenfolge der Eingabe. Greedy nach Beginn: erste Spur, deren letzter Klang schon zu Ende ist.
 */
export function verteileAufSpuren(klaenge: { start: number; frames: number }[]): number[] {
  const nummer = new Array<number>(klaenge.length).fill(0);
  const ende: number[] = [];
  const reihenfolge = klaenge.map((_, i) => i).sort((a, b) => klaenge[a]!.start - klaenge[b]!.start || a - b);
  for (const i of reihenfolge) {
    const k = klaenge[i]!;
    let spur = ende.findIndex((e) => e <= k.start);
    if (spur < 0) spur = ende.length;
    ende[spur] = k.start + k.frames;
    nummer[i] = spur;
  }
  return nummer;
}
