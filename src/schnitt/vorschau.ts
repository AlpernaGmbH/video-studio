import fs from "node:fs";
import { lauf } from "../presets/messen";
import { alsZahl, fpsBruch, inFrames } from "./raster";
import { externerTon, platziere, quelleNach, sekunden, type Schnittplan } from "./plan";

/**
 * Vorschau-Video aus dem Schnittplan (Plan v3, Editor 1: «Vorschau-Video 540p»): Clips mit Zoom, B-Roll, Grafiken, Musik und auf Wunsch Untertitel zu einer MP4, damit ein Mensch
 * das Ergebnis sieht, bevor Resolve geöffnet wird. Gerechnet wird mit ffmpeg in einem einzigen Filtergraphen. Die Vorschau ist eine Näherung: kein Look, keine Übergänge,
 * die Federbewegung des Zoom-Punch fehlt, die Tonmischung ist roh. Als fertiges Video taugt sie nicht (540p, hohe Kompression).
 */

export const VORSCHAU_BREITE = 540;
export const VORSCHAU_HOEHE = 960;

export interface VorschauOptionen {
  plan: Schnittplan;
  /** Löst einen Pfad aus dem Plan auf diesem Rechner auf (`loesePfad`). */
  loese: (rel: string, art: "quelle" | "overlay") => string;
  ausgabe: string;
  /** SRT-Datei, die ins Bild gebrannt wird (braucht ffmpeg mit libass). */
  untertitel?: string;
  /**
   * LUTs (.cube) für den Look: «log» für Quellen mit `farbe: "log"`, «angleich» für alle anderen Videoquellen (normales Material, B-Roll). Die Grafiken auf V3 bekommen nie einen Look.
   * Ohne LUT bleibt das Bild unverändert.
   */
  lut?: { log?: string; angleich?: string };
  breite?: number;
  hoehe?: number;
}

const gerade = (x: number): number => Math.max(2, Math.round(x / 2) * 2);
const zahl = (x: number): string => String(Math.round(x * 100000) / 100000);
/** Pfad für den Filter `subtitles`: Doppelpunkt, Backslash und Apostroph müssen maskiert werden. */
const filterPfad = (p: string): string => p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\\\\\'");

