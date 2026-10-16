---
name: motion-werkstatt
description: Pflegt die Motion-Bibliothek des Video-Studios. Beim Schnitt eines Videos nach Stellen suchen, an denen eine neue Grafik besser erklärt, Ideen mit genauem Satz und Begründung protokollieren, pitchen, drei Looks zeigen, bauen, selbst prüfen und in die Bibliothek aufnehmen. Auch bei direkten Grafikwünschen und Inspirationsvideos benutzen.
---

# Motion-Werkstatt

Die Bibliothek wächst aus drei Quellen: aus den aufgenommenen Videos (Skript oder Transkript), aus gespeicherten
Inspirationsvideos und aus dem, was ein Mensch direkt verlangt. Jede Idee trägt den genauen Auslöser und die Begründung,
warum nichts Bestehendes passt. Konzept und Regeln: `docs/motion-werkstatt.md`. Alle Befehle: `npm run studio -- help`.

## Harte Regeln

1. **Du gibst nie frei.** Freigabe des Pitchs, Wahl des Looks, Änderungswunsch, Aufnahme in die Bibliothek und Ablehnung
   nach dem Pitch sind Entscheide von Menschen. Trage dich nie als Mensch ein (`--mensch` nur, wenn ein Mensch dir den Befehl
   ausdrücklich diktiert hat, mit seinem Namen). Das Protokoll verweigert es ohnehin, aber der Versuch zählt als Fehler.
2. **Nach der Freigabe wird noch nichts gebaut.** Zuerst drei Looks als Standbilder, ein Mensch wählt, dann erst Animation.
3. **Höchstens zwei Stücke gleichzeitig im Bau, höchstens fünf offene Pitches.** Das Protokoll erzwingt es. Wirst du abgewiesen:
   nicht umgehen, dem Menschen sagen, was offen ist.
4. **Der genaue Satz steht wörtlich in der Idee.** Nie umformulieren.
5. **Kein Netz beim Rendern.** Keine externen Skripte, Schriften oder Bilder im HTML. Der Lint verbietet es.
6. **Keine Kundenbilder an externe Dienste.** `snapshot` läuft immer mit `--describe false` (im Code fest). Setze `GEMINI_API_KEY` in dieser Umgebung nicht.
7. **Aussagen mit Zahlen nur aus Quellen.** Beispielsätze in Datenblättern sind erfundene Illustrationen und als solche zu kennzeichnen.

## Ablauf

### A. Lücken lesen (bei jedem Schnitt, im Storyboard-Schritt)

Siehe `prompts/luecken-lesen.md`. Kurz: `motion index`, `motion luecken` (Trockenlauf), Skript selbst lesen, bei Bedarf
`--extra`, dann `--schreiben --limit 5`. Danach `ideen bearbeiten <id>`, um Titel und Beschreibung zu schärfen.

Bei einem Inspirationsvideo oder einem direkten Wunsch legst du die Idee mit `ideen neu --json entwurf.json` an
(`quelle.typ` ist `inspiration` oder `auftrag`). Prüfe zuerst mit `motion index`, ob ein vorhandenes Stück schon passt.
Wenn ja, sage es und lege nichts an.

### B. Pitchen

Siehe `prompts/pitch-schreiben.md`. `ideen weiter <id> pitch --system --json pitch.json`, dann `ideen pitch <id>`.
Danach aufhören. Auf die Entscheidung eines Menschen warten.

### C. Drei Looks (erst nach «freigegeben»)

1. Ordner `data/ideen/<id>/looks/a`, `b`, `c` mit je einer `index.html` (Standbild-Entwurf, gleiches Format wie ein Stück,
   Timeline mit mindestens 2 s). Die drei Looks müssen sich in Leitidee, Typografie, Farbeinsatz und Bewegung unterscheiden.
2. `motion looks <id> --at 1.2 --marke alperna` erzeugt `a.png`, `b.png`, `c.png` und `vergleich.png` und gibt die Pfade als JSON aus.
3. `looks.json` schreiben (`prompts/beispiele/looks.json`), dann `ideen weiter <id> looks --system --json looks.json`.
4. Das Vergleichsblatt dem Menschen zeigen. Warten.

Sagt der Mensch «keiner passt», verlangt das Protokoll einen Grund. Er kommt als Notiz in die nächste Runde. Baue Runde 2 anders, nicht ähnlich.

### D. Bauen (erst nach der Wahl)

1. `motion neu <slug> --name "…" --typen <typ,…> --idee <id>` legt das Gerüst an. Es erfüllt den Stück-Vertrag schon.
2. `piece.json` ausfüllen: Zweck, Auslöser, Parameter mit Beschreibung (sagt, was der Platz bedeutet), Dauer, Abnahme, Einsatzangaben
   (wann, wann nicht, mindestens ein Beispiel mit Satz). Alle `TODO` ersetzen.
3. Nach jeder Änderung an Parametern: `motion sync <slug>` schreibt die Deklaration in `index.html`.
4. `index.html` nach dem Vertrag (Kopf von `src/motion/stueck.ts`):
   - Root ohne `data-duration`, 1080×1920, `background: transparent`
   - Timeline **synchron** registrieren (nicht nach `await` oder `.then`), sie endet bei `dauer`
   - Ausblenden eine Bildlänge (0,04 s) vor `dauer` beenden
   - Texte messen mit `offsetWidth`, nie mit `getBoundingClientRect` (das rechnet Transformationen mit)
   - Marke nur über die `marke…`-Variablen, nichts fest verdrahten
   - Inhalt im Sicherheitsrand (x 54–864, y 154–1536)
5. `ideen weiter <id> in_bau --system --stueck <slug>`
6. Schleife: `motion lint` → `motion check <slug>` → `motion render <slug> -o … --set …` (prüft objektiv) → Bildprüfung
   (`prompts/bildpruefung.md`) → `ideen pruefung <id> --json runde.json`. Höchstens zwei Korrekturrunden.
7. Besteht die Prüfung: `motion status <slug> gebaut`, dann (Einsatzbeispiele gerendert, Vorschau erzeugt) `motion status <slug> geprueft`,
   `ideen weiter <id> render_geprueft --system`. Dem Menschen den Render zeigen. Warten.

### E. Aufnahme (nur Mensch)

`motion aktivieren <slug> --mensch --by <Name>`, dann `ideen weiter <id> in_bibliothek --mensch --by <Name>`.
Erst aktive Stücke darf das Storyboard benutzen.

### F. Neue Fassungen

Weil das Stück wiederverwendbar ist: `motion render <slug> -o … --set wert=12 --set label="…" --dauer 2.4 --marke <key>`.
Mehrere Fassungen auf einmal geht mit dem Batch-Befehl von HyperFrames (`batchArgs` in `src/motion/render.ts`).

## Wenn etwas hängt

- Lint-Fehler `variable_*`: `motion sync <slug>`.
- «zero duration» beim Render: Timeline wird nicht synchron registriert.
- Vorschaubild leer: Render prüfen (`motion pruefen`), nicht das Bild.
- Schrift fehlt: in `assets/fonts/` ablegen und in `fonts.json` eintragen. Es gibt keinen stillen Rückfall.
