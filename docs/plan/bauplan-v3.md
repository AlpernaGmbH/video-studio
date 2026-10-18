**Content-System**

Bauplan Version 3 für Alperna

Stand 17.10.2026 · gemeinsam ausgearbeitet mit Andrej · erweitert Version 2 vom 16.10.2026

**0. Kurzfassung**

Aus dem Video-Editing-System wird ein Content-System. Jede Idee, ob Reel, Carousel, LinkedIn-Post, Blogartikel oder Google-Maps-Beitrag, läuft durch dasselbe Rückgrat: Idee, Freigabe, Produktion, Freigabe, Veröffentlichung, Auswertung, Lernen. Das Videosystem aus Version 2 bleibt als Modul «Reel» bestehen und bekommt einen Editor mit Zeitleiste, in dem ihr Fehler markiert. Was in Notion schon läuft (LinkedIn-Cockpit, Blog, Viral Watcher), wird angeschlossen und nicht neu gebaut.

**Geltung:** Version 3 gilt zusätzlich zu Version 2. Die Kapitel 3 (Pipeline), 4 (Markenprofile) und 5 (Lernsystem) von Version 2 bleiben gültig, soweit Kapitel 1.2 sie nicht ändert. Bei Widerspruch gilt Version 3.

**Drei unbequeme Wahrheiten, die den Plan prägen:**

1.  **\[Sicher\]** Der Umfang wächst, der schwierigste Teil ist unbewiesen. Phase 0 (Tests T1 bis T6) ist nicht gelaufen, es gibt kein Reel von Rohmaterial bis Export, und von neun Effekten der Welle 1 steht einer. Darum baut dieser Plan zuerst das Rückgrat und genau ein Reel, danach die anderen Formate als Module.

2.  **\[Sicher\]** Ihr habt heute zwei Datenwelten: Content-Ideen mit Cockpit und Viral Watcher, und das neue Video-Studio. Eine dritte, gemeinsame Datenbank (so entschieden) löst das nur, wenn der Umzug mit festem Stichtag passiert. Sonst gibt es zwei Wahrheiten und der LinkedIn-Montagsablauf bricht.

3.  **\[Sicher\]** Der Editor läuft lokal auf dem Mac (so entschieden). Das ist der einfachere Anfang, aber nur an einem Rechner nutzbar. Leander kann von seinem Gerät aus nicht markieren, bis es eine Browser-Variante gibt.

**\[Vermutung\]** Der Gesamtaufwand liegt bei grob 55 bis 90 Personentagen (Version 2 allein: 40 bis 60). Phase 0 macht die Schätzung belastbar.

**1. Entscheidungsprotokoll**

**1.1 Neu seit Version 2**

| **Thema**             | **Entscheidung**                                                                                                                                             | **Status**  |
|-----------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------|
| Umfang                | Ein System für alle Inhalte: Reels und Videos, Carousels, LinkedIn, Blog, Google-Maps-Beiträge und weitere.                                                  | Entschieden |
| Reihenfolge           | Zuerst Rückgrat und ein Reel von Anfang bis Ende, danach die anderen Formate als Module.                                                                     | Entschieden |
| Ideen-Datenbank       | Eine neue gemeinsame Datenbank «Inhalte». Content-Ideen wird in sie umgezogen (Kapitel 8).                                                                   | Entschieden |
| Ideen-System          | Freigabestufe für Ideen, Anhänge (bei Reels Videodateien), Zugriff der KI auf Fotos, B-Roll und alle Effekte. Automationen für Ideen-Scraping kommen später. | Entschieden |
| Editor mit Zeitleiste | Eigene lokale Editor-Seite auf dem Mac. Ihr markiert, was nicht stimmt, und korrigiert einzelne Stellen von Hand.                                            | Entschieden |
| Marke gegen Tempo     | Die Marke gilt (Design System, ruhig). Der Schnittstil steht als eigenes Feld im Markenprofil.                                                               | Entschieden |
| Start                 | Erst an einem Computer. Ein zweiter Rechner und Leander kommen danach.                                                                                       | Entschieden |
| Prüfplatz             | Die Freigabe in Notion funktioniert (von dir getestet). Handy, Safari und Leanders Zugang sind damit nicht belegt.                                           | Annahme     |
| Wer gibt Ideen frei   | Jede Person im Team, wie bei den Regeln.                                                                                                                     | Annahme     |

**1.2 Was Version 3 an Version 2 ändert**

| **Stelle in Version 2**         | **Alt**                                                   | **Neu**                                                                                                                                                           |
|---------------------------------|-----------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Kapitel 4, Farben Alperna       | Deep Black, Violett-Blau, Gelb \#FFC629 (Platzhalter)     | Design System, zweite Fassung: Hintergrund \#26324A, Text \#FDFBFB, Gold \#FFD700, Höhenblau \#2B3A5A, Poppins und Montserrat. Gate 0 für Alperna ist noch offen. |
| Kapitel 4, Markenprofil         | Kein Schnittstil                                          | Neues Feld «Schnittprofil» (Abschnitt 9.1)                                                                                                                        |
| Kapitel 5, Regeln               | Gelten für alle Videos                                    | Gelten je Format. Ein Feld «Format» trennt Reel, Carousel und Text.                                                                                               |
| Kapitel 6, Datenbank «Projekte» | Ein Eintrag pro Video                                     | Entfällt. Ein Reel ist ein Eintrag in «Inhalte» mit Format Reel.                                                                                                  |
| Abschnitt 3.3, Skript-Abgleich  | Erwähnt einen vorhandenen Prototyp für die Wortverteilung | Falsch. Im Repo existiert der Skript-Abgleich nicht. Er wird in Phase 2 gebaut. Mein früherer Prototyp wurde nie übergeben.                                       |
| Kapitel 3.6, Overlay-Rendering  | Ein Overlay gleich eine Datei                             | Offen als Test T1b: eine WebM-Datei je Overlay oder eine Komposition für alle (Abschnitt 10.2).                                                                   |
| Kapitel 10, Offene Punkte       | Hex-Werte, Look, Stunden und weitere                      | Hex-Werte erledigt. Rest in Kapitel 13.                                                                                                                           |

**2. Bestandsaufnahme: was es schon gibt**

Ich habe das Notion-Konto und das Repo video-studio (Stand 17.10.2026, 361 Tests grün) nur gelesen, nichts verändert.

