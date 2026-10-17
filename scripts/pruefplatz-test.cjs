/*
 * Browser-Test des Prüfplatzes mit nachgebautem Notion-Konnektor (window.claude).
 * Der Mock liefert die Formen, die notion-query-data-sources (Modus rows) und notion-update-page wirklich liefern
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

/** Wird vor der Seite ausgeführt: baut window.claude mit Notion-Mock. */
function initSkript({ mitMcp, ZEILEN, optionen }) {
  const rows = ZEILEN;
  const calls = [];
  window.__calls = calls;
  window.__rows = rows;
  window.__hook = {};
  const antwort = (obj) => ({ content: [{ type: "text", text: JSON.stringify(obj) }], payload: obj });
  const mcp = {
    async callTool(server, tool, input) {
      calls.push({ server, tool, input: JSON.parse(JSON.stringify(input)) });
      if (window.__hook.vor) await window.__hook.vor(tool, input, rows);
      if (optionen.fehlerBeimSchreiben && tool === "notion-update-page") throw { code: optionen.fehlerBeimSchreiben, message: "x" };
      if (tool === "notion-query-data-sources") {
        const f = input.data.filter;
        let res = rows;
        if (f) { const id = f.filters[0].value.value; res = rows.filter((r) => r["Idee-ID"] === id); }
        return antwort({ results: JSON.parse(JSON.stringify(res)), has_more: false });
      }
      if (tool === "notion-update-page") {
        const r = rows.find((x) => x.url.replace(/\W/g, "").includes(input.page_id.replace(/-/g, "")));
        if (!r) throw { code: "tool_error", message: "nicht gefunden" };
        for (const [k, v] of Object.entries(input.properties)) { if (v === null) delete r[k]; else r[k] = v; }
        return antwort({ page_id: input.page_id });
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

  async function seite({ mitMcp = true, optionen = {}, breite = 1100 } = {}) {
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
    await page.addInitScript(initSkript, { mitMcp, ZEILEN: ZEILEN(), optionen });
    await page.goto("https://pruefplatz.test/");
    if (mitMcp) await page.waitForSelector("#p-queue .karte");
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
    assert.equal(erster.input.data.mode, "rows");
    assert.match(erster.input.data.data_source_url, /^collection:\/\//);
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
    assert.match(await page.locator("#p-marke").textContent(), /Platzhalter/);
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
