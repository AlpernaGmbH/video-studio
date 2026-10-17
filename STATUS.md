# STATUS.md – video-studio

Stand: 17.10.2026. Etappe 1 (**Fundament und Motion-Werkstatt**) ist fertig, Etappe 2 (**Notion, OneDrive, Prüfplatz, Einrichtung je Mac**) auch.
Phase 0 des Bauplans (Tests T1 bis T6) ist **nicht** gelaufen, weil sie M4/M5-Macs, echte Clips, Instagram und Notion-Praxis braucht.

`npm run check`: 361 Tests in 24 Dateien grün, Lint der Bibliothek ohne Fehler. `npm run selftest:render`: besteht (Linux, siehe «Gemessen»).
Prüfplatz: `scripts/pruefplatz-test.cjs` (Headless-Chrome, nachgebautes Notion), 13 Prüfungen bestanden. Er gehört nicht zu `npm run check`, weil er Playwright braucht.

## Entscheide aus dem Chat (17.10.)

- Eigenes Repo `AlpernaGmbH/video-studio` (das `studio/` im Website-Repo ist entfernt, die Website ist unverändert).
- Marke: **Alperna Design System (zweites, 17.9.)**: gedämpftes Blau ohne schwarzen Hauptgrund, Gold `#FFD700` als einziger Akzent. Profil `marken/alperna.json`.
- Alles über Claude und Claude Code, **nie über die Claude-API**. Darum ist der Prüfplatz ein Artifact, das die Notion-Verbindung des Menschen benutzt.
- Texte in Notion, Medien in OneDrive, Code im Repo. Ein zweiter Mac wird mit `init` und `doctor` eingerichtet (Skill `studio-einrichten`).

## Fertig

**Fundament** (`src/core/`)
- Pfade relativ zu `Studio/`, NFC-normalisiert (macOS liefert Umlaute zerlegt), kein Ausbrechen.
- Schemas: Katalog-Eintrag (Bauplan 3.7), Markenprofil (Kap. 4) mit Gate 0, Regel (Kap. 5, höchstens 30 aktiv, Handwerk/Optik getrennt),
  Ereignis (Lernsignale inkl. «unveraendert»), Storyboard (A1).
- Storyboard-Prüfung: B-Roll nur mit gültigem Katalog-Schlüssel, nicht doppelt, nicht im letzten Video der Marke, lang genug; Effekte nur aus
  **aktiven** Stücken, Parameter gegen das Datenblatt, Begründung Pflicht.

**Motion-Bibliothek** (`src/motion/`, `library/motion/`)
- Stück-Vertrag und Datenblatt (A3 plus Einsatzangaben), Variablen-Auflösung, Erzeugung der HyperFrames-Deklaration aus `piece.json`, Lint gegen `index.html`.
- Staging (lokales GSAP, Marken-Schriften, kein stiller Schrift-Rückfall), Render-Befehle (WebM mit Alpha, 25p, Batch), objektive Selbstprüfung.
- Gerüst für neue Stücke (`motion neu`), Aktivierung nur durch Menschen, kompakter Index für den Storyboard-Prompt.
- Referenzstück **Zahl-Zähler** (Status `geprueft`, **nicht** `aktiv`: Aufnahme ist ein Entscheid von euch).

**Wachstumsschleife**
- Signalerkennung in Sätzen, Lückenanalyse gegen alle Stücke mit Begründung pro Stück, Wiederholungsschutz, Ideenprotokoll mit Zustandsautomat,
  Pitch-Text, Look-Bogen (drei Standbilder plus Vergleichsblatt), Ereignisse als Lernsignale. Konzept: `docs/motion-werkstatt.md`.
- CLI `npm run studio -- help`, Skill `.claude/skills/motion-werkstatt`, Anleitungen in `prompts/` mit gegen die Schemas geprüften Beispielen.

