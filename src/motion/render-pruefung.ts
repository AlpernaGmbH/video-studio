import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import type { Befund } from "./bibliothek";
import { PROJEKT, SICHERHEITSRAND } from "./render";
import type { Stueck } from "./stueck";

/**
 * Selbstprüfung eines Renders (Bauplan 3.10, übertragen auf Motion-Stücke).
 * Messbares wird hier geprüft, ohne dass Claude hinschauen muss. Was nur ein Auge beurteilen kann
 * (Text abgeschnitten, unruhig, falsche Aussage), prüft Claude danach an Standbildern (BildUrteil).
 */

/* ---------- ffprobe ---------- */

export interface ProbeInfo {
  codec: string;
  breite: number;
  hoehe: number;
  fps: number;
  dauer: number;
  alpha: boolean;
}

const FfprobeJson = z.object({
  streams: z.array(
    z.object({
      codec_name: z.string().optional(),
      codec_type: z.string().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      pix_fmt: z.string().optional(),
      r_frame_rate: z.string().optional(),
      duration: z.string().optional(),
      tags: z.record(z.string()).optional(),
    }),
  ),
  format: z.object({ duration: z.string().optional() }).optional(),
});

function bruch(s: string | undefined): number {
  if (!s) return NaN;
  const [a, b] = s.split("/").map(Number);
  if (a === undefined || Number.isNaN(a)) return NaN;
  return b ? a / b : a;
}

export function parseFfprobe(json: unknown): ProbeInfo {
  const p = FfprobeJson.parse(json);
  const v = p.streams.find((s) => s.codec_type === "video") ?? p.streams[0];
  if (!v) throw new Error("ffprobe: kein Videostrom gefunden");
  const tags = Object.fromEntries(Object.entries(v.tags ?? {}).map(([k, val]) => [k.toLowerCase(), val]));
  return {
    codec: v.codec_name ?? "?",
    breite: v.width ?? 0,
    hoehe: v.height ?? 0,
    fps: bruch(v.r_frame_rate),
    dauer: Number(p.format?.duration ?? v.duration ?? NaN),
    // VP9 mit Alpha trägt ALPHA_MODE=1 im Strom, die Pixelart bleibt yuv420p
    alpha: tags["alpha_mode"] === "1" || /yuva|rgba|bgra|argb|abgr|gbrap/.test(v.pix_fmt ?? ""),
  };
}

/* ---------- hyperframes check ---------- */

export interface HfBefund {
  stufe: "fehler" | "warnung";
  code: string;
  text: string;
}

/**
 * Liest die JSON-Ausgabe von `hyperframes check --json`. Das Format ist nur teilweise dokumentiert
 * ({ok, lint, runtime, layout, motion, contrast, ...}). Deshalb defensiv: Gesamtergebnis `ok` zählt,
 * Einzelbefunde werden gesammelt, soweit sie als Liste `findings` vorliegen.
 */
export function parseHfCheck(json: unknown): { ok: boolean; befunde: HfBefund[]; browserUebersprungen: boolean } {
  const befunde: HfBefund[] = [];
  const wurzel = (json ?? {}) as Record<string, unknown>;
  const ok = wurzel["ok"] === true;
  const browserUebersprungen = wurzel["browserSkipped"] === true;

  const sammle = (knoten: unknown) => {
    if (!knoten || typeof knoten !== "object") return;
    const obj = knoten as Record<string, unknown>;
    const liste = obj["findings"];
    if (Array.isArray(liste)) {
      for (const f of liste) {
        const e = f as Record<string, unknown>;
        const sev = String(e["severity"] ?? e["level"] ?? "error").toLowerCase();
        befunde.push({
          stufe: sev.startsWith("warn") || sev === "info" ? "warnung" : "fehler",
          code: String(e["code"] ?? e["rule"] ?? "hf"),
          text: String(e["message"] ?? e["text"] ?? JSON.stringify(e)),
        });
      }
    }
    for (const v of Object.values(obj)) if (v && typeof v === "object" && !Array.isArray(v)) sammle(v);
  };
  sammle(wurzel);
  return { ok, befunde, browserUebersprungen };
}

