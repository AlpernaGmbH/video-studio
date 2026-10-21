---
name: inhalte-werkstatt
description: Führt den Lebenslauf der Inhalte (Reel, Carousel, LinkedIn-Post, Blog, Google-Beitrag) nach: Notion-Zeilen lesen, Statuswechsel prüfen, Eingriffe schreiben, Entwürfe mit der Textprüfung prüfen. Benutzen, wenn Inhalte in Notion neu sind, ein Tor entschieden wurde oder ein Text zu prüfen ist.
---

# Inhalte-Werkstatt

Lebenslauf (Plan v3, Kapitel 3): Neu, Pitch bereit, **Tor I**, In Produktion, Entwurf fertig, **Tor P**, Freigegeben, Geplant, Veröffentlicht, Ausgewertet.
Jederzeit Pausiert oder Verworfen, beides mit Grund. Die Tore entscheiden Menschen im Prüfplatz. **Du setzt nie «freigegeben», «abgelehnt», «Rückfrage» oder «Änderung»**,
höchstens «offen». Notion erzwingt keine Übergangsregeln, deshalb prüft der Code jede Änderung (`src/inhalte/regeln.ts`).

## Material (Footage, Fotos, Skripte)

Ein Mensch hängt Material im Prüfplatz an: Im Feld «Dateien» steht je Eintrag eine Zeile `Art: Pfad | Notiz` (Pfad relativ zu `Studio/` oder https-Link). Vor der Produktion eines Inhalts mit Aufwand «Dreh nötig» prüfst du:
`./studio inhalte material --inhalte .cache/inhalte.json`. Exit-Code 1 heisst: Eine Datei fehlt auf diesem Rechner oder es fehlt Footage oder Foto. Dann bleibt der Inhalt stehen und du sagst, was fehlt. Du hängst nie selbst Footage an und schreibst nur Zeilen der Art «Render» für fertige Dateien, sonst bleibt das Feld unverändert (freie Zeilen erhalten).

## Abgleich (nach jeder Änderung durch Menschen, mindestens einmal am Tag)

1. Ansicht «Inhalte» und Ansicht «Marken» lesen (`notion-query-data-sources`, Modus `view`, Adressen in `notion.json` unter `inhalte.ansicht` und `marken.ansicht`).
   `has_more` beachten und mit `start_cursor` weiterlesen. Beide Ergebnisse als JSON-Dateien in `.cache/` ablegen.
2. `./studio inhalte abgleich --inhalte .cache/inhalte.json --marken .cache/marken.json --uebernehmen`
   (beim allerersten Lauf auf einer gefüllten Datenbank zusätzlich `--erstlauf`: Die Beispiele `c-0001` bis `c-0003` und der Altbestand `c-0004` bis `c-0098`
   aus dem LinkedIn-Cockpit stehen schon in ihrem Status. Altbestand trägt «Batch» `Import Cockpit …`, keine Tor-Entscheide und keine Bestätigung. Ihn nie als freigegeben behandeln und keine Entscheide nachtragen.)
3. Die Ausgabe nennt `eingriffe`, `blockiert`, `zurueckgesetzt` und `hinweise`. Jeder Eingriff trägt fertige `eigenschaften`: mit `notion-update-page`
   (`update_properties`) auf die Seite schreiben, deren Kennung die letzten 32 Zeichen der `url` sind. Nichts anderes schreiben.
   - `weiter`: Ein Mensch hat ein Tor entschieden, der nächste Status ist erlaubt. Status schreiben.
   - `zurueckgesetzt`: Die Änderung war nicht erlaubt. Status zurückschreiben und dem Menschen die `fehler` nennen.
   - `geleert`: Entscheid ohne Menschen mit Namen, zu früh oder von früher. Auf «offen» setzen.
   - `neu` mit `Inhalt-ID`: Zeile ohne ID bekommt die vergebene Nummer.
   - `blockiert` und `hinweise`: nichts schreiben, den Menschen informieren (zum Beispiel «Gate 0 der Marke ist offen»).
4. Bei einem Fehler beim Schreiben nicht wiederholen, den Fehler melden. Der Stand zieht nur bei Zeilen nach, die in Ordnung sind, ein erneuter Lauf ist ungefährlich.

## Text schreiben und prüfen (LinkedIn-Post, Blog, Google-Beitrag)

