import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { Args } from "../args";
import { KatalogEintrag, Regel } from "../core/schemas";
import { KATALOG_DATEI } from "../katalog/katalog";
import { ladeBibliothek } from "../motion/bibliothek";
import { extrahiereJson, ladeMarke, rendereStueck, type Umgebung } from "../motion/werkstatt";
import { sondiere } from "../presets/messen";
import { studioHome } from "../setup";
import { leseSchnittplan, platziere, SchnittQuelle } from "./plan";
import { pruefeSchnittplan } from "./pruefung";
import { bauAuftrag, wendeStoryboardAn, type RenderAuftrag } from "./storyboard";
import { loesePfad } from "./uebergabe";

/** Befehle `studio schnitt auftrag` und `studio schnitt storyboard` (Bauplan v2, Kap. 3.5). Logik in storyboard.ts. */

const pflicht = (a: Args, name: string, hilfe: string): string => {
  const v = a.opt[name];
  if (typeof v !== "string" || !v) throw new Error(`--${name} fehlt (${hilfe})`);
  return v;
};
const lesJson = (datei: string): unknown => JSON.parse(fs.readFileSync(datei, "utf8"));

/** Katalog aus `--katalog` oder `<Datenordner>/katalog.json`. Fehlt beides, ist er leer. */
function ladeKatalog(a: Args, env: Umgebung): { katalog: KatalogEintrag[]; notiz: string } {
  const datei = typeof a.opt["katalog"] === "string" ? (a.opt["katalog"] as string) : path.join(env.datenDir, KATALOG_DATEI);
  if (!fs.existsSync(datei)) {
    if (typeof a.opt["katalog"] === "string") throw new Error(`Katalog fehlt: ${datei}`);
    return { katalog: [], notiz: `Kein Katalog gefunden (${datei}): Es gibt keine B-Roll` };
  }
  return { katalog: z.array(KatalogEintrag).parse(lesJson(datei)), notiz: "" };
}

const shell = (x: string): string => (/^[A-Za-z0-9_@%+=:,./-]+$/.test(x) ? x : `'${x.replace(/'/g, "'\\''")}'`);