| **Baustein**                            | **Heute**                                                                                                                                                                                                                           | **In Version 3**                                                                                         |
|-----------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------|
| Content-Ideen (Notion)                  | **\[Sicher\]** Pipeline mit Status Neu, Bereit, Zur Freigabe, Freigegeben, Geplant, Gepostet, Verworfen. Felder: Hook, Winkel, Profil, Plattform (LinkedIn, Instagram), Publishing (Auto, Paket, Manuell), Quelle, Referenz, Batch. | Zieht in «Inhalte» um, danach nur noch lesbar als Archiv.                                                |
| Viral Watcher LinkedIn und Instagram    | **\[Sicher\]** Erscheinen als Quelle in Content-Ideen. **\[Vermutung\]** Eine Automation schreibt dort Ideen hinein, ich habe den Mechanismus nicht geprüft.                                                                        | Schreibt künftig in «Inhalte» (Umhängen, Kapitel 8).                                                     |
| LinkedIn-Cockpit                        | **\[Sicher\]** Rohstoff-Speicher, Beiträge-Archiv mit Analytics, Wochen-Analytics, Engagement-Bank, Viral-Vorlagen-Bibliothek, Regel «Kein Post ohne Rohstoff».                                                                     | Bleibt unverändert. «Inhalte» verweist auf Rohstoff und Beitrag.                                         |
| Taplio                                  | **\[Sicher\]** Anbindung vorhanden: Entwurf, Planen, Veröffentlichen, Inspirationssuche, Analytics.                                                                                                                                 | Veröffentlichungsweg für LinkedIn.                                                                       |
| Blog Content (Framer)                   | **\[Sicher\]** Titel, Slug, Beschreibung, Kategorie, Fokus-Keyword, Status Entwurf, Freigegeben, Live. Das Bild wird von Hand in Framer ergänzt.                                                                                    | Bleibt als Ablage des Blogs. «Inhalte» verweist darauf.                                                  |
| Beitragsideen LinkedIn (Datenbank)      | **\[Sicher\]** Nur ein Namensfeld, wenige Zeilen aus dem Juli.                                                                                                                                                                      | Wird archiviert. Löschen nur mit deinem Ja.                                                              |
| Repo: Motion-Werkstatt                  | **\[Sicher\]** Eigene Datenbank «Ideen» für Motion-Stücke mit Zustandsautomat, drei Looks, Abnahme. Bibliothek mit einem geprüften Stück.                                                                                           | Wird zu «Motion-Ideen» umbenannt. Bleibt getrennt, denn es sind Bauaufträge für Grafiken, keine Inhalte. |
| Repo: Prüfplatz                         | **\[Sicher\]** Artifact mit Karten für Pitch, Looks, Abnahme. Liest die Zeile vor dem Schreiben frisch, überschreibt keinen Entscheid.                                                                                              | Wächst um Karten für Ideen, Entwürfe, Reel-Stufen und Gate 0.                                            |
| Google Maps, Instagram-Veröffentlichung | **\[Sicher\]** Kein Connector in dieser Sitzung.                                                                                                                                                                                    | Betriebsart «Paket»: Claude liefert alles, ein Mensch postet.                                            |

**Leitgedanke:** «Inhalte» ist die Pipeline-Sicht (wo steht welche Idee). Die Ziel-Datenbanken (Beiträge-Archiv, Blog Content) bleiben die Ablage und die Zahlen. Dadurch braucht der Umzug nur Ideen, nicht das ganze Marketing.

**3. Das Rückgrat**

**3.1 Lebenslauf eines Inhalts**

> Idee: NEU -\> PITCH BEREIT -\> \[Tor I\] -\> IN PRODUKTION
>
> Produkt: IN PRODUKTION -\> ENTWURF FERTIG -\> \[Tor P\] -\> FREIGEGEBEN
>
> Ausspielen: FREIGEGEBEN -\> GEPLANT -\> VERÖFFENTLICHT -\> AUSGEWERTET -\> Lernen
>
> Abzweige: Tor I abgelehnt -\> VERWORFEN (mit Grund)
>
> Tor P Änderung -\> zurück zu IN PRODUKTION (mit Markierungen)
>
> Jederzeit -\> PAUSIERT oder VERWORFEN (mit Grund)

| **Tor**         | **Wer entscheidet**                                              | **Prüft der Code vorher**                                                                                        |
|-----------------|------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------|
| Tor 0 Marke     | Mensch, einmal pro Marke und Kunde                               | Markenprofil vollständig, Probebilder gezeigt                                                                    |
| Tor I Idee      | Mensch, im Prüfplatz                                             | Format, Hook, Winkel, Beleg, Marke gesetzt. Kein gleicher Fakt in den letzten 90 Tagen. Ablehnung nur mit Grund. |
| Tor P Produkt   | Mensch, im Prüfplatz                                             | Textprüfung bestanden, keine offene Markierung der Schwere «muss». Bei Reels die Stufen 1 bis 3 aus Version 2.   |
| Veröffentlichen | Auto: Claude über Taplio nach Tor P. Paket oder Manuell: Mensch. | Nur Freigegebenes. Datum und Plattform gesetzt.                                                                  |

- **Harte Regel aus dem Repo, jetzt für alles:** Claude schreibt nie in Entscheidfelder. Tor I, Tor P und Tor 0 gehören Menschen und laufen über den Prüfplatz.

- **\[Sicher\]** Der Name beim Entscheid ist keine Anmeldung. Echten Schutz bieten nur die Rechte in Notion und im Artifact.

- **\[Wahrscheinlich\]** Für Textformate braucht es keinen Mac. Claude in claude.ai schreibt Entwürfe direkt in die Notion-Seite des Eintrags. Nur Reels und Carousels brauchen den Render-Mac.

**3.2 Die Datenbank «Inhalte»**

