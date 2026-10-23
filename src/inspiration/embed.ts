import { z } from "zod";

/**
 * Inspiration sichten (Plan 23.10.2026): Ein öffentlicher Instagram-Link wird nicht über die Beschreibung, sondern über die Medien selbst ausgewertet.
 * Die normale Seite liefert ohne Anmeldung nur Titel und Beschreibung. Die öffentliche Einbettung (`…/embed/captioned/`) enthält dagegen ohne Anmeldung die Adressen
 * der Videos und Bilder jeder Folie. Dieses Modul ist rein: Es erkennt Links und liest das JSON aus dem HTML der Einbettung. Geladen wird in `sichten.ts`.
 * Nichts davon ist von Instagram als Schnittstelle vorgesehen und kann sich ändern; darum meldet `leseEinbettung` jeden Fehler mit Grund statt zu raten.
 */

export type LinkArt = "reel" | "beitrag" | "profil" | "youtube" | "unbekannt";

export interface Link {
  /** Der Link, wie er eingetragen wurde (ohne Verfolgungsparameter, die ihn nicht ändern). */
  url: string;
  art: LinkArt;
  /** Kurzcode des Reels oder Beitrags, Konto eines Profils, Video-ID bei YouTube. */
  code?: string;
  /** Folie, bei der der Mensch den Link gespeichert hat (`?img_index=`), 1-basiert. */
  folie?: number;
}

const KURZCODE = /^[A-Za-z0-9_-]{5,20}$/;
const KONTO = /^[A-Za-z0-9._]{1,30}$/;
/** Wege auf instagram.com, die kein Konto sind. */
const KEIN_KONTO = new Set(["explore", "accounts", "direct", "stories", "reels", "tv", "about", "legal", "developer", "directory"]);

export function leseLink(roh: string): Link {
  const url = roh.trim();
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { url, art: "unbekannt" };
  }
  const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");
  const teile = u.pathname.split("/").filter(Boolean);
  if (host === "instagram.com") {
    const folie = Number(u.searchParams.get("img_index"));
    const mitFolie = Number.isInteger(folie) && folie >= 1 ? { folie } : {};
    const [erst, zweit] = teile;
    if ((erst === "reel" || erst === "reels" || erst === "tv") && zweit && KURZCODE.test(zweit)) return { url, art: "reel", code: zweit, ...mitFolie };
    if (erst === "p" && zweit && KURZCODE.test(zweit)) return { url, art: "beitrag", code: zweit, ...mitFolie };
    if (erst && teile.length === 1 && !KEIN_KONTO.has(erst) && KONTO.test(erst)) return { url, art: "profil", code: erst };
    return { url, art: "unbekannt" };
  }
  if (host === "youtube.com" && u.pathname === "/watch") {
    const v = u.searchParams.get("v");
    return v ? { url, art: "youtube", code: v } : { url, art: "unbekannt" };
  }
  if (host === "youtu.be" && teile[0]) return { url, art: "youtube", code: teile[0] };
  return { url, art: "unbekannt" };
}