/* ---------- Bildstatistik aus dem Alphakanal ---------- */

export interface FrameStat {
  t: number;
  /** Anteil der Bildfläche mit sichtbarem Inhalt, 0 bis 1 */
  abdeckung: number;
  /** Umfang des sichtbaren Inhalts als Anteil der Bildbreite und -höhe */
  bbox: { x0: number; y0: number; x1: number; y1: number } | null;
}

/** Rechnet ein 8-Bit-Graustufenbild des Alphakanals (Zeile für Zeile) in Abdeckung und Umfang um. */
export function statAusAlpha(gray: Uint8Array, breite: number, hoehe: number, t: number, schwelle = 8): FrameStat {
  if (gray.length !== breite * hoehe) throw new Error(`Alphabild hat ${gray.length} Bytes, erwartet ${breite * hoehe}`);
  let treffer = 0;
  let x0 = breite;
  let y0 = hoehe;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < hoehe; y++) {
    for (let x = 0; x < breite; x++) {
      if ((gray[y * breite + x] ?? 0) > schwelle) {
        treffer++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (treffer === 0) return { t, abdeckung: 0, bbox: null };
  return {
    t,
    abdeckung: treffer / (breite * hoehe),
    bbox: { x0: x0 / breite, y0: y0 / hoehe, x1: (x1 + 1) / breite, y1: (y1 + 1) / hoehe },
  };
}

/** Gleichmässig verteilte Zeitpunkte von Anfang bis zum letzten ganzen Bild. */
export function probenZeiten(dauer: number, n = 9, fps: number = PROJEKT.fps): number[] {
  const letzte = Math.max(0, dauer - 1 / fps);
  if (n <= 1) return [0];
  return Array.from({ length: n }, (_, i) => Number(((i / (n - 1)) * letzte).toFixed(3)));
}

/* ---------- Prüfung ---------- */

export interface PruefEingabe {
  stueck: Stueck;
  /** Gewünschte Dauer des Einsatzes in Sekunden */
  dauer: number;
  probe: ProbeInfo;
  frames: FrameStat[];
  hfCheck?: ReturnType<typeof parseHfCheck>;
  format?: "webm" | "mp4";
}

export interface Pruefung {
  bestanden: boolean;
  befunde: Befund[];
}

export function pruefeRender(e: PruefEingabe): Pruefung {
  const b: Befund[] = [];
  const id = e.stueck.id;
  const fehler = (code: string, text: string) => b.push({ stufe: "fehler", stueck: id, code, text });
  const warnung = (code: string, text: string) => b.push({ stufe: "warnung", stueck: id, code, text });
  const { probe, frames } = e;
  const bildMs = 1 / PROJEKT.fps;

  if (probe.breite !== PROJEKT.breite || probe.hoehe !== PROJEKT.hoehe) {
    fehler("format", `Auflösung ${probe.breite}×${probe.hoehe}, erwartet ${PROJEKT.breite}×${PROJEKT.hoehe}`);
  }
  if (Math.abs(probe.fps - PROJEKT.fps) > 0.01) fehler("fps", `Bildrate ${probe.fps}, erwartet ${PROJEKT.fps}`);
  if (!(Math.abs(probe.dauer - e.dauer) <= bildMs + 0.02)) {
    fehler("dauer", `Länge ${Number.isFinite(probe.dauer) ? probe.dauer.toFixed(2) : "?"} s, verlangt waren ${e.dauer} s`);
  }
  if (e.stueck.ausgabe === "overlay" && (e.format ?? "webm") === "webm") {
    if (!probe.alpha) fehler("alpha", "Das Overlay hat keinen Alphakanal (ALPHA_MODE fehlt). Der Hintergrund der Komposition muss transparent sein");
    if (probe.codec !== "vp9") warnung("codec", `Codec ${probe.codec}, erwartet vp9`);
  }

  if (frames.length === 0) {
    fehler("keine_frames", "Keine Bilder zur Prüfung vorhanden");
  } else {
    if (!frames.some((f) => f.abdeckung >= 0.005)) fehler("leer", "Der Render ist leer: in keinem geprüften Bild ist mehr als 0,5 Prozent sichtbar");

    if (e.stueck.sicherheitsrand) {
      const toleranz = 0.012; // ein Rasterfeld bei 108 Pixeln Breite
      const grenze = {
        x0: SICHERHEITSRAND.links - toleranz,
        x1: 1 - SICHERHEITSRAND.rechts + toleranz,
        y0: SICHERHEITSRAND.oben - toleranz,
        y1: 1 - SICHERHEITSRAND.unten + toleranz,
      };
      const verletzt = frames.filter(
        (f) => f.bbox && (f.bbox.x0 < grenze.x0 || f.bbox.x1 > grenze.x1 || f.bbox.y0 < grenze.y0 || f.bbox.y1 > grenze.y1),
      );
      for (const f of verletzt.slice(0, 3)) {
        const bb = f.bbox!;
        fehler(
          "sicherheitsrand",
          `Bei ${f.t.toFixed(2)} s liegt Inhalt ausserhalb des Sicherheitsrands (x ${(bb.x0 * 100).toFixed(0)}–${(bb.x1 * 100).toFixed(0)} %, y ${(bb.y0 * 100).toFixed(0)}–${(bb.y1 * 100).toFixed(0)} %)`,
        );
      }
      if (verletzt.length > 3) fehler("sicherheitsrand", `… und ${verletzt.length - 3} weitere Bilder`);
    }

    const erstes = frames[0]!;
    const letztes = frames[frames.length - 1]!;
    if (e.stueck.ausgabe === "overlay") {
      if (erstes.abdeckung > 0.02) warnung("anfang_nicht_leer", `Das erste Bild zeigt schon ${(erstes.abdeckung * 100).toFixed(1)} % Inhalt: Der Einsatz springt ins Bild statt einzublenden`);
      if (letztes.abdeckung > 0.02) warnung("ende_nicht_leer", `Das letzte Bild zeigt noch ${(letztes.abdeckung * 100).toFixed(1)} % Inhalt: Der Einsatz endet hart statt auszublenden`);
    }
  }

  if (e.hfCheck) {
    if (e.hfCheck.browserUebersprungen) warnung("hf_check_ohne_browser", "hyperframes check lief ohne Browser (Lint-Fehler oder Startproblem). Layout und Kontrast sind nicht geprüft");
    for (const h of e.hfCheck.befunde) b.push({ stufe: h.stufe, stueck: id, code: `hf:${h.code}`, text: h.text });
    if (!e.hfCheck.ok && !e.hfCheck.befunde.some((h) => h.stufe === "fehler")) fehler("hf_check", "hyperframes check meldet «nicht ok» ohne Einzelbefund");
  }

  return { bestanden: !b.some((x) => x.stufe === "fehler"), befunde: b };
}

/* ---------- Bildprüfung durch Claude (Vision) ---------- */

export const BildUrteil = z.object({
  t: z.number().min(0),
  ok: z.boolean(),
  probleme: z.array(z.string().min(3)).default([]),
});
export const BildUrteile = z.object({ urteile: z.array(BildUrteil).min(1), gesamt: z.string().min(3) });
export type BildUrteile = z.infer<typeof BildUrteile>;

/** Macht aus den Urteilen Befunde. Ein «nicht ok» ohne Begründung ist selbst ein Fehler (nicht überprüfbar). */
export function bildUrteileZuBefunden(stueckId: string, u: BildUrteile): Befund[] {
  const b: Befund[] = [];
  for (const x of u.urteile) {
    if (x.ok) continue;
    if (x.probleme.length === 0) {
      b.push({ stufe: "fehler", stueck: stueckId, code: "bild_ohne_grund", text: `Bild bei ${x.t.toFixed(2)} s als «nicht ok» markiert, aber ohne Begründung` });
    }
    for (const p of x.probleme) b.push({ stufe: "fehler", stueck: stueckId, code: "bild", text: `Bild bei ${x.t.toFixed(2)} s: ${p}` });
  }
  return b;
}

/* ---------- Ausführung (ffprobe, ffmpeg) ---------- */

function lauf(cmd: string, args: string[]): Promise<{ code: number | null; stdout: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    const c = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    let err = "";
    c.stdout.on("data", (d: Buffer) => out.push(d));
    c.stderr.on("data", (d: Buffer) => (err += d.toString()));
    c.on("error", reject);
    c.on("close", (code) => resolve({ code, stdout: Buffer.concat(out), stderr: err }));
  });
}

