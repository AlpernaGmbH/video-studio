---
name: reel-werkstatt
description: Baut aus Rohaufnahmen und Skript ein Reel bis zum Ordner für DaVinci Resolve: Transkription, Skript-Zuordnung mit Take-Auswahl, Storyboard mit B-Roll und Grafiken, Prüfung, Übergabe. Auch den Katalog der B-Roll beschreiben. Benutzen, wenn Rohmaterial und ein Skript für ein Video da sind (auch bei «editier mir das Video, das Rohmaterial liegt in …»), ein Storyboard geschrieben werden soll oder B-Roll im Katalog fehlt.
---

# Reel-Werkstatt

Vom Rohmaterial zum Resolve-Ordner (`docs/plan/editing-blueprint.md`, Bauplan v2 Kapitel 3). Alles läuft auf dem Mac mit dem Studio-Ordner und ffmpeg; im Chat lässt sich nur der Plan als Text schreiben und prüfen.

**Du hörst nicht.** Du bewertest Transkript und Messwerte. Ob ein Take überzeugt, ob eine Abweichung vom Skript besser ist, ob das Storyboard stimmt, entscheidet ein Mensch. Du zeigst deshalb immer den besten und den zweitbesten Take und sagst, was du nicht beurteilen konntest.
**Du gibst nichts frei.** Das Storyboard ist ein Entwurf, bis ein Mensch es bestätigt. Du setzt keine Freigabe, keinen Tor-Entscheid und nichts in Notion-Entscheidfeldern (Regel 1).

## Kurzweg (Standard)

Auf dem Mac gibt es den Ablauf mit festen Ordnern, benutze ihn, statt die Einzelschritte unten von Hand zu verketten (`./studio reel` zeigt alles). Der Inhalt hat eine Kennung aus «Inhalte» (`c-0007`).

1. `./studio reel neu <ID> --marke <key> --skript <datei>` (auf dem Mac ohne Chat) oder mit `--zwischenablage`; die Videos gehören nach `rohmaterial/<ID>/`.
   - Das Skript kommt aus dem Notion-Inhalt (Entwurf). **Das Skript stimmt nicht immer.** Gibt es keines oder weicht das Gesprochene stark ab: `./studio reel transkript <ID>` schreibt `ergebnis/transkript.md`; du wählst die Sätze und schreibst sie wörtlich in `skript.md`. Erfinde kein Skript.
   - Liegt das Rohmaterial woanders (ausserhalb von Studio- und Medien-Ordner), kopiere die Videos nach `rohmaterial/<ID>/` des Medien-Ordners (`cp -c` auf demselben Laufwerk braucht keinen zusätzlichen Platz). Verschiebe und lösche nichts; frag vor dem Kopieren, wenn es mehr als etwa 20 GB sind.
   - Getrennter Ton (externes Mikrofon, Recorder): Tondateien (wav, m4a, mp3, aif, flac) gehören in denselben Ordner wie die Videos. `reel vorbereiten` legt sie selbst über die Videos (Versatz aus der Lautstärkekurve) und meldet jede Paarung mit Versatz und Sicherheit. Lies diese Zeilen und gib sie weiter. Steht dort «unsicher» oder «Kein Ton gefunden» (zum Beispiel weil die Kamera gar keinen Ton aufnahm), wurde der Ton **nicht** benutzt: Frag den Menschen nach dem Versatz in Sekunden (Recorder früher gestartet = positiv) und starte `reel vorbereiten` mit `--versatz <Sekunden>` (bei mehreren Videos `--versatz clip-1=5.3;clip-2=-2`, bei mehreren Aufnahmen `clip-1=5.3:aufnahme`). Der Versatz wird gemerkt. `--ohne-ton-sync` lässt die Tonspur der Kamera gelten. Der Ton-Abgleich ist an echtem Material noch nicht geprüft (Test T10): Sag, dass der Mensch in Resolve an einer Stelle mit sichtbarem Mund den Gleichlauf prüfen soll.
