# Ton und Sounddesign

Quelle: DctTp5ay2Pa (Motion-Spielerei mit Ton), DeOk9mNExld (sechs Aufnahmen vorher und nachher), Dei5MKHgHyB (Durchgang «Sound»), DegOQG6Tydw (Musik), Dd__INdueH4 und weitere für Pegel. Eigene Worte.

## Grenze zuerst

**Ich höre nichts.** Ich habe für die Beispiele Pegel, Spitzen, Einsatzzeiten und Frequenzanteile **gemessen** (ffmpeg und ein kleines Python-Skript) und die Zeitleisten **angesehen**. Ob ein Klang gut ist, entscheidet ein Mensch mit Kopfhörer. Musiktitel erkenne ich nicht.

## Was die Beispiele zeigen

1. **Der Ton kommt knapp vor dem Bild** (DctTp5ay2Pa). Bei einer Animation mit Schaltfläche, Karte und Avatar liegen die Tonspitzen bis 0,5 Sekunden vor oder genau auf den Bildereignissen (Messung: Einsätze bei 4,5, 7,3 und 9,9 s gegen Bildereignisse bei 5,0, 7,5 und 10,0 s). Bei jeder Animation ein kurzer Klang (Klick, tiefer Schlag), keine Musik.
2. **Fläche plus Einzelklänge** (DeOk9mNExld). In sechs Vorher-Nachher-Paaren besteht die «nachher»-Fassung aus **mehreren Spuren**: einer Fläche (Raum, Wind) und kurzen Klängen, die einzeln auf sichtbare Ereignisse gesetzt sind (sieben Klänge bei sieben Schritten auf einer Treppe, ein regelmässiges Muster bei einer Strasse). Die Messung zeigt bei vier der sechs Paare in der Nachher-Fassung einen **mehr als doppelt so grossen Anteil unter 200 Hz** (zum Beispiel 10 gegen 25 und 10 gegen 23 Prozent), bei zwei Paaren (Wald, Strasse) nicht (11 gegen 4 und 15 gegen 9 Prozent; bei der Strasse wächst dafür der Anteil über 2 kHz von 22 auf 75 Prozent). Bei Treppe und Berggrat liegt der Originalton im Median rund 9 dB unter der Nachher-Fassung. **Eine einheitliche Regel ergibt sich daraus nicht.** Was die Klänge sind, schliesse ich aus dem Muster der Zeitleiste, nicht aus dem Gehör.
3. **Fünf Klangaufgaben in einem Reel** (Dei5MKHgHyB): ein Schlag auf den Hook, ein Klick bei jeder Bewegung, ein Glockenton zum Schluss, die Stimme oben, Master auf −14 LUFS.
4. **Musik nach Gefühl abgelegt** (DegOQG6Tydw): Bibliothek mit Stimmungs-Etiketten, Claude schlägt zum Thema vor. Der Autor lädt die Titel mit einem Download-Werkzeug aus dem Netz; **das übernehmen wir nicht** (Urheberrecht).

## Pegel in den Beispielen

Fast alle Beispiele liegen bei −14 bis −15 LUFS, vermutlich wegen der Normalisierung der Plattform an den Kopien. **Das sagt nichts über die Mischung der Autoren.** Unser Ziel bleibt −14 LUFS beim Master und True Peak höchstens −1 dBFS. Vier Beispiele überschreiten 0 dBFS (bis +2,4); nach der Kompression der Plattform nicht ungewöhnlich, bei uns aber ein Prüfpunkt vor dem Export.

## Folgerung für das Studio (M8)

- Storyboard-Feld `sounds[]`: Zeit (auf das Bildereignis, mit Vorlauf bis 0,5 s), Art (Klick, Schlag, Whoosh, Fläche, Glocke), Klang aus dem Katalog, Pegel.
- Katalog: neue Art **Klang** mit Lizenz, Quelle, Dauer, Pegel. **Nur lizenzierte Klänge**, kein Scraping, kein Nachbau fremder Pakete (die Pakete der Autoren sind nicht prüfbar).
- Vorschau mit Ton-Mischung (`reel vorschau`), Messung und Warnung: True Peak über −1 dBFS, Anteil unter 200 Hz auffällig hoch, mehr als vier Klänge pro Sekunde.
- Freigabe der Klangwahl durch einen Menschen (Tor P).
- Ruhige Marke: weniger Klänge, keine Whoosh-Dauerschleife; Soundeffekte und Zähler auf Wunsch.
