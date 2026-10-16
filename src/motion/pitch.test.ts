import { describe, expect, it } from "vitest";
import { weiter } from "./idee";
import { pitchText, quellenzeile } from "./pitch";
import { ideeNeu, JETZT, pitch, SATZ_LAEUFERIN, SYSTEM } from "../testing/fixtures";

describe("pitchText", () => {
  const i = (() => {
    const r = weiter(ideeNeu(), "pitch", { akteur: SYSTEM, jetzt: JETZT, daten: { pitch: pitch() } });
    if (!r.ok) throw new Error(r.fehler.join(";"));
    return r.idee;
  })();
  const t = pitchText(i);

  it("nennt den genauen Satz, die Stelle und die Begründung pro Stück", () => {
    expect(t).toContain("# Pitch m-001: Wert-Verlauf");
    expect(t).toContain("**Quelle:** Video P-023, Zeile z04 bei 14,2 s");
    expect(t).toContain(`> «${SATZ_LAEUFERIN}»`);
    expect(t).toContain("Geprüft wurden 1 von 1 Stücken:");
    expect(t).toContain("- **zahl-zaehler:**");
  });

  it("zeigt Variabilität, weitere Einsätze und Aufwand", () => {
    expect(t).toContain("- Werte der Reihe");
    expect(t).toContain("- Website-Score über mehrere Messungen");
    expect(t).toContain("## Aufwand: mittel");
  });

  it("macht klar, dass nach der Freigabe noch nichts gebaut wird, und bleibt ohne Druck", () => {
    expect(t).toContain("- [ ] Freigeben");
    expect(t).toContain("- [ ] Ablehnen. Grund: …");
    expect(t).toContain("Zuerst kommen drei Looks als Standbilder zur Wahl.");
    expect(t).not.toMatch(/!|jetzt|garantiert|nur noch/i);
  });

  it("ohne Pitch gibt es keinen Text", () => {
    expect(() => pitchText(ideeNeu())).toThrow("noch keinen Pitch");
  });
});

describe("quellenzeile", () => {
  it("beschreibt alle drei Quellen", () => {
    const basis = ideeNeu();
    expect(quellenzeile({ ...basis, quelle: { typ: "inspiration", titel: "Retention-Studie", url: "https://example.com", zeit: 12.5, beobachtung: "Zahlen laufen als Balken durchs Bild" } })).toBe("Inspirationsvideo «Retention-Studie» (https://example.com) bei 12,5 s");
    expect(quellenzeile({ ...basis, quelle: { typ: "auftrag", von: "Andrej", text: "Eine Grafik für Preisstufen" } })).toBe("Direkter Auftrag von Andrej");
  });
});
