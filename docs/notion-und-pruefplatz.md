# Notion, OneDrive und Prüfplatz

Alles läuft über Claude und Claude Code, nichts über die Claude-API. Der Prüfplatz ist ein Artifact in claude.ai und benutzt die
Notion-Verbindung des jeweiligen Menschen. Claude Code arbeitet mit denselben Notion-Werkzeugen.

## Wer was hält

| Was | Wo |
|---|---|
| Texte: Ideen, Pitches, Entscheide, später Skripte, Regeln, Ereignisse | Notion, Seite «Video-Studio» (`notion.json`) |
| Medien: Rohmaterial, B-Roll, Standbilder, Renders | OneDrive, Ordner `Studio` (`init` legt ihn an) |
| Code, Stücke der Motion-Bibliothek, Skills, Markenprofile | dieses Repo |
| Freigeben, Look wählen, abnehmen | Prüfplatz (Artifact), Adresse in `notion.json` |

Zustand der Ideen: **`<Studio>/daten/ideen.json` ist die Wahrheit.** Das Protokoll prüft jeden Übergang (Gates, Limits, Namen).
Die Notion-Zeile ist Ansicht und Eingabe. Weicht sie ab, gilt das Protokoll, und `ideen notion-lesen` meldet die Abweichung.

Ausnahme von «Medien auf OneDrive»: Die drei Look-Standbilder und die Render-Standbilder zur Abnahme liegen als Kopien im Artifact
(Asset-Speicher), weil der Prüfplatz nicht auf OneDrive zugreifen kann. Die Originale bleiben in `<Studio>/daten/ideen/<id>/`.

## Datenbank «Ideen» (Notion)

Eine Zeile je Idee. Schlüssel ist `Idee-ID` (`m-001`). Der Seitentext trägt Begründung, Pitch, Looks, Bau und Verlauf.

| Eigenschaft | Typ | Schreibt | Inhalt |
|---|---|---|---|
| Titel | Titel | Claude | Name der Idee |
| Idee-ID | Text | Claude | `m-001` |
| Status | Auswahl | Claude | `idee`, `pitch`, `freigegeben`, `looks`, `look_gewaehlt`, `in_bau`, `render_geprueft`, `in_bibliothek`, `abgelehnt` |
| Quelle, Projekt, Satz | Auswahl, Text, Text | Claude | Woher, und der **genaue Satz** |
| Signale | Mehrfachauswahl | Claude | `zahl`, `anteil`, `verlauf`, `vergleich`, `aufzaehlung`, `prozess`, `zeitraum`, `frei` |
| Warum nichts passt | Text | Claude | Begründung (gekürzt, vollständig im Seitentext) |
| Pitch, Aufwand | Text, Auswahl | Claude | |
| Look-Runde | Zahl | Claude | |
| Bilder | Text | Claude | Eine Zeile je Bild: `<id>: <https-Adresse> \| <Beschriftung>`. `a`, `b`, `c` sind Looks, alles andere Render-Standbilder |
| Stueck, OneDrive-Ordner | Text | Claude | |
| **Entscheid**, Entscheid-Grund, Entscheid von, Entscheid am | Auswahl (`offen`, `freigegeben`, `abgelehnt`), Text, Text, Datum | **Prüfplatz** | Pitch |
| **Look-Wahl** (`a`, `b`, `c`, `keiner`), Look-Notiz, Look-Wahl von, Look-Wahl am | | **Prüfplatz** | Look |
| **Abnahme** (`offen`, `abgenommen`, `aenderung`), Abnahme-Notiz, Abnahme von, Abnahme am | | **Prüfplatz** | Abnahme |

**Claude schreibt nie einen Entscheid.** `ideeZuZeile` (`src/notion/abbild.ts`) setzt `Entscheid` und `Abnahme` höchstens auf `offen` und leert
Felder von Stufen, die noch nicht erreicht sind. So gilt kein zu früh gesetzter Entscheid später. Ein Test prüft das für jeden Status.

## Ablauf in einer Sitzung

**Rein: Entscheide lesen** (zu Beginn jeder Sitzung und wenn jemand sagt «ich habe entschieden»)

1. `notion-query-data-sources` im Modus `view` mit `view_url` (`motionIdeen.ansicht` in `notion.json`) und `page_size` 100, bei `has_more` mit `start_cursor` weiter. Ergebnis als Datei speichern.
2. `./studio ideen notion-lesen --json zeilen.json` zeigt die Vorschau. Danach mit `--anwenden`.
   Die Abnahme führt das Protokoll nach und aktiviert das Stück mit dem Namen aus «Abnahme von».
3. Für jede Idee in `zeileNeuSchreiben` die Zeile aktualisieren (nächster Absatz).
4. `ohneIdee` sind Zeilen, die ein Mensch von Hand angelegt hat. Das ist ein direkter Auftrag: Idee mit `ideen neu` anlegen (`quelle.typ` `auftrag`).

**Raus: Zeile schreiben** (nach jedem Übergang, den Claude auslöst)