| **Feld**                         | **Inhalt**                                                                            | **Schreibt**              | **Hinweis**                         |
|----------------------------------|---------------------------------------------------------------------------------------|---------------------------|-------------------------------------|
| Titel, Inhalt-ID                 | Arbeitstitel, Kennung c-0001                                                          | Claude                    | ID ist der Schlüssel                |
| Format                           | Reel, Carousel, LinkedIn-Post, Blog, Google-Maps-Beitrag, Story, Sonstiges, ungeklärt | Claude, Mensch            | Steuert Modul und Regeln            |
| Plattformen                      | Mehrfachauswahl: Instagram, LinkedIn, Blog, Google, weitere                           | Claude, Mensch            |                                     |
| Marke                            | Verweis auf Markenprofil (Alperna oder Kunde)                                         | Claude, Mensch            | Pflicht                             |
| Profil                           | Andrej, Leander, Alperna, Kunde                                                       | Claude, Mensch            | Aus Content-Ideen übernommen        |
| Quelle, Referenz                 | Viral Watcher, Manuell, Rohstoff, Kundenwunsch, Scraping, Performance; Link           | Claude, Automation        | Quelle ist Pflicht                  |
| Hook, Winkel                     | Erster Satz und Blickwinkel                                                           | Claude, Mensch            | Pflicht bei Tor I                   |
| Beleg                            | Echter Fakt, echte Zahl oder Erlebnis. Bei LinkedIn Verweis auf Rohstoff-Speicher.    | Claude, Mensch            | Keine Zahl ohne Quelle              |
| Status                           | Siehe Lebenslauf                                                                      | Claude (Übergangsprüfung) |                                     |
| Tor I: Entscheid, Grund, von, am | offen, freigegeben, abgelehnt                                                         | nur Prüfplatz             | Claude setzt höchstens «offen»      |
| Tor P: Entscheid, Grund, von, am | offen, freigegeben, Änderung                                                          | nur Prüfplatz             |                                     |
| Dateien                          | Pfad im Studio-Ordner auf OneDrive                                                    | Claude                    | Ordner entsteht beim Start          |
| Ziel                             | Verweis auf Beitrag, Blog-Eintrag oder Taplio-Entwurf                                 | Claude                    |                                     |
| Publishing, Geplant für, Batch   | Auto, Paket, Manuell; Datum; Wochenpaket                                              | Claude, Mensch            | Aus Content-Ideen                   |
| Seitentext                       | Pitch, Skript oder Entwurf, Begründungen, Verlauf                                     | Claude                    | Bei Textformaten der Entwurf selbst |

- **\[Wahrscheinlich\]** Die Wahrheit liegt für Inhalte in Notion (anders als bei Motion-Ideen, wo eine JSON-Datei gilt), weil Viral Watcher, Automationen und Menschen von mehreren Orten schreiben und Textformate keinen Mac brauchen.

- **\[Sicher\]** Notion erzwingt keine Übergangsregeln. Darum liest der Code bei jedem Lauf die Zeilen, prüft die Übergänge und meldet Abweichungen. Eine unerlaubte Änderung wird zurückgesetzt, nicht übernommen.

**3.3 Ideen mit Anhängen**

Bei einem Reel sind Videodateien Teil der Idee. Der Prüfplatz kann nicht auf OneDrive schreiben. Darum so:

1.  Mit dem Start (nach Tor I) legt Claude auf dem Mac den Ordner «Studio/inhalte/c-0007/» mit den Unterordnern «roh», «material» und «ergebnis» an und trägt den Pfad im Eintrag ein.

2.  Ihr legt die Rohvideos in «roh». Fotos und B-Roll aus dem Katalog muss niemand anhängen, die KI sucht dort selbst.

3.  Vor der Produktion prüft Claude, ob Dateien da sind und nicht nur Platzhalter («Immer auf diesem Gerät behalten»). Fehlt etwas, bleibt der Eintrag in «Pitch bereit» mit der Meldung, was fehlt.

- Kleine Anhänge (Referenzbild, Screenshot einer Vorlage) gehen direkt in die Notion-Seite.

- **\[Sicher\]** Die KI hat in jedem Format Zugriff auf Katalog (Fotos, B-Roll), Motion-Bibliothek, Effekte und Markenprofil. Das Storyboard darf nur Katalogschlüssel und aktive Stücke nennen (Regel 3 des Repos).

**4. Das Ideen-System**

**4.1 Quellen**

| **Quelle**               | **Wie eine Idee entsteht**                                                          | **Stand**                               |
|--------------------------|-------------------------------------------------------------------------------------|-----------------------------------------|
| Manuell                  | Ihr sagt es im Chat oder tragt es in Notion ein                                     | Sofort                                  |
| Rohstoff-Speicher        | Montagsinterview füllt Erlebnisse, Zahlen, Fehler. Daraus entstehen LinkedIn-Ideen. | Läuft heute                             |
| Viral Watcher            | Virale Vorlagen von LinkedIn und Instagram                                          | Läuft **\[Vermutung\]**, wird umgehängt |
| Kundenwunsch und Projekt | Aus einem Kundengespräch oder Auftrag                                               | Neu, manuell                            |
| Lückenanalyse Motion     | Beim Schnitt gefundene Stelle ohne passende Grafik                                  | Läuft im Repo, bleibt in Motion-Ideen   |
| Performance              | Auswertung zeigt, was funktioniert hat; Claude schlägt «mehr davon» vor             | Phase 6                                 |
| Scraping-Automationen    | Inspirationsvideos, Konkurrenz, lokale Themen Ostschweiz                            | Phase 6 (4.4)                           |

**4.2 Pflichtangaben einer Idee**

- Format, Marke, Plattform, Quelle mit Link.

- Hook (erster Satz) und Winkel (was ist neu oder anders).

- Beleg: ein echter Fakt, eine echte Zahl oder ein Erlebnis. Ohne Beleg bleibt die Idee in «Neu».

- Aufwand: braucht es einen Dreh, nur Material aus dem Katalog oder nur Text.

- Dublettenprüfung: Ähnliche Ideen und gleiche Fakten der letzten 90 Tage werden gezeigt (Regel des Cockpits, jetzt für alle Formate).

- Fremde Vorlagen nur im Aufbau übernehmen, nie im Wortlaut (Regel des Cockpits).

**4.3 Tor I im Prüfplatz**

Der Prüfplatz zeigt Ideen als Karten: Format, Hook, Winkel, Beleg, Aufwand, Quelle. Aktionen: freigeben, ablehnen (Grund mit mindestens zwei Wörtern), zurück mit Frage. Ein Wochenmodus zeigt alle neuen Ideen hintereinander, damit ihr am Montag zehn Ideen in wenigen Minuten durchgeht.

