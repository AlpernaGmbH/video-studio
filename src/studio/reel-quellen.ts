import fs from "node:fs";
import type { StudioHome } from "../setup";
import { leseSchnittplan } from "../schnitt/plan";
import { juengsteVorschau, reelPfade } from "../schnitt/reel";
import { bogenCollage, erzeugeBogen, type Ausfuehrer, type BogenWerkzeuge } from "../schnitt/kontaktbogen";
import { loesePfad } from "../schnitt/uebergabe";
import { ARTEN, bereinigeQualitaet, type Art, type Quellen } from "./hochladen";

/**
 * Die Dateien eines Reels, wie `tool hochladen` sie ans Tool schickt: die jüngste Vorschau, der Kontaktbogen als ein JPEG, das Gegenlesen, die bereinigten Messwerte
 * und die Shotliste (Text) mit ihrem Bogen. Die Shotliste geht nur hoch, wenn sie nach der Liste von Claude geschrieben wurde (sonst ist sie veraltet).
 * Was es nicht gibt, kommt als Hinweis zurück, nie als Fehler: Wer nur eine Vorschau hat, lädt nur die hoch.
 * Plan, Storyboard und Auftrag gehen bewusst nicht ans Tool (sie tragen Pfade der Quelldateien, Regel 11).
 */
export function reelQuellen(home: StudioHome, id: string, werkzeuge: { lauf?: Ausfuehrer; bogen?: BogenWerkzeuge } = {}): Quellen {
  const p = reelPfade(home, id);

  const datei = (pfad: string, art: Art, fehltText: string, grosseText: string): { bytes: Buffer } | { fehlt: string } => {
    if (!fs.existsSync(pfad) || !fs.statSync(pfad).isFile()) return { fehlt: fehltText };
    if (fs.statSync(pfad).size > ARTEN[art].maxBytes) return { fehlt: grosseText };
    return { bytes: fs.readFileSync(pfad) };
  };

  /** Text und Bogen der Shotliste entstehen aus `shotliste.json`; ist die Liste neuer als die Datei, hat jemand sie geändert, ohne `reel shotliste` aufzurufen. */
  const shotlisteDatei = (pfad: string, art: Art, name: string, code: string): { bytes: Buffer } | { fehlt: string } => {
    const befehl = `«./studio reel shotliste ${code}»`;
    if (!fs.existsSync(pfad)) return { fehlt: `${name} gibt es noch nicht. ${befehl} schreibt sie (zuerst mit --geruest das Gerüst).` };
    if (fs.existsSync(p.shotliste) && fs.statSync(p.shotliste).mtimeMs > fs.statSync(pfad).mtimeMs) return { fehlt: `${name} ist älter als die Liste in shotliste.json. ${befehl} schreibt sie neu.` };
    return datei(pfad, art, "", `${name} ist grösser als ${ARTEN[art].maxBytes / (1024 * 1024)} MB. Sie wird nicht hochgeladen.`);
  };

  return {
    async bereit(art) {
      switch (art) {
        case "vorschau": {
          const v = juengsteVorschau(p.ergebnis);
          return datei(v ?? "", "vorschau", `Es gibt noch keine Vorschau. «./studio reel storyboard ${id}» erzeugt sie.`, "Die Vorschau ist grösser als 50 MB. Sie wird nicht hochgeladen.");
        }
        case "gegenlesen":
          return datei(p.gegenlesen, "gegenlesen", `Es gibt noch kein Gegenlesen. «./studio reel vorbereiten ${id}» schreibt es.`, "Das Gegenlesen ist grösser als 1 MB. Es wird nicht hochgeladen.");
        case "qualitaet": {
          if (!fs.existsSync(p.qualitaet)) return { fehlt: `Noch nicht gemessen. «./studio reel messe ${id}» misst den Export aus Resolve.` };
          try {
            const q = bereinigeQualitaet(JSON.parse(fs.readFileSync(p.qualitaet, "utf8")));
            return { bytes: Buffer.from(`${JSON.stringify(q, null, 2)}\n`, "utf8") };
          } catch (e) {
            return { fehlt: `Die Messwerte lassen sich nicht lesen (${(e as Error).message}). «./studio reel messe ${id}» misst neu.` };
          }
        }
        case "shotliste":
          return shotlisteDatei(p.shotlisteText, "shotliste", "Die Shotliste", id);
        case "shotliste_bogen":
          return shotlisteDatei(p.shotlisteBogen, "shotliste_bogen", "Der Bogen der Shotliste", id);
        case "kontaktbogen": {
          const planPfad = [p.planStoryboard, p.plan].find((x) => fs.existsSync(x));
          if (!planPfad) return { fehlt: `Es gibt noch keinen Plan. «./studio reel vorbereiten ${id}» baut ihn.` };
          let plan;
          try {
            plan = leseSchnittplan(JSON.parse(fs.readFileSync(planPfad, "utf8")));
          } catch {
            return { fehlt: "Der Plan lässt sich nicht lesen." };
          }
          const r = await erzeugeBogen({ plan, loese: (rel) => loesePfad(home, rel), ...(werkzeuge.bogen ? { werkzeuge: werkzeuge.bogen } : {}) });
          if (r.eintraege.length === 0) return { fehlt: "Der Plan hat weder Grafik noch B-Roll: Es gibt keinen Kontaktbogen." };
          if (r.bilder.size === 0) return { fehlt: "Kein Standbild liess sich erzeugen (Grafiken noch nicht gerendert oder Dateien fehlen). «./studio schnitt kontaktbogen» zeigt, was fehlt." };
          const bytes = await bogenCollage(r.bilder, { maxBytes: ARTEN.kontaktbogen.maxBytes, ...(werkzeuge.lauf ? { lauf: werkzeuge.lauf } : {}) });
          return bytes ? { bytes } : { fehlt: "Der Kontaktbogen liess sich nicht zu einem Bild zusammensetzen (ffmpeg fehlt oder das Bild wäre zu gross)." };
        }
      }
    },
  };
}
