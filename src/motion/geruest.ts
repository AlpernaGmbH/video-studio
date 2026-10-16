import fs from "node:fs";
import path from "node:path";
import { KOMPOSITION, STUECK_DATEI, setzeDeklaration } from "./bibliothek";
import { MARKEN_VARIABLEN, SIGNAL_TYPEN, Stueck, erzeugeDeklaration, type SignalTyp } from "./stueck";

/**
 * Legt ein neues Stück an, das den Stück-Vertrag schon erfüllt (Datenblatt, Deklaration, Komposition mit
 * transparentem Hintergrund, lokalem GSAP, «dauer»-Timeline, Marken-Variablen). Die Platzhalter tragen «TODO»:
 * Der Lint lässt ab Status «gebaut» kein «TODO» mehr durch. So baut jedes neue Stück auf demselben Format auf.
 */

export interface GeruestOptionen {
  id: string;
  name: string;
  /** Welche Art Stelle das Stück zeigen soll. Daraus entstehen passende Start-Parameter. */
  typen: SignalTyp[];
  idee?: string;
  welle?: 1 | 2 | 3 | "wachstum";
}

export class GeruestFehler extends Error {}

function startParameter(typen: SignalTyp[]) {
  const p: Record<string, unknown>[] = [];
  const beschr = (s: string) => `TODO: ${s}`;
  if (typen.includes("verlauf")) {
    p.push({ id: "werte", typ: "zahlenreihe", label: "Werte", beschreibung: beschr("Die gemessenen Werte in zeitlicher Reihenfolge"), pflicht: true, minAnzahl: 2, maxAnzahl: 8, default: [90, 75, 60] });
  }
  if (typen.includes("aufzaehlung")) {
    p.push({ id: "punkte", typ: "textliste", label: "Punkte", beschreibung: beschr("Die Punkte der Aufzählung in Reihenfolge"), pflicht: true, minAnzahl: 2, maxAnzahl: 5, maxLaenge: 40, default: ["Erster Punkt", "Zweiter Punkt", "Dritter Punkt"] });
  }
  if ((typen.includes("zahl") || typen.includes("anteil")) && !typen.includes("verlauf")) {
    p.push({ id: "wert", typ: "number", label: "Wert", beschreibung: beschr("Die Kennzahl, die gezeigt wird"), pflicht: true, default: 7 });
  }
  if (p.length === 0) {
    p.push({ id: "text", typ: "string", label: "Text", beschreibung: beschr("Der Text, der erscheint"), pflicht: true, maxLaenge: 60, default: "Beispieltext" });
  }
  p.push({ id: "titel", typ: "string", label: "Titel", beschreibung: beschr("Kurzer Titel über der Grafik, leer lassen für keinen"), maxLaenge: 40, default: "" });
  return p;
}

export function datenblattGeruest(o: GeruestOptionen) {
  return {
    schema: 1,
    id: o.id,
    name: o.name,
    version: "0.1.0",
    status: "entwurf",
    welle: o.welle ?? "wachstum",
    herkunft: o.idee ? { idee: o.idee } : {},
    zweck: "TODO: Ein Satz, was das Stück zeigt.",
    ausloeser: { typen: o.typen, beschreibung: "TODO: Woran man im Skript erkennt, dass dieses Stück passt." },
    parameter: startParameter(o.typen),
    dauer: { standard: 3, min: 1.5, max: 6 },
    ausgabe: "overlay",
    markenvariablen: Object.keys(MARKEN_VARIABLEN),
    passtZu: ["erklaervideo"],
    braucht: ["nichts"],
    aufwand: "mittel",
    abnahme: "TODO: Wie wir prüfen, dass das Stück fertig ist.",
    sicherheitsrand: true,
    engines: ["hyperframes"],
  };
}

