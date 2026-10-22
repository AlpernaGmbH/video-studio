import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { RelPathSchema } from "../core/paths";
import { Iso, Slug } from "../core/schemas";
import type { Idee } from "./idee";

/**
 * Familien von Grafiken (Regel 2, seit 22.10.2026 «Looks je Familie»): Für eine Familie (Handy-Mockups, Hook-Texte, Rankings …)
 * zeigt Claude einmal drei Looks, ein Mensch wählt einen, danach entstehen alle Stücke der Familie in diesem Look.
 * Jedes Stück wird trotzdem einzeln abgenommen.
 *
 * Zwei Dinge sind getrennt:
 *   - die **Liste gültiger Familien** (`library/motion/_familien.json`, in git): nur Definitionen, geschlossen. Ein Tippfehler
 *     («mokups») legt keine neue Familie an.
 *   - der **Stand je Familie** (im Ideenprotokoll unter `daten/`): wer gewählt hat, welche Runde offen ist. Er ist Laufzeitzustand wie die Ideen.
 */

export const LookId = z.enum(["a", "b", "c"]);
export const LookBrief = z.object({
  id: LookId,
  name: z.string().min(2),
  leitidee: z.string().min(15),
  typografie: z.string().min(5),
  farbeinsatz: z.string().min(5),
  bewegung: z.string().min(5),
});
export type LookBrief = z.infer<typeof LookBrief>;

export const IdeeId = z.string().regex(/^m-\d{3,}$/, "ID wie m-001");
export const FAMILIEN_DATEI = "_familien.json";

/* ---------- Liste gültiger Familien ---------- */

export const FamilienDefinition = z.object({
  id: Slug,
  name: z.string().min(2),
  beschreibung: z.string().min(10),
});
export type FamilienDefinition = z.infer<typeof FamilienDefinition>;

export const FamilienListe = z
  .object({ schema: z.literal(1), familien: z.array(FamilienDefinition).min(1) })
  .superRefine((l, ctx) => {
    const gesehen = new Set<string>();
    l.familien.forEach((f, i) => {
      if (gesehen.has(f.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["familien", i, "id"], message: `Familie «${f.id}» steht doppelt in der Liste` });
      gesehen.add(f.id);
    });
  });

export class FamilienFehler extends Error {}

/** Liest `<libRoot>/_familien.json`. Fehlt die Datei, gibt es keine Familie: dann ist jede Idee eine Einzelidee mit eigenen drei Looks. */
export function ladeFamilien(libRoot: string): FamilienDefinition[] {
  const datei = path.join(libRoot, FAMILIEN_DATEI);
  if (!fs.existsSync(datei)) return [];
  let json: unknown;
  try {
    json = JSON.parse(fs.readFileSync(datei, "utf8"));
  } catch (e) {
    throw new FamilienFehler(`${datei} ist kein gültiges JSON: ${(e as Error).message}`);
  }
  const p = FamilienListe.safeParse(json);
  if (!p.success) throw new FamilienFehler(`${datei} ist ungültig: ${p.error.issues.map((i) => `${i.path.join(".") || "(Wurzel)"}: ${i.message}`).join("; ")}`);
  return p.data.familien;
}

/* ---------- Stand je Familie (Ideenprotokoll) ---------- */

/** Der gewählte Look einer Familie. Die Standbilder liegen im Ordner der Idee `vonIdee` (Pfade relativ zu deren Ordner). */
export const FamilienLook = z.object({
  vonIdee: IdeeId,
  runde: z.number().int().min(1),
  briefs: z.array(LookBrief).length(3),
  bilder: z.array(z.object({ id: LookId, pfad: RelPathSchema })).length(3),
  gewaehlt: LookId,
  /** Der Mensch, der gewählt hat. Nur ein Mensch darf einen Familien-Look setzen (siehe `istMensch` in idee.ts). */
  von: z.string().min(1),
  am: Iso,
  /** Zählt hoch, wenn ein Mensch den Look der Familie neu wählt. Stücke behalten die Fassung, in der sie entstanden sind. */
  fassung: z.number().int().min(1),
  notizen: z.array(z.string().min(1)).default([]),
});
export type FamilienLook = z.infer<typeof FamilienLook>;

export const FamilienStand = z.object({
  /** Die Idee, die gerade die Look-Runde der Familie zeigt. Andere Ideen der Familie warten, bis sie entschieden ist. */
  offeneRunde: z.object({ idee: IdeeId, runde: z.number().int().min(1) }).optional(),
  look: FamilienLook.optional(),
  /** Abgelöste Fassungen, neueste zuletzt. */
  frueher: z.array(FamilienLook).default([]),
});
export type FamilienStand = z.infer<typeof FamilienStand>;

