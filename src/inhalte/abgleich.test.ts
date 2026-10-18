import { describe, expect, it } from "vitest";
import { abgleich, zaehle, type AbgleichKontext, type Befund } from "./abgleich";
import type { Inhalt, Status } from "./inhalt";
import type { Eintrag, Stand } from "./stand";
import { inhalt, JETZT } from "./testdaten";

const AM = "2026-10-17T08:00:00Z";
const AM1 = "2026-10-17T10:00:00Z";
const AM2 = "2026-10-18T10:00:00Z";
const tor = (entscheid = "offen", von = "", am = "") => ({ entscheid, von, am });
const eintrag = (status: Status, p: Partial<Eintrag> = {}): Eintrag => ({ status, torI: tor(), torP: tor(), seit: JETZT, ...p });
const standMit = (inhalte: Record<string, Eintrag>, pruefungen: Stand["pruefungen"] = {}): Stand => ({ version: 1, inhalte, pruefungen });
const entscheid = <E extends string>(e: E, von = "Leander", grund = "", am = AM) => ({ entscheid: e, grund, von, am });

const frei: AbgleichKontext = { jetzt: JETZT, gate0: () => "freigegeben" };
const offen: AbgleichKontext = { jetzt: JETZT, gate0: () => "offen" };

const lauf = (stand: Stand, zeilen: Inhalt[], ctx: AbgleichKontext = frei) => abgleich(stand, zeilen, ctx);
const arten = (bs: Befund[]) => bs.map((b) => b.art);

/** So wirkt ein Eingriff in Notion: Der Zustand der Zeile ändert sich, wie es die Eigenschaften sagen. */
function anwenden(i: Inhalt, b: Befund): Inhalt {
  const e = b.eingriff;
  if (!e) return i;
  if (e.typ === "status") return { ...i, status: e.nach };
  if (e.typ === "id") return { ...i, id: e.id };
  const leer = { entscheid: "offen" as const, grund: "", von: "", am: "" };
  return e.tor === "I" ? { ...i, torI: leer } : { ...i, torP: leer };
}

describe("Neue Zeilen", () => {
  it("eine neue Zeile in «Neu» wird übernommen", () => {
    const r = lauf(standMit({}), [inhalt({ id: "c-0001" })]);
    expect(arten(r.befunde)).toEqual(["neu"]);
    expect(r.stand.inhalte["c-0001"]?.status).toBe("Neu");
  });

  it("eine neue Zeile in einem späteren Status geht zurück auf «Neu» und kommt nicht in den Stand", () => {
    const r = lauf(standMit({}), [inhalt({ id: "c-0001", status: "Freigegeben" })]);
    expect(r.befunde[0]).toMatchObject({ art: "zurueckgesetzt", eingriff: { typ: "status", nach: "Neu" }, eigenschaften: { Status: "Neu" } });
    expect(r.stand.inhalte["c-0001"]).toBeUndefined();
  });

  it("im Erstlauf bleibt der vorhandene Status stehen", () => {
    const r = lauf(standMit({}), [inhalt({ id: "c-0001", status: "In Produktion" })], { ...frei, erstlauf: true });
    expect(r.befunde[0]!.text).toMatch(/Erstlauf/);
    expect(r.stand.inhalte["c-0001"]?.status).toBe("In Produktion");
  });

  it("eine Zeile ohne Inhalt-ID bekommt die nächste Nummer, nach Zeilen und Stand", () => {
    const r = lauf(standMit({ "c-0007": eintrag("Neu") }), [inhalt({ id: "c-0003" }), inhalt({ id: "" }), inhalt({ id: "" })]);
    const ids = r.befunde.filter((b) => b.eingriff?.typ === "id").map((b) => b.eigenschaften?.["Inhalt-ID"]);
    expect(ids).toEqual(["c-0008", "c-0009"]);
  });

  it("zwei Zeilen mit derselben ID: nur die erste zählt", () => {
    const r = lauf(standMit({}), [inhalt({ id: "c-0001" }), inhalt({ id: "c-0001", titel: "Doppelt" })]);
    expect(arten(r.befunde)).toEqual(["neu", "hinweis"]);
    expect(r.befunde[1]!.text).toMatch(/Zwei Zeilen/);
  });

  it("eine Zeile, die im Stand steht und in Notion fehlt, ist ein Hinweis", () => {
    const r = lauf(standMit({ "c-0001": eintrag("In Produktion") }), []);
    expect(r.befunde[0]).toMatchObject({ art: "hinweis", id: "c-0001" });
    expect(r.stand.inhalte["c-0001"]).toBeDefined();
  });
});

