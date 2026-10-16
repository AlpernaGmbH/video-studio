import { describe, expect, it } from "vitest";
import { HYPERFRAMES_VERSION, PROJEKT, SICHERHEITSRAND, batchArgs, checkArgs, compareArgs, hfAufruf, renderArgs, snapshotArgs, variablenJson } from "./render";

describe("hfAufruf", () => {
  it("startet die gepinnte Version über npx und schaltet die Update-Abfrage ab", () => {
    const a = hfAufruf(["render", "."], {});
    expect(a.cmd).toBe("npx");
    expect(a.args).toEqual(["--yes", `hyperframes@${HYPERFRAMES_VERSION}`, "render", "."]);
    expect(a.env["HYPERFRAMES_NO_UPDATE_CHECK"]).toBe("1");
    expect(HYPERFRAMES_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
  it("nimmt eine lokale Installation, wenn STUDIO_HYPERFRAMES_BIN gesetzt ist", () => {
    const a = hfAufruf(["check", "."], { STUDIO_HYPERFRAMES_BIN: "/usr/local/bin/hyperframes" });
    expect(a).toMatchObject({ cmd: "/usr/local/bin/hyperframes", args: ["check", "."] });
  });
});

describe("Befehle", () => {
  it("render: WebM mit Alpha, 25p, Variablen aus Datei, strikt", () => {
    expect(renderArgs({ dir: "/s", ausgabe: "/o.webm", variablenDatei: "/v.json" })).toEqual([
      "render", "/s", "--format", "webm", "--fps", "25", "--variables-file", "/v.json", "--strict-variables", "--output", "/o.webm",
    ]);
    expect(PROJEKT).toEqual({ breite: 1080, hoehe: 1920, fps: 25 });
  });

  it("snapshot schaltet die Bildbeschreibung durch einen externen Dienst immer ab", () => {
    const a = snapshotArgs("/s", { at: [0.4, 1], ausgabeDir: "/snap" });
    expect(a).toEqual(["snapshot", "/s", "--at", "0.4,1", "--output", "/snap", "--describe", "false"]);
    expect(a.join(" ")).toContain("--describe false");
  });

  it("check liefert JSON; batch rendert eine Datei pro Zeile", () => {
    expect(checkArgs("/s", { at: [1, 2.5] })).toEqual(["check", "/s", "--json", "--at", "1,2.5"]);
    expect(checkArgs("/s")).toEqual(["check", "/s", "--json"]);
    // Kein --strict-variables im Batch: HyperFrames würde den Dateinamen-Schlüssel «name» ablehnen (siehe batch.ts)
    expect(batchArgs({ dir: "/s", zeilenDatei: "/z.json", ausgabeMuster: "/out/{name}.webm" })).toEqual([
      "render", "/s", "--format", "webm", "--fps", "25", "--batch", "/z.json", "--output", "/out/{name}.webm",
    ]);
  });

  it("compare nimmt die Looks mit Beschriftung A, B, C", () => {
    expect(compareArgs({ dirs: ["/a", "/b", "/c"], labels: ["A", "B", "C"], at: 1.2, ausgabe: "/v.png" })).toEqual([
      "compare", "/a", "/b", "/c", "--labels", "A,B,C", "--at", "1.2", "--out", "/v.png", "--json",
    ]);
  });

  it("variablenJson endet mit Zeilenumbruch", () => {
    expect(variablenJson({ a: 1 })).toBe('{\n  "a": 1\n}\n');
  });
});

describe("Sicherheitsrand", () => {
  it("folgt den Startwerten des Bauplans: unten und rechts rund 20 Prozent", () => {
    expect(SICHERHEITSRAND.unten).toBe(0.2);
    expect(SICHERHEITSRAND.rechts).toBe(0.2);
  });
});
