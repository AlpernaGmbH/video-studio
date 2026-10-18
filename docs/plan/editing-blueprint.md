# Editing: Blueprint geprüft, Resolve als Übergabe

Stand 18.10.2026. Auftrag von Andrej: Der Blueprint «Claude Video Editor – The Full Blueprint» (Jason Cooper, Build 2026.10.16, Artifact `BYH6Mcma5to3kt2KogkEzB`) soll geprüft und, wenn sinnvoll, in den Editing-Teil eingebaut werden. Editing-Software eher nicht, wenn doch DaVinci Resolve (bevorzugt) oder CapCut. Videos dürfen im Chat entstehen, die Schnittübergabe soll ein DaVinci-Resolve-Projekt sein, damit Andrej alles als Projekt hat. Ausserdem: Presets für Grafiken und mehr.

Gilt zusätzlich zu Bauplan v2 und v3. Bei Widerspruch gilt dieses Dokument für den Editing-Teil.

## Urteil in vier Sätzen

1. **[Sicher]** Der Blueprint ist eine Marketingseite ohne Belege. Seine Qualitätsaussagen («jeder Schritt prüft sich selbst», «keine objektiven Fehler im Entwurf») sind nicht nachgeprüft. Wir übernehmen keine Aussage, nur Ideen, die wir selbst testen können.
2. **[Sicher]** Die Pipeline deckt sich im Kern mit Bauplan v2 (Ingest, Whisper, Schnitt, Ton, Look, Grafiken, SFX, Review, Export). Neu sind sechs Einzelideen (Tabelle unten), keine neue Architektur.
3. **[Wahrscheinlich]** Die Live-Steuerung einer Schnitt-App (Premiere, Resolve Studio, CapCut) ist für uns der falsche Weg. Der Weg über Dateien funktioniert auch mit der kostenlosen Resolve-Version und bricht nicht, wenn die App ein Update bekommt.
4. **[Sicher]** Der Blueprint ändert nichts am grössten Risiko: Der Durchstich vom Rohmaterial bis zum Export ist nicht bewiesen (Phase 0, Tests T1 bis T6 sind nicht gelaufen). Gebaut ist jetzt die Übergabeseite. Whisper, Take-Auswahl und echter Probelauf fehlen weiter.

## Was die Prüfung ergab (und woher es stammt)

| Aussage | Quelle | Stand |
|---|---|---|
| Resolve importiert FCPXML, OTIO, AAF, EDL und XML als Timeline (`ImportTimelineFromFile`), auch OTIO in der kostenlosen Version | Scripting-Dokumentation von Resolve, Anwenderbericht zu OTIO | **[Wahrscheinlich]**, nicht selbst in Resolve geprüft |
| Das externe Scripting von Resolve (Live-Steuerung per Python) gibt es nur in Resolve Studio, seit 19.1 | Anwenderbericht, Scripting-Dokumentation («Studio only») | **[Wahrscheinlich]** |
| Transparente Grafiken gehören als ProRes 4444 nach Resolve | Anleitungen zum Alpha-Export, Resolve-Forum | **[Wahrscheinlich]** |
| HyperFrames 0.8.164 kann MOV direkt rendern (immer ProRes 4444 mit Alpha) | `hyperframes render --help`, am 18.10.2026 gelesen | **[Sicher]** |
| Unsere FCPXML (Version 1.8) entspricht Apples DTD | `xmllint --dtdvalid` gegen die DTD 1.8, am 18.10.2026 ohne Fehler (Test `extern.test.ts`) | **[Sicher]** |
| Ein verbundener Clip (B-Roll, Grafik, Musik) zählt seinen `offset` in der Zeit des Elternclips, also ab dessen `start` | Kommentar in Apples DTD: «The 'start' attribute defines a local timeline to schedule contained and anchored items» | **[Sicher]** für FCP, **[Vermutung]** für Resolve |
| Der FCPXML-Leser von OpenTimelineIO (`otio-fcpx-xml-adapter` 1.0.0) setzt verbundene Clips im **ersten** Spine-Clip falsch, in den folgenden richtig | Versuch am 18.10.2026: B-Roll bei 1,2 s landete bei 4,4 s, dieselbe Konstruktion im zweiten Clip stimmte | **[Sicher]**, der Leser taugt für Spine und Gesamtlänge, nicht für Spuren |
| Unsere OTIO-Datei wird von OpenTimelineIO 0.18.1 fehlerlos gelesen, Spuren und Längen stimmen | Test `extern.test.ts` | **[Sicher]** |
| Beim Umwandeln von WebM (VP9 mit Alpha) nach ProRes 4444 geht die Transparenz verloren, wenn ffmpeg den eingebauten VP9-Decoder nimmt. Mit `-c:v libvpx-vp9` vor `-i` bleibt sie erhalten | Test `uebergabe.test.ts` (Mutationsprobe: ohne die Option wird die durchsichtige Hälfte deckend) | **[Sicher]** |
| Ob Resolve genau unsere Datei ohne Warnung öffnet | nicht prüfbar in dieser Umgebung | **offen**, Test T9 unten |