2. `./studio reel vorbereiten <ID>`: Whisper, Stille der Tonspur, Farbe, Zuordnung, Plan, `ergebnis/gegenlesen.md`. Die Zeilen «Farbe:» sagen, ob das Material als Log (flach) oder normal gilt; steht dort «unsicher», frag den Menschen, was die Kamera aufnahm (Log-Profil, normales Bild) und setz es mit `--farbe log` oder `--farbe rec709`. Die Zeilen «Look:» nennen die LUTs; sie sind eine Näherung aus Zahlen der Marke, keine Kamera-LUT, und die Hautfarbe prüft ein Mensch am Vectorscope. Lies die Ausgabe vollständig und gib FEHLT, GELB, Abweichungen und die Zuordnungsquote weiter (Regeln in Schritt 4 unten). Die Untertitel zeigen das Gehörte.
3. **Gegenlesen ist Pflicht.** Lies `gegenlesen.md` vollständig, Clip für Clip: Du hörst nichts, du liest, was Whisper in diesem Stück hörte. Melde Regieanweisungen («und Action», Anweisungen an die Kamera), Abbrüche, Neustarts und Verhörer («Kirche» statt «Küche»). Schreibe das Ergebnis nach `ergebnis/gegenlesen.json` (Format am Ende der Datei, `gelesen: true` nur, wenn du jeden Clip gelesen hast) und führe `./studio reel gegenlesen <ID>` aus. Es schneidet die Stellen heraus, korrigiert die Wörter und schreibt `auftrag.md`. Ohne gültiges Gegenlesen läuft `reel storyboard` nicht.
4. Storyboard schreiben (Schritt 6 unten, Format im Auftrag) nach `ergebnis/storyboard.json`, dann `./studio reel storyboard <ID>` (Stücke, die nicht aktiv sind, nur mit `--entwurf`). **Zooms setzt du nur hier**, am Schluss: nur auf betonten Wörtern, höchstens so viele je Minute, wie der Auftrag nennt. Der Schnitt zoomt nicht von allein. Sorge für mehr Grafiken, Mockups und B-Roll als Zooms: Hektik ohne Gestaltung wirkt billig, die Marke will ruhig und hochwertig.
5. Kontaktbogen und Vorschau zeigen lassen, Änderungen per Satz einarbeiten (neue Antwort, derselbe Befehl), erst nach dem Ja des Menschen `./studio reel uebergabe <ID>`.
`./studio reel status` sagt je Inhalt, was der nächste Schritt ist.

**Läuft die Sitzung auf dem Mac (Claude Code oder Cowork im Ordner `video-studio`), tippt der Mensch keinen Befehl und kopiert nichts.** Er sagt zum Beispiel «Editier mir das Video, das Rohmaterial liegt in …». Dann gilt:
- Du führst die Befehle selbst aus. Das Skript legst du als Datei ab (Notion-Inhalt lesen, in eine Datei schreiben) und gibst `--skript <datei>` an, nie `--zwischenablage`. Das Gegenlesen und das Storyboard schreibst du als Datei, die Befehle nehmen sie dort.
- Das Gegenlesen kostet Zeit, spart aber ein Video, das nach Regie und Verhörern klingt: Mach es immer, auch wenn die Zuordnung 100 Prozent zeigt.
- DaVinci Resolve bedienst du nicht und hast es nie geöffnet. Das Ergebnis ist ein Ordner mit Timeline-Dateien (`resolve/`), den der Mensch in Resolve importiert. Sag das beim Übergeben, damit niemand einen fertigen Schnitt erwartet.
Läuft die Sitzung nicht auf dem Mac (Chat, Cloud), geht es nur über die Zwischenablage (`--zwischenablage`), und der Mensch muss im Terminal die Befehle ausführen, die du ihm gibst.

## Ablauf (Einzelschritte)

