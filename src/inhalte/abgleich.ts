import type { Akteur } from "../core/schemas";
import { istMensch } from "../motion/idee";
import type { Inhalt, Status, Wert } from "./inhalt";
import type { Gate0 } from "./marken";
import { materialFehlt } from "./material";
import { pruefeUebergang, type UebergangsKontext } from "./regeln";
import type { Eintrag, Stand } from "./stand";

/**
 * Abgleich der Notion-Zeilen mit dem Stand (Plan v3, 3.1). Notion erzwingt keine Übergangsregeln: Jeder kann den Status ändern.
 * Der Abgleich liest alle Zeilen und sagt je Zeile, was gilt:
 *
 *   übernommen   Der Status hat sich geändert und die Regeln erlauben es. Der Stand zieht nach.
 *   weiter       Ein Mensch hat ein Tor entschieden, die Regeln erlauben den nächsten Status. Der Code setzt ihn.
 *   zurückgesetzt Die Änderung ist nicht erlaubt. Der Status geht auf den letzten gültigen zurück, mit den Gründen.
 *   geleert      Ein Entscheid ohne Menschen mit Namen, zu früh gesetzt oder von früher: Claude setzt ihn auf «offen» (mehr schreibt Claude nie).
 *   blockiert    Das Tor ist entschieden, aber eine Regel hält den Wechsel auf (zum Beispiel Gate 0). Der Entscheid bleibt, der Grund steht dabei.
 *   hinweis      Ein Mensch soll hinsehen (Entscheid nachträglich verändert, Zeile verschwunden, doppelte ID).
 *
 * Die Funktion schreibt nichts. Sie liefert die Eingriffe als fertige Eigenschaften für `notion-update-page` und den Stand, wie er nach den Eingriffen gilt.
 * Der Stand zieht nur bei Zeilen nach, die in Ordnung sind. Wer einen Eingriff offen hat, behält den alten Stand, bis der Eingriff geschrieben und neu gelesen ist.
 */

export type Eingriff = { typ: "status"; nach: Status } | { typ: "entscheid-leeren"; tor: "I" | "P" } | { typ: "id"; id: string };

export type Art = "neu" | "uebernommen" | "weiter" | "zurueckgesetzt" | "geleert" | "blockiert" | "hinweis";

export interface Befund {
  id: string;
  titel: string;
  url: string;
  art: Art;
  text: string;
  fehler: string[];
  eingriff?: Eingriff;
  /** Eigenschaften für `notion-update-page` (`update_properties`), wenn es einen Eingriff gibt. */
  eigenschaften?: Record<string, Wert>;
}

export interface AbgleichKontext {
  jetzt: string;
  /** Gate 0 der Marke, in der Form, wie es gilt (siehe `gate0Funktion`). */
  gate0(markenId: string): Gate0;
  /** Erster Lauf auf einer bestehenden Datenbank: Zeilen ohne Stand werden in dem Status übernommen, in dem sie stehen. */
  erstlauf?: boolean;
}

export interface AbgleichErgebnis {
  befunde: Befund[];
  stand: Stand;
}

const TOR_I_NACH: Record<string, Status> = { freigegeben: "In Produktion", abgelehnt: "Verworfen", Rückfrage: "Neu" };
const TOR_P_NACH: Record<string, Status> = { freigegeben: "Freigegeben", Änderung: "In Produktion" };

/** Ab hier ist Tor I entschieden und darf sich nicht mehr ändern. */
const NACH_TOR_I: readonly Status[] = ["In Produktion", "Entwurf fertig", "Freigegeben", "Geplant", "Veröffentlicht", "Ausgewertet"];
const NACH_TOR_P: readonly Status[] = ["Freigegeben", "Geplant", "Veröffentlicht", "Ausgewertet"];

const hatMensch = (von: string): boolean => !!von.trim() && istMensch({ typ: "mensch", name: von.trim() });

const leeren = (tor: "I" | "P"): Record<string, Wert> => ({
  [`Tor ${tor} Entscheid`]: "offen",
  [`Tor ${tor} Grund`]: null,
  [`Tor ${tor} von`]: null,
  [`date:Tor ${tor} am:start`]: null,
});

const snapshot = (i: Inhalt): Pick<Eintrag, "torI" | "torP"> => ({
  torI: { entscheid: i.torI.entscheid, von: i.torI.von, am: i.torI.am },
  torP: { entscheid: i.torP.entscheid, von: i.torP.von, am: i.torP.am },
});

const OHNE: { entscheid: string; von: string; am: string } = { entscheid: "", von: "", am: "" };

