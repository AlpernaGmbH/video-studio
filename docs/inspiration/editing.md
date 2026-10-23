# Schnitt mit Claude: Abläufe, Tempo, Schnittseite

Quelle: Dee5ObigMNa (Anleitung, ein Prompt), DegOQG6Tydw (ganzes System eines Creators), Dei5MKHgHyB (fünf Durchgänge), Dd__INdueH4 (19 Schnittstile), DcHAMh2MIip (Hook stapeln), DeulxG-t1li (Oberfläche), DdpCoibIthe (Nachbearbeitung im selben Take), DdMEpR4xurB, DbZxUmzNqv9, DdUXS0Ipk6Y. Eigene Worte; Wirkungsangaben sind Behauptungen der Autoren.

## Was die Beispiele bestätigen

Unser Ablauf (`./studio reel …`, Plan v4, `docs/plan/editing-blueprint.md`) deckt fast alles ab, was die Beispiele zeigen:

| Schritt im Beispiel | bei uns |
|---|---|
| Wortzeiten aus dem Ton (faster-whisper, WhisperX) | `src/schnitt/transkript.ts`, `whisper.ts` |
| Atem, Pausen, Füllwörter erkennen, den besseren Take wählen | `zuordnung.ts`, Take-Auswahl, Regie-Liste |
| Untertitel mit zwei bis drei Wörtern | `presets/`, SRT |
| B-Roll in einen Ordner werfen, beschriften, sortieren | `src/katalog` |
| Motion-Grafik aus HTML (HyperFrames) | `library/motion`, Render |
| Ton mischen auf −14 LUFS | Audio-Preset |
| Anmerkungen wie an einen Cutter, Claude rendert neu | Prüfplatz, Warteschlange |

Zwei Beispiele (Dei5MKHgHyB, Dee5ObigMNa) betonen **getrennte Durchgänge statt eines grossen Prompts**: Transkript, Freistellung, Untertitel, Motion, Ton. Das ist unsere Pipeline und bestätigt, dass **jeder Schritt einzeln gegengelesen** wird.

## Was uns fehlt (und was nicht)

1. **Stil-Studie aus einem Referenz-Reel** (Dee5ObigMNa: «dupliziere den Stil dieses Reels»). Claude liest das Reel, misst Schnittdichte und Bewegung, sieht Kontaktbögen und Bilder von Hook und Untertiteln und leitet daraus Schrift, Kontur und Platzierung ab. **Das ist `./studio inspiration sichten`**, nur ohne den letzten Schritt: aus dem Dossier ein Preset ableiten und ins Storyboard legen. Offen als Auftrag «Stil-Studie».
2. **Freistellung der Person** («Text hinter dem Kopf»). Braucht ein Segmentierungsmodell oder Resolve (Magic Mask). Siehe `farbe-und-foto.md`.
3. **Schlüsselwort-Betonung** in den Untertiteln: ein Wort gross, in kursiver Serife, die übrigen klein. Als Untertitel-Preset (Marke Alperna: Gold als einziger Akzent).
4. **Automatischer Zuschnitt quer nach hoch** mit Gesichtsverfolgung (OpenCV, Dee5ObigMNa). Nur nötig, wenn die Kamera quer filmt; erst bauen, wenn der Fall eintritt.
5. **Schnittseite im Tool** (DeulxG-t1li): Vorschau links, Schrift, Farben, Lage der Untertitel, Geräusche, Musik, Bilder je Wort und eine Liste «Wort gleich Ereignis». Der Autor baut damit ein Programm, das selbst rendert. Bei uns bliebe Resolve der Schnitt, und das Tool würde zeigen und von einem Menschen entscheiden lassen. Gross, später, eigener Entscheid.

**Nicht übernehmen:** Musik per yt-dlp aus dem Netz laden (Urheberrecht; bei uns nur lizenzierte Klänge), «alles in einem Prompt» ohne Gegenlesen, automatisches Veröffentlichen und «Testreels» ohne Freigabe (Regel 1).

## Tempo: was gemessen wurde

Messung mit ffmpeg (Szenenwechsel ab 0,3). **Sie zählt harte Schnitte, nicht Einblendungen, Masken oder Bewegungen im Bild.** Ein Reel mit «0 Schnitten» kann dennoch alle zwei Sekunden etwas ändern.

| Harte Schnitte pro Minute | Reels |
|---|---|
| 0 bis 2 | 11 von 22 (Listenreels, Talking Heads mit Einblendungen, reine Grafik) |
| 3 bis 11 | 5 (Spot, Erklärreels, Interface) |
| 12 bis 25 | 5 (Effektreels, Anleitung mit Weitwinkel) |
| über 50 | 1 (Hook-Stapel-Reel, 53 pro Minute, Schnitt alle 40 bis 120 ms im Hook) |

Gemessen wurden 22 Reels; die Kennzahlen stehen im Dossier jedes Beitrags (nicht im Repo). Aussagen der Autoren zum Tempo («alle drei Sekunden etwas ändern», Schnitt für «knappe Zuschauer» schneller) sind **ohne Beleg** und widersprechen «ruhig und hochwertig». Unser Vorschlag als **Empfehlung**: ein sichtbarer Wechsel (Bild, Satz, Grafik) alle vier bis sechs Sekunden, höchstens 20 Sekunden ohne Wechsel, höchstens etwa zwölf harte Schnitte pro Minute. **Das sind unsere Werte, keine bewiesenen.**

## Pegel

Fast alle Beispieldateien liegen bei −14 bis −15 LUFS. Das ist sehr wahrscheinlich die **Normalisierung der Plattform** an den heruntergeladenen Kopien, nicht die Wahl der Autoren; als Urteil über ihre Mischung taugt es nicht. Vier Beispiele zeigen True Peak über 0 dBFS (bis +2,4): nach verlustbehafteter Kompression nicht ungewöhnlich. Unsere Prüfung gehört an den Master vor dem Export (True Peak höchstens −1 dBFS).

## 19 Schnittstile (Dd__INdueH4)

Kurzform, schneller Schnitt, Erzählung, filmisch, YouTube, Werbung, Motion Graphics, kinetische Typografie, ohne Gesicht, Talking Head, Dokumentation, Erklärvideo, Musikvideo, Vlog, Podcast, Gaming, Hochzeit und Event, minimalistisch, Collage. Als **wählbares Schnittprofil je Format** brauchbar (Talking Head, Erklärvideo, Werbung, Dokumentation, minimalistisch); **nie als Standard**, und die schnellen Profile nur auf ausdrücklichen Wunsch (M9).

## Schnittdaten von Auftrag zu Auftrag

Die Beispiele zeigen, dass Auftraggeber **Anmerkungen am fertigen Ergebnis** geben («der weisse Rand um mich sieht unecht aus»). Unser Prüfplatz hat dafür Änderungswünsche (Tor P). Keine Neuerung nötig; die Schleife ist zu beschreiben und im Tool sichtbar zu halten.