**Notion, Einrichtung, Prüfplatz** (`src/notion/`, `src/setup.ts`, `src/pruefplatz.ts`, `pruefplatz/`, `docs/notion-und-pruefplatz.md`)
- Notion: Seite «Video-Studio» mit Datenbank «Ideen» (Schema im Dokument). `notion.json` hält die Kennungen.
- Abbild Idee ↔ Notion-Zeile: schreibt **nie** einen Entscheid, leert nur Felder von Stufen, die noch nicht erreicht sind. Liest Entscheide nur mit Namen,
  verlangt Grund bei «keiner passt» und «Änderung nötig». Das Protokoll gilt bei Abweichung. Befehle `ideen notion-zeile`, `notion-alle`, `notion-lesen`.
- Die Abnahme im Prüfplatz aktiviert das Stück mit dem Namen des Menschen und führt die Idee in die Bibliothek (Test über den ganzen Weg).
- `init` legt `Studio/` in OneDrive an und merkt den Pfad je Mac, `doctor` prüft Node, ffmpeg, OneDrive, Schreibrecht, Protokoll, Bibliothek, Notion-Ziel.
- **Prüfplatz** (Artifact, privat): Pitch freigeben oder ablehnen (mit Grund), Look wählen, Abnahme, alle Ideen, Bibliothek, Marke. Liest die Zeile vor jedem
  Schreiben frisch, schreibt nichts über einen schon gefallenen Entscheid, liest nach und meldet erst dann «Gespeichert». Dunkel nach Design System.

## Prüfplatz: was geprüft ist und was nicht

Geprüft (Headless-Chrome mit nachgebautem Notion, das die an der echten Datenbank beobachteten Antwortformen liefert): Karten, Pflichtfelder, genaue Schreibfelder,
frisch lesen vor Schreiben, Nachlesen, veralteter Entscheid wird nicht überschrieben, getrennte Texte für verweigerten Zugriff, fehlende Verbindung, Richtlinie und unklaren
Ausgang, kein waagrechtes Scrollen bei 390 px, Tastaturbedienung, keine Konsolenfehler, nur erlaubte Hosts (Schriften), kein Emoji.

**Nicht geprüft** (geht von hier aus nicht):
- die echte Zustimmungsabfrage von claude.ai beim ersten Speichern und die echten Fehlercodes des Konnektors;
- die tatsächliche Form von `result.payload` im Viewer (der Code liest `payload`, sonst den Text des ersten Blocks als JSON);
- Schriften Poppins und Montserrat (im Test gesperrt, es erscheint der Ersatz), Safari und echtes Handy;
- ob `Notion` der richtige Anzeigename deines Konnektors ist (Erwartung: ja, so heisst er in dieser Session).
Beim ersten Gebrauch bitte genau einen Pitch freigeben und in Notion nachsehen, ob die Felder stimmen.

## Gemessen (Linux x64, 4 Kerne Xeon, 16 GB, Software-GL, HyperFrames 0.8.164, Chrome Headless Shell 152)

| Was | Wert |
|---|---|
| Overlay 2,4 bis 3,2 s als WebM mit Alpha | 11 bis 16 s Renderzeit (rund 4,3- bis 5,4-fache Echtzeit) |
| Batch, zwei Fassungen (2,4 s und 3,2 s) | 22 s, kaum schneller als zwei Einzelrenders |
| `hyperframes check` | 7 bis 8 s |
| Look-Bogen (3 Standbilder und Vergleichsblatt) | 21 s |

**Das ist keine Aussage zu T1.** T1 verlangt höchstens 3-fache Echtzeit auf M4 und M5 für 10 s mit Captions, Zoom und einem Effekt. Dieser Rechner
ist ein anderer, und die Messung betrifft ein einzelnes Overlay. Bitte `npm run selftest:render` auf beiden Macs laufen lassen und die Zeiten hier eintragen.

**Offene Architekturfrage für Phase 2 («T1b»):** Jedes Overlay als eigene WebM zu rendern ist cachefähig und engine-neutral (Plan B Remotion muss nur dieselbe
Datei liefern), kostet aber pro Einsatz mehrere Sekunden Fixaufwand. Ein Reel mit 6 Overlays wären hier rund 70 s nur für Overlays. Die Alternative
ist, alle Overlays in einer einzigen Komposition zu rendern (ein Render, aber kein Cache und enger an HyperFrames gebunden). Entscheiden, sobald T1 auf den Macs vorliegt.

## Abweichungen vom Bauplan und Auslegungen