/**
 * Was der Stand als schon befolgten Entscheid festhält. Ein Entscheid zählt erst als befolgt, wenn die Zeile die Stufe verlässt, die er entscheidet:
 * Tor I beim Verlassen von «Pitch bereit», Tor P beim Verlassen von «Entwurf fertig». Alles andere bleibt, wie es war. So geht ein Entscheid nicht verloren,
 * der im selben Zeitraum fällt, in dem die Zeile die Stufe erreicht, und ein Entscheid von früher (Rückfrage, Änderung) löst nichts ein zweites Mal aus.
 */
function befolgt(i: Inhalt, status: Status, alt: Eintrag | undefined, erstlauf: boolean): Pick<Eintrag, "torI" | "torP"> {
  const jetzt = snapshot(i);
  if (!alt) {
    // Erstlauf: Was hinter der Stufe liegt, gilt als befolgt. Eine neue Zeile hat noch nichts befolgt.
    if (!erstlauf) return { torI: OHNE, torP: OHNE };
    const nachI = !["Neu", "Pitch bereit"].includes(status);
    const nachP = !["Neu", "Pitch bereit", "In Produktion", "Entwurf fertig"].includes(status);
    return { torI: nachI ? jetzt.torI : OHNE, torP: nachP ? jetzt.torP : OHNE };
  }
  return { torI: alt.status === "Pitch bereit" ? jetzt.torI : alt.torI, torP: alt.status === "Entwurf fertig" ? jetzt.torP : alt.torP };
}

const gleich = (a: { entscheid: string; von: string; am: string }, b: { entscheid: string; von: string; am: string }): boolean =>
  a.entscheid === b.entscheid && a.von === b.von && a.am === b.am;

const gesetzt = (e: string): boolean => e !== "" && e !== "offen";

