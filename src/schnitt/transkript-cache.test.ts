import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cacheDatei, fingerabdruck } from "./transkript-cache";

describe("fingerabdruck", () => {
  let dir: string;
  beforeEach(() => void (dir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-fp-"))));
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
  const schreibe = (name: string, inhalt: Buffer): string => {
    const p = path.join(dir, name);
    fs.writeFileSync(p, inhalt);
    return p;
  };

  it("gleicher Inhalt gibt denselben Fingerabdruck, auch bei neuer Änderungszeit und anderem Namen", () => {
    const a = schreibe("a.mp4", Buffer.alloc(1000, 5));
    const b = schreibe("b.mp4", Buffer.alloc(1000, 5));
    const spaeter = new Date(Date.now() + 100_000);
    fs.utimesSync(b, spaeter, spaeter);
    expect(fingerabdruck(a)).toBe(fingerabdruck(b));
  });

  it("anderer Inhalt, andere Länge, geänderter Anfang oder geändertes Ende geben einen anderen", () => {
    const basis = Buffer.alloc(6 * 1024 * 1024, 1);
    const fp = fingerabdruck(schreibe("x.bin", basis));
    expect(fingerabdruck(schreibe("lang.bin", Buffer.concat([basis, Buffer.alloc(1, 1)])))).not.toBe(fp);
    const anfang = Buffer.from(basis);
    anfang[10] = 9;
    expect(fingerabdruck(schreibe("anfang.bin", anfang))).not.toBe(fp);
    const ende = Buffer.from(basis);
    ende[ende.length - 10] = 9;
    expect(fingerabdruck(schreibe("ende.bin", ende))).not.toBe(fp);
  });

  it("liest bei grossen Dateien nur Anfang und Ende: Eine Änderung in der Mitte fällt nicht auf (bekannte Grenze)", () => {
    const basis = Buffer.alloc(8 * 1024 * 1024, 1);
    const mitte = Buffer.from(basis);
    mitte[4 * 1024 * 1024] = 9;
    expect(fingerabdruck(schreibe("m.bin", mitte))).toBe(fingerabdruck(schreibe("o.bin", basis)));
  });

  it("kleine Dateien (unter 2 MB) und leere Dateien gehen, Dateien knapp über 2 MB lesen auch den Rest", () => {
    expect(fingerabdruck(schreibe("leer.bin", Buffer.alloc(0)))).toMatch(/^0-/);
    const knapp = Buffer.alloc(2 * 1024 * 1024 + 100, 1);
    const anders = Buffer.from(knapp);
    anders[knapp.length - 1] = 9;
    expect(fingerabdruck(schreibe("k1.bin", knapp))).not.toBe(fingerabdruck(schreibe("k2.bin", anders)));
  });
});

describe("cacheDatei", () => {
  it("der Name trägt Fingerabdruck, Modell und Sprache; Sonderzeichen im Modell werden ersetzt", () => {
    expect(cacheDatei("/c", { fp: "100-abc", modell: "large-v3", sprache: "de" })).toBe("/c/100-abc-large-v3-de.json");
    expect(cacheDatei("/c", { fp: "100-abc", modell: "../x y", sprache: "de" })).toBe("/c/100-abc-.._x_y-de.json");
  });
});