## Entscheid zu jedem Teil des Blueprints

| Blueprint | Entscheid | Begründung |
|---|---|---|
| 8 Schritte in fester Reihenfolge, fortsetzbare Run-Datei | **schon da** | Bauplan v2 Kap. 2.3, Zustände in Notion und `daten/` |
| Intake: Datei kopieren, nie verschieben | **schon da** | Bauplan v2: Originale werden nie umbenannt oder verschoben |
| Intake: Querformat-Clip einmalig auf 9:16 füllen | **später** | Erst nach dem ersten Reel, braucht einen Entscheid zum Bildausschnitt |
| Intake: Liste «nie sichtbar» bei Bildschirmaufnahmen | **später** | Erst relevant, wenn Erklärvideos mit Bildschirmaufnahmen kommen |
| AI-Schnitt: Füllwörter, Stille, Fehlstarts; letzte Fassung gewinnt | **schon da** | Bauplan v2 Kap. 3.3 (Take-Auswahl, bei Gleichstand gewinnt der spätere). Die Auswahl selbst ist noch nicht gebaut |
| Schnittgrenzen im Frame-Raster der Timeline | **gebaut** | `src/schnitt/raster.ts`: jede Grenze auf ganze Frames, NTSC-Raten exakt (30000/1001), Test gegen Drift (30 s bei 29,97 fps sind 899 Frames) |
| Schnittgrenzen auf die Wellenform legen | **später** | Gehört zur Schnittlogik (Phase 2), nicht zur Übergabe |
| Schnitt als echte, trimmbare Clips auf der Timeline | **gebaut, das ist der Kern** | Genau das braucht Andrej in Resolve: Schnittplan, FCPXML und OTIO |
| Schnittänderung passt Grafiken, Sound, Untertitel an | **teilweise** | Im Plan sind Untertitel an die Wörter der Quelle gebunden und wandern mit den Clips. Grafiken und B-Roll haben feste Timeline-Zeiten. In Resolve selbst verschiebt sich nichts automatisch |
| Audio: Sprache −17 LUFS, Begrenzer −6 dBFS | **als Preset `blueprint`, Standard bleibt −14** | Unser Plan nennt −14 LUFS («Annahme»), der Blueprint −17 bei −6. Beides unbelegt. Getestet wird mit einem echten privaten Upload (T4). Die Messung ist gebaut (`studio schnitt export-pruefen`) |
| Zweite Stimme anheben, wenn mehr als 3 dB leiser | **später** | Nur relevant für Interviews |
| Grade: LUT nur auf Kameramaterial, unter den Grafiken | **übernehmen** | Entspricht dem Look-Feld der Marke. In Resolve ein Knoten auf dem Kamera-Clip, nicht auf der Grafikspur. Die LUT selbst steht noch aus |
| Look «Autumn-Rec709», Intensität 80, Sättigung 120 | **nicht übernehmen** | Das ist der Look des Autors. Unserer ist der Cine-Look der Marke Alperna, LUT folgt |
| Grafiken: Storyboard, Bauen, Converge (Review mit frischem Blick) | **übernehmen** | Storyboard und Bau gibt es. «Converge» wird ein Pflichtschritt vor Tor P: ein zweiter Durchgang, der nur das Ergebnis sieht, nicht den Plan. Kommt in den Skill, sobald der erste Reel läuft |
| Explainer: Layouts wechseln bei harten Schnitten (split, tight, wide, full, card) | **später** | Gehört zum Modul Erklärvideo, nicht zum ersten Reel |
| Untertitel sind eine Grafik aus dem finalen Skript | **gebaut** | Text aus dem Skript, Timing aus Whisper, 2 bis 3 Wörter je Seite, neue Seite nach jedem Satzende. Ausgabe als SRT; das Aussehen steckt im Untertitel-Preset |
| SFX aus den tatsächlich platzierten Grafiken geplant | **schon da** | Bauplan v2 Kap. 3.8. Alperna nutzt `sfxDichte` 0 |
| Musikbett −20 dB | **gebaut** | Plan-Feld `musik.pegelDb`, in der Timeline als Lautstärke am Musik-Clip. Ausblenden am Ende nicht übernommen, das macht Andrej in Resolve |
| Review: Picture Lock | **schon da** | Freigabe 1 bis 3 mit Editor und Markierungen (v3, Kap. 6) |
| Export Hochformat 1080×1920, CBR 14, AAC 320k | **als Preset `reel-blueprint`** | Unser Plan (Bauplan v2 Kap. 3.11) sagt 8 bis 10 Mbit/s und AAC 128 bis 192. `reel` folgt dem Plan, `reel-blueprint` dem Blueprint. Beide gegeneinander im privaten Upload T4 |
| Export Lang 3840×2160 CBR 50 | **später** | Für Reels irrelevant |
| Apps: Premiere, Resolve Studio, CapCut, Final Cut, ohne App | **Resolve per Datei, sonst «ohne App»** | Siehe nächster Abschnitt |
| Clipper: Langform wird zu 9:16-Clips | **später** | Möglich, wenn Langvideos entstehen |