export function abgleich(stand: Stand, inhalte: Inhalt[], ctx: AbgleichKontext): AbgleichErgebnis {
  const befunde: Befund[] = [];
  const neu: Stand = { version: stand.version, inhalte: { ...stand.inhalte }, pruefungen: stand.pruefungen };
  const system: Akteur = { typ: "system", name: "abgleich" };

  const zahlen = [...inhalte.map((i) => i.id), ...Object.keys(stand.inhalte)]
    .map((id) => /^c-(\d+)$/.exec(id))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => Number(m[1]));
  let hoechste = Math.max(0, ...zahlen);

  const gesehen = new Set<string>();

  const befund = (i: Inhalt, art: Art, text: string, extra: Partial<Befund> = {}): void => {
    befunde.push({ id: i.id, titel: i.titel, url: i.url, art, text, fehler: [], ...extra });
  };

  const kontext = (i: Inhalt, s: Eintrag | undefined, akteur: Akteur, grund?: string): UebergangsKontext => {
    const p = stand.pruefungen[i.id];
    const k: UebergangsKontext = { jetzt: ctx.jetzt, akteur, andere: inhalte.filter((x) => x !== i), gate0: ctx.gate0(i.marke) };
    if (grund) k.grund = grund;
    if (s?.vorPause) k.vorPause = s.vorPause;
    if (p) k.entwurfGeprueft = p.text ? { bestanden: p.bestanden, text: p.text } : { bestanden: p.bestanden };
    return k;
  };

  /** Die Tore und ihre Entscheide für den Status, in dem die Zeile (jetzt gültig) steht. `alt` ist der Stand vor diesem Lauf. */
  const tore = (i: Inhalt, status: Status, alt: Eintrag | undefined, s: Eintrag | undefined): boolean => {
    const I = i.torI;
    const P = i.torP;

    // Tor I
    if (status === "Pitch bereit" && gesetzt(I.entscheid) && TOR_I_NACH[I.entscheid]) {
      const stale = !!alt && gesetzt(alt.torI.entscheid) && gleich(alt.torI, { entscheid: I.entscheid, von: I.von, am: I.am });
      if (stale) {
        befund(i, "geleert", `Tor I «${I.entscheid}» stammt von früher (${I.von || "ohne Namen"}): zurück auf «offen», das Tor will einen neuen Entscheid`, {
          eingriff: { typ: "entscheid-leeren", tor: "I" },
          eigenschaften: leeren("I"),
        });
        return true;
      }
      if (!hatMensch(I.von)) {
        befund(i, "geleert", `Tor I «${I.entscheid}» ohne Menschen mit Namen in «Tor I von»: zurück auf «offen»`, { eingriff: { typ: "entscheid-leeren", tor: "I" }, eigenschaften: leeren("I") });
        return true;
      }
      const nach = TOR_I_NACH[I.entscheid]!;
      const r = pruefeUebergang(i, nach, kontext(i, s, system));
      if (r.ok) befund(i, "weiter", `Tor I «${I.entscheid}» von ${I.von}: «Pitch bereit» → «${nach}»`, { eingriff: { typ: "status", nach }, eigenschaften: { Status: nach } });
      else befund(i, "blockiert", `Tor I «${I.entscheid}» von ${I.von}, aber «${nach}» ist noch nicht möglich`, { fehler: r.fehler });
      return true;
    }
    if (status === "Neu" && (I.entscheid === "freigegeben" || I.entscheid === "abgelehnt")) {
      befund(i, "geleert", `Tor I «${I.entscheid}» gesetzt, bevor ein Pitch bereit ist: zurück auf «offen»`, { eingriff: { typ: "entscheid-leeren", tor: "I" }, eigenschaften: leeren("I") });
      return true;
    }
    if (NACH_TOR_I.includes(status) && s && gesetzt(s.torI.entscheid) && !gleich(s.torI, { entscheid: I.entscheid, von: I.von, am: I.am })) {
      befund(i, "hinweis", `Tor I wurde nach dem Entscheid verändert (gültig: «${s.torI.entscheid}» von ${s.torI.von || "ohne Namen"}, jetzt: «${I.entscheid || "leer"}» von ${I.von || "ohne Namen"}). Die Änderung gilt nicht`);
      return true;
    }

    // Tor P
    if (status === "Entwurf fertig" && gesetzt(P.entscheid) && TOR_P_NACH[P.entscheid]) {
      const stale = !!alt && gesetzt(alt.torP.entscheid) && gleich(alt.torP, { entscheid: P.entscheid, von: P.von, am: P.am });
      if (stale) {
        befund(i, "geleert", `Tor P «${P.entscheid}» stammt von früher (${P.von || "ohne Namen"}): zurück auf «offen», der neue Entwurf braucht einen neuen Entscheid`, {
          eingriff: { typ: "entscheid-leeren", tor: "P" },
          eigenschaften: leeren("P"),
        });
        return true;
      }
      if (!hatMensch(P.von)) {
        befund(i, "geleert", `Tor P «${P.entscheid}» ohne Menschen mit Namen in «Tor P von»: zurück auf «offen»`, { eingriff: { typ: "entscheid-leeren", tor: "P" }, eigenschaften: leeren("P") });
        return true;
      }
      const nach = TOR_P_NACH[P.entscheid]!;
      const r = pruefeUebergang(i, nach, kontext(i, s, system));
      if (r.ok) befund(i, "weiter", `Tor P «${P.entscheid}» von ${P.von}: «Entwurf fertig» → «${nach}»`, { eingriff: { typ: "status", nach }, eigenschaften: { Status: nach } });
      else befund(i, "blockiert", `Tor P «${P.entscheid}» von ${P.von}, aber «${nach}» ist noch nicht möglich`, { fehler: r.fehler });
      return true;
    }
    if ((status === "Neu" || status === "Pitch bereit") && gesetzt(P.entscheid)) {
      befund(i, "geleert", `Tor P «${P.entscheid}» gesetzt, bevor es einen Entwurf gibt: zurück auf «offen»`, { eingriff: { typ: "entscheid-leeren", tor: "P" }, eigenschaften: leeren("P") });
      return true;
    }
    if (status === "In Produktion" && P.entscheid === "freigegeben") {
      befund(i, "geleert", "Tor P «freigegeben» gesetzt, bevor der Entwurf fertig ist: zurück auf «offen»", { eingriff: { typ: "entscheid-leeren", tor: "P" }, eigenschaften: leeren("P") });
      return true;
    }
    if (NACH_TOR_P.includes(status) && s && gesetzt(s.torP.entscheid) && !gleich(s.torP, { entscheid: P.entscheid, von: P.von, am: P.am })) {
      befund(i, "hinweis", `Tor P wurde nach dem Entscheid verändert (gültig: «${s.torP.entscheid}» von ${s.torP.von || "ohne Namen"}, jetzt: «${P.entscheid || "leer"}» von ${P.von || "ohne Namen"}). Die Änderung gilt nicht`);
      return true;
    }
    return false;
  };

  const eintrag = (i: Inhalt, status: Status, alt: Eintrag | undefined, vorPause?: Status): Eintrag => ({
    status,
    ...(vorPause ? { vorPause } : {}),
    ...befolgt(i, status, alt, !!ctx.erstlauf),
    seit: ctx.jetzt,
    ...(i.statusAm ? { statusAm: i.statusAm } : alt?.statusAm ? { statusAm: alt.statusAm } : {}),
  });

  for (const i of inhalte) {
    if (!i.id) {
      hoechste++;
      const id = `c-${String(hoechste).padStart(4, "0")}`;
      befund(i, "neu", `Zeile ohne Inhalt-ID: ${id} vergeben`, { id, eingriff: { typ: "id", id }, eigenschaften: { "Inhalt-ID": id } });
      continue;
    }
    if (gesehen.has(i.id)) {
      befund(i, "hinweis", `Zwei Zeilen tragen die Inhalt-ID ${i.id}: nur die erste wurde gelesen`);
      continue;
    }
    gesehen.add(i.id);

    const status: Status = i.status || "Neu";
    const alt = stand.inhalte[i.id];

    // «Dreh nötig» in Produktion, aber weder Footage noch Foto im Anhang: ein Mensch soll das Material anhängen (Prüfplatz, Seitenfenster).
    if (status === "In Produktion" && materialFehlt(i)) befund(i, "hinweis", "«Dreh nötig», aber weder Footage noch Foto angehängt: Material fehlt (Feld «Dateien», Art «Footage» oder «Foto»)");

    if (!alt) {
      if (status === "Neu" || ctx.erstlauf) {
        neu.inhalte[i.id] = eintrag(i, status, undefined);
        const gehandelt = tore(i, status, undefined, undefined);
        if (!gehandelt) befund(i, "neu", status === "Neu" ? "Neu übernommen" : `Erstlauf: Status «${status}» übernommen`);
      } else {
        befund(i, "zurueckgesetzt", `Neue Zeile steht in «${status}»: zurück auf «Neu»`, {
          fehler: [`Ein neuer Inhalt beginnt in «Neu». Von dort führt der Weg über Pitch und Tor I`],
          eingriff: { typ: "status", nach: "Neu" },
          eigenschaften: { Status: "Neu" },
        });
      }
      continue;
    }

    if (status === alt.status) {
      tore(i, status, alt, alt);
      continue;
    }

    // Der Status wurde in Notion geändert: prüfen wie einen Statuswechsel aus dem letzten gültigen Stand.
    // Name und Grund aus «Status von» und «Status-Grund» gelten nur mit einem neuen Zeitpunkt in «Status am»: sonst käme ein alter Name für einen neuen Wechsel zum Zug.
    const frisch = !!i.statusAm && i.statusAm !== alt.statusAm;
    const akteur: Akteur = frisch && hatMensch(i.statusVon) ? { typ: "mensch", name: i.statusVon.trim() } : system;
    const r = pruefeUebergang({ ...i, status: alt.status }, status, kontext(i, alt, akteur, frisch ? i.statusGrund || undefined : undefined));
    if (r.ok) {
      neu.inhalte[i.id] = eintrag(i, status, alt, status === "Pausiert" ? alt.status : undefined);
      befund(i, "uebernommen", `«${alt.status}» → «${status}» übernommen`);
      tore(i, status, alt, neu.inhalte[i.id]);
    } else {
      // Ein abgelehnter Versuch verbraucht seinen Zeitpunkt ebenfalls: Er darf später keinen anderen Wechsel freigeben.
      if (i.statusAm) neu.inhalte[i.id] = { ...alt, statusAm: i.statusAm };
      befund(i, "zurueckgesetzt", `«${alt.status}» → «${status}» ist nicht erlaubt: zurück auf «${alt.status}»`, {
        fehler: frisch ? r.fehler : [...r.fehler, "«Status am» trägt keinen neuen Zeitpunkt: Ein von Hand gesetzter Status gilt nur über den Prüfplatz, mit Name, Grund und Zeit"],
        eingriff: { typ: "status", nach: alt.status },
        eigenschaften: { Status: alt.status },
      });
    }
  }

  for (const id of Object.keys(stand.inhalte)) {
    if (!gesehen.has(id)) {
      befunde.push({ id, titel: "", url: "", art: "hinweis", text: `${id} steht im Stand, aber nicht mehr in Notion (gelöscht oder archiviert). Verwerfen geht nur mit Grund`, fehler: [] });
    }
  }

  return { befunde, stand: neu };
}

/** Zusammenfassung für die Ausgabe: wie viele Befunde je Art. */
export function zaehle(befunde: Befund[]): Record<Art, number> {
  const z: Record<Art, number> = { neu: 0, uebernommen: 0, weiter: 0, zurueckgesetzt: 0, geleert: 0, blockiert: 0, hinweis: 0 };
  for (const b of befunde) z[b.art]++;
  return z;
}
