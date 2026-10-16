import { describe, expect, it } from "vitest";
import {
  Idee,
  MAX_KORREKTURRUNDEN,
  MAX_OFFENE_PITCHES,
  WIP_LIMIT_STANDARD,
  aehnlichkeit,
  istMensch,
  neueIdee,
  pruefungErfassen,
  weiter,
  wortmenge,
  type IdeeStatus,
  type WeiterKontext,
} from "./idee";
import { entwurf, ideeNeu, JETZT, looks, MENSCH, pitch, SPAETER, SYSTEM } from "../testing/fixtures";

type Ok = { ok: true; idee: Idee };
const geht = (r: ReturnType<typeof weiter>): Idee => {
  if (!r.ok) throw new Error(`Übergang gescheitert: ${r.fehler.join("; ")}`);
  return r.idee;
};
const ctx = (over: Partial<WeiterKontext> = {}): WeiterKontext => ({ akteur: SYSTEM, jetzt: JETZT, ...over });
const mensch = (over: Partial<WeiterKontext> = {}) => ctx({ akteur: MENSCH, ...over });

/** Führt eine Idee bis zu einem Status, mit allen vorgeschriebenen Daten. */
function bis(ziel: IdeeStatus): Idee {
  let i = ideeNeu();
  const schritte: [IdeeStatus, () => WeiterKontext][] = [
    ["pitch", () => ctx({ daten: { pitch: pitch() } })],
    ["freigegeben", () => mensch()],
    ["looks", () => ctx({ daten: { looks: looks() } })],
    ["look_gewaehlt", () => mensch({ daten: { gewaehlt: "b", notizen: ["Linie etwas dünner"] } })],
    ["in_bau", () => ctx({ daten: { stueck: "wert-verlauf" } })],
  ];
  for (const [status, k] of schritte) {
    if (i.status === ziel) return i;
    i = geht(weiter(i, status, k()));
  }
  if (i.status === ziel) return i;
  if (ziel === "render_geprueft" || ziel === "in_bibliothek") {
    const p = pruefungErfassen(i, { am: JETZT, bestanden: true, befunde: [] });
    if (!p.ok) throw new Error(p.fehler.join("; "));
    i = geht(weiter(p.idee, "render_geprueft", ctx()));
  }
  if (ziel === "in_bibliothek") i = geht(weiter(i, "in_bibliothek", mensch({ stueckAktiviert: true, jetzt: SPAETER })));
  return i;
}

describe("Idee anlegen", () => {
  it("trägt den genauen Satz, die Signale und den ersten Verlaufseintrag", () => {
    const i = ideeNeu();
    expect(i.status).toBe("idee");
    expect(i.quelle).toMatchObject({ typ: "video", satz: expect.stringContaining("97 auf 60") });
    expect(i.verlauf).toEqual([{ von: null, nach: "idee", wer: SYSTEM, wann: JETZT }]);
  });

  it("ein Videosatz ist Pflicht und darf nicht leer sein", () => {
    expect(() => neueIdee(entwurf({ quelle: { typ: "video", projekt: "P-1", satz: "" } }), "m-001", SYSTEM, JETZT)).toThrow();
  });

  it("die Begründung muss bei grösserer Bibliothek mehrere Stücke einzeln nennen", () => {
    const w = entwurf().warumNichtsPasst;
    expect(() => neueIdee(entwurf({ warumNichtsPasst: { ...w, bibliothekGroesse: 24 } }), "m-001", SYSTEM, JETZT)).toThrow(/mindestens 3 einzeln begründet/);
    expect(() => neueIdee(entwurf({ warumNichtsPasst: { ...w, bibliothekGroesse: 0, geprueft: [] } }), "m-001", SYSTEM, JETZT)).not.toThrow();
  });

  it("alle drei Quellen sind möglich, Inspiration und Auftrag brauchen ihre Angaben", () => {
    const insp = entwurf({ quelle: { typ: "inspiration", titel: "Mr. Beast Retention", url: "https://example.com/v", zeit: 12, beobachtung: "Zahlen laufen als Balken durchs Bild" } });
    const auftrag = entwurf({ quelle: { typ: "auftrag", von: "Andrej", text: "Bitte eine Grafik für Preisstaffeln" } });
    expect(neueIdee(insp, "m-002", SYSTEM, JETZT).quelle.typ).toBe("inspiration");
    expect(neueIdee(auftrag, "m-003", SYSTEM, JETZT).quelle.typ).toBe("auftrag");
    expect(() => neueIdee(entwurf({ quelle: { typ: "auftrag", von: "", text: "x" } }), "m-004", SYSTEM, JETZT)).toThrow();
  });
});

