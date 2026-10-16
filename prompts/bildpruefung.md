# Bildprüfung

Die Messungen (`motion render` und `motion pruefen`) prüfen Länge, Format, Alpha, Sicherheitsrand, Anfang und Ende.
Du prüfst, was nur ein Auge sieht. Schau dir die Vorschaubilder an (die PNG-Dateien lesen).

## Was du prüfst

- Text abgeschnitten, angeschnitten oder überlappend
- Zahl, Wort oder Beschriftung falsch (stimmt der Text mit dem Satz überein?)
- Inhalt wirkt unruhig, überladen oder zu klein für ein Handy
- Marke: Farben, Schrift und Eckenradius entsprechen dem Markenprofil
- Beginnt und endet die Bewegung sauber?

## Was du nicht beurteilst

Geschmack. Ob etwas «schön» ist oder «überzeugt», entscheidet ein Mensch. Bei Geschmacksfragen nur melden, nicht korrigieren.

## Format (`prompts/beispiele/bildurteil.json`)

Pro Bild ein Urteil mit Zeitpunkt. Jedes «nicht ok» braucht mindestens einen konkreten Grund: Ein Urteil ohne Begründung zählt als Fehler.
Trage das Ergebnis als Prüfrunde ein (`prompts/beispiele/pruefrunde.json`): `ideen pruefung <id> --json runde.json`.

## Korrekturrunden

Bei messbaren Mängeln darfst du korrigieren und neu rendern, höchstens zweimal. Danach entscheidet ein Mensch.
Jede Runde steht im Protokoll: was gefunden, was geändert, was offen blieb.
