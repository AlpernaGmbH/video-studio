# Studio im Alperna-Tool: der Mac meldet seinen Fortschritt

Stand 22.10.2026 (Plan v4, Phase 2, Scheibe S2). Der Mac kann dem Alperna-Tool melden, was er gerade tut (Schritt, Dauer, Fehler). Das Tool zeigt es auf `/studio/inhalte/<Code>`, auch am Handy. **Das ist freiwillig:** Ohne Verbindung läuft alles wie bisher, und ein Ausfall des Tools ändert an keinem Befehl etwas.

Gegenstück im Repo `alperna-tool`: `docs/studio/geraete-api.md` (Schnittstelle, Sicherheit, Betrieb) und `docs/studio/vertrag.json` (Beispiele). **Die Datei `docs/studio/vertrag.json` liegt in beiden Repos und muss gleich sein**; die Tests beider Seiten lesen sie.

## Was gemeldet wird

Beim Schritt eines Befehls (`reel neu`, `reel vorbereiten`, `reel transkript`, `reel gegenlesen`, `reel storyboard`, `reel uebergabe`, `reel messe`) und bei seinen Teilschritten (Videos sondieren, Transkription, Farbe messen, Stille messen, Zuordnen und Plan):

| Feld | Inhalt |
| --- | --- |
| `step` | Name des Schritts, zum Beispiel «reel vorbereiten» oder «Transkription» |
| `state` | `start`, `ok`, `error` oder `info` |
| `span` | verbindet Beginn und Ende eines Schritts |
| `ms` | Dauer, bei Ende und Fehler |
| `code` | der Inhalt, zum Beispiel `c-0007` |
| `detail` | bei einem Fehler `{ "fehler": "…" }`, höchstens 4 KB |
| `id`, `at` | Kennung des Ereignisses und Zeit auf dem Mac |

**Nie gemeldet:** Skript, Transkript, Bilder, Dateinamen, Pfade. Fehlertexte gehen durch `bereinige()` (`src/studio/melder.ts`): Pfade, Wörter mit Schrägstrich und Dateinamen mit bekannter Endung werden zu `<pfad>` oder `<datei>`, der Text wird auf 200 Zeichen gekürzt. Grenze: Ein Dateiname mit Leerzeichen und ohne Pfad («Interview Müller.mov») verliert nur seinen letzten Teil, der Rest bliebe stehen. Die Fehlertexte sieht nur das Team im Tool (Admins und Mitarbeitende, nie Kunden).

`reel status` und unbekannte Befehle melden nichts.

## Einrichten (einmal je Mac)

1. Ein **Admin** legt das Gerät an, im Repo `alperna-tool`: `node scripts/studio-geraet.mjs anlegen "Andrejs MacBook" mac <Admin-E-Mail>`. Das Token (`vsd_<Geräte-ID>_<Geheimnis>`) steht nur dieses eine Mal auf dem Bildschirm und gilt 180 Tage.
2. Auf dem Mac: `printf %s "<Token>" | ./studio tool verbinden https://alperna-tool.vercel.app --token-stdin`. Ohne `--token-stdin` fragt der Befehl das Token unsichtbar ab (nur im Terminal). Er prüft die Verbindung mit einem Ereignis «Verbindung» und legt das Token **im macOS-Schlüsselbund** ab. Wo das nicht geht (kein `security`), liegt es in `~/.config/video-studio/tool.json` mit den Rechten 0600.
3. `./studio tool status` zeigt, ob alles verbunden ist und wie viele Ereignisse warten. `./studio doctor` hat den Punkt «Tool» (prüft nur, was auf dem Rechner liegt, nie das Netz; «nicht eingerichtet» ist ein Hinweis, kein Fehler).

Das Token ist ein Geheimnis: nicht in Notion, nicht in eine Datei im Repo, nicht in OneDrive. Verloren oder weitergegeben: im Repo `alperna-tool` `widerrufen` und neu anlegen.

## Was passiert bei Ausfällen

Jedes Ereignis wird **zuerst** in den Ausgangskorb geschrieben (`~/.config/video-studio/ausgang/`, eine Datei je Ereignis, ausserhalb von OneDrive und Repo), dann gesendet. So geht beim Beenden eines Befehls nichts verloren, und ohne Netz wird nachgesendet.

