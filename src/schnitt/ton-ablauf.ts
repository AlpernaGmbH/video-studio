import { messerMitCache, paareTon, type Versatz } from "./ton-sync";

/**
 * Welche Tonaufnahme gehört zu welchem Video? Der Ablauf für `reel vorbereiten` (Plan v4): von Hand angegebene Versätze gelten zuerst, den Rest misst `ton-sync.ts`.
 * Was unsicher ist, wird gemeldet und nicht benutzt: Ein falsch gelegter Ton ist schlimmer als keiner.
 */

export interface TonEingabe {
  videos: { id: string; datei: string }[];
  toene: { id: string; datei: string }[];
  /** Von Hand angegebene Versätze je Videoquelle. `ton` nennt die Tonaufnahme, wenn es mehrere gibt. */
  manuell?: ReadonlyMap<string, { versatz: number; ton?: string }>;
  /** Ersetzbar für Tests. */
  messe?: (videoDatei: string, tonDatei: string) => Promise<Versatz | undefined>;
}

export interface TonPaarung {
  ton: string;
  versatz: number;
  herkunft: "messung" | "hand";
  sicherheit?: Versatz["sicherheit"];
  wert?: number;
}

export interface TonErgebnis {
  paare: Map<string, TonPaarung>;
  /** Lesbare Zeilen für die Ausgabe. */
  meldungen: string[];
}

const z2 = (n: number): string => n.toFixed(2).replace(".", ",");
const vorz = (n: number): string => `${n >= 0 ? "+" : "−"}${z2(Math.abs(n))}`;

/** `5.3` (nur bei einem Video und einer Aufnahme), oder `clip1=5.3;clip2=-2:aufnahme` (Videoquelle=Sekunden, danach mit `:` die Aufnahme). Dezimalpunkt, Trenner `;`. */
export function parseVersatzOption(text: string, videoIds: string[]): Map<string, { versatz: number; ton?: string }> {
  const aus = new Map<string, { versatz: number; ton?: string }>();
  const teile = text.split(";").map((x) => x.trim()).filter(Boolean);
  if (!teile.length) throw new Error("--versatz ist leer. Erwartet: Sekunden (bei einem Video) oder «videoquelle=Sekunden;…»");
  for (const t of teile) {
    const m = /^(?:([a-z0-9][a-z0-9-]*)=)?(-?\d+(?:\.\d+)?)(?::([a-z0-9][a-z0-9-]*))?$/.exec(t);
    if (!m) throw new Error(`--versatz «${t}» ist nicht lesbar. Erwartet: «5.3» oder «videoquelle=5.3» oder «videoquelle=5.3:aufnahme» (Dezimalpunkt)`);
    let id = m[1];
    if (!id) {
      if (videoIds.length !== 1) throw new Error(`--versatz ohne Videoquelle geht nur bei genau einem Video. Hier gibt es ${videoIds.length}: ${videoIds.join(", ")}. Schreibe «${videoIds[0] ?? "video"}=${m[2]}»`);
      id = videoIds[0]!;
    }
    if (!videoIds.includes(id)) throw new Error(`--versatz nennt «${id}», das ist keine Videoquelle. Vorhanden: ${videoIds.join(", ")}`);
    aus.set(id, { versatz: Number(m[2]), ...(m[3] ? { ton: m[3] } : {}) });
  }
  return aus;
}

export async function ordneTonZu(e: TonEingabe): Promise<TonErgebnis> {
  const paare = new Map<string, TonPaarung>();
  const meldungen: string[] = [];
  if (!e.toene.length) return { paare, meldungen };
  const tonNachId = new Map(e.toene.map((t) => [t.id, t]));

  for (const [video, m] of e.manuell ?? []) {
    if (!e.videos.some((v) => v.id === video)) {
      meldungen.push(`Versatz für «${video}» ignoriert: Dieses Video gibt es nicht mehr im Ordner`);
      continue;
    }
    const ton = m.ton ?? (e.toene.length === 1 ? e.toene[0]!.id : undefined);
    if (!ton) throw new Error(`Für «${video}» gibt es mehrere Tonaufnahmen (${e.toene.map((t) => t.id).join(", ")}). Schreibe «--versatz ${video}=${m.versatz}:<aufnahme>»`);
    if (!tonNachId.has(ton)) throw new Error(`Die Tonaufnahme «${ton}» gibt es nicht (vorhanden: ${e.toene.map((t) => t.id).join(", ")})`);
    paare.set(video, { ton, versatz: m.versatz, herkunft: "hand" });
    meldungen.push(`Ton: ${video} ← ${ton}, Versatz ${vorz(m.versatz)} s (von Hand)`);
  }

  const offen = e.videos.filter((v) => !paare.has(v.id));
  if (offen.length) {
    const r = await paareTon(
      offen.map((v) => v.datei),
      e.toene.map((t) => t.datei),
      e.messe ?? messerMitCache(),
    );
    const videoVonDatei = new Map(offen.map((v) => [v.datei, v.id]));
    const tonVonDatei = new Map(e.toene.map((t) => [t.datei, t.id]));
    for (const p of r.paare) {
      const video = videoVonDatei.get(p.video)!;
      const ton = tonVonDatei.get(p.ton)!;
      paare.set(video, { ton, versatz: p.versatz.versatz, herkunft: "messung", sicherheit: p.versatz.sicherheit, wert: p.versatz.wert });
      meldungen.push(`Ton: ${video} ← ${ton}, Versatz ${vorz(p.versatz.versatz)} s (gemessen, Sicherheit ${p.versatz.sicherheit}, Übereinstimmung ${z2(p.versatz.wert)})`);
    }
    for (const u of r.unsicher) {
      const video = videoVonDatei.get(u.video)!;
      meldungen.push(`Ton unsicher, nicht benutzt: ${video} und ${tonVonDatei.get(u.ton)} passen nur schwach zusammen (Übereinstimmung ${z2(u.versatz.wert)}). Weiss jemand den Versatz, so: «--versatz ${video}=<Sekunden>»`);
    }
    for (const datei of r.ohneTreffer) {
      const video = videoVonDatei.get(datei)!;
      meldungen.push(`Kein Ton gefunden für ${video}: Die Kamera hat keine brauchbare Tonspur zum Vergleichen, oder die Aufnahme deckt das Video nicht zu mindestens 80 Prozent ab. Der Versatz geht nur von Hand: «--versatz ${video}=<Sekunden>»`);
    }
  }
  const benutzt = new Set([...paare.values()].map((p) => p.ton));
  for (const t of e.toene) if (!benutzt.has(t.id)) meldungen.push(`Die Tonaufnahme ${t.id} gehört zu keinem Video und wird nicht benutzt`);
  return { paare, meldungen };
}
