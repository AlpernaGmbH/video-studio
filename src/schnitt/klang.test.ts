import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Klang, KatalogEintrag, Markenprofil } from "../core/schemas";
import { klangGrund, setzeKlang } from "../katalog/katalog";
import { stueckZahl } from "../testing/fixtures";
import { hoechstensKlaenge, KLAENGE_JE_SEKUNDE, verteileAufSpuren, zuDichteStellen } from "./klang";
import { schreibeFcpxml } from "./fcpxml";
import { schreibeOtio } from "./otio";
import { bauePlan } from "./planbau";
import { leseSchnittplan, platziere, sekunden, SchnittQuelle, type Schnittplan } from "./plan";
import { pruefeSchnittplan } from "./pruefung";
import { bauAuftrag, soundQuelleAusKatalog, wendeStoryboardAn, type AnwendenKontext } from "./storyboard";
import { beispielPlan, testLoeser, testSatz as satz } from "./testdaten";
import { erzeugeVorschau, fehlendeDateien, vorschauArgs } from "./vorschau";
import { liesmich } from "./uebergabe";
import { ordneZu } from "./zuordnung";
import { findePreset, ladePresets } from "../presets/lader";

const hatFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
const root = path.resolve(import.meta.dirname, "..", "..");
const presets = ladePresets(path.join(root, "presets"));
const alperna = Markenprofil.parse(JSON.parse(fs.readFileSync(path.join(root, "marken", "alperna.json"), "utf8")));

const Z1 = "Wir haben diese Woche eine Küche komplett umgebaut.";
const Z2 = "Der Kunde wollte mehr Stauraum.";
const Z3 = "Das Ergebnis siehst du hier.";
const Z4 = "Dafür brauchte er nur drei Wochen.";
const videoQuellen = [SchnittQuelle.parse({ id: "a", pfad: "rohmaterial/t/a.mov", art: "video", dauer: 60, fps: 25, breite: 1080, hoehe: 1920, hatAudio: true })];
const basis = (): Schnittplan => bauePlan(ordneZu([Z1, Z2, Z3, Z4], [{ quelle: "a", segmente: [satz(20, Z1), satz(3, Z2), satz(30, Z3), satz(40, Z4)] }]), { projekt: { name: "Küche Gossau", inhalt: "c-0007", marke: "alperna" }, quellen: videoQuellen }).plan;
const gesamtVon = (p: Schnittplan): number => sekunden(platziere(p).gesamtFrames, p.projekt.fps);

const lizenz = { art: "schlag", lizenz: "CC0", quelle: "freesound.org/s/1234" } as const;
const sound = (schluessel: string, extra: Record<string, unknown> = {}) =>
  KatalogEintrag.parse({ schluessel, art: "sound", pfad: `klaenge/${schluessel}.wav`, titel: `Schlag_${schluessel}`, beschreibung: "Kurzer tiefer Schlag", tags: ["Schlag"], dauer: 0.8, sicherheit: "hoch", klang: lizenz, ...extra });
const katalog = [
  sound("k-0301"),
  sound("k-0302", { klang: { art: "whoosh", lizenz: "Kauf, Pro-Lizenz", quelle: "Anbieter X, Paket Y" } }),
  KatalogEintrag.parse({ schluessel: "k-0399", art: "sound", pfad: "klaenge/ohne-lizenz.wav", titel: "Ohne_Lizenz", beschreibung: "Kein Nachweis", tags: ["Test"], dauer: 1, sicherheit: "mittel" }),
  KatalogEintrag.parse({ schluessel: "k-0142", art: "video", pfad: "rohmaterial/bib/laptop.mov", titel: "Intern_Laptop", beschreibung: "Hände", tags: ["Laptop"], dauer: 8, sicherheit: "hoch" }),
];
const klangQuelle = (key: string, dauer = 0.8) => soundQuelleAusKatalog({ schluessel: key, pfad: `klaenge/${key}.wav` }, { art: "audio", dauer, hatAudio: true, audioKanaele: 2, audioRate: 48000, start: 0 });
const ton = { sfxDichte: 0.3, musik: false };
const ctx = (extra: Partial<AnwendenKontext> = {}): AnwendenKontext => ({
  stuecke: [stueckZahl()],
  katalog,
  brollQuellen: new Map(),
  ton,
  soundQuellen: new Map([["k-0301", klangQuelle("k-0301")], ["k-0302", klangQuelle("k-0302", 1.5)]]),
  ...extra,
});
const klang = (key: string, t: number, extra: Record<string, unknown> = {}) => ({ katalog: key, t, begruendung: "Schlag knapp vor der Zahl, hebt sie hervor", ...extra });
const sb = (sounds: unknown[]) => ({ hook: "Warum die Küche anders aussieht", overlays: [], betonung: [], sounds });

