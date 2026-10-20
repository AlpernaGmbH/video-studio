# Phase 0 auf dem ersten Mac

Stand 17.10.2026. Plan v3 sagt: erst an einem Computer. Das hier ist die Reihenfolge, mit erwarteter Ausgabe und dem, was du zurückmeldest.
Dauer rund zwei Stunden, davon etwa 20 Minuten Warten. Nichts davon verändert Notion oder löscht etwas.

Du kannst den Block «Einrichten» auch in Claude Code im Ordner `video-studio` mit den Worten «Richte das Studio ein, Skill studio-einrichten» auslösen. Die Befehle sind dieselben.

## 1. Einrichten

```sh
node -v          # muss v22 oder höher zeigen, sonst: brew install node
brew install ffmpeg git          # nur, was fehlt
git clone https://github.com/AlpernaGmbH/video-studio.git ~/video-studio
cd ~/video-studio && npm install
npm run studio -- init
```
Das Repo gehört **nicht** in den OneDrive-Ordner (viele kleine Dateien). `init` legt `Studio/` in OneDrive an und merkt den Pfad.
Erwartet: «Studio-Ordner: …/OneDrive-…/Studio». Bei «Mehrere OneDrive-Ordner gefunden» den Firmenordner mit `--home "<Ordner>/Studio"` angeben. Vorher mit `ls ~/Library/CloudStorage/<Ordner>` prüfen, dass er Inhalt hat: Ein Name mit «(2)» ist oft ein leerer Doppel-Eintrag.

Dann im **Finder**: OneDrive → `Studio` → Rechtsklick → «Immer auf diesem Gerät behalten». Sonst sind Dateien nur Platzhalter.

```sh
npx hyperframes@0.8.164 browser ensure        # lädt den Browser zum Rendern, einmalig
npx hyperframes@0.8.164 telemetry disable     # wegen Kundenmaterial
npm run studio -- doctor              # Erwartet: kein «FEHLER»; «Hinweis» ist in Ordnung
npm run check                         # Erwartet: alle Tests grün, «0 Fehler» beim Lint (rund 1 Minute)
```
**Meldest du zurück:** die Ausgabe von `doctor` (alles kopieren) und ob `check` grün war.

## Wenig Speicherplatz auf dem Mac

Für Phase 0 reichen 20 GB. Für echte Rohvideos nicht: Ein Projekt mit drei Clips in 4K braucht rund 2 bis 3 GB, hundert Projekte gegen 300 GB. Die grossen Ordner (`rohmaterial`, `renders`, `inspiration`)
können auf ein eigenes Laufwerk, die kleinen Daten (`daten`) bleiben im Studio-Ordner:
```sh
npm run studio -- init --home "<Studio-Ordner>" --medien "/Volumes/DEIN_LAUFWERK/Studio-Medien"
```
`doctor` zeigt danach den freien Platz je Ort. **OneDrive selbst auf das Laufwerk zu legen ist riskant:** Microsoft unterstützt es nur mit APFS und einem Laufwerk, das nicht auswerfbar ist.
Ein USB-Laufwerk gilt als auswerfbar und wird mit «OneDrive folder can't be created in the location selected» abgelehnt. Darum nur die Medien dorthin, nicht OneDrive.

## 2. Messen (T1 und T1b)

```sh
npm run selftest:render               # rund 3 Minuten
npm run t1b                           # rund 2 Minuten
```
**Meldest du zurück:** beide Ausgaben vollständig, dazu Modell und RAM des Macs («Über diesen Mac»).
Vergleichswerte aus Linux (4 Kerne): Overlay von 2,4 bis 3,2 s rendert in 11 bis 16 s; T1b: rund 8,3 s fest plus 1,8 s je Sekunde Video. Auf Apple Silicon erwarte ich weniger. **[Vermutung]**

**Grenze:** Dieser Test misst ein einzelnes Overlay. Test T1 verlangt höchstens 3-fache Echtzeit für 10 Sekunden mit Captions, Zoom und einem Effekt. Das lässt sich erst messen,
wenn die Pipeline steht (Phase 2). Heute gibt es nur die Zahl für den Teil «Overlay».

## 3. OneDrive (T5)

Eine beliebige Videodatei von 200 bis 500 MB in `Studio/rohmaterial/` legen, warten bis das Wolkensymbol weg ist.
```sh
cd "$(ls -d ~/Library/CloudStorage/OneDrive*/Studio | head -1)/rohmaterial"
time ffmpeg -v error -i DEINE_DATEI.mov -f null -          # ffmpeg liest die ganze Datei
```
Dann im Finder auf der Datei Rechtsklick → «Speicherplatz freigeben», und den Befehl nochmal ausführen. Bestanden, wenn die Datei im ersten Lauf (mit «Immer behalten») **keine Wartezeit durch Download** hat.
**Meldest du zurück:** beide Zeiten, und ob der zweite Lauf auffällig länger dauerte.

## 4. Instagram 25p oder 30p (T4)

*Entschieden am 17.10.2026: 25p, ohne Test. Der Abschnitt bleibt für den Fall, dass Reels später ruckeln.*

Ein Video mit Kamerabewegung (Schwenk) nehmen:
```sh
for r in 25 30; do ffmpeg -y -i DEINE_DATEI.mov -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2" -r $r -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a aac t4-${r}p.mp4; done
```
Beide Dateien aufs Handy, als **privates** Reel hochladen (Testkonto oder «Nur ich»), auf dem Handy ansehen. **Meldest du zurück:** ruckelt 25p sichtbar, ja oder nein.

## 5. Claude Code und Notion

Im Ordner `~/video-studio` `claude` starten und fragen: «Lies die Ansicht der Datenbank Ideen aus notion.json und sag mir, wie viele Zeilen es gibt.» Erwartet: eine Zeile («Beispiel: Wert-Verlauf»).
Zeigt Claude Code kein Notion, fehlt die Verbindung: in claude.ai Einstellungen → Konnektoren Notion verbinden, in Claude Code mit demselben Konto anmelden. **Meldest du zurück:** ob es klappt.

## Was ihr danach wisst

| Test | Danach |
|---|---|
| T1 | Teilwert für Overlays |
| T1b | Entscheid «Datei je Overlay» oder «eine Komposition» (zusammen mit der Rechnung in `npm run t1b`) |
| T3 | mit deinem Test bestanden für eine Person. Für Leander fehlt es |
| T4 | 25p oder 30p |
| T5 | OneDrive-Weg bestätigt oder Material lokal kopieren |
| T2 | Möglich, sobald Whisper auf dem Mac installiert ist (`pip install openai-whisper`, `studio doctor` prüft es): `studio schnitt transkribiere <clip>` für 3 echte Clips (ruft Whisper mit Wortzeiten auf), dann `studio schnitt zuordnen …` (siehe `docs/plan/editing-blueprint.md`). Der Bericht nennt den Anteil zugeordneter Zeilen (Ziel mindestens 95 Prozent); die Zeitabweichung der Wörter (höchstens 0,3 s) musst du am Video gegenprüfen |
| T6, T7 | **Nicht hier möglich.** Sie brauchen Code, den Plan v3 erst in Phase 2 baut (siehe `STATUS.md`) |