1. **Ort:** eigenes Repo `AlpernaGmbH/video-studio`. Die Website hat keinen Bezug mehr zu diesem Paket.
2. **Kap. 3.6 (Wellen) ist das Startset, nicht die ganze Bibliothek.** Danach wächst sie über die Schleife. Von den 9 Effekten der Welle 1 ist **einer** gebaut (Zahl-Zähler).
3. **Stück-Vertrag Overlay:** (Variablen, Dauer, Marke) → transparentes WebM. Effekte, die das Basisvideo verändern (Zoom, Freisteller, Frame Break), sind `ausgabe: komposition`
   und noch nicht umgesetzt.
4. **Neue Regeln (Vorschlag, nicht im Bauplan):** höchstens 2 Stücke gleichzeitig im Bau, höchstens 5 offene Pitches, mindestens 2 weitere Einsätze im Pitch, höchstens 5 neue Ideen pro Video,
   Ablehnung nur mit Grund. Zahlen sind Startwerte, in `src/motion/idee.ts` änderbar.
5. **Sicherheitsrand:** unten und rechts 20 % (Bauplan 3.10, dort Vermutung), oben 8 % und links 5 % sind meine Annahme. Eine Stelle: `SICHERHEITSRAND` in `src/motion/render.ts`. Test T4 und echte Reels klären es.
6. **Markenprofil Alperna** (`marken/alperna.json`) hat die Werte des Design Systems (Hintergrund `#26324A`, Text `#FDFBFB`, Gold `#FFD700`, Höhenblau `#2B3A5A`, Poppins und
   Montserrat), steht aber auf **`platzhalter`**: Gate 0 (Freigabe durch euch) ist nicht passiert. Bis dahin nur Entwürfe, `--final` wird verweigert.
   Die Standardwerte in `MARKEN_VARIABLEN` (`src/motion/stueck.ts`: Weiss, `#FFC629`, `#4B3FD6`) sind Platzhalter aus dem Bauplan und gelten nur, wenn ein Profil sie nicht setzt.
7. **Speicher:** Zustand der Ideen in `Studio/daten/ideen.json` (OneDrive, Versionsprüfung), Anzeige und Entscheide in Notion. Zwei Macs, die gleichzeitig in die Datei schreiben,
   können in OneDrive eine Konfliktkopie erzeugen: Eine Sitzung führt das Protokoll nach, alle anderen entscheiden im Prüfplatz.
8. **«Mensch»:** Der Namenstest ist keine Authentifizierung (siehe `docs/motion-werkstatt.md`).
9. **HyperFrames-Eigenheiten, gegen 0.8.164 geprüft:** Die Dauer ist keine Root-Variable (darum `dauer` als Variable, Root ohne `data-duration`); Listen gibt es nicht (JSON-Text);
   die Timeline muss synchron registriert werden (sonst «zero duration»); im Batch lehnt `--strict-variables` den Dateinamen-Schlüssel ab (Zeilen werden stattdessen selbst streng geprüft).

## Datenschutz

- `hyperframes snapshot` schickt Bilder an Gemini, **sobald `GEMINI_API_KEY` gesetzt ist**. Der Code schaltet das fest ab (`--describe false`). Die Variable bleibt auf Render-Rechnern ungesetzt.
- HyperFrames sendet standardmässig anonyme Nutzungsdaten. Pro Rechner `npx hyperframes telemetry disable` (im Container dieser Session ist es abgeschaltet, auf den Macs noch zu tun).

## Neue Abhängigkeiten (Begründung)

| Paket | Wofür | Lizenz |
|---|---|---|
| `zod` ^3.25 | Schemas und Validierung (wie in der Website) | MIT |
| `gsap` 3.15.0 | Animation in den Stücken, lokal eingebunden statt vom CDN | «Standard no charge license» von GSAP. **Bitte Lizenztext prüfen** (gsap.com/standard-license), bevor Kundenmaterial damit entsteht |
| `typescript`, `vitest`, `tsx`, `@types/node` | Entwicklung | Apache 2.0, MIT |
| Playwright (nicht in `package.json`) | nur für `scripts/pruefplatz-test.cjs`, global installiert | Apache 2.0 |
| HyperFrames 0.8.164 | Render-Engine, per `npx` (nicht in `package.json`), Version in `src/motion/render.ts` gepinnt | Apache 2.0 |
| Poppins, Montserrat (woff2) | aus `public/fonts/` der Website kopiert | OFL, Lizenztexte liegen bei |