describe("Grenzen und Spuren (klang.ts)", () => {
  it("hoechstensKlaenge: ohne Ton oder bei Dichte 0 keine, sonst nach Dichte, mindestens einer", () => {
    expect(hoechstensKlaenge(undefined, 30)).toBe(0);
    expect(hoechstensKlaenge({ sfxDichte: 0 }, 30)).toBe(0);
    expect(hoechstensKlaenge({ sfxDichte: 0.2 }, 30)).toBe(6);
    expect(hoechstensKlaenge({ sfxDichte: 0.05 }, 5)).toBe(1);
    expect(hoechstensKlaenge({ sfxDichte: 0.5 }, 9.9)).toBe(5);
  });

  it("zuDichteStellen: vier in einer Sekunde sind in Ordnung, fünf melden die Stelle einmal", () => {
    expect(zuDichteStellen([1, 1.2, 1.4, 1.6])).toEqual([]);
    expect(zuDichteStellen([1, 1.2, 1.4, 1.6, 1.8])).toEqual([1]);
    expect(zuDichteStellen([1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6])).toEqual([1]);
    // fünf an einer Stelle und fünf weit danach: zwei Stellen
    expect(zuDichteStellen([1, 1.1, 1.2, 1.3, 1.4, 6, 6.1, 6.2, 6.3, 6.4])).toEqual([1, 6]);
    expect(KLAENGE_JE_SEKUNDE).toBe(4);
  });

  it("verteileAufSpuren: Nacheinander liegt auf einer Spur, Überlappung braucht eine zweite, freie Spuren werden wieder benutzt", () => {
    expect(verteileAufSpuren([{ start: 0, frames: 10 }, { start: 10, frames: 10 }, { start: 25, frames: 5 }])).toEqual([0, 0, 0]);
    expect(verteileAufSpuren([{ start: 0, frames: 30 }, { start: 10, frames: 10 }])).toEqual([0, 1]);
    // der dritte beginnt, wenn der zweite (Spur 1) noch läuft, aber der erste (Spur 0) zu Ende ist
    expect(verteileAufSpuren([{ start: 0, frames: 10 }, { start: 5, frames: 20 }, { start: 12, frames: 5 }])).toEqual([0, 1, 0]);
    // die Reihenfolge der Eingabe bleibt, auch wenn sie nicht nach Zeit sortiert ist
    expect(verteileAufSpuren([{ start: 10, frames: 10 }, { start: 0, frames: 30 }])).toEqual([1, 0]);
    expect(verteileAufSpuren([])).toEqual([]);
  });
});

