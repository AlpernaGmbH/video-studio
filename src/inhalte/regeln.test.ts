import { describe, expect, it } from "vitest";
import type { Inhalt, Status } from "./inhalt";
import { DUBLETTE_SCHWELLE, DUBLETTE_TAGE, dubletten, grundGenuegt, pflichtLuecken, pruefeUebergang, rohstoffFehlt, type UebergangsKontext } from "./regeln";

import { claude, inhalt, JETZT, mensch } from "./testdaten";

const leer = { entscheid: "" as const, grund: "", von: "", am: "" };

const ctx = (p: Partial<UebergangsKontext> = {}): UebergangsKontext => ({ jetzt: JETZT, akteur: claude, gate0: "freigegeben", ...p });
const fehler = (i: Inhalt, nach: Status, c: Partial<UebergangsKontext> = {}): string[] => {
  const r = pruefeUebergang(i, nach, ctx(c));
  return r.ok ? [] : r.fehler;
};
const ok = (i: Inhalt, nach: Status, c: Partial<UebergangsKontext> = {}): boolean => pruefeUebergang(i, nach, ctx(c)).ok;

describe("Pflichtangaben für «Pitch bereit»", () => {
  it("ein vollständiger Inhalt hat keine Lücken", () => {
    expect(pflichtLuecken(inhalt())).toEqual([]);
    expect(ok(inhalt(), "Pitch bereit")).toBe(true);
  });

  it("jede fehlende Angabe wird genannt und hält den Inhalt in «Neu»", () => {
    const i = inhalt({ format: "ungeklärt", plattformen: [], marke: "", quelle: undefined, hook: "kurz", winkel: "", beleg: "", aufwand: undefined });
    const l = pflichtLuecken(i);
    expect(l).toHaveLength(8);
    const f = fehler(i, "Pitch bereit");
    expect(f).toHaveLength(1);
    expect(f[0]).toMatch(/Ohne Beleg bleibt die Idee in «Neu»/);
  });

  it("eine Quelle mit Link braucht einen Link, «Manuell» nicht", () => {
    expect(pflichtLuecken(inhalt({ quelle: "Viral-Liste", referenz: "" }))).toEqual(["Referenz als Link (Quelle mit Link)"]);
    expect(pflichtLuecken(inhalt({ quelle: "Viral-Liste", referenz: "https://www.instagram.com/reel/abc" }))).toEqual([]);
    expect(pflichtLuecken(inhalt({ quelle: "Manuell", referenz: "" }))).toEqual([]);
  });

  it("ein Beleg unter zehn Zeichen genügt nicht", () => {
    expect(pflichtLuecken(inhalt({ beleg: "stimmt" }))).toContain("Beleg (echter Fakt, echte Zahl oder Erlebnis)");
  });
});

describe("Tor I: Pitch bereit → In Produktion", () => {
  const freigegeben = (p: Partial<Inhalt> = {}) => inhalt({ status: "Pitch bereit", torI: { entscheid: "freigegeben", grund: "", von: "Leander", am: JETZT }, ...p });

  it("läuft, wenn ein Mensch mit Namen freigegeben hat und alles stimmt", () => {
    expect(ok(freigegeben(), "In Produktion")).toBe(true);
  });

  it("scheitert ohne Entscheid", () => {
    expect(fehler(freigegeben({ torI: { ...leer, entscheid: "offen" } }), "In Produktion")).toContain("Tor I ist nicht freigegeben");
  });

  it("scheitert, wenn der Entscheid keinen Menschen mit Namen trägt", () => {
    for (const von of ["", "   ", "Claude", "system", "KI", "Pipeline"]) {
      const f = fehler(freigegeben({ torI: { entscheid: "freigegeben", grund: "", von, am: JETZT } }), "In Produktion");
      expect(f, `von=«${von}»`).toContain("Tor I trägt keinen Menschen mit Namen als Entscheider");
    }
  });

  it("scheitert, solange Gate 0 der Marke nicht freigegeben ist", () => {
    for (const gate0 of [undefined, "offen", "Änderung"] as const) {
      expect(fehler(freigegeben(), "In Produktion", { gate0 })).toContain("Gate 0 der Marke ist nicht freigegeben: Tor I und Tor P gelten erst danach");
    }
  });

  it("der Akteur Claude darf wechseln, der Mensch steht im Entscheid", () => {
    expect(ok(freigegeben(), "In Produktion", { akteur: claude })).toBe(true);
  });

  it("scheitert, wenn nach der Freigabe eine Pflichtangabe gelöscht wurde", () => {
    expect(fehler(freigegeben({ beleg: "" }), "In Produktion").join(" ")).toMatch(/Es fehlt: .*Beleg/);
  });
});

