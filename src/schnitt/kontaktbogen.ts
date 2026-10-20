import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { lauf } from "../presets/messen";
import { platziere, quelleNach, sekunden, type Schnittplan } from "./plan";
import { alsZahl } from "./raster";

/**
 * Kontaktbogen des Storyboards (Bauplan v2, Kap. 3.5): ein Standbild pro Grafik und pro B-Roll, mit Liste und Begründung, als eine HTML-Datei ohne externe Teile.
 * Ein Mensch sieht daran, ob das Storyboard stimmt, bevor Resolve geöffnet wird. Bei einer Grafik liegt das Standbild aus dem Render in der Mitte ihrer Dauer
 * über dem Bild der Sprache an dieser Stelle; ist die Grafik noch nicht gerendert, steht es in der Liste und im Bild.
 */

export interface BogenEintrag {
  nr: number;
  art: "grafik" | "broll";
  name: string;
  t: number;
  dauer: number;
  begruendung: string;
  /** Bild darunter: Quelle (Pfad im Plan) und Zeit in der Datei. */
  basis?: { pfad: string; zeit: number };
  /** Standbild einer Grafik: Pfad im Plan und Zeit in der Grafik. */
  grafik?: { pfad: string; zeit: number };
}

const Zelle = { breite: 270, hoehe: 480 };

/** Welches Bild zu welchem Eintrag gehört (rein): Sprache an der Stelle der Grafik, B-Roll bei den besten Sekunden. */
export function planeBogen(plan: Schnittplan): BogenEintrag[] {
  const zeit = platziere(plan);
  const quellen = quelleNach(plan);
  const fps = plan.projekt.fps;
  const sprache = (t: number): BogenEintrag["basis"] => {
    const f = Math.round(t * fps);
    const p = [...zeit.clips].reverse().find((c) => c.startFrame <= f) ?? zeit.clips[0]!;
    const quellzeit = alsZahl(p.quellStart) + Math.max(0, t - sekunden(p.startFrame, fps));
    return { pfad: p.quelle.pfad, zeit: Math.min(quellzeit, Math.max(0, p.quelle.dauer - 0.04)) };
  };
  const eintraege: Omit<BogenEintrag, "nr">[] = [
    ...plan.overlays.map((o) => ({ art: "grafik" as const, name: o.effekt, t: o.t, dauer: o.dauer, begruendung: o.begruendung, basis: sprache(o.t + o.dauer / 2), grafik: { pfad: o.datei, zeit: o.dauer / 2 } })),
    ...plan.broll.map((b) => {
      const q = quellen.get(b.quelle);
      return { art: "broll" as const, name: b.katalog, t: b.t, dauer: b.dauer, begruendung: b.begruendung, ...(q ? { basis: { pfad: q.pfad, zeit: b.von + b.dauer / 2 } } : {}) };
    }),
  ];
  return eintraege.sort((a, b) => a.t - b.t || a.name.localeCompare(b.name)).map((e, i) => ({ nr: i + 1, ...e }));
}

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const s1 = (n: number): string => n.toFixed(1).replace(".", ",");

