import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Ereignis } from "../core/schemas";
import { entwurf, ideeNeu, JETZT, looks, MENSCH, pitch, SPAETER, SYSTEM } from "../testing/fixtures";
import { FamilienFehler, FamilienListe, ladeFamilien, lookBriefText, stueckFamilieAus, type FamilienLook, type FamilienStand } from "./familie";
import { Idee, weiter, type IdeeStatus, type WeiterKontext } from "./idee";
import { Ideenprotokoll, ProtokollFehler } from "./protokoll";

const ctx = (over: Partial<WeiterKontext> = {}): WeiterKontext => ({ akteur: SYSTEM, jetzt: JETZT, ...over });
const mensch = (over: Partial<WeiterKontext> = {}) => ctx({ akteur: MENSCH, ...over });
const geht = (r: ReturnType<typeof weiter>): Idee => {
  if (!r.ok) throw new Error(`Übergang gescheitert: ${r.fehler.join("; ")}`);
  return r.idee;
};

/** Eine Idee mit Familie «mockups», bis zum gewünschten Status geführt (Looks nur, wenn der Stand der Familie sie braucht). */
function familienIdee(bisStatus: IdeeStatus, id = "m-001"): Idee {
  let i = Idee.parse({ ...ideeNeu(id), familie: "mockups" });
  if (bisStatus === "idee") return i;
  i = geht(weiter(i, "pitch", ctx({ daten: { pitch: pitch() } })));
  if (bisStatus === "pitch") return i;
  i = geht(weiter(i, "freigegeben", mensch()));
  if (bisStatus === "freigegeben") return i;
  i = geht(weiter(i, "looks", ctx({ daten: { looks: looks() } })));
  if (bisStatus === "looks") return i;
  return geht(weiter(i, "look_gewaehlt", mensch({ daten: { gewaehlt: "b" } })));
}

const familienLook = (over: Partial<FamilienLook> = {}): FamilienLook => ({
  vonIdee: "m-001",
  runde: 1,
  briefs: looks().briefs,
  bilder: looks().bilder,
  gewaehlt: "b",
  von: "Andrej",
  am: JETZT,
  fassung: 1,
  notizen: [],
  ...over,
});
const stand = (over: Partial<FamilienStand> = {}): FamilienStand => ({ frueher: [], ...over });

