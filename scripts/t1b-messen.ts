/**
 * Test T1b des Bauplans v3 (Abschnitt 10.2): Eine WebM-Datei je Overlay oder eine Komposition für alle?
 *
 * Gemessen wird der feste Aufwand je Render (Browser starten, Seite laden, Schriften, Encoder) getrennt von den Kosten je Sekunde Video.
 * Dazu wird dasselbe Stück in drei Längen mehrfach gerendert und eine Gerade «Zeit = fest + je_Sekunde × Länge» durch die Messwerte gelegt.
 *
 *   Eine Datei je Overlay, 6 Overlays zu je 2,5 s:   6 × fest + je_Sekunde × 15
 *   Eine Komposition für alle, 15 s:                  1 × fest + je_Sekunde × 15
 *
 * Das ist ein Modell, kein Beweis: Eine echte Komposition aus sechs Stücken ist nicht gebaut. Entscheidend ist der Wert «fest».
 * Ist er auf dem Mac klein (unter etwa 3 s), reicht «eine Datei je Overlay» und bringt Cache und Wiederverwendung.
 *
 *   npm run t1b                    drei Längen, je zwei Läufe, ein Aufwärmlauf (rund 2 Minuten)
 *   npm run t1b -- --laeufe 3      mehr Läufe je Länge
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "../src/args";
import { gerade } from "../src/motion/messung";
import { ladeMarke, rendereStueck, umgebung } from "../src/motion/werkstatt";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = umgebung(root);
const a = parseArgs(process.argv.slice(2));
const laeufe = typeof a.opt["laeufe"] === "string" ? Number(a.opt["laeufe"]) : 2;
const LAENGEN = [1.4, 2.6, 5.0];
const STUECK = typeof a.opt["id"] === "string" ? a.opt["id"] : "zahl-zaehler";

async function main(): Promise<void> {
  const marke = ladeMarke(env, "alperna");
  const dir = path.join(env.arbeitsDir, "t1b");
  fs.mkdirSync(dir, { recursive: true });
  const render = async (dauer: number, n: number): Promise<number> => {
    const t0 = performance.now();
    await rendereStueck(env, STUECK, { werte: { wert: 7, label: "Termine vergeben" }, dauer, marke, ausgabe: path.join(dir, `t1b-${dauer}-${n}.webm`) });
    return (performance.now() - t0) / 1000;
  };

  console.log(`T1b auf ${os.platform()} ${os.arch()}, ${os.cpus().length} Kerne (${os.cpus()[0]?.model ?? "?"}), ${(os.totalmem() / 2 ** 30).toFixed(0)} GB RAM, Stück ${STUECK}`);
  const kalt = await render(2.6, 0);
  console.log(`Aufwärmlauf (nicht gezählt): ${kalt.toFixed(1)} s`);

  const punkte: { x: number; y: number }[] = [];
  for (const d of LAENGEN) {
    const zeiten: number[] = [];
    for (let n = 1; n <= laeufe; n++) zeiten.push(await render(d, n));
    for (const z of zeiten) punkte.push({ x: d, y: z });
    console.log(`  ${d.toFixed(1)} s Video: ${zeiten.map((z) => z.toFixed(1)).join(", ")} s Renderzeit`);
  }
  const { fest, je } = gerade(punkte);
  const einzeln = 6 * fest + je * 15;
  const komposition = fest + je * 15;
  console.log(`\nModell: Renderzeit = ${fest.toFixed(1)} s fest + ${je.toFixed(2)} s je Sekunde Video (das Echtzeit-Vielfache je Sekunde ist ${je.toFixed(1)})`);
  console.log(`Sechs Overlays zu 2,5 s (15 s): einzeln ${einzeln.toFixed(0)} s, als eine Komposition ${komposition.toFixed(0)} s, Unterschied ${(einzeln - komposition).toFixed(0)} s`);
  console.log(fest < 3 ? "Fester Aufwand klein: «eine Datei je Overlay» ist vertretbar." : "Fester Aufwand gross: eine Komposition für alle prüfen oder Overlays bündeln.");
  console.log("Bitte die ganze Ausgabe in STATUS.md unter «Gemessen» eintragen, samt Rechner.");
}

main().catch((e: unknown) => {
  console.error(`FEHLER: ${(e as Error).message}`);
  process.exit(1);
});
