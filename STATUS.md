# STATUS.md – studio

Stand: 16.10.2026. Erste Etappe: **Fundament und Motion-Werkstatt**. Phase 0 des Bauplans (Tests T1 bis T6) ist **nicht** gelaufen,
weil sie M4/M5-Macs, echte Clips, Instagram und Notion braucht. Gebaut wurde, was sich ohne diese Dinge bauen und prüfen lässt.

`npm run check`: 296 Tests in 20 Dateien grün, Lint der Bibliothek ohne Fehler. `npm run selftest:render`: besteht (Linux, siehe «Gemessen»).

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

1. **Ort: `studio/` im Website-Repo.** Es gibt nur dieses Repo in der Session. Das Paket ist eigenständig (eigene `package.json`, keine Importe aus der Website)
   und lässt sich mit `git subtree split --prefix=studio` in ein eigenes Repo verschieben. **Empfehlung: eigenes Repo `alpernagmbh/video-studio`.**
   Eingriffe in die Website: `tsconfig.json`, `vitest.config.mts`, `eslint.config.mjs` schliessen `studio` aus, `.vercelignore` hält es aus dem Vercel-Upload.
2. **Kap. 3.6 (Wellen) ist das Startset, nicht die ganze Bibliothek.** Danach wächst sie über die Schleife. Von den 9 Effekten der Welle 1 ist **einer** gebaut (Zahl-Zähler).
3. **Stück-Vertrag Overlay:** (Variablen, Dauer, Marke) → transparentes WebM. Effekte, die das Basisvideo verändern (Zoom, Freisteller, Frame Break), sind `ausgabe: komposition`
   und noch nicht umgesetzt.
4. **Neue Regeln (Vorschlag, nicht im Bauplan):** höchstens 2 Stücke gleichzeitig im Bau, höchstens 5 offene Pitches, mindestens 2 weitere Einsätze im Pitch, höchstens 5 neue Ideen pro Video,
   Ablehnung nur mit Grund. Zahlen sind Startwerte, in `src/motion/idee.ts` änderbar.
5. **Sicherheitsrand:** unten und rechts 20 % (Bauplan 3.10, dort Vermutung), oben 8 % und links 5 % sind meine Annahme. Eine Stelle: `SICHERHEITSRAND` in `src/motion/render.ts`. Test T4 und echte Reels klären es.
6. **Markenprofil Alperna ist ein Platzhalter** (`marken/alperna.json`, Status `platzhalter`): Hex-Werte für Deep Black und Violett-Blau fehlen (Bauplan, offener Punkt 1). Mit Platzhalter sind nur Entwürfe möglich, `--final` wird verweigert.
7. **Speicher:** Ideenprotokoll und Ereignisse als Dateien in `data/` mit Versionsprüfung. Übergang bis zur Notion-Anbindung (Phase 1).
8. **Zeitpunkt «Mensch»:** Der Namenstest ist keine Authentifizierung (siehe `docs/motion-werkstatt.md`).
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
| HyperFrames 0.8.164 | Render-Engine, per `npx` (nicht in `package.json`), Version in `src/motion/render.ts` gepinnt | Apache 2.0 |
| Poppins, Montserrat (woff2) | aus `public/fonts/` der Website kopiert | OFL, Lizenztexte liegen bei |

## Nicht gebaut (Reihenfolge der nächsten Schritte)

1. **Phase 0 auf den Macs:** T1 (`selftest:render`), T2 (Whisper, 3 echte Clips), T3 (Artifact und Notion), T4 (25p/30p bei Instagram), T5 (OneDrive), T6 (Take-Auswahl).
2. **Phase 1:** Notion-Datenbanken (Projekte, Skripte, Marken, Katalog, Regeln, Ereignisse, plus Ideen), Gate 0 mit echtem Markenprofil, Katalog benennen (20 Dateien zum Messen der Tokenkosten).
3. **Phase 2 (Durchstich):** Ingest, Transkription, Skript-Zuordnung, Take-Auswahl, Schnitt, Captions, Storyboard, Vorschau, finaler Render, Qualitätsprüfung, Übergabe.
   Der Prototyp der Skript-Zuordnung (Bauplan 3.2, «bereits gebaut und getestet») liegt **nicht** im Repo. Bitte liefern, sonst baue ich ihn neu.
4. **Welle 1** (8 weitere Stücke), danach Welle 2 und 3 und die ersten echten Ideen aus echten Videos.
5. **Prüfplatz** (Artifact) für Pitch, Looks, Abnahme. Bis dahin laufen die Entscheide über CLI und Notion-Seite.
6. Lernsystem: Regelvorschläge aus den Ereignissen (Schema und Ereignisse stehen, der Vorschlags-Aufruf nicht).

## Fragen an euch

1. Eigenes Repo für `studio/`? Name und Besitzer.
2. Zahl-Zähler aktivieren? Dazu `npm run studio -- motion aktivieren zahl-zaehler --mensch --by <Name>` nach Sichtprüfung von `library/motion/zahl-zaehler/vorschau/`.
3. Passen die Limits (2 im Bau, 5 Pitches, 5 Ideen pro Video)?
4. Soll Notion die Ideenliste führen (Empfehlung) oder zunächst die Datei?
5. Hex-Werte Deep Black und Violett-Blau, Stunden pro Woche, Testprojekt (offene Punkte 1, 3, 7 des Bauplans).
