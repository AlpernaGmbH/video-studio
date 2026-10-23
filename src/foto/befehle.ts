import { spawnSync } from "node:child_process";
import path from "node:path";
import type { Args } from "../args";
import { findeSchrift } from "../katalog/bogen";
import { ladeMarke, type Umgebung } from "../motion/werkstatt";
import { medienOrdner, studioHome } from "../setup";
import { batchDir, batchId, erzeugeMuster, FOTO_TYPEN, liesStand, pruefeTypUndMarke, wendeAn, type FotoTyp } from "./batch";
import { ladeFotoLooks, looksFuerMuster } from "./looks";
import { loeseOrdnerAuf, type Wurzel } from "./ordner";
import { shellText as shellWort } from "../shelltext";
import { echteWerkzeuge, type FotoWerkzeuge } from "./werkzeug";

export const FOTO_HILFE = `Foto-Batch (JPEG-Fotos, V-Log oder fertig gerechnet; die Originale bleiben unangetastet)
  foto muster <ordner> --typ kunde|bts [--marke key] [--profil auto|vlog|standard] [--belichtung -3..3] [--nicht-oeffnen]
                                      Bogen mit drei Fotos: Basis und die Looks nebeneinander. Der Ordner liegt im Medien-Ordner (relativ oder absolut).
                                      Kundenfotos brauchen --marke <Kunde>; hinter den Kulissen gilt «alperna».
  foto anwenden <ordner> --look <id> --mensch --by Name [--neu] [--exif-behalten] [--parallel 3]
                                      Den gewählten Look auf alle Fotos: Ergebnis in <ordner>/bearbeitet-<look>/. Die Wahl trifft ein Mensch.
  foto status <ordner>                Stand zum Ordner: Muster, Wahl, Ergebnis
  foto looks [--marke key]            Die Looks, die ein Muster zeigt`;

export interface FotoGeraete {
  werkzeuge?: FotoWerkzeuge;
  /** Schrift für die Beschriftung des Bogens; `null` heisst: keine, `undefined`: suchen. */
  schrift?: string | null;
  oeffne?: (pfad: string) => void;
  jetzt?: () => string;
}

const oeffneStandard = (pfad: string): void => {
  if (process.platform === "darwin") spawnSync("open", [pfad]);
};

function zahl(a: Args, name: string, von: number, bis: number, standard: number): number {
  const roh = a.opt[name];
  if (roh === undefined) return standard;
  const n = typeof roh === "string" ? Number(roh) : NaN;
  if (!Number.isFinite(n) || n < von || n > bis) throw new Error(`--${name} erwartet eine Zahl von ${von} bis ${bis}`);
  return n;
}

/** Die Ordner, in denen Fotos liegen dürfen: der Studio-Ordner und, wenn es einen eigenen gibt, der Medien-Ordner. */
function wurzeln(): Wurzel[] {
  const home = studioHome();
  if (!home) throw new Error("Der Studio-Ordner ist auf diesem Rechner nicht eingerichtet: «./studio init» ausführen");
  const liste: Wurzel[] = [{ name: "studio", pfad: home.pfad }];
  const medien = medienOrdner(home);
  if (path.resolve(medien) !== path.resolve(home.pfad)) liste.push({ name: "medien", pfad: medien });
  return liste;
}

const looksDir = (env: Umgebung): string => path.join(env.studioRoot, "library", "foto-looks");

