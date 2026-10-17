---
name: studio-einrichten
description: Richtet das Video-Studio auf einem Mac ein oder prüft, warum es dort nicht läuft. Benutzen, wenn jemand das Studio auf einem neuen Rechner starten will, OneDrive-, Pfad- oder Installationsfehler meldet, oder `doctor` Fehler zeigt.
---

# Studio auf einem Mac einrichten

Der Code kommt per git, Daten und Medien liegen in OneDrive im Ordner `Studio`, Texte in Notion. Auf jedem Mac ist nur der Pfad zu OneDrive anders.
Der steht in `~/.config/video-studio/config.json` (ausserhalb von Repo und OneDrive). Hintergrund: `docs/notion-und-pruefplatz.md`.

## Schritte (einmal je Mac)

1. **OneDrive** ist angemeldet und hat den Ordner `Studio` fertig synchronisiert, falls er schon existiert (auf dem ersten Mac legt `init` ihn an).
   Im Finder Rechtsklick auf `Studio`, «Immer auf diesem Gerät behalten». Sonst sind Dateien nur Platzhalter, und das Rendern findet sie nicht.
2. Voraussetzungen: Node 22 oder neuer (`node -v`), ffmpeg und ffprobe (`brew install ffmpeg`).
3. Repo holen: `git clone https://github.com/AlpernaGmbH/video-studio.git`, dann `cd video-studio && npm install`.
4. `npm run studio -- init`. Er findet den OneDrive-Ordner. Gibt es mehrere, nennt er sie, und du gibst `--home "<Ordner>/Studio"` an. Rate den Pfad nie.
5. HyperFrames einmal je Mac: `npx hyperframes browser ensure` und `npx hyperframes telemetry disable` (wegen Kundenmaterial). `GEMINI_API_KEY` bleibt ungesetzt.
6. `npm run studio -- doctor`. Alles muss «ok» oder «Hinweis» sein. Bei «FEHLER» zuerst dort ansetzen.
7. `npm run check` (Typecheck, Tests, Lint der Bibliothek). Danach `npm run selftest:render` und die Zeiten in `STATUS.md` eintragen (Test T1 des Bauplans).
8. Notion: Claude (App oder Claude Code) braucht die Notion-Verbindung des Kontos, und die Seite «Video-Studio» muss mit dem Konto geteilt sein.
   Prüfen: eine Abfrage der Datenbank «Ideen» (`notion-query-data-sources`, `notion.json`).

## Wenig Platz auf dem Mac

Die kleinen Daten (`daten/`: Ideenprotokoll, Standbilder) bleiben im Studio-Ordner, die grossen Ordner (`rohmaterial`, `renders`, `inspiration`) gehören bei knappem Platz auf ein Laufwerk:
`npm run studio -- init --home "<Studio>" --medien "/Volumes/<Laufwerk>/Studio-Medien"`. `doctor` zeigt den freien Platz je Ort (Warnung unter 100 GB, Fehler unter 10 GB).
OneDrive selbst auf einem externen Laufwerk geht laut Microsoft nur mit APFS und nicht auswerfbarem Laufwerk. USB-Laufwerke sind auswerfbar: nicht versuchen, nur die Medien dorthin legen.
Laufwerk von der Platte nehmen: Nie ohne «Auswerfen» im Finder. Ein einzelnes Laufwerk ist kein Backup: Rohmaterial in zwei Kopien halten.

## Häufige Fehler

| Meldung | Ursache | Lösung |
|---|---|---|
| `doctor`: Studio-Ordner existiert nicht | OneDrive noch nicht fertig synchronisiert oder anderer Ordnername | Warten, dann `init --home "<Pfad>"` |
| `doctor`: nicht eingerichtet | `init` fehlt auf diesem Mac | `npm run studio -- init` |
| Render findet Datei nicht, Datei ist 0 Byte oder Wolke | OneDrive Dateien auf Abruf | «Immer auf diesem Gerät behalten» auf `Studio` |
| `Mehrere OneDrive-Ordner gefunden` | Privat und Firma angemeldet | `--home` mit dem Firmenordner |
| Ideenprotokoll «wurde inzwischen geändert» | Zwei Macs schreiben gleichzeitig | Neu laden und wiederholen. Nie beide gleichzeitig mit Ideen arbeiten lassen |
| `doctor`: Medien-Ordner existiert nicht | Laufwerk nicht angeschlossen oder umbenannt | Anschliessen, `ls /Volumes`, bei neuem Namen `init --medien` wiederholen |
| Notion-Abfrage schlägt fehl | Verbindung fehlt oder Seite nicht geteilt | In claude.ai unter Einstellungen, Konnektoren verbinden, Seite teilen |

## Grenzen

- Zwei Macs auf derselben `ideen.json` über OneDrive sind kein Mehrbenutzerbetrieb. Das Protokoll prüft die Version und verweigert veraltetes Schreiben, aber
  OneDrive kann bei gleichzeitigem Schreiben eine Konfliktkopie anlegen. Entscheide laufen deshalb über Notion und den Prüfplatz, nicht über die Datei.
- Alles, was `doctor` nicht sieht (ob Chrome Headless Shell geladen ist, ob die Telemetrie aus ist), steht als Hinweis da und ist von Hand zu tun.
