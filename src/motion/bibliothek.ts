import fs from "node:fs";
import path from "node:path";
import { Stueck, VORHANDEN_AB, erzeugeDeklaration, loeseVariablen, type HfVariable } from "./stueck";

export const STUECK_DATEI = "piece.json";
export const KOMPOSITION = "index.html";

export interface GeladenesStueck {
  stueck: Stueck;
  dir: string;
}

export interface Befund {
  stufe: "fehler" | "warnung";
  stueck?: string;
  code: string;
  text: string;
}

export interface Bibliothek {
  stuecke: GeladenesStueck[];
  befunde: Befund[];
}

/** Lädt alle Stücke unterhalb von `root` (je ein Ordner mit piece.json). Ordner mit «_» oder «.» am Anfang werden übersprungen. */
export function ladeBibliothek(root: string): Bibliothek {
  const stuecke: GeladenesStueck[] = [];
  const befunde: Befund[] = [];
  if (!fs.existsSync(root)) return { stuecke, befunde };

  for (const eintrag of fs.readdirSync(root, { withFileTypes: true })) {
    if (!eintrag.isDirectory() || eintrag.name.startsWith("_") || eintrag.name.startsWith(".")) continue;
    const dir = path.join(root, eintrag.name);
    const datei = path.join(dir, STUECK_DATEI);
    if (!fs.existsSync(datei)) {
      befunde.push({ stufe: "fehler", stueck: eintrag.name, code: "piece_json_fehlt", text: `${eintrag.name}/${STUECK_DATEI} fehlt` });
      continue;
    }
    let roh: unknown;
    try {
      roh = JSON.parse(fs.readFileSync(datei, "utf8"));
    } catch (e) {
      befunde.push({ stufe: "fehler", stueck: eintrag.name, code: "piece_json_ungueltig", text: `${STUECK_DATEI} ist kein gültiges JSON: ${(e as Error).message}` });
      continue;
    }
    const geparst = Stueck.safeParse(roh);
    if (!geparst.success) {
      for (const issue of geparst.error.issues) {
        befunde.push({ stufe: "fehler", stueck: eintrag.name, code: "datenblatt", text: `${issue.path.join(".") || "(Wurzel)"}: ${issue.message}` });
      }
      continue;
    }
    if (geparst.data.id !== eintrag.name) {
      befunde.push({ stufe: "fehler", stueck: eintrag.name, code: "id_ordner", text: `id «${geparst.data.id}» passt nicht zum Ordnernamen «${eintrag.name}»` });
      continue;
    }
    stuecke.push({ stueck: geparst.data, dir });
  }
  stuecke.sort((a, b) => a.stueck.id.localeCompare(b.stueck.id));
  return { stuecke, befunde };
}

/* ---------- Deklaration im HTML ---------- */

const ENTITIES: Record<string, string> = { "&quot;": '"', "&#39;": "'", "&apos;": "'", "&lt;": "<", "&gt;": ">", "&amp;": "&" };
const unescapeAttr = (s: string) => s.replace(/&quot;|&#39;|&apos;|&lt;|&gt;|&amp;/g, (m) => ENTITIES[m] ?? m);
const escapeAttr = (s: string) => s.replaceAll("&", "&amp;").replaceAll("'", "&#39;");

const DEKLARATION = /data-composition-variables\s*=\s*(?:'([^']*)'|"([^"]*)")/s;

export function leseDeklaration(html: string): { ok: true; variablen: HfVariable[] } | { ok: false; grund: string } {
  const m = DEKLARATION.exec(html);
  if (!m) return { ok: false, grund: "data-composition-variables fehlt am <html>-Element" };
  const inhalt = unescapeAttr(m[1] ?? m[2] ?? "");
  try {
    const json: unknown = JSON.parse(inhalt);
    if (!Array.isArray(json)) return { ok: false, grund: "data-composition-variables ist keine Liste" };
    return { ok: true, variablen: json as HfVariable[] };
  } catch (e) {
    return { ok: false, grund: `data-composition-variables ist kein gültiges JSON: ${(e as Error).message}` };
  }
}

