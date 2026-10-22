import { describe, expect, it } from "vitest";
import { KatalogEintrag, Regel, type Schnittprofil } from "../core/schemas";
import { stueckVerlauf, stueckZahl } from "../testing/fixtures";
import { bauePlan } from "./planbau";
import { SchnittQuelle, type Schnittplan } from "./plan";
import { pruefeSchnittplan } from "./pruefung";
import { bauAuftrag, brollQuelleAusKatalog, imLetztenVideo, renderOrdnerName, wendeStoryboardAn, type AnwendenKontext } from "./storyboard";
import { testSatz as satz } from "./testdaten";
import { liesmich } from "./uebergabe";
import { woerterMitHerkunft } from "./untertitel";
import { platziere } from "./plan";
import { ordneZu } from "./zuordnung";
import { ladePresets, findePreset } from "../presets/lader";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..");
const Z1 = "Wir haben diese Woche eine Küche komplett umgebaut.";
const Z2 = "Der Kunde wollte mehr Stauraum.";
const Z3 = "Das Ergebnis siehst du hier.";
const Z4 = "Dafür brauchte er nur drei Wochen.";

const quellen = [SchnittQuelle.parse({ id: "a", pfad: "rohmaterial/t/a.mov", art: "video", dauer: 60, fps: 25, breite: 1080, hoehe: 1920, hatAudio: true })];
const basis = (): Schnittplan => bauePlan(ordneZu([Z1, Z2, Z3, Z4], [{ quelle: "a", segmente: [satz(20, Z1), satz(3, Z2), satz(30, Z3), satz(40, Z4)] }]), { projekt: { name: "Küche Gossau", inhalt: "c-0007", marke: "alperna" }, quellen }).plan;

const katalog = [
  KatalogEintrag.parse({ schluessel: "k-0142", art: "video", pfad: "rohmaterial/bib/laptop.mov", titel: "Intern_Gossau_Laptop", beschreibung: "Hände auf Laptop", tags: ["Laptop", "Büro"], dauer: 8.4, orientierung: "hoch", besteSekunden: { von: 1.2, bis: 5.0 }, sicherheit: "hoch" }),
  KatalogEintrag.parse({ schluessel: "k-0143", art: "video", pfad: "rohmaterial/bib/kueche.mov", titel: "Intern_Gossau_Kueche", beschreibung: "Küche von aussen", tags: ["Küche"], dauer: 6, sicherheit: "hoch", zuletztGenutzt: { datum: "2026-10-10", projekt: "Vorgänger [alperna]" } }),
  KatalogEintrag.parse({ schluessel: "k-0200", art: "foto", pfad: "rohmaterial/bib/platz.jpg", titel: "Intern_Speicher_Dorfplatz", beschreibung: "Dorfplatz", tags: ["Speicher"], sicherheit: "mittel" }),
  KatalogEintrag.parse({ schluessel: "k-0300", art: "sound", pfad: "rohmaterial/bib/whoosh.wav", titel: "Whoosh_kurz", beschreibung: "Whoosh", tags: ["Whoosh"], sicherheit: "hoch" }),
];
const brollQuelle = (key: string, dauer = 8.4) => SchnittQuelle.parse({ id: `broll-${key}`, pfad: `rohmaterial/bib/${key}.mov`, art: "video", dauer, fps: 25, breite: 1080, hoehe: 1920, hatAudio: true });
const ctx = (extra: Partial<AnwendenKontext> = {}): AnwendenKontext => ({
  stuecke: [stueckZahl(), stueckVerlauf()],
  katalog,
  brollQuellen: new Map([["k-0142", brollQuelle("k-0142")], ["k-0143", brollQuelle("k-0143", 6)]]),
  ...extra,
});
const ov = (o: Record<string, unknown>) => ({ effekt: "zahl-zaehler", t: 1, dauer: 2.6, params: { wert: 7 }, begruendung: "Kennzahl im Skript, Zahl wirkt stärker als Wort", ...o });
const broll = (key: string, t: number, dauer = 1.5) => ov({ effekt: "broll", t, dauer, params: { katalog: key }, begruendung: "Zeigt die Aussage, bringt Bildwechsel" });

