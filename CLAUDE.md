# CLAUDE.md – video-studio (Video-Editing-System der Alperna GmbH)

Eigenes Repo, **nicht** die Website (`alperna-website-v2`). Dessen Regeln (Next.js, Lead-Gate, Seitentexte) gelten hier nicht.
Gemeinsam sind Sprache und Ton: Deutsch (Schweiz), ss statt ß, «» als Anführungszeichen, Du-Form, ruhig und konkret, keine Ausrufezeichen,
keine Emojis, keine Superlative, keine Gedankenstriche als Satzzeichen.
Plan: `docs/plan/bauplan-v3.md` (Content-System, 17.10.2026) gilt zusätzlich zu `docs/plan/bauplan-v2.md` (Video-Editing-System, 16.10.2026). Bei Widerspruch gilt v3. Für den Editing-Teil (Übergabe an DaVinci Resolve, Presets) gilt zusätzlich `docs/plan/editing-blueprint.md`.
Abweichungen, Funde und Stand in `STATUS.md`. Erster Rechner: `docs/phase0-mac.md`.
Marke der Videos: Alperna Design System v2 (zweites, 17.9.): gedämpftes Blau, Gold als einziger Akzent. Profil in `marken/alperna.json`. Die Oberfläche des Prüfplatzes folgt seit 18.10. dem Design von alperna-tool (Papier, Tinte, Orange, Geist), Auftrag `docs/plan/auftrag-pruefplatz-neu.md`. Entschieden am 18.10. (Andrej): Papier, Tinte und Orange gelten nur für die Oberfläche des Prüfplatzes, das Branding der Videos bleibt gleich (Navy und Gold, `marken/alperna.json` unverändert).

**Alles läuft über Claude und Claude Code, nie über die Claude-API.** Texte und Entscheide liegen in Notion, Medien in OneDrive (`Studio/`),
Code hier. Einrichtung eines Macs: Skill `studio-einrichten`. Notion, OneDrive, Prüfplatz: `docs/notion-und-pruefplatz.md`.

## Was hier liegt

- `src/core/` – Pfade, Schemas (Katalog, Marke, Regel, Ereignis, Storyboard), Storyboard-Prüfung
- `src/motion/` – Motion-Bibliothek: Stück-Vertrag, Lint, Staging, Render, Selbstprüfung, Lückenanalyse, Ideenprotokoll, Zustandsautomat
- `library/motion/<id>/` – ein Stück: `piece.json` (Datenblatt) und `index.html` (HyperFrames-Komposition)
- `marken/<key>.json` – Markenprofile. Status `platzhalter` sperrt den finalen Export (Gate 0)
- `assets/fonts/` – Schriften, die Markenprofile ansprechen dürfen (`fonts.json`)
- `src/inhalte/` – Inhalte (Plan v3): Zeile ↔ Inhalt, Übergangsregeln mit Tor I und Tor P, Abgleich mit dem Stand, Textprüfung, Marken mit Gate 0 (auch Übernahme ins Profil), Material an Inhalten (`material.ts`), Befehle `studio inhalte …` und `studio marken gate0`
- `src/schnitt/` – Schnittplan und Übergabe an DaVinci Resolve: Skript-Zuordnung und Take-Auswahl aus Whisper-Transkripten, Storyboard im Plan (B-Roll, Grafiken, Betonung), Frame-Raster, Prüfung gegen das Schnittprofil, Untertitel (SRT), FCPXML 1.8 und OTIO, Befehle `studio schnitt …`. Plan: `docs/plan/editing-blueprint.md`
- `src/katalog/` – Katalog der Fotos, B-Roll und Sounds (Plan v2 Kap. 3.7): Scan, Vorschaubilder, Beschreibung durch Claude, Suche, Befehle `studio katalog …`. Anleitung: `docs/katalog.md`
- `presets/`, `src/presets/` – Presets für Export, Ton, Untertitel und Grafik (je Datei eine ID, mit Herkunft), Messung fertiger Videos, Befehle `studio presets …`
- `src/notion/` – Abbild Idee ↔ Notion-Zeile, `src/setup.ts` – `init` und `doctor`, `src/pruefplatz.ts` – Daten für das Artifact
- `pruefplatz/index.html` – Vorlage des Prüfplatzes (Artifact): Seitenleiste mit Heute, Plattformen und Werkstatt, Seitenfenster für Details und Aktionen, `notion.json` – Kennungen von Notion-Seite, Datenbank und Prüfplatz
- Daten (Ideenprotokoll, Ereignisse, Standbilder): `<Studio-Ordner>/daten/` in OneDrive, Pfad je Mac in `~/.config/video-studio/config.json`. Ohne Einrichtung `data/`
- `prompts/`, `.claude/skills/` – Arbeitsanleitung für Claude (`motion-werkstatt`, `inhalte-werkstatt`, `studio-einrichten`)
- `docs/motion-werkstatt.md` – Konzept der Wachstumsschleife

