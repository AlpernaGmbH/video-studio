import type { Schnittplan } from "./plan";
import { leseSchnittplan } from "./plan";
import type { Segment } from "./transkript";

/** Ein kleiner, vollständiger Schnittplan für Tests: drei Clips, B-Roll, eine Grafik, Musik, Wörter. 25 fps, 1080×1920. */
export function beispielPlan(ueberschreibe: Partial<Record<string, unknown>> = {}): Schnittplan {
  return leseSchnittplan({
    version: 1,
    projekt: { name: "Praxis Hofer Empfang", inhalt: "c-0007", marke: "alperna", fps: 25, breite: 1080, hoehe: 1920 },
    quellen: [
      { id: "sprache", pfad: "rohmaterial/praxis-hofer/sprache-01.mov", art: "video", dauer: 30, fps: 25, breite: 1080, hoehe: 1920, hatAudio: true },
      { id: "empfang", pfad: "rohmaterial/praxis-hofer/empfang-01.mov", art: "video", dauer: 12, fps: 50, breite: 1920, hoehe: 1080, hatAudio: true },
      { id: "musik-1", pfad: "rohmaterial/musik/bett-01.wav", art: "audio", dauer: 120, hatAudio: true, audioKanaele: 2, audioRate: 48000 },
    ],
    clips: [
      { id: "k01", quelle: "sprache", von: 2, bis: 4.04, zeile: 1 },
      { id: "k02", quelle: "sprache", von: 6.2, bis: 8, zeile: 2, zoom: 1.1 },
      { id: "k03", quelle: "sprache", von: 11, bis: 12.6, zeile: 3 },
    ],
    broll: [{ quelle: "empfang", katalog: "k-0142", t: 1.2, dauer: 1, von: 3, begruendung: "Empfang zeigt, wovon die Rede ist" }],
    overlays: [{ datei: "renders/c-0007/zahl.mov", effekt: "zahl-zaehler", t: 2.6, dauer: 2, begruendung: "Die Zahl im Satz soll hängen bleiben" }],
    musik: { quelle: "musik-1", t: 0, von: 10, pegelDb: -20 },
    woerter: [
      { text: "Wir", quelle: "sprache", von: 2.1, bis: 2.3 },
      { text: "haben", quelle: "sprache", von: 2.3, bis: 2.6 },
      { text: "das", quelle: "sprache", von: 2.6, bis: 2.8 },
      { text: "Wartezimmer", quelle: "sprache", von: 2.8, bis: 3.4 },
      { text: "umgebaut.", quelle: "sprache", von: 3.4, bis: 4.0 },
      { text: "Heute", quelle: "sprache", von: 6.3, bis: 6.7 },
      { text: "wartet", quelle: "sprache", von: 6.7, bis: 7.1 },
      { text: "niemand", quelle: "sprache", von: 7.1, bis: 7.5 },
      { text: "mehr.", quelle: "sprache", von: 7.5, bis: 7.9 },
      { text: "Gefällt", quelle: "sprache", von: 8.5, bis: 9.0 },
    ],
    ...ueberschreibe,
  });
}

/**
 * Der Beispielplan mit getrenntem Ton: Die Quelle «sprache» hat eine stumme Kameraspur (die Kamera hörte nichts Brauchbares), die Sprache liegt in der Tonaufnahme «ton-1»
 * (60 s, Mono). Der Recorder lief `versatz` Sekunden vor der Kamera: Zeit in der Aufnahme = Zeit im Video + versatz.
 */
export function beispielPlanMitTon(versatz = 5.5, ueberschreibe: Partial<Record<string, unknown>> = {}): Schnittplan {
  const basis = beispielPlan();
  return leseSchnittplan({
    ...basis,
    quellen: [
      ...basis.quellen.map((q) => (q.id === "sprache" ? { ...q, ton: { quelle: "ton-1", versatz } } : q)),
      { id: "ton-1", pfad: "rohmaterial/praxis-hofer/ton-01.wav", art: "audio", dauer: 60, hatAudio: true, audioKanaele: 1, audioRate: 48000 },
    ],
    ...ueberschreibe,
  });
}

/** Absolute Pfade für Tests: alles liegt unter /studio. Overlays aus dem Render erhalten die Endung .mov. */
export const testLoeser = (rel: string, art: "quelle" | "overlay"): string => `/studio/${art === "overlay" ? rel.replace(/\.webm$/i, ".mov") : rel}`;

/**
 * Ein Whisper-Segment mit echten Wortzeiten für Tests: jedes Wort 0,3 s, dazwischen 0,05 s, vor dem Wort mit Nummer `i` zusätzlich die Pause `pausen[i]`.
 * `tempo` ändert die Wortlänge (Sekunden je Wort).
 */
export function testSatz(start: number, text: string, pausen: Record<number, number> = {}, tempo = 0.3): Segment {
  let t = start;
  const woerter = text.split(/\s+/).map((x, i) => {
    t += pausen[i] ?? 0;
    const von = t;
    t += tempo;
    const bis = t;
    t += 0.05;
    return { text: x, von, bis };
  });
  return { von: woerter[0]!.von, bis: woerter[woerter.length - 1]!.bis, text, woerter };
}
