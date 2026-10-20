---
name: reel-werkstatt
description: Baut aus Rohaufnahmen und Skript ein Reel bis zum Ordner für DaVinci Resolve: Transkription, Skript-Zuordnung mit Take-Auswahl, Storyboard mit B-Roll und Grafiken, Prüfung, Übergabe. Auch den Katalog der B-Roll beschreiben. Benutzen, wenn Rohmaterial und ein Skript für ein Video da sind, ein Storyboard geschrieben werden soll oder B-Roll im Katalog fehlt.
---

# Reel-Werkstatt

Vom Rohmaterial zum Resolve-Ordner (`docs/plan/editing-blueprint.md`, Bauplan v2 Kapitel 3). Alles läuft auf dem Mac mit dem Studio-Ordner und ffmpeg; im Chat lässt sich nur der Plan als Text schreiben und prüfen.

**Du hörst nicht.** Du bewertest Transkript und Messwerte. Ob ein Take überzeugt, ob eine Abweichung vom Skript besser ist, ob das Storyboard stimmt, entscheidet ein Mensch. Du zeigst deshalb immer den besten und den zweitbesten Take und sagst, was du nicht beurteilen konntest.
**Du gibst nichts frei.** Das Storyboard ist ein Entwurf, bis ein Mensch es bestätigt. Du setzt keine Freigabe, keinen Tor-Entscheid und nichts in Notion-Entscheidfeldern (Regel 1).

## Ablauf

1. **Voraussetzungen.** `npm run studio -- doctor`. Whisper fehlt: nur eine Warnung, ein Transkript lässt sich anderswo erzeugen. Skript als Textdatei (ein Satz pro Zeile oder Fliesstext), Aufnahme in `rohmaterial/` des Medien-Ordners, Marke mit Schnittprofil (`marken/<key>.json`). Hat die Marke noch kein freigegebenes Gate 0, ist alles ein Entwurf, kein Export zum Veröffentlichen.
2. **Quellen.** `npm run studio -- schnitt sondiere <aufnahme> > quellen.json`. Exit-Code 1 heisst: Die Datei liegt ausserhalb von Studio- und Medien-Ordner, der Pfad im Plan wäre nicht brauchbar. Datei verschieben, nicht den Pfad von Hand ändern.
3. **Transkript.** `npm run studio -- schnitt transkribiere <aufnahme>` (Datenordner `transkripte/`). Für jede Aufnahme ein Transkript.
4. **Zuordnung und Schnitt.**
   `npm run studio -- schnitt zuordnen --skript skript.md --transkript <quelle>=<transkript.json> --quellen quellen.json --marke <key> --name "<Titel>" --inhalt c-0007 -o plan.json --bericht bericht.json`
   Lies die Ausgabe vollständig und gib dem Menschen weiter:
   - **FEHLT**: Zeilen, die im Material nicht vorkommen. Nicht ergänzen, nachfragen (nachdrehen oder Zeile streichen).
   - **GELB**: Nur Takes mit Füllwort oder Abbruch. Das Füllwort ist herausgeschnitten, die Wortzeit stammt von Whisper und kann danebenliegen. Anhören lassen.
   - **Abweichung**: Zusätzlich gesprochen oder nicht gehört. Du beschreibst den Unterschied und sagst, was du vermutest (Verhörer von Whisper oder bewusste Änderung). Der Mensch entscheidet. Will er den gesprochenen Text in den Untertiteln, läuft der Befehl nochmal mit `--gesprochen 3,5`.
   - **Zugeordnet: x von y (z Prozent)**: Test T2 verlangt mindestens 95 Prozent. Liegt der Wert darunter, nenne die Zeilen und frag, ob Whisper das Modell schlecht trifft (`--modell`) oder das Skript vom Gesprochenen abweicht.
   - Verworfene Segmente: kurz prüfen, ob eine Skriptzeile dabei ist, die Whisper nur schlecht verstanden hat.