## Resolve: Übergabe per Datei, keine Live-Steuerung

Der Blueprint steuert die laufende App. Wir tun das nicht, aus vier Gründen:

1. **[Wahrscheinlich]** Das externe Scripting braucht Resolve Studio (bezahlt). Die Datei-Übergabe geht auch mit der kostenlosen Version.
2. **[Sicher]** Eine Live-Steuerung lässt sich ohne Resolve auf dem Rechner nicht testen. Wir würden ungeprüften Code ausliefern. Die Dateien prüfen wir gegen Apples DTD und mit einem unabhängigen Leser.
3. **[Sicher]** Regel 4 des Repos: alles reproduzierbar. Eine Datei ist reproduzierbar, eine Klickfolge in einer App nicht.
4. **[Wahrscheinlich]** Apps ändern ihre Schnittstellen. Das Dateiformat FCPXML bleibt über Versionen lesbar.

### Was Andrej bekommt

Befehl auf dem Mac: `npm run studio -- schnitt resolve --plan plan.json`. Das Ergebnis ist ein Ordner, standardmässig `Studio/inhalte/c-0007/ergebnis/resolve/`:

| Datei | Inhalt |
|---|---|
| `timeline.fcpxml` | Schnitt als echte Clips: Sprache V1/A1, B-Roll V2, Grafiken V3, Musik A2. FCPXML 1.8 |
| `timeline.otio` | dieselbe Timeline als OpenTimelineIO, falls die FCPXML Probleme macht. Jede Spur trägt feste Lücken, es gibt nichts Verschachteltes |
| `untertitel.srt` | Wort für Wort, 2 bis 3 Wörter je Seite |
| `overlays/*.mov` | die Grafiken aus dem Render als ProRes 4444 mit Transparenz (aus WebM umgewandelt) |
| `plan.json` | der Schnittplan, aus dem alles entstand |
| `LIESMICH.md` | Schritte für den Import, Einstellungen für den Export (aus dem Export-Preset), Stellen, die beim Schnitt auffielen |

Ein vorhandener Ordner wird nie überschrieben: die nächste Fassung heisst `resolve-v2`. Was Andrej in Resolve ändert, bleibt in Resolve. Es gibt keine Rückübertragung nach `plan.json`.

### Chat gegen Mac

Im Chat (claude.ai) lässt sich der Schnittplan schreiben und mit `studio schnitt pruefe` prüfen, weil er reiner Text ist. Gerendert wird nur auf dem Mac mit Repo und Studio-Ordner (Whisper, ffmpeg, HyperFrames, Quellvideos). Ohne Mac entsteht also kein fertiges Video, nur der Plan. Das war in Plan v3 (Kap. 3.1) schon so und ändert sich nicht.