describe("brollQuelleAusKatalog (B-Roll aus dem Katalog)", () => {
  const sondiert = { art: "video", dauer: 6, fps: 25, breite: 1080, hoehe: 1920 };
  const plan = (quellen: Record<string, unknown>[]) => ({ quellen: quellen.map((q) => SchnittQuelle.parse({ art: "video", dauer: 5, fps: 25, breite: 1080, hoehe: 1920, ...q })) });

  it("Log-Material aus der Kamera (Katalog: log) trägt die Farbart «log», anderes bleibt ohne Angabe", () => {
    const log = brollQuelleAusKatalog({ schluessel: "k-0007", pfad: "b-roll/k7.mov", log: true }, sondiert, plan([]));
    expect(log).toMatchObject({ id: "broll-k-0007", pfad: "b-roll/k7.mov", farbe: "log" });
    const normal = brollQuelleAusKatalog({ schluessel: "k-0008", pfad: "b-roll/k8.mp4", log: false }, sondiert, plan([]));
    expect(normal.farbe).toBeUndefined();
    expect(normal).not.toHaveProperty("bereich");
  });

  it("der von Hand festgelegte Datenbereich des Inhalts gilt auch für Log-B-Roll, nicht für normale", () => {
    const p = plan([{ id: "sprache-01", pfad: "a.mov", farbe: "log", bereich: "voll" }]);
    expect(brollQuelleAusKatalog({ schluessel: "k-0007", pfad: "b-roll/k7.mov", log: true }, sondiert, p)).toMatchObject({ farbe: "log", bereich: "voll" });
    expect(brollQuelleAusKatalog({ schluessel: "k-0008", pfad: "b-roll/k8.mp4", log: false }, sondiert, p)).not.toHaveProperty("bereich");
    // ein Bereich an normalem Material im Plan zählt nicht (die Angabe gehört nur zu Log)
    const ohne = plan([{ id: "sprache-01", pfad: "a.mov", farbe: "log" }]);
    expect(brollQuelleAusKatalog({ schluessel: "k-0007", pfad: "b-roll/k7.mov", log: true }, sondiert, ohne)).not.toHaveProperty("bereich");
  });
});

describe("renderOrdnerName und imLetztenVideo", () => {
  it("nimmt die Inhalt-ID, sonst den Projektnamen als Kennung", () => {
    expect(renderOrdnerName(basis())).toBe("c-0007");
    const p = { ...basis(), projekt: { ...basis().projekt, inhalt: undefined } };
    expect(renderOrdnerName(p)).toBe("kueche-gossau");
  });
  it("nennt die Einträge des jüngsten anderen Projekts", () => {
    const k = [
      KatalogEintrag.parse({ ...katalog[0], zuletztGenutzt: { datum: "2026-09-01", projekt: "Alt" } }),
      KatalogEintrag.parse({ ...katalog[1], zuletztGenutzt: { datum: "2026-10-10", projekt: "Neu" } }),
      KatalogEintrag.parse({ ...katalog[2], zuletztGenutzt: { datum: "2026-10-12", projekt: "Aktuell" } }),
    ];
    expect(imLetztenVideo(k, "Aktuell")).toEqual(["k-0143"]);
    expect(imLetztenVideo(katalog.slice(0, 1), "x")).toEqual([]);
  });
  it("zählt mit Marke nur die Videos dieser Marke: das jüngste Video einer anderen Marke sperrt nichts", () => {
    const k = [
      KatalogEintrag.parse({ ...katalog[0], zuletztGenutzt: { datum: "2026-10-01", projekt: "Küche [alperna]" } }),
      KatalogEintrag.parse({ ...katalog[1], zuletztGenutzt: { datum: "2026-10-09", projekt: "Bäckerei [kunde-x]" } }),
    ];
    expect(imLetztenVideo(k, "Neu [alperna]", "alperna")).toEqual(["k-0142"]);
    expect(imLetztenVideo(k, "Neu [kunde-x]", "kunde-x")).toEqual(["k-0143"]);
    expect(imLetztenVideo(k, "Neu [kunde-y]", "kunde-y")).toEqual([]);
    expect(imLetztenVideo(k, "Neu")).toEqual(["k-0143"]);
  });
  it("sperrt ein Video nicht gegen sich selbst: die Einträge des aktuellen Projekts zählen nicht als «letztes Video»", () => {
    const k = [KatalogEintrag.parse({ ...katalog[0], zuletztGenutzt: { datum: "2026-10-10", projekt: "Küche Gossau [alperna]" } })];
    expect(imLetztenVideo(k, "Küche Gossau [alperna]", "alperna")).toEqual([]);
  });
});

