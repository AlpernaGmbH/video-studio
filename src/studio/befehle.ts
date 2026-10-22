import path from "node:path";
import type { Args } from "../args";
import type { StudioHome } from "../setup";
import { pruefeInhaltId, reelStand } from "../schnitt/reel";
import { geraeteIdAusToken, ladeToolKonfig, pruefeToken, pruefeUrl, speichereToolKonfig, trenneTool, type KonfigOrt, type ToolKonfig } from "./konfig";
import { ENDPUNKT, entsperre, erzeugeMelder, setzeWartezeitZurueck } from "./melder";
import { hochladen, leseArten, type Art, type Quellen } from "./hochladen";
import { reelQuellen } from "./reel-quellen";
import { VERBINDUNGSTEXT, type Verbindung } from "./texte";
import { MEDIEN } from "./vertrag";

export const TOOL_HILFE = `Alperna-Tool (Fortschritt der Arbeit sichtbar machen; freiwillig, ohne Tool läuft alles wie bisher)
  tool verbinden <Adresse> [--token-stdin]   Geräte-Token im Schlüsselbund ablegen und die Verbindung prüfen. Das Token kommt von «node scripts/studio-geraet.mjs anlegen» im Repo alperna-tool.
                                      Ohne --token-stdin wird es unsichtbar abgefragt; mit --token-stdin kommt es von der Standardeingabe (printf %s "$TOKEN" | ./studio tool verbinden …).
  tool status                         Verbunden? Wie viele Ereignisse warten im Ausgangskorb, wie viele wurden abgelehnt?
  tool senden                         Den Ausgangskorb jetzt senden (auch wenn gerade Wartezeit gilt)
  tool sync <ID>                      Stand eines Inhalts aus dem Tool lesen und den Stand dieses Rechners melden
  tool inhalt neu "<Titel>" [--medium reel] [--marke key] [--funnel …] [--absicht …] [--typ …] [--muster …]
                                      Einen neuen Inhalt im Tool anlegen (Status «Neu», Tore offen); der Code (c-1000, c-1001 …) ist die ID für «reel neu»
  tool hochladen <ID> [--art vorschau,kontaktbogen,gegenlesen,qualitaet]
                                      Vorschau-Video, Kontaktbogen (ein Bild), Gegenlesen-Text und Messwerte des Reels ans Tool hochladen, damit sie am Handy zu sehen sind.
                                      Nur wenn ein Admin im Tool «Vorschauen erlauben» für diesen Inhalt eingeschaltet hat (die Messwerte brauchen das nicht). Plan, Storyboard und Auftrag gehen nie hoch.
  tool trennen                        Token und Adresse löschen (der Ausgangskorb bleibt)
`;

export type { Verbindung } from "./texte";

export interface ToolDeps {
  ort: KonfigOrt;
  /** Wo der Ausgangskorb liegt. */
  ausgang: string;
  fetch?: typeof fetch;
  jetzt?: () => number;
  lesStdin?: () => Promise<string>;
  frageToken?: () => Promise<string>;
  /** Der Studio-Ordner dieses Rechners, für `tool sync` und `tool hochladen`. */
  home?: StudioHome | undefined;
  /** Woher `tool hochladen` die Dateien nimmt (Tests geben eigene). Standard: der Reel-Ordner. */
  quellen?: (id: string) => Quellen;
  ausgabe?: (zeile: string) => void;
  fehler?: (zeile: string) => void;
}

const ZEITLIMIT = 8000;