1. `./studio ideen notion-zeile <id>` gibt `properties` und `inhalt` aus.
2. Gibt es keine Zeile: `notion-create-pages` mit `data_source_id` aus `notion.json`. Sonst `notion-update-page`, `update_properties`, dazu
   `replace_content` mit `inhalt`.
3. Bilder: Standbilder als Asset in den Prüfplatz laden (Artifact-Werkzeug, `asset: true`, `file_paths`), die Adressen in eine Datei
   `{"a": "https://…", "b": …, "c": …}` schreiben und mit `--bilder` übergeben. Für die Abnahme `--render-bilder liste.json`.

## Prüfplatz

- Karten für Pitch, Looks und Abnahme. Eine Hauptaktion je Karte. Den Namen trägst du unten in der Seitenleiste unter «Entscheiden als» ein (oder er kommt aus deinem Profil).
- Vor jedem Schreiben liest er die Zeile frisch. Ist sie schon entschieden oder weitergelaufen, überschreibt er nichts.
- Nach dem Schreiben liest er nach und meldet nur «Gespeichert», wenn der Entscheid in Notion steht.
- Fehlerfälle haben je eigenen Text: Zugriff nicht erlaubt, Notion nicht verbunden, durch Richtlinie gesperrt, unklarer Ausgang.
- Bibliothek und Marke stehen als Stand in der Seite. Nach jeder Aktivierung oder Markenänderung neu bauen und veröffentlichen:
  `./studio pruefplatz bauen`, dann das Artifact-Werkzeug mit `file_path` `.cache/pruefplatz.html` und `url` aus `notion.json`.
- Freigabe für Menschen: Das Artifact ist privat. Wer entscheiden soll, braucht Zugriff auf das Artifact (Teilen-Menü) **und** auf die
  Notion-Seite. Die Notion-Verbindung muss jeder in claude.ai selbst herstellen. Beim ersten Speichern fragt claude.ai um Erlaubnis.
- Browser-Test mit nachgebautem Notion: `scripts/pruefplatz-test.cjs`. Er prüft die Logik, **nicht** die echte Zustimmungsabfrage.

## Abfrage-Kontingent von Notion

Beobachtet am 17.10.2026: Der Notion-Arbeitsbereich hat ein knappes Kontingent für SQL und den Modus `rows` von `notion-query-data-sources`. Es war nach wenigen Abfragen
verbraucht («usage_limit_reached», Rückkehr innerhalb von 60 Minuten). Der Modus `view` mit einer gespeicherten Ansicht zählt nicht dagegen und liefert dieselben Zeilen.
Darum liest der Prüfplatz (seit Version 2) und jede Sitzung nur über die Ansichten in `notion.json` (`motionIdeen.ansicht`, `inhalte.ansicht`, `marken.ansicht`). Die Ansicht muss alle Eigenschaften zeigen und darf keinen Filter haben.
Wird die Ansicht in Notion gelöscht oder gefiltert, stimmt der Prüfplatz nicht mehr. **Nicht beobachtet:** wie `next_cursor` bei mehr als 100 Zeilen aussieht (der Code liest `next_cursor`).

## Grenzen

- Der Name beim Entscheid ist nicht authentifiziert. Echten Schutz bieten nur die Rechte in Notion und im Artifact.
- Ein Artifact mit Notion-Zugriff lässt sich nicht öffentlich teilen.
- Notion liefert Zeilenumbrüche in Textfeldern als `<br>`. Der Code übersetzt sie beim Lesen.

## Marketing System: Datenbanken

Alle unter der Seite «Marketing System», Kennungen und Ansichten in `notion.json`: **Motion-Ideen** (Video-Studio), **Marken** (Gate 0), **Inhalte** (Lebenslauf mit Toren), **Rohstoffe** (echte Fakten als Beleg, «Kein Post ohne Rohstoff») und **Inspiration** (Viral-Liste, nur Struktur, nie Text).
Bestand und Herkunft: `docs/marketing-system-bestand.md`. Übernommen am 18.10.2026 aus dem LinkedIn-Cockpit: 48 Rohstoffe und 95 Inhalte (Altbestand mit «Batch» `Import Cockpit …`, ohne Tor-Entscheide und ohne Bestätigung, Einzelheiten in `STATUS.md`).
**Viral Watcher:** geplante Claude-Aufgabe (montags 05:47, Europe/Zurich), die mit Taplio neue Zeilen in «Inspiration» schrieb. **Seit dem 18.10.2026 ausgeschaltet**, weil Taplio nicht mehr genutzt wird (Entscheid Andrej). Die Aufgabe liegt noch in claude.ai und lässt sich dort wieder einschalten, wenn es eine neue Quelle für Inspiration gibt. Die Verknüpfungen: Inhalte zu Marken, Rohstoffe zu Marken und Inhalten, Inspiration zu Marken und Inhalten.

## Aufbau des Prüfplatzes (ab 18.10.2026)