export async function ffprobeDatei(datei: string): Promise<ProbeInfo> {
  const r = await lauf("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", datei]);
  if (r.code !== 0) throw new Error(`ffprobe fehlgeschlagen: ${r.stderr.trim()}`);
  return parseFfprobe(JSON.parse(r.stdout.toString("utf8")));
}

/** Liest den Alphakanal eines VP9-WebM bei Zeit `t` als 8-Bit-Graustufenbild. */
export async function alphaFrame(datei: string, t: number, breite = 108, hoehe = 192): Promise<FrameStat> {
  const r = await lauf("ffmpeg", [
    "-v", "error",
    "-c:v", "libvpx-vp9", // der native VP9-Decoder verwirft den Alphakanal
    "-ss", String(t),
    "-i", datei,
    "-frames:v", "1",
    "-vf", `alphaextract,scale=${breite}:${hoehe}:flags=area,format=gray`,
    "-f", "rawvideo",
    "-",
  ]);
  if (r.code !== 0) throw new Error(`ffmpeg fehlgeschlagen bei ${t} s: ${r.stderr.trim()}`);
  return statAusAlpha(new Uint8Array(r.stdout), breite, hoehe, t);
}

/**
 * Legt ein Bild des Renders (mit Alpha) auf einen einfarbigen Videohintergrund und schreibt es als PNG.
 * So sieht man ein Overlay so, wie es im Reel wirkt, auch wenn es selbst weiss oder halbtransparent ist.
 */
