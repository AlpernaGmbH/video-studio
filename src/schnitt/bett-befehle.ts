import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Args } from "../args";
import { lauf, lautheitAusEbur128 } from "../presets/messen";
import { studioHome } from "../setup";
import { mischeBett, rmsDb, schreibeWav, spitzeDb, verstaerke, SAMPLERATE, type Stereo, type SfxEreignis } from "./bett";
import { leseSchnittplan, platziere, sekunden, type Schnittplan, type Zeitleiste } from "./plan";
import { loesePfad } from "./uebergabe";

/**
 * `schnitt bett`: Musik und Soundeffekte für den Schnitt (Plan v2 Kap. 3.8). Die Ereignisse folgen dem Schnittplan: ein leiser Whoosh an jedem Schnitt, dazu je Grafik
 * die Geräusche, die zu ihr passen (Einschlag beim Hook-Titel, Ticks bei der Stichwort-Liste, Pop beim Zähler …). Die Musik wird unter die Sprache des Schnitts abgesenkt.
 */

/** Ob ein Wert eine Zahl ist, sonst der Standard. */
const zahl = (x: unknown, standard: number): number => (typeof x === "number" && Number.isFinite(x) ? x : standard);

/**
 * Die SFX-Ereignisse eines Plans. `params` sind die Parameter der Grafiken aus dem Storyboard, je Grafik in der Reihenfolge der Zeit (die Liste `overlays` des Storyboards),
 * damit zum Beispiel der Abstand der Stichwort-Liste bekannt ist. Fehlen sie, gelten Standardwerte.
 */
export function bettEreignisse(plan: Schnittplan, zeit: Zeitleiste, storyboardOverlays: { effekt: string; t: number; params?: Record<string, unknown> }[] = []): SfxEreignis[] {
  const fps = plan.projekt.fps;
  const aus: SfxEreignis[] = [];
  // Schnitte: leiser Whoosh, der am Schnitt seinen Höhepunkt hat, abwechselnd steigend und fallend
  zeit.clips.slice(1).forEach((c, i) => {
    const t = sekunden(c.startFrame, fps);
    aus.push({ t: Math.max(0, t - 0.2), art: "whoosh", dauer: 0.4, pegelDb: -16, richtung: i % 2 === 0 ? "auf" : "ab" });
  });
  for (const o of plan.overlays) {
    const sb = storyboardOverlays.find((x) => x.effekt === o.effekt && Math.abs(x.t - o.t) < 0.01);
    const p = sb?.params ?? {};
    switch (o.effekt) {
      case "hook-titelschlag":
        aus.push({ t: o.t + 0.05, art: "whoosh", dauer: 0.9, pegelDb: -2, richtung: "auf" }, { t: o.t + 0.35, art: "impact", pegelDb: -2 });
        break;
      case "stichwort-liste": {
        const n = Array.isArray(p["stichwoerter"]) ? (p["stichwoerter"] as unknown[]).length : 3;
        const abstand = zahl(p["abstand"], 0.5);
        for (let i = 0; i < n; i++) aus.push({ t: o.t + 0.1 + i * abstand, art: "tick" });
        break;
      }
      case "zeitraum-leiste": {
        const lauf = zahl(p["laufzeit"], 1);
        aus.push({ t: o.t + 0.25, art: "sweep", dauer: lauf }, { t: o.t + 0.25 + lauf, art: "tick", pegelDb: -2 });
        break;
      }
      case "zahl-zaehler":
        aus.push({ t: o.t + 0.12, art: "pop" }, { t: o.t + 0.12, art: "riser", dauer: 0.9, pegelDb: -8 }, { t: o.t + 1.12, art: "tick", pegelDb: -3 });
        break;
      case "aufruf-karte":
        aus.push({ t: o.t + 0.1, art: "whoosh", dauer: 0.35, pegelDb: -8, richtung: "auf" }, { t: o.t + 0.28, art: "pop" });
        break;
      case "untertitel-pop":
        break; // Untertitel bleiben still
      default:
        aus.push({ t: o.t, art: "whoosh", dauer: 0.5, pegelDb: -8 });
    }
  }
  return aus.sort((a, b) => a.t - b.t);
}