Seitenleiste mit **Heute** (nur Karten, auf die ein Mensch wartet: Gate 0, Tor I, Tor P, Pitch, Look, Abnahme; «Der Reihe nach durchgehen»), **Plattformen** (Instagram, LinkedIn, Blog, Google Maps; laufende Inhalte in Idee, In Arbeit, Bereit zum Posten; Gepostetes, Ausgewertetes und Verworfenes nur als Hinweis mit Link ins Cockpit-Archiv; Pausiertes hinter dem Knopf «N Inhalte pausiert: ansehen», dort öffnet ein Inhalt und lässt sich fortsetzen) und **Werkstatt** (Motion-Bibliothek, Motion-Ideen, Marke). Details und Aktionen öffnen im Seitenfenster. Den Namen trägst du unten in der Leiste unter «Entscheiden als» ein. Plattform eines Inhalts: Feld «Plattformen», ohne Angabe das Format (Reel, Carousel, Story gehören zu Instagram). Beispielzeilen («Beispiel: …») stehen nicht in den Plattformlisten.

**Material:** Footage, Fotos, Audio, Skripte und Logos hängst du im Seitenfenster eines Inhalts als Verweis an. Hochgeladen wird nichts: Die Dateien liegen auf OneDrive oder dem Medien-Laufwerk (Plan v3, Kapitel 3.3), im Feld «Dateien» steht nur der Pfad ab dem Ordner «Studio» oder ein OneDrive-Link. Auf dem Mac zeigt `./studio inhalte material --inhalte zeilen.json`, ob die Dateien wirklich dort liegen.

## Inhalte, Tor I, Tor P und Gate 0 (Prüfplatz ab Version 3)

Der Prüfplatz liest zusätzlich die Ansichten «Inhalte» und «Marken». Er schreibt dort nur die Entscheide eines Menschen mit Namen:

| Karte | Schreibt | Bedingung |
|---|---|---|
| Tor I (Pitch bereit) | `Tor I Entscheid` (freigegeben, abgelehnt, Rückfrage), `Tor I Grund`, `Tor I von`, `Tor I am` | Zeile noch «Pitch bereit» und Tor I offen (vorher frisch gelesen). Ablehnung: Grund aus zwei Wörtern, Rückfrage: eine Frage |
| Tor P (Entwurf fertig) | `Tor P Entscheid` (freigegeben, Änderung), `Tor P Grund`, `Tor P von`, `Tor P am` | Zeile noch «Entwurf fertig» und Tor P offen. Änderung: Anweisung, mindestens fünf Zeichen |
| Marke | `Gate 0` (freigegeben), `Gate 0 von`, `Gate 0 am` | Gate 0 noch nicht freigegeben, mit Bestätigung und Namen |
| Inhalte, «Weitere Handlungen» im Seitenfenster | `Status` (Pausiert, Verworfen, Veröffentlicht), `Status von`, `Status-Grund`, `Status am`, beim Pausieren `Status vor Pause` | Status noch wie angezeigt. Pausieren ab «Neu» bis «Geplant» (Grund), Verwerfen (zwei Wörter, nicht aus «Pitch bereit»: dort entscheidet Tor I), «Veröffentlicht» bestätigen nur bei Publishing Manuell oder Paket, ohne Grund |
| Inhalte, «Material» im Seitenfenster | nur `Dateien` | kein Entscheid, darum ohne Namen. Feld vorher frisch gelesen, danach nachgelesen. Format `Art: Pfad oder Link | Notiz`, Pfad relativ zu `Studio/`, Links nur https, höchstens 1900 Zeichen |

Den Status ändert der Prüfplatz nie. Den Wechsel nach einem Entscheid führt der Abgleich aus (`./studio inhalte abgleich`, Skill `inhalte-werkstatt`), wenn die Regeln es erlauben.
Wartet ein Tor-Entscheid auf Gate 0, bleibt er stehen und wirkt, sobald Gate 0 freigegeben ist. Der Entwurf eines Texts steht im Inhalt der Notion-Seite und wird beim Öffnen der Karte mit `notion-fetch` geladen.

## Pausieren und Fortsetzen (ab 18.10.2026)

Beim Pausieren schreibt der Prüfplatz zusätzlich das Feld **«Status vor Pause»** (Auswahl in «Inhalte»: Neu bis Geplant). «Fortsetzen» im Seitenfenster eines pausierten Inhalts setzt den Status auf diesen Wert zurück, trägt Name, Zeit und den Grund «Fortgesetzt nach der Pause» ein und leert das Feld. Pausierte stehen auf den Plattformseiten und unter «Heute» hinter einem Knopf, nie in den Gruppen.
Der Abgleich hält den **Stand** für verbindlich: Fortsetzen darf nur zu dem Status führen, den der Stand (lokal, `daten/inhalte-stand.json`) als «vor der Pause» kennt. Das Feld in Notion springt nur ein, wo der Stand nichts weiss (Erstlauf, Pause an einem anderen Rechner). So führt ein von Hand gesetztes Feld nie an einem Tor vorbei. Pausierte Inhalte ohne gespeicherten Vorstatus (vor dem 18.10. pausiert) lassen sich nur über Claude im Chat fortsetzen.