/** Die HTML-Seite. `bilder` enthält je Nummer ein JPEG als Base64, oder nichts, wenn das Bild fehlt. */
export function bogenHtml(plan: Schnittplan, eintraege: BogenEintrag[], bilder: Map<number, string>, hinweise: Map<number, string>): string {
  const gesamt = sekunden(platziere(plan).gesamtFrames, plan.projekt.fps);
  const grafiken = eintraege.filter((e) => e.art === "grafik").length;
  const zellen = eintraege
    .map((e) => {
      const b = bilder.get(e.nr);
      const h = hinweise.get(e.nr);
      return `<figure>
${b ? `<img src="data:image/jpeg;base64,${b}" alt="Standbild ${e.nr}" width="${Zelle.breite}" height="${Zelle.hoehe}">` : `<div class="leer" style="width:${Zelle.breite}px;height:${Zelle.hoehe}px">kein Bild</div>`}
<figcaption><b>${e.nr}</b> · ${s1(e.t)} bis ${s1(e.t + e.dauer)} s · ${e.art === "grafik" ? "Grafik" : "B-Roll"} <code>${esc(e.name)}</code><br>${esc(e.begruendung)}${h ? `<br><em>${esc(h)}</em>` : ""}</figcaption>
</figure>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="de-CH"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kontaktbogen ${esc(plan.projekt.name)}</title>
<style>
:root{color-scheme:light;--tinte:#0f0f0e;--papier:#f3f1ec;--karte:#fffdf8;--gedaempft:#65645f;--linie:#d9d6cd}
body{margin:0;padding:24px 16px;background:var(--papier);color:var(--tinte);font:16px/1.5 system-ui,sans-serif}
main{max-width:1240px;margin:0 auto}
h1{font-size:1.4rem;margin:0 0 4px}
p.kopf{color:var(--gedaempft);margin:0 0 20px}
.raster{display:grid;grid-template-columns:repeat(auto-fill,minmax(${Zelle.breite}px,1fr));gap:16px}
figure{margin:0;background:var(--karte);border:1px solid var(--linie);border-radius:8px;padding:8px}
img,.leer{display:block;max-width:100%;height:auto;margin:0 auto;border-radius:4px;background:#222}
.leer{display:flex;align-items:center;justify-content:center;color:#ccc}
figcaption{font-size:.85rem;margin-top:8px}
code{background:var(--papier);padding:0 4px;border-radius:3px}
.entwurf{margin-top:24px;color:var(--gedaempft);font-size:.9rem}
</style></head><body><main>
<h1>Kontaktbogen: ${esc(plan.projekt.name)}</h1>
<p class="kopf">Marke ${esc(plan.projekt.marke)}${plan.projekt.inhalt ? `, Inhalt ${esc(plan.projekt.inhalt)}` : ""}. Länge ${s1(gesamt)} s, ${grafiken} Grafik${grafiken === 1 ? "" : "en"}, ${eintraege.length - grafiken} B-Roll.</p>
${eintraege.length ? `<div class="raster">\n${zellen}\n</div>` : "<p>Das Storyboard hat keine Grafiken und keine B-Roll.</p>"}
<p class="entwurf">Entwurf. Das Storyboard ist erst freigegeben, wenn ein Mensch es bestätigt. Standbilder sind Näherungen: Zoom, Untertitel und Übergänge fehlen.</p>
</main></body></html>
`;
}

export interface BogenWerkzeuge {
  /** Standbild als JPEG (Base64). `grafik` liegt darüber. Gibt `undefined` zurück, wenn ein Bild nicht entstand. */
  bild: (basis: { datei: string; zeit: number } | undefined, grafik: { datei: string; zeit: number } | undefined) => Promise<string | undefined>;
}

/** ffmpeg: Bild der Sprache oder B-Roll, darüber das Standbild der Grafik (VP9 mit Alpha braucht den libvpx-Decoder). */
export const echterBogen: BogenWerkzeuge = {
  async bild(basis, grafik) {
    if (!basis) return undefined;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "studio-bogen-"));
    try {
      const aus = path.join(tmp, "z.jpg");
      const passen = `scale=${Zelle.breite}:${Zelle.hoehe}:force_original_aspect_ratio=decrease,pad=${Zelle.breite}:${Zelle.hoehe}:(ow-iw)/2:(oh-ih)/2:color=black`;
      const args = ["-loglevel", "error", "-y", "-ss", String(basis.zeit), "-i", basis.datei];
      if (grafik) {
        // Die Grafik wird im Filter auf die Mitte gekürzt (trim), nicht mit -ss: Nach einem Sprung im Eingang beginnt sie zeitlich später als das Bild der Sprache und das Standbild bliebe leer.
        args.push("-c:v", "libvpx-vp9", "-i", grafik.datei, "-filter_complex", `[0:v]${passen}[b];[1:v]trim=start=${grafik.zeit},setpts=PTS-STARTPTS,scale=${Zelle.breite}:${Zelle.hoehe},format=rgba[o];[b][o]overlay=0:0:format=auto,format=yuvj420p`);
      } else args.push("-vf", `${passen},format=yuvj420p`);
      args.push("-frames:v", "1", "-q:v", "5", aus);
      const r = await lauf("ffmpeg", args);
      if (r.code !== 0 || !fs.existsSync(aus)) return undefined;
      return fs.readFileSync(aus).toString("base64");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  },
};

export interface BogenOptionen {
  plan: Schnittplan;
  /** Pfad im Plan zur Datei auf diesem Rechner. */
  loese: (pfad: string) => string;
  werkzeuge?: BogenWerkzeuge;
}

export async function erzeugeBogen(o: BogenOptionen): Promise<{ html: string; eintraege: BogenEintrag[]; ohneBild: number[]; nichtGerendert: number[] }> {
  const w = o.werkzeuge ?? echterBogen;
  const eintraege = planeBogen(o.plan);
  const bilder = new Map<number, string>();
  const hinweise = new Map<number, string>();
  const nichtGerendert: number[] = [];
  const ohneBild: number[] = [];
  for (const e of eintraege) {
    const basis = e.basis ? { datei: o.loese(e.basis.pfad), zeit: e.basis.zeit } : undefined;
    let grafik = e.grafik ? { datei: o.loese(e.grafik.pfad), zeit: e.grafik.zeit } : undefined;
    if (basis && !fs.existsSync(basis.datei)) {
      hinweise.set(e.nr, `Datei fehlt auf diesem Rechner: ${e.basis!.pfad}`);
      ohneBild.push(e.nr);
      continue;
    }
    if (grafik && !fs.existsSync(grafik.datei)) {
      hinweise.set(e.nr, `Grafik noch nicht gerendert: ${e.grafik!.pfad}`);
      nichtGerendert.push(e.nr);
      grafik = undefined;
    }
    const b = await w.bild(basis, grafik);
    if (b) bilder.set(e.nr, b);
    else if (!ohneBild.includes(e.nr)) {
      ohneBild.push(e.nr);
      if (!hinweise.has(e.nr)) hinweise.set(e.nr, "Das Standbild liess sich nicht erzeugen");
    }
  }
  return { html: bogenHtml(o.plan, eintraege, bilder, hinweise), eintraege, ohneBild, nichtGerendert };
}