## Konflikt zwischen Bauplan und Marke (Entscheid nötig)

Der Bauplan beschreibt einen schnellen, lauten Instagram-Schnitt (Captions mit 3 bis 5 Wörtern, Zoom-Punches, Soundeffekte). Das Design System und der Produktions-Standard
beschreiben das Gegenteil: ruhig, Bewegungen von 200 bis 400 ms ohne Federn, kürzere Captions, keine Soundeffekte. **Empfehlung:** Tempo und Schnittstil gehören ins Markenprofil
(`effektStil.bewegungstempo` gibt es, ein `schnittProfil` fehlt noch) statt in den Code. Dann kann Alperna ruhig sein und ein anderer Kunde schnell. Bis zum Entscheid gilt die Marke.

## Nicht gebaut (Reihenfolge der nächsten Schritte)

1. **Phase 0 auf den Macs:** T1 (`selftest:render`), T2 (Whisper, 3 echte Clips), T3 (Artifact und Notion, Teile davon sind mit dem Prüfplatz erledigt), T4 (25p/30p bei Instagram), T5 (OneDrive), T6 (Take-Auswahl).
2. **Phase 1:** übrige Notion-Datenbanken (Projekte, Skripte, Marken, Katalog, Regeln, Ereignisse), Gate 0 mit Freigabe der Marke, Katalog benennen (20 Dateien zum Messen der Tokenkosten).
3. **Phase 2 (Durchstich):** Ingest, Transkription, Skript-Zuordnung, Take-Auswahl, Schnitt, Captions, Storyboard, Vorschau, finaler Render, Qualitätsprüfung, Übergabe.
   Der Prototyp der Skript-Zuordnung (Bauplan 3.2) existiert nicht (Antwort aus dem Chat: «keine Ahnung»). Er wird in Phase 2 neu gebaut.
4. **Welle 1** (8 weitere Stücke), danach Welle 2 und 3 und die ersten echten Ideen aus echten Videos.
5. Lernsystem: Regelvorschläge aus den Ereignissen (Schema und Ereignisse stehen, der Vorschlags-Aufruf nicht).
6. Gate 0 im Prüfplatz: Die Marke ist dort nur zu sehen. Die Freigabe fehlt noch als Handlung.

## Offen in Notion (bitte entscheiden)

- Auf der Seite «Video-Studio» liegt eine **leere Datenbank «Ideen»** (Rest eines Platzhalters, nur Spalte «Name»), neben der richtigen «Ideen (Motion-Bibliothek)».
  Zum Löschen braucht es euer Ja.
- Die Zeile **«Beispiel: Wert-Verlauf»** (Idee-ID `beispiel`) ist ein Muster, keine echte Idee. Sie erscheint im Prüfplatz als offener Pitch. Löschen nach eurem Ja.
- Die Seite ist **privat** (nur das Konto, das sie angelegt hat). Teilen und ggf. in einen Teamraum verschieben.

## Fragen an euch

1. Schnell oder ruhig: Stimmt die Empfehlung (Marke gilt, Schnittstil im Markenprofil)?
2. Zahl-Zähler aktivieren? Sichtprüfung `library/motion/zahl-zaehler/vorschau/`, dann im Chat «aktiviere Zahl-Zähler, Freigabe von <Name>» (er hat keine Idee, also keine Abnahme im Prüfplatz).
3. Gate 0: Passt `marken/alperna.json` (Farben, Schriften, Verbotene Wörter, Look-Beschreibung)? Wer gibt frei?
4. Passen die Limits (2 im Bau, 5 Pitches, 5 Ideen pro Video)?
5. Wer soll im Prüfplatz entscheiden (Andrej, Leander)? Beide brauchen Zugriff auf das Artifact, die Notion-Seite und eine eigene Notion-Verbindung in claude.ai.
6. Stunden pro Woche und Testprojekt (offene Punkte 3 und 7 des Bauplans).
