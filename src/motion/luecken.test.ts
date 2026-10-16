import { describe, expect, it } from "vitest";
import { Idee, neueIdee, weiter } from "./idee";
import { analysiere, entwurfAusKandidat, fitSignal, fuehrendesSignal, luecken, type Zeile } from "./luecken";
import { erkenneSignale } from "./signale";
import { ideeNeu, JETZT, SATZ_LAEUFERIN, SYSTEM, stueckVerlauf, stueckZahl } from "../testing/fixtures";

const z = (id: string, text: string, t?: number): Zeile => ({ id, text, t });
const laeuferin = z("z04", SATZ_LAEUFERIN, 14.2);
const sieben = z("z02", "7 von 10 Websites laden zu langsam.", 6.4);

describe("analysiere: das Beispiel der Läuferin", () => {
  it("leere Bibliothek: der Satz ist eine Lücke, mit Hinweis", () => {
    const b = analysiere([laeuferin], [], []);
    expect(b.kandidaten[0]).toMatchObject({ urteil: "luecke" });
    expect(b.hinweise.join(" ")).toContain("Bibliothek ist leer");
  });

  it("Zahl-Zähler vorhanden: Er kann den Verlauf nicht zeigen, die Begründung nennt Stück und Satz", () => {
    const b = analysiere([laeuferin], [stueckZahl()], []);
    const k = b.kandidaten[0]!;
    expect(k.urteil).toBe("luecke");
    expect(k.fits[0]).toMatchObject({ stueck: "zahl-zaehler", passt: false });
    expect(k.fits[0]!.grund).toContain("verlangt «verlauf»");
    expect(k.fits[0]!.grund).toContain("von 97 auf 60");
  });

  it("ein Verlaufs-Stück deckt die Stelle ab und meldet, dass Zwischenwerte fehlen", () => {
    const b = analysiere([laeuferin], [stueckZahl(), stueckVerlauf()], []);
    const k = b.kandidaten[0]!;
    expect(k.urteil).toBe("abgedeckt");
    expect(k.vorschlag).toMatchObject({ stueck: "wert-verlauf", passt: true });
    expect(k.vorschlag!.fehlend[0]).toContain("3 Zwischenwerte");
  });

  it("ein Stück mit zu wenigen Wertplätzen passt nicht zu fünf Messungen", () => {
    const klein = stueckVerlauf({ parameter: [{ id: "werte", typ: "zahlenreihe", label: "Werte", beschreibung: "Messwerte in Reihenfolge", pflicht: true, minAnzahl: 2, maxAnzahl: 4, default: [1, 2] }] });
    const [sig] = erkenneSignale(SATZ_LAEUFERIN);
    expect(fitSignal(klein, sig!)).toMatchObject({ passt: false });
    expect(fitSignal(klein, sig!).grund).toContain("höchstens 4 Werte");
    expect(analysiere([laeuferin], [klein], []).kandidaten[0]!.urteil).toBe("luecke");
  });

  it("der Zahl-Zähler deckt «7 von 10» ab", () => {
    const k = analysiere([sieben], [stueckZahl()], []).kandidaten[0]!;
    expect(k.urteil).toBe("abgedeckt");
    expect(k.vorschlag?.stueck).toBe("zahl-zaehler");
  });
});

describe("analysiere: Stücke zählen erst ab «gebaut»", () => {
  it("ein Entwurf zählt nicht als vorhanden", () => {
    const entwurfStueck = stueckVerlauf({ status: "entwurf", freigabe: undefined, einsatz: undefined });
    const b = analysiere([laeuferin], [entwurfStueck], []);
    expect(b.bibliothekGroesse).toBe(0);
    expect(b.kandidaten[0]!.urteil).toBe("luecke");
  });
  it("ein gebautes, noch nicht aktives Stück zählt: sonst würde man es doppelt pitchen", () => {
    const gebaut = stueckVerlauf({ status: "gebaut", freigabe: undefined, einsatz: undefined });
    expect(analysiere([laeuferin], [gebaut], []).kandidaten[0]!.urteil).toBe("abgedeckt");
  });
});

