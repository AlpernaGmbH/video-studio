/*
 * Browser-Test des Prüfplatzes mit nachgebautem Notion-Konnektor (window.claude).
 * Der Mock liefert die Formen, die notion-query-data-sources (Modus view) und notion-update-page wirklich liefern
 * (beobachtet an der echten Datenbank). Er ersetzt NICHT den echten Konnektor: Die Zustimmungsabfrage von claude.ai
 * und echte Fehlerfälle des Konnektors lassen sich hier nicht prüfen.
 *
 * Aufruf (Playwright ist keine Abhängigkeit des Repos, es reicht eine globale Installation):
 *   npm run studio -- pruefplatz bauen
 *   NODE_PATH=$(npm root -g) node scripts/pruefplatz-test.cjs [.cache/pruefplatz.html]
 * Chrome: PLAYWRIGHT_BROWSERS_PATH oder `npx playwright install chromium`.
 */
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const datei = path.resolve(process.argv[2] || path.join(__dirname, "..", ".cache", "pruefplatz.html"));
const html = fs.readFileSync(datei, "utf8");
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

const zeile = (o) => ({
  "Look-Runde": 0, "Entscheid-Grund": "", "Warum nichts passt": "Der Zahl-Zähler zeigt einen einzelnen Wert.", Projekt: "P-023",
  Pitch: "Eine Linie über fünf Messpunkte.<br><br>Zeigt: Anfangs- und Endwert.", "Look-Notiz": "", "Look-Wahl von": "", Quelle: "video", Entscheid: "offen",
  "OneDrive-Ordner": "Studio/daten/ideen/m-001", "Abnahme von": "", Aufwand: "mittel", Satz: "Der Wert fiel über fünf Scans von 97 auf 60.", Bilder: "", Stueck: "",
  "Entscheid von": "", "Abnahme-Notiz": "", Abnahme: "offen", Signale: '["verlauf"]', ...o,
});
const ZEILEN = () => [
  zeile({ "Idee-ID": "m-001", Titel: "Wert-Verlauf", Status: "pitch", url: "https://app.notion.com/p/3fc6be186e9b81c98a0dc59f8e83312b" }),
  zeile({ "Idee-ID": "m-002", Titel: "Vergleichs-Balken", Status: "looks", "Look-Runde": 1, Satz: "Vorher 12, nachher 31 Anfragen.", url: "https://app.notion.com/p/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1",
    Bilder: "a: https://bilder.test/a.png | Plakat. Grosse Zahl, Akzentfläche\nb: https://bilder.test/b.png | Interface. Karte mit Raster\nc: https://bilder.test/c.png | Editorial. Dünne Linien" }),
  zeile({ "Idee-ID": "m-003", Titel: "Prozess-Pfeile", Status: "render_geprueft", Stueck: "prozess-pfeile", Satz: "Erst Termin, dann Offerte, dann Start.", url: "https://app.notion.com/p/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa2",
    Bilder: "r1: https://bilder.test/r1.png | bei 1,2 s\nr2: https://bilder.test/r2.png | bei 2,0 s" }),
  zeile({ "Idee-ID": "m-004", Titel: "Zeitleiste", Status: "pitch", Entscheid: "freigegeben", "Entscheid von": "Leander", url: "https://app.notion.com/p/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa3" }),
  zeile({ "Idee-ID": "m-005", Titel: "Zahl-Zähler", Status: "in_bibliothek", url: "https://app.notion.com/p/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa4" }),
  zeile({ "Idee-ID": "m-006", Titel: "Checkliste", Status: "pitch", Satz: "Fünf Dinge vor dem Start.", url: "https://app.notion.com/p/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa5" }),
];

const ARCHIV = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "notion.json"), "utf8")).archiv;
const ANSICHTEN = (() => {
  const n = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "notion.json"), "utf8"));
  return { idee: n.motionIdeen.ansicht, inhalte: n.inhalte.ansicht, marken: n.marken.ansicht };
})();
const MARKE_URL = "https://app.notion.com/p/3fc6be186e9b81df9141ebe5778a86ff";
const MARKE_ID = "3fc6be186e9b81df9141ebe5778a86ff";
const inhaltUrl = (n) => "https://app.notion.com/p/" + String(n).padStart(32, "b");
const inhaltId = (n) => String(n).padStart(32, "b");
const MARKEN = (gate0 = "offen", von = "") => [{ Typ: "Eigene", "Gate 0": gate0, "Gate 0 von": von, "Marken-ID": "alperna", Name: "Alperna", Notizen: "Es fehlen noch Logo, Caption-Preset und Schlusskarte.", url: MARKE_URL }];
const inhalt = (n, o) => ({
  "Inhalt-ID": "c-" + String(n).padStart(4, "0"), Titel: "Inhalt " + n, Format: "LinkedIn-Post", Profil: "Andrej", Plattformen: '["LinkedIn"]', Marke: JSON.stringify([MARKE_URL]), Quelle: "Manuell", Referenz: "",
  Hook: "Dreissig Minuten Wartezeit sind kein Naturgesetz " + n + ".", Winkel: "Ein Praxisteam zeigt, wie es die Wartezeit halbiert hat.", Beleg: "Praxis Hofer, Herisau: Wartezeit von 32 auf 14 Minuten.",
  Aufwand: "Nur Text", Status: "Pitch bereit", "Tor I Entscheid": "offen", "Tor P Entscheid": "offen", "Offene Markierungen": 0, url: inhaltUrl(n), ...o,
});
const INHALTE = () => [
  inhalt(1, { Titel: "Wartezeit" }),
  inhalt(2, { Titel: "Messestand", Hook: "Drei Tage bis zum fertigen Stand.", Beleg: "Schreinerei Bruderer: Aufbau in drei Tagen." }),
  inhalt(3, { Titel: "Entwurf Zahnarzt", Status: "Entwurf fertig", "Offene Markierungen": 0 }),
  inhalt(4, { Titel: "In Arbeit", Status: "In Produktion" }),
  inhalt(5, { Titel: "Wartet", "Tor I Entscheid": "freigegeben", "Tor I von": "Leander" }),
  inhalt(6, { Titel: "Mit Rohstoff", Beleg: 'Illustration. Rohstoff: <mention-page url="https://app.notion.com/p/3fc6be186e9b81a0af4bfa3182e64f54">Marketing System</mention-page>', Hook: "Ganz anderer Satz ohne Bezug 6.", Status: "Neu" }),
];
const SEITENTEXT = "Praxis Hofer in Herisau hat die Wartezeit von 32 auf 14 Minuten gesenkt.\n\nWie das ging, steht hier.";

/** Wird vor der Seite ausgeführt: baut window.claude mit Notion-Mock. */
function initSkript({ mitMcp, ZEILEN, optionen, ansichten, inhalteZeilen, markenZeilen, seitentext }) {
  const rows = ZEILEN;
  const calls = [];
  window.__calls = calls;
  window.__rows = rows;
  window.__inhalte = inhalteZeilen;
  window.__marken = markenZeilen;
  const alle = () => [rows, inhalteZeilen, markenZeilen];
  window.__hook = {};
  const antwort = (obj) => ({ content: [{ type: "text", text: JSON.stringify(obj) }], payload: obj });
  const mcp = {
    async callTool(server, tool, input) {
      calls.push({ server, tool, input: JSON.parse(JSON.stringify(input)) });
      if (window.__hook.vor) await window.__hook.vor(tool, input, rows);
      if (optionen.fehlerBeimSchreiben && tool === "notion-update-page") throw { code: optionen.fehlerBeimSchreiben, message: "x" };
      if (tool === "notion-query-data-sources") {
        // Nur der Modus «view» ist erlaubt: SQL und «rows» zählen gegen das knappe Kontingent des Arbeitsbereichs.
        if (input.data.mode !== "view") throw { code: "tool_error", message: "usage_limit_reached" };
        if (optionen.fehlerAnsicht && input.data.view_url === ansichten[optionen.fehlerAnsicht]) throw { code: "tool_error", message: "Ansicht nicht lesbar" };
        const quelle = input.data.view_url === ansichten.inhalte ? inhalteZeilen : input.data.view_url === ansichten.marken ? markenZeilen : rows;
        const start = input.data.start_cursor ? Number(input.data.start_cursor) : 0;
        const size = optionen.seitenGroesse || 100;
        const seite = quelle.slice(start, start + size);
        const mehr = start + size < quelle.length;
        return antwort({ results: JSON.parse(JSON.stringify(seite)), has_more: mehr, ...(mehr ? { next_cursor: String(start + size) } : {}) });
      }
      if (tool === "notion-update-page") {
        const r = alle().flat().find((x) => x.url.replace(/\W/g, "").includes(input.page_id.replace(/-/g, "")));
        if (!r) throw { code: "tool_error", message: "nicht gefunden" };
        for (const [k, v] of Object.entries(input.properties)) { if (v === null) delete r[k]; else r[k] = v; }
        return antwort({ page_id: input.page_id });
      }
      if (tool === "notion-fetch") {
        if (optionen.fehlerBeimLesenDerSeite) throw { code: "tool_error", message: "Seite nicht lesbar" };
        return antwort({ metadata: { type: "page" }, title: "Seite", url: "x", text: '<page url="x">\n<properties>\n{}\n</properties>\n<content>\n' + seitentext + '\n</content>\n</page>' });
      }
      throw { code: "bad_request", message: "unbekannt " + tool };
    },
  };
  const user = { async me() { return { id: "u_1", name: optionen.name ?? "", isOwner: true, canEdit: true }; } };
  window.claude = { use: async (n) => (n === "mcp" ? (mitMcp ? mcp : null) : n === "user" ? user : null) };
}

