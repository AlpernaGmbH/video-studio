# Bauplan v4: Vom Video-Studio zum Marketing-System (21.10.2026)

**Stand:** freigegeben am 21.10.2026. Gilt vor `bauplan-v3.md` und `bauplan-v2.md`, wo sie sich widersprechen (zum Beispiel v3 Kapitel 9.1 «Schnitt schnell»). Umsetzungsstand je Phase in `STATUS.md`. Phase 0 und 1 werden gebaut, Phase 2 bis 5 erst nach den Bedingungen im Abschnitt «Phasen».

## Kontext

Der erste echte Testlauf (10 Minuten Log-Rohmaterial, Export 36 s) hat gezeigt: Die Technik läuft, aber das Ergebnis wirkt billig, und der Ablauf ist lang, handarbeitslastig und unsichtbar (kein Fortschritt, kein Handy-Zugang). Du willst daraus ein Marketing-System machen: Claude Code auf dem Mac und in der Cloud arbeitet, alles landet in Supabase, im Alperna-Tool siehst du Fortschritt, gibst frei und startest Sitzungen, auch vom Handy. Dazu kommen eine Bibliothek (Ideen, Hooks, Muster, Shots, B-Roll, Grafiken, Inspiration), eine Strategie-Ebene (TOFU/MOFU/BOFU) und bessere LinkedIn-Beiträge, Carousels und Ads.

Dieser Plan ersetzt in `docs/plan/` die Stellen von v3, die dem widersprechen (v4 gilt vor v3).

## Entschieden von dir (21.10.)

- **Nur ruhig-premium.** Tempo ist nicht das Problem, billige Anmutung ist es. Gute Edits dürfen schnell sein, wenn sie hochwertig aussehen.
- **Alles in Supabase** (Alperna-Tool). Notion wird Archiv und Import-Quelle.
- **Sitzungen:** Mac-Warteschlange (Schnitt, braucht Medien) und Cloud (Text, Analyse, Planung), beide auch vom Handy auslösbar.
- Zooms erst am Schluss setzen, nicht automatisch bei jedem zweiten Schnitt.

## Befunde aus dem Testlauf

| Beobachtung | Ursache | Beleg |
|---|---|---|
| Hektisch, billig | Schnittprofil erzwingt Einstellungen ≤ 1,5 s und Zoom bei jedem 2. Clip; Plan v3 §9.1 schreibt «Schnitt schnell» fest | `marken/alperna.json:21-28`, `planbau.ts:205`, v3 §9.1 [Sicher] |
| 40 Zooms in 30 s | Jede Wortlücke > 0,25 s ergibt einen Clip (Mikro-Clips, im Schnitt 0,4 s), dazu Zoom auf jedem zweiten | `planbau.ts:130`, `:205`, Rechnung des Agenten [Wahrscheinlich] |
| Sätze abgeschnitten | Fehlhört Whisper erstes oder letztes Wort, fällt es aus dem Take; Nachlauf nur 0,1 s | `zuordnung.ts:251-252`, `planbau.ts:33-34,141` [Sicher] |
| Regieanweisungen im Video | Zusatzwörter werden nur gemeldet, nicht geschnitten; Neustart-Liste kennt «Action», «ok», «los» nicht; Vorspann vor dem Take wird nie geprüft; Precision zählt im Ranking nicht | `zuordnung.ts:28,230-240,293,399`, `planbau.ts:110` [Sicher] |
| Skript stimmt nicht immer | Untertitel nehmen standardmässig den Skripttext, nicht das Gesprochene | `planbau.ts:193` [Sicher] |
| Ton und Video getrennt | Keine Synchronisation; `reel` ignoriert WAV/M4A/MP3 still; Whisper hört nur die Kameraspur | `reel.ts:94,101`, `whisper.ts:80-82` [Sicher] |
| Bild flach, Log | Kein Grading: LUT nur als Platzhalter; Messung deines Exports: mittlere Sättigung ≈ 6 (praktisch grau) | `marken/alperna.json:29`, `uebergabe.ts:199`, ffmpeg-Messung [Sicher] |
| Zu wenige Grafiken | Genau ein Stück (`zahl-zaehler`, nicht aktiv), keine Mockups; der Auftrag nennt keine Mindestdichte für Grafiken | `library/motion/`, `storyboard.ts:63,83` [Sicher] |
| Export schwach | 4,8 Mbit/s; das Reel-Preset verlangt 8 bis 10 Mbit/s CBR | ffprobe, `presets/export/reel.json` [Sicher] |
| Lautheit | −13,9 LUFS, Peak −1,4 dBFS: innerhalb Preset | ffmpeg ebur128 [Sicher] |
| Dauert lange | Whisper large-v3 auf CPU, Dateien nacheinander, kein Hash-Cache; Pegel 2× gerechnet; Grafiken nacheinander mit je einem `npx`-Start; Vorschau mit einem `-ss`-Eingang je Clip | `whisper.ts:13,27`, `reel.ts:306-313`, `storyboard-befehle.ts:105-107`, `vorschau.ts:58` |
| Kein Fortschritt, kein Handy | Prüfplatz ist ein Claude-Artifact über Notion; ohne Laufzeitzustand der Arbeit | `pruefplatz/index.html` |