/** Schreibt die aus piece.json erzeugte Deklaration ins HTML (ersetzt oder fügt am <html>-Element ein). */
export function setzeDeklaration(html: string, variablen: HfVariable[]): string {
  const json = escapeAttr(JSON.stringify(variablen));
  const attribut = `data-composition-variables='${json}'`;
  if (DEKLARATION.test(html)) return html.replace(DEKLARATION, () => attribut);
  const htmlTag = /<html(\s[^>]*)?>/i;
  if (!htmlTag.test(html)) throw new Error("Kein <html>-Element gefunden");
  return html.replace(htmlTag, (_m, attrs: string | undefined) => `<html${attrs ?? ""} ${attribut}>`);
}

/* ---------- Lint ---------- */

export function lintStueck(g: GeladenesStueck): Befund[] {
  const { stueck, dir } = g;
  const b: Befund[] = [];
  const fehler = (code: string, text: string) => b.push({ stufe: "fehler", stueck: stueck.id, code, text });
  const warnung = (code: string, text: string) => b.push({ stufe: "warnung", stueck: stueck.id, code, text });

  const htmlPfad = path.join(dir, KOMPOSITION);
  if (!fs.existsSync(htmlPfad)) {
    fehler("index_fehlt", `${KOMPOSITION} fehlt`);
    return b;
  }
  const html = fs.readFileSync(htmlPfad, "utf8");

  // 1. Deklaration im HTML == aus piece.json erzeugte Deklaration
  const gelesen = leseDeklaration(html);
  if (!gelesen.ok) {
    fehler("deklaration", gelesen.grund);
  } else {
    const soll = erzeugeDeklaration(stueck);
    const ist = new Map(gelesen.variablen.map((v) => [v.id, v]));
    for (const s of soll) {
      const v = ist.get(s.id);
      if (!v) {
        fehler("variable_fehlt", `Variable «${s.id}» steht in piece.json, aber nicht in ${KOMPOSITION}`);
        continue;
      }
      if (v.type !== s.type) fehler("variable_typ", `«${s.id}»: Typ ${v.type} im HTML, ${s.type} in piece.json`);
      if (JSON.stringify(v.default) !== JSON.stringify(s.default)) {
        fehler("variable_default", `«${s.id}»: Default ${JSON.stringify(v.default)} im HTML, ${JSON.stringify(s.default)} in piece.json`);
      }
      if (s.type === "enum") {
        const a = (v.options ?? []).map((o) => o.value).sort().join("|");
        const c = (s.options ?? []).map((o) => o.value).sort().join("|");
        if (a !== c) fehler("variable_optionen", `«${s.id}»: Optionen weichen ab (HTML: ${a}, piece.json: ${c})`);
      }
    }
    const sollIds = new Set(soll.map((s) => s.id));
    for (const v of gelesen.variablen) {
      if (!sollIds.has(v.id)) fehler("variable_unbekannt", `Variable «${v.id}» steht im HTML, aber nicht in piece.json`);
    }
  }

  // 2. Dauer-Vertrag: kein data-duration am Root, die Timeline endet bei `dauer`
  if (stueck.ausgabe === "overlay") {
    const root = /<[^>]*data-composition-id\s*=\s*["'][^"']*["'][^>]*>/i.exec(html);
    if (!root) {
      fehler("root_fehlt", "Kein Element mit data-composition-id gefunden");
    } else if (/data-duration\s*=/.test(root[0])) {
      fehler("root_dauer", "Das Root-Element darf kein data-duration tragen: die Länge kommt aus der Variable «dauer»");
    }
    if (!/getVariables\s*\(/.test(html)) fehler("variablen_nicht_gelesen", "index.html liest die Variablen nicht (window.__hyperframes.getVariables())");
    if (!/getVariables\s*\(\s*\)[\s\S]*dauer|\.dauer\b/.test(html)) warnung("dauer_nicht_gelesen", "index.html scheint die Variable «dauer» nicht zu lesen");
    if (!/data-width\s*=\s*["']1080["']/.test(html) || !/data-height\s*=\s*["']1920["']/.test(html)) {
      fehler("format", "Root muss data-width=\"1080\" und data-height=\"1920\" tragen");
    }
    if (!/background\s*:\s*transparent/i.test(html)) warnung("transparent", "Kein «background: transparent» gefunden. Ohne transparenten Hintergrund gibt es kein Alpha im WebM");
  }
  // Renders müssen offline und reproduzierbar laufen: nichts aus dem Netz nachladen (SVG-Namensraum ausgenommen).
  const ohneKommentare = html.replace(/<!--[\s\S]*?-->/g, "");
  if (/https?:\/\/(?!www\.w3\.org\/)/i.test(ohneKommentare)) {
    fehler("extern", "Externe URL im HTML. GSAP und Schriften kommen aus assets/ (beim Staging eingefügt), nie aus dem Netz");
  }
  if (/gsap\./.test(ohneKommentare) && !/src\s*=\s*["']assets\/vendor\/gsap\.min\.js["']/.test(ohneKommentare)) {
    fehler("gsap_quelle", "GSAP wird benutzt, aber nicht über assets/vendor/gsap.min.js geladen");
  }

  // 3. Platzhalter aus dem Gerüst dürfen nicht in ein gebautes Stück
  if (stueck.status !== "entwurf") {
    if (JSON.stringify(stueck).includes("TODO")) fehler("todo", "piece.json enthält noch «TODO»-Platzhalter aus dem Gerüst");
    if (html.includes("TODO")) fehler("todo", `${KOMPOSITION} enthält noch «TODO»-Platzhalter aus dem Gerüst`);
  }

  // 3b. Vorschaubilder ab «gebaut»
  if (stueck.status !== "entwurf") {
    const vorschau = path.join(dir, "vorschau");
    const bilder = fs.existsSync(vorschau) ? fs.readdirSync(vorschau).filter((f) => /\.(png|jpe?g)$/i.test(f)) : [];
    if (bilder.length === 0) warnung("vorschau_fehlt", "Keine Vorschaubilder in vorschau/ (npm run studio -- motion vorschau <id>)");
  }

  // 4. Einsatzbeispiele müssen mit den Parametern auflösbar sein
  for (const [i, bsp] of (stueck.einsatz?.beispiele ?? []).entries()) {
    const werte = { ...bsp.variablen };
    const dauer = typeof werte["dauer"] === "number" ? (werte["dauer"] as number) : undefined;
    delete werte["dauer"];
    const r = loeseVariablen(stueck, werte, { dauer, ohneMarke: true });
    if (!r.ok) fehler("beispiel", `Einsatzbeispiel ${i + 1}: ${r.fehler.join("; ")}`);
  }

  return b;
}

export function lintBibliothek(bib: Bibliothek): Befund[] {
  const b: Befund[] = [...bib.befunde];
  for (const g of bib.stuecke) b.push(...lintStueck(g));
  const ids = new Set(bib.stuecke.map((g) => g.stueck.id));
  for (const g of bib.stuecke) {
    for (const k of g.stueck.einsatz?.kombinierbarMit ?? []) {
      if (!ids.has(k)) b.push({ stufe: "warnung", stueck: g.stueck.id, code: "kombination_unbekannt", text: `kombinierbarMit verweist auf unbekanntes Stück «${k}»` });
    }
  }
  return b;
}

/* ---------- Auswahl und kompakter Index ---------- */

export function vorhandene(bib: Bibliothek): Stueck[] {
  return bib.stuecke.map((g) => g.stueck).filter((s) => VORHANDEN_AB.includes(s.status));
}

export function aktive(bib: Bibliothek): Stueck[] {
  return bib.stuecke.map((g) => g.stueck).filter((s) => s.status === "aktiv");
}

/**
 * Kompakter Index für den Storyboard-Prompt. Bewusst klein: bei Hunderten von Stücken darf nicht jedes
 * Datenblatt in jeden Prompt. Claude liest bei Bedarf `piece.json` des gewählten Stücks.
 */
export function kompakterIndex(stuecke: Stueck[]): string {
  if (stuecke.length === 0) return "(Bibliothek ist leer)";
  return stuecke
    .map((s) => {
      const params = s.parameter.map((p) => `${p.id}${p.pflicht ? "*" : ""}:${p.typ}`).join(", ");
      return `- ${s.id} · ${s.name} · ${s.zweck} | Auslöser: ${s.ausloeser.typen.join("/")} | ${s.dauer.min}–${s.dauer.max} s | Parameter: ${params || "keine"}`;
    })
    .join("\n");
}
