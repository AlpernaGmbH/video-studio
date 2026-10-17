**Video-Editing-System**

Bauplan Version 2 für Alperna

Stand 16.10.2026 · gemeinsam ausgearbeitet mit Andrej · ersetzt die erste Fassung

**0. Kurzfassung**

Rohmaterial und ein Wort-für-Wort-Skript gehen hinein, ein fertiges Instagram-Reel im Look der jeweiligen Marke kommt heraus. Dazwischen gibt es drei Freigaben und eine einmalige Markenfreigabe pro Kunde. Gerendert wird lokal auf euren Macs, geplant und geprüft von Claude, die Daten liegen in Notion und auf OneDrive.

**Drei unbequeme Wahrheiten, die den Plan prägen:**

1.  **\[Sicher\]** Das System entsteht nicht als reines Artifact. Ein Browser-Artifact kann weder 6K-Log-Material rendern noch auf eure OneDrive-Ordner zugreifen. Das Artifact dient als Prüfplatz für die Freigaben, der Render-Rechner arbeitet lokal.

2.  **\[Sicher\]** Whisper gibt Dialekt als Hochdeutsch wieder und formuliert dabei um. Weil ihr nur im Dialekt dreht, ist das Skript der Anker. Die Captions-Texte stammen aus dem Skript, nur das Timing stammt aus Whisper.

3.  **\[Sicher\]** Das System «lernt» nicht von selbst. Es speichert Korrekturen als Regeln, die ihr freigebt und die danach in jede Planung einfliessen. Das braucht Pflege.

**\[Vermutung\]** Der Gesamtaufwand liegt bei grob 40 bis 60 Personentagen. Das ist eine Schätzung ohne Erfahrungswert. Phase 0 (Tests) macht sie belastbar.

**1. Entscheidungsprotokoll**

Alles, was wir bisher festgelegt haben. «Annahme» heisst: Ich habe es so verstanden, du hast es nicht ausdrücklich bestätigt.

| **Thema**                 | **Entscheidung**                                                                                                               | **Status**  |
|---------------------------|--------------------------------------------------------------------------------------------------------------------------------|-------------|
| Videotypen                | Talking Head, Trendformate, Projektvideos, Erklärvideos. Alle gleichrangig, Reihenfolge egal.                                  | Entschieden |
| Plattform                 | Fokus Instagram Reels. Andere Plattformen bekommen dieselbe Datei.                                                             | Entschieden |
| Rendering                 | Phasenweise. Planung und Freigaben im Claude-Artifact, Rendern lokal auf dem Mac.                                              | Entschieden |
| Freigaben                 | Drei Stufen (Schnitt, Storyboard, Export) plus einmalig Gate 0 (Markenprofil) pro Kunde.                                       | Entschieden |
| Transkription             | Whisper lokal. Untertitel Hochdeutsch, gesprochen wird Dialekt.                                                                | Entschieden |
| Skript                    | Immer vorhanden, Wort für Wort, aktuell in Notion. Änderungen am Set kommen vor.                                               | Entschieden |
| Take-Auswahl              | System wählt den besten Take pro Skriptzeile. Take mit Füllwort oder Abbruch scheidet aus.                                     | Entschieden |
| Abweichungen vom Skript   | Das System entscheidet bei sinnvollen Abweichungen selbst und begründet.                                                       | Entschieden |
| Schnitttempo              | Sehr schnell, auf Retention ausgelegt. Pausen höchstens 0,25 s.                                                                | Entschieden |
| Optik                     | Laut und dynamisch bei Grafiken und Motion. Sprache und Ton bleiben ruhig.                                                     | Entschieden |
| Effekte                   | Alle Effekte der Analyse kommen in den Plan, gebaut in drei Wellen.                                                            | Entschieden |
| Musik                     | Optional. Keine Pflicht pro Video.                                                                                             | Entschieden |
| B-Roll und Fotos          | Mehrere hundert Videos und Fotos, werden autonom benannt, alles darf immer genutzt werden.                                     | Entschieden |
| Sound-Effekte             | Zuerst per Code erzeugt. Eure Sample-Bibliothek kommt später und wird gleich benannt wie B-Roll.                               | Entschieden |
| Lernen                    | Regelvorschläge, Regeln gelten für alle Videos, jeder Mitarbeitende darf freigeben. Lernsignale: Änderungen und Unverändertes. | Entschieden |
| Regeln und Marken         | Regeln werden als «Handwerk» (global) oder «Optik» (an die Marke gebunden) getrennt.                                           | Annahme     |
| Daten                     | Text und Strukturdaten in Notion, Dateien auf OneDrive, Pfade relativ zum OneDrive-Hauptordner.                                | Entschieden |
| Rechner                   | Macs mit M4 und M5, können tagsüber rendern.                                                                                   | Entschieden |
| Render-Engine             | HyperFrames zuerst, Remotion als Plan B.                                                                                       | Entschieden |
| Bildrate                  | Projekt in 25p. 50p und 60p sind Zeitlupe für B-Roll. Export 1080×1920.                                                        | Entschieden |
| Ton                       | Lautheit angleichen (Ziel −14 LUFS), Rauschentfernung ausschaltbar.                                                            | Annahme     |
| Marken                    | Pro Kunde ein Profil, vom System aus Website oder Brandbook ausgelesen. Caption-Stil pro Marke.                                | Entschieden |
| Qualitätsprüfung          | Pflicht. Selbstkorrektur bei messbaren Mängeln, höchstens 2 Runden.                                                            | Entschieden |
| Beschreibung und Hashtags | Werden mit dem Video geliefert.                                                                                                | Entschieden |
| Color Grading             | Gehört ins System, der Look wird später festgelegt.                                                                            | Offen       |
| Zwei Kameras              | Kommt selten vor. Eigene Phase, halbautomatisch.                                                                               | Entschieden |
| Testprojekt               | Ein echtes Projekt wird am Schluss gewählt.                                                                                    | Offen       |