Nicht gesehen: das Bild deines Exports (ich kann keine Frames ansehen), die Instagram-Links (Firecrawl unterstützt Instagram nicht, direkter Abruf gibt 429). Alle Inspiration läuft deshalb über Dateien, die du ablegst (Phase 3). Die 28 Links stehen als Quellenliste in Anhang C.

## Meine Entscheide (du kannst sie beim Freigeben kippen)

1. **Zoom** ist kein Planbau-Automatismus mehr. Standard: kein Zoom. Das Storyboard bekommt ein Feld `zooms` (nur auf betonten Wörtern, begrenzt pro Minute, mit Begründung). Mikro-Clips unter 0,7 s werden verschmolzen (Parameter `minClip`).
2. **Untertitel** nehmen standardmässig das Gehörte, der Skripttext dient nur der Zuordnung.
3. **Gegenlesen ist Pflicht** vor dem Storyboard: `reel vorbereiten` schreibt `gegenlesen.md` (je Clip: Skript, Gehörtes, 1 s Kontext davor und danach), Claude liest es vollständig und markiert Regie, Abbruch und Verhörer. `reel storyboard` läuft nur mit bestätigtem Gegenlesen.
4. **Zweite Achse «Muster»** für deine 13 Erzählformate (Red Flag/Green Flag usw.), weil «Format» in v3 die Medienart meint (Reel, Carousel, …).
5. **Funnel** als Pflichtfeld jedes Inhalts: `funnel` (TOFU/MOFU/BOFU) und `absicht` (Attention/Trust/Sales), dazu `inhaltstyp` (Explain, Trend, Sale, Proof).
6. **Regel 2 (drei Looks je Stück) gilt künftig je Familie**: Für eine Familie (z. B. Ranking-Grafiken, Mockups) zeigst du drei Looks, wählst einen, danach entstehen alle Stücke der Familie in diesem Look. Das ändert eine harte Regel und braucht dein ausdrückliches Ja.
7. **Veröffentlichung:** Zuerst «Paket» (Text, Bild, Termin, ein Mensch postet). Automatisch posten kommt mit Phase 5, weil Taplio gestrichen ist (v3 Z.562).
8. **Notion-Import** mit Stichtag, kopieren statt verschieben, Notion bleibt unverändert (wie v3 §8). Private Daten von Mitarbeitenden kommen nicht ungeprüft mit.

## Phasen

| Phase | Inhalt | Repo | Abhängig von |
|---|---|---|---|
| 0 | `bauplan-v4.md`, STATUS und CLAUDE.md nachführen | video-studio | Freigabe |
| 1 | Schnittqualität und Premium-Look | video-studio | nichts |
| 2 | Plattform: Supabase, API, Fortschritt, Warteschlange, Freigaben, Handy | tool (+ video-studio-Client) | Zugriff aufs Tool-Repo |
| 3 | Bibliothek, Muster, Strategie, Videoanalyse, Bewertung | tool + video-studio | Phase 2 |
| 4 | LinkedIn, Carousel, Ads, Wiederverwertung | beide | Phase 3 |
| 5 | Automationen (n8n), Lernen, Veröffentlichung | beide | Phase 4 |