/** Die Argumente für ffmpeg (rein, ohne Dateizugriff). */
export function vorschauArgs(o: VorschauOptionen): string[] {
  const { plan } = o;
  const W = o.breite ?? VORSCHAU_BREITE;
  const H = o.hoehe ?? VORSCHAU_HOEHE;
  const fps = plan.projekt.fps;
  const bruch = fpsBruch(fps);
  const fpsText = `${bruch.n}/${bruch.d}`;
  const zeit = platziere(plan);
  const quellen = quelleNach(plan);
  const gesamt = sekunden(zeit.gesamtFrames, fps);

  const eingaben: string[] = [];
  let n = 0;
  const eingang = (args: string[]): number => {
    eingaben.push(...args);
    return n++;
  };
  const filter: string[] = [];
  /** Der Look einer Videoquelle als Filter, oder nichts. */
  const look = (q: { farbe?: "log" | "rec709" }): string => {
    const datei = q.farbe === "log" ? o.lut?.log : o.lut?.angleich;
    return datei ? `,lut3d=file='${filterPfad(datei)}'` : "";
  };
  /** Das Bild füllt den Ausschnitt ganz (Zuschnitt statt Ränder), dann optional der Zoom. */
  const deckend = (i: number, extra = ""): string => `[${i}:v]fps=${fpsText},scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}${extra},setsar=1`;

  // V1/A1: die Sprache
  const teile: string[] = [];
  zeit.clips.forEach((p, k) => {
    const dauer = p.frames / fps;
    const q = p.quelle;
    const i = eingang(["-ss", zahl(alsZahl(p.quellStart)), "-t", zahl(dauer + 2 / fps), "-i", o.loese(q.pfad, "quelle")]);
    const zoom = p.clip.zoom !== 1 ? `,scale=${gerade(W * p.clip.zoom)}:${gerade(H * p.clip.zoom)},crop=${W}:${H}` : "";
    filter.push(`${deckend(i, zoom + look(q))},setpts=PTS-STARTPTS,trim=end_frame=${p.frames},setpts=PTS-STARTPTS[v${k}]`);
    const ton = externerTon(q, quellen);
    if (ton) {
      // Sprache von der Tonaufnahme: Zeit in der Aufnahme = Zeit im Video + Versatz
      const von = ton.audio.start + alsZahl(p.quellStart) + ton.versatz;
      if (von < -1 / fps) throw new Error(`Clip «${p.clip.id}» liegt vor dem Beginn der Tonaufnahme «${ton.audio.id}» (Versatz ${ton.versatz} s)`);
      const j = eingang(["-ss", zahl(Math.max(0, von)), "-t", zahl(dauer + 2 / fps), "-i", o.loese(ton.audio.pfad, "quelle")]);
      filter.push(`[${j}:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=duration=${zahl(dauer)},asetpts=PTS-STARTPTS[a${k}]`);
    } else if (q.hatAudio) filter.push(`[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=duration=${zahl(dauer)},asetpts=PTS-STARTPTS[a${k}]`);
    else filter.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${zahl(dauer)},asetpts=PTS-STARTPTS[a${k}]`);
    teile.push(`[v${k}][a${k}]`);
  });
  filter.push(`${teile.join("")}concat=n=${zeit.clips.length}:v=1:a=1[vbasis][abasis]`);

  let aktuell = "vbasis";
  let schicht = 0;
  const lege = (label: string, t: number, dauer: number): void => {
    const von = inFrames(t, fps) / fps;
    const naechstes = `vl${++schicht}`;
    filter.push(`[${aktuell}][${label}]overlay=enable='between(t,${zahl(von)},${zahl(von + dauer)})':eof_action=pass:format=auto[${naechstes}]`);
    aktuell = naechstes;
  };

  // V2: B-Roll, stumm
  plan.broll.forEach((b, k) => {
    const q = quellen.get(b.quelle);
    if (!q) return;
    const i = eingang(["-ss", zahl(b.von), "-t", zahl(b.dauer + 2 / fps), "-i", o.loese(q.pfad, "quelle")]);
    const start = inFrames(b.t, fps) / fps;
    filter.push(`${deckend(i, look(q))},setpts=PTS-STARTPTS+${zahl(start)}/TB[b${k}]`);
    lege(`b${k}`, b.t, b.dauer);
  });

  // V3: Grafiken mit Alpha (VP9 braucht den libvpx-Decoder, sonst geht der Alphakanal verloren)
  plan.overlays.forEach((g, k) => {
    const i = eingang(["-c:v", "libvpx-vp9", "-i", o.loese(g.datei, "overlay")]);
    const start = inFrames(g.t, fps) / fps;
    filter.push(`[${i}:v]fps=${fpsText},scale=${W}:${H},format=rgba,setpts=PTS-STARTPTS+${zahl(start)}/TB[g${k}]`);
    lege(`g${k}`, g.t, g.dauer);
  });

  if (o.untertitel) {
    filter.push(`[${aktuell}]subtitles='${filterPfad(o.untertitel)}':force_style='Alignment=2,MarginV=60,FontSize=16,Outline=2'[vtitel]`);
    aktuell = "vtitel";
  }
  filter.push(`[${aktuell}]format=yuv420p[vout]`);

  // A2: Musik
  let ton = "abasis";
  if (plan.musik) {
    const m = plan.musik;
    const q = quellen.get(m.quelle);
    if (q) {
      const i = eingang(["-ss", zahl(m.von), "-i", o.loese(q.pfad, "quelle")]);
      const ms = Math.round((inFrames(m.t, fps) / fps) * 1000);
      const laenge = Math.max(0.1, Math.min(m.dauer ?? gesamt, gesamt - m.t));
      filter.push(`[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${m.pegelDb}dB,atrim=duration=${zahl(laenge)},adelay=${ms}|${ms}[musik]`);
      filter.push(`[abasis][musik]amix=inputs=2:duration=first:normalize=0[amix]`);
      ton = "amix";
    }
  }
  filter.push(`[${ton}]alimiter=limit=0.95[aout]`);

  return ["-loglevel", "error", "-y", ...eingaben, "-filter_complex", filter.join(";"), "-map", "[vout]", "-map", "[aout]", "-r", fpsText, "-c:v", "libx264", "-preset", "veryfast", "-crf", "27", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", o.ausgabe];
}

export async function erzeugeVorschau(o: VorschauOptionen): Promise<{ datei: string; dauer: number }> {
  const r = await lauf("ffmpeg", vorschauArgs(o));
  if (r.code !== 0) throw new Error(`ffmpeg schlug fehl: ${r.stderr.trim().split("\n").slice(-4).join(" | ")}`);
  return { datei: o.ausgabe, dauer: sekunden(platziere(o.plan).gesamtFrames, o.plan.projekt.fps) };
}

/** Dateien, die die Vorschau braucht und die auf diesem Rechner fehlen (Quellen der Clips und der B-Roll, Musik, Grafiken). */
export function fehlendeDateien(plan: Schnittplan, loese: VorschauOptionen["loese"]): string[] {
  const quellen = quelleNach(plan);
  const benutzt = new Set<string>([...plan.clips.map((c) => c.quelle), ...plan.broll.map((b) => b.quelle), ...(plan.musik ? [plan.musik.quelle] : [])]);
  for (const c of plan.clips) {
    const t = quellen.get(c.quelle)?.ton;
    if (t) benutzt.add(t.quelle);
  }
  const pfade = [...benutzt].map((id) => quellen.get(id)).filter((q): q is NonNullable<typeof q> => !!q).map((q) => loese(q.pfad, "quelle"));
  pfade.push(...plan.overlays.map((o) => loese(o.datei, "overlay")));
  return [...new Set(pfade)].filter((p) => !fs.existsSync(p));
}

/** Ob dieses ffmpeg Untertitel einbrennen kann (libass). */
export async function kannUntertitel(): Promise<boolean> {
  const r = await lauf("ffmpeg", ["-hide_banner", "-filters"]);
  return r.code === 0 && /\ssubtitles\s/.test(r.stdout);
}
