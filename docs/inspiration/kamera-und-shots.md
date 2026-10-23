# Kamera, Einstellungen und Shotliste

Quelle: DeH8vGJjPOQ (43 Einstellungen mit Kinostills), DeN9Tp2FSoC (40 Einstellungen mit eigenen Aufnahmen des Autors), Dexrx7XEcyT (24 Einstellungen mit Wirkung), Dd4S2RFqCDT, DdUXS0Ipk6Y, Dd-ZkWQjUAU, DeOn0a3AscK, Dd953y5IA_4. Eigene Worte. **Ich habe Bilder gesehen, keine Bewegung im Raum erlebt.** Kamerafahrten beurteile ich nur aus Bildfolgen; bei sieben Beiträgen habe ich alle 0,5 Sekunden abgetastet. Die Wirkungen sind **Filmkonvention und Erfahrungswissen, keine geprüfte Forschung** (Regel 7).

## Wirkung vor Name

Die nützlichste Sammlung ist die mit **Einstellung gleich Wirkung** (Dexrx7XEcyT). Eine Shotliste soll nicht fragen «Welche Einstellung?», sondern «Welche Wirkung willst du?». Für unsere Marken (ruhig, vertrauenswürdig, konkret) zählen diese Wirkungen:

| Wirkung | Einstellungen |
|---|---|
| Nähe | Close-Up, Medium Close-Up, Reaktionsbild |
| Ruhe, Kontrolle | feststehende Kamera, mittig im Bild, Augenhöhe |
| Ort, Weite | Wide, Establishing, Extreme Wide |
| Detail, Können | Insert (Werkzeug, Material, Hände), Top-Down für Arbeitsfläche |
| Gespräch | Over the Shoulder, Two Shot |
| Neugier | Vordergrund-Enthüllung, Schärfeverlagerung (Rack Focus) |
| Eintauchen | Blick der Person (POV), Verfolgung (Follow, Tracking) |
| Energie | Handkamera in kleiner Dosis, Push-In |
| Abschluss | langsames Zurückziehen (Pull Out, Dolly Out) |

Selten für uns: Macht (tiefer Winkel), Unbehagen (schiefer Winkel), Einsamkeit, Schock (Dolly Zoom), Chaos (wackelnde Kamera).

## Kern-Katalog für Handy, Kompaktkamera und Gimbal

Etwa 20 der 43 Einträge decken den Alltag von KMU und Vereinen ab: Extreme Wide, Wide, Full Shot, Medium, Close-Up, Extreme Close-Up (selten), Two Shot, Over the Shoulder, POV, Reaction, Insert, Cutaway, Establishing, Eye Level, Low Angle (selten), Top-Down, Follow Shot, Handheld, Push-In, Rack Focus, Pull Out. Die Zeile je Eintrag: **Name, Zweck in einem Satz, Aufwand (Handy, Stativ, Gimbal), Beispielbild.**

## Beispielbild: nur eigene

Die beiden grossen Sammlungen zeigen **fremde Kinostills** (DeH8vGJjPOQ, Dexrx7XEcyT). Das taugt als interne Referenz beim Sichten, nicht als Bild im Tool oder in Kundenunterlagen (Urheberrecht). Die Sammlung DeN9Tp2FSoC zeigt den Weg: **eine Person, ein Ort, viele Einstellungen**, alles selbst gedreht.

**Vorschlag: ein Referenztag.** Ein Mitarbeiter von Alperna als Modell, ein Ort mit Tageslicht, Handy und Gimbal. Eine Planliste mit den 20 Einstellungen, ein Standbild je Einstellung, in den Katalog (`./studio katalog scan`, Tag `shot`, Beschreibung mit Einstellungsname). Daraus entsteht `shots.json` mit Verweis auf das eigene Beispielbild. Ein zweiter Satz mit einem Handwerksmotiv (Pinsel, Fassade, Werkstatt) folgt bei Bedarf.

## Aufnahmeregeln, die mehrere Beiträge nennen

- **Raum lassen:** Drittelregel oder Platz über und unter dem Motiv, lieber mit Weitwinkel zurückgehen (Dd953y5IA_4). Gilt auch für Text, der später ins Bild kommt.
- **Kamera-Mindestwerte (DeOn0a3AscK):** 4K, 10 Bit, Log-Profil; 30 Bilder pro Sekunde bei 1/60 Verschlusszeit für natürliche Bewegungsunschärfe. Unser V-Log-Ablauf deckt Log schon ab (`src/schnitt/vlog.ts`); neu ist die Prüfung beim Import (siehe unten).
- **Zwei Lampen:** Hauptlicht etwa 45 Grad zur Kamera, knapp über Augenhöhe; ein Trennlicht hinter der Person (DeOn0a3AscK). Die RAW-Beschriftung eines Foto-Karussells sagt dasselbe kürzer: ein Licht, harte Schatten, wenig Umgebungslicht, **zuerst Licht, dann Look** (DdqrKRDilMR).
- **Detail als Bildmetapher (DdUXS0Ipk6Y):** zu jedem Gedanken eine Nahaufnahme einer Requisite (Lupe, Notizbuch, Handy). Für Handwerk liegt das nahe: Pinsel, Farbmuster, Massband, Untergrund.
- **Aufnahmen mit Übergang im Kopf (Dd-ZkWQjUAU):** Wer den Szenenwechsel durch eine Person im Vordergrund oder durch einen Bildschirmrahmen plant, muss das beim Drehen tun (gleiche Bewegung in beiden Clips, Person geht durchs Bild). Die Shotliste führt dafür ein Feld `uebergang`.
- **Natur- und Stilllebenaufnahmen (Dd4S2RFqCDT):** Rückenansicht, Gegenlicht, Stillleben mit Linsen; ruhiger Look, für Landschafts- und Produkt-B-Roll brauchbar.

## Shotliste im Studio (M3)

Eine Shotliste je Inhalt: Szene, Absicht (Wirkung), Einstellung aus dem Katalog, **Beispielbild**, Aufwand, Übergang. Artefakte: `shotliste` (JSON) und `shotliste_bogen` (JPEG, Bögen der Beispielbilder), in der Datenbank `app.studio_artifact_spec` **und** `lib/studio/artifacts.ts` (Paritätstest), Anzeige auf `/studio/inhalte/[code]`. Befehl: `./studio reel shotliste <ID>`. **Immer mit Beispielbild**, wenn ein Shot vorgeschlagen wird (Wunsch von Andrej).

## Prüfung beim Import (kleiner Baustein)

Beim Scan des Rohmaterials melden: Auflösung unter 4K, Farbtiefe unter 10 Bit, kein Log-Profil, Bildrate und Verschlusszeit abweichend vom Plan. Nur ein Hinweis im Katalog, kein Blocker.