Phase 0 und Phase 1 sind freigegeben. Phase 2 beginnt, wenn du das Datenmodell (Anhang B) bestätigt hast und der Schreibzugriff auf `AlpernaGmbH/tool` aus der Sitzung geprüft ist (Sitzungs-Scope nennt nur `alperna-website-v2`; nötigenfalls `add_repo`).

## Phase 1: Schnittqualität und Premium (video-studio)

**1.1 Takes und Regie** (`src/schnitt/zuordnung.ts`, `planbau.ts`, `bericht.ts`)
- Rand-Anker unscharf (Editierabstand ≤ 2 bei Wörtern ab 5 Buchstaben), damit «Küche/Kirche» den Take nicht abschneidet (`zuordnung.ts:251-252`).
- Ende des Clips bis zur nächsten Stille (Wortende + min(0,6 × Lücke, 0,35 s)) statt fester 0,1 s (`planbau.ts:33-34,141`).
- Precision ins Ranking (`zuordnung.ts:293`): Takes mit Fremdwörtern verlieren.
- Regie-Liste erweitern (action, kamera, ok, los, «und bitte», klappe, läuft, ton, schnitt), Vorspann und Nachspann je 2 s prüfen, erkannte Regie-Wörter schneiden, wenn Wortzeiten echt sind, sonst markieren.
- `gegenlesen.md` und Sperre in `reel storyboard`; Untertitel-Standard «gehört» (`planbau.ts:193`).
- Modus `--ohne-skript`: Claude liest das Transkript mit Zeiten und schreibt `auswahl.json` (Wortbereiche); der Code baut den Plan aus den Wortzeiten (Wiederverwendung von `bauePlan`).

**1.2 Zoom und Takt** (`schemas.ts:45-57`, `planbau.ts:187,205`, `storyboard.ts`, `core/storyboard.ts`, `fcpxml.ts:185`)
- Schnittprofil: `zoom: { modus: "aus" | "betonung", maxProMinute }`, neues `minClip`. Planbau setzt keinen Zoom mehr.
- Storyboard-Feld `zooms` mit Prüfung (nur auf betonten Wörtern, Höchstzahl, Begründung). FCPXML: Zoom als Keyframe-Animation (sanfter Push) zusätzlich zum festen Skalieren; OTIO behält den Zoom als Metadatum (bekannte Grenze, `otio.ts:61`).
- Auftrag (`storyboard.ts:63`): «Bildwechsel alle 1,5 s» ersetzen durch «alle 4 bis 6 s eine visuelle Ebene (Grafik, B-Roll, Mockup), Zoom zählt nicht».

**1.3 Getrennter Ton** (neu `src/schnitt/ton-sync.ts`; `reel.ts:94`, `plan.ts`, `fcpxml.ts`, `otio.ts:64`, `vorschau.ts:62`, `energie.ts`)
- Audiodateien im Aufnahmenordner erkennen (wav, m4a, aif, mp3, flac). Paarung zuerst über Timecode/Aufnahmezeit, sonst Kreuzkorrelation (8-kHz-Mono, ffmpeg-Dekodierung, Rechnung im Python der Whisper-Umgebung mit numpy, keine neue npm-Abhängigkeit). Ergebnis: Versatz in Sekunden und ein Konfidenzwert; unter der Schwelle fragt Claude nach.
- Schema: Videoquelle bekommt `ton: { quelle, versatz }`. Whisper hört die bessere Spur, Zeiten werden über den Versatz zurückgerechnet. FCPXML/OTIO/Vorschau nutzen den externen Ton, die Kameraspur bleibt stumm.
- Warnung, wenn ein Video keinen Ton hat und kein Audio gefunden wurde (`fcpxml.ts:84`, `vorschau.ts:62`).
- Test mit synthetischen Dateien (bekannter Versatz per `adelay`) und Mutationsproben. Ungeprüft bleibt, ob Resolve die FCPXML-Audiospur ohne Warnung öffnet (T9).