export function kompositionGeruest(id: string, name: string): string {
  return `<!doctype html>
<html lang="de-CH">
<head>
<meta charset="utf-8">
<title>${name}</title>
<link rel="stylesheet" href="assets/brand.css">
<script src="assets/vendor/gsap.min.js"></script>
<style>
  html, body { margin: 0; padding: 0; background: transparent; }
  #root { position: relative; width: 1080px; height: 1920px; background: transparent; overflow: hidden; }
  /* Sicherheitsrand (render.ts): oben 8 %, links 5 %, rechts und unten je 20 %. Inhalt nur in x 54 bis 864, y 154 bis 1536. */
  #inhalt {
    position: absolute; left: 70px; top: 700px; width: 780px; box-sizing: border-box; padding: 52px 56px; opacity: 0;
    background: var(--markeBg); color: var(--markeText);
    border-radius: calc(var(--markeRadius) * 1px);
    font-family: var(--markeFontText), sans-serif;
  }
</style>
</head>
<body>
<div id="root" data-composition-id="${id}" data-start="0" data-width="1080" data-height="1920">
  <div id="inhalt">TODO: Inhalt</div>
</div>
<script>
(function () {
  var v = window.__hyperframes.getVariables();
  var root = document.getElementById("root");

  // Marke in CSS-Variablen übernehmen
  ["markeBg", "markeText", "markeAkzent1", "markeAkzent2", "markeFontTitel", "markeFontText", "markeRadius", "markeTempo"].forEach(function (k) {
    if (v[k] !== undefined) root.style.setProperty("--" + k, String(v[k]));
  });

  var d = Number(v.dauer);
  var tempo = Math.min(2, Math.max(0.5, Number(v.markeTempo) || 1));
  var k = 1 / tempo;

  // Die Timeline muss synchron registriert werden (sonst «zero duration» beim Render).
  // Das Ausblenden endet eine Bildlänge (0,04 s) vor «dauer», weil das letzte gerenderte Bild dort liegt.
  var tOut = Math.max(0.6, d - 0.25 * k - 0.04);
  var tl = gsap.timeline({ paused: true });
  tl.fromTo("#inhalt", { opacity: 0, y: 36 }, { opacity: 1, y: 0, duration: 0.35 * k, ease: "power3.out" }, 0);
  // TODO: Animation des Stücks
  tl.to("#inhalt", { opacity: 0, y: -24, duration: 0.25 * k, ease: "power2.in" }, tOut);
  tl.set({}, {}, d); // Die Timeline endet genau bei «dauer»

  window.__timelines = window.__timelines || {};
  window.__timelines["${id}"] = tl;
})();
</script>
</body>
</html>
`;
}

export function legeStueckAn(libRoot: string, o: GeruestOptionen): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(o.id)) throw new GeruestFehler(`«${o.id}» ist kein gültiger Schlüssel (Kleinbuchstaben, Ziffern, Bindestriche)`);
  for (const t of o.typen) if (!SIGNAL_TYPEN.includes(t)) throw new GeruestFehler(`Unbekannter Signaltyp «${t}». Möglich: ${SIGNAL_TYPEN.join(", ")}`);
  if (o.typen.length === 0) throw new GeruestFehler("Mindestens ein Signaltyp ist nötig (--typen verlauf,vergleich …)");
  const dir = path.join(libRoot, o.id);
  if (fs.existsSync(dir)) throw new GeruestFehler(`«${o.id}» existiert schon: ${dir}`);

  const geparst = Stueck.safeParse(datenblattGeruest(o));
  if (!geparst.success) {
    throw new GeruestFehler(`Angaben ungültig: ${geparst.error.issues.map((i) => `${i.path.join(".") || "(Wurzel)"}: ${i.message}`).join("; ")}`);
  }
  const stueck = geparst.data;
  fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
  fs.writeFileSync(path.join(dir, STUECK_DATEI), JSON.stringify(stueck, null, 2) + "\n");
  fs.writeFileSync(path.join(dir, KOMPOSITION), setzeDeklaration(kompositionGeruest(o.id, o.name), erzeugeDeklaration(stueck)));
  fs.writeFileSync(path.join(dir, "assets", ".gitkeep"), "");
  return dir;
}