describe("Tor I löst den nächsten Status aus", () => {
  const pitch = (p: Partial<Inhalt> = {}) => inhalt({ id: "c-0001", status: "Pitch bereit", ...p });
  const stand = () => standMit({ "c-0001": eintrag("Pitch bereit") });

  it("Freigabe eines Menschen führt zu «In Produktion», der Stand bleibt bis zum Schreiben", () => {
    const r = lauf(stand(), [pitch({ torI: entscheid("freigegeben") })]);
    expect(r.befunde).toHaveLength(1);
    expect(r.befunde[0]).toMatchObject({ art: "weiter", eingriff: { typ: "status", nach: "In Produktion" }, eigenschaften: { Status: "In Produktion" } });
    expect(r.stand.inhalte["c-0001"]?.status).toBe("Pitch bereit");
  });

  it("Gate 0 offen hält die Freigabe auf: blockiert, Entscheid bleibt, kein Eingriff", () => {
    const r = lauf(stand(), [pitch({ torI: entscheid("freigegeben") })], offen);
    expect(r.befunde[0]!.art).toBe("blockiert");
    expect(r.befunde[0]!.fehler.join(" ")).toMatch(/Gate 0/);
    expect(r.befunde[0]!.eingriff).toBeUndefined();
  });

  it("Entscheid ohne Namen oder mit Systemnamen wird auf «offen» gesetzt, nie übernommen", () => {
    for (const von of ["", "Claude", "system", "Pipeline"]) {
      const r = lauf(stand(), [pitch({ torI: entscheid("freigegeben", von) })]);
      expect(r.befunde[0], `von=«${von}»`).toMatchObject({ art: "geleert", eingriff: { typ: "entscheid-leeren", tor: "I" } });
      expect(r.befunde[0]!.eigenschaften).toMatchObject({ "Tor I Entscheid": "offen", "Tor I von": null });
    }
  });

  it("Ablehnung mit Grund führt zu «Verworfen», ohne Grund ist sie blockiert", () => {
    expect(lauf(stand(), [pitch({ torI: entscheid("abgelehnt", "Leander", "Passt nicht zur Marke") })]).befunde[0]).toMatchObject({ art: "weiter", eingriff: { nach: "Verworfen" } });
    const r = lauf(stand(), [pitch({ torI: entscheid("abgelehnt", "Leander", "nein") })]);
    expect(r.befunde[0]!.art).toBe("blockiert");
  });

  it("Rückfrage führt zurück zu «Neu»", () => {
    const r = lauf(stand(), [pitch({ torI: entscheid("Rückfrage", "Leander", "Gibt es eine Zahl dazu?") })]);
    expect(r.befunde[0]).toMatchObject({ art: "weiter", eingriff: { nach: "Neu" } });
  });

  it("ein Entscheid in «Neu» kommt zu früh und wird auf «offen» gesetzt, eine Rückfrage dort bleibt stehen", () => {
    const s = standMit({ "c-0001": eintrag("Neu") });
    expect(lauf(s, [inhalt({ id: "c-0001", status: "Neu", torI: entscheid("freigegeben") })]).befunde[0]).toMatchObject({ art: "geleert" });
    expect(lauf(s, [inhalt({ id: "c-0001", status: "Neu", torI: entscheid("Rückfrage", "Leander", "Frage") })]).befunde).toEqual([]);
  });

  it("ein Dublette-Treffer hält die Freigabe auf", () => {
    const a = pitch({ torI: entscheid("freigegeben"), beleg: "Praxis Hofer in Herisau senkt die Wartezeit von 32 auf 14 Minuten" });
    const b = inhalt({ id: "c-0002", status: "In Produktion", beleg: "Praxis Hofer in Herisau senkt die Wartezeit von 40 auf 20 Minuten", erstellt: "2026-09-20T08:00:00Z" });
    const r = lauf(standMit({ "c-0001": eintrag("Pitch bereit"), "c-0002": eintrag("In Produktion") }), [a, b]);
    expect(r.befunde.find((x) => x.id === "c-0001")).toMatchObject({ art: "blockiert" });
  });
});