**1.4 Farbe und Grading** (neu `src/schnitt/farbe.ts`, `lut.ts`; `katalog/scan.ts:96`, `vorschau.ts`, `uebergabe.ts:199`, `schemas.ts:114`)
- Log-Erkennung: ffprobe (`color_transfer`, Hersteller-Tags) plus Messung (Sättigung, Kontrast über `signalstats`); Quelle bekommt `farbe: "log" | "rec709"`, Katalog setzt `log` (heute immer `false`).
- Look in der Marke: `look.lut` (Datei `.cube` unter `marken/<key>/lut/`). Vorschau wendet `lut3d` nur auf V1 an, Grafiken und B-Roll nicht. Übergabe legt die LUT in den Resolve-Ordner, LIESMICH sagt: LUT nur auf Spur V1 anwenden.
- B-Roll ohne Log bekommt einen Angleich («sieht wie gegradetes Log aus, aber nicht gleich»), als zweite LUT oder Vorschlag in LIESMICH.
- LUT-Erzeugung: Hersteller-Konvertierung (Kamera und Log-Profil klären, siehe «Von dir») plus Alperna-Look (kühl, kontraststark, leicht entsättigt, `alperna.json:29`) als testbarer `.cube`-Generator. Hautton-Kalibrierung am Vectorscope macht ein Mensch.

**1.5 Premium-Look v2 und Grafiken**
- Drei Looks zeigen (Motion-Sprache: Easing, Typo-Skala, Grain, Glasflächen, Gold nur als Akzent), du wählst; neue Markenfassung mit Gate 0 durch dich (die jetzige ist freigegeben trotz fehlendem Logo, Caption-Preset, Schlusskarte).
- Erste Familien: Mockups (Instagram-Profil, Google-Maps-Liste, Handy mit wechselbarem Screen), Text/Hook (Hook-Karte, Keyword-Pop, Lower Third), Ranking (Tier-Ranking, Top-10, Bad/Good/Great). `zahl-zaehler` aktivierst du nach der Vorschau mit einem Ja. Entwürfe laufen über `./studio motion neu`.
- Untertitel-Standard `ruhig-unten`; Export-Hinweis (8 bis 10 Mbit/s) in LIESMICH.

**1.6 Messung** (neu `./studio reel messe <video>`; Wiederverwendung `presets/messen.ts` `messeDatei`, `lauf`)
- Misst, was ich von Hand gemessen habe: Dauer, Bitrate, Schnitte/Minute, Zoom-Zahl (aus dem Plan), Sättigung, Kontrast, LUFS, Spitze, Stille, Zeit bis zur ersten Aussage. Schreibt `qualitaet.json`. Basis für Premium-Prüfung (Phase 1) und Bewertung (Phase 3). `export-pruefen` läuft danach automatisch.

**1.7 Tempo** (`whisper.ts`, `reel.ts`, `energie.ts`, `storyboard-befehle.ts`, `vorschau.ts`)
- Benchmark T2b auf deinem Mac mit einem Clip: `large-v3`, `large-v3-turbo`, mlx-whisper oder whisper.cpp (Zeit und Wortfehler gegen 60 s von dir korrigierter Referenz). Entscheid erst nach Messung.
- Transkript-Cache nach Datei-Hash; Pegel-Cache; Grafiken parallel rendern und per Hash cachen (`batchArgs` in `render.ts:69` verdrahten); Vorschau aus vorgeschnittenen Segmenten statt 80 `-ss`-Eingängen.
- Jeder Schritt meldet Dauer und Status (Vorbereitung für Phase 2).

**1.8 Skill und Doku:** `reel-werkstatt` (Gegenlesen, Zoom am Schluss, Ton, Grading, Messung), `STATUS.md`, `README.md`.

## Phase 2: Plattform im Alperna-Tool