describe("Kein Post ohne Rohstoff", () => {
  const notion = "https://www.notion.so/Rohstoff-Kundenbesuch-3fc6be186e9b81a0af4b";

  it("ein LinkedIn-Post ohne Verweis auf einen Rohstoff fehlt", () => {
    expect(rohstoffFehlt(inhalt({ format: "LinkedIn-Post", beleg: "Praxis Hofer hat die Wartezeit auf 14 Minuten gesenkt" }))).toBe(true);
  });

  it("der Verweis steht im Beleg", () => {
    expect(rohstoffFehlt(inhalt({ format: "LinkedIn-Post", beleg: `Wartezeit auf 14 Minuten, siehe ${notion}` }))).toBe(false);
  });

  it("oder die Quelle ist «Rohstoff» und die Referenz zeigt nach Notion", () => {
    expect(rohstoffFehlt(inhalt({ format: "LinkedIn-Post", quelle: "Rohstoff", referenz: notion }))).toBe(false);
    expect(rohstoffFehlt(inhalt({ format: "LinkedIn-Post", quelle: "Rohstoff", referenz: "https://example.ch/x" }))).toBe(true);
  });

  it("andere Formate brauchen keinen Rohstoff-Eintrag", () => {
    expect(rohstoffFehlt(inhalt({ format: "Reel" }))).toBe(false);
  });

  it("blockiert Tor I für LinkedIn-Posts", () => {
    const i = inhalt({ status: "Pitch bereit", format: "LinkedIn-Post", plattformen: ["LinkedIn"], torI: { entscheid: "freigegeben", grund: "", von: "Andrej", am: JETZT } });
    expect(fehler(i, "In Produktion").join(" ")).toMatch(/Kein Post ohne Rohstoff/);
    expect(ok({ ...i, beleg: `Wartezeit von 32 auf 14 Minuten, ${notion}` }, "In Produktion")).toBe(true);
  });
});

describe("Dublettenprüfung: 90 Tage", () => {
  const a = inhalt({ id: "c-0001", beleg: "Praxis Hofer in Herisau senkt die Wartezeit von 32 auf 14 Minuten" });
  const b = (p: Partial<Inhalt> = {}) => inhalt({ id: "c-0002", beleg: "Praxis Hofer in Herisau senkt die Wartezeit von 40 auf 20 Minuten", erstellt: "2026-09-01T08:00:00Z", ...p });

  it("findet fast gleiche Belege, Zahlen zählen als gleich", () => {
    const d = dubletten(a, [b()], JETZT);
    expect(d).toHaveLength(1);
    expect(d[0]!.id).toBe("c-0002");
    expect(d[0]!.aehnlichkeit).toBeGreaterThanOrEqual(DUBLETTE_SCHWELLE);
  });

  it("ignoriert sich selbst, verworfene Inhalte und Inhalte vor mehr als 90 Tagen", () => {
    expect(dubletten(a, [a], JETZT)).toEqual([]);
    expect(dubletten(a, [b({ status: "Verworfen" })], JETZT)).toEqual([]);
    const alt = new Date(Date.parse(JETZT) - (DUBLETTE_TAGE + 1) * 86_400_000).toISOString();
    expect(dubletten(a, [b({ erstellt: alt })], JETZT)).toEqual([]);
    const knapp = new Date(Date.parse(JETZT) - (DUBLETTE_TAGE - 1) * 86_400_000).toISOString();
    expect(dubletten(a, [b({ erstellt: knapp })], JETZT)).toHaveLength(1);
  });

  it("ein anderer Fakt ist keine Dublette", () => {
    expect(dubletten(a, [b({ beleg: "Schreinerei Bruderer baut den Messestand in drei Tagen auf" })], JETZT)).toEqual([]);
  });

  it("blockiert Tor I und nennt den Treffer", () => {
    const i = { ...a, status: "Pitch bereit" as const, torI: { entscheid: "freigegeben" as const, grund: "", von: "Andrej", am: JETZT } };
    const f = fehler(i, "In Produktion", { andere: [b()] });
    expect(f.join(" ")).toMatch(/Gleicher Fakt .* c-0002/);
    expect(ok(i, "In Produktion", { andere: [] })).toBe(true);
  });
});

