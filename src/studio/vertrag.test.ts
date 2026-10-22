import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { baueEreignis } from "./melder";
import { ereignisFehler, MEDIEN, SendungSchema } from "./vertrag";

interface Fall {
  name: string;
  body: unknown;
}
const vertrag = JSON.parse(fs.readFileSync(path.join(__dirname, "../../docs/studio/vertrag.json"), "utf8")) as {
  medien: string[];
  events: { gueltig: Fall[]; ungueltig: Fall[]; eintrag_gueltig: unknown[]; eintrag_ungueltig: { grund: string; eintrag: unknown }[] };
};
const JETZT = Date.parse("2026-10-22T09:00:00.000Z");

/** Dieselbe Datei prüft die Gegenseite im Repo alperna-tool (tests/unit/studio-device-vertrag.test.ts). Ändert sich der Vertrag, brechen beide Tests. */
describe("Vertrag mit dem Tool: Umschlag", () => {
  it.each(vertrag.events.gueltig)("gültig: $name", ({ body }) => {
    expect(SendungSchema.safeParse(body).success).toBe(true);
  });
  it.each(vertrag.events.ungueltig)("ungültig: $name", ({ body }) => {
    expect(SendungSchema.safeParse(body).success).toBe(false);
  });
  it("der Umschlag lehnt 51 Einträge ab und nimmt 50 an", () => {
    const e = (n: number) => ({ events: Array.from({ length: n }, (_, i) => ({ id: `e${i}` })) });
    expect(SendungSchema.safeParse(e(50)).success).toBe(true);
    expect(SendungSchema.safeParse(e(51)).success).toBe(false);
  });
});

describe("Vertrag mit dem Tool: einzelne Ereignisse", () => {
  it.each(vertrag.events.eintrag_gueltig.map((e, i) => [i, e] as const))("gültiger Eintrag %i", (_i, eintrag) => {
    expect(ereignisFehler(eintrag, JETZT)).toBeUndefined();
  });
  it.each(vertrag.events.eintrag_ungueltig.map((x) => [x.grund, x.eintrag] as const))("ungültig: %s", (_grund, eintrag) => {
    expect(ereignisFehler(eintrag, JETZT)).toBeDefined();
  });
  it("die Zeitgrenzen: 30 Tage zurück und 1 Tag voraus", () => {
    const e = (ms: number) => ({ id: "a", step: "x", state: "ok", at: new Date(JETZT + ms).toISOString() });
    expect(ereignisFehler(e(-29 * 86_400_000), JETZT)).toBeUndefined();
    expect(ereignisFehler(e(-31 * 86_400_000), JETZT)).toBeDefined();
    expect(ereignisFehler(e(23 * 3_600_000), JETZT)).toBeUndefined();
    expect(ereignisFehler(e(2 * 86_400_000), JETZT)).toBeDefined();
  });
  it("Detail: 4096 Bytes sind erlaubt, 4097 nicht (Bytes, nicht Zeichen)", () => {
    const mit = (t: string) => ({ id: "a", step: "x", state: "ok", at: new Date(JETZT).toISOString(), detail: { t } });
    const leer = JSON.stringify({ t: "" }).length;
    expect(ereignisFehler(mit("a".repeat(4096 - leer)), JETZT)).toBeUndefined();
    expect(ereignisFehler(mit("a".repeat(4097 - leer)), JETZT)).toBeDefined();
    expect(ereignisFehler(mit("ä".repeat(2100)), JETZT)).toBeDefined();
  });
});

describe("Was der Melder baut, nimmt das Tool an", () => {
  const jetzt = new Date(JETZT);
  const eingaben = [
    { step: "whisper", state: "start" as const },
    { step: "  whisper  ", state: "ok" as const, ms: 1234.7, span: "s", code: "c-0007", detail: { a: 1 } },
    { step: "x", state: "error" as const, code: "C-0007", job: "kein-uuid", ms: -3, detail: { t: "a".repeat(9000) } },
    { step: "s".repeat(200), state: "info" as const, span: "p".repeat(200) },
    { step: "x", state: "laeuft" as never, ms: Number.NaN },
  ];
  it.each(eingaben.map((e, i) => [i, e] as const))("Eingabe %i", (_i, eingabe) => {
    const e = baueEreignis(eingabe, "id-1", jetzt);
    expect(e).toBeDefined();
    expect(ereignisFehler(e, JETZT)).toBeUndefined();
  });
  it("jedes gültige Beispiel des Vertrags bleibt, wie es ist (ausser dem Trimmen des Schritts)", () => {
    for (const eintrag of vertrag.events.eintrag_gueltig as { id: string; step: string; state: "start" | "ok" | "error" | "info"; at: string }[]) {
      const { id, at, ...eingabe } = eintrag;
      const e = baueEreignis({ ...eingabe, at }, id, jetzt)!;
      expect(e).toEqual({ ...eintrag, step: eintrag.step.trim() });
    }
  });
});

describe("Vertrag mit dem Tool: Medien", () => {
  it("die Liste im Code ist die des Vertrags (und damit die der Datenbank)", () => {
    expect([...MEDIEN]).toEqual(vertrag.medien);
  });
});
