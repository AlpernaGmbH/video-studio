import type { Schnittplan } from "./plan";
import { leseSchnittplan } from "./plan";

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

/** Absolute Pfade für Tests: alles liegt unter /studio. Overlays aus dem Render erhalten die Endung .mov. */
export const testLoeser = (rel: string, art: "quelle" | "overlay"): string => `/studio/${art === "overlay" ? rel.replace(/\.webm$/i, ".mov") : rel}`;
