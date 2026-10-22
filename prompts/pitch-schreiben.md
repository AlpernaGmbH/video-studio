# Pitch schreiben

Der Pitch ist die Vorlage, auf der ein Mensch freigibt oder ablehnt. Er muss ohne Rückfrage entscheidbar sein.

## Inhalt (`prompts/beispiele/pitch.json`)

- `text`: zwei bis vier Sätze. Was fehlt, warum es hier fehlt, was die Grafik leistet.
- `zeigt`: was im Bild passiert, konkret. Nicht «eine schöne Grafik», sondern «eine Linie läuft vom ersten zum letzten Wert, Anfangs- und Endpunkt beschriftet».
- `parameter`: was pro Einsatz anders sein kann (Wörter, Zahlen, Reihen). Das ist der Beweis, dass das Stück wiederverwendbar ist.
- `wiederverwendung`: mindestens zwei weitere Einsätze ausser dem auslösenden, mit Bezug zu echten Alperna-Kunden oder -Videos. Fallen dir keine zwei ein, ist es ein Einwegstück: nicht pitchen.
- `aufwand`: klein, mittel oder gross. Ehrlich. Gross heisst: Freisteller, 3D oder mehr als zwei Tage.

## Familie

Gehört die Grafik zu einer Gruppe gleicher Stücke (Handy-Mockups, Rankings, Hook-Texte), setzt du die Familie, **bevor** du pitchst:
`ideen bearbeiten <id> --familie <schluessel>` (oder `"familie": "…"` im Entwurf von `ideen neu`). Gültig sind nur die Schlüssel aus
`library/motion/_familien.json` (`./studio ideen familien` zeigt sie mit dem Stand). Der Pitch sagt dann selbst, dass der Look einmal je Familie gewählt wird.
Im Zweifel keine Familie: Ein Stück ohne Familie zeigt wie bisher drei eigene Looks.

## Ablauf

1. `ideen weiter <id> pitch --system --json pitch.json`
2. `ideen pitch <id>` gibt den Text für den Prüfplatz oder Notion aus.
3. Danach nichts mehr tun. Die Entscheidung gehört dem Menschen. Nicht nachfragen, nicht drängen, nicht schon bauen.

## Ton

Ruhig, konkret, belegbar. Keine Ausrufezeichen, keine Superlative, kein Druck.

## Nach einer Ablehnung

Der Grund steht im Ideenprotokoll und in den Ereignissen. Lies ihn, bevor du ähnliche Ideen vorschlägst.
Die Lückenanalyse meldet ähnliche abgelehnte Ideen als `bereits-abgelehnt`.
