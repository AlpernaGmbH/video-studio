import type { Markierung } from "./planbau";
import type { Take, Zuordnung } from "./zuordnung";

/** Bericht zur Zuordnung für die Freigabe 1: pro Zeile der beste und der zweitbeste Take, dazu Abweichungen, fehlende Zeilen und verworfene Segmente (Bauplan v2, Kap. 3.3). */

const s1 = (n: number): string => n.toFixed(1).replace(".", ",");
const s2 = (n: number): string => n.toFixed(2).replace(".", ",");
const kurz = (t: string, max = 70): string => (t.length > max ? `${t.slice(0, max - 1)}…` : t);

function takeZeile(label: string, t: Take): string {
  const gruende = t.ausgeschieden.length ? `; ausgeschieden: ${t.ausgeschieden.join("; ")}` : "";
  const pegel = t.energieDb !== undefined ? `, ${s1(t.energieDb)} dB` : "";
  return `  ${label} ${t.quelle} ${s1(t.von)} bis ${s1(t.bis)} s, Punkte ${s2(t.gesamt)}${pegel}${gruende}`;
}

export function zuordnungBericht(z: Zuordnung, markierungen: Markierung[] = []): string[] {
  const aus: string[] = [];
  const n = (st: string): number => z.zeilen.filter((e) => e.status === st).length;
  aus.push(`${z.zeilen.length} Skriptzeilen: ${n("ok")} gefunden, ${n("gelb")} gelb (nur Takes mit Füllwort oder Abbruch), ${n("fehlt")} fehlen im Material; ${z.verworfen.length} Segmente ohne Bezug zum Skript verworfen`);
  const gefunden = n("ok") + n("gelb");
  const anteil = z.zeilen.length ? Math.round((100 * gefunden) / z.zeilen.length) : 0;
  aus.push(`Zugeordnet: ${gefunden} von ${z.zeilen.length} (${anteil} Prozent; Test T2 verlangt mindestens 95 Prozent)`);
  aus.push("");
  for (const e of z.zeilen) {
    const marke = e.status === "ok" ? "ok   " : e.status === "gelb" ? "GELB " : "FEHLT";
    aus.push(`Zeile ${e.zeile} ${marke} ${kurz(e.text)}`);
    if (e.gewaehlt) aus.push(takeZeile("Bester     ", e.gewaehlt));
    if (e.zweitbester) aus.push(takeZeile("Zweitbester", e.zweitbester));
    if (e.takes.length > 2) aus.push(`  (${e.takes.length - 2} weitere Takes)`);
    if (e.abweichung) {
      const teile = [e.abweichung.zusaetzlich.length ? `zusätzlich gesprochen: ${e.abweichung.zusaetzlich.join(" ")}` : "", e.abweichung.fehlend.length ? `im Skript, aber nicht gehört: ${e.abweichung.fehlend.join(" ")}` : ""].filter(Boolean);
      aus.push(`  Abweichung: ${teile.join("; ")}`);
      aus.push(`  Gesprochen: «${kurz(e.abweichung.gesprochen, 100)}»`);
    }
    if (e.status === "fehlt") aus.push("  fehlt im Material");
  }
  if (z.verworfen.length) {
    aus.push("", "Verworfene Segmente (kein Bezug zum Skript):");
    for (const v of z.verworfen) aus.push(`  ${v.quelle} ${s1(v.von)} bis ${s1(v.bis)} s: «${kurz(v.text, 80)}»`);
  }
  const rest = markierungen.filter((m) => m.art === "geschaetzt" || m.art === "gesprochen");
  if (rest.length) {
    aus.push("", "Hinweise zum Schnitt:");
    for (const m of rest) aus.push(`  Zeile ${m.zeile}: ${m.text}`);
  }
  return aus;
}