describe("Klang im Katalog", () => {
  it("Art, Lizenz und Quelle sind Pflicht, Spitze und Lautheit nicht", () => {
    expect(Klang.safeParse(lizenz).success).toBe(true);
    expect(Klang.safeParse({ ...lizenz, lizenz: " " }).success).toBe(false);
    expect(Klang.safeParse({ ...lizenz, quelle: "" }).success).toBe(false);
    expect(Klang.safeParse({ ...lizenz, art: "musik" }).success).toBe(false);
  });

  it("setzeKlang trägt ein, lehnt Unbekanntes, Videos und Fotos ab und behält gemessene Werte", () => {
    const k = [sound("k-0301", { klang: { ...lizenz, spitzeDb: -6.2, lufs: -20 } }), katalog[3]!];
    const r = setzeKlang(k, "k-0301", { art: "klick", lizenz: "CC-BY 4.0", quelle: "freesound.org/s/9" });
    expect("fehler" in r).toBe(false);
    if ("fehler" in r) return;
    expect(r.klang).toEqual({ art: "klick", lizenz: "CC-BY 4.0", quelle: "freesound.org/s/9", spitzeDb: -6.2, lufs: -20 });
    expect(r.katalog.find((x) => x.schluessel === "k-0301")!.klang!.art).toBe("klick");
    expect(setzeKlang(k, "k-9999", lizenz)).toEqual({ fehler: expect.stringContaining("nicht im Katalog") });
    expect(setzeKlang(k, "k-0142", lizenz)).toEqual({ fehler: expect.stringContaining("ist kein Sound") });
    expect(setzeKlang(k, "k-0301", { art: "klick", lizenz: "", quelle: "x" })).toEqual({ fehler: expect.stringContaining("lizenz") });
  });

  it("klangGrund: nur ein Sound mit Lizenz ist verwendbar", () => {
    expect(klangGrund(katalog[0], "k-0301")).toBe("");
    expect(klangGrund(katalog[2], "k-0399")).toMatch(/keine Lizenz und keine Quelle/);
    expect(klangGrund(katalog[3], "k-0142")).toMatch(/kein Sound/);
    expect(klangGrund(undefined, "k-0777")).toMatch(/existiert nicht/);
  });
});

