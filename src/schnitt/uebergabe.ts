import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { KatalogEintrag, Schnittprofil } from "../core/schemas";
import { relPath, resolveInRoot } from "../core/paths";
import type { Stueck } from "../motion/stueck";
import type { AudioPreset, ExportPreset } from "../presets/schema";
import { GROSSE_UNTERORDNER, medienOrdner, type StudioHome } from "../setup";
import { schreibeFcpxml, type PfadLoeser } from "./fcpxml";
import { schreibeOtio } from "./otio";
import { platziere, sekunden, type Schnittplan } from "./plan";
import { pruefeSchnittplan, verlangeGueltig, type Befund } from "./pruefung";
import { gruppiere, schreibeSrt, woerterAufTimeline } from "./untertitel";

/**
 * Die Übergabe an DaVinci Resolve: ein Ordner mit der Timeline (FCPXML 1.8 und OTIO), den Untertiteln (SRT), den Grafiken als ProRes 4444
 * und einer Anleitung. Resolve wird nicht gesteuert, es liest nur Dateien (docs/plan/editing-blueprint.md).
 */

/** Wo eine Datei aus dem Plan auf diesem Rechner liegt: Rohmaterial, Renders und Inspiration im Medien-Ordner, alles andere im Studio-Ordner. */
export function loesePfad(home: StudioHome, rel: string): string {
  const sauber = relPath(rel);
  const erste = sauber.split("/")[0]!;
  const wurzel = (GROSSE_UNTERORDNER as readonly string[]).includes(erste) ? medienOrdner(home) : home.pfad;
  return resolveInRoot(wurzel, sauber);
}

/** Legt einen Ordner an, der es noch nicht gibt: `resolve`, dann `resolve-v2`, `resolve-v3`. Ein vorhandenes Resolve-Projekt wird nie überschrieben. */
export function freierOrdner(basis: string): string {
  if (!fs.existsSync(basis)) return basis;
  for (let n = 2; n < 1000; n++) {
    const p = `${basis}-v${n}`;
    if (!fs.existsSync(p)) return p;
  }
  throw new Error(`Zu viele Fassungen unter ${basis}`);
}

/** ffmpeg-Argumente: WebM (VP9 mit Alpha) nach ProRes 4444 mit Alpha. Der VP9-Decoder von libvpx muss es sein, der eingebaute verwirft den Alphakanal. */
export function webmZuProRes(ein: string, aus: string): string[] {
  return ["-y", "-loglevel", "error", "-c:v", "libvpx-vp9", "-i", ein, "-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le", "-vendor", "apl0", "-an", aus];
}

export interface UebergabeOptionen {
  plan: Schnittplan;
  home: StudioHome;
  /** Zielordner. Fehlt er, gilt <Studio>/inhalte/<Inhalt-ID>/ergebnis/resolve. */
  aus?: string;
  profil?: Schnittprofil;
  katalog?: KatalogEintrag[];
  stuecke?: Stueck[];
  /** Nur aktive Stücke (Standard) oder auch Entwürfe zulassen. */
  nurAktive?: boolean;
  export: ExportPreset;
  audio: AudioPreset;
  /** Fehlende Quelldateien sind ein Fehler (Standard) oder nur ein Hinweis. */
  strikt?: boolean;
  /** Ersetzt ffmpeg in Tests. */
  konvertiere?: (ein: string, aus: string) => void;
}

export interface UebergabeErgebnis {
  ordner: string;
  dateien: string[];
  befunde: Befund[];
  fehlendeDateien: string[];
  umgewandelt: string[];
  dauer: number;
  untertitel: number;
}

