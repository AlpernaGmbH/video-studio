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
./studio tool trennen       # Token und Adresse löschen, der Korb bleibt
```

Cloud-Sitzungen (kein Schlüsselbund) setzen `STUDIO_TOOL_URL` und `STUDIO_TOOL_TOKEN`; sie gelten vor `tool.json`.

## Nicht geprüft

- Die Kette bis zu einem echten Tool (Vercel, Supabase): Alle Tests laufen gegen einen Ersatz-Server (`node:http`, Port 0). Ob das Tool wie im Vertrag antwortet, zeigt erst der erste Lauf, nachdem die Migrationen eingespielt sind und `NEXT_PUBLIC_FEATURE_STUDIO=1` gebaut ist. Dort ist ein Studio, das «aus» ist, ein 404; der Mac behandelt das wie einen Ausfall und sendet später wieder.
- Der macOS-Schlüsselbund: getestet ist, dass die richtigen Argumente an `security` gehen (`add-generic-password -U`, `find-generic-password -w`), nicht ein echter Zugriff.
- Die unsichtbare Abfrage des Tokens im Terminal (`frageTokenStandard`).
- Eine Zeitüberschreitung beim Beenden: Mit 1,5 Sekunden gewartet wird nur, wenn noch etwas im Korb liegt und die Wartezeit nicht läuft; wie sich das auf einem Rechner mit schlechtem Netz anfühlt, ist nicht gemessen.