/** Links aus einer Textdatei: je Zeile ein Link oder eine Zeile mit Beschriftung davor («hooks: https://…»); doppelte Codes fallen weg. */
export function linksAusText(text: string): Link[] {
  const gesehen = new Set<string>();
  const aus: Link[] = [];
  for (const zeile of text.split(/\r?\n/)) {
    for (const treffer of zeile.match(/https?:\/\/[^\s<>"')]+/g) ?? []) {
      const l = leseLink(treffer);
      const schluessel = `${l.art}:${l.code ?? l.url}`;
      if (gesehen.has(schluessel)) continue;
      gesehen.add(schluessel);
      aus.push(l);
    }
  }
  return aus;
}

/** Die Adresse der öffentlichen Einbettung, oder undefined, wenn es für diese Art keine gibt. */
export function einbettungsAdresse(l: Link): string | undefined {
  if (!l.code) return undefined;
  if (l.art === "reel") return `https://www.instagram.com/reel/${l.code}/embed/captioned/`;
  if (l.art === "beitrag") return `https://www.instagram.com/p/${l.code}/embed/captioned/`;
  return undefined;
}

/* ---------- Einbettung lesen ---------- */

export type EinbettungsGrund = "keine_daten" | "gesperrt" | "keine_medien";

export class EinbettungsFehler extends Error {
  constructor(
    readonly grund: EinbettungsGrund,
    meldung: string,
  ) {
    super(meldung);
  }
}

const Zahl = z.coerce.number().finite();
const Kind = z.object({
  shortcode: z.string().optional(),
  is_video: z.boolean().optional(),
  display_url: z.string().optional(),
  video_url: z.string().optional(),
  video_duration: Zahl.optional(),
});
const Medium = Kind.extend({
  __typename: z.string().optional(),
  shortcode: z.string().optional(),
  video_view_count: Zahl.optional(),
  edge_liked_by: z.object({ count: Zahl.optional() }).optional(),
  edge_media_to_caption: z.object({ edges: z.array(z.object({ node: z.object({ text: z.string().optional() }) })).optional() }).optional(),
  owner: z.object({ username: z.string().optional() }).optional(),
  edge_sidecar_to_children: z.object({ edges: z.array(z.object({ node: Kind })) }).optional(),
});
const Kontext = z.object({
  context: z.object({ copyright_blocked: z.boolean().optional() }).optional(),
  gql_data: z.object({ shortcode_media: Medium.nullish() }).optional(),
});

export interface Folie {
  /** 1-basiert, in der Reihenfolge des Beitrags. */
  nr: number;
  art: "video" | "bild";
  videoUrl?: string;
  bildUrl?: string;
  dauer?: number;
}

export interface Einbettung {
  code: string;
  typ: "video" | "bild" | "karussell";
  konto?: string;
  /** Der Text des Autors unter dem Beitrag, wie er steht. */
  beschreibung: string;
  /** Öffentliche Zähler zum Zeitpunkt des Abrufs. */
  likes?: number;
  ansichten?: number;
  dauer?: number;
  folien: Folie[];
}

const folieAus = (nr: number, k: z.infer<typeof Kind>): Folie | undefined => {
  if (k.is_video && k.video_url) return { nr, art: "video", videoUrl: k.video_url, ...(k.display_url ? { bildUrl: k.display_url } : {}), ...(k.video_duration ? { dauer: k.video_duration } : {}) };
  if (k.display_url) return { nr, art: "bild", bildUrl: k.display_url };
  return undefined;
};

/** Liest die Einbettungsseite. Wirft `EinbettungsFehler` mit Grund, wenn sie keine brauchbaren Medien enthält. */
export function leseEinbettung(html: string): Einbettung {
  const m = /"contextJSON":("(?:[^"\\]|\\.)*")/.exec(html);
  if (!m) throw new EinbettungsFehler("keine_daten", "Die Einbettungsseite enthält keine Beitragsdaten (Instagram hat das Format geändert oder die Seite verlangt eine Anmeldung)");
  let roh: unknown;
  try {
    roh = JSON.parse(JSON.parse(m[1]!) as string);
  } catch {
    throw new EinbettungsFehler("keine_daten", "Die Beitragsdaten der Einbettung lassen sich nicht lesen");
  }
  const k = Kontext.safeParse(roh);
  const medium = k.success ? k.data.gql_data?.shortcode_media : undefined;
  if (!k.success || !medium) throw new EinbettungsFehler("keine_daten", "Die Einbettung enthält keinen Beitrag");
  if (k.data.context?.copyright_blocked) throw new EinbettungsFehler("gesperrt", "Der Beitrag ist wegen Urheberrecht gesperrt");

  const kinder = medium.edge_sidecar_to_children?.edges.map((e) => e.node) ?? [];
  const folien = (kinder.length ? kinder : [medium]).flatMap((n, i) => folieAus(i + 1, n) ?? []);
  if (!folien.length) throw new EinbettungsFehler("keine_medien", "Die Einbettung nennt keine Adresse für ein Video oder Bild");
  return {
    code: medium.shortcode ?? "",
    typ: kinder.length ? "karussell" : medium.is_video ? "video" : "bild",
    ...(medium.owner?.username ? { konto: medium.owner.username } : {}),
    beschreibung: medium.edge_media_to_caption?.edges?.[0]?.node.text ?? "",
    ...(medium.edge_liked_by?.count !== undefined ? { likes: medium.edge_liked_by.count } : {}),
    ...(medium.video_view_count !== undefined ? { ansichten: medium.video_view_count } : {}),
    ...(medium.video_duration ? { dauer: medium.video_duration } : {}),
    folien,
  };
}
