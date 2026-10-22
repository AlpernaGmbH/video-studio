---
name: motion-werkstatt
description: Pflegt die Motion-Bibliothek des Video-Studios. Beim Schnitt eines Videos nach Stellen suchen, an denen eine neue Grafik besser erklärt, Ideen mit genauem Satz und Begründung protokollieren, pitchen, drei Looks zeigen, bauen, selbst prüfen und in die Bibliothek aufnehmen. Auch bei direkten Grafikwünschen und Inspirationsvideos benutzen.
---

# Motion-Werkstatt

Entscheide treffen Menschen im **Prüfplatz** (Artifact in claude.ai, Adresse in `notion.json`). Sie landen in der Notion-Datenbank «Ideen».
Du liest sie, führst das Protokoll nach und schreibst den neuen Stand zurück. Ablauf und Schema: `docs/notion-und-pruefplatz.md`.

Die Bibliothek wächst aus drei Quellen: aus den aufgenommenen Videos (Skript oder Transkript), aus gespeicherten
Inspirationsvideos und aus dem, was ein Mensch direkt verlangt. Jede Idee trägt den genauen Auslöser und die Begründung,
warum nichts Bestehendes passt. Konzept und Regeln: `docs/motion-werkstatt.md`. Alle Befehle: `./studio help`.

## Harte Regeln

1. **Du gibst nie frei.** Freigabe des Pitchs, Wahl des Looks, Änderungswunsch, Aufnahme in die Bibliothek und Ablehnung
   nach dem Pitch sind Entscheide von Menschen. Trage dich nie als Mensch ein (`--mensch` nur, wenn ein Mensch dir den Befehl
   ausdrücklich diktiert hat, mit seinem Namen). Das Protokoll verweigert es ohnehin, aber der Versuch zählt als Fehler.
2. **Nach der Freigabe wird noch nichts gebaut.** Zuerst drei Looks als Standbilder **für die Familie des Stücks**, ein Mensch wählt einmal je Familie, dann erst Animation. Weitere Stücke derselben Familie erben den gewählten Look, jedes Stück wird trotzdem einzeln abgenommen. Gültige Familien stehen in `library/motion/_familien.json`; erfinde keine neue.
3. **Höchstens zwei Stücke gleichzeitig im Bau, höchstens fünf offene Pitches.** Das Protokoll erzwingt es. Wirst du abgewiesen:
   nicht umgehen, dem Menschen sagen, was offen ist.
4. **Der genaue Satz steht wörtlich in der Idee.** Nie umformulieren.
5. **Kein Netz beim Rendern.** Keine externen Skripte, Schriften oder Bilder im HTML. Der Lint verbietet es.
6. **Keine Kundenbilder an externe Dienste.** `snapshot` läuft immer mit `--describe false` (im Code fest). Setze `GEMINI_API_KEY` in dieser Umgebung nicht.
7. **Aussagen mit Zahlen nur aus Quellen.** Beispielsätze in Datenblättern sind erfundene Illustrationen und als solche zu kennzeichnen.
8. **Du schreibst nie in die Entscheidfelder von Notion** (`Entscheid`, `Look-Wahl`, `Abnahme` und ihre Notiz-, Von- und Am-Felder). `ideen notion-zeile`
   schreibt sie nie, und du fügst sie auch von Hand nicht hinzu. Fehlt ein Entscheid, wartest du.
9. **Vor dem Weiterarbeiten Entscheide lesen** (Abschnitt «Notion»). Wer in der letzten Stunde etwas im Prüfplatz entschieden hat, soll nicht auf dich warten müssen.

## Ablauf

### A. Lücken lesen (bei jedem Schnitt, im Storyboard-Schritt)

Siehe `prompts/luecken-lesen.md`. Kurz: `motion index`, `motion luecken` (Trockenlauf), Skript selbst lesen, bei Bedarf
`--extra`, dann `--schreiben --limit 5`. Danach `ideen bearbeiten <id>`, um Titel und Beschreibung zu schärfen.

Bei einem Inspirationsvideo oder einem direkten Wunsch legst du die Idee mit `ideen neu --json entwurf.json` an
(`quelle.typ` ist `inspiration` oder `auftrag`). Prüfe zuerst mit `motion index`, ob ein vorhandenes Stück schon passt.
Wenn ja, sage es und lege nichts an.

### B. Pitchen