/** Der Befehl, der eine Grafik von Hand rendert (wenn nicht mit --rendern gerendert wird). */
export function renderBefehl(r: RenderAuftrag, abs: string, marke: string): string {
  const sets = Object.entries(r.werte).map(([k, v]) => `--set ${shell(`${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)}`);
  return ["npm run studio -- motion render", r.effekt, "-o", shell(abs), "--dauer", String(r.dauer), "--marke", marke, ...sets].join(" ");
}

export async function auftragBefehl(a: Args, env: Umgebung): Promise<number> {
  const plan = leseSchnittplan(lesJson(pflicht(a, "plan", "Schnittplan als JSON, Ausgabe von «schnitt zuordnen»")));
  const marke = ladeMarke(env, typeof a.opt["marke"] === "string" ? (a.opt["marke"] as string) : plan.projekt.marke);
  const { katalog, notiz } = ladeKatalog(a, env);
  const regeln = typeof a.opt["regeln"] === "string" ? z.array(Regel).parse(lesJson(a.opt["regeln"] as string)) : [];
  const stuecke = ladeBibliothek(env.bibliothek).stuecke.map((g) => g.stueck);
  const text = `${bauAuftrag(plan, { stuecke, katalog, regeln, ...(marke.schnittprofil ? { profil: marke.schnittprofil } : {}) }).join("\n")}\n`;
  if (typeof a.opt["o"] === "string") {
    fs.writeFileSync(a.opt["o"] as string, text);
    console.log(`Auftrag geschrieben: ${a.opt["o"]}`);
  } else console.log(text.trimEnd());
  if (notiz) console.error(notiz);
  return 0;
}

export async function storyboardBefehl(a: Args, env: Umgebung): Promise<number> {
  const plan = leseSchnittplan(lesJson(pflicht(a, "plan", "Schnittplan als JSON, Ausgabe von «schnitt zuordnen»")));
  const ausDatei = pflicht(a, "o", "Zieldatei für den Plan mit Storyboard, zum Beispiel -o plan-storyboard.json");
  const roh = extrahiereJson(fs.readFileSync(pflicht(a, "storyboard", "Antwort von Claude als JSON"), "utf8"));
  const marke = ladeMarke(env, typeof a.opt["marke"] === "string" ? (a.opt["marke"] as string) : plan.projekt.marke);
  const { katalog, notiz } = ladeKatalog(a, env);
  const stuecke = ladeBibliothek(env.bibliothek).stuecke.map((g) => g.stueck);
  const home = studioHome();
  const nurAktive = a.opt["entwurf"] !== true;

  // B-Roll: nur Dateien, die auf diesem Rechner liegen, werden sondiert
  const brollQuellen = new Map<string, SchnittQuelle>();
  const nichtDa: string[] = [];
  const gewuenscht = new Set(
    (Array.isArray((roh as { overlays?: unknown }).overlays) ? ((roh as { overlays: unknown[] }).overlays as Record<string, any>[]) : [])
      .filter((o) => o?.["effekt"] === "broll" && typeof o?.["params"]?.["katalog"] === "string")
      .map((o) => o["params"]["katalog"] as string),
  );
  for (const key of gewuenscht) {
    const k = katalog.find((x) => x.schluessel === key);
    if (!k || k.art !== "video") continue;
    const abs = home ? loesePfad(home, k.pfad) : undefined;
    if (!abs || !fs.existsSync(abs)) {
      nichtDa.push(k.pfad);
      continue;
    }
    brollQuellen.set(key, SchnittQuelle.parse({ id: `broll-${key}`, pfad: k.pfad, ...(await sondiere(abs)) }));
  }

  const r = wendeStoryboardAn(plan, roh, { stuecke, katalog, brollQuellen, nurAktive });
  fs.writeFileSync(ausDatei, `${JSON.stringify(r.plan, null, 2)}\n`);

  console.log(`Hook: ${r.storyboard.hook}`);
  console.log(`Übernommen: ${r.plan.overlays.length} Grafiken, ${r.plan.broll.length} B-Roll, ${r.betont.length} betonte Wörter`);
  if (r.verworfen.length) {
    console.log("\nVerworfen:");
    for (const v of r.verworfen) console.log(`  Eintrag ${v.index + 1}: ${v.grund}`);
  }
  for (const w of r.warnungen) console.log(`Hinweis: ${w}`);
  if (notiz) console.log(`Hinweis: ${notiz}`);
  if (nichtDa.length) console.log(`Hinweis: B-Roll-Dateien nicht auf diesem Rechner: ${nichtDa.join(", ")}`);

  let code = 0;
  if (r.renderListe.length) {
    if (!home) throw new Error("Der Studio-Ordner ist auf diesem Rechner nicht eingerichtet: «studio init» ausführen");
    if (a.opt["rendern"] === true) {
      console.log("\nRendern:");
      for (const g of r.renderListe) {
        const ziel = loesePfad(home, g.datei);
        const res = await rendereStueck(env, g.effekt, { werte: g.werte, dauer: g.dauer, marke, ausgabe: ziel, final: a.opt["final"] === true });
        for (const w of res.warnungen) console.log(`  Hinweis: ${w}`);
        console.log(`  ${g.name}: ${res.pruefung.bestanden ? "bestanden" : "NICHT bestanden"}, ${res.dauer} s, ${(res.renderMs / 1000).toFixed(1)} s Renderzeit → ${g.datei}`);
        if (!res.pruefung.bestanden) {
          code = 1;
          for (const b of res.pruefung.befunde) console.log(`    ${b.stufe === "fehler" ? "FEHLER" : "Hinweis"} ${b.code}: ${b.text}`);
        }
      }
    } else {
      console.log("\nZu rendern (oder dieselbe Eingabe mit --rendern):");
      for (const g of r.renderListe) console.log(`  ${renderBefehl(g, loesePfad(home, g.datei), marke.schluessel)}`);
    }
  }

  const befunde = pruefeSchnittplan(r.plan, { profil: marke.schnittprofil, katalog, stuecke, nurAktive });
  if (befunde.length) {
    console.log("\nPrüfung des Plans:");
    for (const b of befunde) console.log(`${b.stufe === "fehler" ? "FEHLER " : "Hinweis"} ${b.code}: ${b.text}`);
  }
  if (befunde.some((b) => b.stufe === "fehler")) code = 1;
  const dauer = platziere(r.plan);
  console.log(`\nPlan: ${ausDatei} (${r.plan.clips.length} Clips, ${(dauer.gesamtFrames / r.plan.projekt.fps).toFixed(1).replace(".", ",")} s)`);
  console.log("Das Storyboard ist ein Entwurf. Freigegeben ist es, wenn ein Mensch es bestätigt oder per Satz ändert (Plan Kap. 3.5). Änderungen setzen die Freigabe zurück.");
  return code;
}