async function anfrage(konfig: ToolKonfig, f: typeof fetch, pfad: string, init: { method: string; body?: unknown }): Promise<{ status: number; json: unknown }> {
  const abbruch = new AbortController();
  const timer = setTimeout(() => abbruch.abort(), ZEITLIMIT);
  try {
    const res = await f(`${konfig.url}${pfad}`, {
      method: init.method,
      headers: { authorization: `Bearer ${konfig.token}`, ...(init.body !== undefined ? { "content-type": "application/json" } : {}) },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      signal: abbruch.signal,
    });
    const json: unknown = await res.json().catch(() => undefined);
    return { status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

/** Prüft, ob das Tool das Token annimmt: schickt ein Ereignis «Verbindung» (die Antwort 200 heisst: Token gilt und das Studio ist eingeschaltet). */
export async function pruefeVerbindung(konfig: ToolKonfig, f: typeof fetch = fetch, jetzt: () => number = Date.now): Promise<Verbindung> {
  try {
    const r = await anfrage(konfig, f, ENDPUNKT, { method: "POST", body: { events: [{ id: `verbindung-${jetzt()}-${Math.random().toString(36).slice(2, 8)}`, step: "Verbindung", state: "info", at: new Date(jetzt()).toISOString(), detail: { art: "geprueft" } }] } });
    if (r.status === 200) return { art: "ok" };
    if (r.status === 401) return { art: "abgelehnt" };
    if (r.status === 404) return { art: "aus" };
    return { art: "nicht-erreichbar", status: r.status };
  } catch {
    return { art: "nicht-erreichbar" };
  }
}

function lesStdinStandard(): Promise<string> {
  return new Promise((resolve, reject) => {
    const teile: Buffer[] = [];
    process.stdin.on("data", (c: Buffer) => teile.push(c));
    process.stdin.on("end", () => resolve(Buffer.concat(teile).toString("utf8")));
    process.stdin.on("error", reject);
  });
}

/** Fragt das Token unsichtbar ab (nur im Terminal). */
export function frageTokenStandard(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) return reject(new Error("Kein Terminal: das Token mit --token-stdin übergeben"));
    process.stdout.write("Geräte-Token (die Eingabe bleibt unsichtbar): ");
    let eingabe = "";
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const ende = (): void => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", daten);
      process.stdout.write("\n");
    };
    const daten = (z: string): void => {
      for (const c of z) {
        if (c === "\r" || c === "\n") {
          ende();
          return resolve(eingabe);
        }
        if (c === "\u0003") {
          ende();
          return reject(new Error("abgebrochen"));
        }
        if (c === "\u007f" || c === "\b") eingabe = eingabe.slice(0, -1);
        else if (c >= " ") eingabe += c;
      }
    };
    stdin.on("data", daten);
  });
}