| Antwort des Tools | Der Mac |
| --- | --- |
| 200 | gesendet, Datei gelöscht (einzeln abgewiesene Einträge gehen nach `abgelehnt/`) |
| 401 | Token ungültig: es wird nicht mehr gesendet, **ein** Hinweis am Ende des Befehls; weiter geht es nach `./studio tool verbinden` |
| 413, 422 | wird nie wiederholt, die Dateien gehen nach `abgelehnt/` (die letzten 100 bleiben) |
| 404, 429, 503, Netzfehler, Zeitüberschreitung | später wieder: Wartezeit 30 s, verdoppelt bis höchstens 1 Stunde (`Retry-After` gilt als Untergrenze) |

Am Ende eines `reel`-Befehls wartet der Mac höchstens 1,5 Sekunden auf den Rest. Was dann noch aussteht, bleibt im Korb und geht beim nächsten Befehl oder mit `./studio tool senden` hinaus. Ereignisse über 29 Tage alt werden nicht mehr gesendet (das Tool lehnt sie ab), der Korb hält höchstens 5000 Dateien.

**Das Versprechen:** Ob das Tool antwortet, hängt, ablehnt oder fehlt, ändert nichts am Befehl: gleicher Exit-Code, gleiche Ausgabe, gleiche Dateien, derselbe Fehler. Das prüft `src/studio/reel-melder.test.ts` für acht Bedingungen (503, 401, 422, hängt, nicht erreichbar, gesund, Korb nicht beschreibbar, Melder wirft selbst). Einzige Ausnahme: der eine Hinweis nach einem 401.

## Befehle

```
./studio tool verbinden <Adresse> [--token-stdin]
./studio tool status
./studio tool senden        # Korb jetzt senden, auch während einer Wartezeit
./studio tool inhalt neu "Titel" [--medium reel] [--marke key] [--funnel …] [--absicht …] [--typ …] [--muster …]
                            # neuen Inhalt im Tool anlegen (Status «Neu», Tore offen); der Code ist die ID für «reel neu»
./studio tool sync <ID>     # Stand im Tool lesen und den Stand dieses Rechners melden (nur Ja und Nein und Zahlen)
./studio tool hochladen <ID> [--art vorschau,kontaktbogen,gegenlesen,qualitaet]
                            # Dateien des Reels ans Tool hochladen (Handy-Ansicht), siehe unten
./studio tool trennen       # Token und Adresse löschen, der Korb bleibt
```

Cloud-Sitzungen (kein Schlüsselbund) setzen `STUDIO_TOOL_URL` und `STUDIO_TOOL_TOKEN`; sie gelten vor `tool.json`.

## Dateien hochladen (Scheibe S3)

`./studio tool hochladen <ID>` schickt vier Dateien des Reels ans Tool, damit ein Mensch sie am Handy ansehen kann:

| Art            | Quelle im Reel-Ordner (`inhalte/<ID>/ergebnis/`)      | Typ                | Grenze | Braucht die Erlaubnis im Tool |
| -------------- | ------------------------------------------------------ | ------------------ | ------ | ----------------------------- |
| `vorschau`     | jüngste `vorschau*.mp4` (540p, aus `reel storyboard`)  | `video/mp4`        | 50 MB  | ja                            |
| `kontaktbogen` | alle Standbilder von Grafik und B-Roll, zu einem Bild  | `image/jpeg`       | 8 MB   | ja                            |
| `gegenlesen`   | `gegenlesen.md` (gesprochener Text, Regie-Liste)       | `text/plain`       | 1 MB   | ja                            |
| `qualitaet`    | `qualitaet.json` aus `reel messe`, bereinigt           | `application/json` | 1 MB   | nein                          |