describe("bauAuftrag", () => {
  const plan = basis();
  const regeln = [
    Regel.parse({ id: "r-001", text: "Zahlen immer mit Einheit nennen.", typ: "handwerk", status: "aktiv", beleg: { anzahl: 3, verweise: ["x"] }, freigabe: { wer: "Andrej", wann: "2026-10-10T10:00:00.000Z" } }),
    Regel.parse({ id: "r-002", text: "Alperna: Grafiken ruhig einblenden.", typ: "optik", marke: "alperna", status: "aktiv", beleg: { anzahl: 2, verweise: ["x"] }, freigabe: { wer: "Andrej", wann: "2026-10-10T10:00:00.000Z" } }),
    Regel.parse({ id: "r-003", text: "Anderer Kunde: alles gross.", typ: "optik", marke: "kunde-x", status: "aktiv", beleg: { anzahl: 2, verweise: ["x"] }, freigabe: { wer: "Andrej", wann: "2026-10-10T10:00:00.000Z" } }),
    Regel.parse({ id: "r-004", text: "Vorschlag, noch nicht aktiv.", typ: "handwerk", status: "vorschlag", beleg: { anzahl: 1, verweise: ["x"] } }),
  ];
  const text = bauAuftrag(plan, { stuecke: [stueckZahl(), stueckVerlauf({ id: "gebaut-karte", status: "gebaut", freigabe: undefined })], katalog, regeln, profil: { laengstePause: 0.25, laengsteEinstellung: 1.5, woerterJeUntertitel: { min: 2, max: 3 }, hookMaxSekunden: 2, zoomTempo: "mittel", zoom: { modus: "betonung", maxProMinute: 4 }, minClip: 0.7, textlaengen: {} } }).join("\n");

  it("nennt Projekt, Marke, Länge und das Schnittprofil", () => {
    expect(text).toContain("# Storyboard-Auftrag: Küche Gossau");
    expect(text).toMatch(/Marke alperna, Inhalt c-0007\. Länge [\d,]+ s, 1080×1920, 25 Bilder/);
    expect(text).toContain("Aussage in den ersten 2,0 s");
    expect(text).toContain("spätestens alle 1,5 s");
  });

  it("zeigt jede Zeile mit Zeiten der Timeline und nummerierten Wörtern", () => {
    expect(text).toMatch(/\*\*Zeile 1, 0,0 bis [\d,]+ s:\*\* Wir haben diese Woche eine Küche komplett umgebaut\./);
    expect(text).toMatch(/\*\*Zeile 2, [\d,]+ bis [\d,]+ s:\*\* Der Kunde wollte mehr Stauraum\./);
    expect(text).toMatch(/Wörter \(Nummer, Wort, Sekunde\): 0 Wir 0,1; 1 haben/);
    // die Nummern sind die der Timeline-Reihenfolge, auch für die zweite Zeile
    expect(text).toMatch(/8 Der [\d,]+; 9 Kunde/);
  });

  it("listet nur aktive Stücke", () => {
    expect(text).toContain("zahl-zaehler");
    expect(text).not.toContain("gebaut-karte");
  });

  it("listet nur Videos aus dem Katalog (keine Fotos, keine Sounds), mit nutzbarer Länge, und nennt, wie viele fehlen", () => {
    expect(text).toMatch(/- k-0142 · video, hoch, 3,8 s nutzbar · Intern_Gossau_Laptop/);
    expect(text).not.toContain("k-0200");
    expect(text).not.toContain("k-0300");
    expect(text).not.toMatch(/- k-0143 ·/);
    expect(text).toContain("1 Einträge fehlen, weil sie im letzten Video der Marke liefen.");
  });

  it("nennt aktive Handwerksregeln und die Optikregeln der Marke, aber keine fremden und keine Vorschläge", () => {
    expect(text).toContain("r-001 (handwerk): Zahlen immer mit Einheit nennen.");
    expect(text).toContain("r-002 (optik): Alperna: Grafiken ruhig einblenden.");
    expect(text).not.toContain("r-003");
    expect(text).not.toContain("r-004");
  });

  it("sperrt nur B-Roll aus dem letzten Video derselben Marke, nicht aus dem einer anderen", () => {
    const k = [
      KatalogEintrag.parse({ ...katalog[0], zuletztGenutzt: { datum: "2026-10-01", projekt: "Küche [alperna]" } }),
      KatalogEintrag.parse({ ...katalog[1], zuletztGenutzt: { datum: "2026-10-09", projekt: "Bäckerei [kunde-x]" } }),
    ];
    const t = bauAuftrag(plan, { stuecke: [], katalog: k }).join("\n");
    expect(t).toMatch(/- k-0143 ·/);
    expect(t).not.toMatch(/- k-0142 ·/);
    expect(t).toContain("1 Einträge fehlen");
  });

  it("enthält das Format der Antwort", () => {
    expect(text).toContain('"effekt": "zahl-zaehler"');
    expect(text).toContain('"katalog": "k-0142"');
    expect(text).toContain("Ein Mensch bestätigt ihn");
  });

  it("sagt es, wenn es keine Stücke, keinen Katalog und keine Regeln gibt", () => {
    const leer = bauAuftrag(plan, { stuecke: [], katalog: [] }).join("\n");
    expect(leer).toContain("Keine aktiven Stücke");
    expect(leer).toContain("Der Katalog ist leer");
    expect(leer).toContain("(Keine aktiven Regeln.)");
  });
});

