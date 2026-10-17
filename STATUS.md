# STATUS.md – video-studio

Stand: 17.10.2026, nach Eingang von **Bauplan v3** (`docs/plan/`). Etappe 1 (**Fundament und Motion-Werkstatt**) und Etappe 2 (**Notion, OneDrive, Prüfplatz, Einrichtung je Mac**) sind fertig. Als Nächstes: Phase 0 auf dem ersten Mac (`docs/phase0-mac.md`).
Phase 0 des Bauplans (Tests T1 bis T6) ist **nicht** gelaufen, weil sie M4/M5-Macs, echte Clips, Instagram und Notion-Praxis braucht.

`npm run check`: 514 Tests in 32 Dateien grün, Lint der Bibliothek ohne Fehler. `npm run selftest:render`: besteht (Linux, siehe «Gemessen»).
Prüfplatz: `scripts/pruefplatz-test.cjs` (Headless-Chrome, nachgebautes Notion, Modus `view`), 14 Prüfungen bestanden. Er gehört nicht zu `npm run check`, weil er Playwright braucht.

## Entscheide aus dem Chat (17.10.)

- Eigenes Repo `AlpernaGmbH/video-studio` (das `studio/` im Website-Repo ist entfernt, die Website ist unverändert).
- Marke: **Alperna Design System (zweites, 17.9.)**: gedämpftes Blau ohne schwarzen Hauptgrund, Gold `#FFD700` als einziger Akzent. Profil `marken/alperna.json`.
- Alles über Claude und Claude Code, **nie über die Claude-API**. Darum ist der Prüfplatz ein Artifact, das die Notion-Verbindung des Menschen benutzt.
- Texte in Notion, Medien in OneDrive, Code im Repo. Ein zweiter Mac wird mit `init` und `doctor` eingerichtet (Skill `studio-einrichten`).

## Plan v3: Geltung, Funde, Widersprüche

Plan v3 (`docs/plan/bauplan-v3.md`, Quelle `.docx` daneben) gilt zusätzlich zu v2 (`docs/plan/bauplan-v2.md`); bei Widerspruch gilt v3. Aus dem Video-Editing-System wird ein Content-System:
Rückgrat (Inhalte, Tor 0, Tor I, Tor P) zuerst, dann ein Reel mit Editor, dann Textformate, Carousel, Lernen, Automationen. Der Prüfplatz hat Tor P schon in Form der Abnahme.
Entschieden und übernommen: Marke gilt, Schnittstil als Feld im Markenprofil (Abschnitt 9.1, noch nicht im Code), Start an einem Computer.

**Gefunden beim Lesen von Notion und n8n (17.10., nur gelesen):**

1. **Content-Ideen hat keine Zeilen** [Wahrscheinlich]: Die Standardansicht liefert weder aktive noch archivierte Zeilen, und Notion zeigt keine Beispielseiten. Plan 13.1 und 13.2 und Kapitel 8 (Umzug mit Stichtag) erledigen sich dann.
2. **Viral Watcher** sind zwei n8n-Workflows («Viral Watcher · LinkedIn», «… · Instagram»), beide **nicht aktiv** (letzte Änderung 26. und 27.06.2026) [Sicher]. Sie schreiben **nicht** in Content-Ideen, sondern in eine andere Notion-Datenbank
   (Kennung `f4eda334…`, Status «Neu») und schicken einen Mail-Digest. Der Plan vermutete anderes («Läuft [Vermutung]»).
3. **Die Analyse im Viral Watcher ruft die Claude-API direkt auf** (`api.anthropic.com/v1/messages`, Modell `claude-sonnet-4-6`, Zugang über ein Header-Credential) [Sicher]. Das widerspricht der Regel «nie über die Claude-API». Plan 4.4 würde ihn «umhängen».
4. **Notion-Kontingent:** SQL und der Modus `rows` von `notion-query-data-sources` sind nach wenigen Abfragen aufgebraucht («usage_limit_reached»). Der Prüfplatz fragte so ab und wäre im Betrieb daran gescheitert. Er liest seit Version 2 über eine gespeicherte Ansicht (Modus `view`, ohne Kontingent). Siehe `docs/notion-und-pruefplatz.md`.
5. Dein Test des Prüfplatzes steht in Notion: Beispielzeile mit Entscheid «freigegeben», Name Andrej, 17.10. 09:44 UTC. Damit ist T3 für **eine** Person belegt. Nicht belegt: Leander, Handy, Safari.