export async function toolBefehl(sub: string, a: Args, d: ToolDeps): Promise<number> {
  const aus = d.ausgabe ?? ((z: string) => console.log(z));
  const fehl = d.fehler ?? ((z: string) => console.error(z));
  const f = d.fetch ?? fetch;
  const jetzt = d.jetzt ?? Date.now;

  switch (sub) {
    case "verbinden": {
      const eingabe = a.pos[2];
      if (!eingabe) {
        fehl("Die Adresse fehlt, zum Beispiel: ./studio tool verbinden https://alperna-tool.vercel.app --token-stdin");
        return 2;
      }
      let url: string;
      try {
        url = pruefeUrl(eingabe);
      } catch (e) {
        fehl((e as Error).message);
        return 2;
      }
      let token: string;
      try {
        token = pruefeToken(a.opt["token-stdin"] === true ? await (d.lesStdin ?? lesStdinStandard)() : await (d.frageToken ?? frageTokenStandard)());
      } catch (e) {
        fehl((e as Error).message);
        return 2;
      }
      const v = await pruefeVerbindung({ url, token }, f, jetzt);
      if (v.art === "abgelehnt") {
        fehl(`${VERBINDUNGSTEXT.abgelehnt} Nichts wurde gespeichert.`);
        return 1;
      }
      const gespeichert = speichereToolKonfig(d.ort, url, token);
      entsperre(d.ausgang);
      aus(`Gespeichert: ${gespeichert.url}, Gerät ${geraeteIdAusToken(token)?.slice(0, 8)}…, Token ${gespeichert.quelle === "schluesselbund" ? "im Schlüsselbund" : "in tool.json (0600), der Schlüsselbund war nicht verfügbar"}.`);
      aus(VERBINDUNGSTEXT[v.art]);
      if (v.art !== "ok") aus("Die Verbindung ist trotzdem eingerichtet; Ereignisse warten im Ausgangskorb, bis das Tool antwortet.");
      return 0;
    }
    case "status": {
      const g = ladeToolKonfig(d.ort);
      if (!g.konfig) {
        aus(g.hinweis ?? "Nicht mit dem Tool verbunden (freiwillig). Verbinden: ./studio tool verbinden <Adresse> --token-stdin");
        return 0;
      }
      const m = erzeugeMelder({ konfig: g.konfig, ausgang: d.ausgang });
      const s = m.stand();
      const wo = g.quelle === "umgebung" ? "aus den Umgebungsvariablen" : g.quelle === "schluesselbund" ? "Token im Schlüsselbund" : "Token in tool.json";
      aus(`Verbunden mit ${g.konfig.url} (Gerät ${geraeteIdAusToken(g.konfig.token)?.slice(0, 8)}…, ${wo})`);
      aus(`Ausgangskorb: ${s.wartend} warten, ${s.abgelehnt} abgelehnt${s.gesperrt ? ". GESPERRT: das Tool lehnt das Token ab, neues Token mit «tool verbinden»" : ""}`);
      if (s.nichtVor !== undefined && s.nichtVor > jetzt()) aus(`Nächster Versuch ab ${new Date(s.nichtVor).toLocaleTimeString("de-CH")} (jetzt senden: ./studio tool senden)`);
      return 0;
    }
    case "senden": {
      const g = ladeToolKonfig(d.ort);
      if (!g.konfig) {
        fehl(g.hinweis ?? "Nicht mit dem Tool verbunden: ./studio tool verbinden <Adresse> --token-stdin");
        return 1;
      }
      setzeWartezeitZurueck(d.ausgang);
      const m = erzeugeMelder({ konfig: g.konfig, ausgang: d.ausgang, fetch: f, jetzt, zeitlimit: ZEITLIMIT, verzoegerung: 0 });
      await m.leeren(60_000);
      const s = m.stand();
      const h = m.hinweis();
      if (h) fehl(h);
      aus(s.wartend ? `${s.wartend} Ereignisse warten noch (das Tool ist nicht erreichbar oder drosselt).` : "Der Ausgangskorb ist leer.");
      return s.wartend ? 1 : 0;
    }
    case "sync": {
      const id = a.pos[2];
      try {
        pruefeInhaltId(id);
      } catch (e) {
        fehl((e as Error).message);
        return 2;
      }
      if (!d.home) {
        fehl("Der Studio-Ordner ist auf diesem Rechner nicht eingerichtet: «./studio init» ausführen");
        return 1;
      }
      const g = ladeToolKonfig(d.ort);
      if (!g.konfig) {
        fehl(g.hinweis ?? "Nicht mit dem Tool verbunden: ./studio tool verbinden <Adresse> --token-stdin");
        return 1;
      }
      const stand = reelStand(d.home, id!);
      const lokal = [`Skript ${stand.skript ? "ja" : "nein"}`, `Aufnahmen ${stand.aufnahmen}`, `Plan ${stand.plan ? "ja" : "nein"}`, `Storyboard ${stand.storyboard ? "ja" : "nein"}`, `Vorschau ${stand.vorschau ? "ja" : "nein"}`, `Resolve-Ordner ${stand.resolve ? "ja" : "nein"}`];
      aus(`Dieser Rechner, ${id}: ${lokal.join(", ")}`);
      try {
        const r = await anfrage(g.konfig, f, `/api/studio-geraet/contents/${id}`, { method: "GET" });
        if (r.status === 401) {
          fehl(VERBINDUNGSTEXT.abgelehnt);
          return 1;
        }
        if (r.status === 404) aus(`Im Tool ist ${id} nicht bekannt (der Inhalt entsteht im Tool oder beim Import aus Notion; dieser Rechner legt keine Codes fest).`);
        else if (r.status === 200) {
          const t = r.json as { status?: string; tor_i?: string; tor_p?: string; version?: number; preview_allowed?: boolean; archived?: boolean };
          aus(`Im Tool: Status ${t.status}, Tor I ${t.tor_i}, Tor P ${t.tor_p}, Fassung ${t.version}, Vorschau ${t.preview_allowed ? "erlaubt" : "nicht erlaubt"}${t.archived ? ", archiviert" : ""}`);
        } else {
          fehl(`Das Tool antwortete ${r.status}.`);
          return 1;
        }
      } catch {
        fehl(VERBINDUNGSTEXT["nicht-erreichbar"]);
        return 1;
      }
      const m = erzeugeMelder({ konfig: g.konfig, ausgang: d.ausgang, fetch: f, jetzt, zeitlimit: ZEITLIMIT, verzoegerung: 0 });
      m.melde({ step: "Stand", state: "info", code: id!, detail: { skript: stand.skript, aufnahmen: stand.aufnahmen, plan: stand.plan, gegenlesen: stand.gegenlesen, storyboard: stand.storyboard, vorschau: stand.vorschau, resolve: stand.resolve } });
      await m.leeren(8000);
      aus(m.stand().wartend ? "Der Stand dieses Rechners wartet im Ausgangskorb." : "Der Stand dieses Rechners ist gemeldet.");
      return 0;
    }
    case "inhalt": {
      if (a.pos[2] !== "neu") {
        fehl(`Unbekannter Befehl «tool inhalt ${a.pos[2] ?? ""}»\n\n${TOOL_HILFE}`);
        return 2;
      }
      const titel = a.pos[3]?.trim();
      if (!titel) {
        fehl('Der Titel fehlt, zum Beispiel: ./studio tool inhalt neu "Küche Gossau" --medium reel');
        return 2;
      }
      const medium = typeof a.opt["medium"] === "string" ? a.opt["medium"] : undefined;
      if (medium !== undefined && !MEDIEN.includes(medium)) {
        fehl(`Unbekanntes Medium «${medium}». Erlaubt: ${MEDIEN.join(", ")}`);
        return 2;
      }
      const text = (n: string): string | undefined => (typeof a.opt[n] === "string" && a.opt[n] !== "" ? (a.opt[n] as string) : undefined);
      const body = { title: titel, ...(medium ? { medium } : {}), ...(text("marke") ? { brand: text("marke") } : {}), ...(text("funnel") ? { funnel: text("funnel") } : {}), ...(text("absicht") ? { intent: text("absicht") } : {}), ...(text("typ") ? { content_type: text("typ") } : {}), ...(text("muster") ? { pattern: text("muster") } : {}) };
      const g = ladeToolKonfig(d.ort);
      if (!g.konfig) {
        fehl(g.hinweis ?? "Nicht mit dem Tool verbunden: ./studio tool verbinden <Adresse> --token-stdin");
        return 1;
      }
      try {
        const r = await anfrage(g.konfig, f, "/api/studio-geraet/contents", { method: "POST", body });
        if (r.status === 201 || r.status === 200) {
          const code = (r.json as { code?: string }).code;
          aus(`Angelegt: ${code}, «${titel}». Status «Neu», Tor I und Tor P offen: Freigeben kann nur ein Mensch im Tool.`);
          aus(`Weiter mit: ./studio reel neu ${code} --marke ${text("marke") ?? "<Marke>"} --zwischenablage`);
          return 0;
        }
        if (r.status === 401) fehl(VERBINDUNGSTEXT.abgelehnt);
        else if (r.status === 404) fehl(VERBINDUNGSTEXT.aus);
        else if (r.status === 422) {
          const j = r.json as { error?: string; issues?: { path: string; message: string }[] };
          fehl(`Das Tool lehnt die Angaben ab: ${j.issues?.length ? j.issues.map((i) => `${i.path || "Angaben"}: ${i.message}`).join("; ") : (j.error ?? "ungültig")}`);
        } else fehl(`Das Tool antwortete ${r.status}.`);
        return 1;
      } catch {
        fehl(VERBINDUNGSTEXT["nicht-erreichbar"]);
        return 1;
      }
    }
    case "hochladen": {
      const id = a.pos[2];
      try {
        pruefeInhaltId(id);
      } catch (e) {
        fehl((e as Error).message);
        return 2;
      }
      let arten: Art[] | undefined;
      if (a.opt["art"] !== undefined) {
        const gelesen = typeof a.opt["art"] === "string" ? leseArten(a.opt["art"]) : "Nach --art fehlt die Liste, zum Beispiel --art vorschau,qualitaet";
        if (typeof gelesen === "string") {
          fehl(gelesen);
          return 2;
        }
        arten = gelesen;
      }
      if (!d.home) {
        fehl("Der Studio-Ordner ist auf diesem Rechner nicht eingerichtet: «./studio init» ausführen");
        return 1;
      }
      const g = ladeToolKonfig(d.ort);
      if (!g.konfig) {
        fehl(g.hinweis ?? "Nicht mit dem Tool verbunden: ./studio tool verbinden <Adresse> --token-stdin");
        return 1;
      }
      const konfig = g.konfig;
      const m = erzeugeMelder({ konfig, ausgang: d.ausgang, fetch: f, jetzt, zeitlimit: ZEITLIMIT, verzoegerung: 0 });
      const code = await hochladen({
        id: id!,
        ...(arten ? { arten } : {}),
        konfig,
        fetch: f,
        quellen: d.quellen ? d.quellen(id!) : reelQuellen(d.home, id!),
        aus,
        fehl,
        melde: (e) => m.melde({ step: "Hochladen", state: e.state, code: id!, detail: e.detail }),
      });
      await m.leeren(5000);
      return code;
    }
    case "trennen": {
      trenneTool(d.ort);
      aus(`Token und Adresse gelöscht. Der Ausgangskorb (${path.basename(d.ausgang)}/) bleibt.`);
      return 0;
    }
    default:
      fehl(`Unbekannter Befehl «tool ${sub}»\n\n${TOOL_HILFE}`);
      return 2;
  }
}