describe("Statusänderung von Hand in Notion", () => {
  it("erlaubt und übernommen: Stand zieht nach, Entscheid wird festgehalten", () => {
    const i = inhalt({ id: "c-0001", status: "In Produktion", torI: entscheid("freigegeben") });
    const r = lauf(standMit({ "c-0001": eintrag("Pitch bereit") }), [i]);
    expect(arten(r.befunde)).toEqual(["uebernommen"]);
    expect(r.stand.inhalte["c-0001"]).toMatchObject({ status: "In Produktion", torI: { entscheid: "freigegeben", von: "Leander" } });
  });

  it("ohne Tor I zurück auf den letzten gültigen Status, mit den Gründen, Stand bleibt", () => {
    const i = inhalt({ id: "c-0001", status: "In Produktion" });
    const r = lauf(standMit({ "c-0001": eintrag("Pitch bereit") }), [i]);
    expect(r.befunde[0]).toMatchObject({ art: "zurueckgesetzt", eingriff: { typ: "status", nach: "Pitch bereit" }, eigenschaften: { Status: "Pitch bereit" } });
    expect(r.befunde[0]!.fehler.join(" ")).toMatch(/Tor I ist nicht freigegeben/);
    expect(r.stand.inhalte["c-0001"]?.status).toBe("Pitch bereit");
  });

  it("«Freigegeben» ohne Tor P wird zurückgesetzt", () => {
    const r = lauf(standMit({ "c-0001": eintrag("Entwurf fertig") }, { "c-0001": { bestanden: true, am: JETZT } }), [inhalt({ id: "c-0001", status: "Freigegeben" })]);
    expect(r.befunde[0]).toMatchObject({ art: "zurueckgesetzt", eingriff: { nach: "Entwurf fertig" } });
  });

  it("Sprünge über Stufen werden zurückgesetzt", () => {
    const r = lauf(standMit({ "c-0001": eintrag("Neu") }), [inhalt({ id: "c-0001", status: "Geplant" })]);
    expect(r.befunde[0]).toMatchObject({ art: "zurueckgesetzt", eingriff: { nach: "Neu" } });
  });

  it("«Pitch bereit» ohne Beleg: zurück auf «Neu» mit der Lücke", () => {
    const r = lauf(standMit({ "c-0001": eintrag("Neu") }), [inhalt({ id: "c-0001", status: "Pitch bereit", beleg: "" })]);
    expect(r.befunde[0]).toMatchObject({ art: "zurueckgesetzt", eingriff: { nach: "Neu" } });
    expect(r.befunde[0]!.fehler.join(" ")).toMatch(/Beleg/);
  });

  it("«Entwurf fertig» braucht die gespeicherte Prüfung des Entwurfs", () => {
    const i = inhalt({ id: "c-0001", status: "Entwurf fertig" });
    const s = (p: Stand["pruefungen"]) => standMit({ "c-0001": eintrag("In Produktion") }, p);
    expect(lauf(s({}), [i]).befunde[0]!.art).toBe("zurueckgesetzt");
    expect(lauf(s({ "c-0001": { bestanden: false, text: "2 Fehler", am: JETZT } }), [i]).befunde[0]!.fehler.join(" ")).toMatch(/2 Fehler/);
    expect(lauf(s({ "c-0001": { bestanden: true, am: JETZT } }), [i]).befunde[0]!.art).toBe("uebernommen");
  });

  it("Pausieren braucht Namen und Grund, die Pause führt nur zum früheren Status zurück", () => {
    const s = standMit({ "c-0001": eintrag("In Produktion") });
    expect(lauf(s, [inhalt({ id: "c-0001", status: "Pausiert" })]).befunde[0]!.art).toBe("zurueckgesetzt");
    const pause = lauf(s, [inhalt({ id: "c-0001", status: "Pausiert", statusVon: "Andrej", statusGrund: "Kunde wartet auf den Dreh", statusAm: AM1 })]);
    expect(pause.befunde[0]!.art).toBe("uebernommen");
    expect(pause.stand.inhalte["c-0001"]).toMatchObject({ status: "Pausiert", vorPause: "In Produktion" });
    const zurueck = lauf(pause.stand, [inhalt({ id: "c-0001", status: "In Produktion" })]);
    expect(zurueck.befunde[0]!.art).toBe("uebernommen");
    expect(zurueck.stand.inhalte["c-0001"]?.vorPause).toBeUndefined();
    expect(lauf(pause.stand, [inhalt({ id: "c-0001", status: "Freigegeben" })]).befunde[0]!.art).toBe("zurueckgesetzt");
  });

  it("Verwerfen aus der Produktion braucht einen Menschen mit Namen und einen Grund", () => {
    const s = standMit({ "c-0001": eintrag("In Produktion") });
    expect(lauf(s, [inhalt({ id: "c-0001", status: "Verworfen", statusGrund: "Kunde sagt ab" })]).befunde[0]!.art).toBe("zurueckgesetzt");
    expect(lauf(s, [inhalt({ id: "c-0001", status: "Verworfen", statusVon: "Claude", statusGrund: "Kunde sagt ab", statusAm: AM1 })]).befunde[0]!.art).toBe("zurueckgesetzt");
    expect(lauf(s, [inhalt({ id: "c-0001", status: "Verworfen", statusVon: "Andrej", statusGrund: "Kunde sagt ab", statusAm: AM1 })]).befunde[0]!.art).toBe("uebernommen");
  });

  it("aus «Verworfen» führt nichts mehr heraus", () => {
    const r = lauf(standMit({ "c-0001": eintrag("Verworfen") }), [inhalt({ id: "c-0001", status: "Neu" })]);
    expect(r.befunde[0]).toMatchObject({ art: "zurueckgesetzt", eingriff: { nach: "Verworfen" } });
  });

  it("«Veröffentlicht» bei Manuell bestätigt ein Mensch mit Namen", () => {
    const s = standMit({ "c-0001": eintrag("Geplant") });
    const i = (p: Partial<Inhalt>) => inhalt({ id: "c-0001", status: "Veröffentlicht", publishing: "Manuell", ...p });
    expect(lauf(s, [i({})]).befunde[0]!.art).toBe("zurueckgesetzt");
    expect(lauf(s, [i({ statusVon: "Leander", statusAm: AM1 })]).befunde[0]!.art).toBe("uebernommen");
  });
});