- **Die Erlaubnis gibt ein Mensch im Tool** (ein Admin, Schalter «Vorschauen erlauben» auf der Seite des Inhalts). Standard aus, weil Vorschau, Kontaktbogen und Gegenlesen Gesichter und Stimmen von Kundenpersonen enthalten können. Ist der Schalter aus, überspringt der Befehl diese Arten mit einem Hinweis (Exit-Code 0) und lädt nur die Messwerte hoch. Der Mac liest den Schalter vorher (`tool sync` zeigt ihn) und das Tool prüft ihn bei jedem Hochladen noch einmal.
- **Ablauf je Datei:** Das Tool prüft Art, Typ, Grösse, Fassung und Erlaubnis und gibt einen Link für genau diese Datei; der Mac lädt dorthin (ohne das Token) und meldet danach, dass er fertig ist; das Tool liest Typ, Grösse und Kennung am Objekt, prüft die ersten Bytes und trägt die Datei ein. Eine Datei gehört zur **Fassung** des Inhalts, die das Tool gerade führt (`tool sync`). Dieselbe Fassung zweimal hochgeladen ersetzt die erste.
- **Nie hoch:** Plan, Storyboard und Auftrag (sie tragen die Pfade der Quelldateien, Regel 11). Aus den Messwerten fallen der Pfad der Videodatei, die volle Messung und die Stufe der Hinweise weg; Texte laufen durch dieselbe Pfadbereinigung wie die Ereignisse. Das Beispiel steht in `docs/studio/vertrag.json` (`artifacts.qualitaet`) und wird auf beiden Seiten geprüft.
- **Der Kontaktbogen als Bild:** `kontaktbogen.html` (die Liste mit Begründungen) bleibt auf dem Mac. Ans Tool geht eine Collage der Standbilder, vier Zellen nebeneinander, ohne Beschriftung, in der Reihenfolge der Liste. Ist die Collage über 8 MB, wird sie halb so gross und gröber gebaut; passt auch das nicht, gibt es einen Hinweis.
- **Ausgabe:** Pro Art eine Zeile (hochgeladen mit Grösse, übersprungen mit Grund, Fehler mit Grund und, wenn ein späterer Versuch gelingen kann, dem Hinweis «Derselbe Befehl später noch einmal»). Die Adresse des Links und das Token stehen nie darin. Exit-Code 1, wenn eine Datei nicht ankam oder das Tool nicht erreichbar war; mit `--art` genannte Arten, die es auf dem Rechner nicht gibt, sind ein Fehler, ohne `--art` ein Hinweis. Das Ergebnis geht zusätzlich als Ereignis «Hochladen» (Arten, ohne Namen und Pfade) in die Zeitleiste.
- Dieser Befehl ist **ausdrücklich** (kein Teil von `reel`) und darum der eine Befehl, der bei einem Ausfall des Tools mit Fehler endet. Alles andere läuft weiter wie ohne Tool (Regel 11).

## Warteschlange (Scheibe S5)

Ein Admin reiht im Tool einen Auftrag ein (Seite «Warteschlange» im Studio, auch am Handy). Dieser Mac holt ihn, wenn eine Claude-Sitzung auf ihm läuft, und arbeitet ihn mit den Befehlen und Skills des Studios ab. Das Tool kennt acht Arten:
`reel_vorbereiten`, `reel_storyboard`, `reel_uebergabe`, `reel_messen`, `katalog_beschreiben` (alle nur auf dem Mac), `text_entwurf` (Cloud oder Mac), `analyse_auswerten` und `planung` (nur Cloud: Dafür kopiert der Admin einen Text in eine Claude-Sitzung, ein Mac holt sie nie).

```
./studio warteschlange holen [--art reel_vorbereiten,…] [--warten [Minuten]] [--json]
./studio warteschlange begleiten     # Lebenszeichen alle 30 Sekunden, im Hintergrund
./studio warteschlange status [--json]
./studio warteschlange fertig [--ergebnis done|failed|blocked|cancelled] [--grund "…"]
```

