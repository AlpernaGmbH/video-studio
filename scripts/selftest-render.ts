/**
 * Selbsttest mit echtem Rendern (braucht Chrome Headless Shell und ffmpeg, siehe `npx hyperframes doctor`).
 * Er läuft nicht in `npm test`, weil er je Stück eine Minute dauert und einen Browser braucht.
 *
 *   npm run selftest:render                       alle Stücke, alle Einsatzbeispiele rendern und prüfen
 *   npm run selftest:render -- --id zahl-zaehler  nur ein Stück
 *   npm run selftest:render -- --vorschau         Standbilder nach <stück>/vorschau/ schreiben
 *   npm run selftest:render -- --markiere         Status «gebaut» → «geprueft», wenn alles besteht
 *   npm run selftest:render -- --looks            Look-Bogen (drei Standbilder + Vergleichsblatt) durchspielen
 *   npm run selftest:render -- --batch            Zwei Fassungen desselben Stücks in einem Lauf (andere Zahlen, andere Dauer)
 *   npm run selftest:render -- --geruest          Ein frisch angelegtes Gerüst (motion neu) rendern: erfüllt es den Vertrag?
 *
 * Das ist die Messung für Test T1 des Bauplans auf dem jeweiligen Rechner: Bitte auf M4 und M5 laufen lassen
 * und die Renderzeiten aufschreiben (STATUS.md).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "../src/args";
import { ladeBibliothek } from "../src/motion/bibliothek";
import { setzeStatus } from "../src/motion/aktivieren";
import { legeStueckAn } from "../src/motion/geruest";
import { frameAufHintergrund } from "../src/motion/render-pruefung";
import { checkStueck, erzeugeLookBogen, ladeMarke, rendereBatch, rendereStueck, umgebung } from "../src/motion/werkstatt";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = umgebung(root);
const a = parseArgs(process.argv.slice(2));

/** Drei bewusst verschiedene Entwurfs-Looks als Minimal-Kompositionen. Nur zum Test des Look-Bogens. */
function lookHtml(name: string, hintergrund: string, farbe: string, schrift: string, gewicht: number): string {
  return `<!doctype html>
<html lang="de-CH"><head><meta charset="utf-8"><link rel="stylesheet" href="assets/brand.css"><script src="assets/vendor/gsap.min.js"></script>
<style>html,body{margin:0;background:#1d3557}#root{position:relative;width:1080px;height:1920px;overflow:hidden}
#k{position:absolute;left:70px;top:700px;width:780px;padding:60px;box-sizing:border-box;background:${hintergrund};color:${farbe};font-family:${schrift},sans-serif;font-weight:${gewicht};font-size:120px;border-radius:${name === "b" ? 40 : 0}px}</style></head>
<body><div id="root" data-composition-id="look-${name}" data-start="0" data-width="1080" data-height="1920"><div id="k">Look ${name.toUpperCase()}</div></div>
<script>var tl=gsap.timeline({paused:true});tl.from("#k",{opacity:0,duration:0.3},0);tl.set({},{},2);window.__timelines=window.__timelines||{};window.__timelines["look-${name}"]=tl;</script></body></html>`;
}