describe("Von Hand gesetzter Status: Name und Grund gelten nur mit neuem Zeitpunkt", () => {
  const pausiert = (p: Partial<Inhalt> = {}) => inhalt({ id: "c-0001", status: "Pausiert", statusVon: "Andrej", statusGrund: "Kunde wartet auf den Dreh", statusAm: AM1, ...p });
  const inProd = () => standMit({ "c-0001": eintrag("In Produktion") });

  it("ohne Zeitpunkt zählt der Name nicht: zurückgesetzt, mit dem Hinweis auf den Prüfplatz", () => {
    const r = lauf(inProd(), [pausiert({ statusAm: "" })]);
    expect(r.befunde[0]!.art).toBe("zurueckgesetzt");
    expect(r.befunde[0]!.fehler.join(" ")).toMatch(/Status am.*neuen Zeitpunkt/);
  });

  it("mit neuem Zeitpunkt wird der Wechsel übernommen und der Zeitpunkt im Stand verbraucht", () => {
    const r = lauf(inProd(), [pausiert()]);
    expect(r.befunde[0]!.art).toBe("uebernommen");
    expect(r.stand.inhalte["c-0001"]?.statusAm).toBe(AM1);
  });

  it("derselbe Zeitpunkt gilt nie ein zweites Mal: Ein alter Name rutscht nicht in einen neuen Wechsel", () => {
    const p = lauf(inProd(), [pausiert()]);
    // Später setzt jemand den Status in Notion auf «Verworfen» und lässt Name, Grund und Zeit stehen.
    const r = lauf(p.stand, [pausiert({ status: "Verworfen" })]);
    expect(r.befunde[0]).toMatchObject({ art: "zurueckgesetzt", eingriff: { nach: "Pausiert" } });
  });

  it("dieselbe Begründung mit neuem Zeitpunkt ist ein neuer Entscheid", () => {
    const p = lauf(inProd(), [pausiert()]);
    const zurueck = lauf(p.stand, [pausiert({ status: "In Produktion" })]); // Fortsetzen: derselbe Zeitpunkt, aber Rückweg ohne Name nötig
    expect(zurueck.befunde[0]!.art).toBe("uebernommen");
    const wieder = lauf(zurueck.stand, [pausiert({ statusAm: AM2 })]);
    expect(wieder.befunde[0]!.art).toBe("uebernommen");
  });

  it("ein abgelehnter Versuch verbraucht seinen Zeitpunkt: Er gibt später keinen anderen Wechsel frei", () => {
    const abgelehnt = lauf(inProd(), [pausiert({ statusGrund: "kurz", statusAm: AM1 })]); // Grund zu kurz
    expect(abgelehnt.befunde[0]!.art).toBe("zurueckgesetzt");
    expect(abgelehnt.stand.inhalte["c-0001"]).toMatchObject({ status: "In Produktion", statusAm: AM1 });
    const spaeter = lauf(abgelehnt.stand, [pausiert({ statusGrund: "Kunde wartet auf den Dreh", statusAm: AM1 })]);
    expect(spaeter.befunde[0]!.art).toBe("zurueckgesetzt");
  });

  it("Zeilen aus dem Erstlauf tragen ihren vorhandenen Zeitpunkt schon als verbraucht", () => {
    const r = lauf(standMit({}), [inhalt({ id: "c-0001", status: "Pausiert", statusVon: "Andrej", statusAm: AM1 })], { ...frei, erstlauf: true });
    expect(r.stand.inhalte["c-0001"]?.statusAm).toBe(AM1);
  });
});