**2. Architektur**

**2.1 Bausteine**

| **Baustein**         | **Aufgabe**                                                                                         | **Läuft wo**                                  |
|----------------------|-----------------------------------------------------------------------------------------------------|-----------------------------------------------|
| Notion               | Datenbanken: Projekte, Skripte, Markenprofile, Katalog, Regeln, Ereignisprotokoll                   | Notion, von allen erreichbar                  |
| OneDrive             | Alle Dateien: Rohmaterial, Proxys, B-Roll, Fotos, Sounds, fertige Videos                            | Auf dem Render-Rechner «immer lokal behalten» |
| Render-Rechner       | Claude Code mit Projekt-Skills, ffmpeg, Whisper, HyperFrames. Führt die Pipeline aus.               | Ein Mac (M4 oder M5)                          |
| Claude               | Planung (Storyboard), Benennung von B-Roll, Bildprüfung, Regelvorschläge, Beschreibung und Hashtags | Über Claude Code und das Artifact             |
| Artifact «Prüfplatz» | Freigaben: Vorschau ansehen, Storyboard prüfen, Änderungswunsch als Satz, Regeln freigeben          | Browser auf jedem PC                          |

**\[Wahrscheinlich\]** Das Artifact kann Notion über euren Notion-Zugang in Claude lesen und beschreiben. Das ist ungetestet (Test T3 in Phase 0). Fällt der Test durch, finden die Freigaben direkt auf einer Notion-Seite pro Projekt statt, und das Artifact entfällt oder bleibt nur Ansicht.

**2.2 Ordnerstruktur auf OneDrive**

> Studio/
>
> Marken/\<Marke\>/ Logo, Schriften, Brandbook, Probebilder
>
> Bibliothek/
>
> B-Roll/ Videos (Original, 25p, 50p, 60p)
>
> Fotos/
>
> Sounds/ eigene Sample-Bibliothek (kommt später)
>
> Musik/ optional
>
> Projekte/\<Marke\>/\<JJJJ-MM-TT_Titel\>/
>
> 01_Roh/ Kameradateien (Log)
>
> 02_Proxy/ Arbeitskopien, vom System erzeugt
>
> 03_Skript/ skript.md (aus Notion)
>
> 04_Plan/ transkript.json, schnitt.json, storyboard.json
>
> 05_Vorschau/ vorschau.mp4 für die Freigabe
>
> 06_Fertig/ final.mp4, beschreibung.md, qa-bericht.md

- **\[Sicher\]** Auf dem Render-Rechner muss «Immer auf diesem Gerät behalten» für Studio/ gesetzt sein. Mit «Dateien bei Bedarf» liegen nur Platzhalter lokal, und das Rendern hängt.

- Der Katalog speichert **relative Pfade** ab Studio/. So funktioniert er auf jedem Mac, obwohl der Pfad zu OneDrive überall anders heisst.

**2.3 Ablauf von Rohmaterial bis Export**

| **\#** | **Stufe**        | **Aufgabe**                                                                                  | **Läuft wo**           | **Freigabe** |
|--------|------------------|----------------------------------------------------------------------------------------------|------------------------|--------------|
| 1      | Ingest           | Dateien erfassen, Bildrate und Log erkennen, Proxys in 25p erzeugen                          | Render-Mac             | –            |
| 2      | Transkription    | Whisper mit Schweizerdeutsch-Modell, Segmentzeiten                                           | Render-Mac             | –            |
| 3      | Skript-Zuordnung | Skriptzeilen den Segmenten zuordnen, Takes gruppieren, besten wählen, Abweichungen begründen | Render-Mac plus Claude | Freigabe 1   |
| 4      | Schnitt          | Jump-Cuts, Pausen entfernen, Zoom-Punches, Mindest-Bildwechsel                               | Render-Mac             | –            |
| 5      | Storyboard       | Hook, Effekte, B-Roll aus dem Katalog, Betonungen, Soundplan                                 | Claude                 | Freigabe 2   |
| 6      | Vorschau         | Niedrig aufgelöste Vorschau mit allem Inhalt                                                 | Render-Mac             | im Prüfplatz |
| 7      | Finaler Render   | 1080×1920, 25p, Ton gemischt, Lautheit angeglichen                                           | Render-Mac             | –            |
| 8      | Qualitätsprüfung | Messungen plus Bildprüfung, Selbstkorrektur bis 2 Runden                                     | Render-Mac plus Claude | –            |
| 9      | Übergabe         | Fertiges Video, Beschreibung, Hashtags, Protokoll                                            | Render-Mac             | Freigabe 3   |

Vor dem ersten Video eines neuen Kunden läuft **Gate 0**: Das System liest die Marke aus und zeigt Probebilder (Caption, Lower Third, Schlusskarte). Erst nach Freigabe wird das Profil benutzt.

**3. Pipeline im Detail**

**3.1 Ingest und Proxys**

- ffprobe liest Bildrate, Auflösung, Codec und Aufnahmedatum. **\[Wahrscheinlich\]** Log-Material erkennt das System am Farbprofil in den Metadaten und an flachem Kontrast im Bild.