- **\[Vermutung\]** Höchstens 10 offene Pitches pro Profil, damit sich keine Halde bildet (im Motion-Teil des Repos sind es 5). Der Wert ist geschätzt und lässt sich im Betrieb anpassen.

**4.4 Automationen für Ideen-Scraping (später)**

- **\[Sicher\]** Verfügbar sind in dieser Umgebung n8n, Firecrawl und Apify. Welches taugt, zeigt ein Test in Phase 6.

- **Eine Automation darf nur Zeilen im Status «Neu» anlegen**, mit Quelle und Referenz. Sie gibt nie frei und setzt nie einen höheren Status.

- Begrenzung: höchstens eine feste Zahl neuer Ideen pro Tag, damit Tor I nicht überläuft.

- **\[Wahrscheinlich\]** Das Auslesen von Instagram verstösst gegen deren Nutzungsbedingungen, wenn es über das Mass der Einzelansicht hinausgeht. Vor dem Bau klären, welche Quellen erlaubt sind.

- Kosten pro Lauf und pro Monat vorher abschätzen und im Plan festhalten.

**5. Die Formate als Module**

Jedes Format hat denselben Aufbau: Eingabe, Erzeugung, Prüfung, Tor P, Veröffentlichung. Unterschiedlich sind nur Erzeugung und Weg nach draussen.

| **Format**                       | **Ergebnis**                               | **Erzeugung**                               | **Veröffentlichung**             | **Phase** |
|----------------------------------|--------------------------------------------|---------------------------------------------|----------------------------------|-----------|
| Reel                             | MP4 1080x1920, 25p, Beschreibung, Hashtags | Pipeline aus Version 2 auf dem Render-Mac   | Paket (Mensch postet)            | 2         |
| LinkedIn-Post                    | Text, optional Bild                        | Claude in claude.ai nach Viral-first-Ablauf | Auto über Taplio                 | 3         |
| Blog                             | Artikel in Blog Content (Framer)           | Claude in claude.ai                         | Mensch in Framer (Bild von Hand) | 3         |
| Google-Maps-Beitrag              | Text, Bild, Knopf                          | Claude in claude.ai                         | Paket (Mensch postet)            | 3         |
| Carousel                         | Folien als PNG, bei LinkedIn als PDF       | HyperFrames mit Markenprofil auf dem Mac    | LinkedIn Auto, Instagram Paket   | 4         |
| Story, Foto, Sonstiges           | Je nach Format                             | Wie Carousel                                | Paket                            | Später    |
| Sales-Deck, Angebot, Ad-Creative | Dokumente und Bilder                       | Wie Carousel plus Vorlagen                  | Paket                            | Später    |

**5.1 Reel**

Unverändert Version 2: Ingest, Whisper, Skript-Abgleich, Take-Auswahl, Schnittregeln, Storyboard, Effekte, Ton, Qualitätsprüfung, Export. Neu sind der Editor (Kapitel 6) und die Anbindung an Tor I und Tor P.

**5.2 LinkedIn-Post**

- Der Viral-first-Ablauf des Cockpits bleibt: Vorlage wählen, Rohstoff zuordnen, nachbauen, erfassen, Archiv prüfen.

- «Kein Post ohne Rohstoff» wird zur Prüfung des Codes: Ohne Verweis auf einen Rohstoff-Eintrag kommt der Eintrag nicht über Tor I.

- Nach Tor P legt Claude über Taplio den Entwurf an und plant ihn. Danach wandert er ins Beiträge-Archiv, dort laufen die Analytics wie bisher.

- **\[Wahrscheinlich\]** Videos und Dokumente lassen sich über die Medienfunktionen von Taplio anhängen. Test vor dem Bau.

**5.3 Blog**

- Claude legt den Artikel in Blog Content (Framer) mit Status «Entwurf» an: Slug, Beschreibung, Kategorie, Fokus-Keyword.

- Textprüfung zusätzlich: Keyword im Titel und in der Beschreibung, Länge der Beschreibung, keine verbotenen Wörter.

- Tor P setzt «Freigegeben». Das Bild ergänzt ein Mensch in Framer, wie heute. «Live» setzt ein Mensch.

**5.4 Google-Maps-Beitrag**

- **\[Sicher\]** Es gibt keinen Connector. Betriebsart «Paket»: Claude liefert Text, Bild und Knopf-Vorschlag, ein Mensch postet im Unternehmensprofil.

- **\[Vermutung\]** Es gelten Längen-, Bild- und Ablaufregeln von Google (zum Beispiel zeitlich begrenzte Beiträge). Ich kenne sie nicht verlässlich. Test T8: aktuelle Regeln prüfen, bevor das Modul gebaut wird.

- Offene Frage: für eure eigenen Standorte oder für Kunden, und mit wessen Zugang (Kapitel 13).

**5.5 Carousel**

- Format: **\[Wahrscheinlich\]** 1080x1350 (4:5) für Instagram, als PDF für LinkedIn.

- **Ich widerspreche Canva für Kundenmaterial:** Es gibt einen Canva-Connector, aber das Repo verbietet Kundenbilder an externe Dienste (Regel 5). Stattdessen rendert HyperFrames die Folien aus dem Markenprofil, dann bleibt alles lokal. Canva ist höchstens für Alperna-eigenes Material denkbar. Das Risiko meines Ansatzes: mehr Eigenbau bei den Folienvorlagen.

- Jede Marke bekommt Folienvorlagen (Titel, Text, Zahl, Liste, Schluss) im Markenprofil. Fotos kommen aus dem Katalog.

**6. Der Editor mit Zeitleiste**

**6.1 Abgrenzung**

|          | **Prüfplatz (Artifact)**                  | **Editor (lokal)**                                            |
|----------|-------------------------------------------|---------------------------------------------------------------|
| Zweck    | Entscheiden: Tor 0, I, P, Looks, Abnahmen | Von Hand am Schnitt arbeiten: ansehen, markieren, korrigieren |
| Ort      | claude.ai, auch auf dem Handy             | Browser auf dem Mac, Adresse localhost                        |
| Schreibt | Entscheidfelder in Notion                 | Markierungen und Schnittkorrekturen, nie einen Entscheid      |
| Zugriff  | Alle mit Notion-Verbindung                | Wer am Mac mit Repo und Studio-Ordner sitzt                   |

**6.2 Aufbau**

