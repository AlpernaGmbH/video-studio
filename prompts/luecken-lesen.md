# Lücken lesen

Du liest ein Skript oder Transkript und suchst Stellen, an denen eine Grafik besser erklärt als gesprochene Worte.
Die Vorstufe (`motion luecken`) findet Zahlen, Verläufe, Vergleiche, Aufzählungen und Abläufe. Du findest den Rest.

## Vorgehen

1. `npm run studio -- motion index` lesen: Das sind die vorhandenen Stücke, eine Zeile pro Stück.
2. `npm run studio -- motion luecken --skript <datei> --projekt <id>` laufen lassen (Trockenlauf).
3. Das ganze Skript selbst lesen. Frage bei jedem Satz: Würde der Zuschauer die Aussage schneller verstehen, wenn er sie sieht?
   Typische Fälle, die die Vorstufe nicht erkennt:
   - eine räumliche oder zeitliche Abfolge («der Weg einer Anfrage durch den Betrieb»)
   - ein Bild, das der Sprecher benutzt («wie ein Trichter»)
   - eine Verschiebung oder ein Verhältnis ohne Zahl («früher links, heute rechts»)
   - eine Zahl, die erst durch den Vergleich wirkt
4. Findest du eine solche Stelle, schreibe sie in `extra.json` (Zeilen-ID → Signal vom Typ `frei`) und lasse die Analyse mit `--extra extra.json` neu laufen.
   Beispiel: `prompts/beispiele/extra-signale.json`.
5. Prüfe die Urteile:
   - `abgedeckt`: ein vorhandenes Stück passt. Im Storyboard benutzen, nichts pitchen. Fehlen Zwischenwerte, beim Menschen nachfragen.
   - `bereits-erfasst`, `bereits-abgelehnt`: nicht noch einmal anlegen.
   - `unsicher`: nur schwache Signale. Entscheide selbst, ob dort eine Grafik besser erklärt.
   - `luecke`: neue Idee. Mit `--schreiben --limit 5` ins Protokoll.

## Regeln

- Der genaue Satz steht wörtlich in der Idee. Nichts umformulieren, nichts kürzen.
- Die Begründung «warum nichts Bestehendes passt» nennt einzelne Stücke und was sie nicht können. Nie «es gibt nichts Passendes».
- Höchstens fünf neue Ideen pro Video. Mehr Lücken heisst: die wichtigsten wählen, den Rest nennen.
- Ein einzelner Satz, der zufällig eine Zahl enthält, ist noch keine Lücke. Eine Lücke ist: Hier fehlt ein Stück, das mehrfach gebraucht würde.
- Nach `--schreiben` Titel und Beschreibung schärfen: `ideen bearbeiten <id> --titel "…" --beschreibung "…"`. Der automatische Entwurf ist nur eine Arbeitsfassung.