- Aus dem 6K-Open-Gate-Material entsteht **eine** Arbeitskopie pro Clip: H.264, 25p, Hochformat-tauglicher Ausschnitt mit genug Reserve für Zoom (Vorschlag: mindestens 2160 Pixel Höhe beim 9:16-Ausschnitt). Das Original bleibt unberührt.

- Der Bildausschnitt aus dem Querformat (Gesichtsposition) wird automatisch auf das Gesicht gesetzt und lässt sich in der Freigabe 1 pro Clip verschieben.

- Clips mit 50p oder 60p werden als Zeitlupe-Kandidaten markiert und beim Einsetzen auf 25p verlangsamt (50p auf 50 Prozent, 60p auf etwa 42 Prozent).

**3.2 Transkription bei Dialekt**

**\[Sicher\]** Whisper large-v3 gibt Schweizerdeutsch als Hochdeutsch aus. Gemessene Fehlerraten liegen je nach Testset bei 23 bis 37 Prozent, dazu kommen erfundene Sätze (4 von 16 Gesprächen in einer Studie) und Fehler bei Namen und Zahlen. Auf Schweizerdeutsch nachtrainierte Modelle sind nur 2 bis 3 Prozentpunkte besser (25,6 gegen 28,6 Prozent).

- **\[Sicher\]** Das Ergebnis ist ein Entwurf, nicht die gesprochene Wortfolge. Wortgenaue Zeitstempel sind deshalb unsicher.

- **Vorgehen:** Das System nutzt die **Segmentzeiten** von Whisper (Satz oder Phrase) und verteilt die Skriptwörter proportional auf die Segmentdauer. Segmente über 4 Sekunden werden vorher geteilt. Diese Verteilung ist in einem Prototyp bereits gebaut und getestet.

- **\[Vermutung\]** Die Abweichung liegt dann bei etwa 0,1 bis 0,3 Sekunden. Das reicht für Captions mit zwei bis drei Wörtern. Test T2 prüft es an echten Clips.

- Fällt T2 durch, folgt ein Forced-Alignment-Schritt (Text gegen Audio ausrichten) oder ein anderes Modell.

**3.3 Skript-Zuordnung und Take-Auswahl**

Das Skript ist Wort für Wort geschrieben und liegt in Notion. Whisper liefert Hochdeutsch, das Skript ist Hochdeutsch. Das ist die Grundlage für die Zuordnung.

1.  Das Skript wird in Zeilen (ein Satz pro Zeile) zerlegt.

2.  Jede Zeile wird mit allen Whisper-Segmenten verglichen (unscharfer Textvergleich auf normalisierten Wörtern). Mehrere Treffer pro Zeile sind Wiederholungen, also Takes.

3.  Pro Zeile bewertet das System die Takes nach den Kriterien unten und schlägt den besten vor, dazu den zweitbesten.

4.  Segmente ohne Treffer (Gespräche zwischen Takes, «nochmal», Pannen) werden verworfen.

5.  Skriptzeilen ohne Treffer werden rot markiert («fehlt im Material»).

6.  Weicht ein gesprochener Satz vom Skript ab, entscheidet das System, ob die Abweichung sinnvoll ist (besser formuliert, Fehler im Skript, am Set bewusst geändert) und schreibt eine kurze Begründung dazu. Die Captions übernehmen dann den gesprochenen, bereinigten Text. Du kannst jede Entscheidung in Freigabe 1 überstimmen, und das zählt als Lernsignal.

**Kriterien für den besten Take** (Gewichte sind ein Vorschlag, **\[Vermutung\]**):

| **Kriterium**    | **Messung**                                               | **Gewicht** |
|------------------|-----------------------------------------------------------|-------------|
| Vollständig      | Satz endet, kein Abbruch, kein «nochmal» im Take          | 30 Prozent  |
| Keine Füllwörter | Anzahl «ähm», «äh», «also», «gäll» im Take                | 25 Prozent  |
| Flüssig          | Pausen im Satz, gleichmässiges Sprechtempo                | 20 Prozent  |
| Energie          | Lautstärke und Betonung im Vergleich zu den anderen Takes | 15 Prozent  |
| Späterer Take    | Bei Gleichstand gewinnt der spätere                       | 10 Prozent  |

- Ein Take mit Füllwort oder Abbruch scheidet aus. Bleibt nur ein solcher übrig, schneidet das System das Füllwort heraus und markiert die Stelle gelb.

- **\[Sicher\]** Claude hört nicht. Es bewertet Transkript und Messwerte. Ob ein Take überzeugend wirkt, beurteilt das System nicht. Deshalb zeigt Freigabe 1 pro Zeile die Top 2.

**3.4 Schnittregeln «Retention»**

| **Regel**             | **Startwert**                      | **Bemerkung**                          |
|-----------------------|------------------------------------|----------------------------------------|
| Pause zwischen Sätzen | höchstens 0,25 s                   | Einstellbar pro Video und Marke        |
| Bildwechsel           | spätestens alle 1,5 s              | Zoom-Wechsel, Effekt, B-Roll oder Foto |
| Zoom-Punch            | 1,1-fach bei jedem zweiten Schnitt | Federbewegung, 0,16 s                  |
| Caption-Seiten        | 2 bis 3 Wörter                     | Nach Satzende immer neue Seite         |
| Hook                  | in den ersten 2 s                  | Titelkarte oder starke Aussage         |
| Sprechtempo           | höchstens 4,8 Wörter pro Sekunde   | Sonst sind Captions schlecht lesbar    |
| Länge                 | höchstens 90 s                     | Reel-Grenze von Instagram              |

