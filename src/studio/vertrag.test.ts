import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { baueEreignis } from "./melder";
import { ARTEN_AUFTRAG, AuftragAbschlussSchema, AuftragDateienAntwortSchema, AuftragHerzschlagSchema, AuftragHolenSchema, AuftragSchema, ereignisFehler, ERGEBNISSE, MEDIEN, SendungSchema } from "./vertrag";

interface Fall {
  name: string;
  body: unknown;
}
const vertrag = JSON.parse(fs.readFileSync(path.join(__dirname, "../../docs/studio/vertrag.json"), "utf8")) as {
  medien: string[];
  events: { gueltig: Fall[]; ungueltig: Fall[]; eintrag_gueltig: unknown[]; eintrag_ungueltig: { grund: string; eintrag: unknown }[] };
  status: Record<string, string>;
  jobs: {
    arten: string[];
    ergebnisse: string[];
    grund: { min_bei_failed_und_blocked: number; max: number };
    lease_sekunden: number;
    claim: { gueltig: Fall[]; ungueltig: Fall[]; antwort: { job: unknown }; antwort_leer: { job: null } };
    heartbeat: { gueltig: Fall[]; ungueltig: Fall[]; antwort: Record<string, unknown> };
    finish: { gueltig: Fall[]; ungueltig: Fall[]; antwort: Record<string, unknown> };
    dateien: { gueltig: Fall[]; ungueltig: Fall[]; antwort: unknown };
  };
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

describe("Vertrag mit dem Tool: Aufträge", () => {
  const j = vertrag.jobs;
  it("die Arten und Ergebnisse im Code sind die des Vertrags (und damit die der Datenbank)", () => {
    expect([...ARTEN_AUFTRAG]).toEqual(j.arten);
    expect([...ERGEBNISSE]).toEqual(j.ergebnisse);
  });
  it("die Grenzen des Vertrags: Grund von 5 bis 500 Zeichen, Lease drei Minuten", () => {
    expect(j.grund).toEqual({ min_bei_failed_und_blocked: 5, max: 500 });
    expect(j.lease_sekunden).toBe(180);
  });
  it.each(j.claim.gueltig)("holen gültig: $name", ({ body }) => {
    expect(AuftragHolenSchema.safeParse(body).success).toBe(true);
  });
  it.each(j.claim.ungueltig)("holen ungültig: $name", ({ body }) => {
    expect(AuftragHolenSchema.safeParse(body).success).toBe(false);
  });
  it.each(j.heartbeat.gueltig)("Lebenszeichen gültig: $name", ({ body }) => {
    expect(AuftragHerzschlagSchema.safeParse(body).success).toBe(true);
  });
  it.each(j.heartbeat.ungueltig)("Lebenszeichen ungültig: $name", ({ body }) => {
    expect(AuftragHerzschlagSchema.safeParse(body).success).toBe(false);
  });
  it.each(j.finish.gueltig)("Abschluss gültig: $name", ({ body }) => {
    expect(AuftragAbschlussSchema.safeParse(body).success).toBe(true);
  });
  it.each(j.finish.ungueltig)("Abschluss ungültig: $name", ({ body }) => {
    expect(AuftragAbschlussSchema.safeParse(body).success).toBe(false);
  });
  it.each(vertrag.jobs.dateien.gueltig)("Dateien gültig: $name", ({ body }) => {
    expect(AuftragHerzschlagSchema.safeParse(body).success).toBe(true);
  });
  it.each(vertrag.jobs.dateien.ungueltig)("Dateien ungültig: $name", ({ body }) => {
    expect(AuftragHerzschlagSchema.safeParse(body).success).toBe(false);
  });
  it("das Beispiel einer Antwort auf «Dateien» liest dieser Rechner, ohne Pfad im Speicher", () => {
    const p = AuftragDateienAntwortSchema.safeParse(vertrag.jobs.dateien.antwort);
    expect(p.success).toBe(true);
    expect(p.success && p.data.url_seconds).toBe(600);
    expect(Object.keys((vertrag.jobs.dateien.antwort as { files: object[] }).files[0]!).sort()).toEqual(["id", "name", "size", "type", "url"]);
  });
  it("ein Tool ohne die Migration des Auftragskatalogs schickt keine Katalogfelder: Der Auftrag bleibt lesbar", () => {
    const { platform: _p, format: _f, phase: _ph, brand: _b, files: _fi, ...alt } = vertrag.jobs.claim.antwort.job as Record<string, unknown>;
    const p = AuftragSchema.safeParse(alt);
    expect(p.success).toBe(true);
    expect(p.success && [p.data.platform, p.data.format, p.data.phase, p.data.brand, p.data.files]).toEqual([null, null, null, null, 0]);
  });
  it("das Beispiel einer Antwort auf «holen» liest dieser Rechner", () => {
    expect(AuftragSchema.safeParse(j.claim.antwort.job).success).toBe(true);
    expect(j.claim.antwort_leer).toEqual({ job: null });
  });
  it("Lebenszeichen und Abschluss verlangen echte Kennungen (uuid) für Auftrag und Lease", () => {
    const id = "7d1e9c3a-2b4f-4a6c-9e8d-1f2a3b4c5d6e";
    expect(AuftragHerzschlagSchema.safeParse({ job: id, lease: id }).success).toBe(true);
    expect(AuftragHerzschlagSchema.safeParse({ job: id, lease: "abc" }).success).toBe(false);
    expect(AuftragAbschlussSchema.safeParse({ job: id, lease: "abc", outcome: "done" }).success).toBe(false);
  });
  it("der Grund darf höchstens 500 Zeichen haben (die Datenbank nimmt nicht mehr)", () => {
    const id = "7d1e9c3a-2b4f-4a6c-9e8d-1f2a3b4c5d6e";
    expect(AuftragAbschlussSchema.safeParse({ job: id, lease: id, outcome: "failed", reason: "a".repeat(500) }).success).toBe(true);
    expect(AuftragAbschlussSchema.safeParse({ job: id, lease: id, outcome: "failed", reason: "a".repeat(501) }).success).toBe(false);
  });
  describe("Antwort auf «holen» (AuftragSchema)", () => {
    const basis = j.claim.antwort.job as Record<string, unknown>;
    const mit = (o: Record<string, unknown>) => AuftragSchema.safeParse({ ...basis, ...o }).success;
    it("Inhalt: leer oder c-Nummer mit mindestens vier Ziffern", () => {
      expect(mit({ content: null })).toBe(true);
      expect(mit({ content: "c-1000" })).toBe(true);
      expect(mit({ content: "x" })).toBe(false);
      expect(mit({ content: "c-12" })).toBe(false);
      expect(mit({ content: "c-1000/../x" })).toBe(false);
    });
    it("Versuch: ganze Zahl von 1 bis 3", () => {
      for (const n of [1, 2, 3]) expect(mit({ attempts: n }), String(n)).toBe(true);
      for (const n of [0, 4, 1.5, "2"]) expect(mit({ attempts: n }), String(n)).toBe(false);
    });
    it("Lease: eine uuid", () => {
      expect(mit({ lease: "nicht-uuid" })).toBe(false);
    });
    it("Art und Ziel: nur bekannte Werte", () => {
      for (const k of ARTEN_AUFTRAG) expect(mit({ kind: k }), k).toBe(true);
      expect(mit({ kind: "reel_nachbau" })).toBe(false);
      expect(mit({ target: "pc" })).toBe(false);
    });
  });
  it("das Beispiel einer Antwort trägt keine Felder, die ein Rechner nicht kennen soll", () => {
    expect(Object.keys(j.claim.antwort.job as object).sort()).toEqual(["attempts", "brand", "cancel_requested", "content", "files", "format", "id", "kind", "lease", "lease_until", "notes", "params", "phase", "platform", "status", "target"]);
  });
  it("409 steht im Vertrag", () => {
    expect(vertrag.status["409"]).toContain("Lease");
  });
});
