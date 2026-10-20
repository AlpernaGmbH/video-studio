# Katalog der Fotos, B-Roll und Sounds

Grundlage ist Bauplan v2, Kapitel 3.7. Der Katalog gibt dem Storyboard einen Schlüssel für jede Datei, die als B-Roll vorkommen darf (Regel 3 des Repos). Befehle: `studio katalog …`.

## Dateien

Alle im Datenordner (`<Studio>/daten/`, in OneDrive):

| Datei | Inhalt |
|---|---|
| `katalog.json` | fertige Einträge (Schlüssel, Pfad, Titel, Beschreibung, Tags, Dauer, Bildrate, Orientierung, Zeitlupe, Log, beste Sekunden, Personen, Freigabe, Sicherheit, zuletzt genutzt) |
| `katalog-offen.json` | gescannte Dateien, die noch auf ihre Beschreibung warten |
| `katalog/vorschau/` | drei Bilder je Clip (5, 50 und 95 Prozent der Dauer), ein Bild je Foto, 480 Pixel breit |

Pfade sind relativ zum Studio-Ordner, Dateien unter `rohmaterial/`, `renders/` und `inspiration/` relativ zum Medien-Ordner (Regel 8). Originaldateien werden nie umbenannt oder verändert.

## Ablauf

```
studio katalog scan <ordner>            Metadaten und Vorschaubilder, neue Dateien werden «offen»
studio katalog offen --limit 10         die nächsten offenen Dateien als JSON (Claude sieht die Vorschaubilder an)
   Claude schreibt beschreibungen.json
studio katalog beschreibe --json beschreibungen.json
studio katalog liste --suche "laptop büro"
studio katalog zeige k-0142
```

1. **Scan.** Pro Datei liest ffprobe Dauer, Bildrate, Grösse (nach der Drehung: iPhone-Videos sind hochkant), Ton, Aufnahmezeit, Kamera und, wenn die Kamera einen schreibt, den Ort. 50p und 60p gelten als Zeitlupe. Ordnernamen vom gescannten Ordner bis zur Datei stehen als `ordnerHinweis` im Eintrag: Kunde und Ort kommen von dort und aus dem Ort in den Metadaten, nicht aus dem Raten. Bekannte Pfade werden übersprungen, `--max n` begrenzt einen Lauf (der Rest kommt beim nächsten), eine nicht lesbare Datei wird gemeldet und bleibt liegen.
2. **Beschreiben.** Das macht Claude in einer Sitzung nach den Vorschaubildern (Plan Kap. 3.7, Schritt 2). Format je Datei: `schluessel`, `titel` (Schema Kunde_Ort_Motiv_Aktion_Datum), `beschreibung` (ein bis zwei Sätze), `tags` (deutsch), `sicherheit` (hoch, mittel oder niedrig), bei Videos `besteSekunden` (Ein- und Ausstieg), `personen`, und `log`, wenn das Bild flach aussieht (Log-Material erkennt man an der Bildanalyse, nicht an den Metadaten). Ungültiges bleibt mit Grund offen, das übrige geht durch. Ein vorhandener Schlüssel wird überschrieben: So gilt eine Korrektur.
3. **Nutzen.** `studio schnitt auftrag` und `studio schnitt storyboard` lesen `katalog.json`. Das Storyboard darf nur diese Schlüssel nennen; die Auswahl-Regeln stehen im Auftrag (Orientierung, Dauer mindestens so lang wie das Overlay, Zeitlupe nur bei Bedarf, nicht zweimal im Video, nicht im letzten Video der Marke).

## Was fehlt

- **Notion-Datenbank «Katalog»** (Plan v3, Phase 1) und der Abgleich dorthin. Bis dahin ist `katalog.json` die einzige Quelle.
- **«Zuletzt genutzt»** wird nirgends zurückgeschrieben. Es müsste beim Export eines Videos geschehen; ohne das findet das «nicht im letzten Video der Marke» nur Einträge, bei denen jemand das Feld von Hand setzt.
- **Fotos:** GPS und Aufnahmezeit aus EXIF liest der Scan nicht (ffprobe liefert sie bei Fotos kaum), HEIC geht nur, wenn die ffmpeg-Version es kann. Fotos als B-Roll kann der Schnittplan noch nicht (Ken Burns).
- **Regel «Korrektur merken»** (Plan Kap. 3.7, Schritt 5): Eine Korrektur überschreibt den Eintrag, wird aber nicht als Regel gemerkt.
- **Tokenkosten:** Der Plan schätzt grob eine halbe Million Token für 300 Clips und will sie an 20 Dateien messen. Das ist nicht gemessen.
- **Sounds:** Sie bekommen keine Vorschaubilder; Claude beschreibt sie nach Dateiname und Ordner. Soundeffekte im Schnitt (Plan Kap. 3.8) sind nicht gebaut.

## Geprüft

Mutationsproben je Regel und ein Durchlauf mit echtem ffmpeg (Video, Foto, Sound, Vorschaubilder, zweiter Scan, Beschreiben, Korrigieren, Suchen), dazu ein Durchlauf bis zum Resolve-Ordner mit B-Roll aus dem Katalog (FCPXML gegen Apples DTD 1.8 gültig). Nicht geprüft: echtes Material von Kamera und iPhone, Hunderte von Dateien, OneDrive-Platzhalter («Dateien auf Abruf» lesen ffprobe und ffmpeg nur, wenn sie auf dem Gerät liegen).