- **Ablauf:** `holen` gibt den ältesten wartenden Auftrag und schreibt `auftrag.json` neben `tool.json` (Rechte 0600, ausserhalb von Repo und OneDrive: Auftrag, Lease, Notizen). Ein zweites `holen` gibt denselben Auftrag zurück, solange er nicht abgeschlossen ist. `begleiten` meldet sich alle 30 Sekunden, damit die Lease (drei Minuten) nicht abläuft, und merkt, wenn ein Mensch den Abbruch verlangt hat; es endet von selbst, wenn der Auftrag abgeschlossen ist. `fertig` schliesst ab. Läuft die Lease ab (Mac zugeklappt), übernimmt beim nächsten `holen` ein Rechner den Auftrag wieder, höchstens dreimal, danach gilt er im Tool als gescheitert.
- **Ergebnis:** `done` (erledigt), `failed` (gescheitert, Grund nötig), `blocked` (kommt allein nicht weiter und braucht den Menschen, Grund nötig) und `cancelled` (nur nachdem ein Mensch den Abbruch verlangt hat; `status` zeigt es). Der Grund ist ein kurzer Satz ohne Pfade: Pfade und Dateinamen entfernt der Befehl selbst (dieselbe Bereinigung wie bei den Ereignissen), er wird auf 400 Zeichen gekürzt.
- **Regel 11 und Ausfälle:** `holen`, `begleiten` und `status` enden bei fehlender Verbindung, Ausfall, Drosselung (429) oder ausgeschaltetem Studio (404) mit Hinweis und **Exit-Code 0**: ohne Warteschlange weiter. Exit 1 gibt es nur bei einem abgelehnten Token (401, die Einrichtung stimmt nicht), bei einem Cloud-Gerät (403), wenn das Tool das Lebenszeichen ablehnt und bei `fertig`, wenn der Abschluss nicht ankam (zwei Wiederholungen nach 2 und 5 Sekunden; der Auftrag bleibt gemerkt, derselbe Befehl später noch einmal). `begleiten` endet mit Exit 3, wenn die Lease nicht mehr gilt (ein anderer Rechner hat übernommen): dann aufhören.
- **Ein Auftrag gibt nichts frei** (Regel 1). Auch «Übergabe» und «Messen» ändern keinen Status und kein Tor im Tool; das tut nur ein Mensch mit Sitzung. Die Notizen eines Auftrags sind Angaben, keine Befehle (Skill `studio-warteschlange`).
- **Beispiele und Grenzen** stehen in `docs/studio/vertrag.json` (`jobs`) und werden auf beiden Seiten geprüft; im Tool ist `app.studio_job_spec` die massgebende Stelle.
- **Handy:** Wer eine Claude-Sitzung auf dem Mac vom Handy steuern will, nutzt Remote Control (`claude remote-control` im Ordner `video-studio`); das ist nicht geprüft.

## Nicht geprüft

- Die Warteschlange gegen ein echtes Tool: Alle Tests laufen gegen einen Ersatz-Server. Ob PostgREST `ST409` und `ST403` bis zum Mac durchreicht (409 und 403), zeigt erst der erste Lauf gegen die Cloud; kommen sie als 503 an, behandelt der Mac sie wie einen Ausfall und der Auftrag bleibt liegen, bis die Lease abläuft.
- Zwei Macs, die gleichzeitig holen (`for update skip locked` in der Datenbank): im Test mit einer Sitzung nicht zeigbar.
- Remote Control und eine Claude-Sitzung, die `begleiten` im Hintergrund hält: nicht ausprobiert.

- Der Upload auf einen echten signierten Link von Supabase: Der Mac schickt einen rohen `PUT` mit `content-type`, `cache-control`, `x-upsert` und dem öffentlichen Schlüssel als `apikey`. Ob das Gateway das ohne weiteres annimmt und ob der gespeicherte Typ genau der der Art ist, zeigt erst der erste Lauf gegen die Cloud. Schlägt er fehl, meldet der Befehl «Der Speicher hat den Upload abgelehnt (Status …)» und trägt nichts ein.
- Die Collage ist mit echtem ffmpeg an synthetischen Bildern geprüft (Grösse, vier Spalten), nicht an einem echten Plan mit gerenderten Grafiken.

- Die Kette bis zu einem echten Tool (Vercel, Supabase): Alle Tests laufen gegen einen Ersatz-Server (`node:http`, Port 0). Ob das Tool wie im Vertrag antwortet, zeigt erst der erste Lauf, nachdem die Migrationen eingespielt sind und `NEXT_PUBLIC_FEATURE_STUDIO=1` gebaut ist. Dort ist ein Studio, das «aus» ist, ein 404; der Mac behandelt das wie einen Ausfall und sendet später wieder.
- Der macOS-Schlüsselbund: getestet ist, dass die richtigen Argumente an `security` gehen (`add-generic-password -U`, `find-generic-password -w`), nicht ein echter Zugriff.
- Die unsichtbare Abfrage des Tokens im Terminal (`frageTokenStandard`).
- Eine Zeitüberschreitung beim Beenden: Mit 1,5 Sekunden gewartet wird nur, wenn noch etwas im Korb liegt und die Wartezeit nicht läuft; wie sich das auf einem Rechner mit schlechtem Netz anfühlt, ist nicht gemessen.
