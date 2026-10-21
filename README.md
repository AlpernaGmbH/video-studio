# studio – Video-Editing-System der Alperna GmbH

Rohmaterial und Skript hinein, ein Instagram-Reel im Look der Marke heraus (Bauplan v2). Dieses Paket enthält den Teil, der
sich ohne Hardware und Kundenmaterial bauen und prüfen lässt: Fundament, Motion-Bibliothek und die Schleife, in der sie wächst.
Stand und offene Punkte: `STATUS.md`.

## Einrichten (einmal je Mac)

```sh
git clone https://github.com/AlpernaGmbH/video-studio.git && cd video-studio
npm install
./studio init              # Studio-Ordner in OneDrive anlegen, Pfad für diesen Mac merken
npx hyperframes@0.8.164 browser ensure      # lädt Chrome Headless Shell
npx hyperframes@0.8.164 telemetry disable   # wegen Kundenmaterial
./studio doctor            # prüft Node, ffmpeg, OneDrive, Protokoll, Bibliothek, Notion-Ziel
npm run check                       # Typecheck, Tests, Lint der Bibliothek
npm run selftest:render             # rendert jedes Stück wirklich und prüft das Ergebnis
```

Node 22 oder neuer (HyperFrames verlangt es), ffmpeg und ffprobe im Pfad. Im Finder Rechtsklick auf `Studio`, «Immer auf diesem Gerät behalten».
Ausführlich und mit Fehlertabelle: `.claude/skills/studio-einrichten/SKILL.md`.

## Aufruf und Aktualisieren

Alle Befehle laufen über den Starter **`./studio`** im Ordner des Repos (nicht `studio …` ohne `./`, das gibt es nicht als Befehl auf dem Mac, und nicht `npm run studio --`, das ändert den Ordner und macht relative Pfade kaputt).
`./studio hilfe` zeigt alle Befehle. **`./studio update`** holt den neuesten Stand (git pull) und aktualisiert die Pakete: Das ist der erste Schritt, wenn ein Befehl «unbekannt» ist.

## Clips beschreiben (Katalog), drei Schritte

```sh
./studio update
./studio katalog scan                  # ohne Angabe: Ordner «rohmaterial»; mit Angabe ein Ordner oder eine einzelne Datei
# Die Bilder aus dem Ordner, der sich öffnet, in den Chat ziehen und «beschreibe die Clips» schreiben.
# Die Liste, die zurückkommt, kopieren (Kopieren-Knopf am Codeblock), dann:
./studio katalog beschreibe --zwischenablage
```

## Transkript und Whisper

```sh
./studio whisper einrichten            # einmalig: installiert Whisper in eine eigene Python-Umgebung und lädt das Modell (large-v3: 3 GB)
./studio schnitt transkribiere <aufnahme.mov>
```

## Ein Reel bauen

Feste Ordner: Skript und Ergebnisse unter `Studio/inhalte/<ID>/`, die Videos unter `rohmaterial/<ID>/` (Medien-Ordner). `<ID>` ist die Kennung aus «Inhalte» (`c-0007`). Im Alltag tippst du das nicht: Claude Code auf dem Mac führt es aus, wenn du sagst «Editier mir das Video».

```sh
./studio reel neu c-0007 --marke alperna --zwischenablage   # Skript vorher kopieren; legt die Ordner an und öffnet den für die Videos
./studio reel transkript c-0007                             # ohne Skript, oder wenn es nicht stimmt: Sätze mit Zeiten zum Auswählen
./studio reel vorbereiten c-0007                            # Whisper, Stille, Zuordnung, Schnittplan, ergebnis/gegenlesen.md
./studio reel gegenlesen c-0007                             # Claude hat gegenlesen.md gelesen (Regie, Abbrüche, Verhörer); schreibt den Auftrag fürs Storyboard
./studio reel storyboard c-0007 --zwischenablage            # Grafiken, B-Roll, Betonung, Zooms; rendert, macht Kontaktbogen und Vorschau-Video
./studio reel uebergabe c-0007                              # Ordner für DaVinci Resolve
./studio reel messe c-0007                                 # misst den Export aus Resolve (ergebnis/export/): Schnitte, Zooms, Bild, Ton, erste Aussage; qualitaet.json
./studio reel status                                        # wo steht welcher Inhalt, was ist der nächste Schritt
```

