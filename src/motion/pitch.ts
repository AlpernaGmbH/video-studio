import { ausloesenderText, type Idee } from "./idee";

function zeit(t: number | undefined): string {
  return t === undefined ? "" : ` bei ${t.toFixed(1).replace(".", ",")} s`;
}

/** Quelle als eine Zeile, immer mit dem genauen Satz oder der genauen Beobachtung. */
export function quellenzeile(i: Idee): string {
  const q = i.quelle;
  switch (q.typ) {
    case "video":
      return `Video ${q.projekt}${q.zeile ? `, Zeile ${q.zeile}` : ""}${zeit(q.t)}`;
    case "inspiration":
      return `Inspirationsvideo «${q.titel}»${q.url ? ` (${q.url})` : ""}${zeit(q.zeit)}`;
    case "auftrag":
      return `Direkter Auftrag von ${q.von}`;
  }
}

/** Der Pitch als Text für den Prüfplatz oder eine Notion-Seite. Ruhig, ohne Druck. */
export function pitchText(i: Idee): string {
  if (!i.pitch) throw new Error(`${i.id} hat noch keinen Pitch`);
  const p = i.pitch;
  const w = i.warumNichtsPasst;
  const zeilen: string[] = [
    `# Pitch ${i.id}: ${i.titel}`,
    "",
    `**Quelle:** ${quellenzeile(i)}`,
    "",
    `> «${ausloesenderText(i.quelle)}»`,
    "",
    "## Worum es geht",
    "",
    p.text,
    "",
    "## Warum nichts Bestehendes passt",
    "",
    w.zusammenfassung,
    "",
    `Geprüft wurden ${w.geprueft.length} von ${w.bibliothekGroesse} Stücken:`,
    "",
    ...w.geprueft.map((g) => `- **${g.stueck}:** ${g.grund}`),
    "",
    "## Was die Grafik zeigt",
    "",
    p.zeigt,
    "",
    "## Was pro Einsatz anders sein kann",
    "",
    ...p.parameter.map((x) => `- ${x}`),
    "",
    "## Weitere Einsätze",
    "",
    ...p.wiederverwendung.map((x) => `- ${x}`),
    "",
    `## Aufwand: ${p.aufwand}`,
    "",
    "## Entscheidung",
    "",
    "- [ ] Freigeben",
    "- [ ] Ablehnen. Grund: …",
    "",
    "Nach einer Freigabe wird noch nichts gebaut. Zuerst kommen drei Looks als Standbilder zur Wahl.",
    "",
  ];
  return zeilen.join("\n");
}