/** Die Sprache der Timeline als Mono-Signal (48 kHz): die Clips des Plans hintereinander, wie im Schnitt. */
async function sprachSpur(plan: Schnittplan, home: NonNullable<ReturnType<typeof studioHome>>): Promise<Float32Array> {
  const quellen = [...new Set(plan.clips.map((c) => c.quelle))];
  const dateien = quellen.map((id) => {
    const q = plan.quellen.find((x) => x.id === id)!;
    return { id, abs: loesePfad(home, q.pfad), hatTon: q.hatAudio === true };
  });
  const teile = plan.clips.map((c, i) => {
    const k = dateien.findIndex((d) => d.id === c.quelle);
    return dateien[k]!.hatTon ? `[${k}:a]atrim=start=${c.von.toFixed(3)}:end=${c.bis.toFixed(3)},asetpts=PTS-STARTPTS,aformat=sample_rates=${SAMPLERATE}:channel_layouts=mono[a${i}]` : `anullsrc=r=${SAMPLERATE}:cl=mono,atrim=duration=${(c.bis - c.von).toFixed(3)}[a${i}]`;
  });
  const graph = `${teile.join(";")};${plan.clips.map((_, i) => `[a${i}]`).join("")}concat=n=${plan.clips.length}:v=0:a=1[aus]`;
  const tmp = path.join(os.tmpdir(), `bett-sprache-${process.pid}.f32`);
  const r = await lauf("ffmpeg", ["-y", "-nostats", "-hide_banner", ...dateien.flatMap((d) => ["-i", d.abs]), "-filter_complex", graph, "-map", "[aus]", "-f", "f32le", tmp]);
  if (r.code !== 0) throw new Error(`Die Sprache des Schnitts liess sich nicht lesen: ${r.stderr.trim().split("\n").pop()}`);
  const buf = fs.readFileSync(tmp);
  fs.rmSync(tmp, { force: true });
  return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4)).slice();
}

/** Misst die Lautheit eines Signals über eine temporäre Datei. */
async function messeLautheit(s: Stereo): Promise<number> {
  const tmp = path.join(os.tmpdir(), `bett-mess-${process.pid}.wav`);
  schreibeWav(tmp, s);
  const r = await lauf("ffmpeg", ["-nostats", "-hide_banner", "-i", tmp, "-af", "ebur128=peak=true", "-f", "null", "-"]);
  fs.rmSync(tmp, { force: true });
  const l = lautheitAusEbur128(r.stderr);
  if (!l) throw new Error("Die Lautheit der Musik liess sich nicht messen");
  return l.lufs;
}

export async function bettBefehl(a: Args): Promise<number> {
  const home = studioHome();
  if (!home) throw new Error("Der Studio-Ordner ist auf diesem Rechner nicht eingerichtet: «./studio init» ausführen");
  const planDatei = a.opt["plan"];
  if (typeof planDatei !== "string") throw new Error("--plan <plan.json> fehlt");
  const plan = leseSchnittplan(JSON.parse(fs.readFileSync(planDatei, "utf8")));
  const zeit = platziere(plan);
  const dauer = sekunden(zeit.gesamtFrames, plan.projekt.fps);
  const sbDatei = typeof a.opt["storyboard"] === "string" ? (a.opt["storyboard"] as string) : undefined;
  const sbOverlays = sbDatei && fs.existsSync(sbDatei) ? ((JSON.parse(fs.readFileSync(sbDatei, "utf8")) as { overlays?: { effekt: string; t: number; params?: Record<string, unknown> }[] }).overlays ?? []) : [];
  const ziel = typeof a.opt["o"] === "string" ? path.resolve(a.opt["o"] as string) : loesePfad(home, `renders/${plan.projekt.inhalt ?? "video"}/ton`);
  const zielLufs = typeof a.opt["musik-lufs"] === "string" ? Number(a.opt["musik-lufs"]) : -25;

  const ereignisse = bettEreignisse(plan, zeit, sbOverlays);
  console.log(`${ereignisse.length} Soundeffekte (${[...new Set(ereignisse.map((e) => e.art))].join(", ")}), Länge ${dauer.toFixed(1)} s`);
  const sprache = await sprachSpur(plan, home);
  // Musik auf die Ziellautheit bringen (vor dem Absenken), dann mischen
  const probe = mischeBett({ dauer, sfx: [], musikPegelDb: 0 });
  const lufs = await messeLautheit(probe.musik);
  const bett = mischeBett({ dauer, sfx: ereignisse, sprache, musikPegelDb: zielLufs - lufs });

  const musikDatei = path.join(ziel, "musik.wav");
  const sfxDatei = path.join(ziel, "sfx.wav");
  const bettDatei = path.join(ziel, "bett.wav");
  // Spitze begrenzen: höchstens -3 dBFS im Bett
  const spitze = spitzeDb(bett.bett);
  if (spitze > -3) verstaerke(bett.bett, -3 - spitze);
  schreibeWav(musikDatei, bett.musik);
  schreibeWav(sfxDatei, bett.sfx);
  schreibeWav(bettDatei, bett.bett);
  console.log(`Musik vor dem Absenken ${zielLufs.toFixed(1)} LUFS, Bett (Musik abgesenkt plus SFX): Spitze ${spitzeDb(bett.bett).toFixed(1)} dBFS, RMS ${rmsDb(bett.bett).toFixed(1)} dBFS`);
  console.log(`→ ${bettDatei}\n→ ${musikDatei}\n→ ${sfxDatei}`);
  console.log(`\nNächster Schritt: ins Storyboard "musik": {"datei": "${path.relative(path.dirname(path.dirname(loesePfad(home, "renders/x"))), bettDatei).split(path.sep).join("/")}", "pegelDb": 0}. Ob Musik und Effekte gefallen, hört nur ein Mensch.`);
  return 0;
}