Liegen im Aufnahmen-Ordner auch Tonaufnahmen (wav, m4a, mp3, aif, flac), legt `vorbereiten` sie über die Videos: Es misst den Versatz an der Lautstärkekurve von Kameraton und Aufnahme (auf 10 Millisekunden), schneidet das passende Stück der Aufnahme, lässt Whisper darauf hören und legt sie in Plan, FCPXML, OTIO und Vorschau unter die Sprache. Was sich nicht sicher zuordnen lässt, wird gemeldet und nicht benutzt; dann geht der Versatz von Hand (`--versatz 5.3`), und er wird gemerkt. `--ohne-ton-sync` schaltet das ab.
`vorbereiten` stellt auch fest, ob das Material flach ist (Log): aus dem Etikett der Datei oder, wenn es keines gibt, aus einer Messung an fünf Bildern (wenig Farbe und schmale Helligkeit; ein Urteil aus der Messung gilt als Vermutung und wird gemeldet). Aus dem Look der Marke (`farbe` im Markenprofil, Zahlen für Mitten, Kontrast, Sättigung, Kühle) und dem Material entstehen zwei LUTs in `ergebnis/lut/`: «log» für flaches Material (Schwarz- und Weisspunkt am Material gemessen) und «angleich» für normales Material und B-Roll. Vorschau und Resolve-Ordner benutzen sie; die Grafiken bekommen nie einen Look. Das ist eine Näherung, keine Kamera-LUT. Stimmt das Urteil nicht: `--farbe log|rec709` (wird gemerkt, `auto` hebt es auf); `--ohne-farbe` lässt alles aus.
`vorbereiten` lässt vorhandene Transkripte stehen: Ein Transkript gilt, solange Inhalt der Datei (Fingerabdruck aus Grösse, Anfang und Ende, nicht die Änderungszeit), Modell und Sprache dieselben sind; es wird auch in anderen Inhalten wiederverwendet (`daten/cache/transkripte/`). `--neu` transkribiert erneut. Am Ende steht, wo die Zeit blieb. Grafiken rendern bei `reel storyboard` nur neu, wenn sich Stück, Werte, Dauer oder Marke änderten (`--neu-rendern` erzwingt). `./studio whisper benchmark <datei>` misst Whisper-Modelle am selben Stück (Zeit, Faktor, Abweichung), misst die Stille der Tonspur, damit Schnitte nicht in Silben fallen, und merkt sich Marke und Titel in `reel.json`. Die Untertitel zeigen das Gehörte, denn das Skript stimmt nicht immer. Ohne gültiges Gegenlesen läuft `reel storyboard` nicht.
Zooms gibt es nur im Storyboard, nur auf betonten Wörtern und höchstens so viele je Minute, wie das Schnittprofil der Marke sagt. Ein neues Storyboard ersetzt das alte, das vorige bleibt als `storyboard-vorher.json`.
Solange kein Stück «aktiv» ist, gibt es keine Grafiken ohne `--entwurf` (Regel 3). Die Einzelschritte bleiben als `./studio schnitt …` erreichbar.

## Wo was liegt

Texte und Entscheide in **Notion** (Seite «Video-Studio»), Medien in **OneDrive** (`Studio/`), Code und Stücke in diesem Repo. Freigeben, Looks wählen und
abnehmen tun Menschen im **Prüfplatz** (Artifact in claude.ai, Adresse in `notion.json`). Alles läuft über Claude und Claude Code, nie über die Claude-API.
Schema und Ablauf: `docs/notion-und-pruefplatz.md`.

## Die Motion-Bibliothek in einem Absatz

Ein **Stück** ist eine Grafik, die sich mit anderen Wörtern und Zahlen wiederverwenden lässt: ein Ordner mit Datenblatt
(`piece.json`) und HyperFrames-Komposition (`index.html`). Vertrag: Variablen, Dauer und Marke gehen hinein, ein transparentes
WebM (1080×1920, 25p, genau so lang wie verlangt) kommt heraus. Neue Stücke entstehen aus Lücken: Beim Schnitt wird jeder Satz
daraufhin gelesen, ob eine Grafik besser erklärt. Fehlt sie, entsteht eine Idee mit dem genauen Satz und der Begründung, warum
nichts Bestehendes passt. Ein Mensch gibt den Pitch frei, wählt aus drei Standbildern einen Look, nimmt das fertige Stück ab.
Erst dann ist es aktiv und das Storyboard darf es benutzen. Konzept: `docs/motion-werkstatt.md`.

## Befehle

```sh
./studio help
./studio motion luecken --skript skript.md --projekt P-023      # Trockenlauf
./studio motion neu wert-verlauf --name "Wert-Verlauf" --typen verlauf
./studio motion render zahl-zaehler -o out.webm --set wert=7 --set suffix=" von 10" --dauer 2.6 --marke alperna
./studio motion batch zahl-zaehler --zeilen zeilen.json -o renders/ --marke alperna
./studio ideen liste
./studio ideen notion-lesen --json zeilen.json          # Entscheide aus Notion lesen (Vorschau)
./studio pruefplatz bauen                               # Prüfplatz mit aktuellem Stand bauen
```

## Aufbau

```
src/core/        Pfade, Schemas, Storyboard-Prüfung
src/motion/      Stück-Vertrag, Bibliothek, Staging, Render, Prüfung, Lücken, Ideen
src/notion/      Abbild einer Idee als Notion-Zeile und zurück
src/setup.ts     init und doctor (Einrichtung je Mac)
pruefplatz/      Vorlage des Prüfplatzes (Artifact)
library/motion/  die Stücke
marken/          Markenprofile
assets/fonts/    Schriften
prompts/         Anleitungen und geprüfte Beispiel-JSONs
scripts/         Selbsttest mit echtem Rendern, Browser-Test des Prüfplatzes
```
