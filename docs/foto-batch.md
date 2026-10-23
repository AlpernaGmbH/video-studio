# Foto-Batch

Ein Ordner mit JPEG-Fotos bekommt einen einheitlichen Look. Du siehst vorher drei Fotos mit der reinen Umrechnung und fünf bis sechs Looks nebeneinander, wählst einen, und derselbe Look läuft danach auf alle Fotos. Die Originale bleiben unangetastet.

Alles läuft auf dem Mac mit `ffmpeg`. Kein Foto verlässt den Rechner, es gibt keinen Aufruf eines Dienstes (CLAUDE.md, Regel 5).

## Ablauf

1. **Muster erzeugen.** Der Ordner liegt im Studio-Ordner oder, wenn du einen eigenen hast, im Medien-Ordner (relativ oder absolut angeben; relative Angaben gelten zuerst im Studio-Ordner, so nennt es auch das Tool):

   ```
   ./studio foto muster "kunden/nordlicht/shooting-oktober" --typ kunde --marke nordlicht
   ./studio foto muster "bts/oktober" --typ bts
   ```

   Es entstehen `muster.jpg` und `muster.md` unter `<Studio-Ordner>/daten/foto/<Kennung>/`. Der Bogen hat drei Zeilen (ein dunkles, ein mittleres, ein helles Foto aus dem Ordner, die Zellen folgen dem Seitenverhältnis der Fotos) und eine Spalte je Variante: **Basis** (nur die Umrechnung, ohne Look) und die Looks. `muster.md` nennt die Spalten und wie es weitergeht. Weil `daten/` auf OneDrive liegt, kannst du den Bogen am Handy ansehen.

2. **Ansehen und wählen.** Die Basis muss wie ein normales, richtig belichtetes Foto aussehen. Wenn nicht, stimmt das Profil oder die Belichtung nicht (siehe unten). Welcher Look passt, entscheidest du. Claude wählt ihn nicht.

3. **Anwenden.** Die Wahl trifft ein Mensch und steht mit Namen im Befehl:

   ```
   ./studio foto anwenden "kunden/nordlicht/shooting-oktober" --look warmes-licht --mensch --by Andrej
   ```

   Die Ergebnisse liegen in `<Ordner>/bearbeitet-warmes-licht/` mit denselben Namen und Unterordnern. Ein zweiter Lauf lässt Vorhandenes in Ruhe (`--neu` rechnet alles neu). `./studio foto status <ordner>` zeigt den Stand.

## Kundenfotos und Fotos hinter den Kulissen

`--typ` ist Pflicht. Die Trennung kommt vom Ordner und von dir, nicht von einer Bilderkennung: Eine Fehlzuordnung bei Kundenbildern kostet mehr als ein Ordner mehr.

| Typ | Marke | Regel |
|---|---|---|
| `kunde` | Pflicht, das Profil des Kunden unter `marken/` | Nie die eigene Marke. Kundenfotos tragen das Profil des Kunden. |
| `bts` | Standard `alperna`, andere erlaubt | Hinter den Kulissen. |

Hat die Marke einen Look für ihr Video-Material (`farbe.vlog`), steht er als erste Variante «Look von …» auf dem Bogen, damit Fotos und Videos zusammenpassen. Die Marken der Kunden haben noch keinen.

## Profil: V-Log oder fertig gerechnet

`--profil auto` (Standard) liest die Helligkeitsränder aller Fotos. V-Log-Fotos sind flach: kaum Pixel unter 9 % und selten über 82 % Helligkeit. Sind mindestens vier Fünftel der Fotos flach, gilt der Ordner als V-Log, sind höchstens ein Fünftel flach, als Standard. Dazwischen **verlangt der Batch die Angabe** (`--profil vlog` oder `--profil standard`) und nennt dir die Zahlen.

- **V-Log:** Die Umrechnung von Panasonic (`src/schnitt/vlog.ts`) macht aus dem flachen Bild ein normales Rec.-709-Bild, danach kommt der Look. `--belichtung 0.5` hellt die Umrechnung um eine halbe Blende auf, `-0.5` dunkelt sie ab (Bereich -3 bis 3).
- **Standard:** Der Look liegt direkt auf dem Foto.

**Was nicht belegt ist.** Wie die Kamera V-Log in eine JPEG-Datei schreibt (voller oder begrenzter Bereich, welche Kennlinie genau), ist an echtem Material nicht geprüft. Die Umrechnung geht davon aus, dass der 8-Bit-Wert durch 255 dem V-Log-Wert entspricht. Die Basis auf dem Bogen ist die Kontrolle: Sieht sie zu hell, zu dunkel oder zu flau aus, zuerst mit `--belichtung` oder `--profil standard` probieren und mir ein Foto zum Prüfen geben. Die Grenzen der automatischen Erkennung (9 % und 82 %) sind eine Herleitung aus dem Handbuch von Panasonic, keine Messung an Fotos.