describe("Tor I: Ablehnung und Rückfrage", () => {
  const mit = (entscheid: "abgelehnt" | "Rückfrage", grund: string, von = "Leander") => inhalt({ status: "Pitch bereit", torI: { entscheid, grund, von, am: JETZT } });

  it("Ablehnung führt zu «Verworfen», aber nur mit Grund aus zwei Wörtern", () => {
    expect(ok(mit("abgelehnt", "Passt nicht zur Marke"), "Verworfen")).toBe(true);
    expect(fehler(mit("abgelehnt", "nein"), "Verworfen")).toContain("Eine Ablehnung braucht einen Grund aus mindestens zwei Wörtern");
    expect(fehler(mit("abgelehnt", ""), "Verworfen")).toContain("Eine Ablehnung braucht einen Grund aus mindestens zwei Wörtern");
  });

  it("Ablehnung ohne Mensch im Entscheid zählt nicht", () => {
    expect(fehler(mit("abgelehnt", "Passt nicht zur Marke", "Claude"), "Verworfen")).toContain("Tor I trägt keinen Menschen mit Namen als Entscheider");
  });

  it("eine Ablehnung führt nicht zu «In Produktion»", () => {
    expect(fehler(mit("abgelehnt", "Passt nicht zur Marke"), "In Produktion")).toContain("Tor I ist nicht freigegeben");
  });

  it("Rückfrage führt zurück zu «Neu», mit der Frage im Grund", () => {
    expect(ok(mit("Rückfrage", "Gibt es dazu eine Zahl von Praxis Hofer?"), "Neu")).toBe(true);
    expect(fehler(mit("Rückfrage", ""), "Neu")).toContain("Eine Rückfrage braucht die Frage im Feld «Tor I Grund»");
    expect(fehler(mit("Rückfrage", "Frage", "system"), "Neu")).toContain("Tor I trägt keinen Menschen mit Namen als Entscheider");
  });

  it("ohne Rückfrage im Entscheid kein Weg zurück zu «Neu»", () => {
    expect(fehler(inhalt({ status: "Pitch bereit" }), "Neu")).toContain("Tor I ist keine Rückfrage");
  });
});