describe("wendeStoryboardAn", () => {
  const kopf = { hook: "Warum deine Küche anders aussieht" };

  it("übernimmt eine Grafik als Verweis auf eine zu rendernde Datei und legt die Renderliste an", () => {
    const r = wendeStoryboardAn(basis(), { ...kopf, overlays: [ov({ t: 2, params: { wert: 7, suffix: " von 10" } })] }, ctx());
    expect(r.plan.overlays).toEqual([{ datei: "renders/c-0007/zahl-zaehler-01.webm", effekt: "zahl-zaehler", t: 2, dauer: 2.6, begruendung: "Kennzahl im Skript, Zahl wirkt stärker als Wort" }]);
    expect(r.renderListe).toEqual([{ name: "zahl-zaehler-01", effekt: "zahl-zaehler", datei: "renders/c-0007/zahl-zaehler-01.webm", t: 2, dauer: 2.6, werte: { wert: 7, suffix: " von 10" } }]);
    expect(r.verworfen).toEqual([]);
  });

  it("übernimmt B-Roll mit Quelle, Einstieg bei den besten Sekunden und Begründung", () => {
    const r = wendeStoryboardAn(basis(), { ...kopf, overlays: [broll("k-0142", 3)] }, ctx());
    expect(r.plan.broll).toEqual([{ quelle: "broll-k-0142", katalog: "k-0142", t: 3, dauer: 1.5, von: 1.2, begruendung: "Zeigt die Aussage, bringt Bildwechsel" }]);
    expect(r.plan.quellen.map((q) => q.id)).toEqual(["a", "broll-k-0142"]);
  });

  it("beginnt B-Roll ohne beste Sekunden bei 0", () => {
    const r = wendeStoryboardAn(basis(), { ...kopf, overlays: [broll("k-0143", 3)] }, ctx({ imLetztenVideoDerMarke: [] }));
    expect(r.plan.broll[0]!.von).toBe(0);
  });

  it("verwirft Fotos, nicht sondierte Dateien und alles, was die Prüfung des Storyboards ablehnt, mit Grund", () => {
    const sb = { ...kopf, overlays: [broll("k-0200", 2, 2), broll("k-0143", 4, 1.5), broll("k-9999", 6), ov({ effekt: "orbit", t: 5 }), broll("k-0142", 5.5)] };
    const r = wendeStoryboardAn(basis(), sb, ctx({ brollQuellen: new Map([["k-0142", brollQuelle("k-0142")]]), imLetztenVideoDerMarke: [] }));
    const gruende = r.verworfen.map((v) => v.grund);
    expect(gruende.some((g) => g.includes("Foto") && g.includes("Ken Burns"))).toBe(true);
    expect(gruende.some((g) => g.includes("nicht sondiert"))).toBe(true);
    expect(gruende.some((g) => g.includes("existiert nicht"))).toBe(true);
    expect(gruende.some((g) => g.includes("kein Stück der Bibliothek"))).toBe(true);
    expect(r.plan.broll.map((b) => b.katalog)).toEqual(["k-0142"]);
  });

  it("verwirft B-Roll aus dem letzten Video der Marke, auch ohne Liste, wenn der Katalog es verrät", () => {
    const r = wendeStoryboardAn(basis(), { ...kopf, overlays: [broll("k-0143", 3)] }, ctx());
    expect(r.plan.broll).toEqual([]);
    expect(r.verworfen[0]!.grund).toContain("letzten Video");
  });

  it("lässt B-Roll zu, die zuletzt in einem Video einer anderen Marke lief, und verwirft die aus dem letzten Video derselben", () => {
    const k = [
      KatalogEintrag.parse({ ...katalog[0], zuletztGenutzt: { datum: "2026-10-01", projekt: "Küche [alperna]" } }),
      KatalogEintrag.parse({ ...katalog[1], zuletztGenutzt: { datum: "2026-10-09", projekt: "Bäckerei [kunde-x]" } }),
    ];
    const r = wendeStoryboardAn(basis(), { ...kopf, overlays: [broll("k-0142", 2), broll("k-0143", 5)] }, ctx({ katalog: k }));
    expect(r.plan.broll.map((b) => b.katalog)).toEqual(["k-0143"]);
    expect(r.verworfen[0]!.grund).toContain("letzten Video");
  });

  it("verwirft Einträge, die hinter dem Ende des Videos liegen", () => {
    const r = wendeStoryboardAn(basis(), { ...kopf, overlays: [ov({ t: 500 })] }, ctx());
    expect(r.plan.overlays).toEqual([]);
    expect(r.verworfen[0]!.grund).toMatch(/Endet bei/);
  });

  it("ordnet nach Zeit, nummeriert die Grafiken in dieser Reihenfolge und lässt Stücke ohne Status «aktiv» nur mit nurAktive=false zu", () => {
    const gebaut = stueckZahl({ id: "neue-karte", status: "gebaut", freigabe: undefined, einsatz: undefined });
    const sb = { ...kopf, overlays: [ov({ t: 5 }), ov({ effekt: "neue-karte", t: 1, dauer: 2 }), ov({ t: 3, dauer: 1.5 })] };
    const streng = wendeStoryboardAn(basis(), sb, ctx({ stuecke: [stueckZahl(), gebaut] }));
    expect(streng.plan.overlays.map((o) => [o.effekt, o.t])).toEqual([["zahl-zaehler", 3], ["zahl-zaehler", 5]]);
    expect(streng.renderListe.map((x) => x.name)).toEqual(["zahl-zaehler-01", "zahl-zaehler-02"]);
    const entwurf = wendeStoryboardAn(basis(), sb, ctx({ stuecke: [stueckZahl(), gebaut], nurAktive: false }));
    expect(entwurf.plan.overlays.map((o) => o.effekt)).toEqual(["neue-karte", "zahl-zaehler", "zahl-zaehler"]);
  });

  it("markiert betonte Wörter nach der Nummer in der Timeline, auch wenn die Wörter im Plan anders geordnet sind", () => {
    const p = basis();
    const umgekehrt: Schnittplan = { ...p, woerter: [...p.woerter].reverse() };
    const tw = woerterMitHerkunft(umgekehrt, platziere(umgekehrt));
    const nKueche = tw.findIndex((w) => w.text === "Küche");
    const nStauraum = tw.findIndex((w) => w.text === "Stauraum.");
    const r = wendeStoryboardAn(umgekehrt, { ...kopf, overlays: [], betonung: [nKueche, nStauraum, 999] }, ctx());
    expect(r.plan.woerter.filter((w) => w.betont).map((w) => w.text).sort()).toEqual(["Küche", "Stauraum."]);
    expect(r.betont.map((b) => b.text)).toEqual(["Küche", "Stauraum."]);
    expect(r.warnungen.join()).toContain("Wort Nummer 999");
  });

  it("ersetzt frühere Ergebnisse statt sie zu häufen", () => {
    const erst = wendeStoryboardAn(basis(), { ...kopf, overlays: [broll("k-0142", 3), ov({ t: 1 })], betonung: [2] }, ctx());
    const zweit = wendeStoryboardAn(erst.plan, { ...kopf, overlays: [ov({ t: 4 })], betonung: [5] }, ctx());
    expect(zweit.plan.broll).toEqual([]);
    expect(zweit.plan.quellen.map((q) => q.id)).toEqual(["a"]);
    expect(zweit.plan.overlays.map((o) => o.t)).toEqual([4]);
    expect(zweit.plan.woerter.filter((w) => w.betont)).toHaveLength(1);
  });

  it("liefert einen Plan, den die Prüfung des Schnittplans ohne Fehler annimmt", () => {
    const r = wendeStoryboardAn(basis(), { ...kopf, overlays: [ov({ t: 1 }), broll("k-0142", 4)] }, ctx());
    const fehler = pruefeSchnittplan(r.plan, { katalog, stuecke: [stueckZahl()] }).filter((b) => b.stufe === "fehler");
    expect(fehler).toEqual([]);
  });

  it("wirft bei einem Storyboard ohne Liste «overlays»", () => {
    expect(() => wendeStoryboardAn(basis(), { hook: "x" }, ctx())).toThrow(/overlays/);
  });
});

