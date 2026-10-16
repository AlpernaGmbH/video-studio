# studio – Video-Editing-System der Alperna GmbH

Rohmaterial und Skript hinein, ein Instagram-Reel im Look der Marke heraus (Bauplan v2). Dieses Paket enthält den Teil, der
sich ohne Hardware und Kundenmaterial bauen und prüfen lässt: Fundament, Motion-Bibliothek und die Schleife, in der sie wächst.
Stand und offene Punkte: `STATUS.md`.

## Einrichten

```sh
cd studio
npm install
npx hyperframes browser ensure      # lädt Chrome Headless Shell (einmal je Rechner)
npx hyperframes telemetry disable   # einmal je Rechner, wegen Kundenmaterial
npm run check                       # Typecheck, Tests, Lint der Bibliothek
npm run selftest:render             # rendert jedes Stück wirklich und prüft das Ergebnis
```

Node 22 oder neuer (HyperFrames verlangt es), ffmpeg und ffprobe im Pfad.

## Die Motion-Bibliothek in einem Absatz

Ein **Stück** ist eine Grafik, die sich mit anderen Wörtern und Zahlen wiederverwenden lässt: ein Ordner mit Datenblatt
(`piece.json`) und HyperFrames-Komposition (`index.html`). Vertrag: Variablen, Dauer und Marke gehen hinein, ein transparentes
WebM (1080×1920, 25p, genau so lang wie verlangt) kommt heraus. Neue Stücke entstehen aus Lücken: Beim Schnitt wird jeder Satz
daraufhin gelesen, ob eine Grafik besser erklärt. Fehlt sie, entsteht eine Idee mit dem genauen Satz und der Begründung, warum
nichts Bestehendes passt. Ein Mensch gibt den Pitch frei, wählt aus drei Standbildern einen Look, nimmt das fertige Stück ab.
Erst dann ist es aktiv und das Storyboard darf es benutzen. Konzept: `docs/motion-werkstatt.md`.

## Befehle

```sh
npm run studio -- help
npm run studio -- motion luecken --skript skript.md --projekt P-023      # Trockenlauf
npm run studio -- motion neu wert-verlauf --name "Wert-Verlauf" --typen verlauf
npm run studio -- motion render zahl-zaehler -o out.webm --set wert=7 --set suffix=" von 10" --dauer 2.6 --marke alperna
npm run studio -- motion batch zahl-zaehler --zeilen zeilen.json -o renders/ --marke alperna
npm run studio -- ideen liste
```

## Aufbau

```
src/core/        Pfade, Schemas, Storyboard-Prüfung
src/motion/      Stück-Vertrag, Bibliothek, Staging, Render, Prüfung, Lücken, Ideen
library/motion/  die Stücke
marken/          Markenprofile (Übergang)
assets/fonts/    Schriften
prompts/         Anleitungen und geprüfte Beispiel-JSONs
scripts/         Selbsttest mit echtem Rendern
```