**Wo ich dem Plan widerspreche** (Begründung, Alternative, Risiko):

- **Neue Datenbank «Inhalte» statt Erweiterung.** Weil Content-Ideen leer ist (Fund 1), gibt es nichts umzuziehen und keinen Stichtag. Alternative: Content-Ideen in «Inhalte» umbenennen und die Felder aus Abschnitt 3.2 ergänzen.
  Risiko: Verweise des Cockpits zeigen weiter auf dieselbe Datenbank (gut), aber der «Rückweg» des Plans entfällt. Bei einer leeren Datenbank ist er unnötig. Vor dem Entscheid bitte bestätigen, dass Content-Ideen wirklich leer ist.
- **Viral Watcher umhängen.** Alternative: Scrapen und Erkennen (Apify, Median-Regel) darf in n8n bleiben, die Analyse macht Claude in einer Sitzung (claude.ai oder Claude Code), nicht n8n. Risiko: mehr Handarbeit je Woche. Vorteil: keine zweite Claude-Abrechnung neben euren Abos.
- **Phase 0 enthält T2 und T7, die Code brauchen.** T2 misst den Skript-Abgleich, T7 den Markierungs-Kreislauf mit Editor. Beides baut der Plan erst in Phase 2. Alternative: Phase 0 sind T1, T1b, T3, T4, T5, T8. T2 und T6 sind die ersten Aufgaben von Phase 2, T7 die Abnahme von Editor 1.
- **«Phase beginnt erst nach Abnahme der vorigen.»** Das Rückgrat braucht keinen Mac. Alternative: Teile von Phase 1, die nicht von T1 bis T5 abhängen (Schema «Inhalte», Schnittprofil im Markenprofil, Gate 0 auslösbar, Tor I im Prüfplatz), parallel starten. Risiko: Fallen T1 oder T1b durch, ändert sich nur das Reel-Modul, nicht das Rückgrat. **Wartet auf dein Ja.**

**Stand der Phase-0-Tests**

| Test | Stand |
|---|---|
| T1 | Teilwert Overlay auf Mac mini M4: 2,0- bis 2,5-fache Echtzeit, vier Beispiele bestanden. Gesamttest (10 s mit Captions, Zoom, Effekt) erst mit Pipeline. M5 fehlt |
| T1b | Mac mini M4 (16 GB): 2,4 s fest plus 0,85 s je Sekunde Video, sechs Overlays einzeln 27 s, als eine Komposition 15 s. Empfehlung: eine Datei je Overlay (siehe «Gemessen»). Zweiter Mac (M5) fehlt |
| T2 | braucht Skript-Abgleich (nicht gebaut) |
| T3 | bestanden für eine Person (Andrej), Leander offen |
| T4 | **Entschieden ohne Test (Andrej, 17.10.2026): 25p.** Instagram-Vergleich 25p/30p nicht gemacht. Risiko: Ruckeln bei Kameraschwenk nach der Neukodierung durch Instagram bleibt ungeprüft. Falls Reels später ruckeln, ist der Test in zehn Minuten nachzuholen (`docs/phase0-mac.md`, Abschnitt 4) |
| T5 | Einrichtung auf dem Mac mini erledigt (Studio in `OneDrive-Royalsocials(2)/03_Marketing/Studio`, eine Videodatei in `rohmaterial`). Die Zeitmessung «Speicherplatz freigeben» steht aus. Entfällt, wenn die Medien über `init --medien` auf ein Laufwerk ausserhalb von OneDrive gehen (frei: 30 GB auf dem Mac) |
| Notion-Ansicht | Aus einer Cloud-Sitzung gelesen: 1 Zeile («Beispiel: Wert-Verlauf», Entscheid freigegeben von Andrej). Claude Code auf dem Mac mit Notion ist **nicht** geprüft (wird erst mit der Pipeline gebraucht) |
| T6, T7 | brauchen Code und Testprojekt |
| T8 | Teilweise erledigt: `docs/t8-google-maps.md` (Beitragstypen, Fotoregeln, Verbote, Branchen mit Einschränkung). Lücke: maximale Textlänge |

