import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { Iso, Slug, type Markenprofil } from "../core/schemas";
import { baueCube, type Rgb, type Vorstufe } from "../schnitt/lut";
import { baueVlogCube } from "../schnitt/vlog-lut";
import { farbpaarStufe } from "./farbpaar";
import { looksFuerMuster, type FotoLook } from "./looks";
import { erkenneProfil, waehleMuster, type BildMass, type Profil } from "./messen";
import { ausgabeDatei, ausgabeName, pruefeAusgabeNamen, sammleFotos, type Aufgeloest } from "./ordner";
import { kachelHoehe, messeFoto, pruefeWerkzeug, schreibeBogen, schreibeKachel, wendeLookAn, type FotoWerkzeuge } from "./werkzeug";

/**
 * Der Foto-Batch (Plan M4, Stufe 1): Ein Ordner mit JPEG-Fotos, ein Muster aus drei Fotos mit der Umrechnung und den Looks nebeneinander, die Wahl eines Menschen,
 * danach derselbe Look auf alle Fotos. Die Originale bleiben unangetastet, die Ergebnisse liegen in `bearbeitet-<look>/` neben ihnen.
 * Alles läuft lokal mit ffmpeg. Es gibt keinen Netzzugriff und keinen Aufruf eines Dienstes.
 */

export const FOTO_TYPEN = ["kunde", "bts"] as const;
export type FotoTyp = (typeof FOTO_TYPEN)[number];

export const MUSTER_ANZAHL = 3;
export const KACHEL_SEITE = 720;

export const FotoStand = z
  .object({
    schema: z.literal(1),
    id: z.string().min(1),
    typ: z.enum(FOTO_TYPEN),
    marke: Slug,
    /** Der Fotoordner, relativ zu seiner Wurzel (Studio- oder Medien-Ordner). */
    ordner: z.string().min(1),
    wurzel: z.enum(["studio", "medien"]).default("studio"),
    profil: z.enum(["vlog", "standard"]),
    profilQuelle: z.enum(["erkannt", "angegeben"]),
    belichtung: z.number().min(-3).max(3),
    erstellt: Iso,
    fotos: z.number().int().min(1),
    unlesbar: z.array(z.string()).default([]),
    muster: z.array(z.object({ datei: z.string(), mittel: z.number() })).min(1),
    looks: z.array(z.object({ id: z.string(), name: z.string(), pruefsumme: z.string() })).min(1),
    gewaehlt: z.object({ look: z.string(), von: z.string().min(1), am: Iso }).optional(),
    angewendet: z
      .object({
        look: z.string(),
        am: Iso,
        ok: z.number().int().min(0),
        vorhanden: z.number().int().min(0),
        fehler: z.array(z.object({ datei: z.string(), grund: z.string() })),
        ausgabe: z.string(),
      })
      .optional(),
  })
  .strict();
export type FotoStand = z.infer<typeof FotoStand>;

// ---------- Kennungen und Ablage ----------

/** Aus dem Ordner (relativ zu seiner Wurzel) eine Kennung für die Ablage der Daten: ein Teil lesbar, ein Teil Prüfsumme gegen Verwechslungen. */
export function batchId(ordnerRel: string, wurzel: "studio" | "medien" = "studio"): string {
  const lesbar = ordnerRel
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  const hash = createHash("sha1").update(`${wurzel}:${ordnerRel.normalize("NFC")}`).digest("hex").slice(0, 6);
  return `${lesbar || "fotos"}-${hash}`;
}

export const batchDir = (datenDir: string, id: string): string => path.join(datenDir, "foto", id);
const standPfad = (dir: string): string => path.join(dir, "foto.json");

export function liesStand(dir: string): FotoStand | undefined {
  const p = standPfad(dir);
  if (!fs.existsSync(p)) return undefined;
  const r = FotoStand.safeParse(JSON.parse(fs.readFileSync(p, "utf8")));
  if (!r.success) throw new Error(`${p} ist ungültig (${r.error.issues[0]?.message ?? "?"}). Löschen und «./studio foto muster» erneut ausführen`);
  return r.data;
}

function schreibeStand(dir: string, s: FotoStand): void {
  fs.mkdirSync(dir, { recursive: true });
  const ziel = standPfad(dir);
  fs.writeFileSync(`${ziel}.neu`, JSON.stringify(s, null, 2) + "\n");
  fs.renameSync(`${ziel}.neu`, ziel);
}