**\[Vermutung\]** Alle Startwerte sind geschätzt. Kalibriert werden sie mit den **Retention-Graphen** aus Instagram Insights: Von den letzten zehn Reels ein Screenshot pro Reel zeigt, bei welcher Sekunde das Publikum abspringt.

**3.5 Storyboard**

Claude erhält Skript mit Zeiten, Effektliste, Katalog und aktive Regeln. Es liefert einen Plan als JSON (Beispiel im Anhang) mit Hook, Effekten, B-Roll-Wahl, Betonungen und Begründung pro Eintrag.

- B-Roll darf **nur** aus dem Katalog kommen. Ein Eintrag, der keinen gültigen Katalog-Schlüssel hat, wird verworfen.

- Kein Overlay ohne Begründung. Der Plan ist freigegeben, wenn du ihn bestätigst, oder per Satz änderst («Hook kürzer», «B-Roll bei Sekunde 12 ersetzen»).

- Das Storyboard wird als Kontaktbogen (Standbilder pro Effekt) und als Liste gezeigt. Änderungen am Plan setzen die Freigabe zurück.

**3.6 Effekt-Bibliothek in drei Wellen**

Alle Effekte aus der Analyse kommen in den Plan. **\[Sicher\]** Jeder Effekt bekommt vor dem Bau ein **Datenblatt** (Vorlage im Anhang). Ohne Datenblatt wird kein Effekt gebaut.

| **Welle**  | **Effekte**                                                                                                                   | **Aufwand**                     | **Stand**                                |
|------------|-------------------------------------------------------------------------------------------------------------------------------|---------------------------------|------------------------------------------|
| 1 Basis    | Hook-Karte, Keyword-Pop, Lower Third, Checkliste, Balken-Wachstum, Zahl-Zähler, Vorher/Nachher, Spotlight, Schlusskarte (CTA) | **\[Vermutung\]** 4 bis 6 Tage  | Logik und Zeichnung im Prototyp getestet |
| 2 Erklären | Digital Zoom, Zoom Through Cut, Pullback Reveal, Headline Wall, Phone Mockup, UI World                                        | **\[Vermutung\]** 6 bis 8 Tage  | Datenblätter fehlen                      |
| 3 Show     | Orbit, Couch Wall, Frame Break, Green Screen, Paper Cut, Doodle Boy, Vertigo, Cover Story, Glass Type                         | **\[Vermutung\]** 8 bis 12 Tage | Datenblätter fehlen                      |

- **\[Wahrscheinlich\]** Effekte, die die Person vom Hintergrund lösen (Orbit, Couch Wall, Green Screen, Frame Break), brauchen einen Freisteller. Das ist ein eigener Baustein (Personen-Erkennung auf dem Mac). Er gehört in Welle 3 und macht sie aufwändiger.

- Neue Effekte aus der Praxis kommen als Ideen in eine Notion-Liste, nach dem Vorbild der Ideenbibliothek mit Freigabe aus der Analyse. Das System meldet Stellen im Skript, wo ein neuer Effekt besser erklären würde.

- **Einwand:** 26 Effekte auf einmal werden kaum alle zuverlässig laufen. Deshalb werden die Wellen nacheinander abgenommen. Das Risiko einer Parallelentwicklung sind viele halbfertige Effekte.

**3.7 B-Roll, Fotos und Katalog**

Es gibt mehrere hundert Videos und Fotos. Alles wird autonom benannt, ohne dass ihr etwas prüfen müsst, und alles darf immer genutzt werden.

1.  Der Render-Mac scannt den Ordner Bibliothek/ und zieht pro Clip drei verkleinerte Bilder (Anfang, Mitte, Ende) sowie die Metadaten: Dauer, Auflösung, Bildrate, Aufnahmedatum, Kamera, Log ja oder nein. Fotos liefern zusätzlich GPS und Aufnahmezeit.

2.  Claude beschreibt jede Datei: Motiv, Aktion, Stimmung, Licht, Kamerabewegung, Personen sichtbar, passende Einsatzfälle, die **besten Sekunden** (Ein- und Ausstieg) und Tags auf Deutsch.

3.  Ort und Kunde kommen aus dem Ordnernamen und GPS, nicht aus dem Raten. Eine Sicherheitsangabe pro Datei kennzeichnet unsichere Einträge.

4.  Das Ergebnis geht als Zeile in die Notion-Katalog-Datenbank. Originaldateien werden **nicht** umbenannt.

5.  Neue Dateien werden inkrementell nachgetragen. Korrigiert jemand einen Namen, wird der Eintrag überschrieben und als Regel gemerkt.

**\[Wahrscheinlich\]** Eine einmalige Benennung von 300 Clips mit je drei Bildern liegt grob bei einer halben Million Token. Das ist eine Schätzung und wird in Phase 1 an 20 Dateien gemessen.

**Katalog-Felder:**