**Offene Punkte aus Kapitel 13 des Plans:** 1 und 2 beantwortet (Funde 1 und 2, Bestätigung nötig), 3 bis 4 offen, 5 (leere Datenbank «Ideen» und Beispielzeile löschen, Umbenennung in «Motion-Ideen») wartet auf dein Ja,
6 (Zahl-Zähler aktivieren) wartet auf dich, 7 (altes Claude-Docs-Dokument) wartet auf dein Ja, 8 (GSAP-Lizenz): bitte `gsap.com/standard-license` lesen, 9 und 10 offen.

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

## Inhalte-Modul (Phase 1, begonnen am 17.10.)

Gebaut in `src/inhalte/` (Plan v3, Kapitel 3 und 7), 150 Tests, jede Regel per Mutation gegengeprüft:
- `inhalt.ts` Zeile ↔ Inhalt (Datenbank «Inhalte»), schreibt nie einen Entscheid ausser «offen»/leeren.
- `regeln.ts` alle Übergänge des Lebenslaufs: Pflichtangaben, Tor I und Tor P nur mit Mensch mit Namen, Gate 0, «Kein Post ohne Rohstoff», Dublettenprüfung über 90 Tage (Wortmenge, Zahlen vereinheitlicht, Schwelle 0,85), Grund aus zwei Wörtern.
- `abgleich.ts` liest alle Zeilen gegen den Stand, übernimmt erlaubte Wechsel, setzt unerlaubte zurück, löst nach einem Tor den nächsten Status aus, leert Entscheide ohne Namen oder von früher.
- `stand.ts` Stand in `<Studio>/daten/inhalte-stand.json` (Version, atomar). `marken.ts` Gate 0 gilt nur mit Namen. `textpruefung.ts` deterministische Textprüfung ohne Claude-Aufruf.
- CLI: `inhalte abgleich`, `inhalte textpruefen`, `inhalte pruefung`. Skill `inhalte-werkstatt`.

**Fund beim Bauen:** Ein Entscheid, der im selben Zeitraum fällt, in dem die Zeile die Stufe erreicht, wurde zuerst als «von früher» gelöscht. Behoben: Der Stand hält einen Entscheid erst beim Verlassen der Stufe fest.

**Offen:**
1. In der Notion-Datenbank «Inhalte» fehlen zwei Textspalten: **«Status von»** und **«Status-Grund»**. Ohne sie lassen sich Pausieren, Verwerfen aus der Produktion und «Veröffentlicht» bei Manuell/Paket nicht von Hand setzen (der Abgleich setzt sie zurück). Der Prüfplatz füllt sie später. Wird mit den übrigen Datenbanken ergänzt.
2. `marken/alperna.json` hat `schnittprofil.textlaengen` leer: Die Längenprüfung des Texts ist damit aus. Zahlen dafür fehlen (keine Zahl ohne Quelle). Bitte Zielwerte je Format nennen.
3. Ein Name im Entscheid ist keine Anmeldung. Wer in Notion schreiben darf, kann jeden Namen eintragen. Der Code verhindert Systemnamen und leere Namen, nicht Fälschung. Das ist die Grenze des Modells ohne Konten.
4. Prüfplatz (Version 3): Tor I, Tor P, Wochenmodus und Gate 0 stehen. Es fehlen die Handlungen **Pausieren, Verwerfen und «Veröffentlicht» bestätigen** (sie schreiben «Status von» und «Status-Grund», siehe 1.), die Auswahl der Marke je Kunde und Räume.
5. **Gate 0 → Repo:** Die Freigabe in Notion setzt `marken/alperna.json` nicht auf «freigegeben». Dafür fehlt noch ein Befehl, der die Freigabe mit Namen aus der Ansicht «Marken» ins Profil übernimmt (`status`, `freigabe`). Bis dahin bleibt `--final` gesperrt.
6. Wer Gate 0 für Alperna freigibt, entscheidet ihr. Es fehlen laut Profil Logo, Caption-Preset und Schlusskarte.

## Prüfplatz: was geprüft ist und was nicht