describe("Produktion und Tor P", () => {
  const entwurf = (torP: Partial<Inhalt["torP"]> = {}, p: Partial<Inhalt> = {}) =>
    inhalt({ status: "Entwurf fertig", torP: { entscheid: "freigegeben", grund: "", von: "Leander", am: JETZT, ...torP }, ...p });
  const geprueft = { bestanden: true };

  it("«Entwurf fertig» braucht eine bestandene Prüfung", () => {
    const i = inhalt({ status: "In Produktion" });
    expect(fehler(i, "Entwurf fertig")).toContain("Die Prüfung des Entwurfs ist nicht bestanden");
    expect(fehler(i, "Entwurf fertig", { entwurfGeprueft: { bestanden: false, text: "2 Fehler" } })).toContain("Die Prüfung des Entwurfs ist nicht bestanden: 2 Fehler");
    expect(ok(i, "Entwurf fertig", { entwurfGeprueft: geprueft })).toBe(true);
  });

  it("Freigabe braucht Tor P mit Menschen, bestandene Prüfung, Gate 0 und keine offenen Markierungen", () => {
    expect(ok(entwurf(), "Freigegeben", { entwurfGeprueft: geprueft })).toBe(true);
    expect(fehler(entwurf({ entscheid: "" }), "Freigegeben", { entwurfGeprueft: geprueft })).toContain("Tor P ist nicht freigegeben");
    expect(fehler(entwurf({ von: "Claude" }), "Freigegeben", { entwurfGeprueft: geprueft })).toContain("Tor P trägt keinen Menschen mit Namen als Entscheider");
    expect(fehler(entwurf(), "Freigegeben", { entwurfGeprueft: geprueft, gate0: "offen" })).toContain("Gate 0 der Marke ist nicht freigegeben");
    expect(fehler(entwurf(), "Freigegeben")).toContain("Die Prüfung des Entwurfs ist nicht bestanden");
    expect(fehler(entwurf({}, { offeneMarkierungen: 2 }), "Freigegeben", { entwurfGeprueft: geprueft })).toContain("2 Markierung(en) der Schwere «muss» sind offen");
  });

  it("Änderung führt zurück in die Produktion, mit der gewünschten Änderung", () => {
    expect(ok(entwurf({ entscheid: "Änderung", grund: "Schluss kürzer" }), "In Produktion")).toBe(true);
    expect(fehler(entwurf({ entscheid: "Änderung", grund: "" }), "In Produktion")).toContain("Eine Änderung braucht im Feld «Tor P Grund», was anders sein soll");
    expect(fehler(entwurf({ entscheid: "Änderung", grund: "Schluss kürzer", von: "Pipeline" }), "In Produktion")).toContain("Tor P trägt keinen Menschen mit Namen als Entscheider");
    expect(fehler(entwurf({ entscheid: "freigegeben" }), "In Produktion")).toContain("Tor P ist keine Änderung");
  });
});

describe("Planen und Veröffentlichen", () => {
  const frei = (p: Partial<Inhalt> = {}) => inhalt({ status: "Freigegeben", publishing: "Auto", geplantFuer: "2026-10-20T07:00:00Z", ...p });

  it("«Geplant» braucht Termin, Publishing und Plattform", () => {
    expect(ok(frei(), "Geplant")).toBe(true);
    expect(fehler(frei({ geplantFuer: "" }), "Geplant")).toContain("«Geplant für» fehlt");
    expect(fehler(frei({ publishing: undefined }), "Geplant")).toContain("«Publishing» fehlt (Auto, Paket oder Manuell)");
    expect(fehler(frei({ plattformen: [] }), "Geplant")).toContain("Plattform fehlt");
  });

  it("bei «Auto» steht die Adresse im Ziel, bei «Paket» und «Manuell» bestätigt ein Mensch", () => {
    const geplant = (p: Partial<Inhalt>) => inhalt({ status: "Geplant", ...p });
    expect(fehler(geplant({ publishing: "Auto", ziel: "" }), "Veröffentlicht")).toContain("Bei «Auto» steht die Adresse des Beitrags oder Entwurfs im Feld «Ziel»");
    expect(ok(geplant({ publishing: "Auto", ziel: "https://www.linkedin.com/feed/update/1" }), "Veröffentlicht")).toBe(true);
    expect(fehler(geplant({ publishing: "Manuell" }), "Veröffentlicht", { akteur: claude }).join(" ")).toMatch(/bestätigt ein Mensch/);
    expect(ok(geplant({ publishing: "Manuell" }), "Veröffentlicht", { akteur: mensch })).toBe(true);
    expect(fehler(geplant({ publishing: "Paket" }), "Veröffentlicht", { akteur: claude }).join(" ")).toMatch(/«Paket»/);
  });

  it("«Ausgewertet» folgt auf «Veröffentlicht»", () => {
    expect(ok(inhalt({ status: "Veröffentlicht" }), "Ausgewertet")).toBe(true);
  });
});

