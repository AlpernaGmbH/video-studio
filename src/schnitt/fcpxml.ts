import { pathToFileURL } from "node:url";
import { addiere, fcpZeit, frameZeit, inFrames, type Bruch } from "./raster";
import { platziere, quelleNach, type PlatzierterClip, type Schnittplan, type SchnittQuelle } from "./plan";

/**
 * FCPXML 1.8 aus dem Schnittplan. DaVinci Resolve liest FCPXML als Timeline (Datei, Importieren, Timeline). 1.8 statt 1.9 oder 1.10, weil ab 1.9 die Pfade
 * in `media-rep` verlegt sind und viele Leser sie dort nicht finden. Gegen die DTD von Apple (1.8) geprüft und mit dem FCPXML-Leser von OpenTimelineIO gegengelesen (Test in
 * fcpxml.test.ts), nicht mit Resolve selbst (Test T9 im Dokument editing-blueprint.md).
 *
 * Aufbau: V1/A1 sind die Clips im `spine`. Alles andere hängt als verbundener Clip (`lane`) an dem Spine-Clip, in dem es beginnt:
 * Lane 1 B-Roll, Lane 2 Grafiken, Lane −1 Musik. Der `offset` eines verbundenen Clips zählt in der Zeit des Elternclips,
 * also ab dessen `start` (Beginn in der Quelle), nicht ab dem Beginn der Timeline.
 */

/** Löst einen Pfad aus dem Plan zu einem absoluten Pfad auf diesem Rechner auf. */
export type PfadLoeser = (rel: string, art: "quelle" | "overlay") => string;

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type Attr = Record<string, string | undefined>;
function el(name: string, attr: Attr, kinder: string[] = [], ein = 0): string {
  const pad = "  ".repeat(ein);
  const a = Object.entries(attr)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ` ${k}="${esc(v!)}"`)
    .join("");
  if (kinder.length === 0) return `${pad}<${name}${a}/>`;
  return `${pad}<${name}${a}>\n${kinder.join("\n")}\n${pad}</${name}>`;
}

const frameDauer = (fps: number): string => fcpZeit(frameZeit(1, fps));

/** Zeit ab Dateibeginn plus Timecode-Beginn der Datei, beides auf dem Raster der Quelle. */
function ausDatei(q: SchnittQuelle, sek: number): Bruch {
  const fps = q.fps ?? 1000;
  return frameZeit(inFrames(q.start + sek, fps), fps);
}