Stand: **Version 3** (17.10.2026) liest drei Ansichten (Ideen, Inhalte, Marken) und braucht zusätzlich das Notion-Werkzeug `notion-fetch` (Entwurfstext). Die Deklaration des Artifacts ist erweitert,
claude.ai fragt deshalb beim nächsten Öffnen neu nach der Zustimmung.
Neu seit Version 2: Tor I (Freigeben, Mit Frage zurück, Ablehnen), Tor P (Entwurf aus der Notion-Seite, Freigeben, Änderung nötig), Wochenmodus (alle neuen Ideen nacheinander, mit Fortschritt und Überspringen),
Gate 0 als Handlung mit Bestätigung und Namen, Tab «Inhalte». Eine ausgefallene Ansicht «Inhalte» oder «Marken» legt die Motion-Ideen nicht lahm.
29 Browser-Prüfungen, 14 Mutationen der Seitenlogik einzeln ausgeschaltet und erkannt. Spaltennamen und Auswahlwerte gegen die echten Datenbanken «Inhalte» und «Marken» geprüft.

Geprüft (Headless-Chrome mit nachgebautem Notion, das die an der echten Datenbank beobachteten Antwortformen liefert): Karten, Pflichtfelder, genaue Schreibfelder,
frisch lesen vor Schreiben, Nachlesen, veralteter Entscheid wird nicht überschrieben, getrennte Texte für verweigerten Zugriff, fehlende Verbindung, Richtlinie und unklaren
Ausgang, kein waagrechtes Scrollen bei 390 px, Tastaturbedienung, keine Konsolenfehler, nur erlaubte Hosts (Schriften), kein Emoji.

**Nicht geprüft** (geht von hier aus nicht):
- die echte Zustimmungsabfrage von claude.ai beim ersten Speichern und die echten Fehlercodes des Konnektors;
- die Form der Antwort von `notion-fetch` im Viewer: Der Code sucht `<content>…</content>` im Feld `text` (so liefert es das Werkzeug in dieser Sitzung, beobachtet an einer echten Seite);
- die tatsächliche Form von `result.payload` im Viewer (der Code liest `payload`, sonst den Text des ersten Blocks als JSON);
- Schriften Poppins und Montserrat (im Test gesperrt, es erscheint der Ersatz), Safari und echtes Handy;
- ob `Notion` der richtige Anzeigename deines Konnektors ist (Erwartung: ja, so heisst er in dieser Session).
Beim ersten Gebrauch bitte genau einen Pitch freigeben und in Notion nachsehen, ob die Felder stimmen.

## Gemessen auf dem Mac mini (Apple M4, 10 Kerne, 16 GB, darwin arm64, HyperFrames 0.8.164 (gepinnt), Chrome Headless Shell 152, 17.10.2026)

`npm run selftest:render`: bestanden. `npm run t1b`: bestanden.

| Was | Wert |
|---|---|
| Overlay 2,4 bis 3,0 s als WebM mit Alpha (vier Beispiele) | 4,9 bis 7,4 s Renderzeit (2,0- bis 2,5-fache Echtzeit) |
| `hyperframes check` | 9,9 s |
| T1b, Modell | Renderzeit = 2,4 s fest + 0,85 s je Sekunde Video |
| T1b, sechs Overlays zu 2,5 s (15 s) | einzeln 27 s, als eine Komposition 15 s, Unterschied 12 s |

**Einordnung.** [Sicher] Das ist ein einzelnes transparentes Overlay, nicht T1. T1 verlangt höchstens 3-fache Echtzeit für 10 s mit Captions, Zoom und einem Effekt.
[Wahrscheinlich] Das Overlay allein liegt schon bei 2,0 bis 2,5, die Reserve bis 3 ist klein; ob T1 hält, zeigt erst die Pipeline mit echtem Reel.
**T1b-Empfehlung:** Der feste Aufwand ist auf dem Mac klein (2,4 s). Eine Datei je Overlay kostet bei sechs Overlays 12 s mehr, bleibt cachefähig und engine-neutral.
Entscheid für «eine Datei je Overlay», solange T1 mit der Pipeline nicht das Gegenteil zeigt. **Wartet auf dein Ja.** Der M5 fehlt noch.

## Gemessen auf Linux (Container, nicht der Zielrechner; x64, 4 Kerne Xeon, 16 GB, Software-GL, HyperFrames 0.8.164, Chrome Headless Shell 152)

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
- HyperFrames sendet standardmässig anonyme Nutzungsdaten. Pro Rechner `npx hyperframes@0.8.164 telemetry disable` (im Container dieser Session ist es abgeschaltet, auf den Macs noch zu tun).

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
6. Gate 0 im Prüfplatz ist gebaut (Version 3). Offen: die Übernahme der Freigabe ins Repo-Profil (siehe «Inhalte-Modul», Punkt 5).

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