function konvertiereMitFfmpeg(ein: string, aus: string): void {
  const r = spawnSync("ffmpeg", webmZuProRes(ein, aus), { encoding: "utf8" });
  if (r.error) throw new Error(`ffmpeg nicht gefunden: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`ffmpeg konnte ${ein} nicht nach ProRes 4444 umwandeln: ${r.stderr.trim().split("\n").pop()}`);
}

export function erzeugeUebergabe(o: UebergabeOptionen): UebergabeErgebnis {
  const { plan, home } = o;
  const befunde = pruefeSchnittplan(plan, { profil: o.profil, katalog: o.katalog, stuecke: o.stuecke, nurAktive: o.nurAktive, maxSekunden: o.export.maxSekunden });
  verlangeGueltig(befunde);

  const basis = o.aus ? path.resolve(o.aus) : plan.projekt.inhalt ? path.join(home.pfad, "inhalte", plan.projekt.inhalt, "ergebnis", "resolve") : undefined;
  if (!basis) throw new Error("Zielordner fehlt: --aus <Ordner> angeben oder dem Plan eine Inhalt-ID geben (projekt.inhalt)");
  const ordner = freierOrdner(basis);

  // Fehlende Quelldateien
  const fehlend: string[] = [];
  for (const q of plan.quellen) if (!fs.existsSync(loesePfad(home, q.pfad))) fehlend.push(q.pfad);
  for (const ov of plan.overlays) if (!fs.existsSync(loesePfad(home, ov.datei))) fehlend.push(ov.datei);
  if (fehlend.length && o.strikt !== false) {
    throw new Error(`Diese Dateien fehlen auf diesem Rechner (nicht synchronisiert, Laufwerk nicht angeschlossen?):\n${fehlend.map((f) => `  ${f}`).join("\n")}`);
  }
  for (const f of fehlend) befunde.push({ stufe: "hinweis", code: "datei-fehlt", text: `Datei fehlt auf diesem Rechner: ${f}. Resolve zeigt sie offline an` });

  fs.mkdirSync(ordner, { recursive: true });
  const konvertiere = o.konvertiere ?? konvertiereMitFfmpeg;

  // Grafiken: WebM wird ProRes 4444, MOV bleibt wo es ist
  const umgewandelt: string[] = [];
  const grafikZiel = new Map<string, string>();
  for (const ov of plan.overlays) {
    if (!/\.webm$/i.test(ov.datei) || grafikZiel.has(ov.datei)) continue;
    const ein = loesePfad(home, ov.datei);
    const name = `${path.basename(ov.datei).replace(/\.webm$/i, "")}.mov`;
    let ziel = path.join(ordner, "overlays", name);
    for (let n = 2; [...grafikZiel.values()].includes(ziel); n++) ziel = path.join(ordner, "overlays", name.replace(/\.mov$/, `-${n}.mov`));
    fs.mkdirSync(path.dirname(ziel), { recursive: true });
    if (!fehlend.includes(ov.datei)) {
      konvertiere(ein, ziel);
      umgewandelt.push(path.relative(ordner, ziel));
    }
    grafikZiel.set(ov.datei, ziel);
  }
  const loeser: PfadLoeser = (rel, art) => (art === "overlay" && grafikZiel.has(rel) ? grafikZiel.get(rel)! : loesePfad(home, rel));

  const zeit = platziere(plan);
  const dateien: string[] = [];
  const schreibe = (name: string, inhalt: string) => {
    fs.writeFileSync(path.join(ordner, name), inhalt);
    dateien.push(name);
  };
  schreibe("timeline.fcpxml", schreibeFcpxml(plan, loeser));
  schreibe("timeline.otio", schreibeOtio(plan, loeser));

  let seiten = 0;
  if (plan.woerter.length) {
    const woerter = woerterAufTimeline(plan, zeit);
    const profil = o.profil ?? { woerterJeUntertitel: { min: 2, max: 3 } };
    const gruppen = gruppiere(woerter, profil);
    seiten = gruppen.length;
    if (gruppen.length) schreibe("untertitel.srt", schreibeSrt(gruppen, plan.projekt.fps));
  }
  schreibe("plan.json", JSON.stringify(plan, null, 2) + "\n");

  const dauer = sekunden(zeit.gesamtFrames, plan.projekt.fps);
  schreibe("LIESMICH.md", liesmich({ plan, dauer, seiten, befunde, export: o.export, audio: o.audio, umgewandelt, dateien: [...dateien, "LIESMICH.md"] }));
  return { ordner, dateien, befunde, fehlendeDateien: fehlend, umgewandelt, dauer, untertitel: seiten };
}

/* ---------- Anleitung ---------- */

const s1 = (n: number): string => n.toFixed(1).replace(".", ",");

export function liesmich(a: { plan: Schnittplan; dauer: number; seiten: number; befunde: Befund[]; export: ExportPreset; audio: AudioPreset; umgewandelt: string[]; dateien: string[] }): string {
  const { plan, export: e, audio } = a;
  const hinweise = a.befunde.filter((b) => b.stufe === "hinweis");
  const mbit = (e.bitrateMbit.min + e.bitrateMbit.max) / 2;
  return `# ${plan.projekt.name} in DaVinci Resolve

Marke ${plan.projekt.marke}${plan.projekt.inhalt ? `, Inhalt ${plan.projekt.inhalt}` : ""}. Länge ${s1(a.dauer)} s, ${plan.clips.length} Clips, ${plan.broll.length} B-Roll, ${plan.overlays.length} Grafiken${a.seiten ? `, ${a.seiten} Untertitel-Seiten` : ""}.

Alles in diesem Ordner hat Claude aus \`plan.json\` erzeugt. Resolve wird nicht gesteuert, es liest nur diese Dateien. Ab dem Import gehört das Projekt dir: Was du in Resolve änderst, bleibt in Resolve. Eine neue Fassung aus dem Plan liegt immer in einem neuen Ordner (\`resolve-v2\`) und überschreibt dein Projekt nie.

**Nicht in Resolve geprüft.** Die Dateien sind gegen Apples FCPXML-Beschreibung (1.8) und mit OpenTimelineIO gegengelesen, aber noch nie in Resolve geöffnet worden (Test T9 in docs/plan/editing-blueprint.md). Wenn etwas nicht passt, steht unten, was du versuchen kannst.

## Was im Ordner liegt

| Datei | Inhalt |
|---|---|
${a.dateien
  .map((d) => `| \`${d}\` | ${{ "timeline.fcpxml": "Timeline als FCPXML 1.8: Sprache auf V1/A1, B-Roll V2, Grafiken V3, Musik A2", "timeline.otio": "dieselbe Timeline als OpenTimelineIO, falls die FCPXML Probleme macht", "untertitel.srt": "Untertitel Wort für Wort, 2 bis 3 Wörter je Seite", "plan.json": "der Schnittplan, aus dem alles entstanden ist", "LIESMICH.md": "diese Anleitung" }[d] ?? d} |`)
  .join("\n")}${a.umgewandelt.length ? `\n| \`overlays/\` | ${a.umgewandelt.length} Grafik${a.umgewandelt.length === 1 ? "" : "en"} als ProRes 4444 mit Transparenz (aus WebM umgewandelt) |` : ""}