1. **Voraussetzungen.** `./studio update`, dann `./studio doctor`. Whisper fehlt: `./studio whisper einrichten` (einmalig, eigene Python-Umgebung, lädt das Modell; läuft lokal, kostet nichts ausser Zeit). Skript als Textdatei (ein Satz pro Zeile oder Fliesstext), Aufnahme in `rohmaterial/` des Medien-Ordners, Marke mit Schnittprofil (`marken/<key>.json`). Hat die Marke noch kein freigegebenes Gate 0, ist alles ein Entwurf, kein Export zum Veröffentlichen.
2. **Quellen.** `./studio schnitt sondiere <aufnahme> > quellen.json`. Exit-Code 1 heisst: Die Datei liegt ausserhalb von Studio- und Medien-Ordner, der Pfad im Plan wäre nicht brauchbar. Datei verschieben, nicht den Pfad von Hand ändern.
3. **Transkript.** `./studio schnitt transkribiere <aufnahme>` (Datenordner `transkripte/`). Für jede Aufnahme ein Transkript.
4. **Zuordnung und Schnitt.**
   `./studio schnitt zuordnen --skript skript.md --transkript <quelle>=<transkript.json> --quellen quellen.json --marke <key> --name "<Titel>" --inhalt c-0007 -o plan.json --bericht bericht.json`
   Lies die Ausgabe vollständig und gib dem Menschen weiter:
   - **FEHLT**: Zeilen, die im Material nicht vorkommen. Nicht ergänzen, nachfragen (nachdrehen oder Zeile streichen).
   - **GELB**: Nur Takes mit Füllwort oder Abbruch. Das Füllwort ist herausgeschnitten, die Wortzeit stammt von Whisper und kann danebenliegen. Anhören lassen.
   - **Abweichung**: Zusätzlich gesprochen oder nicht gehört. Du beschreibst den Unterschied und sagst, was du vermutest (Verhörer von Whisper oder bewusste Änderung). Der Mensch entscheidet. Will er den gesprochenen Text in den Untertiteln, läuft der Befehl nochmal mit `--gesprochen 3,5`.
   - **Zugeordnet: x von y (z Prozent)**: Test T2 verlangt mindestens 95 Prozent. Liegt der Wert darunter, nenne die Zeilen und frag, ob Whisper das Modell schlecht trifft (`--modell`) oder das Skript vom Gesprochenen abweicht.
   - Verworfene Segmente: kurz prüfen, ob eine Skriptzeile dabei ist, die Whisper nur schlecht verstanden hat.
5. **Katalog.** Ist der Katalog leer oder fehlt passende B-Roll: `./studio katalog scan <ordner>`, dann `katalog offen --limit 10`, die Vorschaubilder ansehen und beschreiben (siehe unten). Ohne Katalog gibt es keine B-Roll; erfinde keine Schlüssel.
6. **Storyboard.** `./studio schnitt auftrag --plan plan.json --regeln regeln.json -o auftrag.md`, `auftrag.md` lesen und `sb.json` schreiben (Format im Auftrag). Jeder Eintrag mit Begründung, B-Roll nur mit Katalog-Schlüssel, Grafiken nur aus aktiven Stücken, Zeiten in Sekunden der Timeline. Der erste Satz mit Aussage steht in den ersten Sekunden (Hook).
   Fehlt eine Grafik, die den Satz besser erklärt hätte: nicht erfinden, sondern in der Motion-Werkstatt als Idee protokollieren (Skill `motion-werkstatt`).