describe("wendeStoryboardAn: Klänge", () => {
  it("übernimmt einen Klang mit Quelle, Standardpegel und der Länge der Datei; der Plan besteht die Prüfung", () => {
    const plan = basis();
    const r = wendeStoryboardAn(plan, sb([klang("k-0301", 2)]), ctx());
    expect(r.verworfeneSounds).toEqual([]);
    expect(r.plan.sounds).toEqual([{ quelle: "sound-k-0301", katalog: "k-0301", art: "schlag", t: 2, dauer: 0.8, pegelDb: -12, begruendung: "Schlag knapp vor der Zahl, hebt sie hervor" }]);
    expect(r.plan.quellen.find((q) => q.id === "sound-k-0301")).toMatchObject({ art: "audio", pfad: "klaenge/k-0301.wav" });
    expect(r.sounds).toEqual([{ katalog: "k-0301", art: "schlag", t: 2, dauer: 0.8, pegelDb: -12 }]);
    expect(pruefeSchnittplan(r.plan, { katalog, ton }).filter((b) => b.stufe === "fehler")).toEqual([]);
  });

  it("nimmt den Pegel aus dem Eintrag und kürzt einen Klang am Ende des Videos", () => {
    const plan = basis();
    const gesamt = gesamtVon(plan);
    const r = wendeStoryboardAn(plan, sb([klang("k-0302", gesamt - 0.5, { pegelDb: -18 })]), ctx());
    expect(r.plan.sounds[0]).toMatchObject({ pegelDb: -18 });
    expect(r.plan.sounds[0]!.dauer).toBeCloseTo(0.5, 6);
  });

  it("ohne Entscheid der Marke ändert sich nichts: bei sfxDichte 0 und ohne Angabe zum Ton fallen alle Klänge mit Grund heraus", () => {
    for (const t of [{ sfxDichte: 0, musik: false }, undefined]) {
      const r = wendeStoryboardAn(basis(), sb([klang("k-0301", 2)]), ctx({ ton: t as never }));
      expect(r.plan.sounds).toEqual([]);
      expect(r.plan.quellen.some((q) => q.id.startsWith("sound-"))).toBe(false);
      expect(r.verworfeneSounds).toHaveLength(1);
      expect(r.verworfeneSounds[0]!.grund).toMatch(/Soundeffekte sind für diese Marke aus/);
    }
  });

  it("der Katalog der Marke Alperna hat keine Soundeffekte (sfxDichte 0)", () => {
    expect(alperna.ton.sfxDichte).toBe(0);
  });

  it("verwirft Sounds ohne Lizenz, Fotos und Videos, unbekannte Schlüssel und Dateien, die nicht sondiert wurden", () => {
    const r = wendeStoryboardAn(basis(), sb([klang("k-0399", 1), klang("k-0142", 2), klang("k-0777", 3), klang("k-0302", 4, {}), klang("k-0301", 5)]), ctx({ soundQuellen: new Map([["k-0301", klangQuelle("k-0301")]]) }));
    expect(r.plan.sounds.map((k) => k.katalog)).toEqual(["k-0301"]);
    const gruende = r.verworfeneSounds.map((v) => v.grund).join("\n");
    expect(gruende).toMatch(/k-0399.*keine Lizenz/);
    expect(gruende).toMatch(/k-0142.*kein Sound/);
    expect(gruende).toMatch(/k-0777.*existiert nicht/);
    expect(gruende).toMatch(/k-0302.*nicht sondiert/);
  });

  it("verwirft Klänge hinter dem Ende, Einträge ohne Begründung und ungültige Zeiten, einzeln", () => {
    const gesamt = gesamtVon(basis());
    const r = wendeStoryboardAn(basis(), sb([klang("k-0301", gesamt + 5), klang("k-0301", 1, { begruendung: "" }), klang("k-0301", -1), { katalog: "kaputt", t: 1, begruendung: "Irgendein Grund" }, klang("k-0301", 2)]), ctx());
    expect(r.plan.sounds).toHaveLength(1);
    expect(r.plan.sounds[0]!.t).toBe(2);
    expect(r.verworfeneSounds).toHaveLength(4);
    expect(r.verworfeneSounds.map((v) => v.grund).join("\n")).toMatch(/nicht im Video/);
  });

  it("begrenzt die Zahl nach der Dichte der Marke und trifft die späteren, nicht die ersten", () => {
    const plan = basis();
    const gesamt = gesamtVon(plan);
    const erlaubt = hoechstensKlaenge(ton, gesamt);
    expect(erlaubt).toBeGreaterThanOrEqual(2);
    // absichtlich in umgekehrter Reihenfolge der Zeit eingereicht
    const eintraege = Array.from({ length: erlaubt + 2 }, (_, i) => klang("k-0301", 1 + i * 1.5));
    const r = wendeStoryboardAn(plan, sb([...eintraege].reverse()), ctx());
    expect(r.plan.sounds).toHaveLength(erlaubt);
    expect(r.plan.sounds.map((k) => k.t)).toEqual(eintraege.slice(0, erlaubt).map((k) => k.t));
    expect(r.verworfeneSounds).toHaveLength(2);
    expect(r.verworfeneSounds[0]!.grund).toMatch(new RegExp(`Mehr als ${erlaubt} Klänge`));
  });

  it("lässt nie mehr als vier Klänge in einer Sekunde zu", () => {
    const plan = basis();
    const t = { sfxDichte: 0.5, musik: false };
    const erlaubt = hoechstensKlaenge(t, gesamtVon(plan));
    expect(erlaubt).toBeGreaterThanOrEqual(5);
    const r = wendeStoryboardAn(plan, sb([1, 1.1, 1.2, 1.3, 1.4].map((x) => klang("k-0301", x))), ctx({ ton: t }));
    expect(r.plan.sounds).toHaveLength(4);
    expect(r.verworfeneSounds[0]!.grund).toMatch(/Mehr als 4 Klänge in einer Sekunde/);
  });

  it("ersetzt die Klänge eines früheren Storyboards, statt sie zu sammeln", () => {
    const erst = wendeStoryboardAn(basis(), sb([klang("k-0301", 2)]), ctx());
    expect(erst.plan.sounds).toHaveLength(1);
    const zweit = wendeStoryboardAn(erst.plan, sb([]), ctx());
    expect(zweit.plan.sounds).toEqual([]);
    expect(zweit.plan.quellen.some((q) => q.id.startsWith("sound-"))).toBe(false);
  });

  it("ohne Eintrag «sounds» im Storyboard bleibt alles wie vorher", () => {
    const r = wendeStoryboardAn(basis(), { hook: "x", overlays: [], betonung: [] }, ctx());
    expect(r.plan.sounds).toEqual([]);
    expect(r.verworfeneSounds).toEqual([]);
  });
});