### Der Schnittplan

Aufbau und Beispiel: `prompts/beispiele/schnittplan.json`. Kurz: `quellen` (Datei, Länge, Bildrate, Ton, aus `studio schnitt sondiere`), `clips` (Sprache in Quellzeit, lückenlos hintereinander), `broll` (nur mit Katalog-Schlüssel und Begründung), `overlays` (fertig gerenderte Grafiken mit Begründung), `musik`, `woerter` (Text aus dem Skript, Timing aus Whisper, in Quellzeit).

`studio schnitt pruefe` meldet **Fehler** (Quelle fehlt, Clip über das Ende der Quelle, Grafik über das Ende des Videos, kein Katalog-Schlüssel, Stück nicht aktiv, MP4 als Grafik) und **Hinweise** nach dem Schnittprofil der Marke: Einstellung länger als 1,5 s ohne Bildwechsel, Pause über 0,25 s, Hook später als 2 s, Sprechtempo über 4,8 Wörter pro Sekunde, Video über 90 s. Die Startwerte stammen aus Bauplan v2, Kap. 3.4, sind dort als Vermutung gekennzeichnet und werden mit den Retention-Graphen kalibriert.

Nicht abgedeckt: Zeitlupe (50p und 60p als B-Roll laufen in der Übergabe in Echtzeit), Übergänge, Farbkorrektur, Tonmischung über den Pegel der Musik hinaus.

## Presets

Ordner `presets/`, geprüft mit `studio presets lint`. Jedes Preset trägt seine Herkunft: **entschieden** (steht im Bauplan oder im Datenblatt eines Stücks), **annahme** (Startwert) oder **unbelegt** (fremde Angabe).

| Art | Presets | Wozu |
|---|---|---|
| `export` | `reel` (Bauplan v2 Kap. 3.11), `reel-blueprint`, `vorschau` | `studio schnitt export-pruefen` misst eine fertige Datei (ffprobe, ffmpeg `ebur128`) und nennt jede Abweichung. Dieselben Werte erscheinen in `LIESMICH.md` und in `ffmpegExportArgs` für den Weg ohne App |
| `audio` | `standard` (−14 LUFS, −1 dBTP), `blueprint` (−17 LUFS, −6 dBTP) | Lautheit und True Peak des fertigen Videos |
| `untertitel` | `pop-akzent`, `ruhig-unten`, `kasten-unten` | Vorschläge für das Caption-Preset der Marke. `studio presets caption <id>` setzt die Schrift der Marke ein. Übernehmen und freigeben tut ein Mensch bei Gate 0 mit dem Probebild |
| `grafik` | `zahl-gross`, `zahl-oben` (Stück `zahl-zaehler`), `hook-karte`, `lower-third`, `keyword-pop`, `schlusskarte`, `logo-ecke` | Position im Bild (Anker innerhalb des Sicherheitsrands), Dauer, Ein- und Ausblendung, Textgrenzen, Voreinstellung der Parameter. `studio presets overlay <id> --t 1.2 --set …` macht daraus den Eintrag fürs Storyboard und prüft ihn gegen das Datenblatt des Stücks |

**Fünf Grafik-Presets haben noch kein Stück** (Hook-Karte, Lower Third, Keyword-Pop, Schlusskarte, Logo). Sie sind Vorgaben, aus denen kein Overlay entsteht, bis das Stück existiert. Gebaut werden die Stücke ausschliesslich über die Motion-Werkstatt: Idee mit dem genauen Satz im Protokoll, Pitch, drei Looks, Wahl und Abnahme durch einen Menschen (Regel 2 des Repos). Ein Preset kann das nicht abkürzen, `studio presets lint` führt sie darum als Lücke.

Das Markenprofil `alperna.json` ist nicht angefasst. Caption-Preset, Logo und Schlusskarte fehlen dort weiter (Gate-0-Lücken). Das Preset liefert den Vorschlag, die Entscheidung bleibt bei Andrej.

## Test T9: Öffnet Resolve unsere Datei

T1 bis T8 sind im Plan vergeben (v3, Kapitel 11). T9 ist neu.