// ---------- Looks als LUT ----------

/** Belichtung für Fotos ohne Log (Standard-Profil): Verschiebung in Blenden auf dem Licht, Gamma 2,2 als Näherung für sRGB. `undefined` bei 0. */
export function standardBelichtung(blenden: number): Vorstufe | undefined {
  if (blenden === 0) return undefined;
  const faktor = 2 ** blenden;
  const k = (x: number): number => Math.pow(Math.min(1, Math.pow(Math.max(0, x), 2.2) * faktor), 1 / 2.2);
  return (c: Rgb) => ({ r: k(c.r), g: k(c.g), b: k(c.b) });
}

/** Was sich an einem Look ändern darf, ohne dass die Wahl eines Menschen ungültig wird: nichts. Die Prüfsumme deckt alles ab, was das Bild bestimmt. */
export function pruefsumme(look: FotoLook | null, profil: Profil, belichtung: number): string {
  const inhalt = { look: look ? { farblook: look.farblook, farbpaar: look.farbpaar ?? null, korn: look.korn } : null, profil, belichtung };
  return createHash("sha1").update(JSON.stringify(inhalt)).digest("hex").slice(0, 12);
}

/** Die LUT zu einem Look (oder zur reinen Umrechnung, wenn `look` null ist). `undefined` heisst: Das Bild bleibt, wie es ist. */
export function baueLookCube(look: FotoLook | null, profil: Profil, belichtung: number): string | undefined {
  const nachstufe = look?.farbpaar ? farbpaarStufe(look.farbpaar) : undefined;
  if (profil === "vlog") return baueVlogCube(look?.name ?? "Basis", look?.farblook, { belichtung, nachstufe });
  const vorstufe = standardBelichtung(belichtung);
  if (!look && !vorstufe) return undefined;
  const f = look?.farblook ?? { gamma: 1, kontrast: 0, saettigung: 1, kuehle: 0 };
  return baueCube(look?.name ?? "Basis", { ...f, schwarz: f.schwarz ?? 0, weiss: f.weiss ?? 1 }, 33, vorstufe, nachstufe);
}

async function inGruppen<T>(items: T[], breite: number, tu: (x: T, i: number) => Promise<void>): Promise<void> {
  let naechster = 0;
  const arbeiter = Array.from({ length: Math.max(1, Math.min(breite, items.length)) }, async () => {
    for (;;) {
      const i = naechster++;
      if (i >= items.length) return;
      await tu(items[i]!, i);
    }
  });
  await Promise.all(arbeiter);
}

const prozent = (x: number): string => `${Math.round(x * 100)} %`;

// ---------- Muster ----------

export interface MusterOptionen {
  /** Der Fotoordner, wie ihn `loeseOrdnerAuf` auflöst. */
  ordner: Aufgeloest;
  datenDir: string;
  typ: FotoTyp;
  marke: Markenprofil;
  ablage: FotoLook[];
  profil: Profil | "auto";
  belichtung: number;
  schrift?: string;
  werkzeuge: FotoWerkzeuge;
  jetzt: () => string;
  protokoll?: (zeile: string) => void;
}

export interface MusterErgebnis {
  stand: FotoStand;
  dir: string;
  bogen: string;
  legende: string;
}

/** Regeln für Typ und Marke: Kundenfotos tragen immer die Marke des Kunden, nie die eigene. Hinter den Kulissen ist die eigene Marke der Standard. */
export function pruefeTypUndMarke(typ: FotoTyp, markenKey: string | undefined, eigeneMarke = "alperna"): string {
  if (typ === "kunde") {
    if (!markenKey) throw new Error("Bei Kundenfotos gehört --marke <key> dazu (das Profil des Kunden unter marken/)");
    if (markenKey === eigeneMarke) throw new Error(`Kundenfotos tragen die Marke des Kunden, nicht «${eigeneMarke}». Für eigene Fotos --typ bts nehmen`);
    return markenKey;
  }
  return markenKey ?? eigeneMarke;
}

