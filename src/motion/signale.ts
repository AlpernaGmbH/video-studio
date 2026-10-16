import { z } from "zod";

/**
 * Signale: Stellen in einem Satz, an denen eine Grafik besser erklärt als gesprochene Worte.
 * Das ist eine Vorstufe mit deutschen Mustern (Skript ist Hochdeutsch, Bauplan 3.2). Sie findet die
 * offensichtlichen Stellen verlässlich und deterministisch. Was sie nicht findet (Bilder, Metaphern,
 * räumliche Erklärungen), ergänzt Claude als Signal vom Typ «frei».
 */

const Basis = { text: z.string().min(1), sicherheit: z.enum(["hoch", "mittel", "niedrig"]).default("hoch") };

export const Signal = z.discriminatedUnion("typ", [
  z.object({ ...Basis, typ: z.literal("zahl"), wert: z.number(), einheit: z.string().optional() }),
  z.object({ ...Basis, typ: z.literal("anteil"), zaehler: z.number().optional(), nenner: z.number().optional() }),
  z.object({
    ...Basis,
    typ: z.literal("verlauf"),
    von: z.number().optional(),
    auf: z.number().optional(),
    delta: z.number().optional(),
    schritte: z.number().int().optional(),
    schrittEinheit: z.string().optional(),
    richtung: z.enum(["steigend", "fallend"]).optional(),
  }),
  z.object({ ...Basis, typ: z.literal("vergleich"), marker: z.string() }),
  z.object({ ...Basis, typ: z.literal("aufzaehlung"), anzahl: z.number().int().optional() }),
  z.object({ ...Basis, typ: z.literal("prozess") }),
  z.object({ ...Basis, typ: z.literal("zeitraum") }),
  /** Von Claude ergänzt: etwas, das die Muster nicht erkennen. */
  z.object({ ...Basis, typ: z.literal("frei"), beschreibung: z.string().min(5) }),
]);
export type Signal = z.infer<typeof Signal>;

/* ---------- Zahlen ---------- */

const ZAHLWORT: Record<string, number> = {
  ein: 1, eine: 1, einen: 1, einem: 1, eins: 1, zwei: 2, drei: 3, vier: 4, "fünf": 5, sechs: 6, sieben: 7, acht: 8, neun: 9,
  zehn: 10, elf: 11, "zwölf": 12, zwanzig: 20, dreissig: 30, vierzig: 40, "fünfzig": 50, hundert: 100,
};
/** Zahlwörter (klein), für die Ähnlichkeitsprüfung gegen Wiederholung. */
export const ZAHLWOERTER: ReadonlySet<string> = new Set(Object.keys(ZAHLWORT));
const ZAHLWORT_RE = Object.keys(ZAHLWORT).sort((a, b) => b.length - a.length).join("|");
/** 1'000, 1’000, 97, 7,5, 7.5, 1.000 */
const NUM = String.raw`\d{1,3}(?:['’]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?`;
const NUMODER = `(?:${NUM}|${ZAHLWORT_RE})`;