describe("Pause und Fortsetzen: das Feld «Status vor Pause»", () => {
  const AM3 = "2026-10-19T10:00:00Z";
  const pausiertMit = (vor: Status | "", p: Partial<Inhalt> = {}) => inhalt({ id: "c-0001", status: "Pausiert", statusVon: "Andrej", statusGrund: "Kunde wartet auf den Dreh", statusAm: AM3, statusVorPause: vor, ...p });

  it("im Erstlauf übernimmt der Stand den Status vor der Pause aus Notion, und das Fortsetzen führt dorthin", () => {
    const erst = lauf(standMit({}), [pausiertMit("Freigegeben")], { ...frei, erstlauf: true });
    expect(erst.stand.inhalte["c-0001"]).toMatchObject({ status: "Pausiert", vorPause: "Freigegeben" });
    expect(lauf(erst.stand, [inhalt({ id: "c-0001", status: "Freigegeben" })]).befunde[0]!.art).toBe("uebernommen");
    expect(lauf(erst.stand, [inhalt({ id: "c-0001", status: "In Produktion" })]).befunde[0]!.art).toBe("zurueckgesetzt");
  });

  it("weiss der Stand nichts über die Pause, springt das Feld ein; ohne Feld bleibt das Fortsetzen verboten", () => {
    const s = standMit({ "c-0001": eintrag("Pausiert") });
    expect(lauf(s, [inhalt({ id: "c-0001", status: "In Produktion", statusVorPause: "In Produktion" })]).befunde[0]!.art).toBe("uebernommen");
    expect(lauf(s, [inhalt({ id: "c-0001", status: "In Produktion" })]).befunde[0]!.art).toBe("zurueckgesetzt");
  });

  it("der Stand gilt vor Notion: Ein selbst gesetztes Feld öffnet keinen Weg an einem Tor vorbei", () => {
    // Pausiert aus «Neu», aber im Feld steht «Freigegeben». Fortsetzen nach «Freigegeben» würde Tor I und Tor P überspringen.
    const s = standMit({ "c-0001": eintrag("Pausiert", { vorPause: "Neu" }) });
    expect(lauf(s, [inhalt({ id: "c-0001", status: "Freigegeben", statusVorPause: "Freigegeben" })]).befunde[0]!.art).toBe("zurueckgesetzt");
    expect(lauf(s, [inhalt({ id: "c-0001", status: "Neu", statusVorPause: "Freigegeben" })]).befunde[0]!.art).toBe("uebernommen");
  });

  it("das Pausieren über den Prüfplatz mit dem Feld bleibt ein gewöhnlicher Wechsel: Name, Grund und Zeit zählen, der Stand merkt sich den alten Status", () => {
    const r = lauf(standMit({ "c-0001": eintrag("In Produktion") }), [pausiertMit("In Produktion")]);
    expect(r.befunde[0]!.art).toBe("uebernommen");
    expect(r.stand.inhalte["c-0001"]).toMatchObject({ status: "Pausiert", vorPause: "In Produktion" });
  });
});