describe("Pausieren und Verwerfen", () => {
  it("Pausieren braucht einen Grund und gilt nicht für Endzustände", () => {
    expect(ok(inhalt({ status: "In Produktion" }), "Pausiert", { grund: "Kunde wartet auf Dreh" })).toBe(true);
    expect(fehler(inhalt({ status: "In Produktion" }), "Pausiert")).toContain("Pausieren braucht einen Grund");
    expect(fehler(inhalt({ status: "Pausiert" }), "Pausiert", { grund: "Kunde wartet" })).toEqual(["Der Inhalt ist schon «Pausiert»"]);
    for (const s of ["Verworfen", "Ausgewertet", "Veröffentlicht"] as const) {
      expect(fehler(inhalt({ status: s }), "Pausiert", { grund: "Kunde wartet" }).join(" "), s).toMatch(/lässt sich nicht pausieren/);
    }
  });

  it("aus der Pause geht es nur zum früheren Status zurück", () => {
    const p = inhalt({ status: "Pausiert" });
    expect(ok(p, "In Produktion", { vorPause: "In Produktion" })).toBe(true);
    expect(fehler(p, "Freigegeben", { vorPause: "In Produktion" })).toContain("Übergang «Pausiert» → «Freigegeben» ist nicht vorgesehen");
    expect(fehler(p, "In Produktion")).toContain("Übergang «Pausiert» → «In Produktion» ist nicht vorgesehen");
  });

  it("Verwerfen aus der Produktion darf nur ein Mensch, mit Grund aus zwei Wörtern", () => {
    const i = inhalt({ status: "In Produktion" });
    expect(ok(i, "Verworfen", { akteur: mensch, grund: "Kunde sagt ab" })).toBe(true);
    expect(fehler(i, "Verworfen", { akteur: claude, grund: "Kunde sagt ab" }).join(" ")).toMatch(/nur ein Mensch/);
    expect(fehler(i, "Verworfen", { akteur: mensch, grund: "nein" })).toContain("Verwerfen braucht einen Grund aus mindestens zwei Wörtern");
  });

  it("Verworfen und Ausgewertet sind Endzustände", () => {
    expect(fehler(inhalt({ status: "Verworfen" }), "Neu").join(" ")).toMatch(/nicht vorgesehen/);
    expect(fehler(inhalt({ status: "Ausgewertet" }), "Verworfen", { akteur: mensch, grund: "Kunde sagt ab" }).join(" ")).toMatch(/geht es nicht weiter/);
  });

  it("aus «Neu» verwirft auch Claude, wenn ein Grund da ist", () => {
    expect(ok(inhalt(), "Verworfen", { grund: "Dublette von c-0005" })).toBe(true);
    expect(fehler(inhalt(), "Verworfen", { grund: "" })).toContain("Verwerfen braucht einen Grund aus mindestens zwei Wörtern");
  });

  it("gleicher Status und Sprünge sind nicht erlaubt", () => {
    expect(fehler(inhalt(), "Neu")).toEqual(["Der Inhalt ist schon «Neu»"]);
    expect(fehler(inhalt(), "Freigegeben")).toEqual(["Übergang «Neu» → «Freigegeben» ist nicht vorgesehen"]);
    expect(fehler(inhalt({ status: "Pitch bereit" }), "Freigegeben")).toEqual(["Übergang «Pitch bereit» → «Freigegeben» ist nicht vorgesehen"]);
    expect(fehler(inhalt({ status: "Entwurf fertig" }), "Geplant")).toEqual(["Übergang «Entwurf fertig» → «Geplant» ist nicht vorgesehen"]);
  });

  it("ein leerer Status gilt als «Neu»", () => {
    expect(ok(inhalt({ status: "" }), "Pitch bereit")).toBe(true);
  });
});

describe("grundGenuegt", () => {
  it("verlangt zehn Zeichen und zwei Wörter", () => {
    expect(grundGenuegt(undefined)).toBe(false);
    expect(grundGenuegt("nein")).toBe(false);
    expect(grundGenuegt("Dublettenfrage")).toBe(false);
    expect(grundGenuegt("zu kurz")).toBe(false);
    expect(grundGenuegt("Passt nicht zur Marke")).toBe(true);
  });
});
