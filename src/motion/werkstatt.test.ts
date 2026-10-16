import { describe, expect, it } from "vitest";
import { extrahiereJson } from "./werkstatt";

describe("extrahiereJson", () => {
  it("liest das JSON und ignoriert Logzeilen davor und danach", () => {
    const text = 'Linting …\n{\n  "ok": true,\n  "lint": { "findings": [] }\n}\n [hyperframes] browserGpuMode probe → software\n';
    expect(extrahiereJson(text)).toEqual({ ok: true, lint: { findings: [] } });
  });
  it("kommt mit Klammern und Anführungszeichen in Texten zurecht", () => {
    expect(extrahiereJson('{"text":"a } b { \\" c","n":1} Ende {nicht}')).toEqual({ text: 'a } b { " c', n: 1 });
  });
  it("wirft bei fehlendem oder unvollständigem JSON", () => {
    expect(() => extrahiereJson("nur Text")).toThrow("Keine JSON-Ausgabe");
    expect(() => extrahiereJson('{"a": {"b": 1}')).toThrow("unvollständig");
  });
});
