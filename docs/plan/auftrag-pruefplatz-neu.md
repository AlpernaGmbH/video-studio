# Auftrag: Prüfplatz neu aufbauen (Übersicht statt Sammelstelle)

Von Andrej, 18.10.2026. In den Plan aufgenommen am 18.10.2026. Gilt zusätzlich zu Bauplan v3 (`bauplan-v3.md`) und ändert dort Kapitel 3.3 (Ideen mit Anhängen), 4.3 (Tor I im Prüfplatz) und 8 (Umzug von Content-Ideen). Bei Widerspruch gilt dieser Auftrag.

## Auftrag (Wortlaut)

Der Prüfplatz ist unübersichtlich: Entscheidungen, 98 Inhalte (auch Gepostetes), Alle Ideen, Bibliothek und Marke stehen gleichrangig nebeneinander. Er findet sich nicht zurecht.

Referenz: `pruefplatz-neu-entwurf.html` (Entwurf mit Beispieldaten, im Stil von alperna-tool). Ablegen unter `docs/` und als Vorlage für `pruefplatz/index.html` nehmen.

### Regeln

1. Drei Bereiche, in der Seitenleiste (Handy: Leiste oben).
   * **Heute: Zu entscheiden.** Nur Karten, auf die ein Mensch wartet (Tor I, Tor P, Gate 0, Look, Abnahme). Pro Karte genau eine Hauptaktion. Der Knopf «Der Reihe nach durchgehen» ersetzt den Wochenmodus.
   * **Plattformen:** Instagram, LinkedIn, Blog, Google Maps. Je Plattform eine Seite. Darauf nur laufende Inhalte in drei Gruppen: Idee, In Arbeit, Bereit zum Posten. Zuordnung der Stati: Neu und Pitch bereit = Idee; In Produktion und Entwurf fertig = In Arbeit; Freigegeben und Geplant = Bereit zum Posten. Plattform kommt aus «Plattformen», Reels und Carousels gehören zu Instagram, ein Inhalt für mehrere Plattformen erscheint auf jeder.
   * **Werkstatt:** Motion-Bibliothek, Motion-Ideen, Marke. Eine Seite mit drei Kacheln. Das ist Systempflege, kein Tagesgeschäft.
2. Gepostetes, Ausgewertetes, Verworfenes, Pausiertes steht nie in einer Liste. Nur ein Hinweis «64 Gepostete ausgeblendet» mit Link ins Archiv (Archiv = Notion-Ansicht, nicht im Prüfplatz). **Ergänzt am 18.10.:** Pausiertes hat einen eigenen Hinweis mit Knopf, der die Liste aufklappt, damit man es fortsetzen kann.
3. **Geändert am 18.10. (Andrej): Die Altbeiträge bleiben in «Inhalte» und in Notion, nichts wird entfernt; sie werden bei der Ideenfindung und der Dublettenprüfung genutzt (`studio inhalte archiv`).** Ursprünglicher Wortlaut: Kein Import von Altbeiträgen. Das Archiv bleibt im Cockpit (Beiträge · Archiv und Analytics). In «Inhalte» gehören nur Ideen und laufende Arbeit. Bereits importierte Zeilen im Status Gepostet bzw. Veröffentlicht werden aus «Inhalte» entfernt, erst nach Andrejs Ja (die Originale im Cockpit bleiben). Ideen und Entwürfe aus dem Cockpit bleiben.
4. Eine Zeile zeigt: Titel, Format und Person, einen Status. Kein «Verwalten»-Knopf in der Zeile, keine Inhalt-ID, kein Hook, wenn er dem Titel gleicht. Details und Aktionen öffnen in einem Seitenfenster (Handy: volle Breite).
5. Beispielzeilen («Beispiel: …») sind markiert und erscheinen nicht in den Plattformlisten. Löschen nur mit Andrejs Ja.
6. Name: Feld «Entscheiden als» unten in der Seitenleiste, nicht oben auf jeder Seite.

### Design: wie alperna-tool

Quelle: `AlpernaGmbH/tool`, `app/globals.css` und CLAUDE.md, Abschnitt Design. Ersetzt das Alperna-Design-System v2 (Navy, Gold, Poppins) nur für die Oberfläche des Prüfplatzes. Das Markenprofil für Videos (`marken/alperna.json`) bleibt unberührt, bis Andrej entscheidet (siehe offene Frage unten).