export async function erzeugeMuster(o: MusterOptionen): Promise<MusterErgebnis> {
  const log = o.protokoll ?? (() => {});
  await pruefeWerkzeug(o.werkzeuge);
  const sammlung = sammleFotos(o.ordner.abs);
  if (sammlung.fotos.length === 0) {
    const grund = sammlung.uebersprungen.length ? ` (${sammlung.uebersprungen.length} Bilder in einem anderen Format, siehe docs/foto-batch.md)` : "";
    throw new Error(`Im Ordner liegen keine JPEG-Fotos${grund}: ${o.ordner.abs}`);
  }
  pruefeAusgabeNamen(sammlung.fotos);
  log(`${sammlung.fotos.length} Fotos gefunden, Messung läuft …`);

  const masse: BildMass[] = [];
  const unlesbar: string[] = [];
  await inGruppen(sammlung.fotos, 4, async (rel) => {
    try {
      masse.push(await messeFoto(o.werkzeuge, path.join(o.ordner.abs, rel), rel));
    } catch {
      unlesbar.push(rel);
    }
  });
  if (masse.length === 0) throw new Error("Kein Foto liess sich lesen");
  masse.sort((a, b) => (a.pfad < b.pfad ? -1 : 1));

  const erkennung = erkenneProfil(masse);
  let profil: Profil;
  let profilQuelle: "erkannt" | "angegeben";
  if (o.profil !== "auto") {
    profil = o.profil;
    profilQuelle = "angegeben";
  } else if (erkennung.profil === "unklar") {
    throw new Error(
      `Die Fotos lassen sich nicht eindeutig zuordnen: ${prozent(erkennung.flach)} sind flach wie V-Log (mittleres Schwarz ${prozent(erkennung.p2)}, mittleres Weiss ${prozent(erkennung.p98)}). Bitte angeben: --profil vlog oder --profil standard`,
    );
  } else {
    profil = erkennung.profil;
    profilQuelle = "erkannt";
  }

  const muster = waehleMuster(masse, MUSTER_ANZAHL);
  const looks = looksFuerMuster(o.marke, o.ablage);
  const id = batchId(o.ordner.rel, o.ordner.wurzel);
  const dir = batchDir(o.datenDir, id);
  fs.mkdirSync(dir, { recursive: true });

  const basisName = profil === "vlog" ? "Basis (nur Umrechnung)" : "Original";
  const spalten: { name: string; look: FotoLook | null }[] = [{ name: basisName, look: null }, ...looks.map((l) => ({ name: l.name, look: l }))];

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "studio-foto-"));
  try {
    const cubes: (string | undefined)[] = [];
    for (const [i, s] of spalten.entries()) {
      const text = baueLookCube(s.look, profil, o.belichtung);
      if (text === undefined) cubes.push(undefined);
      else {
        const datei = path.join(tmp, `look-${i}.cube`);
        fs.writeFileSync(datei, text);
        cubes.push(datei);
      }
    }
    const aufgaben = muster.flatMap((m, r) => spalten.map((_, c) => ({ m, r, c })));
    log(`Bogen mit ${muster.length} Fotos und ${spalten.length} Spalten wird gerechnet …`);
    await inGruppen(aufgaben, 3, async ({ m, r, c }) => {
      await schreibeKachel(o.werkzeuge, { eingang: path.join(o.ordner.abs, m.pfad), ausgang: path.join(tmp, `k${r}-${c}.jpg`), cube: cubes[c], korn: spalten[c]!.look?.korn, seite: KACHEL_SEITE });
    });
    const bogen = path.join(dir, "muster.jpg");
    // die Zellen folgen dem Seitenverhältnis der Muster (die Kacheln sind schon aufgerichtet)
    const aspekte: number[] = [];
    for (const [r] of muster.entries()) {
      const p = await o.werkzeuge.ffprobe(["-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", path.join(tmp, `k${r}-0.jpg`)]);
      const [b, h] = p.stdout.toString().trim().split(",").map(Number);
      if (b && h) aspekte.push(h / b);
    }
    await schreibeBogen(o.werkzeuge, {
      spalten: spalten.map((s) => s.name),
      zeilen: muster.map((m, r) => ({ name: `${m.pfad}   (Helligkeit ${prozent(m.mittel)})`, kacheln: spalten.map((_, c) => path.join(tmp, `k${r}-${c}.jpg`)) })),
      schrift: o.schrift,
      hoehe: kachelHoehe(aspekte),
      ausgang: bogen,
    });

    const stand: FotoStand = {
      schema: 1,
      id,
      typ: o.typ,
      marke: o.marke.schluessel,
      ordner: o.ordner.rel,
      wurzel: o.ordner.wurzel,
      profil,
      profilQuelle,
      belichtung: o.belichtung,
      erstellt: o.jetzt(),
      fotos: sammlung.fotos.length,
      unlesbar: unlesbar.sort(),
      muster: muster.map((m) => ({ datei: m.pfad, mittel: Number(m.mittel.toFixed(4)) })),
      looks: looks.map((l) => ({ id: l.id, name: l.name, pruefsumme: pruefsumme(l, profil, o.belichtung) })),
    };
    schreibeStand(dir, stand);
    const legende = schreibeLegende(dir, stand, looks, spalten.map((s) => s.name), erkennung, sammlung.uebersprungen.length, o.schrift !== undefined);
    return { stand, dir, bogen, legende };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function schreibeLegende(dir: string, s: FotoStand, looks: FotoLook[], spalten: string[], e: ReturnType<typeof erkenneProfil>, uebersprungen: number, beschriftet: boolean): string {
  const z: string[] = [
    `# Muster für ${s.ordner}`,
    "",
    `- Typ: ${s.typ === "kunde" ? "Kundenfotos" : "Hinter den Kulissen"}, Marke «${s.marke}»`,
    `- Fotos: ${s.fotos}${s.unlesbar.length ? `, davon nicht lesbar: ${s.unlesbar.join(", ")}` : ""}${uebersprungen ? `, ${uebersprungen} Bilder in einem anderen Format übersprungen` : ""}`,
    `- Profil: ${s.profil === "vlog" ? "V-Log (flach, wird umgerechnet)" : "Standard (fertig gerechnete Fotos)"}, ${s.profilQuelle}${s.profilQuelle === "erkannt" ? ` (${prozent(e.flach)} der Fotos flach, mittleres Schwarz ${prozent(e.p2)}, mittleres Weiss ${prozent(e.p98)})` : ""}`,
    `- Belichtung der Umrechnung: ${s.belichtung >= 0 ? "+" : ""}${s.belichtung} Blenden`,
    "",
    `## Spalten von links nach rechts${beschriftet ? "" : " (auf dem Bogen fehlt die Beschriftung, es wurde keine Schrift gefunden: STUDIO_FONT=/Pfad/zur/Schrift.ttf)"}`,
    "",
    ...spalten.map((n, i) => `${i + 1}. ${n}${i === 0 ? "" : ` (${looks[i - 1]!.id}): ${looks[i - 1]!.stimmung}`}`),
    "",
    "## Zeilen",
    "",
    ...s.muster.map((m, i) => `${i + 1}. ${m.datei} (Helligkeit ${prozent(m.mittel)})`),
    "",
    "## So geht es weiter",
    "",
    "Schau den Bogen `muster.jpg` an. **Die Basis muss wie ein normales, richtig belichtetes Foto aussehen.** Wenn nicht, stimmt das Profil oder die Belichtung nicht: `./studio foto muster … --profil standard` oder `--belichtung 0.5`.",
    "Dann den Look wählen. Das tut ein Mensch, nicht Claude:",
    "",
    `\`./studio foto anwenden "${s.ordner}" --look <id> --mensch --by <Name>\``,
    "",
    "Die Zahlen der Looks sind Vorschläge zum Ausprobieren, nicht belegt. Die Originale bleiben unangetastet.",
    "",
  ];
  const datei = path.join(dir, "muster.md");
  fs.writeFileSync(datei, z.join("\n"));
  return datei;
}

// ---------- Anwenden ----------

export interface AnwendenOptionen {
  ordner: Aufgeloest;
  datenDir: string;
  marke: Markenprofil;
  ablage: FotoLook[];
  look: string;
  /** Der Name des Menschen, der gewählt hat. Ohne ihn wird nichts angewendet. */
  von: string;
  neu: boolean;
  exifBehalten: boolean;
  parallel: number;
  werkzeuge: FotoWerkzeuge;
  jetzt: () => string;
  protokoll?: (zeile: string) => void;
}

export interface AnwendenErgebnis {
  ok: number;
  vorhanden: number;
  fehler: { datei: string; grund: string }[];
  ausgabe: string;
  stand: FotoStand;
}

export async function wendeAn(o: AnwendenOptionen): Promise<AnwendenErgebnis> {
  const log = o.protokoll ?? (() => {});
  if (!o.von.trim()) throw new Error("Der Name des Menschen fehlt: Die Wahl des Looks trifft ein Mensch (--mensch --by Name)");
  const ordnerRel = o.ordner.rel;
  const dir = batchDir(o.datenDir, batchId(ordnerRel, o.ordner.wurzel));
  const stand = liesStand(dir);
  if (!stand) throw new Error(`Für diesen Ordner gibt es noch kein Muster. Zuerst: ./studio foto muster "${ordnerRel}" --typ kunde|bts`);
  if (o.marke.schluessel !== stand.marke) throw new Error(`Das Muster gehört zur Marke «${stand.marke}», geladen ist «${o.marke.schluessel}»`);
  const gezeigt = stand.looks.find((l) => l.id === o.look);
  if (!gezeigt) throw new Error(`Der Look «${o.look}» war nicht auf dem Muster. Gezeigt wurden: ${stand.looks.map((l) => l.id).join(", ")}`);
  const look = looksFuerMuster(o.marke, o.ablage).find((l) => l.id === o.look);
  if (!look || pruefsumme(look, stand.profil, stand.belichtung) !== gezeigt.pruefsumme) {
    throw new Error(`Der Look «${o.look}» hat sich seit dem Muster geändert. Muster neu erzeugen, damit die Wahl auf dem beruht, was gezeigt wurde`);
  }

  await pruefeWerkzeug(o.werkzeuge);
  const sammlung = sammleFotos(o.ordner.abs);
  if (sammlung.fotos.length === 0) throw new Error(`Im Ordner liegen keine JPEG-Fotos mehr: ${o.ordner.abs}`);
  pruefeAusgabeNamen(sammlung.fotos);

  const gewaehlt = { look: o.look, von: o.von.trim(), am: o.jetzt() };
  schreibeStand(dir, { ...stand, gewaehlt });

  const aus = path.join(o.ordner.abs, ausgabeName(o.look));
  fs.mkdirSync(aus, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "studio-foto-"));
  const fehler: { datei: string; grund: string }[] = [];
  let ok = 0;
  let vorhanden = 0;
  try {
    const text = baueLookCube(look, stand.profil, stand.belichtung);
    let cube: string | undefined;
    if (text !== undefined) {
      cube = path.join(tmp, "look.cube");
      fs.writeFileSync(cube, text);
    }
    log(`${sammlung.fotos.length} Fotos mit «${look.name}» …`);
    let fertig = 0;
    await inGruppen(sammlung.fotos, o.parallel, async (rel) => {
      const ziel = path.join(aus, ausgabeDatei(rel));
      try {
        if (!o.neu && fs.existsSync(ziel)) vorhanden += 1;
        else {
          await wendeLookAn(o.werkzeuge, { eingang: path.join(o.ordner.abs, rel), ausgang: ziel, cube, korn: look.korn, exifBehalten: o.exifBehalten });
          ok += 1;
        }
      } catch (e) {
        fehler.push({ datei: rel, grund: (e as Error).message });
      }
      fertig += 1;
      if (fertig % 25 === 0) log(`  ${fertig} von ${sammlung.fotos.length}`);
    });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  fehler.sort((a, b) => (a.datei < b.datei ? -1 : 1));

  const ausgabe = o.ordner.rel === "." ? ausgabeName(look.id) : `${o.ordner.rel}/${ausgabeName(look.id)}`;
  const am = o.jetzt();
  fs.writeFileSync(
    path.join(aus, "foto-batch.json"),
    JSON.stringify({ schema: 1, look: look.id, name: look.name, profil: stand.profil, belichtung: stand.belichtung, typ: stand.typ, marke: stand.marke, gewaehltVon: gewaehlt.von, am, neu: ok, schonVorhanden: vorhanden, fehler }, null, 2) + "\n",
  );
  const neuerStand: FotoStand = { ...stand, gewaehlt, angewendet: { look: look.id, am, ok, vorhanden, fehler, ausgabe } };
  schreibeStand(dir, neuerStand);
  return { ok, vorhanden, fehler, ausgabe, stand: neuerStand };
}
