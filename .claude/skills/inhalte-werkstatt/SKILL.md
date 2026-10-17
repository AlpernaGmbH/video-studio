---
name: inhalte-werkstatt
description: Führt den Lebenslauf der Inhalte (Reel, Carousel, LinkedIn-Post, Blog, Google-Beitrag) nach: Notion-Zeilen lesen, Statuswechsel prüfen, Eingriffe schreiben, Entwürfe mit der Textprüfung prüfen. Benutzen, wenn Inhalte in Notion neu sind, ein Tor entschieden wurde oder ein Text zu prüfen ist.
---

# Inhalte-Werkstatt

Lebenslauf (Plan v3, Kapitel 3): Neu, Pitch bereit, **Tor I**, In Produktion, Entwurf fertig, **Tor P**, Freigegeben, Geplant, Veröffentlicht, Ausgewertet.
Jederzeit Pausiert oder Verworfen, beides mit Grund. Die Tore entscheiden Menschen im Prüfplatz. **Du setzt nie «freigegeben», «abgelehnt», «Rückfrage» oder «Änderung»**,
höchstens «offen». Notion erzwingt keine Übergangsregeln, deshalb prüft der Code jede Änderung (`src/inhalte/regeln.ts`).

## Abgleich (nach jeder Änderung durch Menschen, mindestens einmal am Tag)

1. Ansicht «Inhalte» und Ansicht «Marken» lesen (`notion-query-data-sources`, Modus `view`, Adressen in `notion.json` unter `inhalte.ansicht` und `marken.ansicht`).
   `has_more` beachten und mit `start_cursor` weiterlesen. Beide Ergebnisse als JSON-Dateien in `.cache/` ablegen.
2. `npm run studio -- inhalte abgleich --inhalte .cache/inhalte.json --marken .cache/marken.json --uebernehmen`
   (beim allerersten Lauf auf einer gefüllten Datenbank zusätzlich `--erstlauf`).
3. Die Ausgabe nennt `eingriffe`, `blockiert`, `zurueckgesetzt` und `hinweise`. Jeder Eingriff trägt fertige `eigenschaften`: mit `notion-update-page`
   (`update_properties`) auf die Seite schreiben, deren Kennung die letzten 32 Zeichen der `url` sind. Nichts anderes schreiben.
   - `weiter`: Ein Mensch hat ein Tor entschieden, der nächste Status ist erlaubt. Status schreiben.
   - `zurueckgesetzt`: Die Änderung war nicht erlaubt. Status zurückschreiben und dem Menschen die `fehler` nennen.
   - `geleert`: Entscheid ohne Menschen mit Namen, zu früh oder von früher. Auf «offen» setzen.
   - `neu` mit `Inhalt-ID`: Zeile ohne ID bekommt die vergebene Nummer.
   - `blockiert` und `hinweise`: nichts schreiben, den Menschen informieren (zum Beispiel «Gate 0 der Marke ist offen»).
4. Bei einem Fehler beim Schreiben nicht wiederholen, den Fehler melden. Der Stand zieht nur bei Zeilen nach, die in Ordnung sind, ein erneuter Lauf ist ungefährlich.

## Text schreiben und prüfen (LinkedIn-Post, Blog, Google-Beitrag)

Ein Post braucht einen Rohstoff: Der Beleg verweist auf einen Eintrag in Notion, jede Zahl im Text steht im Beleg. Entwurf in eine Datei, dann:
`npm run studio -- inhalte textpruefen --marke alperna --format "LinkedIn-Post" --text-datei entwurf.txt --beleg-datei beleg.txt --id c-0007`
Exit-Code 1 heisst: Fehler beheben, nicht abschwächen. Erst bei bestandener Prüfung den Status auf «Entwurf fertig» setzen. Die Prüfung ersetzt kein Urteil über Ton und Inhalt.
Bei Reels und Carousels vermerkt die Render-Prüfung das Ergebnis: `inhalte pruefung c-0007 --bestanden` oder `--nicht-bestanden --text "…"`.

## Von Hand geänderte Status

Pausieren, Verwerfen aus der Produktion und «Veröffentlicht» bei Manuell/Paket gelten nur mit **Status von** (Name eines Menschen) und **Status-Grund** in der Zeile.
Das schreibt der Prüfplatz. Fehlt beides, setzt der Abgleich den Status zurück. Du trägst dort nie einen Namen für jemand anderen ein.

## Regeln, die der Code durchsetzt

- «Pitch bereit» braucht Format, Plattform, Marke, Quelle (mit Link, ausser Manuell), Hook, Winkel, Beleg, Aufwand.
- Tor I wirkt erst, wenn Gate 0 der Marke von einem Menschen freigegeben ist. LinkedIn-Posts brauchen einen Rohstoff-Verweis. Gleicher Fakt in den letzten 90 Tagen blockiert.
- Tor P braucht die bestandene Prüfung und keine offenen Markierungen. Ablehnung, Verwerfen und Pausieren brauchen einen Grund aus mindestens zwei Wörtern.