- Start mit einem Befehl, etwa «studio editor c-0007». Der Editor liest Vorschau-Video (540p, 25p), Storyboard und Katalog direkt aus dem Studio-Ordner. Es wird nichts hochgeladen.

- Links die Vorschau im 9:16-Rahmen, darunter die Zeitleiste, rechts die Liste der Markierungen.

- **Spuren der Zeitleiste:** Video (Takes mit Quelle und Nummer), Untertitel (Wort für Wort), Zoom, B-Roll und Fotos, Overlays (Motion-Stücke), Ton (Sprache, Effekte, Musik), Markierungen.

- Jedes Element der Zeitleiste trägt die Kennung aus dem Storyboard. So kann eine Markierung auf genau ein Element zeigen.

- **\[Wahrscheinlich\]** Zeiten werden als Bildnummern bei 25p gespeichert, nicht als Sekunden. Das vermeidet Rundungsfehler. Der Browser springt auf ±1 Bild genau, das reicht für Markierungen.

- **\[Wahrscheinlich\]** Die Vorschau zeigt den letzten gerenderten Stand. Eine Live-Vorschau mit allen Overlays im Browser ist deutlich mehr Aufwand und kommt nicht in die erste Fassung.

**6.3 Markieren**

Taste «M» setzt eine Markierung an der Abspielposition, ein Ziehen über die Zeitleiste setzt einen Bereich. Dann wählt ihr die Art, die Schwere und schreibt optional eine Notiz.

| **Art**                      | **Beispiel**                                    |
|------------------------------|-------------------------------------------------|
| Falscher Take                | Bessere Aufnahme dieser Zeile existiert         |
| Füllwort oder Abbruch        | Ein «äh» oder ein Satzabbruch ist noch drin     |
| Schnitt zu früh oder zu spät | Wort angeschnitten oder Pause zu lang           |
| Untertitel                   | Text falsch, Timing falsch, Hervorhebung falsch |
| B-Roll oder Foto             | Passt nicht zum Gesagten, falsch benannt        |
| Overlay oder Effekt          | Unnötig, falsch, zu früh, falscher Stil         |
| Zoom                         | Zu stark, zu spät, fehlt                        |
| Ton                          | Lautstärke, Effekt zu laut, Musik stört         |
| Sonstiges                    | Alles, was in keine Art passt, mit Notiz        |

Schwere: «muss» blockiert Tor P, «sollte» und «Idee» nicht.

**6.4 Was mit einer Markierung geschieht**

1.  Der Editor speichert sie in «Studio/daten/markierungen/c-0007.json» (OneDrive). Dort kollidiert nichts mit Notion.

2.  Claude Code liest die Datei, ordnet jede Markierung über Zeit und Spur dem Storyboard-Element zu, ändert genau diese Stelle und rendert eine neue Fassung (v2, v3 und so weiter). Die alte bleibt erhalten.

3.  Claude schlägt «behoben» vor. Ein Mensch bestätigt im Editor. Erst dann gilt die Markierung als erledigt.

4.  Claude spiegelt jede Markierung als Ereignis in Notion (Datenbank «Ereignisse»). Damit füttert sie das Lernsystem (Version 2, Kapitel 5) und der Prüfplatz sieht, ob «muss»-Markierungen offen sind.

5.  Auf Knopfdruck leitet Claude aus den Ereignissen Regelvorschläge ab, getrennt nach Format und nach Handwerk oder Optik.

- **\[Sicher\]** Die Zahl der Markierungen pro Reel ist die wichtigste Messgrösse des Systems. Sinkt sie über zehn Reels, lernt das System. Sinkt sie nicht, taugen die Regeln nicht.

**6.5 Direkte Handgriffe**

Markieren ist langsam, wenn es nur um Kleinigkeiten geht. Darum darf der Editor einige Korrekturen selbst ins Storyboard schreiben (mit Autor «Mensch» und als Ereignis protokolliert):

| **Fassung**        | **Handgriffe**                                                                                                            | **Wirkung**                               |
|--------------------|---------------------------------------------------------------------------------------------------------------------------|-------------------------------------------|
| Editor 1 (Phase 2) | Markieren; anderen Take wählen (Auswahlliste mit Begründung des Systems); Overlay ein- und ausschalten                    | Teilrender oder Gesamtrender der Vorschau |
| Editor 2 (Phase 4) | Schnittpunkte ziehen; Untertitel-Text und Wortzeiten ändern; B-Roll verschieben oder tauschen (Katalogsuche); Zoom setzen | Wie oben                                  |
| Editor 3 (später)  | Ton-Mischung, Lautstärke je Spur, Look                                                                                    | Wie oben                                  |

**6.6 Grenzen und Risiken**

- **Der Editor ist kein Schnittprogramm.** Nichts, was das Storyboard nicht ausdrücken kann, wird im Editor gebaut. Was nicht passt, wird zur Markierung mit Notiz. Ohne diese Regel wächst er zu einem zweiten Projekt.

- **\[Sicher\]** Er läuft nur an Macs mit Repo und Studio-Ordner. Für Leander von seinem Gerät aus braucht es später die Browser-Variante: Vorschau per Dateiauswahl in den Prüfplatz laden und Markierungen als Notion-Zeilen speichern. Der Datenaufbau der Markierungen ist darauf schon ausgelegt (Anhang A2).

- Eine Sitzung pro Inhalt gleichzeitig (Sperrdatei und Versionsprüfung, wie beim Ideenprotokoll).

- **\[Vermutung\]** Eine neue Fassung der Vorschau kostet 1 bis 3 Minuten Renderzeit. Ob ein Teilrender nur der geänderten Stelle möglich ist, hängt von Test T1b ab. Test T7 prüft den ganzen Kreislauf an einem echten Clip.

**7. Produktion für alle Formate**

**7.1 Gemeinsamer Werkzeugkasten**

| **Baustein**                  | **Nutzung durch alle Formate**                                                                         |
|-------------------------------|--------------------------------------------------------------------------------------------------------|
| Katalog                       | Fotos und B-Roll, autonom benannt (Version 2, 3.7). Auch für Carousels, Blog-Bilder und Maps-Beiträge. |
| Motion-Bibliothek und Effekte | Aktive Stücke für Reels und animierte Carousel-Folien                                                  |
| Markenprofil                  | Farben, Schriften, Tonalität, verbotene Wörter, Hashtags, Folienvorlagen, Schnittprofil                |
| Regeln                        | Gelernte Regeln, nach Format und nach Handwerk oder Optik getrennt, höchstens etwa 30 aktive je Format |
| Skripte und Entwürfe          | Seitentext des Eintrags in «Inhalte»                                                                   |

