# Katalog der Fotos, B-Roll und Sounds

Grundlage ist Bauplan v2, Kapitel 3.7. Der Katalog gibt dem Storyboard einen Schlüssel für jede Datei, die als B-Roll vorkommen darf (Regel 3 des Repos). Befehle: `./studio katalog …`.

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
./studio update                        Stand holen
./studio katalog scan                  Metadaten und Vorschaubilder; danach entstehen die Bögen, und der Ordner mit ihnen geht im Finder auf
   Die Bilder (bogen-01.jpg …) in den Chat ziehen: «beschreibe die Clips». Claude antwortet mit einer Liste.
./studio katalog beschreibe --zwischenablage      die Liste aus dem Chat kopiert, dann dieser Befehl
./studio katalog liste --suche "laptop büro"
./studio katalog genutzt --plan plan.json         erst wenn das Video fertig ist
```

1. **Scan.** Ohne Angabe wird `rohmaterial/` im Medien-Ordner gescannt, sonst der angegebene Ordner oder die einzelne Datei. Pro Datei liest ffprobe Dauer, Bildrate, Grösse (nach der Drehung: iPhone-Videos sind hochkant), Ton, Aufnahmezeit, Kamera und, wenn die Kamera einen schreibt, den Ort. 50p und 60p gelten als Zeitlupe. Ordnernamen vom gescannten Ordner bis zur Datei stehen als `ordnerHinweis` im Eintrag: Kunde und Ort kommen von dort und aus dem Ort in den Metadaten, nicht aus dem Raten. Bekannte Pfade werden übersprungen, `--max n` begrenzt einen Lauf, eine nicht lesbare Datei wird gemeldet und bleibt liegen.
2. **Bögen.** Pro Clip drei Vorschaubilder (Anfang, Mitte, Ende) mit der Katalog-Nummer darüber, vier Clips pro Bild unter `<Datenordner>/katalog/bogen/`. Das ist die Brücke zum Chat: Ein Bild genügt, die Nummer steht darauf. Für die Beschriftung braucht ffmpeg den Filter «drawtext» und eine Schrift (auf dem Mac Arial oder Helvetica, sonst `STUDIO_FONT=/Pfad/zur/Schrift.ttf`). `./studio katalog bogen` erzeugt sie neu.
3. **Beschreiben** (im Chat, nach den Bögen; das braucht kein API-Guthaben, nur die Nutzung des Abos). Format je Datei: `schluessel`, `titel` (Schema Kunde_Ort_Motiv_Aktion_Datum), `beschreibung` (ein bis zwei Sätze), `tags` (deutsch), `sicherheit` (hoch, mittel oder niedrig), bei Videos `besteSekunden` (Ein- und Ausstieg), `personen`, und `log`, wenn das Bild flach aussieht. `beschreibe --zwischenablage` liest die Liste aus der Zwischenablage (auch mit Text und Codezaun drumherum), `--json datei.json` aus einer Datei. Ungültiges bleibt mit Grund offen, das übrige geht durch. Ein vorhandener Schlüssel wird überschrieben: So gilt eine Korrektur.
4. **Nutzen.** `./studio schnitt auftrag` und `./studio schnitt storyboard` lesen `katalog.json`. Das Storyboard darf nur diese Schlüssel nennen; die Auswahl-Regeln stehen im Auftrag (Orientierung, Dauer mindestens so lang wie das Overlay, Zeitlupe nur bei Bedarf, nicht zweimal im Video, nicht im letzten Video der Marke).

**Fotos** werden beschrieben wie Videos, sind aber **keine B-Roll**: Der Auftrag für das Storyboard listet sie nicht (Entscheid Andrej, 21.10.). Sie bleiben im Katalog für Carousel, Blog-Bilder und Google-Beiträge (Plan v3, Katalog-Zeile); `./studio katalog liste --art foto --suche …` findet sie. Die Textformate nutzen sie noch nicht automatisch.

## Was fehlt

- **Notion-Datenbank «Katalog»** (Plan v3, Phase 1) und der Abgleich dorthin. Bis dahin ist `katalog.json` die einzige Quelle.
- **«Zuletzt genutzt»** trägt `./studio katalog genutzt --plan plan.json` ein, wenn das Video fertig ist (Kennung «Name [marke]»). Es läuft nicht von selbst beim Export: Wer es vergisst, hat im nächsten Video dieselbe B-Roll wieder im Angebot.
- **Fotos:** GPS und Aufnahmezeit aus EXIF liest der Scan nicht (ffprobe liefert sie bei Fotos kaum), HEIC geht nur, wenn die ffmpeg-Version es kann. Fotos als B-Roll sind ausdrücklich nicht vorgesehen.
- **Regel «Korrektur merken»** (Plan Kap. 3.7, Schritt 5): Eine Korrektur überschreibt den Eintrag, wird aber nicht als Regel gemerkt.
- **Tokenkosten:** Der Plan schätzt grob eine halbe Million Token für 300 Clips und will sie an 20 Dateien messen. Das ist nicht gemessen.
- **Sounds:** Sie bekommen keine Vorschaubilder; Claude beschreibt sie nach Dateiname und Ordner. Soundeffekte im Schnitt (Plan Kap. 3.8) sind nicht gebaut.

## Geprüft

Mutationsproben je Regel und ein Durchlauf mit echtem ffmpeg (Video, Foto, Sound, Vorschaubilder, zweiter Scan, Beschreiben, Korrigieren, Suchen), dazu ein Durchlauf bis zum Resolve-Ordner mit B-Roll aus dem Katalog (FCPXML gegen Apples DTD 1.8 gültig). Nicht geprüft: echtes Material von Kamera und iPhone, Hunderte von Dateien, OneDrive-Platzhalter («Dateien auf Abruf» lesen ffprobe und ffmpeg nur, wenn sie auf dem Gerät liegen).