describe("Liste der Familien", () => {
  let dir: string;
  beforeEach(() => (dir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-fam-"))));
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
  const schreibe = (inhalt: unknown) => fs.writeFileSync(path.join(dir, "_familien.json"), typeof inhalt === "string" ? inhalt : JSON.stringify(inhalt));
  const definition = { id: "mockups", name: "Handy-Mockups", beschreibung: "Ein Handy zeigt eine Seite, ein Wert oder ein Text." };

  it("ohne Datei gibt es keine Familie", () => {
    expect(ladeFamilien(dir)).toEqual([]);
  });

  it("liest die geschlossene Liste", () => {
    schreibe({ schema: 1, familien: [definition, { id: "rankings", name: "Rankings", beschreibung: "Eine Rangliste baut sich Platz für Platz auf." }] });
    expect(ladeFamilien(dir).map((f) => f.id)).toEqual(["mockups", "rankings"]);
  });

  it("weist doppelte Schlüssel, falsche Schlüssel und kaputtes JSON mit Grund ab", () => {
    schreibe({ schema: 1, familien: [definition, definition] });
    expect(() => ladeFamilien(dir)).toThrow(/doppelt/);
    schreibe({ schema: 1, familien: [{ ...definition, id: "Handy Mockups" }] });
    expect(() => ladeFamilien(dir)).toThrow(FamilienFehler);
    schreibe("{nope");
    expect(() => ladeFamilien(dir)).toThrow(/kein gültiges JSON/);
    expect(FamilienListe.safeParse({ schema: 1, familien: [] }).success).toBe(false);
  });

  it("die echte Liste des Repos ist gültig", () => {
    const echt = ladeFamilien(path.join(__dirname, "..", "..", "library", "motion"));
    expect(echt.map((f) => f.id)).toContain("mockups");
  });
});

describe("Familien-Look im Zustandsautomaten (rein)", () => {
  it("eine Idee mit Familie ohne Look zeigt wie bisher drei Looks, und ein Mensch wählt", () => {
    const i = familienIdee("look_gewaehlt");
    expect(i.looks?.gewaehlt).toBe("b");
    expect(i.looks?.erbe).toBeUndefined();
  });

  it("hat die Familie schon einen Look, erbt die Idee ihn: auch das System darf, und von und am bleiben die des Menschen", () => {
    const frei = familienIdee("freigegeben", "m-002");
    const k = ctx({ jetzt: SPAETER, familie: { stand: stand({ look: familienLook({ von: "Leander", am: JETZT, fassung: 3, vonIdee: "m-001" }) }) } });
    const i = geht(weiter(frei, "look_gewaehlt", k));
    expect(i.status).toBe("look_gewaehlt");
    expect(i.looks).toMatchObject({ gewaehlt: "b", erbe: { familie: "mockups", vonIdee: "m-001", von: "Leander", am: JETZT, fassung: 3 } });
    expect(i.looks?.briefs).toHaveLength(3);
    expect(i.verlauf.at(-1)).toMatchObject({ von: "freigegeben", nach: "look_gewaehlt", wer: SYSTEM, wann: SPAETER });
  });

  it("ohne Familien-Look gibt es nichts zu erben", () => {
    const frei = familienIdee("freigegeben");
    for (const familie of [undefined, { stand: stand() }, { stand: stand({ offeneRunde: { idee: "m-009", runde: 1 } }) }]) {
      const r = weiter(frei, "look_gewaehlt", mensch({ familie }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.fehler.join(" ")).toContain("noch keinen gewählten Look");
    }
  });

  it("ein Look, den ein System gesetzt hätte, wird nicht übernommen", () => {
    const frei = familienIdee("freigegeben");
    for (const von of ["claude", "System", "bot"]) {
      const r = weiter(frei, "look_gewaehlt", mensch({ familie: { stand: stand({ look: familienLook({ von }) }) } }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.fehler.join(" ")).toContain("nicht von einem Menschen");
    }
  });

  it("eine Idee ohne Familie kann nie von «freigegeben» nach «look_gewaehlt»", () => {
    const frei = geht(weiter(geht(weiter(ideeNeu(), "pitch", ctx({ daten: { pitch: pitch() } }))), "freigegeben", mensch()));
    const r = weiter(frei, "look_gewaehlt", mensch({ familie: { stand: stand({ look: familienLook() }) }, daten: { gewaehlt: "a" } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fehler[0]).toContain("nicht vorgesehen");
  });

  it("hat die Familie einen Look, zeigt die Idee keine zweite Runde", () => {
    const r = weiter(familienIdee("freigegeben", "m-002"), "looks", ctx({ daten: { looks: looks() }, familie: { stand: stand({ look: familienLook() }) } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fehler.join(" ")).toContain("übernimmt ihn");
  });

  it("läuft die Runde der Familie in einer anderen Idee, wartet diese; die eigene Runde darf fortgesetzt werden", () => {
    const fremd = weiter(familienIdee("freigegeben", "m-002"), "looks", ctx({ daten: { looks: looks() }, familie: { stand: stand({ offeneRunde: { idee: "m-001", runde: 1 } }) } }));
    expect(fremd.ok).toBe(false);
    if (!fremd.ok) expect(fremd.fehler.join(" ")).toContain("wartet auf die Look-Wahl in m-001");

    const eigen = weiter(familienIdee("freigegeben", "m-001"), "looks", ctx({ daten: { looks: looks() }, familie: { stand: stand({ offeneRunde: { idee: "m-001", runde: 1 } }) } }));
    expect(eigen.ok).toBe(true);
  });

  it("eine Familie, die nicht in der Liste steht, blockiert beides", () => {
    const frei = familienIdee("freigegeben");
    for (const nach of ["looks", "look_gewaehlt"] as const) {
      const r = weiter(frei, nach, mensch({ daten: { looks: looks() }, familie: { bekannt: false, stand: stand({ look: familienLook() }) } }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.fehler.join(" ")).toContain("_familien.json");
    }
  });

  it("eine Runde kann keinen geerbten Look mitbringen", () => {
    const r = weiter(familienIdee("freigegeben"), "looks", ctx({ daten: { looks: { ...looks(), gewaehlt: "a", erbe: { familie: "mockups", vonIdee: "m-009", von: "Andrej", am: JETZT, fassung: 1 } } } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fehler.join(" ")).toContain("geerbter Look entsteht nur");
  });

  it("gebaut wird nur ein Stück, das die Familie und die geerbte Fassung des Looks trägt", () => {
    const frei = familienIdee("freigegeben", "m-002");
    const geerbt = geht(weiter(frei, "look_gewaehlt", ctx({ familie: { stand: stand({ look: familienLook({ fassung: 2 }) }) } })));
    const bau = (stueckFamilie?: { id?: string; fassung?: number }) => weiter(geerbt, "in_bau", ctx({ daten: { stueck: "mockup-b" }, stueckFamilie }));
    expect(bau({ id: "mockups", fassung: 2 }).ok).toBe(true);
    expect(bau(undefined).ok).toBe(true); // das Stück liegt noch nicht in der Bibliothek: der Aufrufer weiss nichts
    const andereFamilie = bau({ id: "rankings", fassung: 2 });
    expect(andereFamilie.ok).toBe(false);
    if (!andereFamilie.ok) expect(andereFamilie.fehler.join(" ")).toContain("trägt nicht den Look der Familie «mockups»");
    expect(bau({ fassung: 2 }).ok).toBe(false); // Stück ohne Familie
    const alteFassung = bau({ id: "mockups", fassung: 1 });
    expect(alteFassung.ok).toBe(false);
    if (!alteFassung.ok) expect(alteFassung.fehler.join(" ")).toContain("Fassung 1 des Looks, die Idee hat Fassung 2 geerbt");
    // Eine Idee ohne Familie ist davon nicht betroffen
    const ohne = geht(weiter(geht(weiter(geht(weiter(geht(weiter(ideeNeu(), "pitch", ctx({ daten: { pitch: pitch() } }))), "freigegeben", mensch())), "looks", ctx({ daten: { looks: looks() } }))), "look_gewaehlt", mensch({ daten: { gewaehlt: "a" } })));
    expect(weiter(ohne, "in_bau", ctx({ daten: { stueck: "x-y" }, stueckFamilie: { id: undefined } })).ok).toBe(true);
  });

  it("das Schema lässt keinen geerbten Look von einem Systemnamen, ohne Wahl oder aus einer anderen Familie zu", () => {
    const erbe = { familie: "mockups", vonIdee: "m-001", von: "Andrej", am: JETZT, fassung: 1 };
    const i = familienIdee("look_gewaehlt");
    const mit = (looksTeil: Record<string, unknown>, familie = "mockups") => Idee.safeParse({ ...i, familie, looks: { ...i.looks, ...looksTeil } });
    expect(mit({ erbe }).success).toBe(true);
    expect(mit({ erbe: { ...erbe, von: "claude" } }).success).toBe(false);
    expect(mit({ erbe, gewaehlt: undefined }).success).toBe(false);
    expect(mit({ erbe }, "rankings").success).toBe(false);
  });
});

describe("Familien-Look im Ideenprotokoll", () => {
  let dir: string;
  let pr: Ideenprotokoll;
  const datei = () => path.join(dir, "ideen.json");
  const lernsignale = () =>
    fs
      .readFileSync(path.join(dir, "e.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((l) => Ereignis.parse(JSON.parse(l)))
      .filter((e) => e.art === "look-gewaehlt");

  /** Legt eine Idee der Familie an und führt sie bis «freigegeben». */
  function freigegeben(familie = "mockups"): string {
    const i = pr.neu(entwurf({ familie }), SYSTEM, JETZT);
    pr.weiter(i.id, "pitch", SYSTEM, JETZT, { daten: { pitch: pitch() } });
    pr.weiter(i.id, "freigegeben", MENSCH, JETZT);
    return i.id;
  }

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-famproto-"));
    pr = new Ideenprotokoll(datei(), path.join(dir, "e.jsonl"), ["mockups", "rankings"]);
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("eine unbekannte Familie legt keine Idee an: ein Tippfehler macht keine neue Familie", () => {
    expect(() => pr.neu(entwurf({ familie: "mokups" }), SYSTEM, JETZT)).toThrow(ProtokollFehler);
    expect(() => pr.neu(entwurf({ familie: "mokups" }), SYSTEM, JETZT)).toThrow(/mockups, rankings/);
    expect(pr.lade().ideen).toEqual([]);
    expect(pr.neu(entwurf({ familie: "rankings" }), SYSTEM, JETZT).familie).toBe("rankings");
    expect(new Ideenprotokoll(path.join(dir, "ohne-liste.json")).neu(entwurf({ familie: "egal" }), SYSTEM, JETZT).familie).toBe("egal");
  });

  it("die Familie lässt sich nur im Status «idee» zuordnen", () => {
    const i = pr.neu(entwurf(), SYSTEM, JETZT);
    expect(pr.bearbeite(i.id, { familie: "mockups" }, SYSTEM, JETZT).familie).toBe("mockups");
    expect(() => pr.bearbeite(i.id, { familie: "mokups" }, SYSTEM, JETZT)).toThrow(/unbekannt/);
    pr.weiter(i.id, "pitch", SYSTEM, JETZT, { daten: { pitch: pitch() } });
    expect(() => pr.bearbeite(i.id, { familie: "rankings" }, SYSTEM, JETZT)).toThrow(/nur im Status/);
  });

  it("eine Runde je Familie: die zweite Idee wartet, wählt ein Mensch, erbt sie den Look, ohne zweite Wahl", () => {
    const a = freigegeben();
    const b = freigegeben();
    pr.weiter(a, "looks", SYSTEM, JETZT, { daten: { looks: looks() } });
    expect(pr.familien()["mockups"]?.offeneRunde).toEqual({ idee: a, runde: 1 });

    expect(() => pr.weiter(b, "looks", SYSTEM, JETZT, { daten: { looks: looks() } })).toThrow(/wartet auf die Look-Wahl in m-001/);
    expect(() => pr.weiter(b, "look_gewaehlt", SYSTEM, JETZT)).toThrow(/noch keinen gewählten Look/);
    expect(pr.wartetAuf(pr.holen(b))).toBe(a);
    expect(pr.wartetAuf(pr.holen(a))).toBeUndefined();

    pr.weiter(a, "look_gewaehlt", { typ: "mensch", name: "Leander" }, SPAETER, { daten: { gewaehlt: "c", notizen: ["Mehr Weissraum"] } });
    const fam = pr.familien()["mockups"]!;
    expect(fam.offeneRunde).toBeUndefined();
    expect(fam.look).toMatchObject({ vonIdee: a, gewaehlt: "c", von: "Leander", am: SPAETER, fassung: 1, notizen: ["Mehr Weissraum"] });
    expect(pr.wartetAuf(pr.holen(b))).toBeUndefined();

    const geerbt = pr.weiter(b, "look_gewaehlt", SYSTEM, SPAETER);
    expect(geerbt.looks).toMatchObject({ gewaehlt: "c", erbe: { familie: "mockups", vonIdee: a, von: "Leander", am: SPAETER, fassung: 1 } });
    // Das Erben ist kein Lernsignal: Nur die Wahl des Menschen zählt, und die zählt einmal.
    expect(lernsignale()).toHaveLength(1);
    expect(lernsignale()[0]).toMatchObject({ detail: { idee: a, gewaehlt: "c" }, wer: { typ: "mensch", name: "Leander" } });
    // Eine dritte Idee derselben Familie erbt ebenfalls und zeigt keine zweite Runde.
    const c = freigegeben();
    expect(() => pr.weiter(c, "looks", SYSTEM, SPAETER, { daten: { looks: looks() } })).toThrow(/übernimmt ihn/);
    expect(pr.weiter(c, "look_gewaehlt", SYSTEM, SPAETER).looks?.erbe?.vonIdee).toBe(a);
  });

  it("Familien sind unabhängig: eine Runde in «mockups» hält «rankings» nicht auf", () => {
    const a = freigegeben("mockups");
    const r = freigegeben("rankings");
    pr.weiter(a, "looks", SYSTEM, JETZT, { daten: { looks: looks() } });
    expect(() => pr.weiter(r, "looks", SYSTEM, JETZT, { daten: { looks: looks() } })).not.toThrow();
    expect(Object.keys(pr.familien()).sort()).toEqual(["mockups", "rankings"]);
  });

  it("«keiner passt» behält die Runde bei der Idee: Runde 2 ist ihre, andere warten weiter", () => {
    const a = freigegeben();
    const b = freigegeben();
    pr.weiter(a, "looks", SYSTEM, JETZT, { daten: { looks: looks(1) } });
    pr.weiter(a, "freigegeben", MENSCH, JETZT, { grund: "Alle drei zu laut" });
    expect(pr.familien()["mockups"]?.offeneRunde).toEqual({ idee: a, runde: 1 });
    expect(() => pr.weiter(b, "looks", SYSTEM, JETZT, { daten: { looks: looks(1) } })).toThrow(/wartet auf/);
    pr.weiter(a, "looks", SYSTEM, JETZT, { daten: { looks: looks(2) } });
    expect(pr.familien()["mockups"]?.offeneRunde).toEqual({ idee: a, runde: 2 });
  });

  it("wird die Idee mit der offenen Runde abgelehnt, wird die Runde frei", () => {
    const a = freigegeben();
    const b = freigegeben();
    pr.weiter(a, "looks", SYSTEM, JETZT, { daten: { looks: looks() } });
    pr.weiter(a, "abgelehnt", MENSCH, JETZT, { grund: "Wird doch nicht gebraucht" });
    expect(pr.familien()["mockups"]?.offeneRunde).toBeUndefined();
    expect(pr.wartetAuf(pr.holen(b))).toBeUndefined();
    expect(() => pr.weiter(b, "looks", SYSTEM, JETZT, { daten: { looks: looks() } })).not.toThrow();
  });

  it("die Ablehnung einer anderen Idee der Familie lässt die Runde stehen", () => {
    const a = freigegeben();
    const b = freigegeben();
    pr.weiter(a, "looks", SYSTEM, JETZT, { daten: { looks: looks() } });
    pr.weiter(b, "abgelehnt", MENSCH, JETZT, { grund: "Doppelt vorhanden mit m-001" });
    expect(pr.familien()["mockups"]?.offeneRunde).toEqual({ idee: a, runde: 1 });
  });

  it("ein Mensch kann den Look der Familie verwerfen: neue Runde, neue Fassung, alte Stücke behalten ihren Look", () => {
    const a = freigegeben();
    pr.weiter(a, "looks", SYSTEM, JETZT, { daten: { looks: looks() } });
    pr.weiter(a, "look_gewaehlt", MENSCH, JETZT, { daten: { gewaehlt: "a" } });
    const b = freigegeben();
    pr.weiter(b, "look_gewaehlt", SYSTEM, JETZT);
    const c = freigegeben();

    expect(() => pr.familieZuruecksetzen("mockups", SYSTEM, SPAETER, "Der Look wirkt zu laut")).toThrow(/nur von einem Menschen/);
    expect(() => pr.familieZuruecksetzen("mockups", { typ: "mensch", name: "claude" }, SPAETER, "Der Look wirkt zu laut")).toThrow(/nur von einem Menschen/);
    expect(() => pr.familieZuruecksetzen("mockups", MENSCH, SPAETER, "zu laut")).toThrow(/mindestens zwei Wörtern/);
    expect(() => pr.familieZuruecksetzen("rankings", MENSCH, SPAETER, "Der Look wirkt zu laut")).toThrow(/keinen gewählten Look/);
    expect(() => pr.familieZuruecksetzen("mokups", MENSCH, SPAETER, "Der Look wirkt zu laut")).toThrow(/unbekannt/);

    pr.familieZuruecksetzen("mockups", MENSCH, SPAETER, "Der Look wirkt zu laut");
    const fam = pr.familien()["mockups"]!;
    expect(fam.look).toBeUndefined();
    expect(fam.frueher).toHaveLength(1);
    expect(fam.frueher[0]?.notizen.at(-1)).toContain("Der Look wirkt zu laut");
    expect(pr.holen(b).looks?.erbe?.fassung).toBe(1);

    // c zeigt jetzt die neue Runde; seine Wahl ist Fassung 2
    pr.weiter(c, "looks", SYSTEM, SPAETER, { daten: { looks: looks() } });
    expect(() => pr.familieZuruecksetzen("mockups", MENSCH, SPAETER, "Noch einmal verwerfen")).toThrow(/keinen gewählten Look/);
    pr.weiter(c, "look_gewaehlt", MENSCH, SPAETER, { daten: { gewaehlt: "c" } });
    expect(pr.familien()["mockups"]?.look).toMatchObject({ fassung: 2, gewaehlt: "c", vonIdee: c });
    expect(pr.holen(b).looks?.erbe?.fassung).toBe(1);
  });

  it("während einer Runde gibt es keinen Look, den man verwerfen könnte, und das Verwerfen ändert die Runde nicht", () => {
    const a = freigegeben();
    pr.weiter(a, "looks", SYSTEM, JETZT, { daten: { looks: looks() } });
    pr.weiter(a, "look_gewaehlt", MENSCH, JETZT, { daten: { gewaehlt: "a" } });
    const b = freigegeben();
    pr.familieZuruecksetzen("mockups", MENSCH, SPAETER, "Der Look wirkt zu laut");
    pr.weiter(b, "looks", SYSTEM, SPAETER, { daten: { looks: looks() } });
    expect(() => pr.familieZuruecksetzen("mockups", MENSCH, SPAETER, "Noch einmal verwerfen")).toThrow(ProtokollFehler);
    expect(pr.familien()["mockups"]?.offeneRunde).toEqual({ idee: b, runde: 1 });
  });

  describe("Datei", () => {
    it("bleibt Schema 1, solange keine Familie einen Stand hat, und wird Schema 2 mit dem ersten Stand", () => {
      const a = freigegeben();
      expect(JSON.parse(fs.readFileSync(datei(), "utf8"))).toMatchObject({ schema: 1 });
      expect(JSON.parse(fs.readFileSync(datei(), "utf8"))).not.toHaveProperty("familien");
      pr.weiter(a, "looks", SYSTEM, JETZT, { daten: { looks: looks() } });
      expect(JSON.parse(fs.readFileSync(datei(), "utf8"))).toMatchObject({ schema: 2, familien: { mockups: { offeneRunde: { idee: a } } } });
    });

    it("Speichern ohne Angabe zu den Familien lässt ihren Stand unverändert", () => {
      const a = freigegeben();
      pr.weiter(a, "looks", SYSTEM, JETZT, { daten: { looks: looks() } });
      const z = pr.lade();
      pr.speichere({ version: z.version, ideen: z.ideen });
      expect(pr.familien()["mockups"]?.offeneRunde?.idee).toBe(a);
    });

    it("eine Datei im alten Format ohne Familien lädt weiter; ein fremdes Schema wird abgewiesen", () => {
      fs.writeFileSync(datei(), JSON.stringify({ schema: 1, version: 4, ideen: [] }));
      expect(pr.lade()).toEqual({ version: 4, ideen: [], familien: {} });
      fs.writeFileSync(datei(), JSON.stringify({ schema: 3, version: 4, ideen: [], familien: {} }));
      expect(() => pr.lade()).toThrow(/Ideen-Schema/);
    });
  });
});

describe("Look der Familie als Text und im Datenblatt", () => {
  it("stueckFamilieAus übernimmt den gewählten Brief mit Wähler und Fassung", () => {
    const s = stueckFamilieAus("mockups", familienLook({ gewaehlt: "c", fassung: 2, von: "Leander" }));
    expect(s).toMatchObject({ id: "mockups", fassung: 2, look: { gewaehlt: "c", name: "Editorial", von: "Leander", vonIdee: "m-001" } });
    expect(() => stueckFamilieAus("mockups", familienLook({ briefs: looks().briefs.slice(0, 2) as never, gewaehlt: "c" }))).toThrow(FamilienFehler);
  });

  it("der Text nennt Wähler, Fassung und alle vier Angaben des Looks", () => {
    const t = lookBriefText({ id: "mockups", name: "Handy-Mockups" }, stueckFamilieAus("mockups", familienLook({ von: "Leander", fassung: 2 })));
    expect(t).toContain("Handy-Mockups");
    expect(t).toContain("Leander");
    expect(t).toContain("Fassung 2");
    expect(t).toContain("Leitidee");
    expect(t).toContain("Typografie");
    expect(t).toContain("Farbeinsatz");
    expect(t).toContain("Bewegung");
    expect(t).toContain("einzeln abgenommen");
  });
});
