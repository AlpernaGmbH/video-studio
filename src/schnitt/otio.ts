import { pathToFileURL } from "node:url";
import { alsZahl, fpsBruch, inFrames } from "./raster";
import { platziere, quelleNach, sekunden, type Schnittplan, type SchnittQuelle } from "./plan";
import type { PfadLoeser } from "./fcpxml";

/**
 * OpenTimelineIO (JSON) aus dem Schnittplan, als Gegenstück zur FCPXML-Datei. Resolve liest OTIO ebenfalls als Timeline.
 * Wir schreiben Clip.1 und ExternalReference.1: Diese Schemaversionen lesen alle OTIO-Versionen, neuere wandeln sie selbst um.
 *
 * Spuren: V1 und A1 die Sprache, V2 B-Roll, V3 Grafiken, A2 Musik. Lücken sind echte `Gap`-Elemente.
 */

/** OTIO rechnet mit Dezimalraten. NTSC bleibt exakt (30000/1001), sonst driftet die Timeline. */
const rateVon = (fps: number): number => alsZahl(fpsBruch(fps));

const T = (wert: number, rate: number) => ({ OTIO_SCHEMA: "RationalTime.1", rate, value: wert });
const R = (start: number, dauer: number, rate: number) => ({ OTIO_SCHEMA: "TimeRange.1", duration: T(dauer, rate), start_time: T(start, rate) });

function referenz(q: { name: string; url: string; startSek: number; dauerSek: number; fps: number }) {
  const rate = rateVon(q.fps);
  return {
    OTIO_SCHEMA: "ExternalReference.1",
    metadata: {},
    name: q.name,
    available_range: R(inFrames(q.startSek, q.fps), inFrames(q.dauerSek, q.fps), rate),
    target_url: q.url,
  };
}

function clip(name: string, ref: ReturnType<typeof referenz>, start: number, dauer: number, rate: number, metadata: Record<string, unknown> = {}) {
  return { OTIO_SCHEMA: "Clip.1", metadata, name, source_range: R(start, dauer, rate), effects: [], markers: [], enabled: true, media_reference: ref };
}

const gap = (dauer: number, rate: number) => ({ OTIO_SCHEMA: "Gap.1", metadata: {}, name: "", source_range: R(0, dauer, rate), effects: [], markers: [], enabled: true });

function spur(name: string, kind: "Video" | "Audio", children: unknown[]) {
  return { OTIO_SCHEMA: "Track.1", metadata: {}, name, source_range: null, effects: [], markers: [], enabled: true, children, kind };
}

/** Füllt eine Spur bis zur Timeline-Position `frame` mit einer Lücke auf, wenn nötig. */
function luecke(kinder: unknown[], aktuell: number, frame: number, rate: number): number {
  if (frame > aktuell) kinder.push(gap(frame - aktuell, rate));
  return Math.max(frame, aktuell);
}

export function schreibeOtio(plan: Schnittplan, loese: PfadLoeser): string {
  const fps = plan.projekt.fps;
  const zeit = platziere(plan);
  const quellen = quelleNach(plan);
  const url = (rel: string, art: "quelle" | "overlay") => pathToFileURL(loese(rel, art)).href;
  /** Bei Audioquellen zählt die Abtastrate, bei Videoquellen die Bildrate. */
  const quellRate = (q: SchnittQuelle): number => q.fps ?? q.audioRate;
  const quellRef = (q: SchnittQuelle) => referenz({ name: q.id, url: url(q.pfad, "quelle"), startSek: q.start, dauerSek: q.dauer, fps: quellRate(q) });
  const roh = (q: SchnittQuelle, sek: number) => inFrames(q.start + sek, quellRate(q));

  const v1: unknown[] = [];
  const a1: unknown[] = [];
  for (const p of zeit.clips) {
    const q = p.quelle;
    const dauerQuelle = inFrames(sekunden(p.frames, fps), q.fps!);
    const meta = { studio: { clip: p.clip.id, zeile: p.clip.zeile ?? null, zoom: p.clip.zoom, notiz: p.clip.notiz } };
    v1.push(clip(p.clip.id, quellRef(q), roh(q, p.clip.von), dauerQuelle, rateVon(q.fps!), meta));
    if (q.hatAudio) a1.push(clip(p.clip.id, quellRef(q), roh(q, p.clip.von), dauerQuelle, rateVon(q.fps!), meta));
    else a1.push(gap(p.frames, rateVon(fps)));
  }

  const v2: unknown[] = [];
  let pos2 = 0;
  for (const b of [...plan.broll].sort((x, y) => x.t - y.t)) {
    const q = quellen.get(b.quelle);
    if (!q || q.art !== "video") continue;
    const start = inFrames(b.t, fps);
    pos2 = luecke(v2, pos2, start, rateVon(fps));
    const frames = Math.max(1, inFrames(b.dauer, fps));
    const dauerQuelle = inFrames(sekunden(frames, fps), q.fps!);
    v2.push(clip(`broll-${b.katalog}`, quellRef(q), roh(q, b.von), dauerQuelle, rateVon(q.fps!), { studio: { katalog: b.katalog, begruendung: b.begruendung } }));
    pos2 = start + frames;
  }

  const v3: unknown[] = [];
  let pos3 = 0;
  for (const o of [...plan.overlays].sort((x, y) => x.t - y.t)) {
    const start = inFrames(o.t, fps);
    pos3 = luecke(v3, pos3, start, rateVon(fps));
    const frames = Math.max(1, inFrames(o.dauer, fps));
    v3.push(clip(`overlay-${o.effekt}`, referenz({ name: loese(o.datei, "overlay").split(/[\\/]/).pop()!, url: url(o.datei, "overlay"), startSek: 0, dauerSek: sekunden(frames, fps), fps }), 0, frames, rateVon(fps), { studio: { effekt: o.effekt, begruendung: o.begruendung } }));
    pos3 = start + frames;
  }

  const a2: unknown[] = [];
  if (plan.musik) {
    const m = plan.musik;
    const q = quellen.get(m.quelle);
    if (q && q.art === "audio") {
      const start = inFrames(m.t, fps);
      luecke(a2, 0, start, rateVon(fps));
      const bis = m.dauer !== undefined ? inFrames(m.t + m.dauer, fps) : zeit.gesamtFrames;
      const frames = Math.max(1, Math.min(bis, zeit.gesamtFrames) - start);
      a2.push(clip("musik", quellRef(q), roh(q, m.von), inFrames(sekunden(frames, fps), q.audioRate), q.audioRate, { studio: { pegelDb: m.pegelDb } }));
    }
  }

  const spuren = [spur("V1", "Video", v1), spur("V2", "Video", v2), spur("V3", "Video", v3), spur("A1", "Audio", a1)];
  if (a2.length) spuren.push(spur("A2", "Audio", a2));
  const rate = rateVon(fps);
  const timeline = {
    OTIO_SCHEMA: "Timeline.1",
    metadata: { studio: { projekt: plan.projekt.name, inhalt: plan.projekt.inhalt ?? null, marke: plan.projekt.marke, dauer: sekunden(zeit.gesamtFrames, fps) } },
    name: plan.projekt.name,
    global_start_time: T(0, rate),
    tracks: { OTIO_SCHEMA: "Stack.1", metadata: {}, name: "tracks", source_range: null, effects: [], markers: [], enabled: true, children: spuren },
  };
  return JSON.stringify(timeline, null, 2) + "\n";
}