| **Feld**                      | **Inhalt**                                        | **Quelle**                 |
|-------------------------------|---------------------------------------------------|----------------------------|
| Schlüssel                     | Eindeutige ID                                     | System                     |
| Pfad                          | Relativ zu Studio/                                | Scan                       |
| Titel                         | Kurzname nach Schema Kunde_Ort_Motiv_Aktion_Datum | Claude plus Ordner und GPS |
| Beschreibung                  | Ein bis zwei Sätze                                | Claude                     |
| Tags                          | Deutsche Stichworte                               | Claude                     |
| Dauer, Bildrate, Orientierung | Hoch oder quer, 25p, 50p, 60p                     | Metadaten                  |
| Zeitlupe                      | Ja bei 50p oder 60p                               | Metadaten                  |
| Log                           | Ja oder nein                                      | Metadaten und Bildanalyse  |
| Beste Sekunden                | Ein- und Ausstieg                                 | Claude                     |
| Personen sichtbar             | Ja oder nein                                      | Claude                     |
| Freigabe                      | Standard «alles erlaubt»                          | Festlegung                 |
| Sicherheit                    | Hoch, mittel oder niedrig                         | Claude                     |
| Zuletzt genutzt               | Datum und Projekt                                 | System                     |

**Auswahl im Storyboard:** Claude wählt nach Beschreibung und Tags, Orientierung, Dauer (mindestens so lang wie das Overlay), Zeitlupe nur bei Bedarf, nicht zweimal im selben Video und nicht im letzten Video derselben Marke. Fotos erhalten eine langsame Kamerabewegung (Ken Burns).

**\[Sicher\]** Die Freigabe-Spalte steht auf «alles erlaubt». Die rechtliche Verantwortung für erkennbare Personen und Kundenmaterial liegt bei Alperna.

**3.8 Ton**

- **Stimme:** Der Ton ist laut dir gut. Das System gleicht nur die Lautheit an (Ziel −14 LUFS, **\[Wahrscheinlich\]** üblicher Wert für Social Media). Rauschentfernung ist ein Schalter, standardmässig aus.

- **Soundeffekte:** Zuerst werden sie im Code erzeugt (Whoosh, Hit, Pop, Tick, Riser). Eure Sample-Bibliothek kommt später und wird wie B-Roll benannt. Das System setzt höchstens einen Effekt pro 2 Sekunden und nur zu Grafiken. Die Dichte gehört ins Markenprofil.

- **Musik:** Optional. Wenn vorhanden, senkt das System sie unter der Stimme ab und rastet Schnitte auf Beats ein. **\[Sicher\]** Musik aus der Instagram-Bibliothek lässt sich nicht ins Video einbauen.

**3.9 Color Grading (später)**

Der Look wird später festgelegt. Der Plan hält den Platz frei:

- Das Markenprofil enthält ein Feld «Look» (LUT-Datei oder Parameter).

- Beim Ingest wird Log erkannt und die Konvertierung nach Rec.709 vorbereitet (mit der offiziellen Kamera-LUT als Basis).

- In Phase 5 kommen Look-Varianten pro Marke und die Angleichung der Clips untereinander hinzu.

**3.10 Qualitätsprüfung mit Selbstkorrektur**

| **Prüfung**     | **Messung**                            | **Grenzwert**                                                               | **Korrektur**                |
|-----------------|----------------------------------------|-----------------------------------------------------------------------------|------------------------------|
| Hook            | Titel oder starke Aussage              | in den ersten 2 s                                                           | Hook-Karte setzen            |
| Standbild       | Zeit ohne Bildwechsel                  | höchstens 1,5 s                                                             | Zoom-Wechsel oder B-Roll     |
| Skriptabdeckung | Alle Skriptzeilen im Video             | 100 Prozent                                                                 | Meldung, keine Korrektur     |
| Captions        | Lesbarkeit und Sicherheitsrand         | Kontrast, freier Rand unten und rechts (etwa 20 Prozent, **\[Vermutung\]**) | Position und Grösse anpassen |
| Tonpegel        | Lautheit und Spitzen                   | −14 LUFS, keine Übersteuerung                                               | Neu aussteuern               |
| Farbsprünge     | Helligkeit und Farbe zwischen Clips    | Abweichung nahe Null                                                        | Angleichen (ab Phase 5)      |
| Länge           | Gesamtdauer                            | höchstens 90 s                                                              | Meldung                      |
| Bildprüfung     | Claude schaut 8 bis 12 Einzelbilder an | Text abgeschnitten, Überlappung, unruhiger Hintergrund                      | Meldung mit Zeitpunkt        |

- **Selbstkorrektur:** Bei messbaren Mängeln korrigiert das System und rendert neu, höchstens zwei Runden. Bei Geschmacksfragen meldet es nur.

- Jede Runde steht im Protokoll (qa-bericht.md): was gefunden, was geändert, was offen blieb.

- **\[Sicher\]** Die Prüfung ersetzt deinen Blick in Freigabe 3 nicht, sie spart ihn nur für die wichtigen Dinge.

**3.11 Export, Beschreibung und Hashtags**

| **Eigenschaft**      | **Wert**                                                                                                                             |
|----------------------|--------------------------------------------------------------------------------------------------------------------------------------|
| Auflösung und Format | 1080×1920 (9:16), progressiv, 4:2:0                                                                                                  |
| Bildrate             | 25p. **\[Vermutung\]** Instagram nimmt 25 fps an. Die Quellen widersprechen sich, Test T4 klärt es.                                  |
| Codec                | H.264 High, AAC, 48 kHz, 128 bis 192 kbit/s                                                                                          |
| Bitrate              | 8 bis 10 Mbit/s. Instagram erlaubt laut den Quellen bis 25 Mbit/s, kontrollierte Werte wirken nach der Nachkompression oft schärfer. |
| Länge                | 3 bis 90 Sekunden                                                                                                                    |
| Dateigrösse          | höchstens 1 GB                                                                                                                       |
| Beschreibung         | Aus Skript, Tonalität der Marke und aktiven Regeln. Datei beschreibung.md.                                                           |
| Hashtags             | Anzahl und feste Hashtags pro Marke einstellbar. Datei beschreibung.md.                                                              |

