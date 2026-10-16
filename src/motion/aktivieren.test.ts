import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JETZT, MENSCH, SYSTEM, stueckZahl } from "../testing/fixtures";
import { aktiviere, AktivierungsFehler, setzeStatus } from "./aktivieren";
import { setzeDeklaration } from "./bibliothek";
import { erzeugeDeklaration, type Stueck } from "./stueck";

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-akt-"));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

function legeAn(s: Stueck, kaputtesHtml = false) {
  const dir = path.join(root, s.id);
  fs.mkdirSync(path.join(dir, "vorschau"), { recursive: true });
  fs.writeFileSync(path.join(dir, "vorschau", "a.png"), "png");
  fs.writeFileSync(path.join(dir, "piece.json"), JSON.stringify(s, null, 2));
  const html = `<html lang="de"><head><link rel="stylesheet" href="assets/brand.css"><script src="assets/vendor/gsap.min.js"></script><style>body{background:transparent}</style></head><body><div data-composition-id="${s.id}" data-width="1080" data-height="1920"></div><script>var v = window.__hyperframes.getVariables(); var d = Number(v.dauer);</script></body></html>`;
  fs.writeFileSync(path.join(dir, "index.html"), kaputtesHtml ? html : setzeDeklaration(html, erzeugeDeklaration(s)));
  return dir;
}
const lies = (id: string) => JSON.parse(fs.readFileSync(path.join(root, id, "piece.json"), "utf8")) as Stueck;
const geprueft = () => stueckZahl({ status: "geprueft", freigabe: undefined });

describe("aktiviere", () => {
  it("nimmt ein geprüftes Stück auf und hält Freigabe von wem und wann fest", () => {
    legeAn(geprueft());
    const neu = aktiviere(root, "zahl-zaehler", MENSCH, JETZT);
    expect(neu.status).toBe("aktiv");
    expect(lies("zahl-zaehler")).toMatchObject({ status: "aktiv", freigabe: { wer: "Andrej", wann: JETZT } });
  });

  it("das System darf nicht aktivieren, und die Datei bleibt unverändert", () => {
    legeAn(geprueft());
    const vorher = fs.readFileSync(path.join(root, "zahl-zaehler", "piece.json"), "utf8");
    expect(() => aktiviere(root, "zahl-zaehler", SYSTEM, JETZT)).toThrow(AktivierungsFehler);
    expect(() => aktiviere(root, "zahl-zaehler", { typ: "mensch", name: "Claude" }, JETZT)).toThrow(/nur ein Mensch/);
    expect(fs.readFileSync(path.join(root, "zahl-zaehler", "piece.json"), "utf8")).toBe(vorher);
  });

  it.each(["entwurf", "gebaut"] as const)("ein Stück im Status «%s» lässt sich nicht aktivieren", (status) => {
    legeAn(stueckZahl({ status, freigabe: undefined, einsatz: undefined }));
    expect(() => aktiviere(root, "zahl-zaehler", MENSCH, JETZT)).toThrow(/Aktiviert wird nur ein geprüftes Stück/);
  });

  it("ein Stück, das den Lint nicht besteht, bleibt draussen", () => {
    legeAn(geprueft(), true);
    expect(() => aktiviere(root, "zahl-zaehler", MENSCH, JETZT)).toThrow(/besteht den Lint nicht/);
    expect(lies("zahl-zaehler").status).toBe("geprueft");
  });

  it("ein unbekanntes oder ungültiges Stück wird mit Grund gemeldet", () => {
    expect(() => aktiviere(root, "gibt-es-nicht", MENSCH, JETZT)).toThrow(/nicht gefunden/);
  });
});

describe("setzeStatus", () => {
  it("hebt «gebaut» auf «geprueft» an, nicht darüber", () => {
    legeAn(stueckZahl({ status: "gebaut", freigabe: undefined }));
    expect(setzeStatus(root, "zahl-zaehler", "geprueft").status).toBe("geprueft");
    expect(lies("zahl-zaehler").status).toBe("geprueft");
  });

  it("stuft nicht zurück", () => {
    legeAn(stueckZahl());
    expect(() => setzeStatus(root, "zahl-zaehler", "geprueft")).toThrow(/Rückstufen/);
  });

  it("ohne Einsatzangaben gibt es kein «geprueft»", () => {
    legeAn(stueckZahl({ status: "gebaut", freigabe: undefined, einsatz: undefined }));
    expect(() => setzeStatus(root, "zahl-zaehler", "geprueft")).toThrow();
    expect(lies("zahl-zaehler").status).toBe("gebaut");
  });
});