- **Migration** `supabase/migrations/2026…_studio_grundlage.sql`: `studio_contents` (Inhalt, Medienart, Muster, Funnel, Absicht, Status, Tore), `studio_jobs` (Art, Ziel `mac|cloud`, Status, Notizen, Schritte als jsonb, beansprucht von, Zeitstempel), `studio_events` (Fortschritt), `studio_devices` (Gerät, Token als Hash, zuletzt gesehen), `studio_decisions` (Tor I, Tor P, Look, Abnahme: wer, wann, Grund). RLS nach Muster `app.is_intern()`, Kunden nie; SQL-Test in `supabase/tests/`.
- **API** `app/api/studio/*` (Eintrag in `PUBLIC_PREFIXES` in `proxy.ts`), Gerätetoken statt geteiltem Secret, Zod in `lib/validation/studio.ts`, idempotent über `external_id` (Muster `app/api/website/lead/route.ts`, `lib/cron/auth.ts`). Benachrichtigungen über `lib/notifications` (neue Typen `studio.review`, `studio.job_failed`).
- **Oberfläche** `app/(app)/studio/`: Heute (offene Entscheide), Inhalte (Liste und Board), Detail (Schritte mit Dauer, Vorschau-Video, Kontaktbogen, Storyboard, Gegenlesen-Text, Messwerte, Freigabeknöpfe), Warteschlange, Geräte. Sidebar-Eintrag (`components/layout/app-sidebar.tsx`), Mobile-Tab (`lib/layout/mobile-tabs.ts`), Texte in `lib/i18n/de-CH.ts`. Fortschritt zuerst per Abfrage alle 10 s, Realtime später.
- **Medien:** Vorschau-Video (540p) und Kontaktbogen in einen neuen privaten Bucket (`portal-files` hat 20 MB und andere Zwecke); Originale bleiben auf der HDD.
- **Freigaben im Tool:** Tor I, Tor P, Look-Wahl, Abnahme, Änderungswunsch mit Zeitmarke im Video. Die Übergangslogik aus `src/inhalte/regeln.ts` wird nach `lib/studio/transitions.ts` kopiert (Regel 6: kein Import zwischen Repos), das Tool wird Eigentümer, video-studio fragt per API.
- **Client in video-studio** (`src/studio/`): `meldeSchritt`, `holeAuftrag`, `quittiere`, Befehl `./studio warteschlange`. Offline blockiert nie die Arbeit. Token in `~/.config/video-studio/config.json`.
- **Mac-Warteschlange:** Skill `studio-warteschlange` für Claude Code: Auftrag holen, Notizen des Auftrags in die Sitzung, Schritte ausführen, melden. Handy-Steuerung über Remote Control (`claude remote-control` im Ordner `video-studio`).
- **Cloud:** Knopf «In Claude öffnen» mit vorbereitetem Prompt (Auftrags-ID, Notizen, Link) für Textformate, Analyse-Auswertung und Planung. Das Link-Format und die Cloud-Umgebung (Secret, erlaubte Adresse des Tools) werden im ersten Schritt getestet; Rückfall ist «Prompt kopieren». Keine Claude-API (Regel 10).
- **Notion → Supabase:** Einmal-Import (`Inhalte` 98, `Rohstoffe` 48, `Inspiration`, `Motion-Ideen`) mit Vorschau, Stichproben und Stichtag; Kennzeichnung privater Zeilen; Notion bleibt unverändert und wird Archiv.
- **Prüfplatz-Artifact** bleibt bis zum Umzug der Freigaben bestehen und wird dann abgeschaltet.
- Pflichtregeln des Tools: `pnpm check`, de-CH ohne ß, Texte in `de-CH.ts`, Schema nur über Migrationen, Typen neu generieren, Zod `.optional()` für nicht gerenderte Felder, Next.js 16 (`proxy.ts`, `PageProps`).

## Phase 3: Bibliothek, Muster, Strategie, Analyse