**7.2 Prüfung je Format**

| **Format**       | **Prüfung vor Tor P**                                                                                                                                                                             |
|------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Alle Textformate | Textprüfung durch Code: verbotene Wörter der Marke, ss statt ß, keine Gedankenstriche als Satzzeichen, Zahlenformat, keine Zahl ohne Beleg, Länge. Danach liest Claude gegen den Winkel der Idee. |
| Reel             | Qualitätsprüfung mit Selbstkorrektur (Version 2, 3.10), höchstens zwei Runden                                                                                                                     |
| Carousel         | Textüberlauf, Kontrast, Lesbarkeit auf dem Handy, Reihenfolge der Folien                                                                                                                          |
| Blog             | Keyword, Beschreibung, Überschriftenstruktur, interne Verlinkung                                                                                                                                  |

- **\[Sicher\]** Die Textprüfung im Code ist deterministisch und kostet keinen Claude-Aufruf. Das Urteil über Inhalt und Ton bleibt bei Claude und bei euch.

**8. Umzug von Content-Ideen in «Inhalte»**

**Ich widerspreche dem Umzug nicht grundsätzlich, aber nur mit Stichtag.** Zwei beschreibbare Ideenlisten nebeneinander führen dazu, dass niemand weiss, welche stimmt.

1.  **Schema bauen:** «Inhalte» nach Abschnitt 3.2 anlegen, leer. Nichts verschieben.

2.  **Zuordnung festlegen:** Felder und Status nach der Tabelle unten.

3.  **Kopieren, nicht verschieben:** Claude legt alle Zeilen in «Inhalte» an und zeigt vorher eine Vorschau. Zeilenzahl und zehn Stichproben werden geprüft.

4.  **Zulieferer umhängen:** Viral Watcher, Montagsablauf des Cockpits und alle Seiten, die auf Content-Ideen verweisen, zeigen auf «Inhalte».

5.  **Stichtag:** Content-Ideen wird in «Content-Ideen (Archiv)» umbenannt, bekommt oben einen Hinweis und wird nicht mehr beschrieben.

6.  **Rückweg:** Content-Ideen wird nicht gelöscht. Bei einem Problem lässt sich der Zulieferer zurückhängen.

| **Content-Ideen**                                                      | **Inhalte**                              | **Hinweis**                                        |
|------------------------------------------------------------------------|------------------------------------------|----------------------------------------------------|
| Status Neu                                                             | Neu                                      |                                                    |
| Status Bereit                                                          | Pitch bereit                             |                                                    |
| Status Zur Freigabe                                                    | Entwurf fertig (Tor P offen)             | Bedeutung prüfen, siehe Hinweis unten              |
| Status Freigegeben                                                     | Freigegeben                              |                                                    |
| Status Geplant, Gepostet, Verworfen                                    | Geplant, Veröffentlicht, Verworfen       |                                                    |
| Plattform LinkedIn                                                     | Plattform LinkedIn, Format LinkedIn-Post |                                                    |
| Plattform Instagram                                                    | Plattform Instagram, Format «ungeklärt»  | Reel, Carousel oder Foto lässt sich nicht ableiten |
| Profil, Hook, Winkel, Referenz, Batch, Publishing, Geplant für, Quelle | Gleichnamige Felder                      | Direkt übernommen                                  |

- **\[Vermutung\]** «Zur Freigabe» in Content-Ideen bedeutet vermutlich «Entwurf liegt zur Abnahme vor». Bevor die Zuordnung gilt, kurz bestätigen. Bei Zeilen im Status «Bereit» ist unklar, ob eine Idee freigegeben wurde. Sie werden sicherheitshalber «Pitch bereit», damit sie durch Tor I laufen.

- Die Zeilen mit Format «ungeklärt» sortiert Claude in einem Durchgang vor, ihr bestätigt im Prüfplatz.

- **\[Sicher\]** Anzahl der Zeilen und Zustand der Automationen kenne ich nicht. Beides gehört vor den Stichtag geprüft.

**9. Marken und Kunden**

**9.1 Schnittprofil im Markenprofil**

Das Markenprofil (Version 2, Kapitel 4) bekommt ein Feld «Schnittprofil». Die Optik folgt der Marke, das Tempo folgt dem Schnittprofil. Für Alperna: Optik ruhig (Design System), Schnitt schnell (Retention).

| **Feld im Schnittprofil**            | **Beispiel Alperna**                                         |
|--------------------------------------|--------------------------------------------------------------|
| Längste Pause                        | 0,25 Sekunden                                                |
| Längste Einstellung ohne Bildwechsel | 1,5 Sekunden                                                 |
| Wörter je Untertitel                 | 2 bis 3                                                      |
| Hook                                 | Höchstens 2 Sekunden bis zur Aussage                         |
| Zoom-Tempo und Ton-Effekte           | Zoom-Tempo mittel; Ton-Effekte Dichte 0 (so im Markenprofil) |
| Folienvorlagen und Textlängen        | Je Format, aus dem Design System                             |

- **\[Sicher\]** Für Alperna ist Gate 0 noch nicht bestanden (Status «platzhalter»). Das sperrt den finalen Export. Im Prüfplatz ist Gate 0 bisher nur sichtbar, nicht auslösbar. Das wird in Phase 1 behoben.

- Für einen Kunden entsteht das Profil beim ersten Inhalt aus Website und Brandbook, danach Gate 0 mit Probebildern. Nach der Freigabe sind Tor I und Tor P für diesen Kunden in «Inhalte» nutzbar.

**9.2 Kundenarbeit**

- **\[Sicher\]** Kundenbilder und Kundenvideos gehen an keinen externen Dienst. Das gilt für alle Formate (Regel 5 des Repos).

- **\[Sicher\]** Notion-Rechte schützen Kundeninhalte. Wer Zugriff auf «Inhalte» hat, sieht alle Kunden. Eine Trennung nach Kunde braucht getrennte Datenbankansichten oder Datenbanken und ist keine Sache des Prüfplatzes.