describe("bauAuftrag: Klänge", () => {
  const auftrag = (extra: Record<string, unknown> = {}) => bauAuftrag(basis(), { stuecke: [], katalog, ...extra }).join("\n");

  it("sagt bei einer Marke ohne Soundeffekte, dass es keine gibt, und zeigt kein sounds-Feld", () => {
    for (const t of [{ sfxDichte: 0, musik: false }, undefined]) {
      const a = auftrag({ ton: t });
      expect(a).toContain("Keine Soundeffekte");
      expect(a).not.toContain("k-0301");
      expect(a).not.toContain('"sounds"');
    }
  });

  it("nennt bei einer Marke mit Soundeffekten nur Sounds mit Lizenz, die Obergrenze und den Vorlauf", () => {
    const a = auftrag({ ton });
    expect(a).toContain("k-0301");
    expect(a).toContain("k-0302");
    expect(a).not.toContain("k-0399");
    expect(a).toMatch(/Höchstens \d+ Klänge/);
    expect(a).toContain("bis 0,5 s **vor** das Bildereignis");
    expect(a).toContain('"sounds"');
    expect(a).toContain("Ein Mensch hört die Wahl und gibt sie frei; du hörst nichts");
  });

  it("sagt es, wenn der Katalog keinen Sound mit Lizenz hat", () => {
    const a = auftrag({ ton, katalog: [katalog[2]!, katalog[3]!] });
    expect(a).toContain("keinen Sound mit Lizenz und Quelle");
    expect(a).not.toContain('"sounds"');
  });
});

