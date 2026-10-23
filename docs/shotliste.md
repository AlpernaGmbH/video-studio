# Shotliste mit Beispielbildern

Vor dem Dreh: was zu filmen ist, Einstellung für Einstellung, mit einem Beispielbild aus dem eigenen Katalog. Du bekommst einen Text (`shotliste.md`) und einen Bogen (`shotliste-bogen.jpg`) mit einer Kachel je Einstellung. Beides lässt sich ans Alperna-Tool schicken und am Handy ansehen.

Alles läuft auf dem Mac mit `ffmpeg`. Beispielbilder gibt es **nur aus dem eigenen Katalog** (Schlüssel wie `k-0142`), nie aus dem Netz und nie von fremden Seiten (CLAUDE.md, Regel 5). Die Shotliste gibt nichts frei und ersetzt kein Storyboard: Sie entsteht vor dem Dreh, das Storyboard nach dem Schnittplan.

## Ablauf

1. **Gerüst.** Das Skript liegt unter `inhalte/<ID>/skript.md` (`./studio reel neu <ID> --zwischenablage`):

   ```
   ./studio reel shotliste c-0007 --geruest
   ```

   Das Skript wird in Einstellungen geteilt (Sätze werden zusammengefasst, bis sie geschätzt mindestens drei Sekunden dauern). Die erste heisst «Hook», die letzte «Aufruf». Geschrieben wird `ergebnis/shotliste.json`. **Die Dauer ist eine Schätzung** aus der Wortzahl (Annahme: 150 Wörter je Minute, nicht gemessen); nach dem Dreh ersetzt das Transkript sie. Eine vorhandene Liste ersetzt `--neu`, die Beschreibungen darin gehen dann verloren.

2. **Beschreiben.** Claude füllt in jeder Einstellung `bild` (was zu sehen ist, mindestens acht Zeichen), setzt `groesse` (`totale`, `halbtotale`, `halbnah`, `nah`, `gross`, `detail`), wenn es hilft `bewegung`, `ort`, `hinweis`, und wählt `beispiel`, einen Schlüssel aus dem Katalog (`./studio katalog liste --suche "Hände Pinsel"`). Der Sprechtext bleibt wörtlich, wie ihn das Gerüst setzt (Regel 6).

   Passt kein Bild im Katalog, bleibt `beispiel` weg. Das ist eine Lücke im Katalog und steht so auf dem Bogen; es ist kein Fehler und kein Grund, ein unpassendes Bild einzusetzen.

3. **Prüfen und schreiben.**

   ```
   ./studio reel shotliste c-0007
   ```

   Der Befehl prüft die Liste gegen den Katalog. **Fehler stoppen, dann wird nichts geschrieben:** falsche Form oder unbekannte Felder, eine Liste für einen anderen Inhalt, Nummern mit Lücke, nicht ausgefüllte Beschreibung, ein Schlüssel, den es im Katalog nicht gibt, ein Sound als Beispielbild, ein Pfad oder Dateiname im Text (auch «und/oder» zählt als Pfad; schreibe «und»). **Hinweise stoppen nichts:** eine Einstellung ohne Beispielbild, dasselbe Bild zweimal, Personen auf dem Bild.

   Zu Einstellungen ohne Bild nennt der Befehl bis zu drei Schlüssel, deren Titel, Beschreibung oder Tags Wörter der Beschreibung enthalten. Das ist eine Wortsuche, kein Urteil, ob das Bild passt; übernommen wird nichts. Wer ein Bild wählt, sieht es sich vorher an.

   Geschrieben werden `ergebnis/shotliste.md` (Text für Menschen am Set) und `ergebnis/shotliste-bogen.jpg`.

4. **Aufs Handy** (freiwillig):

   ```
   ./studio tool hochladen c-0007 --art shotliste,shotliste_bogen
   ```

   Das geht nur, wenn ein Admin im Tool für diesen Inhalt «Vorschauen erlauben» eingeschaltet hat (die Beispielbilder können Personen zeigen). Hochgeladen werden der Text und der Bogen, nie `shotliste.json`. Ist die Liste neuer als Text oder Bogen, lädt der Befehl nichts hoch und sagt, dass `reel shotliste` zuerst neu laufen muss.

## Der Bogen

Drei Kacheln nebeneinander, so viele Zeilen wie nötig, höchstens 40 Einstellungen. Oben das Beispielbild (Hochformat, ein Querformat wird eingepasst), darunter ein Streifen mit Nummer, Grösse und Dauer, dem Katalog-Schlüssel oder «kein Beispielbild» und den ersten drei Zeilen der Beschreibung. Fehlt das Beispielbild, steht in der Kachel «Kein Beispielbild»; liegt der Schlüssel im Katalog, aber das Vorschaubild fehlt auf der Platte, steht «Vorschaubild fehlt» (dann `./studio katalog scan` neu laufen lassen).

Bei einem Video dient die Mitte der drei Vorschaubilder des Katalogs als Beispiel, bei einem Foto das Bild selbst. Die Schrift kommt aus `STUDIO_FONT` oder einer Systemschrift; fehlt beides, ist der Text der Shotliste geschrieben und der Bogen nicht, mit einem Hinweis.

## Was die Liste nicht kann

- **Sie sieht nicht, ob das Bild passt.** Die Zuordnung Einstellung zu Beispielbild beruht auf dem, was Claude aus Titel, Beschreibung und Tags des Katalogs liest, und auf den Vorschaubildern, die in der Sitzung angesehen werden. Ein Mensch beurteilt, ob der Bogen stimmt.
- **Sie erfindet keine Bilder.** Kein Beispielbild aus dem Netz, keine KI-Bilder (CLAUDE.md, Regel 5).
- **Die Dauer ist geschätzt**, nicht gemessen (siehe oben).
- **Der Look auf dem Bogen ist der des Katalogs:** Die Vorschaubilder sind 480 Pixel breite Standbilder, bei V-Log-Material flach und grau. Sie zeigen den Bildinhalt, nicht die Farbe des fertigen Videos.

## Auftrag aus dem Tool

Im Tool: Plattform und Art des Beitrags (zum Beispiel Instagram, Reel), Phase «Shotliste». Ein Mac oder eine Cloud-Sitzung holt den Auftrag (`./studio warteschlange holen`), arbeitet nach dem Skill `reel-werkstatt` (Abschnitt «Shotliste mit Beispielbildern») und schliesst den Auftrag mit dem Ort der Dateien ab. Ein Auftrag ohne Inhalt wird als blockiert gemeldet: Ohne Skript gibt es kein Gerüst.

## Aufbau im Code

`src/schnitt/shotliste.ts` (rein: Schema, Gerüst, Prüfung, Vorschläge, Text), `shotliste-bogen.ts` (Filtergraph und Rendern mit ffmpeg, über die Aufrufer von `src/foto/werkzeug.ts`), `shotliste-befehl.ts` (der Befehl), Hochladen über `src/studio/hochladen.ts` und `reel-quellen.ts`. Das Tool kennt die Dateien als Arten `shotliste` (Text, 1 MB) und `shotliste_bogen` (JPEG, 8 MB); die Regeln dazu stehen in `docs/studio/vertrag.json` (`artifacts.arten`).