describe("Tor P", () => {
  const entwurf = (p: Partial<Inhalt> = {}) => inhalt({ id: "c-0001", status: "Entwurf fertig", ...p });
  const stand = (geprueft = true) => standMit({ "c-0001": eintrag("Entwurf fertig") }, geprueft ? { "c-0001": { bestanden: true, am: JETZT } } : {});

  it("Freigabe führt zu «Freigegeben», wenn Prüfung, Markierungen und Gate 0 stimmen", () => {
    expect(lauf(stand(), [entwurf({ torP: entscheid("freigegeben") })]).befunde[0]).toMatchObject({ art: "weiter", eingriff: { nach: "Freigegeben" } });
  });

  it("ohne bestandene Prüfung, mit offenen Markierungen oder bei offenem Gate 0 ist sie blockiert", () => {
    expect(lauf(stand(false), [entwurf({ torP: entscheid("freigegeben") })]).befunde[0]!.art).toBe("blockiert");
    expect(lauf(stand(), [entwurf({ torP: entscheid("freigegeben"), offeneMarkierungen: 1 })]).befunde[0]!.fehler.join(" ")).toMatch(/Markierung/);
    expect(lauf(stand(), [entwurf({ torP: entscheid("freigegeben") })], offen).befunde[0]!.art).toBe("blockiert");
  });

  it("Änderung mit Anweisung führt zurück in die Produktion, ohne Anweisung ist sie blockiert", () => {
    expect(lauf(stand(), [entwurf({ torP: entscheid("Änderung", "Leander", "Schluss kürzer") })]).befunde[0]).toMatchObject({ art: "weiter", eingriff: { nach: "In Produktion" } });
    expect(lauf(stand(), [entwurf({ torP: entscheid("Änderung", "Leander", "") })]).befunde[0]!.art).toBe("blockiert");
  });

  it("Entscheid ohne Namen wird auf «offen» gesetzt", () => {
    expect(lauf(stand(), [entwurf({ torP: entscheid("freigegeben", "") })]).befunde[0]).toMatchObject({ art: "geleert", eingriff: { tor: "P" } });
  });

  it("zu früh gesetzt: in «Pitch bereit» und bei «freigegeben» in «In Produktion» wird geleert, eine Änderung dort nicht", () => {
    expect(lauf(standMit({ "c-0001": eintrag("Pitch bereit") }), [inhalt({ id: "c-0001", status: "Pitch bereit", torP: entscheid("freigegeben") })]).befunde[0]!.art).toBe("geleert");
    const s = standMit({ "c-0001": eintrag("In Produktion") });
    expect(lauf(s, [inhalt({ id: "c-0001", status: "In Produktion", torP: entscheid("freigegeben") })]).befunde[0]!.art).toBe("geleert");
    expect(lauf(s, [inhalt({ id: "c-0001", status: "In Produktion", torP: entscheid("Änderung", "Leander", "Schluss kürzer") })]).befunde).toEqual([]);
  });
});

describe("Entscheide, die von früher stammen, lösen nichts mehr aus", () => {
  it("Rückfrage-Schleife: Nach «Neu» und wieder «Pitch bereit» wird die alte Rückfrage geleert, nicht noch einmal befolgt", () => {
    const rueck = entscheid("Rückfrage", "Leander", "Gibt es eine Zahl dazu?");
    const s0 = standMit({ "c-0001": eintrag("Neu", { torI: tor("Rückfrage", "Leander", AM) }) });
    const r1 = lauf(s0, [inhalt({ id: "c-0001", status: "Pitch bereit", torI: rueck })]);
    expect(arten(r1.befunde)).toEqual(["uebernommen", "geleert"]);
    expect(r1.befunde.some((b) => b.art === "weiter")).toBe(false);
    // Notion nimmt den Eingriff an: Tor I steht wieder auf «offen».
    const r2 = lauf(r1.stand, [inhalt({ id: "c-0001", status: "Pitch bereit", torI: entscheid("offen", "", "", "") })]);
    expect(r2.befunde).toEqual([]);
  });

  it("Änderungs-Schleife: Ein altes «Änderung» in «Entwurf fertig» wird geleert, ein neues befolgt", () => {
    const alt = tor("Änderung", "Leander", AM);
    const s = standMit({ "c-0001": eintrag("In Produktion", { torP: alt }) }, { "c-0001": { bestanden: true, am: JETZT } });
    const r1 = lauf(s, [inhalt({ id: "c-0001", status: "Entwurf fertig", torP: entscheid("Änderung", "Leander", "Schluss kürzer", AM) })]);
    expect(arten(r1.befunde)).toEqual(["uebernommen", "geleert"]);
    const neuer = entscheid("Änderung", "Leander", "Noch kürzer", "2026-10-18T08:00:00Z");
    const r2 = lauf(r1.stand, [inhalt({ id: "c-0001", status: "Entwurf fertig", torP: neuer })]);
    expect(r2.befunde[0]).toMatchObject({ art: "weiter", eingriff: { nach: "In Produktion" } });
  });
});