describe("analysiere: Wiederholung vermeiden", () => {
  const offen = ideeNeu();
  it("eine ähnliche offene Idee macht die Stelle «bereits-erfasst»", () => {
    const aehnlich = z("z09", "Der Score fiel über vier Scans von 80 auf 45.");
    const k = analysiere([aehnlich], [stueckZahl()], [offen]).kandidaten[0]!;
    expect(k.urteil).toBe("bereits-erfasst");
    expect(k.verweis).toMatchObject({ idee: "m-001", status: "idee" });
  });

  it("eine abgelehnte ähnliche Idee wird mit Grund gemeldet", () => {
    const abgelehnt = weiter(offen, "abgelehnt", { akteur: SYSTEM, jetzt: JETZT, grund: "Doppelt mit einer anderen Idee" });
    expect(abgelehnt.ok).toBe(true);
    const idee = (abgelehnt as { ok: true; idee: Idee }).idee;
    const k = analysiere([z("z09", "Der Score fiel über vier Scans von 80 auf 45.")], [stueckZahl()], [idee]).kandidaten[0]!;
    expect(k.urteil).toBe("bereits-abgelehnt");
    expect(k.verweis?.grund).toBe("Doppelt mit einer anderen Idee");
  });

  it("eine ähnliche Idee mit anderer Art von Signal sperrt nichts", () => {
    const k = analysiere([z("z10", "Dein Wert war vorher viel besser als nachher.")], [stueckZahl()], [offen]).kandidaten[0]!;
    expect(k.urteil).toBe("luecke");
  });

  it("ein vorhandenes Stück schlägt die Wiederholungsprüfung (abgedeckt vor bereits-erfasst)", () => {
    const k = analysiere([laeuferin], [stueckVerlauf()], [offen]).kandidaten[0]!;
    expect(k.urteil).toBe("abgedeckt");
  });
});

describe("analysiere: unsichere Signale und Claudes Ergänzungen", () => {
  it("nur schwache Signale werden «unsicher», nie automatisch eine Lücke", () => {
    const k = analysiere([z("z01", "Über fünf Messungen hat sich der Wert verschlechtert.")], [stueckZahl()], []).kandidaten[0]!;
    expect(k.urteil).toBe("unsicher");
  });

  it("Sätze ohne Signal tauchen nicht auf", () => {
    expect(analysiere([z("z01", "Schön, dass du da bist.")], [], []).kandidaten).toEqual([]);
  });

  it("ein von Claude ergänztes freies Signal macht einen Satz zum Kandidaten", () => {
    const frei = { typ: "frei" as const, beschreibung: "Der Weg einer Anfrage durch den Betrieb, räumlich erklärt", text: "Wie die Anfrage durch den Betrieb läuft", sicherheit: "hoch" as const };
    const b = analysiere([z("z07", "Schau, wie die Anfrage durch den Betrieb läuft.")], [stueckZahl()], [], { zusatzSignale: { z07: [frei] } });
    expect(b.kandidaten[0]).toMatchObject({ urteil: "luecke" });
    expect(fuehrendesSignal(b.kandidaten[0]!.signale).typ).toBe("frei");
  });
});

describe("entwurfAusKandidat und luecken", () => {
  it("der Entwurf trägt den genauen Satz, die Zeit und die Begründung pro Stück, und wird zur gültigen Idee", () => {
    const b = analysiere([laeuferin], [stueckZahl()], []);
    const e = entwurfAusKandidat(b.kandidaten[0]!, { projekt: "P-023", bibliothekGroesse: b.bibliothekGroesse, jetzt: JETZT });
    expect(e.quelle).toEqual({ typ: "video", projekt: "P-023", zeile: "z04", t: 14.2, satz: SATZ_LAEUFERIN });
    expect(e.titel).toBe("Wert-Verlauf");
    expect(e.warumNichtsPasst.geprueft[0]).toMatchObject({ stueck: "zahl-zaehler" });
    expect(e.warumNichtsPasst.bibliothekGroesse).toBe(1);
    expect(() => neueIdee(e, "m-002", SYSTEM, JETZT)).not.toThrow();
  });

  it("bei grosser Bibliothek werden mindestens drei Stücke einzeln begründet", () => {
    const viele = ["a-eins", "b-zwei", "c-drei", "d-vier"].map((id) => stueckZahl({ id, name: id }));
    const b = analysiere([laeuferin], viele, []);
    const e = entwurfAusKandidat(b.kandidaten[0]!, { projekt: "P-1", bibliothekGroesse: b.bibliothekGroesse, jetzt: JETZT });
    expect(e.warumNichtsPasst.geprueft.length).toBeGreaterThanOrEqual(3);
    expect(() => neueIdee(e, "m-003", SYSTEM, JETZT)).not.toThrow();
  });

  it("aus einer abgedeckten Stelle wird keine Idee", () => {
    const b = analysiere([sieben], [stueckZahl()], []);
    expect(() => entwurfAusKandidat(b.kandidaten[0]!, { projekt: "P", bibliothekGroesse: 1, jetzt: JETZT })).toThrow("Nur Lücken");
  });

  it("luecken() sortiert nach Wichtigkeit und begrenzt die Zahl neuer Ideen pro Video", () => {
    const zeilen = [
      z("z01", "Wir haben 300 Anfragen bekommen.", 1),
      z("z02", "Der Score fiel von 97 auf 60.", 2),
      z("z03", "Das ist besser als vorher.", 3),
      z("z04", "Drei Fehler kosten dich Kunden.", 4),
    ];
    const b = analysiere(zeilen, [], []);
    const r = luecken(b, 2);
    expect(r.aufnehmen.map((k) => k.zeile.id)).toEqual(["z02", "z03"]);
    expect(r.zurueckgestellt.map((k) => k.zeile.id)).toEqual(["z04", "z01"]);
  });
});
