import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { BildUrteile } from "./motion/render-pruefung";
import { Looks, Pitch, PruefRunde } from "./motion/idee";
import { Signal } from "./motion/signale";

/** Die Beispiele in prompts/beispiele/ sind das, was Claude abschreibt. Sie müssen gegen die Schemas gültig bleiben. */
const lies = (datei: string): unknown => JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../prompts/beispiele", datei), "utf8"));

describe("prompts/beispiele", () => {
  it("extra-signale.json", () => expect(z.record(z.array(Signal)).safeParse(lies("extra-signale.json")).success).toBe(true));
  it("pitch.json", () => expect(z.object({ pitch: Pitch }).safeParse(lies("pitch.json")).success).toBe(true));
  it("looks.json", () => expect(z.object({ looks: Looks }).safeParse(lies("looks.json")).success).toBe(true));
  it("bildurteil.json", () => expect(BildUrteile.safeParse(lies("bildurteil.json")).success).toBe(true));
  it("pruefrunde.json", () => expect(PruefRunde.omit({ runde: true }).safeParse(lies("pruefrunde.json")).success).toBe(true));
});