describe("pruefeSchnittplan: Klänge", () => {
  const mitKlang = (sounds: Record<string, unknown>[], extra: Record<string, unknown> = {}): Schnittplan =>
    beispielPlan({
      quellen: [...beispielPlan().quellen, { id: "sound-k-0301", pfad: "klaenge/k-0301.wav", art: "audio", dauer: 0.8, hatAudio: true }],
      sounds: sounds.map((s) => ({ quelle: "sound-k-0301", katalog: "k-0301", art: "schlag", pegelDb: -12, begruendung: "Schlag knapp vor der Zahl", ...s })),
      ...extra,
    });
  const codes = (p: Schnittplan, c: Parameters<typeof pruefeSchnittplan>[1] = {}) => pruefeSchnittplan(p, c).map((b) => `${b.stufe}:${b.code}`);

  it("ein sauberer Klang bringt weder Fehler noch Hinweis", () => {
    expect(codes(mitKlang([{ t: 2.2 }]), { katalog, ton })).not.toEqual(expect.arrayContaining([expect.stringMatching(/klang/)]));
  });

  it("Fehler: Quelle fehlt oder ist keine Audioquelle, Klang hinter dem Video", () => {
    expect(codes(mitKlang([{ t: 1, quelle: "gibt-es-nicht" }]))).toContain("fehler:quelle-fehlt");
    expect(codes(mitKlang([{ t: 1, quelle: "sprache" }]))).toContain("fehler:quelle-art");
    expect(codes(mitKlang([{ t: 99 }]))).toContain("fehler:klang-ausserhalb");
  });

  it("Hinweis: Der Klang läuft über das Ende", () => {
    const plan = mitKlang([{ t: 1 }]);
    const ende = gesamtVon(plan);
    expect(codes(mitKlang([{ t: ende - 0.2 }]))).toContain("hinweis:klang-ueber-ende");
    expect(codes(plan)).not.toContain("hinweis:klang-ueber-ende");
  });

  it("Fehler: ein Klang ohne Lizenz im Katalog, wenn der Katalog bekannt ist; ohne Katalog keine Aussage", () => {
    const ohne = { katalog: [katalog[2]!] };
    expect(codes(mitKlang([{ t: 1, katalog: "k-0399" }]), ohne)).toContain("fehler:klang-nicht-verwendbar");
    expect(codes(mitKlang([{ t: 1, katalog: "k-0399" }]))).not.toContain("fehler:klang-nicht-verwendbar");
    expect(codes(mitKlang([{ t: 1 }]), { katalog: [] })).toContain("fehler:klang-nicht-verwendbar");
  });

  it("Hinweis: mehr als vier Klänge in einer Sekunde", () => {
    expect(codes(mitKlang([1, 1.1, 1.2, 1.3, 1.4].map((t) => ({ t }))))).toContain("hinweis:klang-dichte");
    expect(codes(mitKlang([1, 1.1, 1.2, 1.3].map((t) => ({ t }))))).not.toContain("hinweis:klang-dichte");
  });

  it("Marke ohne Soundeffekte: Fehler; zu viele für die Dichte: Hinweis", () => {
    const plan = mitKlang([{ t: 1 }]);
    expect(codes(plan, { ton: { sfxDichte: 0, musik: false } })).toContain("fehler:klang-marke-aus");
    // das Beispielvideo ist rund 5 s lang: bei 0,1 je Sekunde ist ein Klang erlaubt, bei 0,3 sind es zwei
    const zwei = mitKlang([1, 3].map((t) => ({ t })));
    expect(codes(zwei, { ton: { sfxDichte: 0.1, musik: false } })).toContain("hinweis:klang-zu-viele");
    expect(codes(zwei, { ton })).not.toContain("hinweis:klang-zu-viele");
  });
});