Ein Post braucht einen Rohstoff: Der Beleg verweist auf einen Eintrag in der Datenbank «Rohstoffe» (`notion.json`, `rohstoffe`), jede Zahl im Text steht im Beleg.
Fehlt der Rohstoff, frag den Menschen nach dem Fakt, statt ihn zu erfinden. Neue Rohstoffe trägst du mit Marke, Konkretem und Beleg ein, «Bestätigt von» und «Bestätigt am» füllt ein Mensch.
Ideen aus der Datenbank «Inspiration» übernimmst du nur als Struktur, nie als Text; der Link steht in «Referenz» (Quelle «Viral-Liste»). Der Viral Watcher ist ausgeschaltet (Taplio entfällt), neue Zeilen entstehen nur von Hand. Entwurf in eine Datei, dann:
`./studio inhalte textpruefen --marke alperna --format "LinkedIn-Post" --text-datei entwurf.txt --beleg-datei beleg.txt --id c-0007`
Exit-Code 1 heisst: Fehler beheben, nicht abschwächen. Erst bei bestandener Prüfung den Status auf «Entwurf fertig» setzen. Die Prüfung ersetzt kein Urteil über Ton und Inhalt.
Bei Reels und Carousels vermerkt die Render-Prüfung das Ergebnis: `inhalte pruefung c-0007 --bestanden` oder `--nicht-bestanden --text "…"`.

## Ideenfindung mit dem Bestand (Altbeiträge)

Die Altbeiträge bleiben in Notion (Entscheid Andrej, 18.10.2026) und sind Teil jeder Ideenfindung. Bevor du eine Idee vorschlägst:
`./studio inhalte archiv --inhalte .cache/inhalte.json --thema "<Thema der Idee in einem Satz>"`
Die Ausgabe zeigt, **was es schon gibt**: ähnliche Beiträge jeden Alters mit Datum, Alter, Status und bei Verworfenen dem Grund, dazu den Bestand je Pillar, Hook-Muster, Format und Plattform und wann jeder Pillar zuletzt dran war.
- `imFenster: true`: Das Thema lief in den letzten 90 Tagen. Gleicher Fakt blockiert Tor I, ein neuer Winkel mit anderem Fakt nicht. Sag dem Menschen, was schon da war.
- `imFenster: false`: Das Thema darf mit neuem Winkel wiederkommen. Nenne im Pitch den früheren Beitrag («aufgreifen, weil …») und was jetzt neu ist.
- Verworfen mit Grund: Der Grund steht da, damit dieselbe Idee nicht wiederkommt. Bring sie nur mit neuer Begründung zurück.
- Der Überblick zeigt Zahlen und Abstände, kein Urteil. Ob ein Pillar zu kurz kommt, entscheidet ein Mensch. Leistungszahlen (Likes, Reichweite) hat dieser Befehl nicht; sie stehen im Cockpit «Beiträge · Archiv & Analytics» (`notion.json`, `archiv`). Wenn du sie brauchst, lies sie dort und nenne die Quelle, sonst gibt es keine Zahl.
Altbeiträge gelten nie als freigegeben (kein Tor-Entscheid) und werden nicht verändert.

## Gate 0 ins Profil übernehmen

Gate 0 gibt ein Mensch im Prüfplatz frei (Ansicht «Marken»). Damit der finale Export freigeschaltet wird, muss das Profil im Repo nachziehen:
Ansicht «Marken» als JSON ablegen, `./studio marken gate0 --marken .cache/marken.json` (Vorschau), dann mit `--anwenden`, danach `marken/<id>.json` committen und pushen.
Du setzt Gate 0 nie selbst. Steht «freigegeben» ohne Namen in Notion, übernimmt der Befehl nichts und sagt es.

## Pausiert und Fortsetzen

Pausieren schreibt der Prüfplatz mit dem Feld «Status vor Pause». Der Abgleich merkt sich den Vorstatus im Stand; fortgesetzt wird nur dorthin zurück. Das Feld in Notion gilt nur, wo der Stand nichts weiss (Erstlauf). Ein pausierter Inhalt ohne Vorstatus lässt sich nicht fortsetzen: sag dem Menschen, dass er dir den Status nennen muss, und trag ihn nicht selbst ein.

## Von Hand geänderte Status

Pausieren, Verwerfen aus der Produktion und «Veröffentlicht» bei Manuell/Paket gelten nur mit **Status von** (Name eines Menschen), **Status-Grund** und einem **neuen Zeitpunkt in «Status am»**.
Das schreibt der Prüfplatz (Tab «Inhalte», «Verwalten»). Fehlt etwas oder ist der Zeitpunkt schon verbraucht, setzt der Abgleich den Status zurück und nennt den Grund. Du trägst dort nie einen Namen oder einen Zeitpunkt für jemand anderen ein.

## Regeln, die der Code durchsetzt

- «Pitch bereit» braucht Format, Plattform, Marke, Quelle (mit Link, ausser Manuell), Hook, Winkel, Beleg, Aufwand.
- Tor I wirkt erst, wenn Gate 0 der Marke von einem Menschen freigegeben ist. LinkedIn-Posts brauchen einen Rohstoff-Verweis. Gleicher Fakt in den letzten 90 Tagen blockiert.
- Tor P braucht die bestandene Prüfung und keine offenen Markierungen. Ablehnung, Verwerfen und Pausieren brauchen einen Grund aus mindestens zwei Wörtern.