export function parseZahl(token: string): number | undefined {
  const t = token.trim().toLowerCase();
  if (t in ZAHLWORT) return ZAHLWORT[t];
  let s = t.replace(/['’]/g, "");
  // «1.000» und «1.000,50» sind deutsche Tausenderpunkte, «7.5» ist ein Dezimalpunkt
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

const EINHEIT_PROZENT = String.raw`(?:%|prozent(?:punkte[n]?)?|punkte[n]?)`;
const MESS_EINHEITEN = "messungen|scans|tests|läufen|versuchen|runden|durchgängen|checks|analysen|messpunkten|audits|auswertungen|durchläufen";
const ZEIT_EINHEITEN = "sekunden|minuten|stunden|tagen|tage|wochen|monaten|monate|jahren|jahre|quartalen|quartale";

/**
 * JavaScripts \b kennt nur ASCII-Wortzeichen und greift deshalb nie vor «über» oder «Über».
 * Hier stehen ‹ und › für Wortgrenzen nach Unicode. Alle Muster laufen mit dem u-Flag.
 */
const GRENZE_L = String.raw`(?<![\p{L}\p{N}_])`;
const GRENZE_R = String.raw`(?![\p{L}\p{N}_])`;
function rx(quelle: string, flags = "i"): RegExp {
  return new RegExp(quelle.replaceAll("‹", GRENZE_L).replaceAll("›", GRENZE_R), flags.includes("u") ? flags : flags + "u");
}

/** Verlaufsverben mit Stämmen, damit Plural und Partizip (stiegen, gesunken, verschlechtert) mitgenommen werden. */
const TREND_VERB = String.raw`(?:stieg|steig|gestiegen|wuchs|wachs|gewachsen|sank|sink|gesunken|fiel|fäll|gefallen|zugenommen|nahm\p{L}*\s+zu|abgenommen|nahm\p{L}*\s+ab|stürz|brach\p{L}*\s+ein|eingebrochen|verbesser|verschlechter|verdoppel|halbier)`;
const TREND_STEIGEND = String.raw`(?:stieg|steig|gestiegen|wuchs|wachs|gewachsen|zugenommen|nahm\p{L}*\s+zu|verbesser|verdoppel)`;

type Spanne = [number, number];
const ueberlappt = (a: Spanne, spannen: Spanne[]) => spannen.some(([s, e]) => a[0] < e && s < a[1]);

/** Findet alle Signale in einem Satz. Reihenfolge der Muster = Vorrang bei Überschneidungen. */
export function erkenneSignale(satz: string): Signal[] {
  const out: Signal[] = [];
  const belegt: Spanne[] = [];
  const nimm = (m: RegExpExecArray): Spanne => [m.index, m.index + m[0].length];

  const trendVerb = rx(`‹${TREND_VERB}\\p{L}*›`);
  const steigend = rx(`‹${TREND_STEIGEND}\\p{L}*›`);

  // Schritte («über 5 Scans», «in 3 Tagen») werden zuerst gelesen, damit sie das Verlauf-Signal anreichern können
  let schritte: { n: number; einheit: string; spanne: Spanne; text: string } | undefined;
  const schrittRe = rx(String.raw`‹(?:über|in|nach|innert|innerhalb\s+von|während|bei|mit)\s+(${NUMODER})\s+(${MESS_EINHEITEN}|${ZEIT_EINHEITEN})›`, "gi");
  for (const m of satz.matchAll(schrittRe)) {
    const n = parseZahl(m[1] ?? "");
    if (n !== undefined && Number.isInteger(n) && !schritte) {
      schritte = { n, einheit: (m[2] ?? "").toLowerCase(), spanne: [m.index!, m.index! + m[0].length], text: m[0] };
    }
  }

  // 1. Verlauf: «von 97 auf 60»
  const vonAuf = rx(String.raw`‹von\s+(${NUM})\s*(?:${EINHEIT_PROZENT}|franken|chf)?\s+(?:bis\s+)?auf\s+(${NUM})\s*(?:${EINHEIT_PROZENT}|franken|chf)?`).exec(satz);
  if (vonAuf) {
    const von = parseZahl(vonAuf[1]!);
    const auf = parseZahl(vonAuf[2]!);
    const verlaufText = schritte ? satz.slice(Math.min(schritte.spanne[0], vonAuf.index), Math.max(schritte.spanne[1], vonAuf.index + vonAuf[0].length)) : vonAuf[0];
    out.push({
      typ: "verlauf",
      von,
      auf,
      schritte: schritte?.n,
      schrittEinheit: schritte?.einheit,
      richtung: von !== undefined && auf !== undefined ? (auf >= von ? "steigend" : "fallend") : undefined,
      text: verlaufText.trim(),
      sicherheit: "hoch",
    });
    belegt.push(nimm(vonAuf));
    if (schritte) belegt.push(schritte.spanne);
  } else {
    // 2. Verlauf: «stieg um 12 Prozent», «fiel über fünf Messungen»
    // Beide Wortstellungen: «stieg um 12 Prozent» und «um 8 Prozent gesunken»
    const um =
      rx(String.raw`‹${TREND_VERB}\p{L}*›[^.!?]*?‹um\s+(${NUM})\s*(${EINHEIT_PROZENT})?`).exec(satz) ??
      rx(String.raw`‹um\s+(${NUM})\s*(${EINHEIT_PROZENT})?[^.!?]*?‹${TREND_VERB}\p{L}*›`).exec(satz);
    if (um) {
      out.push({
        typ: "verlauf",
        delta: parseZahl(um[1]!),
        richtung: steigend.test(um[0]) ? "steigend" : "fallend",
        schritte: schritte?.n,
        schrittEinheit: schritte?.einheit,
        text: um[0].trim(),
        sicherheit: "mittel",
      });
      belegt.push(nimm(um));
      if (schritte) belegt.push(schritte.spanne);
    } else if (schritte && rx(`^(?:${MESS_EINHEITEN})$`).test(schritte.einheit) && trendVerb.test(satz)) {
      out.push({ typ: "verlauf", schritte: schritte.n, schrittEinheit: schritte.einheit, text: satz.trim(), sicherheit: "niedrig" });
      belegt.push(schritte.spanne);
    }
  }

  // Schritte ohne Verlauf: Zeitraum oder gezählte Messung
  if (schritte && !ueberlappt(schritte.spanne, belegt)) {
    if (rx(`^(?:${ZEIT_EINHEITEN})$`).test(schritte.einheit)) {
      out.push({ typ: "zeitraum", text: schritte.text, sicherheit: "hoch" });
    } else {
      out.push({ typ: "zahl", wert: schritte.n, einheit: schritte.einheit, text: schritte.text, sicherheit: "mittel" });
    }
    belegt.push(schritte.spanne);
  }

  // 3. Anteil: «7 von 10», «jeder dritte», «die Hälfte»
  const anteilRe = rx(String.raw`(?<![\p{L}\p{N}])(${NUM})\s+von\s+(${NUM})›(?!\s*${EINHEIT_PROZENT}?\s+auf‹)`, "gi");
  for (const m of satz.matchAll(anteilRe)) {
    const sp: Spanne = [m.index!, m.index! + m[0].length];
    if (ueberlappt(sp, belegt)) continue;
    out.push({ typ: "anteil", zaehler: parseZahl(m[1]!), nenner: parseZahl(m[2]!), text: m[0], sicherheit: "hoch" });
    belegt.push(sp);
  }
  const bruchRe = rx(String.raw`‹(?:jeder|jede|jedes)\s+(?:zweite|dritte|vierte|fünfte|sechste|zehnte)n?›|‹(?:die\s+Hälfte|ein\s+Drittel|zwei\s+Drittel|ein\s+Viertel|drei\s+Viertel|ein\s+Fünftel)›`, "gi");
  for (const m of satz.matchAll(bruchRe)) {
    const sp: Spanne = [m.index!, m.index! + m[0].length];
    if (ueberlappt(sp, belegt)) continue;
    out.push({ typ: "anteil", text: m[0], sicherheit: "hoch" });
    belegt.push(sp);
  }

  // 4. Zahl mit Einheit: «43 Prozent», «CHF 1'200», «300 Anfragen»
  const betragRe = rx(String.raw`‹(?:chf|fr\.)\s*(${NUM})(?:\.[-–])?`, "gi");
  for (const m of satz.matchAll(betragRe)) {
    const sp: Spanne = [m.index!, m.index! + m[0].length];
    if (ueberlappt(sp, belegt)) continue;
    out.push({ typ: "zahl", wert: parseZahl(m[1]!) ?? NaN, einheit: "CHF", text: m[0], sicherheit: "hoch" });
    belegt.push(sp);
  }
  const mitEinheitRe = rx(String.raw`(?<![\d'’.,])(${NUM})\s*(%|prozent|franken|kunden|anfragen|besucher[n]?|mitarbeitende[n]?|mitarbeiter[n]?|follower[n]?|leads|seiten|euro|stunden|minuten|sekunden)›`, "gi");
  for (const m of satz.matchAll(mitEinheitRe)) {
    const sp: Spanne = [m.index!, m.index! + m[0].length];
    if (ueberlappt(sp, belegt)) continue;
    const wert = parseZahl(m[1]!);
    if (wert === undefined) continue;
    out.push({ typ: "zahl", wert, einheit: (m[2] ?? "").toLowerCase().replace("prozent", "%"), text: m[0], sicherheit: "hoch" });
    belegt.push(sp);
  }

  // 5. Aufzählung
  const aufzRe = rx(String.raw`‹(${NUMODER})\s+(?:dinge|gründe|fehler|schritte|punkte|tipps|regeln|fragen|möglichkeiten|wege|arten|kriterien|stellschrauben|hebel|ursachen|probleme|vorteile|nachteile|tricks|merkmale|bausteine|massnahmen|aspekte|faktoren|elemente|bereiche|säulen|phasen|stufen)›`, "gi");
  for (const m of satz.matchAll(aufzRe)) {
    const anzahl = parseZahl(m[1]!);
    if (anzahl === undefined || anzahl < 2) continue;
    out.push({ typ: "aufzaehlung", anzahl: Number.isInteger(anzahl) ? anzahl : undefined, text: m[0], sicherheit: "hoch" });
  }
  const ordnung = rx(String.raw`‹(?:erstens|zweitens|drittens|viertens)›|‹zum\s+einen›`).exec(satz);
  if (ordnung && !out.some((s) => s.typ === "aufzaehlung")) out.push({ typ: "aufzaehlung", text: ordnung[0], sicherheit: "mittel" });

  // 6. Prozess
  const prozess = rx(String.raw`‹schritt\s+für\s+schritt›|‹so\s+(?:funktioniert|läuft|geht)›|‹der\s+weg\s+(?:von|zu|zum)›`).exec(satz);
  if (prozess) out.push({ typ: "prozess", text: prozess[0], sicherheit: "mittel" });
  else if (rx("‹zuerst›").test(satz) && rx("‹(?:dann|danach|anschliessend|zuletzt|schliesslich)›").test(satz)) {
    out.push({ typ: "prozess", text: satz.trim(), sicherheit: "mittel" });
  }

  // 7. Vergleich. «mehr als 100» ist eine Schwelle, kein Vergleich.
  const vergleichRe = rx(
    String.raw`‹(?:statt|anstatt|im\s+vergleich|verglichen\s+mit|gegenüber|doppelt\s+so|halb\s+so|dreimal\s+so|besser\s+als|schlechter\s+als|schneller\s+als|langsamer\s+als|günstiger\s+als|teurer\s+als|im\s+gegensatz|vor\s+und\s+nach|vorher|nachher|früher)›|‹(?:mehr|weniger)\s+als›(?!\s*\d)`,
    "gi",
  );
  for (const m of satz.matchAll(vergleichRe)) {
    const marker = m[0].toLowerCase().replace(/\s+/g, " ");
    out.push({ typ: "vergleich", marker, text: m[0], sicherheit: /^(?:vorher|nachher|früher|statt)$/.test(marker) ? "mittel" : "hoch" });
    break; // ein Vergleichssignal pro Satz genügt
  }

  // 8. Zeitraum: «seit 2019»
  const seit = rx(String.raw`‹seit\s+(?:19|20)\d{2}›`).exec(satz);
  if (seit && !out.some((s) => s.typ === "zeitraum")) out.push({ typ: "zeitraum", text: seit[0], sicherheit: "mittel" });

  return out;
}

/** Zerlegt Fliesstext in Sätze. Kürzel wie «z. B.» oder «Nr.» trennen nicht. */
export function splitSaetze(text: string): string[] {
  const schutz = text
    .replace(/\b(z\.\s?B|d\.\s?h|u\.\s?a|ca|Nr|bzw|usw|inkl|ggf|evtl|vgl|Mio|Mrd|Std|Fr|Dr|Prof)\./gi, (m) => m.replace(/\./g, "\u0001"))
    .replace(/(\d)\.(\d)/g, "$1\u0001$2");
  return schutz
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replaceAll("\u0001", ".").trim())
    .filter((s) => s.length > 0);
}