describe("Entscheid und Stufe im selben Zeitraum", () => {
  it("«Pitch bereit» erreicht und Tor I schon entschieden: der Entscheid wird befolgt, nicht als «von früher» gelöscht", () => {
    const i = inhalt({ id: "c-0001", status: "Pitch bereit", torI: entscheid("freigegeben") });
    const r1 = lauf(standMit({ "c-0001": eintrag("Neu") }), [i]);
    expect(arten(r1.befunde)).toEqual(["uebernommen", "weiter"]);
    // Notion nimmt den Eingriff an, der nächste Lauf sieht «In Produktion».
    const r2 = lauf(r1.stand, [{ ...i, status: "In Produktion" }]);
    expect(arten(r2.befunde)).toEqual(["uebernommen"]);
    expect(r2.stand.inhalte["c-0001"]?.torI).toMatchObject({ entscheid: "freigegeben", von: "Leander" });
    // Auch wenn der Eingriff nicht geschrieben wird, bleibt der Entscheid beim nächsten Lauf gültig.
    const r3 = lauf(r1.stand, [i]);
    expect(arten(r3.befunde)).toEqual(["weiter"]);
  });

  it("«Entwurf fertig» erreicht und Tor P schon entschieden: ebenso", () => {
    const i = inhalt({ id: "c-0001", status: "Entwurf fertig", torP: entscheid("freigegeben") });
    const r = lauf(standMit({ "c-0001": eintrag("In Produktion") }, { "c-0001": { bestanden: true, am: JETZT } }), [i]);
    expect(arten(r.befunde)).toEqual(["uebernommen", "weiter"]);
    // Auch ohne geschriebenen Eingriff bleibt der Entscheid beim nächsten Lauf gültig.
    expect(arten(lauf(r.stand, [i]).befunde)).toEqual(["weiter"]);
  });

  it("eine neue Zeile hat noch nichts befolgt: ein Entscheid in ihr geht nicht still verloren", () => {
    const rueck = entscheid("Rückfrage", "Leander", "Gibt es eine Zahl dazu?");
    const r1 = lauf(standMit({}), [inhalt({ id: "c-0001", status: "Neu", torI: rueck })]);
    expect(r1.stand.inhalte["c-0001"]?.torI.entscheid).toBe("");
    const r2 = lauf(r1.stand, [inhalt({ id: "c-0001", status: "Pitch bereit", torI: rueck })]);
    expect(arten(r2.befunde)).toEqual(["uebernommen", "weiter"]);
  });

  it("der Stand hält einen Entscheid erst beim Verlassen der Stufe fest", () => {
    const r = lauf(standMit({ "c-0001": eintrag("Neu") }), [inhalt({ id: "c-0001", status: "Pitch bereit", torI: entscheid("freigegeben") })]);
    expect(r.stand.inhalte["c-0001"]?.torI.entscheid).toBe("offen");
  });

  it("Erstlauf: Was hinter der Stufe liegt, gilt als befolgt, was davor liegt, nicht", () => {
    const z = [inhalt({ id: "c-0001", status: "In Produktion", torI: entscheid("freigegeben") }), inhalt({ id: "c-0002", status: "Pitch bereit", torI: entscheid("freigegeben"), beleg: "Schreinerei Bruderer baut den Messestand in drei Tagen auf" })];
    const r = lauf(standMit({}), z, { ...frei, erstlauf: true });
    expect(r.stand.inhalte["c-0001"]?.torI.entscheid).toBe("freigegeben");
    expect(r.stand.inhalte["c-0002"]?.torI.entscheid).toBe("");
    expect(r.befunde.find((b) => b.id === "c-0002")?.art).toBe("weiter");
  });
});

describe("Nachträglich veränderte Entscheide", () => {
  it("Tor I nach der Freigabe verändert: Hinweis, kein Eingriff, der Entscheid im Stand gilt", () => {
    const s = standMit({ "c-0001": eintrag("In Produktion", { torI: tor("freigegeben", "Leander", AM) }) });
    const r = lauf(s, [inhalt({ id: "c-0001", status: "In Produktion", torI: entscheid("abgelehnt", "Andrej", "Doch nicht") })]);
    expect(r.befunde).toHaveLength(1);
    expect(r.befunde[0]).toMatchObject({ art: "hinweis" });
    expect(r.befunde[0]!.eingriff).toBeUndefined();
    expect(r.befunde[0]!.text).toMatch(/«freigegeben» von Leander/);
  });

  it("Tor P nach der Freigabe verändert: Hinweis", () => {
    const s = standMit({ "c-0001": eintrag("Freigegeben", { torP: tor("freigegeben", "Leander", AM) }) });
    const r = lauf(s, [inhalt({ id: "c-0001", status: "Freigegeben", torP: entscheid("offen", "", "", "") })]);
    expect(r.befunde[0]!.art).toBe("hinweis");
  });

  it("unveränderte Entscheide machen keinen Befund", () => {
    const s = standMit({ "c-0001": eintrag("In Produktion", { torI: tor("freigegeben", "Leander", AM) }) });
    expect(lauf(s, [inhalt({ id: "c-0001", status: "In Produktion", torI: entscheid("freigegeben") })]).befunde).toEqual([]);
  });
});