- **Bibliothek** in Supabase (Anhang B): ein Modell für Idee, Hook, Muster, Shot, B-Roll-Verweis, Grafik, Trend, Inspiration, Regel, Vorlage, Sound. Katalog und Stücke werden verwiesen (`k-NNNN`, Stück-ID), nicht kopiert; Medien bleiben auf der HDD.
- **Startdaten:** die 13 Muster (Anhang A) mit Struktur-Entwurf, die 5 Trends aus deinem Text (Anhang D, du nanntest «sieben Slides, vier mit Erklärung», im Text stehen fünf), die 28 Inspirationsquellen (Anhang C, Status «Datei fehlt»), die Motion-Werkstatt-Schleife (Idee mit genauem Satz, Pitch, drei Looks, Bau, Abnahme) im Tool.
- **Strategie:** Pro Marke legst du Zielwerte für TOFU/MOFU/BOFU fest (deine Zahl, Regel 7). Ansicht «Mix der letzten 30 Tage gegen Ziel» und Warnung bei Tor I, wenn eine Stufe überrepräsentiert ist. Tore bleiben bei dir.
- **Videoanalyse fremder Videos** (`./studio analyse <datei>`): ffmpeg-Szenenwechsel pro Minute, LUFS, Whisper mit Zeiten, Kontaktbogen (Wiederverwendung `katalog/bogen.ts`, `schnitt/kontaktbogen.ts`), danach beschreibt Claude in der Sitzung: Abschnitte mit Zeiten (Hook, Value, Open Loop, CTA …), Art (Talking Head, …), Muster, Funnel, Grafiktypen, Schnitt- und Zoomstil, Sound, «Übertragbar auf Alperna». Gespeichert wird die Analyse, nie eine Kopie des Textes; der erste Satz nur als Zitat zur Analyse (v3 4.2 verbietet das Übernehmen im Wortlaut, STATUS Z.145 speichert ihn, das gleiche ich an). Dateien legst du in `inspiration/<Name>/` ab.
- **Bewertung eigener Videos auf allen Ebenen:** Scorecard je Inhalt: automatische Messwerte (Phase 1.6), Abschnittsstruktur, Muster, Funnel, Grafikanteil, B-Roll-Anteil, Hook-Zeit, Sprechtempo, Premium-Check, Urteil von Claude und von dir (1 bis 5 je Ebene), später Leistungszahlen (Views, Retention; zuerst von Hand). Vergleich gegen die Analysen der Vorbilder («Abstand zu Vorbild»). Die Markierungsarten aus v3 6.3 werden um Struktur, Format und Hook erweitert.
- **Review mit Zeitmarken** im Tool ersetzt den lokalen Editor aus v3 Kapitel 6 (Browser, Handy): Notiz bei Zeit X, Claude arbeitet sie ab, neue Fassung v2, v3.

## Phase 4: LinkedIn, Carousel, Ads, Wiederverwertung

- **LinkedIn:** Rohstoff → Entwurf mit Hook-Bibliothek und Muster, Textprüfung (`src/inhalte/textpruefung.ts`, im Tool nachgebaut), Mockup-Vorschau des Beitrags, Tor P, «Paket» als Veröffentlichung. «Kein Post ohne Rohstoff» bleibt Codeprüfung.
- **Carousel:** HyperFrames-Folien im Markenprofil (Titel, Text, Zahl, Liste, Schluss, animierte Varianten), 1080×1350, PDF für LinkedIn, Qualitätsprüfung nach v3 7.2 (Überlauf, Kontrast, Lesbarkeit). Bibliotheksbestand: Hooks, visuelle Hooks, Open Loop, Carousel-Guide aus deinen Links.
- **Ads:** Ad-Format-Bibliothek, Ad-Copy mit der Textprüfung (verbotene Wörter, keine Zahl ohne Beleg, keine Erfolgsgarantien). KI-Ads für Kunden: Regel 5 verbietet Kundenbilder an externe Dienste; Alperna-eigenes Material nur mit Marken-Schalter `externeKiErlaubt`.
- **Wiederverwertung:** Tabelle `studio_content_relations` (abgeleitet von); Skill `wiederverwerten` schlägt aus einem freigegebenen Inhalt Ableitungen vor (Reel → Carousel → LinkedIn → Blog → Google). Rohstoff ist die Wurzel.

## Phase 5: Automationen und Lernen

- n8n (Zugriff über den n8n-MCP): Metriken-Import nach Supabase, Erinnerungen, Intake von Inspirations-Links, Wochenreport. **Befund:** Die Viral-Watcher-Workflows rufen die Claude-API direkt auf (STATUS Z.66) und verletzen Regel 10; sie werden umgehängt, nicht erweitert.
- Lernen: Entscheide, Markierungen und Leistungszahlen fliessen als Ereignisse in Regelvorschläge je Muster, Funnel und Ebene (`schemas.ts:195` erlaubt heute nur `geltung: "alle-videos"`, wird erweitert).
- Veröffentlichung: Weg für LinkedIn und Instagram wählen, sobald du sagst, wie (Taplio entfällt).