async function main(): Promise<number> {
  let fehler = 0;
  const marke = ladeMarke(env, "alperna");
  const bib = ladeBibliothek(env.bibliothek);
  const nurId = typeof a.opt["id"] === "string" ? a.opt["id"] : undefined;
  const stuecke = bib.stuecke.filter((g) => !nurId || g.stueck.id === nurId);
  if (stuecke.length === 0) throw new Error(nurId ? `Stück «${nurId}» nicht gefunden` : "Die Bibliothek ist leer");

  console.log(`Rechner: ${os.platform()} ${os.arch()}, ${os.cpus().length} Kerne (${os.cpus()[0]?.model ?? "?"}), ${(os.totalmem() / 2 ** 30).toFixed(0)} GB RAM`);
  const ausgabeDir = path.join(env.arbeitsDir, "selftest");
  fs.mkdirSync(ausgabeDir, { recursive: true });

  for (const g of stuecke) {
    const s = g.stueck;
    console.log(`\n=== ${s.id} (${s.status}) ===`);
    let besteht = true;

    const check = await checkStueck(env, s.id, marke);
    console.log(`hyperframes check: ${check.ok ? "ok" : "NICHT ok"} in ${(check.dauerMs / 1000).toFixed(1)} s${check.befunde.length ? `, ${check.befunde.length} Befund(e)` : ""}`);
    for (const b of check.befunde) console.log(`  ${b.stufe}: ${b.code}: ${b.text}`);
    if (!check.ok) besteht = false;

    const vorschauDir = path.join(g.dir, "vorschau");
    if (a.opt["vorschau"]) {
      fs.rmSync(vorschauDir, { recursive: true, force: true });
      fs.mkdirSync(vorschauDir, { recursive: true });
    }

    for (const [i, bsp] of (s.einsatz?.beispiele ?? []).entries()) {
      const werte = { ...bsp.variablen };
      const dauer = typeof werte["dauer"] === "number" ? (werte["dauer"] as number) : undefined;
      delete werte["dauer"];
      const datei = path.join(ausgabeDir, `${s.id}-${i + 1}.webm`);
      const r = await rendereStueck(env, s.id, { werte, dauer, marke, ausgabe: datei });
      const bestanden = r.pruefung.bestanden;
      console.log(`Beispiel ${i + 1} «${bsp.satz}»: ${r.dauer} s in ${(r.renderMs / 1000).toFixed(1)} s gerendert (${(r.renderMs / 1000 / r.dauer).toFixed(1)}× Echtzeit) → ${bestanden ? "bestanden" : "NICHT bestanden"}`);
      for (const b of r.pruefung.befunde) console.log(`  ${b.stufe}: ${b.code}: ${b.text}`);
      if (!bestanden) besteht = false;

      // Vorschaubilder aus dem echten Render, auf dunklem Videohintergrund
      if (a.opt["vorschau"]) {
        // Grundlinie: dasselbe Verfahren an einer Stelle ohne Inhalt (Bild 0). Ein Vorschaubild, das nicht grösser ist, ist leer.
        const leer = path.join(ausgabeDir, "leer.png");
        await frameAufHintergrund(datei, 0, leer);
        for (const anteil of [0.25, 0.5, 0.8]) {
          const t = Number((r.dauer * anteil).toFixed(2));
          const ziel = path.join(vorschauDir, `beispiel-${i + 1}-${String(t).replace(".", "_")}s.png`);
          await frameAufHintergrund(datei, t, ziel);
          if (fs.statSync(ziel).size < fs.statSync(leer).size * 1.5) {
            console.log(`  FEHLER: Vorschaubild bei ${t} s ist leer`);
            besteht = false;
          }
        }
        console.log(`Vorschaubilder: ${path.relative(root, vorschauDir)}/beispiel-${i + 1}-*.png`);
      }
    }

    if (!besteht) fehler++;
    else if (a.opt["markiere"] && s.status === "gebaut") {
      setzeStatus(env.bibliothek, s.id, "geprueft");
      console.log(`Status: gebaut → geprueft`);
    }
  }

  if (a.opt["looks"]) {
    console.log("\n=== Look-Bogen ===");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-looks-"));
    try {
      const looks: [string, string, string, string, number][] = [
        ["a", "#FFC629", "#0A0A0A", "Poppins", 700],
        ["b", "#FFFFFF", "#4B3FD6", "Montserrat", 500],
        ["c", "#0A0A0A", "#FFFFFF", "Poppins", 600],
      ];
      for (const [id, bg, fg, font, w] of looks) {
        fs.mkdirSync(path.join(dir, "looks", id), { recursive: true });
        fs.writeFileSync(path.join(dir, "looks", id, "index.html"), lookHtml(id, bg, fg, font, w));
      }
      const t0 = Date.now();
      const r = await erzeugeLookBogen(env, dir, 1.0, marke);
      const groessen = r.bilder.map((b) => fs.statSync(path.join(dir, b.pfad)).size);
      const ok = r.bilder.length === 3 && groessen.every((x) => x > 1000) && new Set(groessen).size === 3 && fs.statSync(r.vergleich).size > 1000;
      console.log(`Looks ${r.bilder.map((b) => b.pfad).join(", ")} und Vergleichsblatt in ${((Date.now() - t0) / 1000).toFixed(1)} s → ${ok ? "ok" : "FEHLER"} (Dateigrössen ${groessen.join(", ")})`);
      if (a.opt["looks-ausgabe"] && typeof a.opt["looks-ausgabe"] === "string") fs.copyFileSync(r.vergleich, a.opt["looks-ausgabe"]);
      if (!ok) fehler++;
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  if (a.opt["batch"]) {
    console.log("\n=== Batch ===");
    const id = nurId ?? "zahl-zaehler";
    const r = await rendereBatch(env, id, [
      { name: "a", dauer: 2.4, werte: { wert: 7, suffix: " von 10", label: "laden zu langsam" } },
      { name: "b", dauer: 3.2, werte: { wert: 43, suffix: " %", label: "springen sofort ab" } },
    ], { marke, ausgabeDir: path.join(ausgabeDir, "batch") });
    for (const x of r.zeilen) {
      console.log(`${x.name}: ${x.dauer} s → ${x.pruefung.bestanden ? "bestanden" : "NICHT bestanden"}`);
      for (const b of x.pruefung.befunde) console.log(`  ${b.stufe}: ${b.code}: ${b.text}`);
      if (!x.pruefung.bestanden) fehler++;
    }
    console.log(`${r.zeilen.length} Fassungen in ${(r.renderMs / 1000).toFixed(1)} s`);
  }

  if (a.opt["geruest"]) {
    console.log("\n=== Gerüst (motion neu) ===");
    const lib = fs.mkdtempSync(path.join(os.tmpdir(), "studio-geruest-"));
    try {
      legeStueckAn(lib, { id: "geruest-probe", name: "Gerüst-Probe", typen: ["verlauf"] });
      const eigene = { ...env, bibliothek: lib };
      const check = await checkStueck(eigene, "geruest-probe", marke);
      console.log(`hyperframes check: ${check.ok ? "ok" : "NICHT ok"}${check.befunde.length ? `, ${check.befunde.length} Befund(e)` : ""}`);
      for (const b of check.befunde) console.log(`  ${b.stufe}: ${b.code}: ${b.text}`);
      const r = await rendereStueck(eigene, "geruest-probe", { werte: { werte: [90, 70, 50] }, dauer: 3, marke, ausgabe: path.join(ausgabeDir, "geruest-probe.webm") });
      console.log(`Render: ${r.dauer} s in ${(r.renderMs / 1000).toFixed(1)} s → ${r.pruefung.bestanden ? "bestanden" : "NICHT bestanden"}`);
      for (const b of r.pruefung.befunde) console.log(`  ${b.stufe}: ${b.code}: ${b.text}`);
      if (!check.ok || !r.pruefung.bestanden) fehler++;
    } finally {
      fs.rmSync(lib, { recursive: true, force: true });
    }
  }

  console.log(fehler === 0 ? "\nSelbsttest bestanden." : `\nSelbsttest: ${fehler} Fehler.`);
  return fehler === 0 ? 0 : 1;
}

main().then(
  (c) => process.exit(c),
  (e: unknown) => {
    console.error(`FEHLER: ${(e as Error).message}`);
    process.exit(1);
  },
);
