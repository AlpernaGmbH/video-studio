import { createHash } from "node:crypto";
import { z } from "zod";
import { leseSchnittplan, PlanFehler, type SchnittClip, type Schnittplan } from "./plan";
import { transkriptWoerter } from "./transkript";
import type { QuelleTranskript, Zuordnung } from "./zuordnung";

/**
 * Gegenlesen (Plan v4): Das Skript stimmt nicht immer, Whisper hört nicht immer richtig, und manchmal spricht der Director im Take. Bevor das Storyboard entsteht,
 * liest Claude für jeden Clip, was wirklich darin gesagt wird, und meldet Regieanweisungen, Abbrüche und Verhörer. Claude hört nicht: Gelesen wird das Transkript.
 * Dieser Code bereitet das Lesen vor (`baueGegenlesen`), nimmt die Antwort an (`GegenlesenAntwort`) und legt sie in den Plan (`wendeGegenlesenAn`).
 * Ohne angewendetes Gegenlesen verweigert `reel storyboard` die Arbeit (Hash des Plans in `gegenlesen-stand.json`).
 */

export interface GegenlesenClip {
  clip: string;
  zeile?: number;
  quelle: string;
  von: number;
  bis: number;
  /** Text der Skriptzeile, falls der Clip zu einer gehört. */
  skript?: string;
  /** Alles, was Whisper im Clip hörte. */
  gehoert: string;
  /** Eine Sekunde davor und danach, ausserhalb des Clips (nur zur Einordnung, nicht im Video). */
  davor: string;
  danach: string;
  hinweise: string[];
}

const s1 = (n: number): string => n.toFixed(1).replace(".", ",");

export function baueGegenlesen(plan: Schnittplan, zuordnung: Zuordnung, transkripte: QuelleTranskript[]): GegenlesenClip[] {
  const woerter = new Map(transkripte.map((t) => [t.quelle, transkriptWoerter(t.segmente)]));
  const zeilen = new Map(zuordnung.zeilen.map((z) => [z.zeile, z]));
  const gesehen = new Set<number>();
  return plan.clips.map((c) => {
    const w = woerter.get(c.quelle) ?? [];
    const mitte = (x: { von: number; bis: number }): number => (x.von + x.bis) / 2;
    const im = w.filter((x) => mitte(x) >= c.von && mitte(x) < c.bis);
    const davor = w.filter((x) => mitte(x) >= c.von - 1 && mitte(x) < c.von);
    const danach = w.filter((x) => mitte(x) >= c.bis && mitte(x) < c.bis + 1);
    const z = c.zeile !== undefined ? zeilen.get(c.zeile) : undefined;
    const hinweise: string[] = [];
    if (z && !gesehen.has(z.zeile)) {
      gesehen.add(z.zeile);
      const t = z.gewaehlt;
      if (z.status === "gelb") hinweise.push(...z.hinweise);
      if (t?.randDeutung.length) hinweise.push(`Rand gedeutet: ${t.randDeutung.join("; ")}`);
      if (t?.regie.length) hinweise.push(`Regieanweisung erkannt und herausgeschnitten: ${t.regie.map((r) => `«${r.text}» bei ${s1(r.von)} s`).join(", ")}`);
      if (t?.fuellwoerter.length) hinweise.push(`Füllwort herausgeschnitten: ${t.fuellwoerter.map((r) => `«${r.text}» bei ${s1(r.von)} s`).join(", ")}`);
      if (z.abweichung) hinweise.push(`Abweichung vom Skript: ${[z.abweichung.zusaetzlich.length ? `zusätzlich gehört «${z.abweichung.zusaetzlich.join(" ")}»` : "", z.abweichung.fehlend.length ? `im Skript, nicht gehört «${z.abweichung.fehlend.join(" ")}»` : ""].filter(Boolean).join("; ")}`);
    }
    return { clip: c.id, ...(c.zeile !== undefined ? { zeile: c.zeile } : {}), quelle: c.quelle, von: c.von, bis: c.bis, ...(z ? { skript: z.text } : {}), gehoert: im.map((x) => x.text).join(" "), davor: davor.map((x) => x.text).join(" "), danach: danach.map((x) => x.text).join(" "), hinweise };
  });
}

/** Die Datei `gegenlesen.md`: Anleitung und alle Clips zum Lesen. */
export function gegenlesenMarkdown(name: string, clips: GegenlesenClip[]): string {
  const aus: string[] = [`# Gegenlesen: ${name}`, ""];
  aus.push("Lies jeden Clip vollständig. Du hörst nichts, du liest, was Whisper in diesem Stück hörte, und vergleichst es mit dem Skript.", "");
  aus.push(
    "Melde:",
    "- **Regie:** Anweisungen des Directors an Kamera oder Sprecher («und Action», «nochmal von da», «Moment», Gespräch neben dem Satz). Sie gehören nicht ins Video.",
    "- **Abbruch:** Der Satz bricht ab oder beginnt neu. Ein Stück davon darf nicht stehen bleiben.",
    "- **Verhörer:** Whisper hörte ein Wort falsch (zum Beispiel «Kirche» statt «Küche»). Die Untertitel zeigen das Gehörte, du korrigierst das Wort.",
    "- Wörter vor oder nach dem Clip («Davor», «Danach») sind nur Einordnung. Gehört etwas davon fälschlich in den Clip, melde den Bereich.",
    "",
  );
  for (const c of clips) {
    aus.push(`## Clip ${c.clip}${c.zeile !== undefined ? ` (Zeile ${c.zeile})` : ""}: ${c.quelle}, ${s1(c.von)} bis ${s1(c.bis)} s`, "");
    if (c.skript) aus.push(`- Skript: ${c.skript}`);
    aus.push(`- Gehört: «${c.gehoert}»`, `- Davor (1 s): ${c.davor ? `«${c.davor}»` : "-"}`, `- Danach (1 s): ${c.danach ? `«${c.danach}»` : "-"}`);
    for (const h of c.hinweise) aus.push(`- Hinweis: ${h}`);
    aus.push("");
  }
  aus.push("## Antwort", "", "Schreibe nach `gegenlesen.json` (nur das JSON). Zeiten sind Sekunden der Quelldatei, wie oben.", "", "```json");
  aus.push(
    JSON.stringify(
      {
        gelesen: true,
        schnitte: [{ quelle: "sprache-01", von: 12.3, bis: 12.9, grund: "Regie: «und Action»" }],
        woerter: [{ quelle: "sprache-01", von: 14.2, bis: 14.5, text: "Küche", grund: "Verhörer: Whisper hörte «Kirche»" }],
        notiz: "",
      },
      null,
      2,
    ),
    "```",
    "",
    "- `gelesen: true` heisst: Du hast jeden Clip gelesen. Ohne das nimmt `reel gegenlesen` die Antwort nicht an.",
    "- Gibt es nichts zu melden, bleiben `schnitte` und `woerter` leer.",
    "- Ein Schnitt entfernt den Bereich aus dem Clip (der Clip wird getrennt, die Untertitel darin entfallen). Er macht den Film kürzer, nie länger.",
    "",
  );
  return aus.join("\n");
}