**4. Markenprofile**

Jede Marke hat ein Profil in Notion. Alperna ist eines davon. Beim ersten Video eines Kunden liest das System die Daten aus der Website oder dem Brandbook aus und legt das Profil an.

| **Feld**       | **Inhalt**                                                                             | **Quelle**                    |
|----------------|----------------------------------------------------------------------------------------|-------------------------------|
| Farben         | Hintergrund, Text, Akzent 1, Akzent 2                                                  | Website, Brandbook, Logo      |
| Schriften      | Titel und Fliesstext                                                                   | Website, Brandbook            |
| Logo           | Datei, helle und dunkle Variante                                                       | Website, Brandbook            |
| Caption-Preset | Schrift, Grösse, Position, Animation, Hervorhebung, Grossschreibung, Kasten oder nicht | Vorschlag des Systems, Gate 0 |
| Effekt-Stil    | Eckenradius, Schatten, Bewegungstempo                                                  | Abgeleitet aus der Marke      |
| Tonalität      | Anrede, Wortwahl, verbotene Wörter                                                     | Website, Gespräch             |
| Ton            | SFX-Dichte, Musik ja oder nein                                                         | Vorgabe                       |
| Look           | LUT oder Parameter                                                                     | Später                        |
| Schlusskarte   | Text, Handle, Logo                                                                     | Vorgabe                       |
| Hashtags       | Feste Hashtags, Anzahl                                                                 | Vorgabe                       |

- **\[Vermutung\]** Websites liefern Farben und Schriften meist zuverlässig, Logos in guter Qualität und Tonalität weniger. Gate 0 fängt das ab.

- Für Alperna fehlen noch die genauen Hex-Werte für Deep Black und Violett-Blau. Der Akzent ist Gelb \#FFC629.

**5. Lernsystem**

**\[Sicher\]** Es ist ein Regelgedächtnis und kein Training des Modells.

1.  **Erfassen:** Alle Eingriffe im Prüfplatz werden protokolliert: gelöschtes Overlay, verschobener Zeitpunkt, anderer Take, geänderter Text, abgewähltes B-Roll. Auch Unverändertes zählt als Signal («es blieb, also passt es»). Dazu ein Freitextfeld «Das gefällt mir nicht, weil …».

2.  **Vorschlagen:** Auf Knopfdruck («Regeln aus diesem Video ableiten») fasst Claude die Ereignisse zu Regelvorschlägen zusammen, jeweils mit Beleg.

3.  **Freigeben:** Jede Person im Team darf freigeben. Eine Regel ist erst danach aktiv.

4.  **Anwenden:** Aktive Regeln gehen in jeden Storyboard-Prompt. Zahlenwerte (Pausenlänge, Zoom-Tempo, SFX-Dichte) werden direkt als Voreinstellung gesetzt.

| **Feld einer Regel** | **Inhalt**                                                                          |
|----------------------|-------------------------------------------------------------------------------------|
| Text                 | Kurze Anweisung, z. B. «Bei Zahlen die Zahl-Zähler-Grafik statt Keyword-Pop nutzen» |
| Typ                  | Handwerk (gilt überall) oder Optik (an die Marke gebunden)                          |
| Geltung              | Vorerst alle Videos                                                                 |
| Status               | Vorschlag, aktiv, pausiert, verworfen                                               |
| Beleg                | Anzahl und Verweise auf die Ereignisse                                              |
| Freigabe             | Wer, wann                                                                           |

- **Handwerk gegen Optik:** Eine Regel wie «Captions gelb» soll nicht in ein Kundenvideo wandern. Claude ordnet jeden Vorschlag ein, du kannst die Einordnung ändern.

- **Grenzen:** Höchstens etwa 30 aktive Regeln, eine Konfliktprüfung vor jeder Freigabe und eine Übersicht zum Pausieren und Löschen.

- **\[Sicher\]** Jeder Vorschlag kostet einen Claude-Aufruf. Er läuft nur auf Knopfdruck, nie im Hintergrund.

- **\[Wahrscheinlich\]** Mit Unverändertem als Signal braucht das System mehr Videos, bis Regeln stabil sind, lernt aber vorsichtiger.

**6. Daten in Notion**

| **Datenbank** | **Inhalt**                       | **Wichtigste Felder**                   |
|---------------|----------------------------------|-----------------------------------------|
| Projekte      | Ein Eintrag pro Video mit Status | Marke, Titel, Status, Ordnerpfad, Datum |
| Skripte       | Skript pro Projekt               | Projekt, Text, Version                  |
| Markenprofile | Ein Eintrag pro Marke            | siehe Kapitel 4                         |
| Katalog       | B-Roll, Fotos, Sounds            | siehe Abschnitt 3.7                     |
| Regeln        | Gelernte Regeln                  | siehe Kapitel 5                         |
| Ereignisse    | Eingriffe pro Video              | Projekt, Stufe, Art, Detail, Zeit       |

- **\[Wahrscheinlich\]** Notion begrenzt die Zahl der Anfragen pro Sekunde. Der Render-Mac lädt deshalb vor jedem Lauf eine lokale Kopie von Katalog, Regeln und Markenprofil und fragt nicht live ab.

- Zwei Personen schreiben nie in dasselbe Feld gleichzeitig: Statusfelder gehören der Pipeline, Freigabefelder den Menschen.