## Looks

Ein Look ist eine Datei unter `library/foto-looks/<id>.json`: Tonwerte und Farbe wie beim Look der Marke (`gamma`, `kontrast`, `saettigung`, `kuehle`, optional `schwarz` und `weiss`), dazu optional ein **Farbpaar** (eine Farbe in die Schatten, eine in die Lichter) und **Korn**. Die Rezeptteile stammen aus `docs/inspiration/farbe-und-foto.md`.

Mitgeliefert sind fünf: `warmes-licht`, `klare-luft`, `stiller-morgen`, `leiser-film`, `klare-kante`. **Die Zahlen darin sind Vorschläge zum Ausprobieren, nicht belegt** (das steht in jedem Look unter `herkunft`). Ein eigener Look braucht nur eine neue Datei. `./studio foto looks` listet sie.

**Die Wahl beruht auf dem, was gezeigt wurde.** Ändert sich ein Look nach dem Muster, lehnt `anwenden` ihn ab: Du hast einen anderen Look gesehen, als jetzt laufen würde. Dann das Muster neu erzeugen.

## Was mit den Metadaten passiert

Die Ergebnisse tragen **keine Metadaten** (EXIF, auch kein Aufnahmeort), ausser mit `--exif-behalten`. Das ist für Beiträge im Netz gedacht. Die Drehung von Hochformat-Fotos wird vorher ins Bild übernommen. Vor dem ersten Foto prüft der Batch, dass dein `ffmpeg` das tut; sonst bricht er mit dem Hinweis `brew upgrade ffmpeg` ab, statt gedrehte Fotos zu liefern.

## Was er nicht kann

- **Nur JPEG.** RAW (RW2, CR3 …), HEIC, PNG und TIFF werden übersprungen und im Bericht genannt. RAW bräuchte ein Entwicklungsprogramm als neue Abhängigkeit (Eintrag in `STATUS.md`, Lizenz prüfen). Der Eingang ist als Profil angelegt, damit es später ohne Umbau dazukommen kann.
- **Keine Masken.** Kein Himmel, keine Person, keine Zonen. Ein Look gilt für das ganze Bild. Zonen mit Anweisung je Motivart wären ein Plan auf dem Foto (`docs/inspiration/farbe-und-foto.md`), kein Programm.
- **Keine Fotos in Sichten, die nicht lesbar sind.** Ein defektes Foto bricht den Lauf nicht ab; es steht in `foto-batch.json` unter `fehler`, und der Befehl endet mit Exit 1.
- **Der Look ist nicht in Notion oder im Tool entschieden.** Looks als Entscheide im Alperna-Tool gibt es noch nicht (Plan v4). Die Wahl steht in `foto.json` neben dem Muster, mit Namen und Zeit.

## Auftrag aus dem Tool

Im Tool: Plattform «Allgemein», Art «Foto-Batch», Parameter `ordner` (relativ zum Studio-Ordner) und `typ` (`kunde` oder `bts`), bei Kundenfotos die Marke. Claude auf dem Mac holt den Auftrag, ruft `./studio foto muster …` auf und schliesst den Auftrag mit dem Ort des Bogens ab. **Er wendet nichts an:** Das tut er erst, wenn ein Mensch den Look mit Namen nennt.

Die Fotos dürfen nicht ausserhalb von Studio- und Medien-Ordner liegen (der Befehl prüft es nach dem Auflösen von Verknüpfungen). Gibt es denselben relativen Pfad in beiden, gilt der im Studio-Ordner; für den anderen den absoluten Pfad angeben. Angehängte Dateien eines Auftrags (`./studio warteschlange dateien`) landen unter `eingang/<Auftrag>/` und sind damit ein möglicher Ordner.

## Aufbau im Code

`src/foto/`: `messen.ts` (rein: Helligkeitsränder, Profil, Auswahl der Muster), `farbpaar.ts` (rein), `looks.ts` (Look-Dateien, Look der Marke), `ordner.ts` (Pfade, Fotos sammeln), `werkzeug.ts` (alle Aufrufe von ffmpeg an einer Stelle), `batch.ts` (Muster, Wahl, Anwenden, Stand), `befehle.ts` (CLI). Die LUT kommt aus `src/schnitt/vlog-lut.ts` und `lut.ts` (mit der neuen Nachstufe für das Farbpaar).