Siehe `prompts/pitch-schreiben.md`. `ideen weiter <id> pitch --system --json pitch.json`, dann Zeile nach Notion schreiben (Abschnitt «Notion», «Raus»).
Dem Menschen sagen: «Der Pitch liegt im Prüfplatz.» Danach aufhören und auf die Entscheidung warten.

### C. Drei Looks (erst nach «freigegeben»), je Familie

Zuerst `./studio ideen familien` (oder `ideen liste`, das bei wartenden Ideen den Grund nennt). Drei Fälle:

- **Die Idee hat keine Familie:** drei eigene Looks, wie unten.
- **Die Familie hat schon einen gewählten Look:** keine Runde. Die Idee übernimmt ihn: `ideen weiter <id> look_gewaehlt --system` («geerbt», die Wahl bleibt die des Menschen).
  Danach das Stück mit `motion neu … --idee <id>` anlegen: Es bekommt `look/look.md` und `look/referenz.png`. Lies beides, bevor du baust, und erfinde keinen eigenen Look.
- **In der Familie läuft die Runde bei einer anderen Idee:** diese Idee wartet (`ideen liste` zeigt «wartet auf Look-Wahl in m-0xx»). Nichts tun, nichts umgehen. Nach jeder
  Entscheidung im Prüfplatz zeigt `ideen notion-lesen` unter `erbenKoennen`, wer jetzt erben kann.
- **Sonst (die Familie hat weder Look noch Runde):** diese Idee zeigt die Runde für die ganze Familie, wie unten.

Findet ein Mensch den Look der Familie später falsch, verwirft nur er ihn: `ideen familie-zuruecksetzen <familie> --mensch --by <Name> --grund "…"` (dir diktiert).
Du verwirfst nie selbst.

1. Ordner `<datenDir>/ideen/<id>/looks/a`, `b`, `c` (im Studio-Ordner auf OneDrive) mit je einer `index.html` (Standbild-Entwurf, gleiches Format wie ein Stück,
   Timeline mit mindestens 2 s). Die drei Looks müssen sich in Leitidee, Typografie, Farbeinsatz und Bewegung unterscheiden.
2. `motion looks <id> --at 1.2 --marke alperna` erzeugt `a.png`, `b.png`, `c.png` und `vergleich.png` und gibt die Pfade als JSON aus.
3. `looks.json` schreiben (`prompts/beispiele/looks.json`), dann `ideen weiter <id> looks --system --json looks.json`.
4. Die drei Standbilder als Asset in den Prüfplatz laden, Adressen in `bilder.json` (`{"a": "https://…", "b": …, "c": …}`), dann
   `ideen notion-zeile <id> --bilder bilder.json` und die Zeile schreiben. Dem Menschen sagen, dass die Looks im Prüfplatz liegen. Warten.

Sagt der Mensch «keiner passt», verlangt das Protokoll einen Grund (der Prüfplatz verlangt ihn auch). Er kommt als Notiz in die nächste Runde.
Baue Runde 2 anders, nicht ähnlich. `notion-lesen` setzt die Idee dabei zurück auf «freigegeben», und die Zeile wird beim nächsten Schreiben geleert.

### D. Bauen (erst nach der Wahl)

1. `motion neu <slug> --name "…" --typen <typ,…> --idee <id>` legt das Gerüst an. Es erfüllt den Stück-Vertrag schon. Gehört die Idee zu einer Familie und ist ihr Look nicht gewählt, verweigert der Befehl das Gerüst (Regel 2).
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
5. `ideen weiter <id> in_bau --system --stueck <slug>` (bei einer Familie nur mit einem Stück, das den Look der Familie trägt)
6. Schleife: `motion lint` → `motion check <slug>` → `motion render <slug> -o … --set …` (prüft objektiv) → Bildprüfung
   (`prompts/bildpruefung.md`) → `ideen pruefung <id> --json runde.json`. Höchstens zwei Korrekturrunden.
7. Besteht die Prüfung: `motion status <slug> gebaut`, dann (Einsatzbeispiele gerendert, Vorschau erzeugt) `motion status <slug> geprueft`,
   `ideen weiter <id> render_geprueft --system`. Standbilder des Renders (`motion vorschau <slug>`) als Asset in den Prüfplatz laden und mit
`--render-bilder liste.json` in die Zeile schreiben. Dem Menschen sagen, dass die Abnahme im Prüfplatz wartet. Warten.

