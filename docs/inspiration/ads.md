# Anzeigen als Medium

Quelle: Dc2A1V4qLzi (42 Formate), DbSNmTbIrQb (40 Formate, mit Beispielanzeigen), DVOb7_LD9Pt (Spot einer Werbeagentur), dazu Dd2pNfBjgts und DeS-FmBDrDX für die Wirkungsmodelle. Eigene Worte. **Behauptungen über Klickraten, Umsatz und «bestkonvertierend» sind Angaben der Anbieter und werden nicht übernommen** (Regel 7).

## Die Formate als Taxonomie

Beide Listen nennen etwa 40 Formate, die sich stark überschneiden. Sie lassen sich in sechs Gruppen ordnen. Die Einschätzung rechts ist **unsere**, für Schweizer KMU und Vereine, nicht die der Autoren:

| Gruppe | Formate | Eignung |
|---|---|---|
| Beweis | Kundenstimme, Bewertungen, Vorher und Nachher, Statistik-Schlagzeile, Transformation | gut, aber nur mit echtem Fall, Einwilligung und Quelle |
| Vergleich | Wir gegen sie, Alt gegen Neu, Problem gegen Lösung, Mythos gegen Fakt, Venn-Diagramm, Tier-Liste, wir gegen uns | gut |
| Erklärung | Diagramm, Whiteboard, Doodle, «Hack 101», «X Gründe» | gut |
| Native | iPhone-Notiz, Textnachricht, E-Mail-Screenshot, Reddit-Stil, Story, Google-Suche, KI-Podcast | teils: nur ehrlich gekennzeichnet und mit echtem Inhalt |
| Aufmerksamkeit | Breaking News, Meme, Warnung, im Notfall, «don't be an idiot» | selten, widerspricht oft unserem Ton |
| Angebot | Paket-Angebot, Knappheitsmeldung, «Entschuldigung»-Anzeige | nur, wenn die Aussage stimmt (keine erfundene Knappheit) |

Weniger geeignet oder auszuschliessen: Nahrungsergänzungs-Muster (Nebenwirkung, Text auf Haut), gekaufte oder erfundene Bewertungen, Scheinwarnungen, jede Aussage, die wie eine Nachricht oder Meldung einer Behörde wirkt.

## Aufbau einer Anzeige (DVOb7_LD9Pt, nur als Struktur)

Behauptung, Beweis, Garantie, Aufruf. Der Spot nennt drei Bausteine für Anzeigen: Angebot, Unterhaltung, Aufmachung. Die Zahlen des Spots (Klickrate, Umsatz, Teilen) sind Eigenwerbung ohne Beleg und kommen nicht ins Repo. Das «gratis drehen, bezahlen bei Zufriedenheit» ist ein Angebot der Agentur und nicht unseres.

## Folgerung für das Medium «Ad» (M2)

- Neuer Wert `ad` im Feld Medium (`studio_contents.medium`, `docs/studio/vertrag.json`, `src/inhalte/inhalt.ts`, Notion-Format).
- **Varianten statt Einzelstück:** eine Anzeige ist eine Matrix aus **Hook** (siehe `hooks.md`), **Körper**, **Format** (Taxonomie oben) und **Aufruf**. Der Auftrag `text_entwurf` erzeugt die Varianten, ein Mensch wählt (Regel 1).
- **Beispielbilder nur eigene** (aus dem Katalog oder gezeichnet), keine Kopien fremder Anzeigen.
- **Rechtliches (Regel 8):** Aussagen zu Preisen, Gesundheit, Vergleichen und Garantien nur aus `content/legal/` oder gar nicht. Das Studio gibt keine Rechtsaussage ab.
- **Keine Zahl ohne Quelle** auch in Anzeigen (Regel 7).
- **Nicht gebaut:** Schnittstelle zu Meta Ads, automatisches Schalten, Budgetsteuerung. Das Studio liefert Entwürfe, Kampagnen schaltet ein Mensch.

## Offene Punkte

Ob Anzeigen in Notion eine eigene Ansicht brauchen und wie die Varianten im Tool entschieden werden (einzeln oder als Satz), ist ein Entscheid beim Bau (Tor I und Tor P gelten wie für jedes Medium).