- Später zieht das Skript in euer eigenes Tool um. Die Datenbanken sind so geschnitten, dass das ohne Umbau geht.

**7. Roadmap**

**\[Vermutung\]** Die Aufwände sind Personentage und geschätzt. Wie viele Wochen daraus werden, hängt davon ab, wie viele Stunden pro Woche ihr investiert. Diese Angabe fehlt noch.

| **Phase**             | **Inhalt**                                                                                                                                                                  | **Abnahme**                                                      | **Aufwand** |
|-----------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------|-------------|
| 0 Tests               | Sechs Tests T1 bis T6 (siehe unten)                                                                                                                                         | Alle Tests bestanden oder Plan angepasst                         | 3 bis 4     |
| 1 Fundament           | Notion-Datenbanken, Markenprofil Alperna und ein Kundenprofil, Katalog aufbauen und benennen, Ordnerstruktur                                                                | Katalog durchsuchbar, Gate 0 funktioniert                        | 4 bis 6     |
| 2 Durchstich          | Ein Reel von Rohmaterial bis fertig: Ingest, Transkription, Skript-Zuordnung, Schnitt, Captions, Zoom, Basis-Effekte (Welle 1), Freigaben, Export. Lernprotokoll läuft mit. | Echtes Reel veröffentlichbar nach höchstens zwei Korrekturrunden | 8 bis 12    |
| 3 Optik               | Effekte Welle 2 und 3, Soundeffekte, B-Roll-Auswahl, Motion Graphics                                                                                                        | Je Welle ein Testreel                                            | 10 bis 15   |
| 4 Qualität und Lernen | Qualitätsprüfung mit Selbstkorrektur, Beschreibung und Hashtags, Regelvorschläge                                                                                            | Zehn Reels ohne Eingriff bei messbaren Mängeln                   | 5 bis 8     |
| 5 Später              | Color Grading, zweite Kamera, Musik-Beats, Automatisierung per Watcher                                                                                                      | Je nach Baustein                                                 | 6 bis 10    |

**Phase 0: die sechs Tests**

| **Test** | **Was**                                                                           | **Erfolg**                                                                       | **Folge bei Misserfolg**             |
|----------|-----------------------------------------------------------------------------------|----------------------------------------------------------------------------------|--------------------------------------|
| T1       | HyperFrames rendert 10 Sekunden mit Captions, Zoom und einem Effekt auf M4 und M5 | Läuft, höchstens 3-fache Echtzeit, Bild korrekt                                  | Remotion statt HyperFrames           |
| T2       | Whisper mit Schweizerdeutsch-Modell auf 3 echten Clips                            | Skriptzeilen zu mindestens 95 Prozent zugeordnet, Zeitabweichung höchstens 0,3 s | Forced Alignment oder anderes Modell |
| T3       | Artifact liest ein Skript aus Notion und schreibt eine Regel zurück               | Beides funktioniert bei beiden Personen                                          | Freigaben direkt in Notion           |
| T4       | Privater Instagram-Upload: gleiches Reel in 25p und 30p                           | Kein sichtbares Ruckeln bei 25p                                                  | Export in 30p                        |
| T5       | OneDrive: Rendern von Dateien mit «immer behalten»                                | Keine Wartezeit durch Downloads                                                  | Material vorher lokal kopieren       |
| T6       | Take-Auswahl: System gegen deine Wahl auf einem echten Projekt                    | Mindestens 80 Prozent Übereinstimmung                                            | Kriterien und Gewichte anpassen      |

Das echte Testprojekt (drei Clips plus Skript, mit Dialekt und B-Roll) wird für Phase 0 gebraucht und am Schluss der Planung gewählt.

**8. Kosten und Lizenzen**

- **\[Sicher\]** **HyperFrames:** Apache 2.0, keine Gebühren pro Render und keine Schwellen. Rendern über Chrome und FFmpeg. Apple Silicon wird in der Dokumentation nicht ausdrücklich genannt (Test T1).

- **\[Sicher\]** **Remotion:** Kostenlos bis 3 Personen in der Firma. Ab 4 Personen 25 US-Dollar pro Monat und Platz für alle, die Remotion-Code schreiben (auch mit KI-Hilfe), oder 0,01 US-Dollar pro Render bei mindestens 100 US-Dollar im Monat. Bei Wachstum oder mitarbeitenden Freelancern ist die Grenze schnell erreicht.

- **Whisper:** Läuft lokal ohne Kosten. **\[Vermutung\]** ElevenLabs wurde für Schweizerdeutsch nicht belegt und bleibt draussen.

- **Claude:** Die Aufrufe laufen über das Claude-Konto der Person, die sie auslöst. Pro Reel fallen an: Storyboard, Bildprüfung, Beschreibung, bei Bedarf Regelvorschläge. Einmalig kommt die Benennung der Bibliothek dazu.

- **OneDrive:** **\[Vermutung\]** Der Speicherbedarf für 6K-Log-Material, Proxys und B-Roll ist gross. Der freie Speicher auf dem Render-Mac muss geprüft werden.

**9. Risiken**

