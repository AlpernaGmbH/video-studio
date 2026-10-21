import { describe, expect, it } from "vitest";
import { ordneTonZu, parseVersatzOption } from "./ton-ablauf";
import type { Versatz } from "./ton-sync";

const v = (versatz: number, wert: number): Versatz => ({ versatz, wert, sicherheit: wert >= 0.75 ? "hoch" : wert >= 0.55 ? "mittel" : "niedrig", ueberlappung: 1 });
const videos = [{ id: "clip-1", datei: "/m/clip-1.mov" }, { id: "clip-2", datei: "/m/clip-2.mov" }];
const toene = [{ id: "zoom-1", datei: "/m/zoom-1.wav" }];

describe("parseVersatzOption", () => {
  it("eine Zahl gilt für das einzige Video", () => {
    expect([...parseVersatzOption("5.5", ["clip-1"])]).toEqual([["clip-1", { versatz: 5.5 }]]);
    expect([...parseVersatzOption("-2", ["clip-1"])]).toEqual([["clip-1", { versatz: -2 }]]);
  });

  it("eine Zahl ohne Videoquelle ist bei mehreren Videos ein Fehler mit der fertigen Schreibweise", () => {
    expect(() => parseVersatzOption("5.5", ["clip-1", "clip-2"])).toThrow(/clip-1=5\.5/);
  });

  it("liest mehrere Videos und die Aufnahme", () => {
    const m = parseVersatzOption("clip-1=5.5;clip-2=-2:zoom-1", ["clip-1", "clip-2"]);
    expect(m.get("clip-1")).toEqual({ versatz: 5.5 });
    expect(m.get("clip-2")).toEqual({ versatz: -2, ton: "zoom-1" });
  });

  it("verweigert Unlesbares, Kommazahlen und unbekannte Videos", () => {
    expect(() => parseVersatzOption("fünf", ["clip-1"])).toThrow(/nicht lesbar/);
    expect(() => parseVersatzOption("5,5", ["clip-1"])).toThrow(/Dezimalpunkt/);
    expect(() => parseVersatzOption("clip-9=1", ["clip-1"])).toThrow(/keine Videoquelle/);
    expect(() => parseVersatzOption(" ; ", ["clip-1"])).toThrow(/leer/);
  });
});

describe("ordneTonZu", () => {
  it("ohne Tonaufnahmen gibt es nichts zu tun und keine Messung", async () => {
    let gemessen = 0;
    const r = await ordneTonZu({ videos, toene: [], messe: async () => (gemessen++, v(1, 1)) });
    expect(r.paare.size).toBe(0);
    expect(gemessen).toBe(0);
  });

  it("legt gemessene Paare mit Versatz und Sicherheit fest und meldet sie", async () => {
    const r = await ordneTonZu({ videos, toene, messe: async (vi) => (vi.includes("clip-1") ? v(5.37, 0.93) : v(65.1, 0.88)) });
    expect(r.paare.get("clip-1")).toEqual({ ton: "zoom-1", versatz: 5.37, herkunft: "messung", sicherheit: "hoch", wert: 0.93 });
    expect(r.paare.get("clip-2")!.versatz).toBe(65.1);
    expect(r.meldungen[0]).toBe("Ton: clip-1 ← zoom-1, Versatz +5,37 s (gemessen, Sicherheit hoch, Übereinstimmung 0,93)");
  });

  it("ein unsicherer Treffer wird nicht benutzt und mit dem Weg zur Handeingabe gemeldet", async () => {
    const r = await ordneTonZu({ videos: [videos[0]!], toene, messe: async () => v(3, 0.3) });
    expect(r.paare.size).toBe(0);
    expect(r.meldungen.join("\n")).toContain("Ton unsicher, nicht benutzt: clip-1");
    expect(r.meldungen.join("\n")).toContain("--versatz clip-1=<Sekunden>");
  });

  it("ein Video ohne messbaren Ton wird gemeldet, mit dem Weg zur Handeingabe", async () => {
    const r = await ordneTonZu({ videos: [videos[0]!], toene, messe: async () => undefined });
    expect(r.paare.size).toBe(0);
    expect(r.meldungen.join("\n")).toContain("Kein Ton gefunden für clip-1");
    expect(r.meldungen.join("\n")).toContain("--versatz clip-1=<Sekunden>");
  });

  it("ein von Hand angegebener Versatz gilt vor der Messung und wird nicht gemessen", async () => {
    const gemessen: string[] = [];
    const r = await ordneTonZu({ videos, toene, manuell: new Map([["clip-1", { versatz: 7 }]]), messe: async (vi) => (gemessen.push(vi), v(65, 0.9)) });
    expect(r.paare.get("clip-1")).toEqual({ ton: "zoom-1", versatz: 7, herkunft: "hand" });
    expect(gemessen).toEqual(["/m/clip-2.mov"]);
  });

  it("bei mehreren Aufnahmen verlangt die Handeingabe die Aufnahme", async () => {
    const zwei = [...toene, { id: "zoom-2", datei: "/m/zoom-2.wav" }];
    await expect(ordneTonZu({ videos, toene: zwei, manuell: new Map([["clip-1", { versatz: 7 }]]), messe: async () => undefined })).rejects.toThrow(/clip-1=7:<aufnahme>/);
    const r = await ordneTonZu({ videos: [videos[0]!], toene: zwei, manuell: new Map([["clip-1", { versatz: 7, ton: "zoom-2" }]]), messe: async () => undefined });
    expect(r.paare.get("clip-1")!.ton).toBe("zoom-2");
    await expect(ordneTonZu({ videos, toene: zwei, manuell: new Map([["clip-1", { versatz: 7, ton: "gibt-es-nicht" }]]) })).rejects.toThrow(/gibt es nicht/);
  });

  it("meldet eine Aufnahme, die zu keinem Video gehört", async () => {
    const zwei = [...toene, { id: "zoom-2", datei: "/m/zoom-2.wav" }];
    const r = await ordneTonZu({ videos: [videos[0]!], toene: zwei, messe: async (_vi, t) => (t.includes("zoom-1") ? v(2, 0.9) : v(0, 0.2)) });
    expect(r.paare.get("clip-1")!.ton).toBe("zoom-1");
    expect(r.meldungen.join("\n")).toContain("Die Tonaufnahme zoom-2 gehört zu keinem Video");
  });

  it("ein Versatz für ein Video, das es nicht mehr gibt, wird gemeldet und ignoriert", async () => {
    const r = await ordneTonZu({ videos: [videos[0]!], toene, manuell: new Map([["weg", { versatz: 1 }]]), messe: async () => v(2, 0.9) });
    expect(r.paare.has("weg")).toBe(false);
    expect(r.meldungen.join("\n")).toContain("«weg» ignoriert");
  });
});