* Hell: Hintergrund `#F3F1EC`, Karten `#FFFDF8`, Tinte `#0F0F0E`, gedämpft `#65645F`, Linien `rgb(15 15 14 / 14%)`, Akzent Orange `#F0532F` (Hover, aktiver Menüpunkt), Akzent-Text `#C23A17`, Sonne `#FFC93C` für «wartet auf dich».
* Dunkel: Hintergrund `#0F0F0E`, Karten `#1A1A18`, Text `#F3F1EC`. Beide Modi über Tokens, gesteuert durch `prefers-color-scheme` und `data-theme`.
* Seitenleiste in Tinte, aktiver Punkt mit Orange-Streifen. Schrift Geist, Titel Gewicht 500, Betonung in Instrument Serif kursiv, Zahlen in Geist Mono. Knöpfe pillenförmig, primär Tinte mit Papier-Text, Hover Orange. Radius 12 px. Wortmarke «alperna» klein.
* Schriften nur über Google Fonts (CSP des Artifacts).

### Abnahme

* Auf 390 px und 1280 px kein seitliches Scrollen, `scripts/pruefplatz-test.cjs` erweitert (Plattformseite zeigt kein Gepostetes, «Zu entscheiden» zeigt nur Offenes, Zähler stimmen).
* Gate-0-, Tor-I- und Tor-P-Aktionen funktionieren wie bisher, Claude schreibt weiterhin nie ein Entscheidfeld.
* Andrej schaut den Prüfplatz an und sagt, ob er sich zurechtfindet. Erst dann gilt es als fertig.

### Frage an Andrej: entschieden am 18.10.2026

Das alperna-tool folgt der neuen Website (Papier, Tinte, Orange, Stand 02.10.2026). `marken/alperna.json` folgt dem Design System v2 (Navy, Gold). Welche gilt für Alperna-Reels?

**Antwort von Andrej:** Papier, Tinte und Orange gelten nur für das Artifact (den Prüfplatz). Das Branding der Videos bleibt gleich: Navy und Gold, Profil `marken/alperna.json` unverändert, Gate 0 bleibt gültig.

## Zusatz vom selben Tag: Material anhängen

Projekte wie Instagram brauchen Footage und weitere Dateien, LinkedIn vielleicht auch. Das muss sich an den Inhalt anhängen lassen. (Ergänzt Kapitel 3.3, das den Ordner «Studio/inhalte/c-0007/» mit «roh», «material» und «ergebnis» vorsieht, aber noch keine Oberfläche dafür hatte.)

## Umsetzung (Claude, 18.10.2026)

Gebaut und geprüft: `pruefplatz/index.html` neu, 51 Browser-Prüfungen in `scripts/pruefplatz-test.cjs`, Unit-Tests für das Material (`src/inhalte/material.test.ts`).

**Was die Regeln konkret bedeuten**

* **Heute** zeigt Gate 0 (solange nicht mit Namen freigegeben), Tor I, Tor P, Pitch, Look und Abnahme. Entschiedenes, das auf Claude wartet, steht nur als Zählung darunter («2 Entscheide liegen bei Claude»), nie als Karte. Der Zähler in der Leiste zählt genau die Karten.
* **Durchgang** ersetzt den Wochenmodus und gilt für alle Karten von «Heute», nicht nur für Tor I: Das Seitenfenster zeigt «2 von 7» mit Überspringen und Beenden und springt nach jedem Entscheid zur nächsten Karte.
* **Plattform:** «Plattformen» geht vor. Nur wenn das Feld leer ist, entscheidet das Format (Reel, Carousel, Story = Instagram, LinkedIn-Post = LinkedIn, Blog = Blog, Google-Maps-Beitrag = Google Maps). Ein Carousel mit der Angabe «LinkedIn» steht also auf LinkedIn, nicht auf Instagram. Inhalte ohne Plattform stehen auf keiner Plattformseite, «Heute» nennt ihre Zahl.
* **Abgeschlossen** ist: Veröffentlicht, Ausgewertet, Verworfen, Pausiert. Der Hinweis nennt die Zahl je Plattform und führt in das Cockpit-Archiv (`notion.json`, Feld `archiv`).
* **Beispiele** (Titel beginnt mit «Beispiel:») stehen auf «Heute», solange sie auf einen Entscheid warten, mit der Markierung «Beispiel». Auf den Plattformseiten fehlen sie.
* **Handlungen** (Pausieren, Verwerfen, «Veröffentlicht» bestätigen) liegen im Seitenfenster. «Veröffentlicht bestätigen» ist dort bei geplanten Beiträgen mit Veröffentlichung Manuell oder Paket die Hauptaktion und braucht keinen Grund.
* **Hauptaktion:** Pro Seitenfenster eine Tinte-Pille, am unteren Rand angeheftet, damit sie auch bei langem Inhalt sichtbar bleibt.

