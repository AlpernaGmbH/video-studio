# CLAUDE.md – studio (Video-Editing-System der Alperna GmbH)

Dieses Paket ist **nicht** die Website. Die Regeln in `../CLAUDE.md` (Next.js, Lead-Gate, Design System, Seitentexte)
gelten hier nicht. Übernommen werden nur Sprache und Ton: Deutsch (Schweiz), ss statt ß, «» als Anführungszeichen,
Du-Form, ruhig und konkret, keine Ausrufezeichen, keine Emojis, keine Superlative.
Plan und Entscheide: `Video-Editing-System-Bauplan-v2` (Stand 16.10.2026), Abweichungen und Stand in `STATUS.md`.

## Was hier liegt

- `src/core/` – Pfade, Schemas (Katalog, Marke, Regel, Ereignis, Storyboard), Storyboard-Prüfung
- `src/motion/` – Motion-Bibliothek: Stück-Vertrag, Lint, Staging, Render, Selbstprüfung, Lückenanalyse, Ideenprotokoll, Zustandsautomat
- `library/motion/<id>/` – ein Stück: `piece.json` (Datenblatt) und `index.html` (HyperFrames-Komposition)
- `marken/<key>.json` – Markenprofile (Übergang, später Notion). Status `platzhalter` sperrt den finalen Export (Gate 0)
- `assets/fonts/` – Schriften, die Markenprofile ansprechen dürfen (`fonts.json`)
- `data/` – Ideenprotokoll und Ereignisse (Übergang, später Notion)
- `prompts/`, `.claude/skills/motion-werkstatt/` – Arbeitsanleitung für Claude
- `docs/motion-werkstatt.md` – Konzept der Wachstumsschleife

## Harte Regeln

1. **Du gibst nie frei.** Pitch-Freigabe, Look-Wahl, Änderungswunsch, Aufnahme in die Bibliothek und Ablehnung nach dem Pitch
   gehören Menschen. `--mensch` nur, wenn ein Mensch dir den Befehl mit seinem Namen diktiert hat.
2. **Nichts wird gebaut, bevor drei Looks gezeigt und einer gewählt wurde.**
3. **Das Storyboard benutzt nur aktive Stücke und nur B-Roll mit gültigem Katalog-Schlüssel.**
4. **Kein Netz beim Rendern.** Keine externen Skripte, Schriften oder Bilder im HTML (der Lint verbietet es). GSAP liegt lokal.
5. **Keine Kundenbilder an externe Dienste.** `snapshot` läuft fest mit `--describe false`. `GEMINI_API_KEY` bleibt ungesetzt.
   HyperFrames-Telemetrie pro Rechner abschalten: `npx hyperframes telemetry disable`.
6. **Der genaue Satz einer Idee steht wörtlich im Protokoll.** Nie umformulieren.
7. **Keine Zahl ohne Quelle.** Beispiele in Datenblättern sind erfundene Illustrationen.
8. Pfade im Katalog sind relativ zu `Studio/` und NFC-normalisiert (`src/core/paths.ts`).

## Arbeitsweise

1. `STATUS.md` lesen, dann arbeiten. Eine Aufgabe, ein Commit.
2. Vor jedem Commit: `npm run check` (Typecheck, Tests, Lint der Bibliothek). Bei Änderungen an Stücken oder Render-Code zusätzlich
   `npm run selftest:render` (rendert wirklich, braucht Chrome Headless Shell: `npx hyperframes browser ensure`).
3. Neue Stücke nur über `npm run studio -- motion neu …`. Das Gerüst erfüllt den Stück-Vertrag (Kopf von `src/motion/stueck.ts`).
4. Neue Regel im Code heisst: Test, der ohne die Regel scheitert. Tests, die nur die Fixture prüfen, sind keine Tests.
5. Keine neuen Abhängigkeiten ohne Eintrag in `STATUS.md` mit Begründung und Lizenz.
6. Das Website-Repo bleibt unberührt: Dieses Paket importiert nichts daraus und die Website nichts von hier.
