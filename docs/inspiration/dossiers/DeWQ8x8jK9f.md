# DeWQ8x8jK9f · «cinematography» (Foto-Look) · Karussell (10 Bild-Folien) · @timavisual · 1'037 Likes
Gespeichert bei Folie 10 (Abbinder «Comment PRESET»). Quelle: alle 10 Folien gesehen (3 Folienbögen) plus die volle Beschreibung. Fotos in RAW mit einer Sony-Vollformat (Angabe in der Beschreibung).

**Thema:** «Wie ich einen **Fuji-inspirierten Look** auf einer Sony-Kamera bekomme», eine Anleitung für **Adobe Lightroom** (Mobil und Desktop): ein **Film-Profil als Ausgangspunkt**, dann kleine eigene Korrekturen. Kommentar «PRESET» für die Vorgabe des Autors.
**Hook (Folie 1):** Hochformat, zwei Hände halten einen kleinen Fisch über dem Wasser (warme Haut, tiefes Blaugrün des Wassers), darüber «How I get a Fuji-inspired look on a Sony camera», «swipe for my lightroom edit →».
**Beispielbilder (Folien 2 bis 5, Italien, Abendlicht):** schmiedeeisernes Tor am See, Haus mit Palme und weissem Cabrio, Rettungsring auf einem Boot vor Bergen: **warme Hauttöne und Mauern, Schatten ins Blaugrün gezogen, weiche Kontraste, leicht körnig**.
**Schritte der Anleitung (eigene Worte, mit den Werten des Autors für **ein** Foto; er sagt selbst, dass er sie nicht immer gleich setzt):**
1. **RAW aufnehmen** (mehr Spielraum): Vorher/Nachher-Beispiel.
2. **Film-Profil «Film-Inspired 01»** als Start (in der kostenlosen mobilen Lightroom-App), Stärke einstellen.
3. **Eigene Tonwerte:** Farbtemperatur und Tönung nach Licht; hier Belichtung +1,9, Kontrast +35, **Lichter −100**, Schatten +42, Weiss −95, Schwarz +45 (**Lichter dämpfen, Schatten aufhellen, Töne wärmen**).
4. **HSL-Regler:** Farbton (Hue) ändert den Farbton, Sättigung macht Farben satter oder gedämpfter, Luminanz heller oder dunkler; hier Orange und Gelb kräftiger und heller, Blau zurückgenommen.
5. **Klarheit senken** (hier −25), Textur +2: weicher, weniger «digital scharf».
6. **Korn** als Abschluss (Menge 40, Grösse 30, Rauheit 47; weniger für einen feineren Look).
**Gestaltung:** unscharfes Hintergrundbild des Fotos mit weisser Schrift; Vorher/Nachher als abgerundete Hochformat-Kärtchen; Bildschirmfotos der Regler. Ruhig, sehr gut lesbar.
**Passt zu Alperna?** **Ja, direkt für M4 (Foto-Batch mit Looks).** Das ist ein vollständiges **Rezept für einen Look** in Form von Zahlen: Profil, Tonwerte, HSL, Klarheit, Korn. Daraus lassen sich **fünf Looks als Daten** bauen (z. B. «warm-filmisch», «kühl-klar», «matt-nordisch», «hell-natürlich», «kräftig-dunkel»); je Look wird auf **drei Mustern** der gleichen Reihe gezeigt, Andrej wählt einen, dann läuft er auf alle Bilder derselben Art (Kunde oder BTS). Umsetzung ohne Lightroom: **ffmpeg** mit LUT und einfachen Filtern (Farbkurven, Sättigung, Unschärfe, Rauschen), für **JPEG in V-Log** (wie bei unseren Videos) passend; **RAW braucht ein Entwicklungsprogramm** (offene Frage an dich: JPEG oder RAW?). **Zu klären:** Kann ein Look «Film-Inspired» als Name geführt werden; die Marke «Fuji» bleibt weg.
**Belege:** (1) Folie 1: Titel «How I get a Fuji-inspired look on a Sony camera»; (2) Folie 4: Regler Temp, Tint, Exposure, Contrast, Highlights −100, Shadows +42, Whites −95, Blacks +45; (3) Folie 7: Klarheit −25 und Korn Amount 40.
**Eignung Marketing-System:** M4: `looks/*.json` (Name, Profil, Tonwerte, HSL, Klarheit, Korn), Befehl `./studio foto batch <ordner> --typ kunde|bts`; die Zahlen sind **Beispielwerte**, nicht Standard.