describe("Zustandsautomat: der vorgesehene Weg", () => {
  it("läuft Stufe für Stufe von der Idee bis in die Bibliothek", () => {
    const i = bis("in_bibliothek");
    expect(i.status).toBe("in_bibliothek");
    expect(i.verlauf.map((v) => v.nach)).toEqual(["idee", "pitch", "freigegeben", "looks", "look_gewaehlt", "in_bau", "render_geprueft", "in_bibliothek"]);
    expect(i.entscheidung).toMatchObject({ art: "freigegeben", wer: "Andrej" });
    expect(i.looks?.gewaehlt).toBe("b");
    expect(i.looks?.notizen).toContain("Linie etwas dünner");
    expect(i.bau?.notizen).toEqual([]);
    expect(i.abnahme).toEqual({ wer: "Andrej", wann: SPAETER });
  });

  it("die Eingaben bleiben unverändert (reine Funktion)", () => {
    const vorher = ideeNeu();
    const kopie = structuredClone(vorher);
    weiter(vorher, "pitch", ctx({ daten: { pitch: pitch() } }));
    expect(vorher).toEqual(kopie);
  });
});

describe("Zustandsautomat: Stufen lassen sich nicht überspringen", () => {
  const unzulaessig: [IdeeStatus, IdeeStatus][] = [
    ["idee", "freigegeben"],
    ["idee", "looks"],
    ["pitch", "looks"],
    ["pitch", "in_bau"],
    ["freigegeben", "in_bau"], // die wichtigste: nichts bauen ohne Looks
    ["freigegeben", "look_gewaehlt"],
    ["looks", "in_bau"],
    ["look_gewaehlt", "render_geprueft"],
    ["in_bau", "in_bibliothek"],
    ["render_geprueft", "looks"],
  ];
  it.each(unzulaessig)("«%s» → «%s» ist nicht vorgesehen", (von, nach) => {
    const r = weiter(bis(von), nach, mensch({ daten: { stueck: "x-y", gewaehlt: "a", looks: looks(), pitch: pitch() } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fehler[0]).toContain("nicht vorgesehen");
  });

  it.each(["in_bibliothek", "abgelehnt"] as const)("%s ist ein Endstatus", (ende) => {
    const i = ende === "abgelehnt" ? geht(weiter(ideeNeu(), "abgelehnt", ctx({ grund: "Doppelt vorhanden" }))) : bis("in_bibliothek");
    for (const nach of ["idee", "pitch", "freigegeben", "in_bau"] as IdeeStatus[]) {
      expect(weiter(i, nach, mensch()).ok).toBe(false);
    }
  });
});

describe("Zustandsautomat: Freigaben gehören Menschen", () => {
  const nurMenschen: [IdeeStatus, IdeeStatus, Partial<WeiterKontext>][] = [
    ["pitch", "freigegeben", {}],
    ["pitch", "abgelehnt", { grund: "Zu speziell für unsere Videos" }],
    ["looks", "look_gewaehlt", { daten: { gewaehlt: "a" } }],
    ["looks", "freigegeben", { grund: "Alle drei zu laut" }],
    ["render_geprueft", "in_bibliothek", { stueckAktiviert: true }],
    ["render_geprueft", "in_bau", { grund: "Zahl grösser" }],
    ["in_bau", "abgelehnt", { grund: "Wird doch nicht gebraucht" }],
  ];
  it.each(nurMenschen)("%s → %s: das System wird abgewiesen", (von, nach, extra) => {
    const r = weiter(bis(von), nach, ctx(extra));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fehler.join(" ")).toContain("nur ein Mensch");
  });

  it.each(nurMenschen)("%s → %s: ein Mensch darf", (von, nach, extra) => {
    expect(weiter(bis(von), nach, mensch(extra)).ok).toBe(true);
  });

  it("Claude kann sich nicht einfach als Mensch eintragen", () => {
    for (const name of ["claude", "Claude", "system", "KI", "AI", " bot "]) {
      expect(istMensch({ typ: "mensch", name })).toBe(false);
      expect(weiter(bis("pitch"), "freigegeben", { akteur: { typ: "mensch", name }, jetzt: JETZT }).ok).toBe(false);
    }
    expect(istMensch({ typ: "mensch", name: "Andrej" })).toBe(true);
    expect(istMensch({ typ: "system", name: "Andrej" })).toBe(false);
  });

  it("das System darf eine eigene Idee verwerfen, solange noch kein Pitch vorliegt (Duplikat)", () => {
    const r = weiter(ideeNeu(), "abgelehnt", ctx({ grund: "Doppelt mit m-004" }));
    expect(r.ok).toBe(true);
  });
});

describe("Zustandsautomat: Pitch", () => {
  it("braucht einen vollständigen Pitch mit mindestens zwei weiteren Einsätzen", () => {
    expect(weiter(ideeNeu(), "pitch", ctx()).ok).toBe(false);
    const einWeiterer = { ...pitch(), wiederverwendung: ["Nur ein weiterer Einsatz, das reicht nicht"] };
    const r = weiter(ideeNeu(), "pitch", ctx({ daten: { pitch: einWeiterer } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fehler.join(" ")).toContain("wiederverwendung");
  });

  it("höchstens fünf offene Pitches: Aufmerksamkeit ist der Engpass", () => {
    const r = weiter(ideeNeu(), "pitch", ctx({ daten: { pitch: pitch() }, offenePitches: MAX_OFFENE_PITCHES }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fehler.join(" ")).toContain("5 Pitches liegen schon");
    expect(weiter(ideeNeu(), "pitch", ctx({ daten: { pitch: pitch() }, offenePitches: MAX_OFFENE_PITCHES - 1 })).ok).toBe(true);
  });

  it("eine Ablehnung braucht einen Grund und hält ihn fest", () => {
    const p = bis("pitch");
    expect(weiter(p, "abgelehnt", mensch()).ok).toBe(false);
    expect(weiter(p, "abgelehnt", mensch({ grund: "zu kurz" })).ok).toBe(false);
    const i = geht(weiter(p, "abgelehnt", mensch({ grund: "Zu speziell, kommt einmal im Jahr vor" })));
    expect(i.entscheidung).toMatchObject({ art: "abgelehnt", wer: "Andrej", grund: "Zu speziell, kommt einmal im Jahr vor" });
  });
});

describe("Zustandsautomat: Looks vor dem Bau", () => {
  it("verlangt genau drei verschiedene Looks mit je einem Standbild", () => {
    const f = bis("freigegeben");
    const zwei = { ...looks(), briefs: looks().briefs.slice(0, 2) };
    expect(weiter(f, "looks", ctx({ daten: { looks: zwei as never } })).ok).toBe(false);
    const gleicheName = looks();
    gleicheName.briefs[1]!.name = gleicheName.briefs[0]!.name.toUpperCase();
    const r = weiter(f, "looks", ctx({ daten: { looks: gleicheName } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fehler.join(" ")).toContain("verschiedene Namen");
    const gleicheIdee = looks();
    gleicheIdee.briefs[2]!.leitidee = gleicheIdee.briefs[0]!.leitidee;
    expect(weiter(f, "looks", ctx({ daten: { looks: gleicheIdee } })).ok).toBe(false);
  });

  it("ein Standbild-Pfad darf nicht aus dem Ordner ausbrechen", () => {
    const l = looks();
    l.bilder[0]!.pfad = "../../geheim.png";
    expect(weiter(bis("freigegeben"), "looks", ctx({ daten: { looks: l } })).ok).toBe(false);
  });

  it("die Wahl ist Pflicht und muss von einem Menschen kommen", () => {
    expect(weiter(bis("looks"), "look_gewaehlt", mensch()).ok).toBe(false);
  });

  it("«keiner passt» braucht einen Grund und startet Runde 2, die Runde zählt mit", () => {
    const l1 = bis("looks");
    expect(weiter(l1, "freigegeben", mensch()).ok).toBe(false);
    const zurueck = geht(weiter(l1, "freigegeben", mensch({ grund: "Alle drei zu verspielt, ruhiger bitte" })));
    expect(zurueck.looks?.notizen).toEqual(["Runde 1 verworfen: Alle drei zu verspielt, ruhiger bitte"]);
    expect(weiter(zurueck, "looks", ctx({ daten: { looks: looks(1) } })).ok).toBe(false); // Runde 1 nochmal: falsch
    const l2 = geht(weiter(zurueck, "looks", ctx({ daten: { looks: looks(2) } })));
    expect(l2.looks?.runde).toBe(2);
    expect(l2.looks?.notizen).toHaveLength(1);
  });

  it("ein Look darf bei der Vorlage noch nicht gewählt sein", () => {
    const l = { ...looks(), gewaehlt: "a" as const };
    expect(weiter(bis("freigegeben"), "looks", ctx({ daten: { looks: l } })).ok).toBe(false);
  });
});

describe("Zustandsautomat: Bau", () => {
  it(`höchstens ${WIP_LIMIT_STANDARD} Stücke gleichzeitig im Bau`, () => {
    const l = bis("look_gewaehlt");
    const r = weiter(l, "in_bau", ctx({ daten: { stueck: "wert-verlauf" }, imBau: WIP_LIMIT_STANDARD }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fehler.join(" ")).toContain("schon im Bau");
    expect(weiter(l, "in_bau", ctx({ daten: { stueck: "wert-verlauf" }, imBau: WIP_LIMIT_STANDARD - 1 })).ok).toBe(true);
    expect(weiter(l, "in_bau", ctx({ daten: { stueck: "wert-verlauf" }, imBau: 4, wipLimit: 5 })).ok).toBe(true);
  });

  it("verlangt einen gültigen Stück-Schlüssel", () => {
    const l = bis("look_gewaehlt");
    expect(weiter(l, "in_bau", ctx()).ok).toBe(false);
    expect(weiter(l, "in_bau", ctx({ daten: { stueck: "Kein Slug!" } })).ok).toBe(false);
  });

  it("«render_geprueft» gibt es nur nach bestandener Selbstprüfung", () => {
    const b = bis("in_bau");
    expect(weiter(b, "render_geprueft", ctx()).ok).toBe(false);
    const durchgefallen = pruefungErfassen(b, { am: JETZT, bestanden: false, befunde: [{ stufe: "fehler", code: "dauer", text: "Länge 2.00 s, verlangt waren 3 s" }] });
    expect(durchgefallen.ok && weiter(durchgefallen.idee, "render_geprueft", ctx()).ok).toBe(false);
  });

  it(`höchstens ${MAX_KORREKTURRUNDEN} Selbstkorrekturen, danach entscheidet ein Mensch`, () => {
    let i = bis("in_bau");
    const fail = { am: JETZT, bestanden: false, befunde: [{ stufe: "fehler" as const, code: "leer", text: "Render ist leer" }] };
    const erlaubt: boolean[] = [];
    for (let n = 0; n < 3; n++) {
      const r = pruefungErfassen(i, fail);
      if (!r.ok) throw new Error(r.fehler.join(";"));
      erlaubt.push(r.naechsteKorrekturErlaubt);
      i = r.idee;
    }
    expect(erlaubt).toEqual([true, true, false]);
    const vierte = pruefungErfassen(i, fail);
    expect(vierte.ok).toBe(false);
    if (!vierte.ok) expect(vierte.fehler[0]).toContain("Ein Mensch entscheidet");
  });

  it("die Selbstprüfung gibt es nur im Status «in_bau»", () => {
    expect(pruefungErfassen(bis("looks"), { am: JETZT, bestanden: true, befunde: [] }).ok).toBe(false);
  });

  it("ein Änderungswunsch nach dem Render braucht eine Notiz und setzt die Prüfungen zurück", () => {
    const g = bis("render_geprueft");
    expect(weiter(g, "in_bau", mensch()).ok).toBe(false);
    const neu = geht(weiter(g, "in_bau", mensch({ grund: "Zahl grösser, Karte höher" })));
    expect(neu.bau?.versuche).toBe(2);
    expect(neu.bau?.pruefungen).toEqual([]);
    expect(neu.bau?.notizen).toEqual(["Zahl grösser, Karte höher"]);
  });

  it("der Änderungswunsch zählt gegen das Limit paralleler Bauten", () => {
    expect(weiter(bis("render_geprueft"), "in_bau", mensch({ grund: "Zahl grösser", imBau: WIP_LIMIT_STANDARD })).ok).toBe(false);
  });

  it("die Aufnahme in die Bibliothek braucht ein aktiviertes Stück", () => {
    const g = bis("render_geprueft");
    const r = weiter(g, "in_bibliothek", mensch());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fehler.join(" ")).toContain("nicht aktiviert");
  });
});

describe("Schema-Konsistenz (gegen beschädigte Dateien)", () => {
  it("ein Status ohne die zugehörigen Daten wird beim Laden abgelehnt", () => {
    const i = structuredClone(bis("in_bau")) as Record<string, unknown>;
    delete i["looks"];
    expect(Idee.safeParse(i).success).toBe(false);
    const j = structuredClone(bis("look_gewaehlt")) as { looks: { gewaehlt?: string } };
    delete j.looks.gewaehlt;
    expect(Idee.safeParse(j).success).toBe(false);
    const k = structuredClone(bis("pitch")) as Record<string, unknown>;
    k["status"] = "freigegeben";
    expect(Idee.safeParse(k).success).toBe(false);
  });
  it("der letzte Verlaufseintrag muss zum Status passen", () => {
    const i = structuredClone(ideeNeu()) as Record<string, unknown>;
    i["status"] = "abgelehnt";
    expect(Idee.safeParse(i).success).toBe(false);
  });
});

describe("Ähnlichkeit", () => {
  it("Zahlen und Zahlwörter zählen als gleich", () => {
    expect([...wortmenge("Sie fiel über fünf Scans von 97 auf 60")].sort()).toEqual([...wortmenge("Sie fiel über 4 Scans von 80 auf 45")].sort());
  });
  it("gleiche Art Satz ist ähnlich, anderer Inhalt nicht", () => {
    expect(aehnlichkeit("Die Läuferin fiel über fünf Scans von 97 auf 60.", "Der Score fiel über vier Scans von 80 auf 45.")).toBeGreaterThanOrEqual(0.55);
    expect(aehnlichkeit("Die Läuferin fiel über fünf Scans von 97 auf 60.", "Zuerst prüfst du das Profil, danach den Eintrag.")).toBeLessThan(0.2);
    expect(aehnlichkeit("", "irgendwas")).toBe(0);
  });
});