export async function fotoBefehl(sub: string, a: Args, env: Umgebung, geraete: FotoGeraete = {}): Promise<number> {
  const werkzeuge = geraete.werkzeuge ?? echteWerkzeuge;
  const jetzt = geraete.jetzt ?? ((): string => new Date().toISOString());
  const zeile = (t: string): void => console.log(t);
  switch (sub) {
    case "looks": {
      const key = typeof a.opt["marke"] === "string" ? a.opt["marke"] : undefined;
      const looks = key ? looksFuerMuster(ladeMarke(env, key), ladeFotoLooks(looksDir(env))) : ladeFotoLooks(looksDir(env));
      for (const l of looks) zeile(`${l.id.padEnd(18)} ${l.name}: ${l.stimmung}`);
      zeile(`\n${looks.length} Looks. Die Zahlen sind Vorschläge zum Ausprobieren, nicht belegt. Eigene Looks: eine Datei je Look unter library/foto-looks/.`);
      return 0;
    }
    case "muster": {
      const eingabe = a.pos[2];
      if (!eingabe) throw new Error("Der Fotoordner fehlt: ./studio foto muster <ordner> --typ kunde|bts");
      const typ = a.opt["typ"];
      if (typeof typ !== "string" || !(FOTO_TYPEN as readonly string[]).includes(typ)) throw new Error(`--typ kunde oder --typ bts angeben (Kundenfotos und Fotos hinter den Kulissen werden getrennt geführt)`);
      const markenKey = pruefeTypUndMarke(typ as FotoTyp, typeof a.opt["marke"] === "string" ? a.opt["marke"] : undefined);
      const profilRoh = a.opt["profil"] === undefined ? "auto" : a.opt["profil"];
      if (profilRoh !== "auto" && profilRoh !== "vlog" && profilRoh !== "standard") throw new Error("--profil erwartet auto, vlog oder standard");
      const belichtung = zahl(a, "belichtung", -3, 3, 0);
      const ordner = loeseOrdnerAuf(eingabe, wurzeln());
      const schrift = geraete.schrift === undefined ? findeSchrift() : (geraete.schrift ?? undefined);
      const r = await erzeugeMuster({
        ordner,
        datenDir: env.datenDir,
        typ: typ as FotoTyp,
        marke: ladeMarke(env, markenKey),
        ablage: ladeFotoLooks(looksDir(env)),
        profil: profilRoh,
        belichtung,
        schrift,
        werkzeuge,
        jetzt,
        protokoll: zeile,
      });
      zeile(`\nMuster: ${r.bogen}`);
      zeile(`Legende: ${r.legende}`);
      zeile(`Profil: ${r.stand.profil} (${r.stand.profilQuelle}), ${r.stand.fotos} Fotos, ${r.stand.looks.length} Looks: ${r.stand.looks.map((l) => l.id).join(", ")}`);
      if (r.stand.unlesbar.length) zeile(`Nicht lesbar: ${r.stand.unlesbar.join(", ")}`);
      zeile(`\nNächster Schritt: den Bogen ansehen. Die Basis muss wie ein normales Foto aussehen. Dann wählt ein Mensch:\n  ./studio foto anwenden ${shellWort(r.stand.ordner)} --look <id> --mensch --by <Name>`);
      if (!a.opt["nicht-oeffnen"]) (geraete.oeffne ?? oeffneStandard)(r.bogen);
      return 0;
    }
    case "anwenden": {
      const eingabe = a.pos[2];
      if (!eingabe) throw new Error("Der Fotoordner fehlt: ./studio foto anwenden <ordner> --look <id> --mensch --by Name");
      const look = a.opt["look"];
      if (typeof look !== "string") throw new Error("--look <id> fehlt (die Looks des Musters stehen in muster.md)");
      if (a.opt["mensch"] !== true) {
        throw new Error("Die Wahl des Looks trifft ein Mensch. Gib --mensch --by <Name> nur an, wenn ein Mensch dir den Befehl mit seinem Namen diktiert hat. Sonst nur das Muster zeigen und warten");
      }
      const von = typeof a.opt["by"] === "string" ? a.opt["by"].trim() : "";
      if (!von) throw new Error("--by <Name> fehlt (bei der Wahl des Looks ist der Name Pflicht)");
      const ordner = loeseOrdnerAuf(eingabe, wurzeln());
      const stand = liesStand(batchDir(env.datenDir, batchId(ordner.rel, ordner.wurzel)));
      if (!stand) throw new Error(`Für diesen Ordner gibt es noch kein Muster. Zuerst: ./studio foto muster ${shellWort(eingabe)} --typ kunde|bts`);
      const r = await wendeAn({
        ordner,
        datenDir: env.datenDir,
        marke: ladeMarke(env, stand.marke),
        ablage: ladeFotoLooks(looksDir(env)),
        look,
        von,
        neu: a.opt["neu"] === true,
        exifBehalten: a.opt["exif-behalten"] === true,
        parallel: Math.round(zahl(a, "parallel", 1, 8, 3)),
        werkzeuge,
        jetzt,
        protokoll: zeile,
      });
      zeile(`\n${r.ok} neu bearbeitet, ${r.vorhanden} waren schon da, ${r.fehler.length} Fehler. Ergebnis: ${r.ausgabe}`);
      for (const f of r.fehler.slice(0, 10)) zeile(`  Fehler: ${f.datei}: ${f.grund}`);
      if (r.fehler.length > 10) zeile(`  … und ${r.fehler.length - 10} weitere (foto-batch.json im Ergebnisordner)`);
      zeile("Die Originale sind unverändert. Metadaten (auch der Aufnahmeort) sind in den Ergebnissen entfernt, ausser mit --exif-behalten.");
      return r.fehler.length ? 1 : 0;
    }
    case "status": {
      const eingabe = a.pos[2];
      if (!eingabe) throw new Error("Der Fotoordner fehlt: ./studio foto status <ordner>");
      const ordner = loeseOrdnerAuf(eingabe, wurzeln());
      const rel = ordner.rel;
      const stand = liesStand(batchDir(env.datenDir, batchId(rel, ordner.wurzel)));
      if (!stand) {
        zeile(`Noch kein Muster für ${rel}. Anfangen mit: ./studio foto muster ${shellWort(rel)} --typ kunde|bts`);
        return 0;
      }
      zeile(`${stand.ordner}: ${stand.typ === "kunde" ? "Kundenfotos" : "hinter den Kulissen"}, Marke «${stand.marke}», ${stand.fotos} Fotos, Profil ${stand.profil}`);
      zeile(`Muster vom ${stand.erstellt}: ${stand.looks.map((l) => l.id).join(", ")}`);
      zeile(stand.gewaehlt ? `Gewählt: «${stand.gewaehlt.look}» von ${stand.gewaehlt.von} am ${stand.gewaehlt.am}` : "Gewählt: noch nichts (ein Mensch wählt am Muster)");
      zeile(stand.angewendet ? `Angewendet: ${stand.angewendet.ok} neu, ${stand.angewendet.vorhanden} vorhanden, ${stand.angewendet.fehler.length} Fehler, in ${stand.angewendet.ausgabe}` : "Angewendet: noch nichts");
      return 0;
    }
    default:
      throw new Error(`Unbekannter Befehl «foto ${sub}». ${FOTO_HILFE}`);
  }
}