describe("Übergabe: FCPXML, OTIO und LIESMICH mit Klängen", () => {
  const plan = (sounds: Record<string, unknown>[]): Schnittplan =>
    beispielPlan({
      quellen: [...beispielPlan().quellen, { id: "sound-k-0301", pfad: "klaenge/k-0301.wav", art: "audio", dauer: 0.8, hatAudio: true }],
      sounds: sounds.map((s) => ({ quelle: "sound-k-0301", katalog: "k-0301", art: "schlag", pegelDb: -12, begruendung: "Schlag knapp vor der Zahl", ...s })),
    });

  it("ohne Klänge ändert sich nichts: weder Klang-Clips in der FCPXML noch zusätzliche Spuren in der OTIO", () => {
    expect(schreibeFcpxml(plan([]), testLoeser)).not.toContain("klang-");
    const o = JSON.parse(schreibeOtio(plan([]), testLoeser));
    expect(o.tracks.children.map((t: { name: string }) => t.name)).toEqual(["V1", "V2", "V3", "A1", "A2"]);
  });

  it("FCPXML: jeder Klang ist ein Audio-Clip mit der Rolle «effects» und dem Pegel, unter der Musik (Lane −2)", () => {
    const x = schreibeFcpxml(plan([{ t: 2.2, pegelDb: -9 }]), testLoeser);
    expect(x).toMatch(/<asset-clip [^>]*lane="-2"[^>]*name="klang-k-0301"[^>]*audioRole="effects"/);
    expect(x).toContain('<adjust-volume amount="-9dB"');
    expect(x).toContain("klaenge/k-0301.wav");
  });

  it("FCPXML: Klänge, die sich überlappen, bekommen verschiedene Lanes", () => {
    const x = schreibeFcpxml(plan([{ t: 2.2 }, { t: 2.4 }]), testLoeser);
    const lanes = [...x.matchAll(/lane="(-?\d+)"[^>]*name="klang-k-0301"/g)].map((m) => m[1]).sort();
    expect(lanes).toEqual(["-2", "-3"]);
  });

  it("OTIO: Klänge liegen ab A3 auf eigenen Spuren, Überlappendes auf einer weiteren", () => {
    const o = JSON.parse(schreibeOtio(plan([{ t: 2.2 }, { t: 2.4 }, { t: 4 }]), testLoeser));
    const namen = o.tracks.children.map((t: { name: string }) => t.name);
    expect(namen).toEqual(["V1", "V2", "V3", "A1", "A2", "A3", "A4"]);
    const a3 = o.tracks.children[5].children.filter((c: { OTIO_SCHEMA: string }) => c.OTIO_SCHEMA === "Clip.1");
    expect(a3.map((c: { name: string }) => c.name)).toEqual(["klang-k-0301", "klang-k-0301"]);
    expect(a3[0].metadata.studio).toMatchObject({ katalog: "k-0301", art: "schlag", pegelDb: -12 });
  });

  it("OTIO ohne Musik: Klänge beginnen bei A2", () => {
    const p = plan([{ t: 2.2 }]);
    const ohneMusik = leseSchnittplan({ ...p, musik: undefined });
    const namen = JSON.parse(schreibeOtio(ohneMusik, testLoeser)).tracks.children.map((t: { name: string }) => t.name);
    expect(namen).toEqual(["V1", "V2", "V3", "A1", "A2"]);
  });

  it("LIESMICH: nennt die Klänge mit Zeit und sagt, dass Claude sie nicht gehört hat; ohne Klänge steht kein Abschnitt da", () => {
    const e = findePreset(presets, "export", "reel");
    const a = findePreset(presets, "audio", "standard");
    const mit = liesmich({ plan: plan([{ t: 2.2 }]), dauer: 5, seiten: 0, befunde: [], export: e, audio: a, umgewandelt: [], dateien: ["timeline.fcpxml"] });
    expect(mit).toContain("## Klänge");
    expect(mit).toMatch(/- 2,2 s: k-0301 \(schlag\), -12 dB/);
    expect(mit).toContain("Claude hat sie nicht gehört");
    const ohne = liesmich({ plan: plan([]), dauer: 5, seiten: 0, befunde: [], export: e, audio: a, umgewandelt: [], dateien: ["timeline.fcpxml"] });
    expect(ohne).not.toContain("## Klänge");
  });
});

describe("Vorschau: Klänge im Mix", () => {
  const loese = (rel: string, art: string) => `/m/${art}/${rel}`;
  const p = (sounds: Record<string, unknown>[], mitMusik: boolean): Schnittplan =>
    leseSchnittplan({
      version: 1,
      projekt: { name: "Test", marke: "alperna" },
      quellen: [
        { id: "sprache", pfad: "rohmaterial/farben.mp4", art: "video", dauer: 4, fps: 25, breite: 320, hoehe: 568, hatAudio: true },
        { id: "musik", pfad: "rohmaterial/musik.wav", art: "audio", dauer: 10, hatAudio: true },
        { id: "sound-k-0301", pfad: "klaenge/k-0301.wav", art: "audio", dauer: 0.8, hatAudio: true },
      ],
      clips: [{ id: "k01", quelle: "sprache", von: 0, bis: 2 }],
      ...(mitMusik ? { musik: { quelle: "musik", t: 0, von: 0, pegelDb: -20 } } : {}),
      sounds: sounds.map((s) => ({ quelle: "sound-k-0301", katalog: "k-0301", art: "schlag", pegelDb: -12, begruendung: "Schlag knapp vor der Zahl", ...s })),
    });
  const graph = (plan: Schnittplan) => {
    const a = vorschauArgs({ plan, loese, ausgabe: "/tmp/v.mp4" });
    return a[a.indexOf("-filter_complex") + 1]!;
  };

  it("ohne Klänge bleibt der Mix wie vorher (nur Musik: zwei Eingänge)", () => {
    expect(graph(p([], true))).toContain("[abasis][musik]amix=inputs=2:duration=first:normalize=0[amix]");
    expect(graph(p([], false))).not.toContain("amix");
    expect(graph(p([], false))).toContain("[abasis]alimiter=limit=0.95[aout]");
  });

  it("jeder Klang wird verzögert, im Pegel gesenkt und zu Sprache und Musik gemischt", () => {
    const g = graph(p([{ t: 1.2, pegelDb: -9 }], true));
    expect(g).toContain("volume=-9dB,atrim=duration=0.8,asetpts=PTS-STARTPTS,adelay=1200|1200[klang0]");
    expect(g).toContain("[abasis][musik][klang0]amix=inputs=3:duration=first:normalize=0[amix]");
    expect(g).toContain("[amix]alimiter=limit=0.95[aout]");
  });

  it("ohne Musik mischt er Sprache und Klänge", () => {
    expect(graph(p([{ t: 0.5 }, { t: 1 }], false))).toContain("[abasis][klang0][klang1]amix=inputs=3:duration=first:normalize=0[amix]");
  });

  it("fehlendeDateien nennt auch die Datei eines Klangs", () => {
    expect(fehlendeDateien(p([{ t: 1 }], false), (rel, art) => `/gibt/es/nicht/${art}/${rel}`).some((f) => f.endsWith("klaenge/k-0301.wav"))).toBe(true);
  });
});