describe("Ganzer Weg, Lauf für Lauf, mit den Eingriffen wie in Notion", () => {
  it("Neu bis Freigegeben: jeder Schritt braucht einen Menschen oder eine Prüfung, nach dem letzten Lauf ist Ruhe", () => {
    let stand: Stand = standMit({});
    let i = inhalt({ id: "c-0001", status: "Neu" });
    const schritt = (zeile: Inhalt, pruefungen?: Stand["pruefungen"]): { r: ReturnType<typeof lauf>; zeile: Inhalt } => {
      const r = lauf({ ...stand, pruefungen: pruefungen ?? stand.pruefungen }, [zeile]);
      stand = r.stand;
      return { r, zeile: r.befunde.reduce(anwenden, zeile) };
    };

    ({ zeile: i } = schritt(i)); // Neu übernommen
    i = { ...i, status: "Pitch bereit" }; // Claude setzt «Pitch bereit», Pflichtangaben stimmen
    let s = schritt(i);
    expect(arten(s.r.befunde)).toEqual(["uebernommen"]);
    i = { ...s.zeile, torI: entscheid("freigegeben") }; // Tor I im Prüfplatz
    s = schritt(i);
    expect(arten(s.r.befunde)).toEqual(["weiter"]);
    i = s.zeile;
    expect(i.status).toBe("In Produktion");
    s = schritt(i);
    expect(arten(s.r.befunde)).toEqual(["uebernommen"]);
    i = { ...s.zeile, status: "Entwurf fertig" }; // Claude meldet den Entwurf, die Prüfung liegt vor
    s = schritt(i, { "c-0001": { bestanden: true, am: JETZT } });
    expect(arten(s.r.befunde)).toEqual(["uebernommen"]);
    i = { ...s.zeile, torP: entscheid("freigegeben") }; // Tor P im Prüfplatz
    s = schritt(i);
    expect(arten(s.r.befunde)).toEqual(["weiter"]);
    i = s.zeile;
    expect(i.status).toBe("Freigegeben");
    s = schritt(i);
    expect(arten(s.r.befunde)).toEqual(["uebernommen"]);
    s = schritt(s.zeile);
    expect(s.r.befunde).toEqual([]);
    expect(stand.inhalte["c-0001"]?.status).toBe("Freigegeben");
  });
});

describe("Material", () => {
  it("«Dreh nötig» in Produktion ohne Footage oder Foto gibt einen Hinweis", () => {
    const stand = standMit({ "c-0001": eintrag("In Produktion", { torI: tor("freigegeben", "Leander", AM) }) });
    const r = lauf(stand, [inhalt({ id: "c-0001", status: "In Produktion", aufwand: "Dreh nötig", dateien: "Skript: daten/s.md", torI: entscheid("freigegeben") })]);
    expect(r.befunde.filter((b) => b.art === "hinweis").map((b) => b.text)).toEqual([expect.stringMatching(/Material fehlt/)]);
    expect(r.befunde.every((b) => !b.eingriff)).toBe(true); // nur ein Hinweis, nichts wird verändert
  });

  it("mit Footage oder Foto, bei anderem Aufwand oder in einem anderen Status gibt es keinen Hinweis", () => {
    const st = (s: Status) => standMit({ "c-0001": eintrag(s, { torI: tor("freigegeben", "Leander", AM) }) });
    const zeile = (p: Partial<Inhalt>) => inhalt({ id: "c-0001", status: "In Produktion", aufwand: "Dreh nötig", dateien: "", torI: entscheid("freigegeben"), ...p });
    const hinweise = (r: ReturnType<typeof lauf>) => r.befunde.filter((b) => b.art === "hinweis");
    expect(hinweise(lauf(st("In Produktion"), [zeile({ dateien: "Footage: rohmaterial/a.mov" })]))).toEqual([]);
    expect(hinweise(lauf(st("In Produktion"), [zeile({ dateien: "Foto: https://x.test/a" })]))).toEqual([]);
    expect(hinweise(lauf(st("In Produktion"), [zeile({ aufwand: "Nur Text" })]))).toEqual([]);
    expect(hinweise(lauf(st("Entwurf fertig"), [zeile({ status: "Entwurf fertig" })]))).toEqual([]);
  });
});

describe("zaehle", () => {
  it("zählt die Befunde je Art", () => {
    const r = lauf(standMit({}), [inhalt({ id: "c-0001" }), inhalt({ id: "c-0002", status: "Freigegeben" })]);
    expect(zaehle(r.befunde)).toMatchObject({ neu: 1, zurueckgesetzt: 1, weiter: 0 });
  });
});
