# Farbe, Foto-Looks und Masken

Quelle: DeWQ8x8jK9f, DdqrKRDilMR, DeUFkeYir-x, DeOn0a3AscK (Foto-Looks in Lightroom), DeRRCivjL3A (Masken im Foto), DeuEgjxFGJO (Masken im Video, DaVinci Resolve). **Nicht gesehen:** das YouTube-Video «How to Color Grade V-Log Footage» (H9yhVi_8eVU, Evan Schneider): YouTube sperrt Abrufe aus dieser Umgebung (Bot-Sperre), es liegt nur der Titel vor. Eigene Worte.

## Unser Stand

V-Log und LUT sind gebaut: Erkennung von Log-Material, `.cube`-LUT, Vorschau nur für die erste Spur, Übergabe an Resolve (`src/schnitt/vlog.ts`, `lut.ts`, `docs/plan/editing-blueprint.md`). Für **Videos** gibt es damit einen Weg. Für **Fotos** gibt es noch keinen.

## Look als Rezept

Vier Foto-Karussells geben jedem Look **ein Rezept aus wenigen Teilen**:

1. **Ein Profil als Start** (Film-Profil in Lightroom, DeWQ8x8jK9f).
2. **Tonwerte:** Weissabgleich, Belichtung, Kontrast, Lichter dämpfen, Schatten heben (die Werte gelten für ein einzelnes Foto und der Autor selbst setzt sie nicht immer gleich).
3. **Farben:** Farbmischer (Farbton, Sättigung, Luminanz je Farbbereich) und Color Grading mit **einem Farbpaar**: eine Farbe in die Schatten, eine andere in die Lichter, dazu eine Kontraststufe (DeUFkeYir-x: «Pale Yellow und Soft Teal, Kontrast schwer»).
4. **Textur:** Klarheit etwas senken, Korn als Abschluss.
5. **Masken** für gezielte Anpassungen (Person, Himmel, Hintergrund).

Ein Look hat einen **Namen mit Stimmung** statt eines Zahlencodes (DeUFkeYir-x: «Quiet Corner», «Held Breath», «Drowned Light») und wird mit **RAW neben dem Ergebnis** gezeigt. Die gezeigten Looks sind düster und kinohaft. Für Alperna und die meisten KMU sind natürlich-warme, hell-klare und dezent-kühle Varianten wahrscheinlicher; die gezeigten Zahlen sind **Beispielwerte, keine Standardwerte**. **Zuerst Licht, dann Look:** Das RAW-Foto aus DdqrKRDilMR trägt die Beschriftung «ein Licht, harte Schatten, wenig Umgebungslicht»; ein Look rettet kein schlechtes Licht.

## Foto-Batch mit V-Log-Looks (M4, Stufe 1)

Vorschlag nach Wunsch von Andrej:

1. **Eingabe:** ein Ordner mit Fotos (JPEG in V-Log). Die **Trennung Kunde oder Behind the Scenes** geben wir über den Ordner oder eine Liste vor (`--typ kunde|bts`), **nicht** über Bilderkennung: Eine Fehlzuordnung bei Kundenbildern kostet mehr als ein Ordner.
2. **Fünf Looks** als Datei (`looks/*.json`): Name, LUT oder Tonwerte, Farbpaar, Kontraststufe, Textur. Sie werden auf **drei Mustern** aus der Reihe gezeigt (Vorher, fünf Nachher), als Bogen mit Beschriftung.
3. **Wahl durch einen Menschen** (Tor P). Danach läuft der gewählte Look auf **alle** Fotos des Auftrags.
4. **Umsetzung** mit ffmpeg (`lut3d` auf JPEG, einfache Filter). **Originale bleiben unangetastet**, Ergebnisse in einem eigenen Ordner.
5. **Offen für dich:** Sind die Fotos JPEG in V-Log oder RAW (RW2)? RAW braucht ein Entwicklungsprogramm als neue Abhängigkeit (Eintrag in `STATUS.md` nötig).

**Stufe 2 (später, nur wenn Stufe 1 überzeugt):** Maske für Motiv oder Himmel. Auf dem Mac liesse sich ein kleines Hilfsprogramm mit der Motiverkennung von macOS bauen. Das ist **ungetestet und von hier nicht prüfbar**.

## Masken im Foto (DeRRCivjL3A)

Das stärkste Muster: ein **Masken-Plan als Zeichnung auf dem Foto**. Das Bild ist in Zonen geteilt (Himmel, Berg, Wald, Gras, Wasser), jede Zone trägt eine **handschriftliche Anweisung** (Farbe wärmer, Kontrast hoch, Nebel, Störendes entfernen). Der Wert liegt im Plan, nicht im Programm. Für Kundenfotos: Zonenliste je Motivart (Fassade: Himmel, Putz, Fenster, Boden; Porträt: Haut, Kleidung, Hintergrund; Innenraum: Fenster, Wände, Boden). **Ein eigener Foto-Editor mit Masken-Oberfläche lohnt sich nicht:** Lightroom, Capture One und Resolve können das, und Eigenbau kostet Monate.

## Masken im Video (DeuEgjxFGJO)

Drei Werkzeuge in Resolve: **Power Windows** (Formen, um das Auge zu führen), **3D-Qualifier** (eine Farbe auswählen, ohne den Rest zu berühren) und **Magic Mask** (ein Motiv verfolgen, ohne von Hand zu zeichnen). Nach meinem Wissen ist Magic Mask Teil der kostenpflichtigen Studio-Version von Resolve; **die Folien sagen dazu nichts**. **Offene Frage an dich: Hast du Resolve Studio?**

Was wir bauen können, ohne Masken zu automatisieren:

- Ein Rezept `docs/masking-im-video.md`: wann Power Window (Himmel, Vignette), wann 3D-Qualifier (Farbe, zum Beispiel Gras), wann Magic Mask (Person absetzen).
- In der Übergabe an Resolve ein **Feld je Clip**: «Person absetzen», «Himmel abdunkeln», das der Cutter dort abarbeitet.
- Ein **Powergrade je Marke** als Datei im Studio-Ordner (Look der Familie).

**Nicht bauen:** automatische Masken ausserhalb von Resolve. Dasselbe gilt für «Text hinter der Person» (siehe `grafik-und-effekte.md`).

## Weitere Folgerungen

- Beim Import ein Hinweis zu Auflösung, Farbtiefe und Log (siehe `kamera-und-shots.md`).
- Die Farbwelt Rot-Orange gegen Türkis-Teal aus mehreren Beiträgen ist ein Look unter vielen. Marke Alperna: gedämpftes Blau, Gold als einziger Akzent; Looks je Familie, drei zur Wahl.