## Regeln, die sich ändern (CLAUDE.md von video-studio)

- Regel 2: «drei Looks je Familie» statt je Stück (nur mit deinem Ja).
- Regel 9: Notion nur noch für den Import lesen (über die Ansicht).
- Regel 10 und «Prüfplatz»: Tore laufen im Alperna-Tool.
- Plan v4 gilt vor v3; §9.1 «Schnitt schnell» entfällt.
- Unverändert: Regel 1 (Du gibst nie frei), 3, 4, 5, 6, 7, 8; keine Claude-API; Marke Navy und Gold für Videos.

## Von dir (ohne das bleibt es stehen)

1. Kamera und Log-Profil (für die LUT), zwei, drei Beispielclips mit Ton auf der HDD.
2. Fünf Vorbild-Videos als Dateien (Instagram kann ich nicht lesen), zuerst: Graphics (`Da0DayIpsie`, `DVOb7_LD9Pt`), Editing (`DdpCoibIthe`), Talking Head (`DdMEpR4xurB`), Sound (`DctTp5ay2Pa`).
3. Ja oder Nein zu «Regel 2 je Familie».
4. Zielwerte TOFU/MOFU/BOFU je Marke.
5. Veröffentlichungsweg für LinkedIn und Instagram.
6. Gibt der Kunde selbst frei (v3 Z.392)?

## Prüfung

- **Phase 1:** Neue Regel = Test, der ohne sie scheitert, dazu Mutationsproben (wie bisher). `npm run check` mit Exit-Code. Synthetische Tests: Zoom-Zahl pro 30 s im Plan ≤ Grenze, keine Clips unter `minClip` ausser an Betonungen, Regie-Wörter am Rand geschnitten, abgeschnittenes Wort («Küche/Kirche») bleibt im Take, Ton-Versatz (bekannter `adelay`) auf ±1 Bild gefunden, Vorschau mit LUT nur auf V1 (Pixelprobe), Messung stimmt mit der Handmessung des Testexports überein (Dauer 36,04 s, −13,9 LUFS, Sättigung ≈ 6). Dann ein echter Lauf auf deinem Mac mit dem 10-Minuten-Clip: Zoom-Zahl, Gegenlesen-Text, Ton-Sync, Vorschau mit LUT, `reel messe`, danach dein Urteil. `npm run selftest:render` bei Stückänderungen.
- **Phase 2:** `pnpm check`, SQL-Test (Intern ja, Kunde nein, Token ungültig), Sicherheitstest in `tests/security`, API-Test mit simuliertem Mac, Browser-Lauf bei 375 px (Handy), echter Fortschritt aus `./studio reel …`, Test des Cloud-Links.
- **Phase 3:** Import-Vorschau mit Stichproben, Analyse an einer von dir abgelegten Datei, Scorecard an deinem Testexport.
- **Nicht prüfbar von hier:** Resolve (T9), Dialekt (T2), `pbpaste/open` auf dem Mac, Instagram-Inhalte, Remote Control und Cloud-Link auf deinem Konto.

## Risiken

- **[Sicher]** Der Umfang ist gross. Phase 1 bringt den messbaren Gewinn zuerst, Phase 2 bis 5 folgen erst, wenn Phase 1 dein Urteil «sieht hochwertig aus» besteht.
- **[Wahrscheinlich]** «Premium» entscheidet sich an Grading, Bewegungssprache und Typografie, nicht an Schnitt-Parametern. Der Look-Entscheid (1.5) ist der wichtigste Schritt.
- **[Vermutung]** Zwei Betriebsarten (Mac und Cloud) erhöhen den Aufwand für Geheimnisse, Rechte und Fehlersuche. Der Cloud-Weg startet klein.
- Supabase-Projekt liegt in London (Spezifikation wollte Zürich oder Frankfurt). Es speichert Metadaten und Vorschauen, keine Rohvideos.
- Notion-Import enthält Kundennamen und Privates von Mitarbeitenden: nur mit Kennzeichnung und Sichtung.
- Resolve und externer Ton in der FCPXML sind ungeprüft.

## Anhang A: Muster (Startliste, 13)