## Vor dem Import

1. In Resolve ein neues Projekt anlegen. Unter Projekteinstellungen die Timeline-Auflösung auf ${plan.projekt.breite}×${plan.projekt.hoehe} und die Bildrate auf ${plan.projekt.fps} stellen, **bevor** die erste Timeline entsteht. **[Wahrscheinlich]** Die Bildrate lässt sich später nicht mehr ändern.
2. Die Quelldateien müssen auf diesem Rechner liegen, nicht nur in OneDrive als Platzhalter («Immer auf diesem Gerät behalten»).

## Import

1. Datei, Importieren, Timeline (File, Import, Timeline), \`timeline.fcpxml\` wählen. Die Option «Quelldateien automatisch importieren» einschalten.
2. Klappt das nicht oder liegen B-Roll und Grafiken falsch, denselben Weg mit \`timeline.otio\`. **[Vermutung]** OTIO setzt jede Spur an eine feste Position, FCPXML hängt B-Roll und Grafiken an die Clips der Sprache.
3. Untertitel: Datei, Importieren, Untertitel (File, Import, Subtitle), \`untertitel.srt\`. Aussehen und Grösse stellst du in Resolve ein. Das Caption-Preset der Marke steckt im gerenderten Caption-Overlay, nicht in der SRT.

## Danach von Hand

- Look: Der Look der Marke ${plan.projekt.marke} sitzt auf den Kamera-Clips, nicht auf den Grafiken. Eine LUT liegt noch nicht vor (Markenprofil, Feld «look»).
- Ton: Ziel ${audio.zielLufs} LUFS (±${audio.toleranzLu} LU) bei höchstens ${audio.spitzeDbtp} dBTP, Preset «${audio.id}».${audio.musikPegelDb !== undefined ? ` Die Musik liegt auf ${audio.musikPegelDb} dB.` : ""}
- Grafiken ansehen: Auf V3 muss der Hintergrund transparent bleiben. Wenn er schwarz ist, die Grafik als PNG-Folge neu rendern lassen.

## Export (Deliver)

Preset «${e.id}»: ${e.container.toUpperCase()}, H.264, ${e.breite}×${e.hoehe}, ${e.fps} Bilder pro Sekunde, Bitrate begrenzen auf rund ${Math.round(mbit * 1000)} kbit/s (Bereich ${e.bitrateMbit.min} bis ${e.bitrateMbit.max} Mbit/s), Ton AAC bis ${e.audioKbit.max} kbit/s, ${e.audioRate / 1000} kHz, Farbraum Rec. 709.

Danach die fertige Datei prüfen lassen:

\`\`\`
npm run studio -- schnitt export-pruefen <datei.mp4> --preset ${e.id} --audio ${audio.id}
\`\`\`

## Stellen, die Claude beim Schnitt auffielen

${hinweise.length ? hinweise.map((h) => `- ${h.text}`).join("\n") : "Keine."}
`;
}