- Offen: Gibt der Kunde selbst frei (eigener Schritt «Kundenfreigabe») oder nur ihr? Siehe Kapitel 13.

**10. Technik**

**10.1 Wer wo arbeitet**

| **Ort**                   | **Aufgabe**                                                                                                                            |
|---------------------------|----------------------------------------------------------------------------------------------------------------------------------------|
| Notion                    | Alle Texte und Strukturdaten: Inhalte, Markenprofile, Regeln, Ereignisse, Motion-Ideen                                                 |
| OneDrive, Ordner «Studio» | Dateien: Rohmaterial, Katalog, Vorschau, Renders, Markierungen. Pfade relativ und NFC-normalisiert, «Immer auf diesem Gerät behalten». |
| Render-Mac (Claude Code)  | Produktion, Rendern, Editor, Ideenprotokoll, Umhängen, Teilrender                                                                      |
| claude.ai                 | Textformate, Planung, Prüfplatz (Artifact), Regelvorschläge                                                                            |

**\[Sicher\]** Alles läuft über Claude und Claude Code, nie über die Claude-API.

**10.2 Offener Technikentscheid T1b**

**\[Sicher\]** Gemessen auf Linux dauert ein Overlay von 2,4 bis 3,2 Sekunden als WebM mit Alphakanal 11 bis 16 Sekunden zum Rendern (rund 4,3- bis 5,4-fache Echtzeit), und der Stapel ist kaum schneller. Zwei Wege:

|          | **Eine Datei je Overlay**                                        | **Eine Komposition für alle**                           |
|----------|------------------------------------------------------------------|---------------------------------------------------------|
| Vorteil  | Wiederverwendbar, zwischenspeicherbar, unabhängig von der Engine | Kein fester Zeitaufwand je Overlay                      |
| Nachteil | Mehrere Sekunden fester Aufwand je Datei                         | Neurendern bei jeder Änderung, weniger Wiederverwendung |

Entscheid nach Test T1b auf dem Mac (M4, M5). **\[Vermutung\]** Auf Apple Silicon fällt der feste Aufwand deutlich kleiner aus. Der Entscheid betrifft auch den Teilrender des Editors.

**10.3 Prüfplatz-Grössen**

- **\[Vermutung\]** Mit den neuen Kartenarten wird das Artifact grösser. Ab etwa 3 bis 4 MB lohnt sich die Aufteilung in mehrere Seiten oder Tabs. Messen, bevor es nötig wird.

- Nach jeder Änderung an Marke oder Bibliothek: Prüfplatz neu bauen und veröffentlichen (Ablauf im Repo).

**11. Roadmap**

**\[Vermutung\]** Aufwände in Personentagen, geschätzt, ohne Erfahrungswert. Eine Phase beginnt erst, wenn die Abnahme der vorigen bestanden ist.

| **Phase**             | **Inhalt**                                                                                                                                               | **Abnahme**                                                             | **Aufwand** |
|-----------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------|-------------|
| 0 Tests               | T1 bis T6 aus Version 2, dazu T1b (Overlay-Rendering), T7 (Markierungs-Kreislauf an einem Clip), T8 (Regeln Google-Maps-Beiträge)                        | Alle bestanden oder Plan angepasst                                      | 4 bis 5     |
| 1 Rückgrat            | Datenbank «Inhalte», Umzug mit Stichtag, Tor I im Prüfplatz, Gate 0 auslösbar, Markenprofil mit Schnittprofil, Katalog benennen, Motion-Ideen umbenennen | Eine Idee läuft von Neu bis Freigegeben, die alten Ideen sind umgezogen | 6 bis 9     |
| 2 Durchstich Reel     | Ein Reel von Rohmaterial bis fertig (Version 2, Phase 2) plus Editor 1: Zeitleiste, Markieren, Take-Wahl, Spiegelung nach Notion, Tor P                  | Echtes Reel veröffentlichbar nach höchstens zwei Korrekturrunden        | 12 bis 18   |
| 3 Textmodule          | LinkedIn-Post (Taplio, Cockpit-Anbindung), Blog, Google-Maps-Beitrag, Textprüfung durch Code                                                             | Je Format ein echter Beitrag veröffentlicht                             | 7 bis 11    |
| 4 Carousel und Optik  | Folienvorlagen, Carousel-Modul, Effekte Welle 2 und 3, Editor 2, Sound-Effekte                                                                           | Je Welle ein Testreel, ein Carousel pro Marke                           | 15 bis 23   |
| 5 Qualität und Lernen | Selbstkorrektur, Beschreibung und Hashtags, Regelvorschläge je Format                                                                                    | Zehn Reels ohne Eingriff bei messbaren Mängeln                          | 5 bis 8     |
| 6 Automationen        | Ideen-Scraping, Performance-Ideen, Kostenrahmen                                                                                                          | Eine Quelle läuft eine Woche ohne Überlauf in Tor I                     | 5 bis 8     |
| 7 Später              | Browser-Variante des Editors für Leander, Color Grading, zweite Kamera, Musik-Beats, Sales-Decks, Angebote, Ad-Creatives                                 | Je nach Baustein                                                        | offen       |

- **\[Wahrscheinlich\]** Die Textmodule (Phase 3) brauchen keinen Render und könnten parallel zu Phase 2 laufen. Ich würde sie erst danach bauen, damit das Rückgrat nicht wegen Sonderfällen aus dem Reel verbogen wird.

- **Aufteilung zwischen euch und dem Bau-Chat:** Ein getrennter Claude-Code-Chat baut bereits nach Version 2 (Repo video-studio). Version 3 geht an ihn als neuer Auftrag, der Teil «Rückgrat» zuerst.

**12. Risiken**