### E. Aufnahme (nur Mensch)

Der Mensch klickt im Prüfplatz «Abnehmen». `ideen notion-lesen --anwenden` aktiviert das Stück mit dem Namen aus «Abnahme von» und führt die Idee nach
«in_bibliothek». «Änderung nötig» führt zurück nach «in_bau» (Notiz Pflicht, Versuch +1). Danach Prüfplatz neu bauen und veröffentlichen.
Erst aktive Stücke darf das Storyboard benutzen.

Ein Stück ohne Idee (zum Beispiel ein Referenzstück aus dem Bauplan) hat keine Abnahme im Prüfplatz. Es wird nur aktiviert, wenn ein Mensch es dir im Chat
mit Namen sagt: `motion aktivieren <slug> --mensch --by <Name>`.

### F. Neue Fassungen

Weil das Stück wiederverwendbar ist: `motion render <slug> -o … --set wert=12 --set label="…" --dauer 2.4 --marke <key>`.
Mehrere Fassungen auf einmal geht mit dem Batch-Befehl von HyperFrames (`batchArgs` in `src/motion/render.ts`).

## Notion

Ziel (Datenquelle) und Adresse des Prüfplatzes stehen in `notion.json`. Notion-Werkzeuge: `notion-query-data-sources`, `notion-create-pages`, `notion-update-page`.

**Rein (zu Beginn jeder Sitzung, und wenn jemand «entschieden» sagt):**
1. `notion-query-data-sources` mit `data: {"mode": "view", "view_url": <motionIdeen.ansicht aus notion.json>, "page_size": 100}`. **Nie SQL oder Modus `rows`:** Die zählen gegen ein knappes Kontingent des Notion-Arbeitsbereichs (beobachtet am 17.10., Meldung `usage_limit_reached`), der Modus `view` nicht. Bei `has_more` mit `start_cursor` weiterlesen. Die Antwort in eine Datei speichern.
2. `./studio ideen notion-lesen --json <datei>` (Vorschau), dann mit `--anwenden`. Fehler und Hinweise dem Menschen sagen
   (Entscheid ohne Namen, zu früh gesetzt, Abweichung zwischen Notion und Protokoll).
3. Für jede Idee in `zeileNeuSchreiben` die Zeile neu schreiben (unten).
4. `ohneIdee`: von Hand angelegte Zeilen sind direkte Aufträge. Frage nach dem genauen Satz, lege die Idee mit `ideen neu` an (`quelle.typ: "auftrag"`) und schreibe
   die Zeile. Die handgemachte Zeile nicht doppeln: Sie bekommt die `Idee-ID`.

**Raus (nach jedem Übergang, den du auslöst):**
1. `./studio ideen notion-zeile <id> [--bilder …] [--render-bilder …]` gibt `properties` und `inhalt`.
2. Keine Zeile: `notion-create-pages` mit `parent: {type: "data_source_id", data_source_id: <datenquelle aus notion.json>}`, `properties`, `content`.
   Sonst `notion-update-page` mit `update_properties` und `replace_content`. Die Seiten-Kennung steht in der `url` der Zeile aus der Ansicht (die letzten 32 Zeichen).
3. Nach dem Schreiben kurz nachlesen: Steht `Status` richtig?

**Prüfplatz neu veröffentlichen**, wenn ein Stück aktiviert oder die Marke geändert wurde: `./studio pruefplatz bauen`, dann das Artifact-Werkzeug mit
`file_path` `.cache/pruefplatz.html` und `url` aus `notion.json`. Der Prüfplatz speichert nichts selbst, ein neuer Stand verliert nichts.

## Wenn etwas hängt

- Lint-Fehler `variable_*`: `motion sync <slug>`.
- «zero duration» beim Render: Timeline wird nicht synchron registriert.
- Vorschaubild leer: Render prüfen (`motion pruefen`), nicht das Bild.
- Schrift fehlt: in `assets/fonts/` ablegen und in `fonts.json` eintragen. Es gibt keinen stillen Rückfall.
- `./studio doctor` prüft Node, ffmpeg, Studio-Ordner, OneDrive, Protokoll, Bibliothek und Notion-Ziel. Erster Schritt bei jedem unklaren Fehler auf einem Mac.
- Notion antwortet nicht oder ein Werkzeug fehlt: dem Menschen sagen, dass Notion nicht verbunden ist. Nie so tun, als wäre eine Zeile geschrieben.