## Harte Regeln

1. **Du gibst nie frei.** Pitch-Freigabe, Look-Wahl, Änderungswunsch, Aufnahme in die Bibliothek und Ablehnung nach dem Pitch
   gehören Menschen und laufen über den Prüfplatz. Du schreibst nie in die Entscheidfelder in Notion. `--mensch` nur, wenn ein Mensch dir
   den Befehl mit seinem Namen diktiert hat.
2. **Nichts wird gebaut, bevor drei Looks gezeigt und einer gewählt wurde.**
3. **Das Storyboard benutzt nur aktive Stücke und nur B-Roll mit gültigem Katalog-Schlüssel.**
4. **Kein Netz beim Rendern.** Keine externen Skripte, Schriften oder Bilder im HTML (der Lint verbietet es). GSAP liegt lokal.
5. **Keine Kundenbilder an externe Dienste.** `snapshot` läuft fest mit `--describe false`. `GEMINI_API_KEY` bleibt ungesetzt.
   HyperFrames-Telemetrie pro Rechner abschalten: `npx hyperframes@0.8.164 telemetry disable`.
6. **Der genaue Satz einer Idee steht wörtlich im Protokoll.** Nie umformulieren.
7. **Keine Zahl ohne Quelle.** Beispiele in Datenblättern sind erfundene Illustrationen.
8. Pfade im Katalog sind relativ zu `Studio/` und NFC-normalisiert (`src/core/paths.ts`).
9. **Notion nur über die gespeicherte Ansicht lesen** (`notion-query-data-sources`, Modus `view`, `motionIdeen.ansicht` in `notion.json`). SQL und Modus `rows` zählen gegen ein knappes Kontingent und fallen aus.
10. **Keine Claude-API.** Auch nicht in n8n oder anderen Automationen. Analysen macht Claude in einer Sitzung. Das Tor-Modell des Plans v3 (Tor 0 Marke, Tor I Idee, Tor P Produkt) gilt: Tore gehören Menschen und laufen über den Prüfplatz.

## Arbeitsweise

1. `STATUS.md` lesen, dann arbeiten. Eine Aufgabe, ein Commit.
2. Vor jedem Commit: `npm run check` (Typecheck, Tests, Lint der Bibliothek). **Den Exit-Code prüfen**, nicht nur die Ausgabe: Eine Pipe mit `grep` oder `tail` verschluckt ihn. Bei Änderungen an Stücken oder Render-Code zusätzlich
   `npm run selftest:render` (rendert wirklich, braucht Chrome Headless Shell: `npx hyperframes@0.8.164 browser ensure`).
3. Neue Stücke nur über `npm run studio -- motion neu …`. Das Gerüst erfüllt den Stück-Vertrag (Kopf von `src/motion/stueck.ts`).
4. Neue Regel im Code heisst: Test, der ohne die Regel scheitert. Tests, die nur die Fixture prüfen, sind keine Tests.
5. Keine neuen Abhängigkeiten ohne Eintrag in `STATUS.md` mit Begründung und Lizenz.
6. Dieses Repo importiert nichts aus der Website und umgekehrt.
7. Änderungen am Prüfplatz: `npm run studio -- pruefplatz bauen`, `scripts/pruefplatz-test.cjs` laufen lassen, dann veröffentlichen.