| **Risiko**                                                  | **Stufe** | **Gegenmassnahme**                                                                    |
|-------------------------------------------------------------|-----------|---------------------------------------------------------------------------------------|
| Umfang: fünf Formate, kein bewiesener Videopfad             | Hoch      | Feste Reihenfolge, Abnahme je Phase, Phase 0 zuerst.                                  |
| Umzug erzeugt zwei Wahrheiten oder bricht den Montagsablauf | Hoch      | Stichtag, Kopie vor Umzug, Archiv bleibt, Rückweg.                                    |
| Editor wächst zu einem Schnittprogramm                      | Hoch      | Regel: nur was das Storyboard ausdrücken kann. Fassungen 1 bis 3.                     |
| Notion erzwingt keine Übergangsregeln                       | Mittel    | Code prüft bei jedem Lauf und setzt unerlaubte Änderungen zurück.                     |
| Editor nur an einem Rechner                                 | Mittel    | Bewusst so entschieden. Browser-Variante in Phase 7, Datenformat darauf vorbereitet.  |
| Overlay-Rendering zu langsam                                | Mittel    | Test T1b auf Apple Silicon, Entscheid zwischen den beiden Wegen.                      |
| Scraping verletzt Nutzungsbedingungen oder kostet zu viel   | Mittel    | Quellen vorab klären, Tageslimit, Kostenrahmen.                                       |
| Maps-Regeln unbekannt                                       | Mittel    | Test T8 vor dem Bau.                                                                  |
| Kundenmaterial gelangt an externe Dienste                   | Mittel    | Regel 5 des Repos für alle Formate, kein Canva für Kundenbilder.                      |
| Prüfplatz wird zu gross                                     | Niedrig   | Messen, bei Bedarf in Tabs oder mehrere Artifacts teilen.                             |
| Name beim Entscheid nicht geprüft                           | Mittel    | Rechte in Notion und Artifact sind der Schutz. Für Kunden zusätzlich Zugriff trennen. |

**13. Offene Punkte**

Von dir, nach Wichtigkeit:

1.  Zahl der Zeilen in Content-Ideen nennen und sagen, was der Viral Watcher technisch ist (n8n, Taplio oder anderes). Das braucht das Umhängen.

2.  Bestätigen, was «Zur Freigabe» und «Bereit» in Content-Ideen bedeuten (Kapitel 8).

3.  Google-Maps-Beiträge: für eure Standorte oder für Kunden, und wer hat die Zugänge.

4.  Gibt der Kunde selbst frei, ja oder nein.

5.  Leere Datenbank «Ideen» und die Beispielzeile in Notion löschen, ja oder nein. Und die Umbenennung der echten Motion-Datenbank in «Motion-Ideen».

6.  Zahl-Zähler aktivieren: Sag im Chat «aktiviere Zahl-Zähler, Freigabe von (Name)», nachdem du die Vorschau gesehen hast.

7.  Altes Claude-Docs-Dokument aus Version 1 löschen, ja oder nein (nur mit deinem Ja).

8.  GSAP-Lizenz prüfen (Standardlizenz ohne Gebühr, laut Repo noch nicht von euch bestätigt).

9.  Stunden pro Woche, die ihr in den Bau steckt.

10. Aus Version 2 weiter offen: ein bis zwei Instagram-Accounts mit Captions, die ihr mögt; Screenshots der Retention-Graphen; Sample-Bibliothek hochladen; Testprojekt wählen; Color-Grading-Look später.

**Anhang A: Beispiele**

**A1 Eintrag in «Inhalte» (Auszug)**

Erfundenes Beispiel zur Illustration. Die Angaben sind keine echten Zahlen.

> inhalt_id: c-0007
>
> titel: Beispiel: Was ein Seitentest zeigt
>
> format: Reel
>
> plattformen: Instagram, LinkedIn
>
> marke: Alperna
>
> profil: Andrej
>
> quelle: Rohstoff-Speicher, Referenz: virale Vorlage (Link)
>
> hook: «Beispielsatz mit einer Zahl aus dem Beleg.»
>
> beleg: Verweis auf den Rohstoff-Eintrag mit Quelle
>
> status: Pitch bereit
>
> tor_i: offen
>
> dateien: Studio/inhalte/c-0007/
>
> publishing: Paket

**A2 Markierung (Datei und später Notion-Zeile)**

> {
>
> "id": "mk-0003",
>
> "inhalt": "c-0007",
>
> "fassung": 2,
>
> "von_bild": 312,
>
> "bis_bild": 338,
>
> "spur": "bRoll",
>
> "element": "br-04",
>
> "art": "bRoll",
>
> "schwere": "muss",
>
> "notiz": "Bild passt nicht zum gesagten Satz",
>
> "status": "offen",
>
> "von": "Andrej",
>
> "am": "2026-10-20T09:41:00+02:00"
>
> }

**A3 Wer schreibt welches Feld**

| **Feldgruppe**              | **Claude**      | **Mensch im Prüfplatz** | **Automation**     |
|-----------------------------|-----------------|-------------------------|--------------------|
| Inhalt, Hook, Winkel, Beleg | ja              | ja (Korrektur)          | nur bei Status Neu |
| Status (Übergang)           | ja, mit Prüfung | nein                    | höchstens Neu      |
| Tor 0, I, P: Entscheid      | nie             | ja                      | nie                |
| Markierung anlegen          | nein            | ja (Editor)             | nein               |
| Markierung «behoben»        | schlägt vor     | bestätigt               | nein               |
| Ereignisse in Notion        | ja (Spiegel)    | nein                    | nein               |

**14. Änderungen nach Stand 17.10.2026**

- **18.10.2026, Auftrag «Prüfplatz neu» und Material an Inhalten:** `auftrag-pruefplatz-neu.md`. Der Prüfplatz hat drei Bereiche (Heute, Plattformen, Werkstatt) mit Seitenfenster und das Design von alperna-tool (ändert Kapitel 4.3, Tor I im Prüfplatz). Altbeiträge aus dem Cockpit gehören nicht nach «Inhalte» (ändert Kapitel 8, nach Andrejs Ja). Anhänge wie Footage hängt der Prüfplatz als Verweis im Feld «Dateien» an (ergänzt Kapitel 3.3). Bei Widerspruch gilt der Auftrag.
- **18.10.2026, Editing-Blueprint geprüft:** `editing-blueprint.md`. Resolve bekommt die Schnittübergabe als Dateien (FCPXML, OTIO, SRT, Grafiken als ProRes 4444), keine Live-Steuerung. Neu sind Schnittplan (`src/schnitt/`) und Presets (`presets/`). Der Export-Preset `reel` folgt Kapitel 3.11 von Bauplan v2, die Werte des Blueprints stehen daneben als `reel-blueprint`. Neuer Test T9 (Resolve öffnet die Datei). Ergänzt Kapitel 6 (Editor): Wer in Resolve schneidet, ändert dort, nicht im Plan.
