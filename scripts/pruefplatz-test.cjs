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
  "Inhalt-ID": "c-000" + n, Titel: "Inhalt " + n, Format: "LinkedIn-Post", Plattformen: '["LinkedIn"]', Marke: JSON.stringify([MARKE_URL]), Quelle: "Manuell", Referenz: "",
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

  async function seite({ mitMcp = true, optionen = {}, breite = 1100, inhalte = null, marken = null } = {}) {
    const ctx = await browser.newContext({ viewport: { width: breite, height: 900 } });
    const page = await ctx.newPage();
    const konsole = [];
    page.on("console", (m) => { if (["error", "warning"].includes(m.type())) konsole.push(m.type() + ": " + m.text()); });
    page.on("pageerror", (e) => konsole.push("pageerror: " + e.message));
    // Schriften und Bilder: nichts geht nach draussen
    await page.route("**/*", (route) => {
      const u = route.request().url();
      if (u.startsWith("https://bilder.test/")) return route.fulfill({ status: 200, contentType: "image/png", body: PNG });
      if (u.startsWith("https://fonts.")) return route.abort();
      if (u.startsWith("data:") || u.startsWith("about:")) return route.continue();
      return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html });
    });
    await page.addInitScript(initSkript, { mitMcp, ZEILEN: ZEILEN(), optionen, ansichten: ANSICHTEN, inhalteZeilen: inhalte || [], markenZeilen: marken || [], seitentext: SEITENTEXT });
    await page.goto("https://pruefplatz.test/");
    // Gewartet wird, bis weder der Platzhalter «Lade …» noch ein offener Abruf übrig ist
    if (mitMcp) await page.waitForFunction(() => { const h = document.querySelector("#p-queue .karte.leer h3"); return !(h && /^Lade/.test(h.textContent)) && !!document.querySelector("#p-queue .karte"); });
    return { page, ctx, konsole };
  }
  const calls = (page) => page.evaluate(() => window.__calls);
  const schreibaufrufe = async (page) => (await calls(page)).filter((c) => c.tool === "notion-update-page");

  console.log("Prüfplatz im Headless-Chrome: " + datei);

  await t("Beim Start: vier Entscheide offen, einer bei Claude, Zähler stimmen", async () => {
    const { page, konsole, ctx } = await seite();
    assert.equal(await page.locator("#p-queue > .karte").count(), 5); // 4 Karten (2 Pitches, Looks, Abnahme) + Liste «Bei Claude»
    assert.equal(await page.locator("#z-queue").textContent(), "4");
    assert.equal(await page.locator("#z-alle").textContent(), "6");
    assert.match(await page.locator("#p-queue").textContent(), /Zeitleiste/);
    assert.match(await page.locator("#p-queue").textContent(), /Wartet auf Claude/);
    const erster = (await calls(page))[0];
    assert.equal(erster.tool, "notion-query-data-sources");
    assert.equal(erster.input.data.mode, "view"); // nie «rows» oder SQL: Kontingent
    assert.match(erster.input.data.view_url, /^view:\/\//);
    assert.deepEqual(konsole.filter((k) => !/fonts|ERR_FAILED|Failed to load resource/.test(k)), []);
    await ctx.close();
  });

  await t("Freigabe ohne Namen wird nicht gesendet", async () => {
    const { page, ctx } = await seite();
    await page.locator(".karte-kopf", { hasText: "Wert-Verlauf" }).click();
    await page.getByRole("button", { name: "Freigeben" }).click();
    assert.match(await page.locator("#status").textContent(), /Name fehlt/);
    assert.equal((await schreibaufrufe(page)).length, 0);
    await ctx.close();
  });

  await t("Systemname als Entscheider wird abgelehnt", async () => {
    const { page, ctx } = await seite();
    await page.fill("#name", "Claude");
    await page.locator(".karte-kopf", { hasText: "Wert-Verlauf" }).click();
    await page.getByRole("button", { name: "Freigeben" }).click();
    assert.match(await page.locator("#status").textContent(), /Dieser Name gilt nicht/);
    assert.equal((await schreibaufrufe(page)).length, 0);
    await ctx.close();
  });

  await t("Freigabe: frisch lesen, genau die richtigen Felder schreiben, nachlesen, Karte verschwindet", async () => {
    const { page, ctx } = await seite({ optionen: { name: "Andrej" } });
    await page.locator(".karte-kopf", { hasText: "Wert-Verlauf" }).click();
    assert.match(await page.locator("#p-queue").textContent(), /Anfangs- und Endwert/); // <br> wurde Zeilenumbruch
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
    assert.equal(await page.locator("#z-queue").textContent(), "3");
    await ctx.close();
  });

  await t("Ablehnen: ein Wort reicht nicht, zwei Wörter schon", async () => {
    const { page, ctx } = await seite({ optionen: { name: "Andrej" } });
    await page.locator(".karte-kopf", { hasText: "Checkliste" }).click();
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
    await page.locator(".karte-kopf", { hasText: "Vergleichs-Balken" }).click();
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
    await page.locator(".karte-kopf", { hasText: "Prozess-Pfeile" }).click();
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

  await t("Zwischenzeitlich entschieden: nichts wird überschrieben, Hinweis erscheint", async () => {
    const { page, ctx } = await seite({ optionen: { name: "Andrej" } });
    await page.locator(".karte-kopf", { hasText: "Wert-Verlauf" }).click();
    await page.evaluate(() => { window.__rows[0].Entscheid = "abgelehnt"; window.__rows[0]["Entscheid von"] = "Leander"; });
    await page.getByRole("button", { name: "Freigeben" }).click();
    await page.waitForSelector("#status .meldung.fehler");
    assert.match(await page.locator("#status").textContent(), /Schon weiter/);
    assert.equal((await schreibaufrufe(page)).length, 0);
    assert.equal(await page.evaluate(() => window.__rows[0].Entscheid), "abgelehnt");
    await ctx.close();
  });

  await t("Mehr als eine Seite: alle Zeilen werden gelesen, auch die Freigabe findet die Zeile auf Seite 2", async () => {
    const { page, ctx } = await seite({ optionen: { name: "Andrej", seitenGroesse: 2 } });
    assert.equal(await page.locator("#z-alle").textContent(), "6");
    await page.locator(".karte-kopf", { hasText: "Checkliste" }).click(); // m-006 liegt auf Seite 3
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
      await page.locator(".karte-kopf", { hasText: "Wert-Verlauf" }).click();
      await page.getByRole("button", { name: "Freigeben" }).click();
      await page.waitForSelector("#status .meldung.fehler");
      assert.match(await page.locator("#status").textContent(), muster, code);
      await ctx.close();
    }
  });

  await t("Alle Ideen, Bibliothek und Marke zeigen Inhalt", async () => {
    const { page, ctx } = await seite();
    await page.click("#t-alle");
    assert.equal(await page.locator("#p-alle .zeile-idee").count(), 6);
    await page.selectOption("#filter", "in_bibliothek");
    assert.equal(await page.locator("#p-alle .zeile-idee").count(), 1);
    await page.click("#t-bib");
    assert.ok(await page.locator("#p-bib .stueck").count() >= 1);
    assert.equal(await page.locator("#p-bib .stueck img").first().evaluate((i) => i.complete && i.naturalWidth > 0), true);
    assert.match(await page.locator("#p-bib").textContent(), /Zahl-Zähler/);
    await page.click("#t-marke");
    // Das Profil im Repo ist die Grundlage der Seite: Der erwartete Text hängt von seinem aktuellen Stand ab (Gate 0).
    const profilStatus = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "marken", "alperna.json"), "utf8")).status;
    assert.match(await page.locator("#p-marke").textContent(), profilStatus === "freigegeben" ? /Freigegeben/ : /Platzhalter/);
    assert.equal(await page.locator("#p-marke .farbe").count(), 4);
    await ctx.close();
  });

  await t("Ohne Notion-Verbindung: klarer Hinweis, Bibliothek und Marke gehen trotzdem", async () => {
    const { page, ctx } = await seite({ mitMcp: false });
    await page.waitForSelector("#status .meldung");
    assert.match(await page.locator("#status").textContent(), /Nur in Claude benutzbar/);
    await page.click("#t-bib");
    assert.ok(await page.locator("#p-bib .stueck").count() >= 1);
    await ctx.close();
  });

  await t("Handy (390 px): kein waagrechtes Scrollen in keinem Bereich, geöffnete Karte lesbar", async () => {
    const { page, ctx } = await seite({ breite: 390, optionen: { name: "Andrej" } });
    const ueberlauf = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await page.locator(".karte-kopf", { hasText: "Vergleichs-Balken" }).click();
    assert.ok((await ueberlauf()) <= 0, "Warteschlange: " + (await ueberlauf()));
    for (const tab of ["#t-alle", "#t-bib", "#t-marke"]) { await page.click(tab); assert.ok((await ueberlauf()) <= 0, tab + ": " + (await ueberlauf())); }
    await ctx.close();
  });

  await t("Tastatur: Tabs und Karten sind Knöpfe, Radios per Pfeiltaste wählbar", async () => {
    const { page, ctx } = await seite({ optionen: { name: "Andrej" } });
    await page.locator(".karte-kopf", { hasText: "Vergleichs-Balken" }).focus();
    await page.keyboard.press("Enter");
    assert.equal(await page.locator(".karte-kopf[aria-expanded=true]").count(), 1);
    await page.locator(".look input").first().focus();
    await page.keyboard.press("Space");
    assert.equal(await page.locator(".look input").first().isChecked(), true);
    await ctx.close();
  });


  /* ---------- Inhalte, Tor I, Tor P, Gate 0, Wochenmodus ---------- */
  const mitInhalten = (o = {}) => seite({ inhalte: INHALTE(), marken: MARKEN(), optionen: { name: "Andrej" }, ...o });
  const eigenschaften = async (page) => (await schreibaufrufe(page)).map((c) => c.input);

  await t("Inhalte: Tor-I- und Tor-P-Karten stehen in der Warteschlange, Gate 0 offen ist sichtbar, Wartende stehen bei Claude", async () => {
    const { page, ctx } = await mitInhalten();
    assert.equal(await page.locator("#z-queue").textContent(), "7"); // 4 Motion + 2 Tor I + 1 Tor P
    assert.equal(await page.locator("#z-inhalte").textContent(), "6");
    const q = await page.locator("#p-queue").textContent();
    assert.match(q, /Wartezeit/); assert.match(q, /Entwurf Zahnarzt/); assert.match(q, /Gate 0 offen/);
    assert.match(await page.locator("#p-queue .tabelle").textContent(), /Wartet/); // c-0005: Tor I schon entschieden
    const mode = (await calls(page)).filter((c) => c.tool === "notion-query-data-sources").map((c) => c.input.data.mode);
    assert.ok(mode.length >= 3 && mode.every((m) => m === "view"));
    await ctx.close();
  });

  await t("Tor I: Freigabe schreibt genau Entscheid, Grund (leer), Name und Zeit, liest vorher frisch und danach nach", async () => {
    const { page, ctx } = await mitInhalten();
    await page.locator(".karte-kopf", { hasText: "c-0001" }).click();
    assert.match(await page.locator("#p-queue").textContent(), /Gate 0 der Marke «Alperna» ist noch nicht freigegeben/);
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
    assert.equal(await page.locator("#z-queue").textContent(), "6");
    await ctx.close();
  });

  await t("Tor I: Name ist Pflicht, Systemnamen gelten nicht, nichts wird geschrieben", async () => {
    for (const [name, muster] of [["", /Name fehlt/], ["KI", /Dieser Name gilt nicht/]]) {
      const { page, ctx } = await mitInhalten({ optionen: { name } });
      if (name) await page.fill("#name", name);
      await page.locator(".karte-kopf", { hasText: "c-0001" }).click();
      await page.getByRole("button", { name: "Freigeben" }).click();
      assert.match(await page.locator("#status").textContent(), muster);
      assert.equal((await schreibaufrufe(page)).length, 0);
      await ctx.close();
    }
  });

  await t("Tor I: Ablehnung braucht zwei Wörter und zehn Zeichen, Rückfrage braucht eine Frage", async () => {
    const { page, ctx } = await mitInhalten();
    await page.locator(".karte-kopf", { hasText: "c-0001" }).click();
    await page.getByRole("button", { name: "Ablehnen" }).click();
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
    await page.locator(".karte-kopf", { hasText: "c-0002" }).click();
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
    await page.locator(".karte-kopf", { hasText: "c-0001" }).click();
    await page.evaluate(() => { window.__inhalte[0]["Tor I Entscheid"] = "abgelehnt"; window.__inhalte[0]["Tor I von"] = "Leander"; });
    await page.getByRole("button", { name: "Freigeben" }).click();
    await page.waitForSelector("#status .meldung.fehler");
    assert.match(await page.locator("#status").textContent(), /Schon weiter/);
    assert.equal((await schreibaufrufe(page)).length, 0);
    await ctx.close();
  });

  await t("Tor P: Der Entwurf wird aus der Notion-Seite geladen und gezeigt, Freigabe schreibt Tor P", async () => {
    const { page, ctx } = await mitInhalten();
    await page.locator(".karte-kopf", { hasText: "c-0003" }).click();
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
    await page.locator(".karte-kopf", { hasText: "c-0003" }).click();
    await page.waitForSelector(".entwurf");
    assert.match(await page.locator("#p-queue").textContent(), /2 offene Markierung\(en\)/);
    assert.doesNotMatch(await page.locator("#p-queue .karte-inhalt").textContent(), /Gate 0 der Marke/);
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
    await f.page.locator(".karte-kopf", { hasText: "c-0003" }).click();
    await f.page.waitForSelector(".karte-inhalt .warnung");
    assert.match(await f.page.locator(".karte-inhalt").textContent(), /Der Entwurf liess sich nicht laden/);
    await f.ctx.close();
  });

  await t("Tor P: Wurde der Entwurf inzwischen entschieden, wird nichts überschrieben", async () => {
    const { page, ctx } = await mitInhalten();
    await page.locator(".karte-kopf", { hasText: "c-0003" }).click();
    await page.waitForSelector(".entwurf");
    await page.evaluate(() => { window.__inhalte[2]["Tor P Entscheid"] = "Änderung"; window.__inhalte[2]["Tor P von"] = "Leander"; });
    await page.getByRole("button", { name: "Freigeben" }).click();
    await page.waitForSelector("#status .meldung.fehler");
    assert.match(await page.locator("#status").textContent(), /Schon weiter/);
    assert.equal((await schreibaufrufe(page)).length, 0);
    assert.equal(await page.evaluate(() => window.__inhalte[2]["Tor P Entscheid"]), "Änderung");
    await ctx.close();
  });

  await t("Wochenmodus: Idee für Idee, Fortschritt, Überspringen, am Ende die Zusammenfassung", async () => {
    const rows = INHALTE(); rows.push(inhalt(7, { Titel: "Dritte Idee", Hook: "Ein neuer Satz mit anderem Inhalt." }));
    const { page, ctx } = await seite({ inhalte: rows, marken: MARKEN("freigegeben", "Andrej"), optionen: { name: "Andrej" } });
    await page.click("#wochen-start");
    assert.equal(await page.locator("#wochen-stand").textContent(), "Idee 1 von 3");
    assert.equal(await page.locator("#p-queue .karte-kopf").count(), 1);
    assert.match(await page.locator("#p-queue").textContent(), /Wartezeit/);
    await page.getByRole("button", { name: "Freigeben" }).click();
    await page.waitForSelector("#status .meldung.gut");
    assert.equal(await page.locator("#wochen-stand").textContent(), "Idee 2 von 3");
    assert.match(await page.locator("#p-queue").textContent(), /Messestand/);
    await page.click("#wochen-weiter");
    assert.equal(await page.locator("#wochen-stand").textContent(), "Idee 3 von 3");
    await page.getByRole("button", { name: "Ablehnen" }).click();
    await page.fill("textarea", "Zu ähnlich wie die erste");
    await page.getByRole("button", { name: "Ablehnung senden" }).click();
    await page.waitForSelector("#wochen-stand:has-text('durchgesehen')");
    assert.match(await page.locator("#p-queue").textContent(), /1 übersprungen/);
    assert.equal(await page.locator("#wochen .fortschritt").getAttribute("aria-valuenow"), "3");
    assert.equal((await schreibaufrufe(page)).length, 2);
    await page.click("#wochen-ende");
    assert.match(await page.locator("#p-queue").textContent(), /Messestand/); // übersprungen: bleibt offen
    await ctx.close();
  });

  await t("Wochenmodus erscheint erst ab zwei Ideen", async () => {
    const rows = [inhalt(1, { Titel: "Allein" })];
    const { page, ctx } = await seite({ inhalte: rows, marken: MARKEN(), optionen: { name: "Andrej" } });
    assert.equal(await page.locator("#wochen-start").count(), 0);
    await ctx.close();
  });

  await t("Gate 0: Lücken des Profils, Bestätigung mit Namen, genau die richtigen Felder, danach fällt die Warnung bei den Karten weg", async () => {
    const { page, ctx } = await mitInhalten();
    await page.click("#t-marke");
    const m = await page.locator("#p-marke").textContent();
    assert.match(m, /Gate 0 offen/); assert.match(m, /Es fehlen noch Logo, Caption-Preset und Schlusskarte/); assert.match(m, /Das Markenprofil nennt noch: .*Caption-Preset/);
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
    assert.match(await page.locator("#p-marke").textContent(), /Freigegeben von Andrej/);
    await page.click("#t-queue");
    await page.locator(".karte-kopf", { hasText: "c-0001" }).click();
    assert.doesNotMatch(await page.locator("#p-queue .karte-inhalt").textContent(), /Gate 0 der Marke/);
    await ctx.close();
  });

  await t("Gate 0: «freigegeben» ohne Menschen mit Namen gilt nicht, ohne Namen wird nichts geschrieben", async () => {
    const { page, ctx } = await seite({ inhalte: INHALTE(), marken: MARKEN("freigegeben", ""), optionen: { name: "" } });
    await page.click("#t-marke");
    assert.match(await page.locator("#p-marke").textContent(), /ohne den Namen eines Menschen/);
    assert.match(await page.locator("#p-marke").textContent(), /Gate 0 offen/);
    await page.getByRole("button", { name: "Gate 0 freigeben" }).click();
    await page.getByRole("button", { name: "Ja, Gate 0 freigeben" }).click();
    assert.match(await page.locator("#status").textContent(), /Name fehlt/);
    assert.equal((await schreibaufrufe(page)).length, 0);
    await ctx.close();
  });

  await t("Eine Notion-Erwähnung im Beleg erscheint als Name, nicht als Rohtext", async () => {
    const { page, ctx } = await mitInhalten();
    await page.click("#t-inhalte");
    await page.locator(".zeile-idee a", { hasText: "Mit Rohstoff" }).waitFor();
    const rows = await page.evaluate(() => window.__inhalte[5].Beleg);
    assert.match(rows, /<mention-page/); // so liefert es Notion
    const { page: p2, ctx: c2 } = await seite({ inhalte: [inhalt(1, { Beleg: 'Rohstoff: <mention-page url="https://app.notion.com/p/3fc6be186e9b81a0af4bfa3182e64f54">Marketing System</mention-page>' })], marken: MARKEN(), optionen: { name: "Andrej" } });
    await p2.locator(".karte-kopf", { hasText: "c-0001" }).click();
    const t = await p2.locator("#p-queue .karte-inhalt").textContent();
    assert.match(t, /Rohstoff: Marketing System/);
    assert.doesNotMatch(t, /mention-page/);
    await c2.close(); await ctx.close();
  });

  const mitVerwaltung = (o = {}) => {
    const rows = INHALTE();
    rows.push(inhalt(8, { Titel: "Geplanter Post", Status: "Geplant", Publishing: "Manuell", "date:Geplant für:start": "2026-10-20", Hook: "Ein ganz anderer Satz zum Planen 8." }));
    rows.push(inhalt(9, { Titel: "Erledigt", Status: "Verworfen", Hook: "Noch ein anderer Satz 9." }));
    return seite({ inhalte: rows, marken: MARKEN("freigegeben", "Andrej"), optionen: { name: "Andrej" }, ...o });
  };

  await t("Verwalten: Pausieren schreibt Status, Name, Grund und Zeit, braucht einen Grund", async () => {
    const { page, ctx } = await mitVerwaltung();
    await page.click("#t-inhalte");
    await page.click("#verwalten-c-0004");
    const pause = page.getByRole("button", { name: "Pausieren" });
    assert.equal(await pause.isDisabled(), true);
    await page.fill("textarea", "Kunde wartet auf den Dreh");
    assert.equal(await pause.isDisabled(), false);
    await pause.click();
    await page.waitForSelector("#status .meldung.gut");
    const w = (await eigenschaften(page))[0];
    assert.equal(w.page_id, inhaltId(4));
    assert.deepEqual(Object.keys(w.properties).sort(), ["Status", "Status am".replace(/^/, "date:") + ":is_datetime", "date:Status am:start", "Status von", "Status-Grund"].sort());
    assert.equal(w.properties.Status, "Pausiert");
    assert.equal(w.properties["Status von"], "Andrej");
    assert.equal(w.properties["Status-Grund"], "Kunde wartet auf den Dreh");
    assert.equal(w.properties["date:Status am:is_datetime"], 1);
    assert.match(w.properties["date:Status am:start"], /^\d{4}-\d\d-\d\dT/);
    await ctx.close();
  });

  await t("Verwalten: Verwerfen braucht zwei Wörter, «Pitch bereit» wird nicht verworfen, Endzustände haben keine Handlung", async () => {
    const { page, ctx } = await mitVerwaltung();
    await page.click("#t-inhalte");
    await page.click("#verwalten-c-0004");
    const verwerfen = page.getByRole("button", { name: "Verwerfen" });
    await page.fill("textarea", "Unbrauchbarwegen");
    assert.equal(await verwerfen.isDisabled(), true);
    await page.fill("textarea", "Kunde sagt ab");
    assert.equal(await verwerfen.isDisabled(), false);
    await verwerfen.click();
    await page.waitForSelector("#status .meldung.gut");
    assert.equal((await eigenschaften(page))[0].properties.Status, "Verworfen");
    await page.click("#verwalten-c-0001"); // Pitch bereit
    assert.equal(await page.getByRole("button", { name: "Verwerfen" }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Pausieren" }).count(), 1);
    assert.match(await page.locator("#p-inhalte").textContent(), /unter «Zu entscheiden» mit Tor I/);
    assert.equal(await page.locator("#verwalten-c-0009").count(), 0); // Verworfen: keine Handlung
    await ctx.close();
  });

  await t("Verwalten: «Veröffentlicht» bestätigen nur bei Manuell und Paket, der Grund ist freiwillig", async () => {
    const { page, ctx } = await mitVerwaltung();
    await page.click("#t-inhalte");
    await page.click("#verwalten-c-0008");
    assert.match(await page.locator("#p-inhalte").textContent(), /Bestätige erst, wenn der Beitrag wirklich draussen ist/);
    await page.getByRole("button", { name: "Veröffentlicht bestätigen" }).click();
    await page.waitForSelector("#status .meldung.gut");
    const w = (await eigenschaften(page))[0];
    assert.equal(w.properties.Status, "Veröffentlicht");
    assert.equal(w.properties["Status von"], "Andrej");
    assert.equal(w.properties["Status-Grund"], null);
    await ctx.close();
    const rows = INHALTE(); rows.push(inhalt(8, { Status: "Geplant", Publishing: "Auto", Hook: "Ein ganz anderer Satz zum Planen 8." }));
    const a = await seite({ inhalte: rows, marken: MARKEN(), optionen: { name: "Andrej" } });
    await a.page.click("#t-inhalte");
    await a.page.click("#verwalten-c-0008"); // Pausieren und Verwerfen gehen, nur «Veröffentlicht bestätigen» nicht: bei Auto veröffentlicht der Code selbst
    assert.equal(await a.page.getByRole("button", { name: "Veröffentlicht bestätigen" }).count(), 0);
    assert.equal(await a.page.getByRole("button", { name: "Pausieren" }).count(), 1);
    await a.ctx.close();
  });

  await t("Verwalten: Name ist Pflicht, und hat sich der Stand inzwischen geändert, wird nichts überschrieben", async () => {
    const n = await mitVerwaltung({ optionen: { name: "" } });
    await n.page.click("#t-inhalte");
    await n.page.click("#verwalten-c-0004");
    await n.page.fill("textarea", "Kunde wartet auf den Dreh");
    await n.page.getByRole("button", { name: "Pausieren" }).click();
    assert.match(await n.page.locator("#status").textContent(), /Name fehlt/);
    assert.equal((await schreibaufrufe(n.page)).length, 0);
    await n.ctx.close();
    const { page, ctx } = await mitVerwaltung();
    await page.click("#t-inhalte");
    await page.click("#verwalten-c-0004");
    await page.fill("textarea", "Kunde wartet auf den Dreh");
    await page.evaluate(() => { window.__inhalte[3].Status = "Entwurf fertig"; });
    await page.getByRole("button", { name: "Pausieren" }).click();
    await page.waitForSelector("#status .meldung.fehler");
    assert.match(await page.locator("#status").textContent(), /Schon weiter/);
    assert.equal((await schreibaufrufe(page)).length, 0);
    await ctx.close();
  });

  await t("Inhalte-Tab: alle Zeilen, Filter nach Stand", async () => {
    const { page, ctx } = await mitInhalten();
    await page.click("#t-inhalte");
    assert.equal(await page.locator("#p-inhalte .zeile-idee").count(), 6);
    await page.selectOption("#filter-inhalte", "In Produktion");
    assert.equal(await page.locator("#p-inhalte .zeile-idee").count(), 1);
    assert.match(await page.locator("#p-inhalte").textContent(), /In Arbeit/);
    await ctx.close();
  });

  await t("Inhalte-Tab: Ausgewertetes und Verworfenes (Altbestand) steht nur im Filter «Alle Stände»", async () => {
    const { page, ctx } = await seite({
      inhalte: [...INHALTE(), inhalt(7, { Titel: "Alt ausgewertet", Status: "Ausgewertet" }), inhalt(8, { Titel: "Alt verworfen", Status: "Verworfen" })],
      marken: MARKEN(),
      optionen: { name: "Andrej" },
    });
    await page.click("#t-inhalte");
    assert.equal(await page.locator("#filter-inhalte").inputValue(), "laufend");
    assert.equal(await page.locator("#p-inhalte .zeile-idee").count(), 6);
    assert.doesNotMatch(await page.locator("#p-inhalte").textContent(), /Alt ausgewertet|Alt verworfen/);
    await page.selectOption("#filter-inhalte", "alle");
    assert.equal(await page.locator("#p-inhalte .zeile-idee").count(), 8);
    await page.selectOption("#filter-inhalte", "Verworfen");
    assert.equal(await page.locator("#p-inhalte .zeile-idee").count(), 1);
    await ctx.close();
  });

  await t("Fällt die Ansicht «Inhalte» aus, laufen die Motion-Ideen weiter und der Fehler steht da", async () => {
    const { page, ctx } = await seite({ inhalte: INHALTE(), marken: MARKEN(), optionen: { name: "Andrej", fehlerAnsicht: "inhalte" } });
    assert.equal(await page.locator("#z-queue").textContent(), "4");
    assert.match(await page.locator("#status").textContent(), /Inhalte und Marken nicht gelesen/);
    await page.locator(".karte-kopf", { hasText: "Wert-Verlauf" }).click();
    await page.getByRole("button", { name: "Freigeben" }).click();
    await page.waitForSelector("#status .meldung.gut");
    await ctx.close();
  });

  await t("Handy (390 px): Inhalte, Tor P, Wochenmodus und Marke ohne waagrechtes Scrollen", async () => {
    const { page, ctx } = await mitInhalten({ breite: 390 });
    const ueberlauf = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await page.locator(".karte-kopf", { hasText: "c-0003" }).click();
    await page.waitForSelector(".entwurf");
    assert.ok((await ueberlauf()) <= 0, "Tor P: " + (await ueberlauf()));
    await page.locator(".karte-kopf", { hasText: "c-0003" }).click();
    await page.click("#wochen-start");
    assert.ok((await ueberlauf()) <= 0, "Wochenmodus: " + (await ueberlauf()));
    await page.click("#wochen-ende");
    for (const tab of ["#t-inhalte", "#t-marke"]) { await page.click(tab); assert.ok((await ueberlauf()) <= 0, tab + ": " + (await ueberlauf())); }
    await ctx.close();
  });

  // Bilder zur Durchsicht
  const s = await seite({ breite: 1100, optionen: { name: "Andrej" } });
  const aus = path.join(path.dirname(datei), "pruefplatz-shots");
  fs.mkdirSync(aus, { recursive: true });
  await s.page.locator(".karte-kopf", { hasText: "Wert-Verlauf" }).click();
  await s.page.waitForTimeout(250);
  await s.page.screenshot({ path: path.join(aus, "desktop-pitch.png"), fullPage: true });
  await s.page.locator(".karte-kopf", { hasText: "Vergleichs-Balken" }).click();
  await s.page.locator(".look").nth(1).click();
  await s.page.waitForTimeout(250);
  await s.page.screenshot({ path: path.join(aus, "desktop-looks.png"), fullPage: true });
  await s.page.click("#t-bib");
  await s.page.screenshot({ path: path.join(aus, "desktop-bibliothek.png"), fullPage: true });
  await s.ctx.close();
  const w = await mitInhalten();
  await w.page.locator(".karte-kopf", { hasText: "c-0001" }).click();
  await w.page.waitForTimeout(250);
  await w.page.screenshot({ path: path.join(aus, "desktop-tor-i.png"), fullPage: true });
  await w.page.locator(".karte-kopf", { hasText: "c-0001" }).click();
  await w.page.locator(".karte-kopf", { hasText: "c-0003" }).click();
  await w.page.waitForSelector(".entwurf");
  await w.page.screenshot({ path: path.join(aus, "desktop-tor-p.png"), fullPage: true });
  await w.page.locator(".karte-kopf", { hasText: "c-0003" }).click();
  await w.page.click("#wochen-start");
  await w.page.waitForTimeout(250);
  await w.page.screenshot({ path: path.join(aus, "desktop-wochenmodus.png"), fullPage: true });
  await w.page.click("#wochen-ende");
  await w.page.click("#t-marke");
  await w.page.getByRole("button", { name: "Gate 0 freigeben" }).click();
  await w.page.screenshot({ path: path.join(aus, "desktop-gate0.png"), fullPage: true });
  await w.ctx.close();
  const m = await seite({ breite: 390, optionen: { name: "Andrej" } });
  await m.page.locator(".karte-kopf", { hasText: "Wert-Verlauf" }).click();
  await m.page.waitForTimeout(250);
  await m.page.screenshot({ path: path.join(aus, "handy-pitch.png"), fullPage: true });
  await m.ctx.close();

  await browser.close();
  console.log(`\n${bestanden} bestanden, ${fehler.length} fehlgeschlagen` + (fehler.length ? ": " + fehler.join("; ") : ""));
  console.log("Bilder: " + aus);
  process.exit(fehler.length ? 1 : 0);
})();