**Material**

* Format im Feld «Dateien»: eine Zeile je Eintrag, `Art: Pfad oder Link | Notiz`. Arten: Footage, Foto, Audio, Skript, Logo, Sonstiges (dazu «Render», das nur der Studio-Code schreibt). Zeilen in anderer Form bleiben unverändert erhalten.
* Der Pfad ist relativ zu `Studio/` (NFC), ohne absolute Pfade, ohne «..», oder ein https-Link (zum Beispiel OneDrive-Freigabelink). Maximal 1900 Zeichen im Feld (Notion schneidet bei 2000 ab), darüber verweist ein Eintrag auf einen Ordner.
* Hochgeladen wird nichts. Videos sind zu gross für Notion und den Prüfplatz (Artifact-Dateien höchstens 20 MiB), sie liegen wie in Kapitel 3.3 auf OneDrive oder dem Medien-Laufwerk. Kleine Bilder gehen weiter direkt in die Notion-Seite.
* Der Prüfplatz hängt Verweise an und entfernt sie (frisch lesen vor dem Schreiben, nachlesen danach, keinen Namen nötig, weil es kein Entscheid ist). Er schreibt nur das Feld «Dateien».
* Auf dem Mac prüft `studio inhalte material --inhalte zeilen.json`, ob die Dateien wirklich liegen, und nennt «Dreh nötig» ohne Footage oder Foto. Der Abgleich meldet dasselbe als Hinweis, wenn ein Inhalt mit «Dreh nötig» in «In Produktion» steht. Es ist ein Hinweis, kein Verbot.

**Nicht umgesetzt, bewusst**

* ~~Das Entfernen der importierten Altbeiträge aus «Inhalte» (Regel 3)~~ **erledigt durch Entscheid am 18.10.: Sie bleiben.** Die Dublettenprüfung rechnet seitdem mit dem Erscheinungsdatum («Geplant für»), und `studio inhalte archiv` macht den Bestand für die Ideenfindung nutzbar.
* Das Löschen der Beispiele (Regel 5) löscht Seiten in Notion und wartet auf Andrejs ausdrückliches Ja zur genauen Liste.
* Die Referenzdatei `pruefplatz-neu-entwurf.html` lag der Sitzung nicht vor. Das Design folgt dem Wortlaut oben und den Quellen `app/globals.css` und CLAUDE.md von `AlpernaGmbH/tool`. Wer die Datei hat, legt sie unter `docs/` ab, und Abweichungen werden nachgezogen.
* `marken/alperna.json` ist nicht angefasst (offene Frage).

## Einwände und Risiken

**Stand 18.10.:** Die Punkte 1 und 2 unten sind überholt, weil die Altbeiträge bleiben. Sie stehen noch da, weil sie die Folgen eines Entfernens beschreiben.

1. **Altbeiträge entfernen schwächt die Dublettenprüfung.** Die Regel «Kein Fakt der letzten 90 Tage» (Plan v3, Kapitel 3.1, `regeln.ts`) vergleicht mit den Zeilen in «Inhalte». Von den 75 importierten «Ausgewertet»-Zeilen liegen 38 innerhalb der letzten 90 Tage (Stand 18.10.2026). Ohne sie sieht die Prüfung diese Beiträge nicht, und ein Fakt könnte nochmals auftauchen. Vorschlag: nur die 37 älteren «Ausgewertet»-Zeilen entfernen. Die 38 jüngeren bleiben (sie sind in keiner Liste sichtbar) und gehen mit der Zeit von selbst aus dem 90-Tage-Fenster. Die 9 verworfenen Zeilen nennt der Auftrag nicht, sie bleiben ebenfalls unsichtbar stehen. Alternative: die Prüfung liest zusätzlich das Cockpit-Archiv. Das ist mehr Aufwand.
2. **Reihenfolge:** Erst entfernen, dann den ersten Abgleich mit `--erstlauf`. Sonst steht jede entfernte Zeile im Stand und der Abgleich meldet sie als «nicht mehr in Notion».
3. **Zwei Farbwelten** (entschieden am 18.10.2026): Der Prüfplatz folgt Papier, Tinte, Orange, die Videos bleiben Navy und Gold. Das ist gewollt: Das Werkzeug ist nicht die Marke. Gate 0 für Alperna ist davon nicht berührt.