export const GegenlesenAntwort = z.object({
  gelesen: z.literal(true, { errorMap: () => ({ message: "«gelesen» muss true sein: Jeder Clip muss gelesen sein" }) }),
  schnitte: z
    .array(z.object({ quelle: z.string().min(1), von: z.number().min(0), bis: z.number().min(0), grund: z.string().min(3) }).refine((s) => s.bis > s.von, { message: "«bis» muss nach «von» liegen" }))
    .default([]),
  woerter: z.array(z.object({ quelle: z.string().min(1), von: z.number().min(0), bis: z.number().min(0), text: z.string().min(1), grund: z.string().min(3) })).default([]),
  notiz: z.string().default(""),
});
export type GegenlesenAntwort = z.infer<typeof GegenlesenAntwort>;

export interface GegenlesenErgebnis {
  plan: Schnittplan;
  geschnitten: number;
  korrigiert: number;
  /** Einträge, die in keinem Clip oder keinem Wort landeten, mit Grund. */
  ignoriert: string[];
}

const runde = (x: number): number => Math.round(x * 1000) / 1000;
/** Stücke unter dieser Länge (Sekunden) fallen weg: Ein Rest von ein paar Frames ist ein Ruckler, kein Schnitt. */
const MINDESTSTUECK = 0.15;

export function wendeGegenlesenAn(plan: Schnittplan, antwort: GegenlesenAntwort): GegenlesenErgebnis {
  const ignoriert: string[] = [];
  let clips: SchnittClip[] = plan.clips.map((c) => ({ ...c }));
  let geschnitten = 0;
  let nr = 0;
  for (const s of antwort.schnitte) {
    const treffer = clips.filter((c) => c.quelle === s.quelle && s.von < c.bis && s.bis > c.von);
    if (!treffer.length) {
      ignoriert.push(`Schnitt ${s.quelle} ${s.von} bis ${s.bis} s (${s.grund}): liegt in keinem Clip`);
      continue;
    }
    const neu: SchnittClip[] = [];
    for (const c of clips) {
      if (!treffer.includes(c)) {
        neu.push(c);
        continue;
      }
      const teile: [number, number][] = [];
      if (s.von - c.von >= MINDESTSTUECK) teile.push([c.von, Math.min(s.von, c.bis)]);
      if (c.bis - s.bis >= MINDESTSTUECK) teile.push([Math.max(s.bis, c.von), c.bis]);
      teile.forEach(([von, bis], i) => {
        nr++;
        neu.push({ ...c, id: `${c.id}-g${nr}`, von: runde(von), bis: runde(bis), notiz: [c.notiz, i === 0 ? `Gegenlesen: ${s.grund}` : ""].filter(Boolean).join("; ") });
      });
    }
    clips = neu;
    geschnitten++;
  }
  if (!clips.length) throw new PlanFehler("Nach dem Gegenlesen bleibt kein Clip übrig: Die Schnitte entfernen alles");

  const woerter = plan.woerter
    .filter((w) => !antwort.schnitte.some((s) => s.quelle === w.quelle && (w.von + w.bis) / 2 >= s.von && (w.von + w.bis) / 2 < s.bis))
    .map((w) => ({ ...w }));
  let korrigiert = 0;
  for (const k of antwort.woerter) {
    const kandidaten = woerter.filter((w) => w.quelle === k.quelle && w.von < k.bis && w.bis > k.von);
    if (!kandidaten.length) {
      ignoriert.push(`Wort «${k.text}» ${k.quelle} ${k.von} bis ${k.bis} s (${k.grund}): kein Untertitel-Wort dort`);
      continue;
    }
    const ueberlapp = (w: { von: number; bis: number }): number => Math.min(w.bis, k.bis) - Math.max(w.von, k.von);
    const ziel = kandidaten.reduce((a, b) => (ueberlapp(b) > ueberlapp(a) ? b : a));
    ziel.text = k.text;
    korrigiert++;
  }
  return { plan: leseSchnittplan({ ...plan, clips, woerter }), geschnitten, korrigiert, ignoriert };
}

/** Prüfsumme des Plans, damit ein veraltetes Gegenlesen auffällt (ein neuer Plan verlangt ein neues Gegenlesen). */
export const planHash = (planText: string): string => createHash("sha256").update(planText).digest("hex").slice(0, 16);