describe.skipIf(!hatFfmpeg)("Vorschau mit echtem ffmpeg: der Klang liegt dort, wo er sein soll", () => {
  let tmp: string;
  beforeEach(() => void (tmp = fs.mkdtempSync(path.join(os.tmpdir(), "studio-klang-"))));
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const ff = (...a: string[]): void => void expect(spawnSync("ffmpeg", ["-loglevel", "error", "-y", ...a]).status, a.join(" ")).toBe(0);
  /** Lautstärke eines Fensters der Vorschau in dB (mean_volume). */
  const pegelFenster = (datei: string, von: number, dauer: number): number => {
    const r = spawnSync("ffmpeg", ["-hide_banner", "-ss", String(von), "-t", String(dauer), "-i", datei, "-vn", "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" });
    const m = /mean_volume:\s+(-?\d+(?:\.\d+)?|-inf)\s+dB/.exec(r.stderr);
    return m ? (m[1] === "-inf" ? -120 : Number(m[1])) : -120;
  };

  it("die Sprache ist still, der Klang bei 1,0 s bis 1,5 s ist hörbar, davor und danach nicht", async () => {
    ff("-f", "lavfi", "-i", "testsrc2=size=160x284:rate=25:duration=3", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", "3", "-shortest", path.join(tmp, "sprache.mp4"));
    ff("-f", "lavfi", "-i", "sine=frequency=500:sample_rate=48000:duration=0.5", path.join(tmp, "klang.wav"));
    const plan = leseSchnittplan({
      version: 1,
      projekt: { name: "Test", marke: "alperna" },
      quellen: [
        { id: "sprache", pfad: "sprache.mp4", art: "video", dauer: 3, fps: 25, breite: 160, hoehe: 284, hatAudio: true },
        { id: "sound-k-0301", pfad: "klang.wav", art: "audio", dauer: 0.5, hatAudio: true, audioKanaele: 1 },
      ],
      clips: [{ id: "k01", quelle: "sprache", von: 0, bis: 3 }],
      sounds: [{ quelle: "sound-k-0301", katalog: "k-0301", art: "schlag", t: 1, pegelDb: -6, begruendung: "Schlag knapp vor der Zahl" }],
    });
    const ziel = path.join(tmp, "vorschau.mp4");
    await erzeugeVorschau({ plan, loese: (rel) => path.join(tmp, rel), ausgabe: ziel });
    expect(pegelFenster(ziel, 1.05, 0.4)).toBeGreaterThan(-40);
    expect(pegelFenster(ziel, 0, 0.8)).toBeLessThan(-60);
    expect(pegelFenster(ziel, 1.7, 1)).toBeLessThan(-60);
  }, 60_000);
});