export function schreibeFcpxml(plan: Schnittplan, loese: PfadLoeser): string {
  const fps = plan.projekt.fps;
  const zeit = platziere(plan);
  const quellen = quelleNach(plan);

  const ids = { format: 0, asset: 0 };
  const formate = new Map<string, string>();
  const formatXml: string[] = [];
  const formatFuer = (f: number, breite: number, hoehe: number): string => {
    const key = `${f}|${breite}|${hoehe}`;
    let id = formate.get(key);
    if (!id) {
      id = `r${++ids.format}`;
      formate.set(key, id);
      formatXml.push(el("format", { id, frameDuration: frameDauer(f), width: String(breite), height: String(hoehe), colorSpace: "1-1-1 (Rec. 709)" }, [], 2));
    }
    return id;
  };
  const projektFormat = formatFuer(fps, plan.projekt.breite, plan.projekt.hoehe);

  const assetXml: string[] = [];
  const assetId = new Map<string, string>();
  const assetFuer = (key: string, bau: (id: string) => string): string => {
    let id = assetId.get(key);
    if (!id) {
      id = `a${++ids.asset}`;
      assetId.set(key, id);
      assetXml.push(bau(id));
    }
    return id;
  };
  const quellAsset = (q: SchnittQuelle): string =>
    assetFuer(`q:${q.id}`, (id) => {
      const abs = loese(q.pfad, "quelle");
      if (q.art === "video") {
        const f = formatFuer(q.fps!, q.breite!, q.hoehe!);
        return el(
          "asset",
          {
            id,
            name: q.id,
            start: fcpZeit(ausDatei(q, 0)),
            duration: fcpZeit(frameZeit(inFrames(q.dauer, q.fps!), q.fps!)),
            hasVideo: "1",
            format: f,
            hasAudio: q.hatAudio ? "1" : undefined,
            audioSources: q.hatAudio ? "1" : undefined,
            audioChannels: q.hatAudio ? String(q.audioKanaele) : undefined,
            audioRate: q.hatAudio ? String(q.audioRate) : undefined,
            src: pathToFileURL(abs).href,
          },
          [],
          2,
        );
      }
      return el(
        "asset",
        {
          id,
          name: q.id,
          start: fcpZeit({ n: Math.round(q.start * q.audioRate), d: q.audioRate }),
          duration: fcpZeit({ n: Math.round(q.dauer * q.audioRate), d: q.audioRate }),
          hasAudio: "1",
          audioSources: "1",
          audioChannels: String(q.audioKanaele),
          audioRate: String(q.audioRate),
          src: pathToFileURL(abs).href,
        },
        [],
        2,
      );
    });

  /** Der Spine-Clip, in dem die Timeline-Position `frame` liegt (der letzte, wenn sie dahinter liegt). */
  const elternVon = (frame: number): PlatzierterClip => {
    let eltern = zeit.clips[0]!;
    for (const c of zeit.clips) if (c.startFrame <= frame) eltern = c;
    return eltern;
  };
  /** Position in der Zeit des Elternclips: dessen Beginn in der Quelle plus der Abstand zum Elternbeginn. */
  const imEltern = (eltern: PlatzierterClip, frame: number): Bruch =>
    addiere(ausDatei(eltern.quelle, 0), addiere(eltern.quellStart, frameZeit(frame - eltern.startFrame, fps)));

  type Verbunden = { lane: number; frame: number; xml: (eltern: PlatzierterClip) => string };
  const verbunden: Verbunden[] = [];

  for (const b of plan.broll) {
    const q = quellen.get(b.quelle);
    if (!q || q.art !== "video") continue;
    const ref = quellAsset(q);
    const frame = inFrames(b.t, fps);
    const frames = Math.max(1, inFrames(b.dauer, fps));
    verbunden.push({
      lane: 1,
      frame,
      xml: (eltern) =>
        el(
          "asset-clip",
          { ref, lane: "1", offset: fcpZeit(imEltern(eltern, frame)), name: `broll-${b.katalog}`, start: fcpZeit(ausDatei(q, b.von)), duration: fcpZeit(frameZeit(frames, fps)), tcFormat: "NDF" },
          // B-Roll bleibt stumm: die Sprache liegt auf A1
          q.hatAudio ? [el("adjust-volume", { amount: "-96dB" }, [], 5)] : [],
          4,
        ),
    });
  }

  plan.overlays.forEach((o) => {
    const frames = Math.max(1, inFrames(o.dauer, fps));
    const ref = assetFuer(`o:${o.datei}`, (id) => {
      const abs = loese(o.datei, "overlay");
      return el("asset", { id, name: abs.split(/[\\/]/).pop()!, start: "0s", duration: fcpZeit(frameZeit(frames, fps)), hasVideo: "1", format: projektFormat, src: pathToFileURL(abs).href }, [], 2);
    });
    const frame = inFrames(o.t, fps);
    verbunden.push({
      lane: 2,
      frame,
      xml: (eltern) => el("asset-clip", { ref, lane: "2", offset: fcpZeit(imEltern(eltern, frame)), name: `overlay-${o.effekt}`, start: "0s", duration: fcpZeit(frameZeit(frames, fps)), tcFormat: "NDF" }, [], 4),
    });
  });

  if (plan.musik) {
    const m = plan.musik;
    const q = quellen.get(m.quelle);
    if (q && q.art === "audio") {
      const ref = quellAsset(q);
      const frame = inFrames(m.t, fps);
      const bis = m.dauer !== undefined ? inFrames(m.t + m.dauer, fps) : zeit.gesamtFrames;
      const frames = Math.max(1, Math.min(bis, zeit.gesamtFrames) - frame);
      verbunden.push({
        lane: -1,
        frame,
        xml: (eltern) =>
          el(
            "asset-clip",
            { ref, lane: "-1", offset: fcpZeit(imEltern(eltern, frame)), name: "musik", start: fcpZeit({ n: Math.round((q.start + m.von) * q.audioRate), d: q.audioRate }), duration: fcpZeit(frameZeit(frames, fps)), audioRole: "music" },
            [el("adjust-volume", { amount: `${m.pegelDb}dB` }, [], 5)],
            4,
          ),
      });
    }
  }

  // Spine: die Sprache
  const spineXml = zeit.clips.map((p) => {
    const ref = quellAsset(p.quelle);
    const kinder: string[] = [];
    if (p.clip.zoom !== 1) kinder.push(el("adjust-transform", { scale: `${p.clip.zoom} ${p.clip.zoom}` }, [], 4));
    const meine = verbunden.filter((v) => elternVon(v.frame) === p).sort((a, b) => a.lane - b.lane || a.frame - b.frame);
    for (const v of meine) kinder.push(v.xml(p));
    return el(
      "asset-clip",
      {
        ref,
        offset: fcpZeit(frameZeit(p.startFrame, fps)),
        name: p.clip.id,
        start: fcpZeit(addiere(ausDatei(p.quelle, 0), p.quellStart)),
        duration: fcpZeit(frameZeit(p.frames, fps)),
        format: formatFuer(p.quelle.fps!, p.quelle.breite!, p.quelle.hoehe!),
        tcFormat: "NDF",
        audioRole: p.quelle.hatAudio ? "dialogue" : undefined,
      },
      kinder,
      5,
    );
  });

  const sequenz = el(
    "sequence",
    { format: projektFormat, duration: fcpZeit(frameZeit(zeit.gesamtFrames, fps)), tcStart: "0s", tcFormat: "NDF", audioLayout: "stereo", audioRate: "48k" },
    [el("spine", {}, spineXml, 4)],
    3,
  );

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<!DOCTYPE fcpxml>",
    '<fcpxml version="1.8">',
    "  <resources>",
    ...formatXml,
    ...assetXml,
    "  </resources>",
    "  <library>",
    el("event", { name: plan.projekt.inhalt ?? plan.projekt.marke }, [el("project", { name: plan.projekt.name }, [sequenz], 2)], 1),
    "  </library>",
    "</fcpxml>",
    "",
  ].join("\n");
}