| **Risiko**                                           | **Stufe** | **Gegenmassnahme**                                                                                                       |
|------------------------------------------------------|-----------|--------------------------------------------------------------------------------------------------------------------------|
| Dialekt: Whisper formuliert um, Wortzeiten ungenau   | Hoch      | Skript als Anker, Segmentzeiten, proportionale Verteilung. Test T2.                                                      |
| Alles ist halb fertig: zu viele Effekte gleichzeitig | Hoch      | Drei Wellen, Datenblatt vor Bau, Abnahme pro Welle.                                                                      |
| Falsche Benennung führt zu falscher B-Roll           | Mittel    | Sicherheitsangabe, Freigabe 2 zeigt jede Wahl, Korrektur wird gemerkt.                                                   |
| Regeln wuchern oder widersprechen sich               | Mittel    | Limit von 30 aktiven Regeln, Konfliktprüfung, Pausieren.                                                                 |
| Instagram kodiert 25p neu und es ruckelt             | Mittel    | Test T4, Alternative 30p.                                                                                                |
| Notion zu langsam oder Anbindung scheitert           | Mittel    | Lokale Kopie vor jedem Lauf. Test T3. Freigaben notfalls in Notion.                                                      |
| OneDrive-Platzhalter blockieren das Rendern          | Mittel    | «Immer lokal behalten» auf dem Render-Mac. Test T5.                                                                      |
| Ein Render-Rechner fällt aus                         | Mittel    | Zweiter Mac ist Reserve, Pipeline ist auf beiden lauffähig.                                                              |
| HyperFrames ist jung                                 | Mittel    | Remotion als Plan B, Effekte als eigene Module, die in beiden laufen.                                                    |
| Marken-Auslesen liefert schlechte Logos oder Farben  | Niedrig   | Gate 0 mit Probebildern.                                                                                                 |
| Rechtliches bei Personen und Kundenmaterial          | Mittel    | **\[Sicher\]** Verantwortung liegt bei Alperna. Das Feld «Freigabe» bleibt im Katalog und lässt sich später einschalten. |

**10. Offene Punkte**

1.  Hex-Werte für Deep Black und Violett-Blau liefern.

2.  Look für das Color Grading festlegen (später).

3.  Stunden pro Woche nennen, die ihr in den Bau steckt.

4.  Ein bis zwei Instagram-Accounts oder Reels nennen, deren Captions und Optik ihr mögt.

5.  Screenshots der Retention-Graphen der letzten zehn Reels bereitstellen.

6.  Eure Sample-Bibliothek hochladen, sobald sie bereit ist.

7.  Testprojekt wählen: drei Clips, Skript, Dialekt, B-Roll.

8.  Bestätigen, dass Regeln in «Handwerk» und «Optik» getrennt werden, und dass Rauschentfernung standardmässig aus bleibt.

9.  Klären, dass beide Personen Notion in Claude verbunden haben (für Test T3).

**Anhang A: Beispiele**

**A1 Storyboard-Plan (Ausschnitt)**

> {
>
> "hook": "Warum deine Website Kunden verliert",
>
> "overlays": \[
>
> { "effekt": "hook", "t": 0.2, "dauer": 2.0,
>
> "params": { "text": "Warum deine Website Kunden verliert" },
>
> "begruendung": "Nutzen in den ersten 2 Sekunden nennen" },
>
> { "effekt": "zahl-zaehler", "t": 6.4, "dauer": 2.6,
>
> "params": { "wert": 7, "suffix": " von 10", "label": "laden zu langsam" },
>
> "begruendung": "Kennzahl im Skript, Zahl wirkt stärker als Wort" },
>
> { "effekt": "broll", "t": 9.8, "dauer": 1.5,
>
> "params": { "katalog": "k-0142" },
>
> "begruendung": "Zeigt die Aussage, bringt Bildwechsel" }
>
> \],
>
> "betonung": \[12, 40, 57\],
>
> "notiz": "Ein Satz zur Gesamtidee"
>
> }

**A2 Katalog-Eintrag**

> schluessel: k-0142
>
> pfad: Bibliothek/B-Roll/2026-09/A7C_0412.mov
>
> titel: Intern_Gossau_Laptop_Tippen_2026-09-12
>
> beschreibung: Nahaufnahme Hände auf Laptop-Tastatur, warmes Licht, ruhige Kamera.
>
> tags: Laptop, Tippen, Büro, Arbeit, Nahaufnahme
>
> dauer: 8.4 bildrate: 50p zeitlupe: ja orientierung: quer log: ja
>
> beste_sekunden: 1.2 bis 5.0
>
> personen: nein freigabe: alles erlaubt sicherheit: hoch

**A3 Datenblatt eines Effekts**

| **Feld**           | **Inhalt**                                   |
|--------------------|----------------------------------------------|
| Name               | z\. B. Zahl-Zähler                           |
| Zweck              | Eine Kennzahl hervorheben                    |
| Auslöser im Skript | Zahl im Satz, Vergleich, Anteil              |
| Parameter          | Wert, Präfix, Suffix, Label                  |
| Dauer              | Standard und erlaubter Bereich               |
| Markenvariablen    | Farben, Schrift, Eckenradius, Bewegungstempo |
| Passt zu Videotyp  | Erklärvideo, Talking Head, Projektvideo      |
| Braucht            | z\. B. Freisteller, B-Roll, nichts           |
| Aufwand            | Klein, mittel, gross                         |
| Abnahme            | Wie wir prüfen, dass er fertig ist           |

**A4 Regel**

> text: Bei Zahlen im Skript den Zahl-Zähler statt Keyword-Pop nutzen.
>
> typ: Handwerk
>
> geltung: alle Videos
>
> status: aktiv
>
> beleg: 5 Löschungen von Keyword-Pop bei Zahlen (Projekte P-014, P-017, P-019)
>
> freigabe: Andrej, 2026-11-03
