import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Markenprofil, markeFuerExportFreigegeben } from "../core/schemas";
import { gate0Abgleich } from "./gate0";
import { zeileZuMarke } from "./marken";

const wurzel = path.resolve(import.meta.dirname, "..", "..");
const ECHT = fs.readFileSync(path.join(wurzel, "marken", "alperna.json"), "utf8");
const JETZT = "2026-10-17T12:00:00.000Z";

const marke = (p: Record<string, unknown> = {}) => zeileZuMarke({ Typ: "Eigene", "Gate 0": "offen", "Gate 0 von": "", "Marken-ID": "alperna", Name: "Alperna", url: "https://app.notion.com/p/3fc6be186e9b81df9141ebe5778a86ff", ...p });
const lauf = (m: ReturnType<typeof marke>, text: string | undefined = ECHT) => gate0Abgleich([m], () => text, JETZT);
const freigegebenText = () => lauf(marke({ "Gate 0": "freigegeben", "Gate 0 von": "Andrej", "date:Gate 0 am:start": "2026-10-17T09:44:00.000Z" }))[0]!.neuerText!;

describe("Gate 0 ins Profil übernehmen", () => {
  it("die echte Profildatei beginnt als Platzhalter und braucht Gate 0", () => {
    expect(Markenprofil.parse(JSON.parse(ECHT)).status).toBe("platzhalter");
    expect(lauf(marke())[0]).toMatchObject({ art: "unveraendert" });
  });

  it("Freigabe mit Namen: Status «freigegeben», Name und Zeit, der finale Export ist möglich", () => {
    const b = lauf(marke({ "Gate 0": "freigegeben", "Gate 0 von": "Andrej", "date:Gate 0 am:start": "2026-10-17T09:44:00.000Z" }))[0]!;
    expect(b.art).toBe("uebernommen");
    const p = Markenprofil.parse(JSON.parse(b.neuerText!));
    expect(p.status).toBe("freigegeben");
    expect(p.freigabe).toEqual({ wer: "Andrej", wann: "2026-10-17T09:44:00.000Z" });
    expect(markeFuerExportFreigegeben(p)).toEqual({ ok: true });
  });

  it("nur zwei Zeilen ändern sich, der Rest der Datei bleibt Byte für Byte gleich", () => {
    const alt = ECHT.split("\n");
    const neu = freigegebenText().split("\n");
    expect(neu.length).toBe(alt.length + 1);
    const gleich = alt.filter((z) => neu.includes(z));
    expect(gleich.length).toBe(alt.length - 1); // nur die Statuszeile fehlt
    expect(neu.filter((z) => !alt.includes(z))).toEqual([expect.stringContaining('"status": "freigegeben"'), expect.stringContaining('"freigabe"')]);
  });

  it("ein Datum ohne Uhrzeit oder ein fehlendes Datum wird zu einem gültigen Zeitpunkt", () => {
    for (const am of ["2026-10-17", ""]) {
      const b = lauf(marke({ "Gate 0": "freigegeben", "Gate 0 von": "Leander", "date:Gate 0 am:start": am }))[0]!;
      expect(b.art, am).toBe("uebernommen");
      expect(Markenprofil.parse(JSON.parse(b.neuerText!)).freigabe?.wer).toBe("Leander");
    }
  });

  it("«freigegeben» ohne Namen oder mit Systemnamen wird nicht übernommen", () => {
    for (const von of ["", "Claude", "system"]) {
      const b = lauf(marke({ "Gate 0": "freigegeben", "Gate 0 von": von }))[0]!;
      expect(b.art, von).toBe("hinweis");
      expect(b.neuerText).toBeUndefined();
    }
  });

  it("ein Name mit Anführungszeichen zerstört die Datei nicht", () => {
    const b = lauf(marke({ "Gate 0": "freigegeben", "Gate 0 von": 'Andrej "Andi" Good' }))[0]!;
    expect(Markenprofil.parse(JSON.parse(b.neuerText!)).freigabe?.wer).toBe('Andrej "Andi" Good');
  });

  it("Widerruf in Notion setzt das Profil zurück auf «platzhalter» und entfernt die Freigabe", () => {
    const frei = freigegebenText();
    for (const g of ["offen", "Änderung"]) {
      const b = lauf(marke({ "Gate 0": g }), frei)[0]!;
      expect(b.art, g).toBe("zurueckgesetzt");
      const p = Markenprofil.parse(JSON.parse(b.neuerText!));
      expect(p.status).toBe("platzhalter");
      expect(p.freigabe).toBeUndefined();
      expect(b.neuerText).toBe(ECHT);
    }
  });

  it("eine Freigabe in Notion ohne Namen widerruft ein freigegebenes Profil", () => {
    expect(lauf(marke({ "Gate 0": "freigegeben", "Gate 0 von": "" }), freigegebenText())[0]!.art).toBe("zurueckgesetzt");
  });

  it("stimmt alles überein, bleibt alles unverändert; ein anderer Name im Profil ist ein Hinweis", () => {
    const frei = freigegebenText();
    expect(lauf(marke({ "Gate 0": "freigegeben", "Gate 0 von": "Andrej" }), frei)[0]!.art).toBe("unveraendert");
    const b = lauf(marke({ "Gate 0": "freigegeben", "Gate 0 von": "Leander" }), frei)[0]!;
    expect(b.art).toBe("hinweis");
    expect(b.neuerText).toBeUndefined();
  });

  it("ein vorhandenes Profil mit alter Freigabe wird nicht verdoppelt", () => {
    const alt = ECHT.replace('"status": "platzhalter",', '"status": "platzhalter",\n  "freigabe": { "wer": "Früher", "wann": "2026-01-01T00:00:00.000Z" },');
    const b = lauf(marke({ "Gate 0": "freigegeben", "Gate 0 von": "Andrej" }), alt)[0]!;
    expect(b.neuerText!.match(/"freigabe"/g)).toHaveLength(1);
    expect(Markenprofil.parse(JSON.parse(b.neuerText!)).freigabe?.wer).toBe("Andrej");
  });

  it("eine mehrzeilige «freigabe» wird nicht angefasst, es gibt einen Hinweis", () => {
    const mehr = ECHT.replace('"status": "platzhalter",', '"status": "platzhalter",\n  "freigabe": {\n    "wer": "Früher",\n    "wann": "2026-01-01T00:00:00.000Z"\n  },');
    const b = lauf(marke({ "Gate 0": "freigegeben", "Gate 0 von": "Andrej" }), mehr)[0]!;
    expect(b.art).toBe("hinweis");
    expect(b.text).toMatch(/mehrzeilige/);
    expect(b.neuerText).toBeUndefined();
  });

  it("kein Profil im Repo oder ein ungültiges: Hinweis, nichts geändert", () => {
    const m = marke({ "Gate 0": "freigegeben", "Gate 0 von": "Andrej" });
    expect(gate0Abgleich([m], () => undefined, JETZT)[0]).toMatchObject({ art: "hinweis" });
    expect(lauf(m, "{kaputt")[0]).toMatchObject({ art: "hinweis" });
    expect(lauf(m, '{"schluessel":"alperna"}')[0]).toMatchObject({ art: "hinweis" });
  });

  it("eine Zeile ohne Marken-ID wird übergangen", () => {
    expect(lauf(marke({ "Marken-ID": "" }))).toEqual([]);
  });
});