5. **Katalog.** Ist der Katalog leer oder fehlt passende B-Roll: `npm run studio -- katalog scan <ordner>`, dann `katalog offen --limit 10`, die Vorschaubilder ansehen und beschreiben (siehe unten). Ohne Katalog gibt es keine B-Roll; erfinde keine Schlüssel.
6. **Storyboard.** `npm run studio -- schnitt auftrag --plan plan.json --regeln regeln.json -o auftrag.md`, `auftrag.md` lesen und `sb.json` schreiben (Format im Auftrag). Jeder Eintrag mit Begründung, B-Roll nur mit Katalog-Schlüssel, Grafiken nur aus aktiven Stücken, Zeiten in Sekunden der Timeline. Der erste Satz mit Aussage steht in den ersten Sekunden (Hook).
   Fehlt eine Grafik, die den Satz besser erklärt hätte: nicht erfinden, sondern in der Motion-Werkstatt als Idee protokollieren (Skill `motion-werkstatt`).
7. **Anwenden.** `npm run studio -- schnitt storyboard --plan plan.json --storyboard sb.json -o plan-storyboard.json --rendern`. Was die Prüfung verwirft, steht mit Grund in der Ausgabe: Das ersetzt keine Ausrede, korrigiere `sb.json` und lauf erneut (ein neues Storyboard ersetzt das alte). Ein nicht bestandener Render ist ein Fehler (Exit-Code 1). Stücke, die nicht «aktiv» sind, nur mit `--entwurf` und nur für eine Vorschau.
8. **Zeigen und bestätigen lassen.** Fasse den Plan für den Menschen zusammen: Länge, Hook, Grafiken und B-Roll mit Zeit und Begründung, verworfene Einträge, betonte Wörter, offene Stellen (gelb, Abweichungen). Er bestätigt oder ändert per Satz («Hook kürzer», «B-Roll bei 12 s ersetzen»); jede Änderung geht zurück zu Schritt 6 oder 7 und setzt die Bestätigung zurück.
9. **Prüfen und übergeben.** `schnitt pruefe --plan plan-storyboard.json`, dann `schnitt resolve --plan plan-storyboard.json`. Der Ordner liegt unter `inhalte/<ID>/ergebnis/resolve`, ein vorhandener wird nie überschrieben. `LIESMICH.md` nennt die Schritte in Resolve und die Stellen, die auffielen.
10. **Nach dem Schnitt in Resolve.** Das Video exportiert ein Mensch. `schnitt export-pruefen <datei>` misst es gegen Export- und Audio-Preset. Ist das Video fertig, trägt `npm run studio -- katalog genutzt --plan plan-storyboard.json` die B-Roll als «zuletzt genutzt» ein (erst dann, nie vor dem Ja des Menschen).

## B-Roll beschreiben (Katalog)

`katalog offen --limit 10` liefert Metadaten und Pfade der Vorschaubilder. Sieh dir die Bilder an (Datei lesen) und schreibe für jede Datei:
`{"schluessel","titel","beschreibung","tags","sicherheit","besteSekunden"?,"personen"?,"log"?}`.
- **Titel** nach Kunde_Ort_Motiv_Aktion_Datum. Kunde und Ort nimmst du aus `ordnerHinweis` und `gps`, nicht aus dem Bild geraten. Fehlt die Angabe, lass sie weg und sag es.
- **Beschreibung** ein bis zwei Sätze, **Tags** deutsch (Motiv, Aktion, Stimmung, Licht, Kamerabewegung, Einsatzfälle).
- **besteSekunden** nur bei Videos, aus den drei Bildern abgeschätzt (Anfang, Mitte, Ende). Du siehst keine Bewegung: Wenn du unsicher bist, setze `sicherheit` auf «niedrig» und lass `besteSekunden` weg.
- **personen** true, wenn Personen erkennbar sind; **log** true, wenn das Bild flach und grau aussieht.
- **sicherheit** ehrlich: hoch, mittel, niedrig. Niedrige Einträge bleiben nutzbar, der Mensch sieht die Warnung.
Dann `katalog beschreibe --json beschreibungen.json`. Lehnt der Befehl Einträge ab, korrigiere sie, statt die Regeln zu umgehen. Die Vorschaubilder sieht nur diese Sitzung (Regel 5).

## Grenzen, die du nennst, statt sie zu überspielen

- Whisper ist mit echtem Dialekt noch nicht gemessen (T2); Schwellen und Füllwortliste sind Annahmen.
- Resolve hat die Dateien noch nie geöffnet (T9). Sag es dem Menschen beim Übergeben.
- Fotos als B-Roll, Musik, Soundeffekte und Untertitel-Hervorhebung sind nicht im Plan. Betonte Wörter stehen in `LIESMICH.md`.
- Der Katalog liegt nicht in Notion, nur als `katalog.json` im Datenordner.