7. **Anwenden.** `./studio schnitt storyboard --plan plan.json --storyboard sb.json -o plan-storyboard.json --rendern`. Was die Prüfung verwirft, steht mit Grund in der Ausgabe: Das ersetzt keine Ausrede, korrigiere `sb.json` und lauf erneut (ein neues Storyboard ersetzt das alte). Ein nicht bestandener Render ist ein Fehler (Exit-Code 1). Stücke, die nicht «aktiv» sind, nur mit `--entwurf` und nur für eine Vorschau.
8. **Zeigen und bestätigen lassen.** `./studio schnitt kontaktbogen --plan plan-storyboard.json -o kontaktbogen.html` macht ein Standbild je Grafik und B-Roll (Datei im Browser öffnen oder als Artifact veröffentlichen, damit das Team sie sieht; die Standbilder zeigen Kundenmaterial, also nur im Team teilen). Danach `./studio schnitt vorschau --plan plan-storyboard.json`: ein 540p-Video mit Grafiken, B-Roll und Untertiteln, das man ansehen kann, ohne Resolve zu öffnen. Sag dabei, was die Vorschau nicht zeigt (Look, Übergänge, Ton ist roh). Fasse den Plan für den Menschen zusammen: Länge, Hook, Grafiken und B-Roll mit Zeit und Begründung, verworfene Einträge, betonte Wörter, offene Stellen (gelb, Abweichungen). Er bestätigt oder ändert per Satz («Hook kürzer», «B-Roll bei 12 s ersetzen»); jede Änderung geht zurück zu Schritt 6 oder 7 und setzt die Bestätigung zurück.
9. **Prüfen und übergeben.** `schnitt pruefe --plan plan-storyboard.json`, dann `schnitt resolve --plan plan-storyboard.json`. Der Ordner liegt unter `inhalte/<ID>/ergebnis/resolve`, ein vorhandener wird nie überschrieben. `LIESMICH.md` nennt die Schritte in Resolve und die Stellen, die auffielen.
10. **Nach dem Schnitt in Resolve.** Das Video exportiert ein Mensch. `schnitt export-pruefen <datei>` misst es gegen Export- und Audio-Preset. Ist das Video fertig, trägt `./studio katalog genutzt --plan plan-storyboard.json` die B-Roll als «zuletzt genutzt» ein (erst dann, nie vor dem Ja des Menschen).

## B-Roll beschreiben (Katalog)

Läuft die Sitzung auf dem Mac: `./studio katalog offen --limit 10` liefert Metadaten und Pfade der Vorschaubilder, sieh dir die Bilder an (Datei lesen).
Läuft sie in der Cloud (kein Zugriff auf die Dateien des Menschen): Der Mensch zieht die Bögen (`bogen-01.jpg` …, entstehen bei `./studio katalog scan`) in den Chat. Auf jedem Clip steht seine Katalog-Nummer (`k-0001`), Metadaten stehen in der Zeile darüber, die drei Bilder zeigen Anfang, Mitte und Ende. Du beschreibst und schreibst die Liste als **einen** Codeblock, den der Mensch kopiert (`./studio katalog beschreibe --zwischenablage`). Mach das selbst, ohne dem Menschen Teilarbeit zu geben. Schreibe für jede Datei:
`{"schluessel","titel","beschreibung","tags","sicherheit","besteSekunden"?,"personen"?,"log"?}`.
- **Titel** nach Kunde_Ort_Motiv_Aktion_Datum. Kunde und Ort nimmst du aus `ordnerHinweis` und `gps`, nicht aus dem Bild geraten. Fehlt die Angabe, lass sie weg und sag es.
- **Beschreibung** ein bis zwei Sätze, **Tags** deutsch (Motiv, Aktion, Stimmung, Licht, Kamerabewegung, Einsatzfälle).
- **besteSekunden** nur bei Videos, aus den drei Bildern abgeschätzt (Anfang, Mitte, Ende). Du siehst keine Bewegung: Wenn du unsicher bist, setze `sicherheit` auf «niedrig» und lass `besteSekunden` weg.
- **personen** true, wenn Personen erkennbar sind; **log** true, wenn das Bild flach und grau aussieht.
- **sicherheit** ehrlich: hoch, mittel, niedrig. Niedrige Einträge bleiben nutzbar, der Mensch sieht die Warnung.
Fotos beschreibst du genauso (ohne `besteSekunden`); sie sind keine B-Roll, sondern Material für Carousel, Blog und Google-Beitrag. Lehnt der Befehl Einträge ab (der Mensch zeigt dir die Meldung), korrigiere sie, statt die Regeln zu umgehen. Die Vorschaubilder sieht nur diese Sitzung (Regel 5).

## Grenzen, die du nennst, statt sie zu überspielen

- Whisper ist mit echtem Dialekt noch nicht gemessen (T2); Schwellen und Füllwortliste sind Annahmen.
- Resolve hat die Dateien noch nie geöffnet (T9). Sag es dem Menschen beim Übergeben.
- Musik, Soundeffekte und Untertitel-Hervorhebung sind nicht im Plan. Fotos sind keine B-Roll. Betonte Wörter stehen in `LIESMICH.md`.
- Der Katalog liegt nicht in Notion, nur als `katalog.json` im Datenordner.