(async () => {
  const browser = await chromium.launch();
  let bestanden = 0;
  const fehler = [];
  const t = async (name, fn) => {
    try { await fn(); bestanden++; console.log("  ok   " + name); } catch (e) { fehler.push(name); console.log("  FAIL " + name + "\n       " + String(e.message).split("\n").slice(0, 4).join("\n       ")); }
  };

  async function seite({ mitMcp = true, optionen = {}, breite = 1100, hoehe = 900, inhalte = null, marken = null, farbschema = "light", ideen = null } = {}) {
    const ctx = await browser.newContext({ viewport: { width: breite, height: hoehe }, colorScheme: farbschema });
    const page = await ctx.newPage();
    const konsole = [];
    const hosts = new Set();
    page.on("console", (m) => { if (["error", "warning"].includes(m.type())) konsole.push(m.type() + ": " + m.text()); });
    page.on("pageerror", (e) => konsole.push("pageerror: " + e.message));
    // Schriften und Bilder: nichts geht nach draussen
    await page.route("**/*", (route) => {
      const u = route.request().url();
      if (!u.startsWith("data:") && !u.startsWith("about:")) hosts.add(new URL(u).host);
      if (u.startsWith("https://bilder.test/")) return route.fulfill({ status: 200, contentType: "image/png", body: PNG });
      if (u.startsWith("https://fonts.")) return route.abort();
      if (u.startsWith("data:") || u.startsWith("about:")) return route.continue();
      return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html });
    });
    await page.addInitScript(initSkript, { mitMcp, ZEILEN: ideen || ZEILEN(), optionen, ansichten: ANSICHTEN, inhalteZeilen: inhalte || [], markenZeilen: marken || [], seitentext: SEITENTEXT });
    await page.goto("https://pruefplatz.test/");
    // Gewartet wird, bis weder der Platzhalter «Lade …» noch der Hinweis «ohne Verbindung» übrig ist
    if (mitMcp) await page.waitForFunction(() => { const a = document.querySelector("#ansicht"); return !!a && !/Lade aus Notion|Hier erscheint, was auf dich wartet/.test(a.textContent) && !!a.querySelector(".karte"); });
    return { page, ctx, konsole, hosts };
  }
  const calls = (page) => page.evaluate(() => window.__calls);
  const schreibaufrufe = async (page) => (await calls(page)).filter((c) => c.tool === "notion-update-page");
  const eigenschaften = async (page) => (await schreibaufrufe(page)).map((c) => c.input);

  /** Karte auf «Heute» nach ihrer Überschrift (genau), Reihe auf einer Plattformseite nach dem Titel. */
  const karte = (page, titel) => page.locator(".heute-karte").filter({ has: page.getByRole("heading", { name: titel, exact: true }) });
  const pruefen = (page, titel) => karte(page, titel).getByRole("button").click();
  const reihe = (page, titel) => page.locator(".reihe").filter({ has: page.locator(".titel", { hasText: titel }) });
  const ueberschriften = (page) => page.locator("#ansicht .heute-karte h3").allTextContents();
  const ueberlauf = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const detailText = (page) => page.locator("#detail").textContent();

  console.log("Prüfplatz im Headless-Chrome: " + datei);

  /* ---------- Heute: Motion-Ideen (wie bisher) ---------- */

  await t("Heute: vier Entscheide offen, einer bei Claude, Zähler stimmen", async () => {
    const { page, konsole, ctx } = await seite();
    assert.equal(await page.locator("#ansicht .heute-karte").count(), 4); // 2 Pitches, Looks, Abnahme
    assert.equal(await page.locator("#z-heute").textContent(), "4");
    assert.deepEqual(await ueberschriften(page), ["Wert-Verlauf", "Vergleichs-Balken", "Prozess-Pfeile", "Checkliste"]);
    assert.match(await page.locator("#bei-claude").textContent(), /1 Entscheid liegt bei Claude/); // Zeitleiste
    assert.doesNotMatch(await page.locator("#ansicht").textContent(), /Zeitleiste/); // steht in keiner Liste
    const erster = (await calls(page))[0];
    assert.equal(erster.tool, "notion-query-data-sources");
    assert.equal(erster.input.data.mode, "view"); // nie «rows» oder SQL: Kontingent
    assert.match(erster.input.data.view_url, /^view:\/\//);
    assert.deepEqual(konsole.filter((k) => !/fonts|ERR_FAILED|Failed to load resource/.test(k)), []);
    await ctx.close();
  });

  await t("Freigabe ohne Namen wird nicht gesendet", async () => {
    const { page, ctx } = await seite();
    await pruefen(page, "Wert-Verlauf");
    await page.getByRole("button", { name: "Freigeben" }).click();
    assert.match(await page.locator("#status").textContent(), /Name fehlt/);
    assert.equal((await schreibaufrufe(page)).length, 0);
    await ctx.close();
  });

  await t("Systemname als Entscheider wird abgelehnt", async () => {
    const { page, ctx } = await seite();
    await page.fill("#name", "Claude");
    await pruefen(page, "Wert-Verlauf");
    await page.getByRole("button", { name: "Freigeben" }).click();
    assert.match(await page.locator("#status").textContent(), /Dieser Name gilt nicht/);
    assert.equal((await schreibaufrufe(page)).length, 0);
    await ctx.close();
  });

  await t("Freigabe: frisch lesen, genau die richtigen Felder schreiben, nachlesen, Karte verschwindet, Fenster schliesst", async () => {
    const { page, ctx } = await seite({ optionen: { name: "Andrej" } });
    await pruefen(page, "Wert-Verlauf");
    assert.match(await detailText(page), /Anfangs- und Endwert/); // <br> wurde Zeilenumbruch
    await page.getByRole("button", { name: "Freigeben" }).click();
    await page.waitForSelector("#status .meldung.gut");
    const w = await schreibaufrufe(page);
    assert.equal(w.length, 1);
    assert.equal(w[0].input.page_id, "3fc6be186e9b81c98a0dc59f8e83312b");
    assert.equal(w[0].input.command, "update_properties");
    assert.equal(w[0].input.properties.Entscheid, "freigegeben");
    assert.equal(w[0].input.properties["Entscheid von"], "Andrej");
    assert.match(w[0].input.properties["date:Entscheid am:start"], /^\d{4}-\d\d-\d\dT/);
    assert.equal(w[0].input.properties["date:Entscheid am:is_datetime"], 1);
    assert.deepEqual(Object.keys(w[0].input.properties).sort(), ["Entscheid", "Entscheid von", "date:Entscheid am:is_datetime", "date:Entscheid am:start"]);
    const reihenfolge = (await calls(page)).map((c) => c.tool);
    const i = reihenfolge.indexOf("notion-update-page");
    assert.equal(reihenfolge[i - 1], "notion-query-data-sources"); // frisch gelesen vor dem Schreiben
    assert.equal(reihenfolge[i + 1], "notion-query-data-sources"); // nachgelesen
    assert.equal(await page.locator("#z-heute").textContent(), "3");
    assert.equal(await page.locator("#huelle").isHidden(), true);
    assert.match(await page.locator("#status").textContent(), /Gespeichert/); // die Meldung steht nach dem Schliessen auf der Seite
    await ctx.close();
  });

  await t("Ablehnen: ein Wort reicht nicht, zwei Wörter schon", async () => {
    const { page, ctx } = await seite({ optionen: { name: "Andrej" } });
    await pruefen(page, "Checkliste");
    await page.getByRole("button", { name: "Ablehnen" }).click();
    const senden = page.getByRole("button", { name: "Ablehnung senden" });
    await page.fill("textarea", "Unbrauchbarwegen");
    assert.equal(await senden.isDisabled(), true);
    await page.fill("textarea", "Passt nicht zu unseren Videos");
    assert.equal(await senden.isDisabled(), false);
    await senden.click();
    await page.waitForSelector("#status .meldung.gut");
    const w = (await schreibaufrufe(page))[0].input.properties;
    assert.equal(w.Entscheid, "abgelehnt");
    assert.equal(w["Entscheid-Grund"], "Passt nicht zu unseren Videos");
    await ctx.close();
  });

  await t("Looks: drei Bilder, Wahl, «Keiner» braucht Notiz, Schreiben mit Name und Zeit", async () => {
    const { page, ctx } = await seite({ optionen: { name: "Leander" } });
    await pruefen(page, "Vergleichs-Balken");
    assert.equal(await page.locator(".look img").count(), 3);
    assert.equal(await page.locator(".look img").first().evaluate((i) => i.complete && i.naturalWidth > 0), true);
    const ok = page.getByRole("button", { name: "Look bestätigen" });
    assert.equal(await ok.isDisabled(), true);
    await page.locator(".keiner").click();
    assert.equal(await ok.isDisabled(), true); // «Keiner» ohne Notiz
    await page.fill("textarea", "Alle drei zu laut");
    assert.equal(await ok.isDisabled(), false);
    await page.locator(".look").nth(2).click();
    assert.equal(await ok.isDisabled(), false);
    await ok.click();
    await page.waitForSelector("#status .meldung.gut");
    const w = (await schreibaufrufe(page))[0].input.properties;
    assert.equal(w["Look-Wahl"], "c");
    assert.equal(w["Look-Wahl von"], "Leander");
    assert.equal(w["Look-Notiz"], "Alle drei zu laut");
    assert.ok(w["date:Look-Wahl am:start"]);
    await ctx.close();
  });

  await t("Abnahme: Standbilder, «Änderung nötig» verlangt Notiz", async () => {
    const { page, ctx } = await seite({ optionen: { name: "Andrej" } });
    await pruefen(page, "Prozess-Pfeile");
    assert.equal(await page.locator(".renders img").count(), 2);
    const aender = page.getByRole("button", { name: "Änderung nötig" });
    assert.equal(await aender.isDisabled(), true);
    await page.fill("textarea", "Pfeile dünner");
    assert.equal(await aender.isDisabled(), false);
    await aender.click();
    await page.waitForSelector("#status .meldung.gut");
    const w = (await schreibaufrufe(page))[0].input.properties;
    assert.equal(w.Abnahme, "aenderung");
    assert.equal(w["Abnahme-Notiz"], "Pfeile dünner");
    assert.equal(w["Abnahme von"], "Andrej");
    await ctx.close();
  });

  await t("Zwischenzeitlich entschieden: nichts wird überschrieben, Hinweis erscheint im Fenster", async () => {
    const { page, ctx } = await seite({ optionen: { name: "Andrej" } });
    await pruefen(page, "Wert-Verlauf");
    await page.evaluate(() => { window.__rows[0].Entscheid = "abgelehnt"; window.__rows[0]["Entscheid von"] = "Leander"; });
    await page.getByRole("button", { name: "Freigeben" }).click();
    await page.waitForSelector("#detail #status .meldung.fehler");
    assert.match(await page.locator("#status").textContent(), /Schon weiter/);
    assert.equal((await schreibaufrufe(page)).length, 0);
    assert.equal(await page.evaluate(() => window.__rows[0].Entscheid), "abgelehnt");
    await ctx.close();
  });

  await t("Mehr als eine Seite: alle Zeilen werden gelesen, auch die Freigabe findet die Zeile auf Seite 3", async () => {
    const { page, ctx } = await seite({ optionen: { name: "Andrej", seitenGroesse: 2 } });
    await page.click("#n-werkstatt");
    assert.equal(await page.locator("#k-ideen .gross").textContent(), "6");
    await page.click("#n-heute");
    await pruefen(page, "Checkliste"); // m-006 liegt auf Seite 3
    await page.getByRole("button", { name: "Freigeben" }).click();
    await page.waitForSelector("#status .meldung.gut");
    assert.equal((await schreibaufrufe(page)).length, 1);
    const q = (await calls(page)).filter((c) => c.tool === "notion-query-data-sources");
    assert.ok(q.every((c) => c.input.data.mode === "view"));
    assert.ok(q.some((c) => c.input.data.start_cursor), "Seite 2 wurde angefordert");
    await ctx.close();
  });

  await t("Verweigerter Zugriff und fehlende Verbindung haben je eigenen Text", async () => {
    for (const [code, muster] of [["approval_required", /nicht erlaubt/], ["needs_reauth", /nicht verbunden/], ["server_unavailable", /Unklar, ob es gespeichert/], ["blocked_by_policy", /gesperrt/]]) {
      const { page, ctx } = await seite({ optionen: { name: "Andrej", fehlerBeimSchreiben: code } });
      await pruefen(page, "Wert-Verlauf");
      await page.getByRole("button", { name: "Freigeben" }).click();
      await page.waitForSelector("#status .meldung.fehler");
      assert.match(await page.locator("#status").textContent(), muster, code);
      await ctx.close();
    }
  });

  /* ---------- Werkstatt ---------- */

  await t("Werkstatt: eine Seite mit drei Kacheln, Bibliothek, Motion-Ideen und Marke öffnen darunter", async () => {
    const { page, ctx } = await seite();
    await page.click("#n-werkstatt");
    assert.equal(await page.locator(".kachel").count(), 3);
    assert.equal(await page.locator("#werk-panel").count(), 0); // nichts aufgeklappt, bis man wählt
    await page.click("#k-bib");
    assert.ok(await page.locator("#werk-panel .stueck").count() >= 1);
    assert.equal(await page.locator("#werk-panel .stueck img").first().evaluate((i) => i.complete && i.naturalWidth > 0), true);
    assert.match(await page.locator("#werk-panel").textContent(), /Zahl-Zähler/);
    await page.click("#k-ideen");
    assert.equal(await page.locator("#werk-panel .reihe").count(), 6);
    await page.selectOption("#filter", "in_bibliothek");
    assert.equal(await page.locator("#werk-panel .reihe").count(), 1);
    await page.locator("#werk-panel .reihe").click();
    assert.match(await detailText(page), /Hier ist nichts zu entscheiden/); // nur ansehen: keine Entscheidung
    assert.equal(await page.locator("#detail").getByRole("button", { name: "Freigeben" }).count(), 0);
    await page.click("#detail-schliessen");
    await page.click("#k-marke");
    // Das Profil im Repo ist die Grundlage der Seite: Der erwartete Text hängt von seinem aktuellen Stand ab (Gate 0).
    const profilStatus = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "marken", "alperna.json"), "utf8")).status;
    assert.match(await page.locator("#werk-panel").textContent(), profilStatus === "freigegeben" ? /Freigegeben/ : /Platzhalter/);
    assert.equal(await page.locator("#werk-panel .farbe").count(), 4);
    await ctx.close();
  });

  await t("Ohne Notion-Verbindung: klarer Hinweis, Bibliothek und Marke gehen trotzdem", async () => {
    const { page, ctx } = await seite({ mitMcp: false });
    await page.waitForSelector("#status .meldung");
    assert.match(await page.locator("#status").textContent(), /Nur in Claude benutzbar/);
    await page.click("#n-werkstatt");
    await page.click("#k-bib");
    assert.ok(await page.locator("#werk-panel .stueck").count() >= 1);
    await page.click("#k-marke");
    assert.equal(await page.locator("#werk-panel .farbe").count(), 4);
    await ctx.close();
  });

  /* ---------- Gerüst: Seitenleiste, Seitenfenster, Hell und Dunkel ---------- */

  const mitInhalten = (o = {}) => seite({ inhalte: INHALTE(), marken: MARKEN("freigegeben", "Andrej"), optionen: { name: "Andrej" }, ...o });
  const mitOffenemGate0 = (o = {}) => seite({ inhalte: INHALTE(), marken: MARKEN(), optionen: { name: "Andrej" }, ...o });

  await t("Seitenleiste: drei Bereiche, der Name steht unten in der Leiste und nicht auf jeder Seite", async () => {
    const { page, ctx } = await mitInhalten({ breite: 1280 });
    assert.deepEqual(await page.locator("#nav .nav").evaluateAll((l) => l.map((e) => e.id)), ["n-heute", "n-instagram", "n-linkedin", "n-blog", "n-google", "n-werkstatt"]);
    assert.equal(await page.locator("#seite #name").count(), 1);
    assert.equal(await page.locator("#haupt #name").count(), 0);
    assert.equal(await page.locator("#n-heute").getAttribute("aria-current"), "page");
    for (const k of ["linkedin", "werkstatt"]) { await page.click("#n-" + k); assert.equal(await page.locator("#n-" + k).getAttribute("aria-current"), "page"); assert.equal(await page.locator("#name").isVisible(), true); }
    const leiste = await page.locator("#seite").boundingBox(), haupt = await page.locator("#haupt").boundingBox();
    assert.ok(leiste.x + leiste.width <= haupt.x + 1, "die Leiste steht links");
    await ctx.close();
  });

  await t("Kein seitliches Scrollen bei 390 und 1280 px: Heute, Plattform, Werkstatt und Seitenfenster", async () => {
    for (const breite of [390, 1280]) {
      const { page, ctx } = await mitInhalten({ breite });
      const pruefe = async (wo) => assert.ok((await ueberlauf(page)) <= 0, breite + " px, " + wo + ": " + (await ueberlauf(page)));
      await pruefe("Heute");
      await pruefen(page, "Entwurf Zahnarzt"); await page.waitForSelector(".entwurf"); await pruefe("Tor P im Fenster");
      await page.click("#detail-schliessen");
      await pruefen(page, "Vergleichs-Balken"); await pruefe("Looks im Fenster");
      await page.click("#detail-schliessen");
      await page.click("#n-linkedin"); await pruefe("LinkedIn");
      await page.click("#n-werkstatt"); await pruefe("Werkstatt");
      for (const k of ["#k-bib", "#k-ideen", "#k-marke"]) { await page.click(k); await pruefe(k); }
      await ctx.close();
    }
  });

  await t("Handy (390 px): die Leiste steht oben, das Fenster füllt die Breite, Knöpfe sind gross genug", async () => {
    const { page, ctx } = await mitInhalten({ breite: 390 });
    const leiste = await page.locator("#seite").boundingBox(), haupt = await page.locator("#haupt").boundingBox();
    assert.ok(leiste.y + leiste.height <= haupt.y + 1, "die Leiste steht über dem Inhalt");
    for (const b of await page.locator("#nav .nav").all()) assert.ok((await b.boundingBox()).height >= 43, "Berührfläche der Leiste");
    await pruefen(page, "Wartezeit");
    const d = await page.locator("#detail").boundingBox();
    assert.ok(Math.abs(d.width - 390) <= 1, "Fenster so breit wie der Bildschirm: " + d.width);
    for (const b of await page.locator("#detail .aktionen .knopf").all()) assert.ok((await b.boundingBox()).height >= 43, "Berührfläche im Fenster");
    await ctx.close();
  });

  await t("Seitenfenster: Dialog, Escape und Klick daneben schliessen, Fokus geht zurück, der Rest ist gesperrt", async () => {
    const { page, ctx } = await mitInhalten();
    const knopf = karte(page, "Wartezeit").getByRole("button");
    await knopf.focus();
    await page.keyboard.press("Enter");
    assert.equal(await page.locator("#detail").getAttribute("role"), "dialog");
    assert.equal(await page.locator("#detail").getAttribute("aria-modal"), "true");
    assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), "detail-schliessen");
    assert.equal(await page.locator("#haupt").evaluate((e) => e.inert), true);
    for (let i = 0; i < 12; i++) { await page.keyboard.press("Tab"); assert.equal(await page.evaluate(() => !!document.activeElement.closest("#detail")), true, "Tab bleibt im Fenster"); }
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#huelle").isHidden(), true);
    assert.equal(await page.locator("#haupt").evaluate((e) => e.inert), false);
    assert.equal(await page.evaluate(() => document.activeElement.closest(".heute-karte") && document.activeElement.closest(".heute-karte").querySelector("h3").textContent), "Wartezeit");
    await pruefen(page, "Messestand");
    await page.mouse.click(10, 400); // neben dem Fenster
    assert.equal(await page.locator("#huelle").isHidden(), true);
    await page.click("#n-linkedin"); // auch aus einer Zeile: der Fokus kehrt zu ihr zurück
    await reihe(page, "In Arbeit").focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");
    assert.equal(await page.evaluate(() => document.activeElement.dataset.id), "c-0004");
    await ctx.close();
  });

  await t("Die Hauptaktion bleibt im Seitenfenster sichtbar, auch bei langem Inhalt und kleinem Bildschirm", async () => {
    for (const [breite, hoehe] of [[1280, 520], [390, 640]]) {
      const { page, ctx } = await mitInhalten({ breite, hoehe });
      await pruefen(page, "Wartezeit");
      const b = await page.getByRole("button", { name: "Freigeben" }).boundingBox();
      assert.ok(b.y >= 0 && b.y + b.height <= hoehe + 1, breite + " px: Freigeben liegt im sichtbaren Bereich (" + Math.round(b.y + b.height) + " von " + hoehe + ")");
      await ctx.close();
    }
  });

  await t("Design: Hell mit Papier, Tinte und Orange, Dunkel über die Systemeinstellung, Schriften nur von Google", async () => {
    const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };
    const hell = await mitInhalten({ farbschema: "light" });
    assert.equal(await hell.page.evaluate(() => getComputedStyle(document.body).backgroundColor), rgb("#f3f1ec"));
    assert.equal(await hell.page.locator("#seite").evaluate((e) => getComputedStyle(e).backgroundColor), rgb("#0f0f0e"));
    assert.equal(await hell.page.locator(".heute-karte").first().evaluate((e) => getComputedStyle(e).backgroundColor), rgb("#fffdf8"));
    assert.equal(await hell.page.locator(".heute-karte .knopf.primaer").first().evaluate((e) => getComputedStyle(e).backgroundColor), rgb("#0f0f0e")); // Primär = Tinte
    assert.equal(await hell.page.locator(".heute-karte .knopf.primaer").first().evaluate((e) => getComputedStyle(e).borderTopLeftRadius), "999px"); // pillenförmig
    assert.equal(await hell.page.locator(".heute-karte").first().evaluate((e) => getComputedStyle(e).borderTopLeftRadius), "12px");
    assert.equal(await hell.page.locator("#n-heute").evaluate((e) => getComputedStyle(e).borderLeftColor), rgb("#f0532f")); // aktiver Punkt mit Orange-Streifen
    assert.equal(await hell.page.locator(".chip.wartet").first().evaluate((e) => getComputedStyle(e).backgroundColor), rgb("#ffc93c")); // Sonne für «wartet auf dich»
    assert.match(await hell.page.locator("h1").evaluate((e) => getComputedStyle(e).fontFamily), /Geist/);
    assert.match(await hell.page.locator("h1 em").evaluate((e) => getComputedStyle(e).fontFamily + getComputedStyle(e).fontStyle), /Instrument Serif.*italic/);
    assert.match(await hell.page.locator("#z-heute").evaluate((e) => getComputedStyle(e).fontFamily), /Geist Mono/);
    const aussen = [...hell.hosts].filter((h) => !["pruefplatz.test", "bilder.test", "fonts.googleapis.com", "fonts.gstatic.com"].includes(h));
    assert.deepEqual(aussen, []);
    await hell.ctx.close();
    const dunkel = await mitInhalten({ farbschema: "dark" });
    assert.equal(await dunkel.page.evaluate(() => getComputedStyle(document.body).backgroundColor), rgb("#0f0f0e"));
    assert.equal(await dunkel.page.locator(".heute-karte").first().evaluate((e) => getComputedStyle(e).backgroundColor), rgb("#1a1a18"));
    assert.equal(await dunkel.page.locator(".heute-karte .knopf.primaer").first().evaluate((e) => getComputedStyle(e).backgroundColor), rgb("#f3f1ec"));
    await dunkel.ctx.close();
    // data-theme gilt vor der Systemeinstellung
    const forciert = await mitInhalten({ farbschema: "light" });
    await forciert.page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    assert.equal(await forciert.page.evaluate(() => getComputedStyle(document.body).backgroundColor), rgb("#0f0f0e"));
    await forciert.ctx.close();
  });

  await t("Tastatur: Karten sind Knöpfe, die Wahl der Looks geht per Leertaste", async () => {
    const { page, ctx } = await seite({ optionen: { name: "Andrej" } });
    await karte(page, "Vergleichs-Balken").getByRole("button").focus();
    await page.keyboard.press("Enter");
    await page.locator(".look input").first().focus();
    await page.keyboard.press("Space");
    assert.equal(await page.locator(".look input").first().isChecked(), true);
    await ctx.close();
  });

  /* ---------- Heute mit Inhalten: Tor I, Tor P, Gate 0, Durchgang ---------- */

  await t("Heute zeigt nur, worauf ein Mensch wartet: kein Stand in Arbeit, Entschiedenes oder Neues", async () => {
    const { page, ctx } = await mitInhalten();
    assert.deepEqual(await ueberschriften(page), ["Wartezeit", "Messestand", "Entwurf Zahnarzt", "Wert-Verlauf", "Vergleichs-Balken", "Prozess-Pfeile", "Checkliste"]);
    assert.equal(await page.locator("#z-heute").textContent(), "7");
    for (const nicht of ["In Arbeit", "Wartet", "Mit Rohstoff"]) assert.equal(await karte(page, nicht).count(), 0, nicht); // In Produktion, Tor I entschieden, Neu
    assert.match(await page.locator("#bei-claude").textContent(), /2 Entscheide liegen bei Claude/); // c-0005 und Zeitleiste
    const mode = (await calls(page)).filter((c) => c.tool === "notion-query-data-sources").map((c) => c.input.data.mode);
    assert.ok(mode.length >= 3 && mode.every((m) => m === "view"));
    await ctx.close();
  });

  await t("Heute: Jede Karte hat genau eine Hauptaktion, Beispiele sind markiert und bleiben auf Heute", async () => {
    const rows = INHALTE(); rows[0].Titel = "Beispiel: Reel «Drei Fragen»";
    const { page, ctx } = await seite({ inhalte: rows, marken: MARKEN("freigegeben", "Andrej"), optionen: { name: "Andrej" } });
    for (const k of await page.locator(".heute-karte").all()) assert.equal(await k.getByRole("button").count(), 1);
    assert.match(await karte(page, "Beispiel: Reel «Drei Fragen»").textContent(), /Beispiel/);
    assert.equal(await karte(page, "Beispiel: Reel «Drei Fragen»").locator(".chip", { hasText: "Beispiel" }).count(), 1);
    await ctx.close();
  });

  await t("Gate 0 offen steht auf Heute als Karte; Tor I und Tor P zeigen die Warnung", async () => {
    const { page, ctx } = await mitOffenemGate0();
    assert.equal(await page.locator("#z-heute").textContent(), "8"); // 7 und Gate 0
    assert.equal((await ueberschriften(page))[0], "Alperna");
    await pruefen(page, "Wartezeit");
    assert.match(await detailText(page), /Gate 0 der Marke «Alperna» ist noch nicht freigegeben/);
    await ctx.close();
  });

  await t("Tor I: Freigabe schreibt genau Entscheid, Grund (leer), Name und Zeit, liest vorher frisch und danach nach", async () => {
    const { page, ctx } = await mitOffenemGate0();
    await pruefen(page, "Wartezeit");
    await page.getByRole("button", { name: "Freigeben" }).click();
    await page.waitForSelector("#status .meldung.gut");
    const w = await eigenschaften(page);
    assert.equal(w.length, 1);
    assert.equal(w[0].page_id, inhaltId(1));
    assert.deepEqual(Object.keys(w[0].properties).sort(), ["Tor I Entscheid", "Tor I Grund", "Tor I von", "date:Tor I am:is_datetime", "date:Tor I am:start"]);
    assert.equal(w[0].properties["Tor I Entscheid"], "freigegeben");
    assert.equal(w[0].properties["Tor I Grund"], null);
    assert.equal(w[0].properties["Tor I von"], "Andrej");
    assert.equal(w[0].properties["date:Tor I am:is_datetime"], 1);
    const rf = (await calls(page)).map((c) => c.tool + ":" + (c.input.data ? c.input.data.view_url : ""));
    const i = rf.findIndex((x) => x.startsWith("notion-update-page"));
    assert.ok(rf[i - 1].endsWith(ANSICHTEN.inhalte), "frisch aus der Ansicht Inhalte gelesen");
    assert.ok(rf[i + 1].endsWith(ANSICHTEN.inhalte), "danach nachgelesen");
    assert.equal(await page.locator("#z-heute").textContent(), "7");
    await ctx.close();
  });

  await t("Tor I: Name ist Pflicht, Systemnamen gelten nicht, nichts wird geschrieben", async () => {
    for (const [name, muster] of [["", /Name fehlt/], ["KI", /Dieser Name gilt nicht/]]) {
      const { page, ctx } = await mitInhalten({ optionen: { name } });
      if (name) await page.fill("#name", name);
      await pruefen(page, "Wartezeit");
      await page.getByRole("button", { name: "Freigeben" }).click();
      assert.match(await page.locator("#status").textContent(), muster);
      assert.equal((await schreibaufrufe(page)).length, 0);
      await ctx.close();
    }
  });

  await t("Tor I: Ablehnung braucht zwei Wörter und zehn Zeichen, Rückfrage braucht eine Frage", async () => {
    const { page, ctx } = await mitInhalten();
    await pruefen(page, "Wartezeit");
    await page.getByRole("button", { name: "Ablehnen" }).click();
    assert.equal(await page.evaluate(() => document.activeElement.tagName), "TEXTAREA"); // der Cursor steht im Feld
    const senden = page.getByRole("button", { name: "Ablehnung senden" });
    await page.fill("textarea", "Unbrauchbarwegen");
    assert.equal(await senden.isDisabled(), true);
    await page.fill("textarea", "Passt nicht zur Marke");
    assert.equal(await senden.isDisabled(), false);
    await senden.click();
    await page.waitForSelector("#status .meldung.gut");
    let w = (await eigenschaften(page))[0].properties;
    assert.equal(w["Tor I Entscheid"], "abgelehnt");
    assert.equal(w["Tor I Grund"], "Passt nicht zur Marke");
    await pruefen(page, "Messestand");
    await page.getByRole("button", { name: "Mit Frage zurück" }).click();
    const frage = page.getByRole("button", { name: "Frage senden" });
    assert.equal(await frage.isDisabled(), true);
    await page.fill("textarea", "Gibt es dazu ein Foto?");
    await frage.click();
    await page.waitForSelector("#status .meldung.gut");
    w = (await eigenschaften(page))[1].properties;
    assert.equal(w["Tor I Entscheid"], "Rückfrage");
    assert.equal(w["Tor I Grund"], "Gibt es dazu ein Foto?");
    await ctx.close();
  });

  await t("Tor I: Wurde die Zeile inzwischen entschieden, wird nichts überschrieben", async () => {
    const { page, ctx } = await mitInhalten();
    await pruefen(page, "Wartezeit");
    await page.evaluate(() => { window.__inhalte[0]["Tor I Entscheid"] = "abgelehnt"; window.__inhalte[0]["Tor I von"] = "Leander"; });
    await page.getByRole("button", { name: "Freigeben" }).click();
    await page.waitForSelector("#status .meldung.fehler");
    assert.match(await page.locator("#status").textContent(), /Schon weiter/);
    assert.equal((await schreibaufrufe(page)).length, 0);
    await ctx.close();
  });

  await t("Tor P: Der Entwurf wird aus der Notion-Seite geladen und gezeigt, Freigabe schreibt Tor P", async () => {
    const { page, ctx } = await mitOffenemGate0();
    await pruefen(page, "Entwurf Zahnarzt");
    await page.waitForSelector(".entwurf");
    assert.match(await page.locator(".entwurf").textContent(), /Wartezeit von 32 auf 14 Minuten gesenkt/);
    const f = (await calls(page)).find((c) => c.tool === "notion-fetch");
    assert.equal(f.input.id, inhaltId(3));
    await page.getByRole("button", { name: "Freigeben" }).click();
    await page.waitForSelector("#status .meldung.gut");
    const w = (await eigenschaften(page))[0];
    assert.equal(w.page_id, inhaltId(3));
    assert.deepEqual(Object.keys(w.properties).sort(), ["Tor P Entscheid", "Tor P Grund", "Tor P von", "date:Tor P am:is_datetime", "date:Tor P am:start"]);
    assert.equal(w.properties["Tor P Entscheid"], "freigegeben");
    assert.equal(w.properties["Tor P von"], "Andrej");
    await ctx.close();
  });

  await t("Tor P: Änderung braucht eine Anweisung, offene Markierungen werden gemeldet, ein Ladefehler blockiert nichts Falsches", async () => {
    const rows = INHALTE(); rows[2]["Offene Markierungen"] = 2;
    const { page, ctx } = await seite({ inhalte: rows, marken: MARKEN("freigegeben", "Andrej"), optionen: { name: "Andrej" } });
    await pruefen(page, "Entwurf Zahnarzt");
    await page.waitForSelector(".entwurf");
    assert.match(await detailText(page), /2 offene Markierung\(en\)/);
    assert.doesNotMatch(await detailText(page), /Gate 0 der Marke/);
    await page.getByRole("button", { name: "Änderung nötig" }).click();
    const senden = page.getByRole("button", { name: "Änderung senden" });
    assert.equal(await senden.isDisabled(), true);
    await page.fill("textarea", "Schluss kürzer");
    await senden.click();
    await page.waitForSelector("#status .meldung.gut");
    const w = (await eigenschaften(page))[0].properties;
    assert.equal(w["Tor P Entscheid"], "Änderung");
    assert.equal(w["Tor P Grund"], "Schluss kürzer");
    await ctx.close();
    const f = await seite({ inhalte: INHALTE(), marken: MARKEN(), optionen: { name: "Andrej", fehlerBeimLesenDerSeite: true } });
    await pruefen(f.page, "Entwurf Zahnarzt");
    await f.page.waitForSelector("#detail .warnung");
    assert.match(await detailText(f.page), /Der Entwurf liess sich nicht laden/);
    await f.ctx.close();
  });

  await t("Tor P: Wurde der Entwurf inzwischen entschieden, wird nichts überschrieben", async () => {
    const { page, ctx } = await mitInhalten();
    await pruefen(page, "Entwurf Zahnarzt");
    await page.waitForSelector(".entwurf");
    await page.evaluate(() => { window.__inhalte[2]["Tor P Entscheid"] = "Änderung"; window.__inhalte[2]["Tor P von"] = "Leander"; });
    await page.getByRole("button", { name: "Freigeben" }).click();
    await page.waitForSelector("#status .meldung.fehler");
    assert.match(await page.locator("#status").textContent(), /Schon weiter/);
    assert.equal((await schreibaufrufe(page)).length, 0);
    assert.equal(await page.evaluate(() => window.__inhalte[2]["Tor P Entscheid"]), "Änderung");
    await ctx.close();
  });

  await t("Durchgang: Karte für Karte, Fortschritt, Überspringen, am Ende die Zusammenfassung", async () => {
    const rows = INHALTE(); rows.push(inhalt(7, { Titel: "Dritte Idee", Hook: "Ein neuer Satz mit anderem Inhalt." }));
    // nur drei Tor-I-Karten: Motion-Ideen und Entwurf aus dem Weg
    rows[2].Status = "In Produktion";
    const { page, ctx } = await seite({ inhalte: rows, ideen: [], marken: MARKEN("freigegeben", "Andrej"), optionen: { name: "Andrej" } });
    assert.equal(await page.locator("#ansicht .heute-karte").count(), 3);
    await page.click("#durchgang-start");
    assert.equal(await page.locator("#durchgang-stand").textContent(), "1 von 3");
    assert.equal(await page.locator("#detail-titel").textContent(), "Wartezeit");
    await page.getByRole("button", { name: "Freigeben" }).click();
    await page.waitForSelector("#status .meldung.gut");
    assert.equal(await page.locator("#durchgang-stand").textContent(), "2 von 3");
    assert.equal(await page.locator("#detail-titel").textContent(), "Messestand");
    await page.click("#durchgang-weiter");
    assert.equal(await page.locator("#durchgang-stand").textContent(), "3 von 3");
    assert.equal(await page.locator("#detail-titel").textContent(), "Dritte Idee");
    await page.getByRole("button", { name: "Ablehnen" }).click();
    await page.fill("textarea", "Zu ähnlich wie die erste");
    await page.getByRole("button", { name: "Ablehnung senden" }).click();
    await page.waitForSelector("#huelle[hidden]", { state: "attached" });
    assert.match(await page.locator("#status").textContent(), /Durchgang beendet/);
    assert.match(await page.locator("#status").textContent(), /1 übersprungen/);
    assert.equal((await schreibaufrufe(page)).length, 2);
    assert.deepEqual(await ueberschriften(page), ["Messestand"]); // übersprungen: bleibt offen
    await ctx.close();
  });

  await t("Durchgang erscheint erst ab zwei Karten und lässt sich beenden", async () => {
    const eine = await seite({ inhalte: [inhalt(1, { Titel: "Allein" })], ideen: [], marken: MARKEN("freigegeben", "Andrej"), optionen: { name: "Andrej" } });
    assert.equal(await eine.page.locator("#ansicht .heute-karte").count(), 1);
    assert.equal(await eine.page.locator("#durchgang-start").count(), 0);
    await eine.ctx.close();
    const { page, ctx } = await mitInhalten();
    await page.click("#durchgang-start");
    await page.click("#durchgang-ende");
    assert.equal(await page.locator("#huelle").isHidden(), true);
    assert.equal(await page.locator("#ansicht .heute-karte").count(), 7); // nichts entschieden
    await ctx.close();
  });

  await t("Gate 0: Lücken des Profils, Bestätigung mit Namen, genau die richtigen Felder, danach fällt die Warnung bei den Karten weg", async () => {
    const { page, ctx } = await mitOffenemGate0();
    await pruefen(page, "Alperna");
    const m = await detailText(page);
    assert.match(m, /Es fehlen noch Logo, Caption-Preset und Schlusskarte/); assert.match(m, /Das Markenprofil nennt noch: .*Caption-Preset/);
    await page.getByRole("button", { name: "Gate 0 freigeben" }).click();
    assert.match(await page.locator("#gate0-frage").textContent(), /Du gibst «Alperna» frei als Andrej/);
    assert.equal((await schreibaufrufe(page)).length, 0); // erst die Bestätigung schreibt
    await page.getByRole("button", { name: "Ja, Gate 0 freigeben" }).click();
    await page.waitForSelector("#status .meldung.gut");
    const w = (await eigenschaften(page))[0];
    assert.equal(w.page_id, MARKE_ID);
    assert.deepEqual(Object.keys(w.properties).sort(), ["Gate 0", "Gate 0 von", "date:Gate 0 am:is_datetime", "date:Gate 0 am:start"]);
    assert.equal(w.properties["Gate 0"], "freigegeben");
    assert.equal(w.properties["Gate 0 von"], "Andrej");
    assert.equal(await karte(page, "Alperna").count(), 0); // die Karte ist weg
    await page.click("#n-werkstatt"); await page.click("#k-marke");
    assert.match(await page.locator("#werk-panel").textContent(), /Freigegeben von Andrej/);
    await page.click("#n-heute");
    await pruefen(page, "Wartezeit");
    assert.doesNotMatch(await detailText(page), /Gate 0 der Marke/);
    await ctx.close();
  });

  await t("Gate 0 lässt sich auch in der Werkstatt freigeben; «freigegeben» ohne Menschen mit Namen gilt nicht", async () => {
    const { page, ctx } = await seite({ inhalte: INHALTE(), marken: MARKEN("freigegeben", ""), optionen: { name: "" } });
    assert.equal(await page.locator("#z-heute").textContent(), "8"); // die Freigabe ohne Namen zählt nicht: Gate 0 steht offen auf Heute
    await page.click("#n-werkstatt"); await page.click("#k-marke");
    assert.match(await page.locator("#werk-panel").textContent(), /ohne den Namen eines Menschen/);
    assert.match(await page.locator("#werk-panel").textContent(), /Gate 0 offen/);
    await page.getByRole("button", { name: "Gate 0 freigeben" }).click();
    await page.getByRole("button", { name: "Ja, Gate 0 freigeben" }).click();
    assert.match(await page.locator("#status").textContent(), /Name fehlt/);
    assert.equal((await schreibaufrufe(page)).length, 0);
    await ctx.close();
  });

  await t("Eine Notion-Erwähnung im Beleg erscheint als Name, nicht als Rohtext", async () => {
    const { page, ctx } = await seite({ inhalte: [inhalt(1, { Beleg: 'Rohstoff: <mention-page url="https://app.notion.com/p/3fc6be186e9b81a0af4bfa3182e64f54">Marketing System</mention-page>' })], marken: MARKEN(), optionen: { name: "Andrej" } });
    await pruefen(page, "Inhalt 1");
    const t = await detailText(page);
    assert.match(t, /Rohstoff: Marketing System/);
    assert.doesNotMatch(t, /mention-page/);
    await ctx.close();
  });

  /* ---------- Plattformen ---------- */

  const PLATTFORMEN_ZEILEN = () => [
    inhalt(1, { Titel: "Idee LinkedIn", Status: "Neu" }),
    inhalt(2, { Titel: "Pitch entschieden", Status: "Pitch bereit", "Tor I Entscheid": "freigegeben", "Tor I von": "Leander" }),
    inhalt(3, { Titel: "In Produktion LI", Status: "In Produktion", Hook: "In Produktion LI" }), // Hook gleich Titel: wird nicht doppelt gezeigt
    inhalt(4, { Titel: "Entwurf entschieden", Status: "Entwurf fertig", "Tor P Entscheid": "freigegeben", "Tor P von": "Leander" }),
    inhalt(5, { Titel: "Freigegeben LI", Status: "Freigegeben" }),
    inhalt(6, { Titel: "Geplant LI", Status: "Geplant", Publishing: "Manuell" }),
    inhalt(7, { Titel: "Gepostet", Status: "Veröffentlicht" }),
    inhalt(8, { Titel: "Ausgewertet", Status: "Ausgewertet" }),
    inhalt(9, { Titel: "Verworfen", Status: "Verworfen" }),
    inhalt(10, { Titel: "Pausiert", Status: "Pausiert" }),
    inhalt(11, { Titel: "Beispiel: Reel", Status: "Neu", Format: "Reel", Plattformen: '["Instagram"]', Profil: "Leander" }),
    inhalt(12, { Titel: "Reel ohne Plattform", Status: "Neu", Format: "Reel", Plattformen: "[]", Profil: "Leander" }),
    inhalt(13, { Titel: "Carousel LinkedIn", Status: "Neu", Format: "Carousel", Plattformen: '["LinkedIn"]' }),
    inhalt(14, { Titel: "Beides", Status: "Neu", Format: "LinkedIn-Post", Plattformen: '["LinkedIn","Blog"]' }),
    inhalt(15, { Titel: "Karte Maps", Status: "Neu", Format: "Google-Maps-Beitrag", Plattformen: '["Google"]' }),
    inhalt(16, { Titel: "Ohne alles", Status: "Neu", Format: "Sonstiges", Plattformen: "[]" }),
  ];
  const mitPlattformen = (o = {}) => seite({ ideen: [], inhalte: PLATTFORMEN_ZEILEN(), marken: MARKEN("freigegeben", "Andrej"), optionen: { name: "Andrej" }, ...o });
  const gruppe = (page, k) => page.locator('[data-gruppe="' + k + '"]');
  const titelIn = (loc) => loc.locator(".reihe .titel").allTextContents();

  await t("Plattformseite: drei Gruppen mit den richtigen Ständen, nichts Gepostetes in der Liste, Hinweis mit Link ins Archiv", async () => {
    const { page, ctx } = await mitPlattformen();
    await page.click("#n-linkedin");
    assert.deepEqual(await page.locator(".gruppe-kopf h2").allTextContents(), ["Idee", "In Arbeit", "Bereit zum Posten"]);
    assert.deepEqual((await titelIn(gruppe(page, "idee"))).sort(), ["Beides", "Carousel LinkedIn", "Idee LinkedIn", "Pitch entschieden"]); // Neu und Pitch bereit
    assert.deepEqual((await titelIn(gruppe(page, "arbeit"))).sort(), ["Entwurf entschieden", "In Produktion LI"]); // In Produktion und Entwurf fertig
    assert.deepEqual((await titelIn(gruppe(page, "bereit"))).sort(), ["Freigegeben LI", "Geplant LI"]); // Freigegeben und Geplant
    const text = await page.locator("#ansicht").textContent();
    for (const nie of ["Gepostet", "Ausgewertet", "Verworfen", "Pausiert"]) assert.doesNotMatch(await page.locator(".liste").allTextContents().then((l) => l.join(" ")), new RegExp(nie), nie + " steht in keiner Liste");
    assert.match(text, /4 abgeschlossene Inhalte ausgeblendet/);
    const link = page.locator("#ausgeblendet a");
    assert.equal(await link.getAttribute("href"), ARCHIV);
    assert.equal(await link.getAttribute("target"), "_blank");
    await ctx.close();
  });

  await t("Plattform kommt aus «Plattformen»; ohne Angabe gehören Reels und Carousels zu Instagram; ein Inhalt erscheint auf jeder seiner Plattformen", async () => {
    const { page, ctx } = await mitPlattformen();
    await page.click("#n-instagram");
    assert.deepEqual(await titelIn(page.locator("#ansicht")), ["Reel ohne Plattform"]); // das Beispiel fehlt, das Carousel mit Angabe «LinkedIn» gehört dorthin
    await page.click("#n-blog");
    assert.deepEqual(await titelIn(page.locator("#ansicht")), ["Beides"]);
    await page.click("#n-google");
    assert.deepEqual(await titelIn(page.locator("#ansicht")), ["Karte Maps"]);
    await page.click("#n-linkedin");
    assert.ok((await titelIn(page.locator("#ansicht"))).includes("Beides")); // auf beiden Seiten
    assert.ok((await titelIn(page.locator("#ansicht"))).includes("Carousel LinkedIn"));
    await ctx.close();
  });

  await t("Beispielzeilen und Inhalte ohne Plattform stehen in keiner Plattformliste; Heute weist auf die ohne Plattform hin", async () => {
    const { page, ctx } = await mitPlattformen();
    for (const k of ["instagram", "linkedin", "blog", "google"]) {
      await page.click("#n-" + k);
      const l = (await titelIn(page.locator("#ansicht"))).join("|");
      assert.doesNotMatch(l, /Beispiel/, k); assert.doesNotMatch(l, /Ohne alles/, k);
    }
    await page.click("#n-heute");
    assert.match(await page.locator("#ansicht").textContent(), /1 laufender Inhalt hat keine Plattform/);
    await ctx.close();
  });

  await t("Zähler: Heute zählt Offenes, jede Plattform zählt ihre laufenden Inhalte, ohne Beispiele und Abgeschlossenes", async () => {
    const { page, ctx } = await mitPlattformen();
    assert.equal(await page.locator("#z-heute").textContent(), "0"); // Tor I und Tor P sind entschieden, nichts wartet auf dich
    assert.match(await page.locator("#ansicht").textContent(), /Nichts zu entscheiden/);
    assert.equal(await page.locator("#z-linkedin").textContent(), "8");
    assert.equal(await page.locator("#z-instagram").textContent(), "1");
    assert.equal(await page.locator("#z-blog").textContent(), "1");
    assert.equal(await page.locator("#z-google").textContent(), "1");
    for (const k of ["linkedin", "instagram", "blog", "google"]) { await page.click("#n-" + k); assert.equal(await page.locator("#z-" + k).textContent(), String((await titelIn(page.locator("#ansicht"))).length), k); }
    await ctx.close();
  });

  await t("Eine Zeile zeigt Titel, Format und Person, einen Status: keine ID, kein Verwalten-Knopf, den Hook nur wenn er vom Titel abweicht", async () => {
    const { page, ctx } = await mitPlattformen();
    await page.click("#n-linkedin");
    assert.doesNotMatch(await page.locator("#ansicht").textContent(), /c-\d{4}/);
    assert.equal(await page.getByRole("button", { name: /Verwalten|Pausieren|Verwerfen/ }).count(), 0);
    const r1 = reihe(page, "Idee LinkedIn");
    assert.match(await r1.locator(".meta").textContent(), /^LinkedIn-Post · Andrej$/);
    assert.equal(await r1.locator(".chip").count(), 1);
    assert.equal(await r1.locator(".chip").textContent(), "Neu");
    assert.equal(await r1.locator(".kurz").count(), 1); // Hook weicht ab
    assert.equal(await reihe(page, "In Produktion LI").locator(".kurz").count(), 0); // Hook gleich Titel
    assert.equal(await reihe(page, "Pitch entschieden").locator(".chip").textContent(), "Wartet auf Claude");
    await page.click("#n-instagram");
    assert.match(await reihe(page, "Reel ohne Plattform").locator(".meta").textContent(), /^Reel · Leander$/);
    await ctx.close();
  });

  await t("Eine Zeile öffnet das Seitenfenster mit Einzelheiten; ein geplanter Beitrag hat dort «Veröffentlicht bestätigen» als Hauptaktion", async () => {
    const { page, ctx } = await mitPlattformen();
    await page.click("#n-linkedin");
    await reihe(page, "Geplant LI").click();
    assert.equal(await page.locator("#detail-titel").textContent(), "Geplant LI");
    assert.match(await detailText(page), /Bestätige erst, wenn der Beitrag wirklich draussen ist/);
    assert.equal(await page.locator("#detail .knopf.primaer").count(), 1); // genau eine Hauptaktion
    assert.equal(await page.locator("#detail .knopf.primaer").textContent(), "Veröffentlicht bestätigen");
    await page.click("#detail-schliessen");
    await reihe(page, "Idee LinkedIn").click();
    assert.match(await detailText(page), /Eckdaten/);
    assert.equal(await page.locator("#detail .knopf.primaer").count(), 0); // eine Idee im Stand «Neu» wartet auf nichts von dir
    await ctx.close();
  });

  await t("Der Text der Notion-Seite wird erst auf Wunsch geladen, ein Fehler dabei blockiert nichts", async () => {
    const { page, ctx } = await mitPlattformen();
    await page.click("#n-linkedin");
    await reihe(page, "Idee LinkedIn").click();
    assert.equal((await calls(page)).filter((c) => c.tool === "notion-fetch").length, 0); // Öffnen allein lädt nichts
    await page.click("#seitentext-laden");
    await page.waitForSelector("#detail .entwurf");
    assert.match(await page.locator("#detail .entwurf").textContent(), /Wartezeit von 32 auf 14 Minuten gesenkt/);
    assert.equal((await calls(page)).find((c) => c.tool === "notion-fetch").input.id, inhaltId(1));
    await page.click("#detail-schliessen");
    await reihe(page, "Idee LinkedIn").click();
    assert.equal(await page.locator("#detail .entwurf").count(), 0); // nach dem Schliessen wieder zu
    await ctx.close();
    const f = await mitPlattformen({ optionen: { name: "Andrej", fehlerBeimLesenDerSeite: true } });
    await f.page.click("#n-linkedin");
    await reihe(f.page, "Idee LinkedIn").click();
    await f.page.click("#seitentext-laden");
    await f.page.waitForSelector("#detail .warnung");
    assert.match(await f.page.locator("#detail").textContent(), /Der Text liess sich nicht laden/);
    assert.equal(await f.page.locator("#detail-schliessen").isVisible(), true);
    await f.ctx.close();
  });

  await t("Plattformseite ohne Notion-Verbindung und mit leerer Plattform: klarer Text statt leerer Fläche", async () => {
    const { page, ctx } = await seite({ mitMcp: false });
    await page.click("#n-linkedin");
    assert.match(await page.locator("#ansicht").textContent(), /Sobald der Prüfplatz mit Notion verbunden ist/);
    await ctx.close();
    const m = await mitInhalten();
    await m.page.click("#n-blog");
    assert.match(await m.page.locator("#ansicht").textContent(), /Nichts in Arbeit/);
    await m.ctx.close();
  });

  await t("Fällt die Ansicht «Inhalte» aus, laufen die Motion-Ideen weiter und der Fehler steht da", async () => {
    const { page, ctx } = await seite({ inhalte: INHALTE(), marken: MARKEN("freigegeben", "Andrej"), optionen: { name: "Andrej", fehlerAnsicht: "inhalte" } });
    assert.equal(await page.locator("#z-heute").textContent(), "4");
    assert.match(await page.locator("#status").textContent(), /Inhalte und Marken nicht gelesen/);
    await pruefen(page, "Wert-Verlauf");
    await page.getByRole("button", { name: "Freigeben" }).click();
    await page.waitForSelector("#status .meldung.gut");
    await ctx.close();
  });

  /* ---------- Handlungen: Pausieren, Verwerfen, Veröffentlicht bestätigen ---------- */

  const mitVerwaltung = (o = {}) => {
    const rows = INHALTE();
    rows.push(inhalt(8, { Titel: "Geplanter Post", Status: "Geplant", Publishing: "Manuell", "date:Geplant für:start": "2026-10-20", Hook: "Ein ganz anderer Satz zum Planen 8." }));
    rows.push(inhalt(9, { Titel: "Erledigt", Status: "Verworfen", Hook: "Noch ein anderer Satz 9." }));
    return seite({ inhalte: rows, marken: MARKEN("freigegeben", "Andrej"), optionen: { name: "Andrej" }, ...o });
  };
  const zeileOeffnen = async (page, titel) => { await page.click("#n-linkedin"); await reihe(page, titel).click(); };

  await t("Pausieren schreibt Status, Name, Grund und Zeit und braucht einen Grund", async () => {
    const { page, ctx } = await mitVerwaltung();
    await zeileOeffnen(page, "In Arbeit");
    await page.click("#verwalten-c-0004");
    const pause = page.getByRole("button", { name: "Pausieren", exact: true });
    assert.equal(await pause.isDisabled(), true);
    await page.fill("textarea", "Kunde wartet auf den Dreh");
    assert.equal(await pause.isDisabled(), false);
    await pause.click();
    await page.waitForSelector("#status .meldung.gut");
    const w = (await eigenschaften(page))[0];
    assert.equal(w.page_id, inhaltId(4));
    assert.deepEqual(Object.keys(w.properties).sort(), ["Status", "date:Status am:is_datetime", "date:Status am:start", "Status von", "Status-Grund"].sort());
    assert.equal(w.properties.Status, "Pausiert");
    assert.equal(w.properties["Status von"], "Andrej");
    assert.equal(w.properties["Status-Grund"], "Kunde wartet auf den Dreh");
    assert.equal(w.properties["date:Status am:is_datetime"], 1);
    assert.match(w.properties["date:Status am:start"], /^\d{4}-\d\d-\d\dT/);
    await page.click("#n-linkedin");
    assert.equal(await reihe(page, "In Arbeit").count(), 0); // Pausiertes steht nie in einer Liste
    await ctx.close();
  });

  await t("Verwerfen braucht zwei Wörter; aus «Pitch bereit» verwirft man nicht, Endzustände haben keine Handlung", async () => {
    const { page, ctx } = await mitVerwaltung();
    await zeileOeffnen(page, "In Arbeit");
    await page.click("#verwalten-c-0004");
    const verwerfen = page.getByRole("button", { name: "Verwerfen", exact: true });
    await page.fill("textarea", "Unbrauchbarwegen");
    assert.equal(await verwerfen.isDisabled(), true);
    await page.fill("textarea", "Kunde sagt ab");
    assert.equal(await verwerfen.isDisabled(), false);
    await verwerfen.click();
    await page.waitForSelector("#status .meldung.gut");
    assert.equal((await eigenschaften(page))[0].properties.Status, "Verworfen");
    await page.click("#n-linkedin");
    await reihe(page, "Wartet").click(); // c-0005: Pitch bereit, Tor I entschieden
    await page.click("#verwalten-c-0005");
    assert.equal(await page.getByRole("button", { name: "Verwerfen", exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Pausieren", exact: true }).count(), 1);
    assert.match(await detailText(page), /mit Tor I/);
    await ctx.close();
  });

  await t("«Veröffentlicht» bestätigen gibt es nur bei Manuell und Paket und braucht keinen Grund", async () => {
    const { page, ctx } = await mitVerwaltung();
    await zeileOeffnen(page, "Geplanter Post");
    await page.getByRole("button", { name: "Veröffentlicht bestätigen" }).click();
    await page.waitForSelector("#status .meldung.gut");
    const w = (await eigenschaften(page))[0];
    assert.equal(w.properties.Status, "Veröffentlicht");
    assert.equal(w.properties["Status von"], "Andrej");
    assert.equal(w.properties["Status-Grund"], null);
    await page.click("#n-linkedin");
    assert.equal(await reihe(page, "Geplanter Post").count(), 0); // gepostet: nur noch im Hinweis
    await ctx.close();
    const rows = INHALTE(); rows.push(inhalt(8, { Titel: "Auto-Post", Status: "Geplant", Publishing: "Auto", Hook: "Ein ganz anderer Satz zum Planen 8." }));
    const a = await seite({ inhalte: rows, marken: MARKEN(), optionen: { name: "Andrej" } });
    await zeileOeffnen(a.page, "Auto-Post"); // bei Auto veröffentlicht der Code selbst
    assert.equal(await a.page.getByRole("button", { name: "Veröffentlicht bestätigen" }).count(), 0);
    assert.equal(await a.page.getByRole("button", { name: "Pausieren oder verwerfen" }).count(), 1);
    await a.ctx.close();
  });

  await t("Handlungen: Name ist Pflicht, und hat sich der Stand inzwischen geändert, wird nichts überschrieben", async () => {
    const n = await mitVerwaltung({ optionen: { name: "" } });
    await zeileOeffnen(n.page, "In Arbeit");
    await n.page.click("#verwalten-c-0004");
    await n.page.fill("textarea", "Kunde wartet auf den Dreh");
    await n.page.getByRole("button", { name: "Pausieren", exact: true }).click();
    assert.match(await n.page.locator("#status").textContent(), /Name fehlt/);
    assert.equal((await schreibaufrufe(n.page)).length, 0);
    await n.ctx.close();
    const { page, ctx } = await mitVerwaltung();
    await zeileOeffnen(page, "In Arbeit");
    await page.click("#verwalten-c-0004");
    await page.fill("textarea", "Kunde wartet auf den Dreh");
    await page.evaluate(() => { window.__inhalte[3].Status = "Entwurf fertig"; });
    await page.getByRole("button", { name: "Pausieren", exact: true }).click();
    await page.waitForSelector("#status .meldung.fehler");
    assert.match(await page.locator("#status").textContent(), /Schon weiter/);
    assert.equal((await schreibaufrufe(page)).length, 0);
    await ctx.close();
  });

  /* ---------- Material: Footage, Fotos und mehr anhängen ---------- */

  const reelZeile = (o = {}) => inhalt(1, { Titel: "Reel Hofer", Status: "In Produktion", Format: "Reel", Plattformen: '["Instagram"]', Aufwand: "Dreh nötig", Dateien: "", ...o });
  const mitMaterial = (o = {}, zeile = reelZeile()) => seite({ ideen: [], inhalte: [zeile], marken: MARKEN("freigegeben", "Andrej"), optionen: { name: "" }, ...o });
  const materialOeffnen = async (page) => { await page.click("#n-instagram"); await reihe(page, "Reel Hofer").click(); await page.click("#mat-offen"); };

  await t("Material anhängen: Pfad relativ zu Studio, schreibt nur «Dateien», liest vorher frisch und danach nach, braucht keinen Namen", async () => {
    const { page, ctx } = await mitMaterial();
    await materialOeffnen(page);
    assert.match(await page.locator("#mat-fehlt").textContent(), /Footage oder Foto fehlt/); // «Dreh nötig» ohne Material
    assert.equal(await page.locator("#mat-anhaengen").isDisabled(), true); // ohne Ziel nichts zu tun
    assert.equal(await page.evaluate(() => document.activeElement.id), "mat-ziel"); // der Cursor steht im Feld
    await page.fill("#mat-ziel", "Studio/rohmaterial/praxis-hofer/empfang-01.mov");
    await page.fill("#mat-notiz", "Empfang, Totale");
    assert.equal(await page.locator("#mat-anhaengen").isDisabled(), false);
    await page.click("#mat-anhaengen");
    await page.waitForSelector("#detail #status .meldung.gut");
    const w = await eigenschaften(page);
    assert.equal(w.length, 1);
    assert.equal(w[0].page_id, inhaltId(1));
    assert.deepEqual(w[0].properties, { Dateien: "Footage: rohmaterial/praxis-hofer/empfang-01.mov | Empfang, Totale" }); // nur dieses Feld, «Studio/» fällt weg
    const rf = (await calls(page)).map((c) => c.tool);
    const i = rf.indexOf("notion-update-page");
    assert.equal(rf[i - 1], "notion-query-data-sources"); assert.equal(rf[i + 1], "notion-query-data-sources");
    assert.equal(await page.locator("#mat-fehlt").count(), 0); // Footage ist da
    assert.match(await page.locator(".material-liste").textContent(), /rohmaterial\/praxis-hofer\/empfang-01\.mov/);
    assert.equal(await page.locator("#mat-ziel").inputValue(), ""); // das Formular ist leer für den nächsten Eintrag
    await ctx.close();
  });

  await t("Material: mehrere Einträge, Link als Foto, Entfernen, Zeilen von früher bleiben erhalten", async () => {
    const { page, ctx } = await mitMaterial({}, reelZeile({ Dateien: "reel-entwurf.mp4" }));
    await materialOeffnen(page);
    await page.selectOption("#mat-art", "Foto");
    await page.fill("#mat-ziel", "https://onedrive.test/s/abc");
    await page.click("#mat-anhaengen");
    await page.waitForSelector("#detail #status .meldung.gut");
    assert.equal(await page.evaluate(() => window.__inhalte[0].Dateien), "reel-entwurf.mp4\nFoto: https://onedrive.test/s/abc"); // die freie Zeile bleibt
    assert.equal(await page.locator('.material-liste a[href="https://onedrive.test/s/abc"]').count(), 1);
    assert.equal(await page.locator("#mat-fehlt").count(), 0); // ein Foto genügt
    await page.getByRole("button", { name: "Eintrag entfernen: https://onedrive.test/s/abc" }).click();
    await page.waitForSelector("#detail #status .meldung.gut");
    assert.equal(await page.evaluate(() => window.__inhalte[0].Dateien), "reel-entwurf.mp4");
    assert.equal(await page.getByRole("button", { name: /Eintrag entfernen: reel-entwurf/ }).count(), 0); // freie Zeilen entfernt man in Notion
    assert.equal(await page.locator("#mat-fehlt").count(), 1); // wieder ohne Footage
    await ctx.close();
  });

  await t("Material: ungültige Ziele werden abgewiesen, ohne zu schreiben", async () => {
    const { page, ctx } = await mitMaterial();
    await materialOeffnen(page);
    for (const [ziel, muster] of [["/Users/andrej/Movies/a.mov", /relativ/], ["../a.mov", /nicht verlassen/], ["http://x.test/a", /https/], ["a|b.mov", /«\|»/], ["https://x.test/mit leerzeichen", /Leerzeichen/]]) {
      await page.fill("#mat-ziel", ziel);
      await page.click("#mat-anhaengen");
      assert.match(await page.locator("#mat-fehler").textContent(), muster, ziel);
    }
    assert.equal((await schreibaufrufe(page)).length, 0);
    await page.fill("#mat-ziel", "rohmaterial/a.mov");
    assert.equal(await page.locator("#mat-fehler").textContent(), ""); // der Fehler verschwindet beim Tippen
    await ctx.close();
  });

  await t("Material: Wurde das Feld inzwischen geändert, wird nichts überschrieben; ein zu volles Feld wird nicht abgeschnitten", async () => {
    const { page, ctx } = await mitMaterial();
    await materialOeffnen(page);
    await page.fill("#mat-ziel", "rohmaterial/a.mov");
    await page.evaluate(() => { window.__inhalte[0].Dateien = "Foto: b.jpg"; });
    await page.click("#mat-anhaengen");
    await page.waitForSelector("#detail #status .meldung.fehler");
    assert.match(await page.locator("#status").textContent(), /Schon weiter/);
    assert.equal((await schreibaufrufe(page)).length, 0);
    assert.equal(await page.evaluate(() => window.__inhalte[0].Dateien), "Foto: b.jpg");
    await ctx.close();
    const voll = await mitMaterial({}, reelZeile({ Dateien: Array.from({ length: 5 }, (_, i) => "Footage: rohmaterial/" + "x".repeat(300) + i).join("\n") }));
    await materialOeffnen(voll.page);
    await voll.page.fill("#mat-ziel", "rohmaterial/" + "y".repeat(300));
    await voll.page.click("#mat-anhaengen");
    await voll.page.waitForSelector("#detail #status .meldung.fehler");
    assert.match(await voll.page.locator("#status").textContent(), /Das Feld ist voll/);
    assert.equal((await schreibaufrufe(voll.page)).length, 0);
    await voll.ctx.close();
  });

  await t("Material: im Entwurf (Tor P) steht es bei den Entscheiden, Renders von Claude lassen sich nicht entfernen; Abgeschlossenes hat kein Material", async () => {
    const rows = [inhalt(3, { Titel: "Entwurf Reel", Status: "Entwurf fertig", Format: "Reel", Plattformen: '["Instagram"]', Dateien: "Footage: rohmaterial/a.mov\nRender: renders/c-0003.mp4 | Fassung 1" })];
    const { page, ctx } = await seite({ inhalte: rows, marken: MARKEN("freigegeben", "Andrej"), optionen: { name: "Andrej" } });
    await pruefen(page, "Entwurf Reel");
    await page.waitForSelector(".entwurf");
    assert.match(await detailText(page), /renders\/c-0003\.mp4/);
    assert.equal(await page.getByRole("button", { name: /Eintrag entfernen: renders/ }).count(), 0);
    assert.equal(await page.getByRole("button", { name: /Eintrag entfernen: rohmaterial/ }).count(), 1);
    const reihenfolge = await page.locator("#detail .abschnitt .eyebrow").allTextContents();
    assert.ok(reihenfolge.indexOf("Material") > reihenfolge.indexOf("Der Entwurf"), "Material nach dem Entwurf");
    assert.equal(await page.locator("#detail .knopf.primaer").last().textContent(), "Freigeben");
    await ctx.close();
    const alt = await seite({ inhalte: [inhalt(1, { Titel: "Alt", Status: "Ausgewertet" })], marken: MARKEN("freigegeben", "Andrej"), optionen: { name: "Andrej" } });
    assert.equal(await alt.page.locator("#z-linkedin").textContent(), "0");
    await alt.ctx.close();
  });

  /* ---------- Bilder zur Durchsicht ---------- */
  const aus = path.join(path.dirname(datei), "pruefplatz-shots");
  fs.mkdirSync(aus, { recursive: true });
  const bild = (page, name) => page.screenshot({ path: path.join(aus, name), fullPage: false });
  const rows = PLATTFORMEN_ZEILEN().map((r) => r);
  rows.push(inhalt(17, { Titel: "Wie ein Praxisteam die Wartezeit halbierte", Hook: "Dreissig Minuten Wartezeit sind kein Naturgesetz.", Format: "LinkedIn-Post", Profil: "Leander", Status: "Pitch bereit" }));
  rows.push(inhalt(18, { Titel: "Drei Fragen vor dem Dreh", Hook: "Bevor die Kamera läuft, klären wir drei Dinge.", Format: "Reel", Plattformen: '["Instagram"]', Profil: "Andrej", Status: "Pitch bereit", Aufwand: "Dreh nötig" }));
  rows.push(inhalt(19, { Titel: "Donnerstag länger offen", Hook: "Der Hofer-Laden hat neu bis 20 Uhr geöffnet.", Format: "Google-Maps-Beitrag", Plattformen: '["Google"]', Profil: "Alperna", Status: "Entwurf fertig" }));
  rows.push(inhalt(20, { Titel: "Reel Hofer", Status: "In Produktion", Format: "Reel", Plattformen: '["Instagram"]', Profil: "Leander", Aufwand: "Dreh nötig", Dateien: "Footage: rohmaterial/praxis-hofer/empfang-01.mov | Empfang, Totale\nFoto: https://onedrive.test/s/abc | Portrait Frau Hofer" }));
  for (const [breite, hoehe, vorn] of [[1280, 860, "desktop"], [390, 844, "handy"]]) {
    const s = await seite({ breite, hoehe, inhalte: rows, marken: MARKEN("freigegeben", "Andrej"), optionen: { name: "Andrej" } });
    await bild(s.page, vorn + "-heute.png");
    await pruefen(s.page, "Wie ein Praxisteam die Wartezeit halbierte"); await s.page.waitForTimeout(150);
    await bild(s.page, vorn + "-tor-i.png");
    await s.page.click("#detail-schliessen");
    await pruefen(s.page, "Donnerstag länger offen"); await s.page.waitForSelector(".entwurf"); await s.page.waitForTimeout(150);
    await bild(s.page, vorn + "-tor-p.png");
    await s.page.click("#detail-schliessen");
    await pruefen(s.page, "Vergleichs-Balken"); await s.page.locator(".look").nth(1).click(); await s.page.waitForTimeout(150);
    await bild(s.page, vorn + "-looks.png");
    await s.page.click("#detail-schliessen");
    await s.page.click("#n-linkedin"); await bild(s.page, vorn + "-linkedin.png");
    await s.page.click("#n-instagram"); await reihe(s.page, "Reel Hofer").click(); await s.page.waitForTimeout(150); await bild(s.page, vorn + "-material.png");
    await s.page.click("#detail-schliessen");
    await s.page.click("#n-werkstatt"); await s.page.click("#k-marke"); await bild(s.page, vorn + "-werkstatt.png");
    await s.ctx.close();
  }
  const d = await seite({ breite: 1280, hoehe: 860, inhalte: rows, marken: MARKEN("freigegeben", "Andrej"), optionen: { name: "Andrej" }, farbschema: "dark" });
  await bild(d.page, "dunkel-heute.png");
  await pruefen(d.page, "Wie ein Praxisteam die Wartezeit halbierte"); await d.page.waitForTimeout(150);
  await bild(d.page, "dunkel-tor-i.png");
  await d.ctx.close();

  await browser.close();
  console.log(`\n${bestanden} bestanden, ${fehler.length} fehlgeschlagen` + (fehler.length ? ": " + fehler.join("; ") : ""));
  console.log("Bilder: " + aus);
  process.exit(fehler.length ? 1 : 0);
})();