export const FamilienStaende = z.record(Slug, FamilienStand);
export type FamilienStaende = z.infer<typeof FamilienStaende>;

/** Was ein Stück über den Look seiner Familie wissen muss (steht in `piece.json`, damit die Bibliothek ohne Protokoll prüfbar bleibt). */
export const StueckFamilie = z.object({
  id: Slug,
  fassung: z.number().int().min(1),
  look: z.object({
    gewaehlt: LookId,
    name: z.string().min(2),
    leitidee: z.string().min(15),
    typografie: z.string().min(5),
    farbeinsatz: z.string().min(5),
    bewegung: z.string().min(5),
    von: z.string().min(1),
    am: Iso,
    vonIdee: IdeeId,
  }),
});
export type StueckFamilie = z.infer<typeof StueckFamilie>;

/** Die Angaben für `piece.json` aus dem gewählten Look einer Familie. */
export function stueckFamilieAus(familie: string, look: FamilienLook): StueckFamilie {
  const brief = look.briefs.find((b) => b.id === look.gewaehlt);
  if (!brief) throw new FamilienFehler(`Im Look der Familie «${familie}» fehlt der Brief «${look.gewaehlt}»`);
  return {
    id: familie,
    fassung: look.fassung,
    look: { gewaehlt: look.gewaehlt, name: brief.name, leitidee: brief.leitidee, typografie: brief.typografie, farbeinsatz: brief.farbeinsatz, bewegung: brief.bewegung, von: look.von, am: look.am, vonIdee: look.vonIdee },
  };
}

/** Der Look als Text für `look/look.md` im Stück: Prosa, kein Generator. Wer das Stück baut, liest sie und hält sich daran. */
export function lookBriefText(familie: FamilienDefinition | { id: string; name: string }, s: StueckFamilie): string {
  const l = s.look;
  return [
    `# Look der Familie «${familie.name}»`,
    "",
    `Gewählt von ${l.von} am ${l.am.slice(0, 10)} (Fassung ${s.fassung}, Look ${l.gewaehlt.toUpperCase()} «${l.name}», gezeigt in ${l.vonIdee}).`,
    "Dieses Stück entsteht in diesem Look. Es wird trotzdem einzeln abgenommen.",
    "",
    `**Leitidee:** ${l.leitidee}`,
    "",
    `**Typografie:** ${l.typografie}`,
    "",
    `**Farbeinsatz:** ${l.farbeinsatz}`,
    "",
    `**Bewegung:** ${l.bewegung}`,
    "",
    "Das Referenzbild `referenz.png` zeigt den gewählten Look als Standbild.",
    "",
  ].join("\n");
}

/**
 * Der Familien-Look, in dem das Stück einer Idee entsteht: der Look, den die Idee geerbt hat (genau diese Fassung), oder, wenn die Idee
 * die Runde selbst gezeigt hat, der Look, den ihre Wahl der Familie gegeben hat. Wirft, wenn die Idee keinen gewählten Look hat oder der
 * Stand der Familie dazu nicht passt (zum Beispiel von Hand verändert).
 */
export function familienLookFuer(idee: Idee, staende: Record<string, FamilienStand>): FamilienLook {
  const fam = idee.familie;
  if (!fam) throw new FamilienFehler(`${idee.id} hat keine Familie`);
  const l = idee.looks;
  if (!l?.gewaehlt) {
    throw new FamilienFehler(`Regel 2: ${idee.id} gehört zur Familie «${fam}», aber für die Familie ist noch kein Look gewählt (Status «${idee.status}»). Erst die Look-Runde der Familie, dann das Stück`);
  }
  const st = staende[fam];
  const alle = st ? [...(st.look ? [st.look] : []), ...st.frueher] : [];
  const look = l.erbe ? alle.find((x) => x.fassung === l.erbe!.fassung) : alle.find((x) => x.vonIdee === idee.id);
  if (!look) {
    throw new FamilienFehler(`Der Stand der Familie «${fam}» kennt den Look von ${idee.id} nicht${l.erbe ? ` (Fassung ${l.erbe.fassung})` : ""}. Das Ideenprotokoll wurde verändert oder ist nicht aktuell`);
  }
  return look;
}

/** Das Standbild des gewählten Looks: im Ordner der Idee, die die Runde gezeigt hat (`<datenDir>/ideen/<vonIdee>/<pfad>`). */
export function referenzBildPfad(datenDir: string, look: FamilienLook): string | undefined {
  const bild = look.bilder.find((b) => b.id === look.gewaehlt);
  return bild ? path.join(datenDir, "ideen", look.vonIdee, bild.pfad) : undefined;
}