Red Flag/Green Flag, This or That, Tier Ranking, Rapid-Fire-Liste, Level-Vergleich, Top-10-Ranking, Bad/Good/Great, Point and Explain, Every day/once a week/once a month, Don't vs Do, Tree Ranking, Sticky Note Explain, Side-by-Side-Clone, Overrated vs Underrated. Je Muster: Beschreibung, Abschnittsstruktur, nötige Grafikfamilien, Aufnahmeanweisung, Funnel-Eignung, Beispiele aus der Analyse. Meine Beschreibungen sind Entwürfe aus dem Namen und werden von dir geprüft.

## Anhang B: Datenmodell Bibliothek (Skizze, Phase 3)

- `studio_library_items`: `id`, `art` (idee, hook, muster, shot, broll, grafik, trend, inspiration, regel, vorlage, sound), `titel`, `text`, `tags[]`, `marke` (leer = alle), `funnel`, `absicht`, `quelle`, `status`, `daten jsonb` (artspezifisch), `verweis` (Katalog-Schlüssel, Stück-ID), `erstellt von/am`.
- `studio_analyses`: `item_id`, `abschnitte jsonb` (Typ, von, bis), `art`, `muster`, `schnitte_pro_minute`, `lufs`, `grafiktypen[]`, `zoomstil`, `sound`, `uebertragbar`, `zitat`, `datei_hash`.
- `studio_reviews`: `content_id`, `ebene`, `punkte`, `von` (claude, mensch, messung), `notiz`, `zeitmarke`.
- `studio_content_relations`: `von_id`, `nach_id`, `art` (abgeleitet, Serie).
- `studio_strategy`: `marke`, `funnel_ziel jsonb`, `gilt_ab`.
- Alle mit RLS (`app.is_intern()`), Kunden nie.

## Anhang C: Inspirationsquellen (Tracking-Parameter entfernt, Status «Datei fehlt»)

- Gute Ideen: `reels/Def9pj5TWtA`, `reels/Def_UH6T6xs`, `reels/Def_oOUzJeS`
- Für das Marketing-System: `reel/DetbRtDRQUP`, `reel/Dej8homsIzp`, `reel/DekGFjDhWgp`, `reel/DekNPnCiNW5`
- Interface: `reel/DeulxG-t1li`
- Ads: `reel/Dc2A1V4qLzi`; Ad-Formate: `reel/DbSNmTbIrQb`
- Editing-Guide für Claude: `reel/Dee5ObigMNa`; Crazy Editing: `reel/DdpCoibIthe`; Video-Editing-Ablauf 101: `p/Dei5MKHgHyB`
- B-Roll, Cinematographie, AI-Footage: `reel/Dd4S2RFqCDT`
- Content-System: `reel/DegOQG6Tydw`
- Graphics: `reel/Da0DayIpsie`, `reel/DVOb7_LD9Pt`, Profil `lemonadsstudio` (beste Graphics)
- Formate: `reel/Dd5Kr8OCAu0`; Talking-Head-Format: `reel/DdMEpR4xurB`
- Sound Design: `reel/DctTp5ay2Pa`
- Carousels: animierte Carousels `p/DevY6-ogAEe`, Guide `p/Dd953y5IA_4`
- Hooks: `p/DeAIV5qmTMK`, visuelle Hooks `p/DekASnnAK3z`, Hook-Regeln `p/Dd7iE_HjrF0`, Open Loop `p/DepZQzHD9YV`, Ideen `p/DemfMAsmyKc`

(Alle auf `https://www.instagram.com/`.)

## Anhang D: Trends («Low effort trends going viral this week»)

«I'm not judging you, but…» (Carousel, Foto mit Blick in die Kamera, Text über schlechte Gewohnheiten der Zielgruppe) · «My reaction» (Reel, Reaktion auf etwas Kleines, 2 Minuten) · «Wasn't me» (Grafik, Textverlauf mit «I saw you in my dreams last night», in 5 Minuten) · «I lied» (Reel, 8-Sekunden-B-Roll, Liste: was man liebt und worüber man sich trotzdem beschwert) · «Time stamps» (Grafik, Tagesablauf als Foto-Raster mit Uhrzeiten). Quelle und Datum je Trend offen (Regel 7).
