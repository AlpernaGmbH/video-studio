import { describe, expect, it } from "vitest";
import { parseArgs, werteAusSet } from "./args";

describe("parseArgs", () => {
  it("trennt positionale Argumente, Flags, Werte und --set", () => {
    const a = parseArgs(["motion", "render", "zahl-zaehler", "-x", "--final", "--dauer", "2.4", "--marke=alperna", "--set", "wert=7", "--set", "suffix= von 10"]);
    expect(a.pos).toEqual(["motion", "render", "zahl-zaehler", "-x"]);
    expect(a.opt).toEqual({ final: true, dauer: "2.4", marke: "alperna" });
    expect(a.set).toEqual({ wert: "7", suffix: " von 10" });
  });
  it("ein Flag vor einem weiteren Flag bleibt ein Flag", () => {
    expect(parseArgs(["--mensch", "--by", "Andrej"]).opt).toEqual({ mensch: true, by: "Andrej" });
  });
  it("alles nach -- ist positional", () => {
    expect(parseArgs(["a", "--", "--b"]).pos).toEqual(["a", "--b"]);
  });
  it("--set ohne = ist ein Fehler", () => {
    expect(() => parseArgs(["--set", "wert"])).toThrow("Schlüssel=Wert");
    expect(() => parseArgs(["--set"])).toThrow("Schlüssel=Wert");
  });
  it("Werte mit = bleiben ganz", () => {
    expect(parseArgs(["--set", "label=a=b"]).set).toEqual({ label: "a=b" });
  });
});

describe("werteAusSet", () => {
  it("macht Zahlen, Wahrheitswerte und JSON-Listen aus Text", () => {
    expect(werteAusSet({ a: "7", b: "-1.5", c: "true", d: "[97,80,60]", e: "Text", f: "{kaputt", g: "007x" })).toEqual({ a: 7, b: -1.5, c: true, d: [97, 80, 60], e: "Text", f: "{kaputt", g: "007x" });
  });
});