| Schritt | Erwartung | Fällt es durch |
|---|---|---|
| `studio schnitt resolve --plan` mit zwei echten Clips ausführen (Plan aus `schnitt sondiere` und `prompts/beispiele/schnittplan.json`) | Ordner mit `timeline.fcpxml`, `timeline.otio`, `untertitel.srt` | Fehlermeldung des Befehls lesen |
| In Resolve (kostenlos oder Studio) die FCPXML importieren | Timeline erscheint mit 25 fps, 1080×1920, Clips lückenlos, Schnitte auf dem Frame genau, B-Roll und Grafik an der richtigen Zeit | OTIO versuchen. Hilft das nicht: Resolve-Version und Meldung in `STATUS.md` festhalten |
| Kamera-Dateien mit eingebettetem Timecode verwenden | Clips beginnen an der richtigen Stelle (nicht um die Timecode-Stunde verschoben) | Feld `start` der Quelle prüfen (`sondiere` liest den Timecode) |
| SRT importieren | 2 bis 3 Wörter je Untertitel, Zeiten passen zur Sprache | Zeiten in `plan.json` prüfen |
| Grafik auf V3 ansehen | Transparenz bleibt erhalten | Grafik als PNG-Folge rendern (`hyperframes render --format png-sequence`) |

Erst nach T9 gilt die Übergabe als belegt. Bis dahin ist sie gebaut, gegen Apples DTD geprüft und mit einem unabhängigen Leser gegengelesen, aber nicht in Resolve gesehen.

## Was noch fehlt, damit ein Reel wirklich entsteht

1. Whisper-Lauf und Zuordnung der Skriptzeilen zu Takes (Bauplan v2, Kap. 3.3). Davon hängt ab, dass `plan.json` aus echten Zeiten entsteht statt von Hand.
2. Ein Probelauf mit echtem Material und echtem Resolve (T9) und dem privaten Upload (T4).
3. Die fünf Stücke aus der Lückenliste der Presets, über die Motion-Werkstatt.

## Einwände und Risiken

1. **Ich widerspreche, dass der Blueprint «so eingebaut» wird, weil** seine Stärken (Selbstprüfung, fester Ablauf) nicht belegt sind und seine Schnittstelle (Live-Steuerung einer App) unseren Regeln widerspricht. Stattdessen übernehmen wir die Ideen, die wir selbst prüfen können (trimmbare Clips, Frame-Raster, Audio-Messung, Exportprüfung, Converge-Durchgang später). Das Risiko bei einem Komplett-Einbau wäre eine Abhängigkeit von einer fremden Bauanleitung, die wir nicht testen können.
2. **Resolve ist die grössere Lernhürde, nicht die Technik.** Andrej kennt Resolve nach eigener Aussage wenig. **[Vermutung]** Der erste Schnitt dort kostet mehr Zeit als in CapCut. CapCut hat nach heutigem Wissen keinen dokumentierten Import für FCPXML oder OTIO **[Wahrscheinlich]**, wäre also nur «ohne Übergabe» möglich: Claude schreibt den fertigen Export, Korrekturen laufen über neue Fassungen. Resolve lohnt sich nur, wenn Andrej die Timeline wirklich selbst anfasst. Die kostenlose Version genügt für den Import **[Wahrscheinlich]**.
3. **Zwei Wahrheiten, wenn Andrej in Resolve schneidet.** `plan.json` weiss nichts von seinen Änderungen. Regel: Was in Resolve geändert wird, bleibt in Resolve. Ein neuer Export liegt immer in einem neuen Ordner. Beide Wege gleichzeitig zu führen wäre ein Synchronisierungsproblem, das wir nicht lösen.
4. **Untertitel in Resolve sehen nicht aus wie unsere Captions.** Eine SRT trägt nur Text und Zeit. Das Aussehen der Marke (Pop, Hervorhebung) braucht ein gerendertes Caption-Overlay, und das gibt es noch nicht (kein Stück). Bis dahin stylt Andrej die SRT in Resolve.
5. **Der OTIO-Weg ist der Notnagel, nicht der Hauptweg.** **[Vermutung]** Ob Resolve OTIO mit mehreren Spuren so liest wie die Python-Bibliothek, ist offen. Beide Dateien kommen zusammen, damit der erste Versuch in Resolve eine Chance mehr hat.
