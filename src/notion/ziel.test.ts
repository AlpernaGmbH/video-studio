import path from "node:path";
import { describe, expect, it } from "vitest";
import { ladeNotionZiel } from "./ziel";

const wurzel = path.resolve(import.meta.dirname, "..", "..");

describe("notion.json", () => {
  it("ist gültig und kennt alle Datenbanken des Marketing Systems", () => {
    const z = ladeNotionZiel(wurzel);
    expect(Object.keys(z).filter((k) => typeof z[k as keyof typeof z] === "object").sort()).toEqual(["inhalte", "inspiration", "marken", "motionIdeen", "rohstoffe"]);
  });

  it("jede Datenbank hat eine eigene Kennung, Datenquelle und Ansicht: eine Verwechslung würde in die falsche Tabelle schreiben", () => {
    const z = ladeNotionZiel(wurzel);
    const dbs = [z.motionIdeen, z.marken, z.inhalte, z.rohstoffe, z.inspiration];
    for (const feld of ["datenbank", "datenquelle", "ansicht"] as const) {
      expect(new Set(dbs.map((d) => d[feld])).size, feld).toBe(dbs.length);
    }
  });

  it("verlangt Rohstoffe und Inspiration: Ein altes notion.json ohne sie gilt als ungültig, mit klarer Meldung", () => {
    const fs = require("node:fs") as typeof import("node:fs");
    const os = require("node:os") as typeof import("node:os");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-ziel-"));
    try {
      const alt = JSON.parse(fs.readFileSync(path.join(wurzel, "notion.json"), "utf8"));
      delete alt.rohstoffe;
      fs.writeFileSync(path.join(dir, "notion.json"), JSON.stringify(alt));
      expect(() => ladeNotionZiel(dir)).toThrow(/rohstoffe/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