describe("LIESMICH nennt betonte Wörter", () => {
  it("mit Zeit in der Timeline, und nichts, wenn keines betont ist", () => {
    const lib = ladePresets(path.join(root, "presets"));
    const exp = findePreset(lib, "export", "reel");
    const aud = findePreset(lib, "audio", "standard");
    const r = wendeStoryboardAn(basis(), { hook: "x", overlays: [], betonung: [5] }, ctx());
    const mit = liesmich({ plan: r.plan, dauer: 5, seiten: 3, befunde: [], export: exp, audio: aud, umgewandelt: [], dateien: ["plan.json"] });
    expect(mit).toContain("## Betonte Wörter");
    expect(mit).toMatch(/- [\d,]+ s: Küche/);
    const ohne = liesmich({ plan: basis(), dauer: 5, seiten: 3, befunde: [], export: exp, audio: aud, umgewandelt: [], dateien: ["plan.json"] });
    expect(ohne).not.toContain("Betonte Wörter");
  });
});

describe("wendeStoryboardAn: Zooms am Schluss", () => {
  const profil: Schnittprofil = { laengstePause: 0.4, laengsteEinstellung: 5, woerterJeUntertitel: { min: 2, max: 3 }, hookMaxSekunden: 2, zoomTempo: "mittel", zoom: { modus: "betonung", maxProMinute: 20 }, minClip: 0.7, textlaengen: {} };
  const kopf = { hook: "Warum deine Küche anders aussieht", overlays: [] };
  const zoom = (wort: number, extra: Record<string, unknown> = {}) => ({ wort, dauer: 1.2, begruendung: "Betontes Wort, die Zahl soll hängen bleiben", ...extra });
  const mit = (sb: Record<string, unknown>, p: Schnittprofil = profil) => wendeStoryboardAn(basis(), { ...kopf, ...sb }, ctx({ profil: p }));
  const gezoomt = (r: ReturnType<typeof mit>) => r.plan.clips.filter((c) => c.zoom > 1);

  it("setzt einen Zoom auf ein betontes Wort: Das Mittelstück bekommt die Stufe des Zoom-Tempos, die Länge bleibt", () => {
    const vorher = platziere(basis()).gesamtFrames;
    const r = mit({ betonung: [5], zooms: [zoom(5)] });
    expect(r.verworfeneZooms).toEqual([]);
    expect(r.zooms).toHaveLength(1);
    expect(r.zooms[0]).toMatchObject({ wort: 5, text: "Küche", stufe: 1.1 });
    expect(r.zooms[0]!.t).toBeCloseTo(r.betont[0]!.t - 0.1, 3);
    expect(gezoomt(r)).toHaveLength(1);
    expect(platziere(r.plan).gesamtFrames).toBe(vorher);
  });

  it("nimmt die Stufe aus dem Eintrag, wenn er eine nennt", () => {
    const r = mit({ betonung: [5], zooms: [zoom(5, { stufe: 1.2 })] });
    expect(gezoomt(r)[0]!.zoom).toBe(1.2);
  });

  it("verwirft einen Zoom auf einem Wort, das nicht betont ist", () => {
    const r = mit({ betonung: [5], zooms: [zoom(9)] });
    expect(r.verworfeneZooms[0]!.grund).toMatch(/nur auf betonten Wörtern: Wort 9/);
    expect(gezoomt(r)).toHaveLength(0);
  });

  it("verwirft alle Zooms, wenn die Marke keine will (Modus «aus» oder Tempo «langsam»)", () => {
    for (const p of [{ ...profil, zoom: { modus: "aus" as const, maxProMinute: 20 } }, { ...profil, zoomTempo: "langsam" as const }]) {
      const r = mit({ betonung: [5], zooms: [zoom(5)] }, p);
      expect(r.verworfeneZooms[0]!.grund).toMatch(/aus/);
      expect(gezoomt(r)).toHaveLength(0);
    }
  });

  it("begrenzt die Zahl auf das Schnittprofil: Bei 9 s Video und 4 je Minute ein Zoom", () => {
    const p = { ...profil, zoom: { modus: "betonung" as const, maxProMinute: 4 } };
    const r = mit({ betonung: [5, 13], zooms: [zoom(5), zoom(13)] }, p);
    expect(r.zooms).toHaveLength(1);
    expect(r.verworfeneZooms[0]!.grund).toMatch(/Mehr als 1 Zooms/);
  });

  it("verlangt einen Abstand von einer Sekunde zwischen zwei Zooms", () => {
    const r = mit({ betonung: [4, 5], zooms: [zoom(4, { dauer: 0.8 }), zoom(5, { dauer: 0.8 })] });
    expect(r.zooms).toHaveLength(1);
    expect(r.verworfeneZooms[0]!.grund).toMatch(/zu nah am Zoom/);
  });

  it("lehnt einen ungültigen Eintrag einzeln ab, ohne das Storyboard zu kippen", () => {
    const r = mit({ betonung: [5, 13], zooms: [{ wort: 5, dauer: 0.2, begruendung: "Betontes Wort, Zahl" }, zoom(13)] });
    expect(r.verworfeneZooms[0]!.grund).toMatch(/Zoom ungültig: dauer/);
    expect(r.zooms.map((z) => z.wort)).toEqual([13]);
    const ohneBegruendung = mit({ betonung: [5], zooms: [{ wort: 5 }] });
    expect(ohneBegruendung.verworfeneZooms[0]!.grund).toMatch(/begruendung/);
  });

  it("setzt ohne Schnittprofil keinen Zoom (Startwert: aus)", () => {
    const r = wendeStoryboardAn(basis(), { ...kopf, betonung: [5], zooms: [zoom(5)] }, ctx());
    expect(r.zooms).toHaveLength(0);
    expect(r.verworfeneZooms).toHaveLength(1);
  });

  it("ersetzt die Zooms eines früheren Storyboards, statt sie zu sammeln", () => {
    const eins = mit({ betonung: [5], zooms: [zoom(5)] });
    const zwei = wendeStoryboardAn(eins.plan, { ...kopf, betonung: [13], zooms: [zoom(13)] }, ctx({ profil }));
    expect(gezoomt(zwei)).toHaveLength(1);
    expect(zwei.zooms[0]!.wort).toBe(13);
  });

  it("der Auftrag sagt, wann gezoomt werden darf und dass ein Zoom kein Bildwechsel ist", () => {
    const text = bauAuftrag(basis(), { stuecke: [], katalog: [], profil }).join("\n");
    expect(text).toContain("Zooms nur auf betonten Wörtern, höchstens 20 je Minute");
    expect(text).toContain("ein Zoom zählt nicht als Bildwechsel");
    const aus = bauAuftrag(basis(), { stuecke: [], katalog: [], profil: { ...profil, zoom: { modus: "aus", maxProMinute: 4 } } }).join("\n");
    expect(aus).toContain("Keine Zooms");
  });
});
