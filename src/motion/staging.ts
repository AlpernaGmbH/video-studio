import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { z } from "zod";
import type { Markenprofil } from "../core/schemas";
import { KOMPOSITION } from "./bibliothek";
import { MARKEN_VARIABLEN } from "./stueck";

const require = createRequire(import.meta.url);

const SchriftenListe = z.object({
  schriften: z.array(z.object({ family: z.string(), weight: z.number(), style: z.enum(["normal", "italic"]), file: z.string() })),
});

export interface StagingOptionen {
  stueckDir: string;
  zielDir: string;
  /** Ordner mit fonts.json und den Schriftdateien (Standard: studio/assets/fonts). */
  schriftenDir: string;
  marke?: Markenprofil;
}

export interface StagingErgebnis {
  dir: string;
  fehler: string[];
  warnungen: string[];
}

export function gsapPfad(): string {
  return require.resolve("gsap/dist/gsap.min.js");
}

/** Schriftfamilien, die für das Rendern gebraucht werden. Ohne Marke gelten die Standardschriften der Komposition. */
export function benoetigteFamilien(marke?: Markenprofil): string[] {
  if (!marke) return [MARKEN_VARIABLEN.markeFontTitel.standard, MARKEN_VARIABLEN.markeFontText.standard];
  return [...new Set([marke.schriften.titel, marke.schriften.fliesstext])];
}

/**
 * Baut ein renderbares Arbeitsverzeichnis: index.html und assets/ des Stücks, GSAP lokal,
 * die Schriften der Marke und assets/brand.css mit den @font-face-Regeln.
 * Fehlt eine Schrift, ist das ein Fehler. Chrome würde sonst still auf sans-serif zurückfallen.
 */
export function stageStueck(opt: StagingOptionen): StagingErgebnis {
  const fehler: string[] = [];
  const warnungen: string[] = [];

  const quelle = path.join(opt.stueckDir, KOMPOSITION);
  if (!fs.existsSync(quelle)) return { dir: opt.zielDir, fehler: [`${KOMPOSITION} fehlt in ${opt.stueckDir}`], warnungen };

  fs.rmSync(opt.zielDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(opt.zielDir, "assets", "vendor"), { recursive: true });
  fs.mkdirSync(path.join(opt.zielDir, "assets", "fonts"), { recursive: true });

  fs.copyFileSync(quelle, path.join(opt.zielDir, KOMPOSITION));
  const eigeneAssets = path.join(opt.stueckDir, "assets");
  if (fs.existsSync(eigeneAssets)) fs.cpSync(eigeneAssets, path.join(opt.zielDir, "assets"), { recursive: true });

  fs.copyFileSync(gsapPfad(), path.join(opt.zielDir, "assets", "vendor", "gsap.min.js"));

  // Schriften
  const listePfad = path.join(opt.schriftenDir, "fonts.json");
  let verfuegbar: z.infer<typeof SchriftenListe>["schriften"] = [];
  if (!fs.existsSync(listePfad)) {
    fehler.push(`fonts.json fehlt in ${opt.schriftenDir}`);
  } else {
    const parsed = SchriftenListe.safeParse(JSON.parse(fs.readFileSync(listePfad, "utf8")));
    if (!parsed.success) fehler.push(`fonts.json ist ungültig: ${parsed.error.issues[0]?.message ?? "?"}`);
    else verfuegbar = parsed.data.schriften;
  }

  const css: string[] = ["/* erzeugt von stageStueck, nicht von Hand ändern */"];
  for (const familie of benoetigteFamilien(opt.marke)) {
    const treffer = verfuegbar.filter((s) => s.family === familie);
    if (treffer.length === 0) {
      fehler.push(`Schrift «${familie}» ist nicht in fonts.json. Datei in studio/assets/fonts ablegen und eintragen`);
      continue;
    }
    for (const s of treffer) {
      const von = path.join(opt.schriftenDir, s.file);
      if (!fs.existsSync(von)) {
        fehler.push(`Schriftdatei ${s.file} für «${familie}» fehlt`);
        continue;
      }
      fs.copyFileSync(von, path.join(opt.zielDir, "assets", "fonts", s.file));
      css.push(
        `@font-face { font-family: "${s.family}"; font-weight: ${s.weight}; font-style: ${s.style}; font-display: block; src: url("fonts/${s.file}") format("woff2"); }`,
      );
    }
  }
  fs.writeFileSync(path.join(opt.zielDir, "assets", "brand.css"), css.join("\n") + "\n");

  if (opt.marke && opt.marke.status !== "freigegeben") {
    warnungen.push(`Markenprofil «${opt.marke.name}» ist ein Platzhalter: nur Entwurf, kein finaler Export`);
  }
  return { dir: opt.zielDir, fehler, warnungen };
}