export async function frameAufHintergrund(datei: string, t: number, ziel: string, opt: { farbe?: string; breite?: number } = {}): Promise<void> {
  const farbe = (opt.farbe ?? "#2B3A55").replace("#", "0x");
  const breite = opt.breite ?? 540;
  const hoehe = Math.round((breite * PROJEKT.hoehe) / PROJEKT.breite);
  // Zweistufig: Ein Einzelbefehl mit overlay verliert den Alphakanal des VP9-Decoders, erst dekodieren, dann überlagern.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "studio-frame-"));
  try {
    const roh = path.join(tmp, "frame.png");
    const dekodiert = await lauf("ffmpeg", ["-v", "error", "-y", "-c:v", "libvpx-vp9", "-ss", String(t), "-i", datei, "-frames:v", "1", roh]);
    if (dekodiert.code !== 0) throw new Error(`Bild bei ${t} s nicht lesbar: ${dekodiert.stderr.trim()}`);
    const r = await lauf("ffmpeg", [
      "-v", "error", "-y",
      "-f", "lavfi", "-i", `color=c=${farbe}:s=${PROJEKT.breite}x${PROJEKT.hoehe}`,
      "-i", roh,
      "-filter_complex", `[0][1]overlay,scale=${breite}:${hoehe}`,
      "-frames:v", "1",
      ziel,
    ]);
    if (r.code !== 0) throw new Error(`Vorschaubild bei ${t} s fehlgeschlagen: ${r.stderr.trim()}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

export async function messeRender(datei: string, dauer: number, n = 9): Promise<{ probe: ProbeInfo; frames: FrameStat[] }> {
  const probe = await ffprobeDatei(datei);
  const frames: FrameStat[] = [];
  for (const t of probenZeiten(dauer, n)) frames.push(await alphaFrame(datei, t));
  return { probe, frames };
}
