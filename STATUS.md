# STATUS.md – video-studio

Stand: 21.10.2026, nach Freigabe von **Bauplan v4** (`docs/plan/bauplan-v4.md`, gilt vor v3; Umsetzungsstand im Abschnitt «Plan v4» unten). Etappe 1 (**Fundament und Motion-Werkstatt**) und Etappe 2 (**Notion, OneDrive, Prüfplatz, Einrichtung je Mac**) sind fertig. Als Nächstes: Phase 0 auf dem ersten Mac (`docs/phase0-mac.md`).
Phase 0 des Bauplans (Tests T1 bis T6) ist **nicht** gelaufen, weil sie M4/M5-Macs, echte Clips, Instagram und Notion-Praxis braucht.

`npm run check`: 1583 Tests in 86 Dateien grün (3 übersprungen, brauchen Apples DTD und Python mit OpenTimelineIO), Lint der Bibliothek ohne Fehler. `npm run selftest:render`: besteht (Linux, siehe «Gemessen»).
Prüfplatz: `scripts/pruefplatz-test.cjs` (Headless-Chrome, nachgebautes Notion, Modus `view`), 14 Prüfungen bestanden. Er gehört nicht zu `npm run check`, weil er Playwright braucht.

## Entscheide von Andrej am 22.10.2026

- **Kamera:** Lumix S1IIE und S5II (gleicher Sensor), Profil **V-Log**. Clips liefert er noch nicht: Alles, was vom echten Material abhängt (Datenbereich, Etikett, Belichtung), bleibt bis dahin Annahme (Test T11).
- **Regel 2 «Looks je Familie»:** Auf seine erste Antwort («bro was redest du checke ihc ned») habe ich die Frage einfach gestellt: «Für eine Gruppe gleicher Grafiken (zum Beispiel Handy-Mockups) zeige ich einmal drei Stile, du wählst einen, danach entstehen alle Stücke der Gruppe in diesem Stil.» Seine Antwort: **«Ja, je Gruppe».** Damit gilt Regel 2 seit 22.10.2026 je Familie (`CLAUDE.md`). Jedes Stück wird weiterhin einzeln abgenommen (Regel 1).
- **Schnittprofil Alperna** (Pause 0,4 s, Einstellung bis 5 s, Zoom höchstens 4 je Minute, Mindest-Clip 0,7 s): «ja gut». Das ersetzt die offene Gate-0-Bestätigung der neuen Werte.
- **Datenmodell** (Plan v4, Anhang B) und **Phase 2 (Studio im Alperna-Tool)**: «ja machen». Phase 2 war im Plan an das Urteil «sieht hochwertig aus» geknüpft; dieses Urteil steht aus, Andrej hat die Phase trotzdem freigegeben.
- **Entscheider im Tool:** nur Admins (Andrej, Leander). Mitarbeitende sehen alles und schreiben Notizen.
- Nichts davon gibt Claude frei: Einspielen der Datenbank-Migration, `NEXT_PUBLIC_FEATURE_STUDIO=1` auf Vercel, Merge auf `main` des Tools und das Abschalten des Prüfplatz-Artifacts brauchen jeweils ein eigenes Ja.

## Regel 2 «Looks je Familie»: gebaut am 22.10.2026

Im Code (`src/motion/familie.ts`, `idee.ts`, `protokoll.ts`, `geruest.ts`, `bibliothek.ts`, `cli.ts`; Konzept in `docs/motion-werkstatt.md`):
- **Geschlossene Liste** `library/motion/_familien.json` (Entwurf von Claude: `mockups`, `rankings`, `hook-texte`; ein Mensch ändert sie). `ideen neu` und `ideen bearbeiten --familie` weisen jeden anderen Schlüssel ab.
- **Eine Runde je Familie.** Die erste freigegebene Idee zeigt die drei Looks, ein Mensch wählt. Weitere Ideen der Familie warten (`ideen liste` nennt den Grund) und **erben** den Look danach mit `freigegeben → look_gewaehlt`, auch durch das System, weil die Wahl ein Mensch getroffen hat (`erbe.von`/`erbe.am` sind seine). Ein Look, den ein System gesetzt hätte, wird nicht übernommen. Das Erben ist kein Lernsignal.
- **Stand je Familie** im Ideenprotokoll (`daten/ideen.json`, Schema 2, nur wenn eine Familie einen Stand hat; sonst bleibt es Schema 1). Ein Rechner mit altem Code weist eine Schema-2-Datei mit klarer Meldung ab, statt den Stand still zu verlieren: **beide Macs vor der ersten Familie aktualisieren (`./studio update`).**
- Wird die Idee mit der offenen Runde abgelehnt, wird die Runde frei. «Keiner passt» behält sie bei der Idee (Runde 2).
- **Neue Fassung:** `ideen familie-zuruecksetzen <familie> --mensch --by Name --grund "…"` verwirft den Look (nur Mensch). Stücke, die schon im alten Look entstanden sind, behalten ihn.
- **Das Stück trägt den Look:** `motion neu … --idee <id>` verweigert das Gerüst, wenn der Look der Familie nicht gewählt ist, und legt sonst `familie` ins Datenblatt, `look/look.md` und `look/referenz.png` bei. `ideen weiter … in_bau` verlangt ein Stück mit der Familie (und bei geerbtem Look mit derselben Fassung). Lint: `familie_unbekannt`, `look_fehlt` (Fehler), `look_referenz_fehlt` (Warnung). Der Ordner `look/` zählt nicht in den Render-Schlüssel.
- **Pitch und Prüfplatz:** Der Pitch sagt, dass der Look einmal je Familie gewählt wird. Die Notion-Zeile trägt «Familie: …» in der ersten Zeile von «Pitch» (keine neue Notion-Spalte nötig); der Prüfplatz zeigt daraus bei Pitch und Look-Wahl: «Deine Wahl gilt für alle Stücke der Familie …». **Das Prüfplatz-Artifact ist damit noch nicht neu veröffentlicht** (das geschieht mit dem ersten Pitch einer Familie).
- Geprüft: 43 neue Tests (rein, Protokoll, Gerüst, Lint, CLI als Prozess, Notion-Abbild, Prüfplatz im Browser mit nachgebautem Notion), 23 Mutationsproben (Menschen-Prüfung beim Erben, `look_gewaehlt` für alle, offene Runde ignoriert, Runde nicht frei, Lernsignal beim Erben, Liste nicht geprüft, Verwerfen ohne Menschen, Schema immer 2, Speichern löscht den Stand, Lint, Fassung, Pitch-Text, Notion-Zeile, Prüfplatz-Hinweis): alle gefangen; eine überlebte zuerst (toter Code bei «Verwerfen während einer Runde», entfernt).
- **Nicht geprüft:** ein echter Durchlauf mit Notion und dem veröffentlichten Prüfplatz; dass die Familien-Zeile im Pitch von Notion unverändert zurückkommt (die Eigenschaft «Pitch» ist Text, Zeilenumbrüche kommen als `<br>`, der Prüfplatz liest die erste Zeile danach).
- **Offen für einen Menschen:** Die Liste der Familien bestätigen oder ändern; Gate 0 und die Look-Wahl gehören Menschen und laufen im Prüfplatz.
- **Die erste Familie «Mockups» ist nicht angelegt, mit Absicht.** Der Plan sah eine Idee mit dem genauen Satz von Andrej vor. Es gibt keinen solchen Satz: In seinen Nachrichten kommt keine Mockup-Grafik vor, nur im Plan v4 steht die Familie (Instagram-Profil, Google-Maps-Liste, Handy mit wechselbarem Screen) als Vorschlag von mir. Regel 6 verbietet, den Satz zu erfinden oder umzuformulieren. Sobald Andrej eine erste Grafik der Familie benennt oder ein Skript-Satz sie auslöst, legt Claude die Idee mit `ideen neu` und `"familie": "mockups"` an und pitcht; der Rest läuft wie beschrieben.

## V-Log (Lumix S1IIE, S5II): gebaut am 22.10.2026

Die LUT «log» der Marke Alperna ist jetzt die Umrechnung des Herstellers statt einer Näherung (`src/schnitt/vlog.ts`, `vlog-lut.ts`; Marke: `farbe.logProfil: "vlog"`, `farbe.vlog`).
- **Kette:** Code geteilt durch 1023 → V-Log nach linear → V-Gamut nach Rec. 709 (Matrix) → Belichtung → Lichter-Schulter → Rec.-709-Kennlinie → Look der Marke. Quelle: Panasonic V-Log/V-Gamut Reference Manual Rev. 1.0, Konstanten und Matrix nachgerechnet; geprüft sind die Anker 0 % = Code 128, 18 % = 433, 90 % = 602 und die Zeilensumme der Matrix. Das Knie der Schulter (0,75, linear) ist **meine Wahl**, kein Standard: Es lässt 18 % Grau bei 0,409 und 90 % Weiss bei etwa 0,93.
- **Gitter 65 statt 33**, weil es gemessen so entschieden wurde: Auf der Grauachse weicht ein 33er-Gitter bis 2,4 von 255 von der exakten Kurve ab (sichtbare Stufen in Himmel und Wänden), ein 65er 0,6. Bei natürlichen, mässig farbigen Bildern bleibt der Fehler unter 2 von 255 (p99 unter 1). Bei extremen Farben jenseits von Rec. 709 (zum Beispiel stark gesättigtes Cyan weit über Weiss) bleiben grosse Abweichungen: Dort schneidet die Umrechnung hart ab, und das kann eine LUT nicht abbilden. Die Datei ist rund 6,6 MB.
- **Erkennung:** Mit dem Profil «vlog» entscheidet bei einem Widerspruch die Marke: Etikett «bt709» bei flachem Bild gilt als V-Log (unsicher, mit Grund). Ein normales Bild mit normalem Etikett bleibt normal (Handy-Clips). **HDR-Clips (HLG, PQ) bekommen mit dem Profil «vlog» keine Log-Behandlung** (die V-Log-Kurve würde sie falsch umrechnen); eine eigene HLG-Umrechnung gibt es nicht. B-Roll aus der Kamera (Katalog `log`) trägt jetzt die Farbart «log».
- **Die LUT «log» wird bei V-Log immer geschrieben**, auch ohne Log-Clip, weil die B-Roll aus der Kamera erst mit dem Storyboard dazukommt.
- **Datenbereich (`--bereich voll|begrenzt|auto`), Belichtung (`--belichtung`), Profil (`--profil`):** je Inhalt, gemerkt in `reel.json`. `reel vorbereiten` meldet bei Log den Code des dunkelsten Pixels und die mittlere Helligkeit in Blenden zu 18 % Grau (ein Anhaltspunkt, keine Automatik).
- **Vorschau-Kette:** Log-Material wird ausdrücklich mit BT.709 nach RGB gebracht, nach der LUT zurück nach BT.709 begrenzt; die Vorschau trägt die Etiketten BT.709/begrenzt. **Gefunden durch die Pixelprobe, nicht durch die Rechentests:** Der von Hand gesetzte Datenbereich musste schon beim ersten Skalieren gelten (Eingang und Ausgang gleich), sonst rechnet dieses Skalieren nach dem falschen Etikett um und der Fehler ist danach nicht mehr zu retten (Weiss lag 14 von 255 daneben). Die Pixelprobe (`vlog-pixel.test.ts`) schickt ein Testbild mit bekannten V-Log-Codes (Schwarz, 18 % Grau, 90 % Weiss, eine kräftige Farbe) durch die echte Kette in vier Varianten: voll/pc, begrenzt/tv, ohne Etikett, falsch etikettiert in beide Richtungen.
- **LIESMICH der Übergabe** erklärt bei einer V-Log-LUT: nur in Projekten ohne Farbmanagement, Datenpegel prüfen, Belichtung.
- Geprüft: 72 neue Tests (1319 → 1391), `selftest:render` bestanden, 31 Mutationsproben (Konstanten, Matrix, Knie, OETF-Exponent, Grenzen, Gittergrösse, Vorstufe, Tetraeder-Interpolation, Belichtung, Erkennung, HDR, LUT immer schreiben, B-Roll, Hinweise, LIESMICH, jede Stelle der Vorschau-Kette): alle gefangen; eine überlebte zuerst (ein doppelt abgesichertes `Math.max`, entfernt).
- **Nicht geprüft, braucht einen echten Clip der Kamera (Test T11):** ob die MOV-Dateien den Datenbereich voll oder begrenzt schreiben und ob das Etikett stimmt; ob die Matrix BT.709 ist (angenommen); wie das Bild aussieht (Bilder kann ich nicht ansehen, nur messen). Das Testbild ist künstlich. Aus dem Objektivdeckel-Test (dunkelster Pixel bei Code 128 oder 173) lässt sich der Bereich in einer Minute ablesen: `./studio reel vorbereiten` nennt den Code.
- **Look als Entwurf:** `farbe.vlog` hat dieselben Zahlen wie der Angleich der Marke (Kontrast 0,3, Sättigung 0,92, Kühle 0,35), damit Log-Material und normales Material zusammenpassen. Ein Mensch bestätigt ihn in der Vorschau; Gate 0 erkennt geänderte Werte im Profil nicht.
- Die Umrechnung nach Rec. 709 ist neutral (Kamerakurve, keine S-Kurve): Sie sieht anders aus als die Herstellers-LUT von Panasonic, die ein Filmlook enthält. Das ist Absicht, aber ein Unterschied, den ein Mensch beim ersten Clip sieht.

## Studio im Alperna-Tool (Plan v4, Phase 2): Scheiben S1 und S2 gebaut am 22.10.2026

Zwei Repos. **Tool** (`AlpernaGmbH/tool`, Branch `studio-plattform`, nicht auf `main`): Datenbank, Geräte-API, Fortschrittsseite, hinter `NEXT_PUBLIC_FEATURE_STUDIO` (Standard aus); Beschreibung in dessen `CLAUDE.md` und `docs/studio/geraete-api.md`. **Dieses Repo:** Mac-Client in `src/studio/` (Anleitung `docs/studio-tool.md`).
- **S1 Fundament** (Migration `20261022090000_studio_fundament.sql`): Geräte, Inhalte (`c-NNNN` ab 1000), Notizen, Ereignisse. Status, Tore und Fassung eines Inhalts ändern sich in der Datenbank nur im selben Aufruf wie die Entscheidung eines Menschen (`studio_decide`, S4): Der Trigger gilt auch für `service_role` und den Tabellenbesitzer. Das ist die Datenbank-Fassung von Regel 1.
- **S2 Geräte-API** (Migration `20261022100000_studio_geraete_api.sql`): sechs Funktionen nur für `service_role` (Anmelden, Ereignisse annehmen, Stammdaten anlegen und ergänzen, Stand lesen, Gerät anlegen, widerrufen), Quote je Gerät (1000 Ereignisse und 300 Aufrufe in 10 Minuten), Audit-Log. Routen `/api/studio-geraet/events|contents|contents/<code>` mit Bearer-Token, die **nur über `.rpc(` mit der Datenbank sprechen** (ein Test verbietet Tabellen, Sitzungs-Client und Storage in diesen Pfaden).
- **S2 Fortschrittsseite** im Tool: `/studio` und `/studio/inhalte/<Code>` mit Stand, Tor I und P, Fassung und der Schrittzeitleiste (Dauer «2 Min. 14 s»). Die Seite folgt dem Fortschritt per Abfrage (4 s solange etwas läuft, sonst 45 s, im Hintergrund nie, nach 401 nie wieder). **Kein Prozentbalken:** Das Tool weiss nicht, wie viele Schritte noch kommen; der Streifen hat ein Feld je Schritt.
- **S2 Mac-Client** (dieses Repo): `src/studio/konfig.ts` (Token im Schlüsselbund, Rückfall `tool.json` 0600, Umgebungsvariablen), `melder.ts` (Ausgangskorb, Wartezeit nach Fehlern, 401 stoppt und meldet einmal, Pfadbereinigung), `befehle.ts` (`tool verbinden|status|senden|sync|trennen`), Haken in `stoppuhr.ts` und `reel.ts`, Doctor-Punkt «Tool» (nur Syntax). **Regel 11** in `CLAUDE.md`: Das Tool ist freiwillig und stört nie.
- **Abweichungen vom Plan, mit Grund:** (1) Der Ausgangskorb liegt in `~/.config/video-studio/ausgang/` statt in `~/.local/share/video-studio/ausgang/`: eine Wurzel neben `config.json` (ausserhalb von OneDrive und Repo), und `STUDIO_CONFIG` isoliert damit auch die Tests. (2) `./studio tool sync <ID>` statt `./studio studio sync <ID>`. (3) Statt eines Prozentbalkens ein Streifen je Schritt (siehe oben). (4) `reel status` und unbekannte Befehle melden nichts. (5) Die Beispiele für die Schnittstelle liegen als Kopie in beiden Repos (`docs/studio/vertrag.json`, am 22.10. mit `cmp` gleich) statt als gemeinsamer Code: Das Tool nutzt Zod 4, dieses Repo Zod 3.
- **Geprüft:** Tool `pnpm check` grün (49 Dateien, 504 Tests); SQL-Tests beider Migrationen gegen ein lokales PostgreSQL 16 mit Supabase-Stub (je Funktion `anon`, Admin-Sitzung, `service_role`; Idempotenz, Quote, abgewiesene Eingaben, Audit); dieses Repo `npm run check` mit 1583 Tests in 86 Dateien grün (3 übersprungen) und Lint der Bibliothek ohne Fehler. Mutationsproben: SQL 57 (6 überlebende sind gleichwertig, weil die Tabelle dieselbe Grenze noch einmal prüft), Geräte-API im Tool 42, Fortschrittsseite 48, Mac-Client 100 und eine zweite Runde nach den ersten Funden. **Funde der Mutationsproben:** (a) Die Pfadbereinigung liess «Müller» aus `…/Kunde Müller/a.mov` stehen (Leerzeichen im Ordnernamen) und einzelne Wörter mit einem Schrägstrich ohne Endung («kunde-mueller/b-roll»): beides repariert und getestet; (b) ein Test, der den Body-Zugriff vor der Anmeldung prüfen sollte, hätte ein Lesen über eine Kopie des Bodys nicht bemerkt (jetzt über einen Strom, der nur bei einem Lesen zieht; der Code war richtig); (c) kein Test prüfte die Form der Geräte-ID im Token (der Code war richtig, eine lockere Lesart mit 36 beliebigen Zeichen wäre unbemerkt geblieben und hätte bei einem falschen Token 503 statt 401 ergeben): Test ergänzt; (d) toter Code entfernt (`hinweisGegeben`, eine zweite Obergrenze der Wartezeit, ein `chmod` nach `writeFile` mit Modus, eine Tilde-Regel).
- **Nicht geprüft, braucht die Cloud oder einen Menschen:** die Kette über PostgREST (dass `ST422`, `ST404`, `ST429` als `error.code` bei supabase-js ankommen; unbekannte Codes sind 503, ein Fehler dort wäre also nie ein falsches «angenommen»); die Seiten im Browser und am Handy (getestet ist die Darstellung als Server-Rendering und die reine Logik, nicht der Hook im DOM); der echte macOS-Schlüsselbund und die unsichtbare Eingabe im Terminal; ein Vercel-Vorschau-Deployment mit Deployment Protection (die Geräte-Aufrufe brauchen dort einen Bypass); eine Firewall-Regel gegen anonyme Fluten (die Quote schützt nur angemeldete Geräte). Die Teile S3 bis S6 (Vorschau am Handy, Entscheide, Aufträge, Import aus Notion) sind nicht gebaut.
- **Offen für einen Menschen (jeweils ein eigenes Ja von Andrej):** Migrationen in die Cloud-Datenbank einspielen (nur neue Tabellen und Funktionen, nichts Bestehendes wird verändert; geht nur in einer Mac-Sitzung mit Supabase-Zugang: «Spiel die Migrationen `20261022090000` und `20261022100000` aus dem Branch `studio-plattform` ein, lass beide Tests in `supabase/tests/` laufen und erzeuge die Typen»), `NEXT_PUBLIC_FEATURE_STUDIO=1` auf Vercel, Merge auf `main`, ein Gerät anlegen und den Mac verbinden. Vor dem ersten Kundenmaterial in S3: Auftragsverarbeitung mit Supabase (London) und Vercel klären.

## Plan v4 (21.10.2026): Stand der Phase 1 (Schnittqualität)

Auslöser war der erste echte Testlauf: Das Video wirkte billig (hektisch, 40 Zooms in 30 s, abgeschnittene Sätze, Regieanweisungen im Bild, Skripttext statt Gesprochenem in den Untertiteln). Entscheid: nur ruhig und hochwertig, Tempo ist nicht das Problem.

**Fertig und mit Mutationsproben abgesichert** (`npm run check` grün, Exit-Code geprüft):
- 1.1 Takes und Regie: Ränder, die Whisper falsch hörte, werden erweitert; Regie-Wörter («Action», «Kamera», «Klappe», «ok», «cut») nur geschnitten, wenn sie nicht im Skript stehen; Einschübe kosten im Ranking; Schnitte rasten in der echten Stille ein (`stille.ts`); Mikro-Clips unter `minClip` verschmelzen; Untertitel zeigen standardmässig das Gehörte; **Gegenlesen ist Pflicht** vor dem Storyboard (`gegenlesen.md`, Sperre über `gegenlesen-stand.json`); `reel transkript` für Videos ohne Skript.
- 1.2 Zoom nur am Schluss: Der Planbau setzt keinen Zoom mehr. Das Storyboard hat das Feld `zooms` (nur auf betonten Wörtern, höchstens `maxProMinute`, Abstand 1 s, Begründung); ein Zoom zählt nicht als Bildwechsel.
- 1.3 Getrennter Ton: Tonaufnahmen (wav, m4a, mp3, aif, flac) im Aufnahmen-Ordner werden über die Videos gelegt (`ton-sync.ts`: Lautstärkekurve und FFT-Kreuzkorrelation, Versatz auf 10 ms; `ton-ablauf.ts`: Paarung, Handeingabe `--versatz`, gemerkt in `reel.json`). Whisper, Stille und Pegel rechnen auf dem Stück der Aufnahme, das zum Video gehört (`ergebnis/ton/<quelle>.wav`). Der Plan trägt `quelle.ton {quelle, versatz}`; FCPXML (Audio-Clip auf Lane −1, Musik auf −2), OTIO (A1 aus der Aufnahme), Vorschau und LIESMICH folgen. Die Prüfung meldet `ton-vor-beginn` und `ton-nach-ende` als Fehler, `clip-ohne-ton` als Hinweis.

- 1.4 Farbe: `reel vorbereiten` stellt fest, ob das Material flach (Log) ist (`farbe.ts`: Etikett `color_transfer`, sonst Messung an fünf Bildern, Urteil aus der Messung gilt als Vermutung; `--farbe log|rec709|auto` setzt es von Hand und wird gemerkt, `--ohne-farbe` lässt es aus). Aus dem Look der Marke (`farbe` im Markenprofil: Mitten, Kontrast, Sättigung, Kühle) und dem Material entstehen zwei 3D-LUTs in `ergebnis/lut/` (`lut.ts`, `farbe-ablauf.ts`): «log» mit am Material gemessenem Schwarz- und Weisspunkt, «angleich» für normales Material und B-Roll. Die Vorschau wendet sie pro Quelle an, Grafiken bekommen nie einen Look; die Übergabe legt sie nach `lut/` und erklärt in der LIESMICH, wohin sie gehören.
- 1.6 Messung: `./studio reel messe <ID> [--video datei] [--plan datei]` misst das fertige Video (Standard: jüngste Datei in `ergebnis/export/`): Dauer, Bitrate, Schnitte je Minute (aus dem Plan, sonst aus dem Bild gezählt; passt der Plan nicht zur Länge, wird er nicht benutzt und das steht in der Ausgabe), Zooms, Anteil von Grafik und B-Roll, Sättigung und Helligkeitsspanne, Lautheit, Spitze, Stille, Zeit bis zur ersten Aussage. Dazu die Prüfung gegen Export- und Audio-Preset und das Schnittprofil (`qualitaet.ts`), Ergebnis in `ergebnis/qualitaet.json`, Exit-Code 1 bei Abweichung. Die Hinweise zeigen, wohin ein Mensch schauen soll: «hochwertig» sagt die Messung nicht. Die Hinweis-Schwellen stammen aus dem Schnittprofil der Marke und den Presets, nicht aus eigenen Annahmen (Ausnahme: «Bild flach», dieselben Vermutungswerte wie die Log-Erkennung).
- 1.7 Tempo: Transkripte werden nach Inhalt der Datei (schneller Fingerabdruck: Grösse, Anfang und Ende), Modell und Sprache zwischengespeichert (`transkript-cache.ts`, `daten/cache/transkripte/`), auch zwischen Inhalten und Macs (OneDrive); ältere Transkripte ohne Fingerabdruck werden mit dem Standardmodell übernommen. Grafiken rendern nur neu, wenn sich Stück (alle Dateien), Werte, Dauer, Marke, «final» oder die HyperFrames-Version ändern (`renderSchluessel`, Marker `<datei>.render.json`; einmal real geprüft: 25,6 s beim ersten Render, 2 ms beim zweiten, 12,3 s bei geändertem Wert); `--neu-rendern` erzwingt. `reel vorbereiten` nennt am Ende die Dauer jedes Schritts (`stoppuhr.ts`). `./studio whisper benchmark <datei> --modelle …` misst Modelle am selben Stück (Zeit, Faktor zur Echtzeit, Wortfehlerrate gegen einen Referenztext oder das erste Modell).
- **Nicht gemacht in 1.7:** Whisper-Benchmark T2b auf dem Mac (der Befehl steht bereit, gemessen ist nichts), parallele Grafik-Renders (alle Renders eines Stücks teilen ein Staging-Verzeichnis, Parallelität bräuchte je Aufruf ein eigenes), Vorschau aus vorgeschnittenen Segmenten statt je Clip einem Eingang (nie an echtem Material gemessen, ob es nötig ist), Pegel-Zwischenspeicher (gemessen wird nur bei Zeilen mit mehreren Takes).
- Am Rand behoben: Der Argument-Parser frass bei `--schalter -o datei` das `-o` als Wert des Schalters.

**Geändert am Markenprofil Alperna** (`marken/alperna.json`, Feld `schnittprofil`): `laengstePause` 0,4 s, `laengsteEinstellung` 5 s, `zoom {modus: betonung, maxProMinute: 4}`, `minClip` 0,7 s. Die Gate-0-Freigabe vom 17.10. bezog sich auf die früheren, hektischeren Werte: Ein Mensch sollte die neuen bestätigen.

**Nicht geprüft und bekannte Grenzen des Tons:**
- Resolve (T9) hat die FCPXML mit dem externen Audio-Clip nie geöffnet. Dass er die Sprache als A2 zeigt und A1 leer bleibt, ist eine Vermutung.
- Die Schwellen der Sicherheit (Korrelation ab 0,75 «hoch», 0,55 «mittel») sind Annahmen und gehören an echtem Material geprüft (T10). Die Tests nutzen synthetisches «Sprachrauschen».
- Die Aufnahme muss das Video zu mindestens 80 Prozent abdecken. Eine Kamera ohne Tonspur lässt sich nicht messen: Dann geht der Versatz nur von Hand. Die Paarung über Timecode oder Aufnahmezeit (Plan v4, 1.3) gibt es nicht.
- Der generische Look («--profil generisch») ist eine **Näherung aus Zahlen** (Startwerte, Vermutung), keine Kamera-LUT. Für die Lumix gibt es seit 22.10. die Umrechnung des Herstellers (Abschnitt «V-Log» oben). Die Schwellen der Log-Erkennung (Sättigung unter 0,08 und Helligkeitsspanne unter 0,45) sind Annahmen (T10). Hauttöne richtet ein Mensch am Vectorscope aus. Wie das Ergebnis aussieht, ist nie gesehen worden: Bilder kann ich nicht ansehen, nur messen.
- Die Aufnahme wird pro Video als Stück transkribiert: Läuft eine lange Aufnahme über mehrere Videos, hört Whisper jedes Stück einzeln (dafür nie mehr als die Länge der Videos).

**Noch offen in Phase 1 (nach den Entscheiden vom 22.10.):** 1.5 Premium-Look und Grafikfamilien (braucht die Look-Wahl eines Menschen je Familie, Regel 2; der Familien-Look im Code steht seit 22.10., die erste Familie «Mockups» wartet auf die Pitch-Freigabe). Phase 2 bis 5 (Alperna-Tool, Supabase, Bibliothek, Videoanalyse) sind nicht begonnen: Sie warten auf das bestätigte Datenmodell (Plan v4, Anhang B) und geprüften Schreibzugriff auf `AlpernaGmbH/tool`.

## Entscheide aus dem Chat (17.10.)

- Eigenes Repo `AlpernaGmbH/video-studio` (das `studio/` im Website-Repo ist entfernt, die Website ist unverändert).
- Marke: **Alperna Design System (zweites, 17.9.)**: gedämpftes Blau ohne schwarzen Hauptgrund, Gold `#FFD700` als einziger Akzent. Profil `marken/alperna.json`.
- Alles über Claude und Claude Code, **nie über die Claude-API**. Darum ist der Prüfplatz ein Artifact, das die Notion-Verbindung des Menschen benutzt.
- Texte in Notion, Medien in OneDrive, Code im Repo. Ein zweiter Mac wird mit `init` und `doctor` eingerichtet (Skill `studio-einrichten`).

## Editing, Resolve und Presets (18.10.)

Auftrag von Andrej: Blueprint für den Editing-Teil prüfen, Resolve (bevorzugt) als Übergabe, Presets für Grafiken und mehr. Ausführlich in `docs/plan/editing-blueprint.md`.

- **Urteil über den Blueprint:** Marketingseite ohne Belege. Übernommen sind Ideen, die wir selbst prüfen können; die Live-Steuerung einer Schnitt-App nicht (Resolve-Scripting nur in Studio, nicht testbar, nicht reproduzierbar).
- **Gebaut: Schnittplan und Übergabe** (`src/schnitt/`): Schnittplan (Clips, B-Roll mit Katalog-Schlüssel, Grafiken, Musik, Wörter), Frame-Raster, Prüfung gegen das Schnittprofil der Marke, Untertitel (SRT), FCPXML 1.8, OTIO, Umwandlung der Grafiken WebM nach ProRes 4444,
  Anleitung `LIESMICH.md`. Befehle `./studio schnitt beispiel|sondiere|pruefe|resolve|export-pruefen`.
- **Geprüft:** FCPXML gegen Apples DTD 1.8 (`xmllint`), OTIO mit OpenTimelineIO 0.18.1, Umwandlung mit echtem ffmpeg (Alpha bleibt erhalten, nur mit dem VP9-Decoder von libvpx), Export mit echtem ffmpeg gemessen und gegen das Preset geprüft.
  Die DTD und OpenTimelineIO liegen nicht im Repo (Urheberrecht, Python); Umgebungsvariablen `STUDIO_FCPXML_DTD` und `STUDIO_OTIO_PYTHON` schalten die Gegenproben in `src/schnitt/extern.test.ts` ein.
- **Fund:** Der FCPXML-Leser von OpenTimelineIO (`otio-fcpx-xml-adapter` 1.0.0) setzt verbundene Clips im ersten Spine-Clip falsch. Er taugt als Gegenprobe für Spine und Länge, nicht für die Spuren. Deshalb gibt es zusätzlich die OTIO-Datei mit festen Lücken.
- **Nicht geprüft:** Dass Resolve die Dateien ohne Warnung öffnet. Neuer Test **T9** (`docs/plan/editing-blueprint.md`), braucht einen Mac mit Resolve und echte Clips.
- **Gebaut: Presets** (`presets/`, `src/presets/`): Export (`reel` nach Bauplan v2 Kap. 3.11, `reel-blueprint`, `vorschau`), Audio (`standard` −14 LUFS, `blueprint` −17 LUFS), Untertitel (3 Vorschläge), Grafik (7, davon 2 mit Stück `zahl-zaehler`).
  Befehle `./studio presets liste|lint|zeigen|overlay|platz|caption`. **Fünf Grafik-Presets haben kein Stück** (Hook-Karte, Lower Third, Keyword-Pop, Schlusskarte, Logo): Sie sind Lücken der Motion-Bibliothek und entstehen nur über die Motion-Werkstatt (Regel 2).
- **Nicht angefasst:** `marken/alperna.json` (Caption-Preset, Logo, Schlusskarte fehlen weiter), Notion-Zeilen.
- **Gebaut (19.10.): Skript-Zuordnung und Take-Auswahl** (`src/schnitt/transkript.ts`, `zuordnung.ts`, `planbau.ts`, `energie.ts`, `bericht.ts`), Befehl `./studio schnitt zuordnen`. Aus Skript und Whisper-Transkript entsteht ein Schnittplan: bester und zweitbester Take pro Zeile, Füllwörter und Pausen herausgeschnitten, Bildwechsel und Zoom-Punch nach dem Schnittprofil der Marke. Einzelheiten und Annahmen in `docs/plan/editing-blueprint.md`.
  **Geprüft** mit künstlichen Transkripten und Mutationsproben je Regel (dabei gefunden und behoben: verteilte Wortzeiten sahen nach dem Teilen eines langen Segments wie gemessene aus; das Fenster für abgebrochene Takes war enger als der Mindestanteil; «nochmal» am Anfang der nächsten Zeile galt als Neustart der vorigen). Plan aus der Zuordnung gegen Apples DTD 1.8 geprüft.
  **Nicht geprüft:** echte Whisper-Ausgabe von Dialekt-Aufnahmen (Test T2). Schwellen, Füllwortliste und Zoom-Stufe «schnell» sind Annahmen. Whisper selbst läuft in diesem Container nicht.
- **Gebaut (20.10.): Storyboard im Schnittplan** (`src/schnitt/storyboard.ts`, `storyboard-befehle.ts`), Befehle `./studio schnitt auftrag` und `./studio schnitt storyboard`. Der Auftrag gibt Claude Skript mit Timeline-Zeiten, aktive Stücke, Katalog, Regeln und das Format der Antwort. Die Antwort geht durch `pruefeStoryboard` (nur aktive Stücke, nur Katalog-Schlüssel, Begründung Pflicht) in den Plan: B-Roll auf V2 (Datei wird sondiert), Grafiken auf V3 (`--rendern` rendert sie mit HyperFrames), Betonung als Markierung an den Wörtern (`LIESMICH.md` listet sie).
  **Geprüft:** Mutationsproben je Regel, und ein echter Durchlauf im Container: Zuordnung, Storyboard mit echtem Render von `zahl-zaehler` (27 s, Prüfung bestanden), Resolve-Ordner mit ProRes-Grafik, FCPXML gegen die DTD gültig.
  **Entscheide (20.10., Andrej: «alles entscheiden»):** Fotos als B-Roll werden verworfen, bis der Schnittplan Ken Burns kennt. Das letzte Video der Marke ergibt sich aus «zuletzt genutzt» im Katalog. Ein neues Storyboard ersetzt das alte. Der Katalog liegt bis zur Notion-Datenbank als JSON in `<Datenordner>/katalog.json`. Die Freigabe des Storyboards bleibt ein Mensch im Gespräch, im Code gibt es sie nicht.
  **Nicht gebaut:** Soundeffekte und Musik-Beats (Plan Kap. 3.8), Kontaktbogen, «zuletzt genutzt» zurückschreiben, Katalog in Notion und sein Aufbau (Benennen der Clips, Plan Kap. 3.7).
- **Gebaut (20.10.): Katalog** (`src/katalog/`, Anleitung `docs/katalog.md`), Befehle `./studio katalog scan|offen|beschreibe|liste|zeige`. Scan mit ffprobe (Dauer, Bildrate, Grösse nach Drehung, Ton, Aufnahmezeit, Kamera, Ort, Zeitlupe ab 50p) und drei Vorschaubildern je Clip; Claude beschreibt nach den Bildern, `beschreibe` übernimmt, überschreibt Korrekturen und lässt Ungültiges mit Grund liegen. `schnitt auftrag` und `schnitt storyboard` lesen `katalog.json`.
  **Gefunden und behoben:** `schnitt sondiere` meldete Hochkant-Videos vom iPhone (Drehung ±90 in der Datei) als Querformat; Grösse und Orientierung gelten jetzt nach der Drehung.
  **Geprüft:** Mutationsproben je Regel, echter ffmpeg-Durchlauf, Kette Katalog → Auftrag → Storyboard mit B-Roll → Resolve-Ordner (DTD gültig). **Nicht gebaut:** Katalog in Notion, EXIF von Fotos, Regel «Korrektur merken», Messung der Tokenkosten.
  **Nachgetragen (20.10.):** `./studio katalog genutzt --plan …` trägt die B-Roll eines fertigen Videos als «zuletzt genutzt» ein (Kennung «Name [marke]»); «nicht im letzten Video derselben Marke» zählt nur Videos dieser Marke. Aufrufen darf man es erst, wenn das Video fertig ist.
- **Gebaut (20.10.): Whisper-Aufruf** `./studio schnitt transkribiere <aufnahme>` (`src/schnitt/whisper.ts`): lokal, openai-whisper-Schalter, Wortzeiten, JSON im Datenordner; `STUDIO_WHISPER_BIN` ersetzt das Programm; `doctor` warnt, wenn es fehlt. Getestet mit einem Ersatzprogramm, nicht mit echtem Whisper (nicht installiert, kein Modell im Container). Das Modell «large-v3» ist eine Annahme (T2).
- **Gebaut (20.10.): Kontaktbogen** `./studio schnitt kontaktbogen` (`src/schnitt/kontaktbogen.ts`): eine HTML-Datei ohne externe Teile mit einem Standbild je Grafik (Render über dem Bild der Sprache an dieser Stelle) und je B-Roll, mit Zeit und Begründung. Echter Durchlauf mit dem Render von `zahl-zaehler` und im Browser angesehen. Gefunden: Ein Sprung (`-ss`) im Eingang der Grafik lässt sie zeitlich später beginnen als das Bild der Sprache, das Standbild blieb leer; die Grafik wird jetzt im Filter gekürzt (`trim`). Nicht gebaut: Vorschau als Video (Plan v3 Editor 1).
- **Gebaut (20.10.): Vorschau-Video** `./studio schnitt vorschau` (`src/schnitt/vorschau.ts`): ein ffmpeg-Filtergraph aus dem Plan zu 540×960, 25p mit Zoom, B-Roll, Grafiken (Alpha), Musik und eingebrannten Untertiteln. Geprüft mit Quellen, die ihre Farbe wechseln (Reihenfolge, Zeitfenster von B-Roll und Grafik, Einstieg der B-Roll, Zoom) und an einem echten Durchlauf mit dem Render von `zahl-zaehler`; Standbilder angesehen. Annahmen: die Untertitelschrift kommt von libass und der Schriftkonfiguration des Rechners, nicht vom Caption-Preset der Marke.
- **Gebaut (21.10.): Starter `./studio`, Whisper einrichten, Bögen zum Beschreiben im Chat.** Auslöser: Auf dem Mac gab es keinen Befehl `studio` («Ungültiger Command»); die Anleitung nannte `studio …` und `npm run studio --`, und `npm run` wechselt den Ordner, sodass relative Pfade nicht stimmen. Jetzt: `./studio` (Node-Prüfung, installiert beim ersten Start, `./studio update` holt den Stand), alle Anleitungen und Meldungen nennen `./studio …`. `./studio whisper einrichten` legt Whisper in eine eigene Python-Umgebung und lädt das Modell. `./studio katalog scan` nimmt ohne Angabe `rohmaterial/` oder eine einzelne Datei, macht danach Bilder mit der Katalog-Nummer (vier Clips je Bild) und öffnet den Ordner; `./studio katalog beschreibe --zwischenablage` liest die Liste aus dem Chat.
  **Echter Whisper-Lauf (small, Container):** Eine synthetische Aufnahme mit deutscher Piper-Stimme (Füllwort, «nochmal», zwei Takes) ging durch `transkribiere` und `zuordnen`: 3 von 3 Zeilen, Take 2 gewählt, das Gespräch verworfen. **Funde:** Whisper schreibt «ähm» nicht als Füllwort, sondern als anderes Wort («eben»): Füllwörter erkennt das Transkript schlecht, die Anzeige bleibt der zweitbeste Take für das Ohr. Whisper hörte «Küche» als «Kirche»; die Zuordnung fand die Zeile trotzdem und meldete die Abweichung. Das ist eine Stimme am Computer, kein Dialekt: T2 bleibt offen.
  **Entscheide (21.10., Andrej):** Fotos sind keine B-Roll, bleiben im Katalog für Carousel, Blog und Google-Beitrag. Zoom-Stufe, Whisper-Modell large-v3 und das Katalog-Format bleiben. Beschreiben im Chat, kein API-Guthaben.
- **Gebaut (21.10.): Reel-Ablauf mit festen Ordnern** `./studio reel neu|vorbereiten|storyboard|uebergabe|status` (`src/schnitt/reel.ts`, die Zuordnungslogik steht jetzt in `zuordnen.ts` und dient auch `schnitt zuordnen`). Auslöser: Andrej wollte nicht mehr jeden Einzelschritt mit Pfaden tippen. Skript und Ergebnisse liegen unter `Studio/inhalte/<ID>/`, die Videos unter `rohmaterial/<ID>/`. `neu` legt Ordner an und liest das Skript aus der Zwischenablage; `vorbereiten` sondiert, transkribiert (vorhandene Transkripte bleiben, ein neueres Video erzwingt Whisper), ordnet zu, schreibt Plan, Bericht und Auftrag und kopiert den Auftrag in die Zwischenablage; `storyboard` nimmt die Antwort aus der Zwischenablage, rendert, macht Kontaktbogen und Vorschau und öffnet beide (schlägt ein Schritt fehl, laufen die nächsten trotzdem, Exit-Code 1); `uebergabe` schreibt den Resolve-Ordner.
  **Geprüft:** 26 Tests mit echtem ffmpeg und einem Ersatz-Whisper, der ein Whisper-JSON ablegt (Ersatz-Render für die Grafik), zehn Mutationsproben (ID-Prüfung, Transkript-Aktualität, Schutz des Skripts, Sicherung des Storyboards, Weiterlaufen nach Fehler, Kopieren, Sortierung, Kennungen, Plan-Prüfung, Hinweis ohne Storyboard) alle gefangen. **Nicht geprüft:** `pbpaste`, `pbcopy` und `open` auf dem Mac (im Container ersetzt), Whisper-Lauf mit echtem Modell auf dem Mac.
- **Skill `reel-werkstatt`** (`.claude/skills/reel-werkstatt/SKILL.md`): der ganze Ablauf vom Rohmaterial bis zum Resolve-Ordner für Claude in einer Sitzung, mit dem, was Claude nicht beurteilt (Take, Abweichung, Storyboard) und dem, was ein Mensch bestätigt.
- **Offen:** Der Whisper-Lauf auf dem Mac (T2), ein Storyboard aus einem echten Auftrag mit echtem Katalog.
- **Pausiertes fortsetzen:** Neues Feld «Status vor Pause» in «Inhalte» (Auswahl, in der Ansicht sichtbar). Der Prüfplatz schreibt es beim Pausieren und führt mit «Fortsetzen» dorthin zurück; Pausiertes steht auf Plattformseiten und unter «Heute» hinter einem Knopf. Der Abgleich nimmt das Feld nur, wo der Stand den Vorstatus nicht kennt (Test mit Mutationsprüfung). Prüfplatz-Test: 57 Prüfungen.
- **Archiv in der Ideenfindung:** `./studio inhalte archiv --inhalte zeilen.json --thema "…"` zeigt Bestand je Pillar, Hook-Muster, Format, Plattform und ähnliche Beiträge jeden Alters mit Datum, Alter und Grund bei Verworfenen. Das 90-Tage-Fenster der Dublettenprüfung richtet sich jetzt nach «Geplant für» (Erscheinungsdatum) statt nach dem Entstehen der Zeile; die Ansicht liefert `createdTime` nicht, davor zählten alle Altbeiträge als jung. Leistungszahlen stehen weiter nur im Cockpit.
- **Entscheide aus dem Chat (18.10.):** Taplio entfällt; der Viral Watcher (geplante Aufgabe `trig_01EcPiZ4F182oHvN1JeyuA6q`) ist ausgeschaltet. Altbeiträge bleiben in Notion und werden bei der Ideenfindung genutzt (nicht gelöscht).

## Plan v3: Geltung, Funde, Widersprüche

Plan v3 (`docs/plan/bauplan-v3.md`, Quelle `.docx` daneben) gilt zusätzlich zu v2 (`docs/plan/bauplan-v2.md`); bei Widerspruch gilt v3. Aus dem Video-Editing-System wird ein Content-System:
Rückgrat (Inhalte, Tor 0, Tor I, Tor P) zuerst, dann ein Reel mit Editor, dann Textformate, Carousel, Lernen, Automationen. Der Prüfplatz hat Tor P schon in Form der Abnahme.
Entschieden und übernommen: Marke gilt, Schnittstil als Feld im Markenprofil (Abschnitt 9.1, noch nicht im Code), Start an einem Computer.

**Gefunden beim Lesen von Notion und n8n (17.10., nur gelesen):**

1. **Content-Ideen hat keine Zeilen** [Wahrscheinlich]: Die Standardansicht liefert weder aktive noch archivierte Zeilen, und Notion zeigt keine Beispielseiten. Plan 13.1 und 13.2 und Kapitel 8 (Umzug mit Stichtag) erledigen sich dann.
2. **Viral Watcher** sind zwei n8n-Workflows («Viral Watcher · LinkedIn», «… · Instagram»), beide **nicht aktiv** (letzte Änderung 26. und 27.06.2026) [Sicher]. Sie schreiben **nicht** in Content-Ideen, sondern in eine andere Notion-Datenbank
   (Kennung `f4eda334…`, Status «Neu») und schicken einen Mail-Digest. Der Plan vermutete anderes («Läuft [Vermutung]»).
3. **Die Analyse im Viral Watcher ruft die Claude-API direkt auf** (`api.anthropic.com/v1/messages`, Modell `claude-sonnet-4-6`, Zugang über ein Header-Credential) [Sicher]. Das widerspricht der Regel «nie über die Claude-API». Plan 4.4 würde ihn «umhängen».
4. **Notion-Kontingent:** SQL und der Modus `rows` von `notion-query-data-sources` sind nach wenigen Abfragen aufgebraucht («usage_limit_reached»). Der Prüfplatz fragte so ab und wäre im Betrieb daran gescheitert. Er liest seit Version 2 über eine gespeicherte Ansicht (Modus `view`, ohne Kontingent). Siehe `docs/notion-und-pruefplatz.md`.
5. Dein Test des Prüfplatzes steht in Notion: Beispielzeile mit Entscheid «freigegeben», Name Andrej, 17.10. 09:44 UTC. Damit ist T3 für **eine** Person belegt. Nicht belegt: Leander, Handy, Safari.

**Wo ich dem Plan widerspreche** (Begründung, Alternative, Risiko):

- **Neue Datenbank «Inhalte» statt Erweiterung.** Weil Content-Ideen leer ist (Fund 1), gibt es nichts umzuziehen und keinen Stichtag. Alternative: Content-Ideen in «Inhalte» umbenennen und die Felder aus Abschnitt 3.2 ergänzen.
  Risiko: Verweise des Cockpits zeigen weiter auf dieselbe Datenbank (gut), aber der «Rückweg» des Plans entfällt. Bei einer leeren Datenbank ist er unnötig. Vor dem Entscheid bitte bestätigen, dass Content-Ideen wirklich leer ist.
- **Viral Watcher umhängen.** Alternative: Scrapen und Erkennen (Apify, Median-Regel) darf in n8n bleiben, die Analyse macht Claude in einer Sitzung (claude.ai oder Claude Code), nicht n8n. Risiko: mehr Handarbeit je Woche. Vorteil: keine zweite Claude-Abrechnung neben euren Abos.
- **Phase 0 enthält T2 und T7, die Code brauchen.** T2 misst den Skript-Abgleich, T7 den Markierungs-Kreislauf mit Editor. Beides baut der Plan erst in Phase 2. Alternative: Phase 0 sind T1, T1b, T3, T4, T5, T8. T2 und T6 sind die ersten Aufgaben von Phase 2, T7 die Abnahme von Editor 1.
- **«Phase beginnt erst nach Abnahme der vorigen.»** Das Rückgrat braucht keinen Mac. Alternative: Teile von Phase 1, die nicht von T1 bis T5 abhängen (Schema «Inhalte», Schnittprofil im Markenprofil, Gate 0 auslösbar, Tor I im Prüfplatz), parallel starten. Risiko: Fallen T1 oder T1b durch, ändert sich nur das Reel-Modul, nicht das Rückgrat. **Wartet auf dein Ja.**

**Stand der Phase-0-Tests**

| Test | Stand |
|---|---|
| T1 | Teilwert Overlay auf Mac mini M4: 2,0- bis 2,5-fache Echtzeit, vier Beispiele bestanden. Gesamttest (10 s mit Captions, Zoom, Effekt) erst mit Pipeline. M5 fehlt |
| T1b | Mac mini M4 (16 GB): 2,4 s fest plus 0,85 s je Sekunde Video, sechs Overlays einzeln 27 s, als eine Komposition 15 s. Empfehlung: eine Datei je Overlay (siehe «Gemessen»). Zweiter Mac (M5) fehlt |
| T2 | braucht Skript-Abgleich (nicht gebaut) |
| T3 | bestanden für eine Person (Andrej), Leander offen |
| T4 | **Entschieden ohne Test (Andrej, 17.10.2026): 25p.** Instagram-Vergleich 25p/30p nicht gemacht. Risiko: Ruckeln bei Kameraschwenk nach der Neukodierung durch Instagram bleibt ungeprüft. Falls Reels später ruckeln, ist der Test in zehn Minuten nachzuholen (`docs/phase0-mac.md`, Abschnitt 4) |
| T5 | Einrichtung auf dem Mac mini erledigt (Studio in `OneDrive-Royalsocials(2)/03_Marketing/Studio`, eine Videodatei in `rohmaterial`). Die Zeitmessung «Speicherplatz freigeben» steht aus. Entfällt, wenn die Medien über `init --medien` auf ein Laufwerk ausserhalb von OneDrive gehen (frei: 30 GB auf dem Mac) |
| Notion-Ansicht | Aus einer Cloud-Sitzung gelesen: 1 Zeile («Beispiel: Wert-Verlauf», Entscheid freigegeben von Andrej). Claude Code auf dem Mac mit Notion ist **nicht** geprüft (wird erst mit der Pipeline gebraucht) |
| T6, T7 | brauchen Code und Testprojekt |
| T8 | Teilweise erledigt: `docs/t8-google-maps.md` (Beitragstypen, Fotoregeln, Verbote, Branchen mit Einschränkung). Lücke: maximale Textlänge |

**Offene Punkte aus Kapitel 13 des Plans:** 1 und 2 beantwortet (Funde 1 und 2, Bestätigung nötig), 3 bis 4 offen, 5 (leere Datenbank «Ideen» und Beispielzeile löschen, Umbenennung in «Motion-Ideen») wartet auf dein Ja,
6 (Zahl-Zähler aktivieren) wartet auf dich, 7 (altes Claude-Docs-Dokument) wartet auf dein Ja, 8 (GSAP-Lizenz): bitte `gsap.com/standard-license` lesen, 9 und 10 offen.

## Fertig

**Fundament** (`src/core/`)
- Pfade relativ zu `Studio/`, NFC-normalisiert (macOS liefert Umlaute zerlegt), kein Ausbrechen.
- Schemas: Katalog-Eintrag (Bauplan 3.7), Markenprofil (Kap. 4) mit Gate 0, Regel (Kap. 5, höchstens 30 aktiv, Handwerk/Optik getrennt),
  Ereignis (Lernsignale inkl. «unveraendert»), Storyboard (A1).
- Storyboard-Prüfung: B-Roll nur mit gültigem Katalog-Schlüssel, nicht doppelt, nicht im letzten Video der Marke, lang genug; Effekte nur aus
  **aktiven** Stücken, Parameter gegen das Datenblatt, Begründung Pflicht.

**Motion-Bibliothek** (`src/motion/`, `library/motion/`)
- Stück-Vertrag und Datenblatt (A3 plus Einsatzangaben), Variablen-Auflösung, Erzeugung der HyperFrames-Deklaration aus `piece.json`, Lint gegen `index.html`.
- Staging (lokales GSAP, Marken-Schriften, kein stiller Schrift-Rückfall), Render-Befehle (WebM mit Alpha, 25p, Batch), objektive Selbstprüfung.
- Gerüst für neue Stücke (`motion neu`), Aktivierung nur durch Menschen, kompakter Index für den Storyboard-Prompt.
- Referenzstück **Zahl-Zähler** (Status `geprueft`, **nicht** `aktiv`: Aufnahme ist ein Entscheid von euch).

**Wachstumsschleife**
- Signalerkennung in Sätzen, Lückenanalyse gegen alle Stücke mit Begründung pro Stück, Wiederholungsschutz, Ideenprotokoll mit Zustandsautomat,
  Pitch-Text, Look-Bogen (drei Standbilder plus Vergleichsblatt), Ereignisse als Lernsignale. Konzept: `docs/motion-werkstatt.md`.
- CLI `./studio help`, Skill `.claude/skills/motion-werkstatt`, Anleitungen in `prompts/` mit gegen die Schemas geprüften Beispielen.

**Notion, Einrichtung, Prüfplatz** (`src/notion/`, `src/setup.ts`, `src/pruefplatz.ts`, `pruefplatz/`, `docs/notion-und-pruefplatz.md`)
- Notion: Seite «Video-Studio» mit Datenbank «Ideen» (Schema im Dokument). `notion.json` hält die Kennungen.
- Abbild Idee ↔ Notion-Zeile: schreibt **nie** einen Entscheid, leert nur Felder von Stufen, die noch nicht erreicht sind. Liest Entscheide nur mit Namen,
  verlangt Grund bei «keiner passt» und «Änderung nötig». Das Protokoll gilt bei Abweichung. Befehle `ideen notion-zeile`, `notion-alle`, `notion-lesen`.
- Die Abnahme im Prüfplatz aktiviert das Stück mit dem Namen des Menschen und führt die Idee in die Bibliothek (Test über den ganzen Weg).
- `init` legt `Studio/` in OneDrive an und merkt den Pfad je Mac, `doctor` prüft Node, ffmpeg, OneDrive, Schreibrecht, Protokoll, Bibliothek, Notion-Ziel.
- **Prüfplatz** (Artifact, privat): Pitch freigeben oder ablehnen (mit Grund), Look wählen, Abnahme, alle Ideen, Bibliothek, Marke. Liest die Zeile vor jedem
  Schreiben frisch, schreibt nichts über einen schon gefallenen Entscheid, liest nach und meldet erst dann «Gespeichert». Dunkel nach Design System.

## Inhalte-Modul (Phase 1, begonnen am 17.10.)

Gebaut in `src/inhalte/` (Plan v3, Kapitel 3 und 7), 150 Tests, jede Regel per Mutation gegengeprüft:
- `inhalt.ts` Zeile ↔ Inhalt (Datenbank «Inhalte»), schreibt nie einen Entscheid ausser «offen»/leeren.
- `regeln.ts` alle Übergänge des Lebenslaufs: Pflichtangaben, Tor I und Tor P nur mit Mensch mit Namen, Gate 0, «Kein Post ohne Rohstoff», Dublettenprüfung über 90 Tage (Wortmenge, Zahlen vereinheitlicht, Schwelle 0,85), Grund aus zwei Wörtern.
- `abgleich.ts` liest alle Zeilen gegen den Stand, übernimmt erlaubte Wechsel, setzt unerlaubte zurück, löst nach einem Tor den nächsten Status aus, leert Entscheide ohne Namen oder von früher.
- `stand.ts` Stand in `<Studio>/daten/inhalte-stand.json` (Version, atomar). `marken.ts` Gate 0 gilt nur mit Namen. `textpruefung.ts` deterministische Textprüfung ohne Claude-Aufruf.
- `material.ts` Material an einem Inhalt (Footage, Foto, Audio, Skript, Logo, Render) als Zeilen `Art: Pfad | Notiz` im Feld «Dateien», Prüfung der Pfade (relativ zu `Studio/`, NFC) und der Links (https), Hinweis «Dreh nötig ohne Footage oder Foto». Dieselbe Logik steht zwischen den Marken MATERIAL-START und MATERIAL-ENDE in der Prüfplatz-Seite, ein Test hält beide gleich.
- CLI: `inhalte abgleich`, `inhalte textpruefen`, `inhalte material`, `inhalte pruefung`. Skill `inhalte-werkstatt`.

**Fund beim Bauen:** Ein Entscheid, der im selben Zeitraum fällt, in dem die Zeile die Stufe erreicht, wurde zuerst als «von früher» gelöscht. Behoben: Der Stand hält einen Entscheid erst beim Verlassen der Stufe fest.

**Marketing System in Notion** (17.10.): neu angelegt **Rohstoffe** (13 Spalten, Beleg mit Link, «Bestätigt von/am», Kundenfreigabe, Marke) und **Inspiration** (Viral-Liste), beide leer, mit Verknüpfung zu Marken und Inhalten, eingetragen in `notion.json`. Bestand der Seiten Instagram und LinkedIn ausgewertet: `docs/marketing-system-bestand.md`.

**Übernahme aus dem LinkedIn-Cockpit** (18.10.2026, Entscheid Andrej: übernehmen; ausgeführt von zwei Agenten, nur lesend auf der alten Seite):
- **Rohstoffe: 48** (`r-0001` bis `r-0048`, nach Datum sortiert). «Bestätigt von/am» bleibt überall leer: Kein Mensch hat die Altfakten nach Plan v3 bestätigt, der Beleg sagt das (Wortlaut «Altbestand … nicht neu bestätigt»), «Beleg-Link» zeigt auf den alten Eintrag. Kundenfreigabe: **26 «offen»** (7 mit gesetzter Checkbox im Original, 19 wegen Namen im Text), 22 «nicht nötig». Marke überall «Alperna».
- **Inhalte: 95** (`c-0004` bis `c-0098`): 75 «Ausgewertet», 9 «Verworfen», 11 «Neu» (ehemals Idee, Entwurf, Freigabe offen, Geplant: sie durchlaufen Tor I neu). Tor-Felder und «Status von/Grund/am» sind leer. «Batch» trägt den Schlüssel `Import Cockpit <Kennung der alten Seite>` (Wiederholung überspringt Vorhandenes). Der Seitentext hält Herkunft, Volltext, Zahlen des Archivs (Quelle: alter Eintrag, nicht neu geprüft) und Notiz. Rohstoff-Verweis im Beleg, Rückverknüpfung in «Verwendet in» bei 15 Rohstoffen.
- **Kontrolle (Claude, 18.10.):** Ansicht «Inhalte» gelesen: 98 Zeilen, 98 verschiedene IDs, 95 mit Import-Schlüssel, kein Tor-Feld gesetzt. Trockenlauf `inhalte abgleich --erstlauf` gegen die echten Ansichten: 98 neu übernommen, 0 Eingriffe, 0 blockiert. Rohstoffe: 48 Zeilen, «Bestätigt von» überall leer. Den Wortlaut der Volltexte hat der Agent gegengelesen (64 von 95 Seiten einzeln, alle 47 mit Volltext; drei Tippfehler dabei gefunden und behoben); das habe ich nicht wiederholt.
- **Befunde:** Von 95 Archiv-Beiträgen verweisen nur **9** auf einen Rohstoff, **86 nicht**. Die Regel «Kein Post ohne Rohstoff» galt im alten System nicht durchgängig. Von den 95 haben nur 47 einen Volltext, 48 nur eine Notiz (16 davon «Volltext fehlt»). Die 6 «Neu»-LinkedIn-Posts ohne Rohstoff (`c-0080`, `c-0084`, `c-0086`, `c-0088`, `c-0093`, `c-0095`) kommen nicht über «Pitch bereit» hinaus, bis ein Rohstoff im Beleg steht. Rohstoffe mit Privatem von Mitarbeitenden (`r-0030` Militärdienst, `r-0007` Studium, `r-0033` politische Haltung, dazu Persönliches in `r-0019`, `r-0024`, `r-0026`, `r-0027`, `r-0038`) stehen drin und müssen von einem Menschen gesichtet werden, bevor sie je in einen Beitrag gehen. Zahlen im Bestand ohne Quelle (zum Beispiel «9400 Prozent mehr Besucher», «brancheüblich 300 bis 400», «heute 26 Partner» gegen 17 und 21) bleiben unbestätigt; Regel 7.
- **Der erste Abgleich auf der Datenbank «Inhalte» muss mit `--erstlauf` laufen** (Beispiele und Import sonst auf «Neu» zurückgesetzt). Danach ohne.

**Viral Watcher** (angelegt am 18.10.2026, **ausgeschaltet am 18.10.2026**, weil Taplio entfällt): geplante Claude-Aufgabe `trig_01EcPiZ4F182oHvN1JeyuA6q`, jeden Montag 05:47 (Europe/Zurich), jeder Lauf eine neue Sitzung. Sie sucht mit Taplio (`search_inspiration`) fremde LinkedIn-Beiträge (mindestens 500 Likes oder mehr Kommentare als Likes, keine LinkedIn-Mechanik), schreibt bis zu zehn **neue Zeilen** in «Inspiration» (Status «Neu», Quelle «Viral Watcher», nur Struktur und der erste Satz wörtlich, Zahlen nur aus Taplio) und berichtet in fünf Zeilen. Sie ändert und löscht nichts, legt keine Inhalte an und gibt nichts frei. Kein Aufruf der Claude-API, die Analyse entsteht in der Sitzung selbst (Regel 10).
**Erledigt durch den Entscheid vom 18.10.:** Die Aufgabe läuft nicht mehr, die Connector-Frage entfällt. Früher offen: Die Aufgabe wurde **ohne Connectors** gespeichert (die Organisation erlaubt den Parameter nicht beim Anlegen). Ohne Notion und Taplio in der Sitzung schreibt sie nichts und meldet im Bericht, welches Werkzeug fehlte. Connectors **Notion** und **Taplio** bitte in der Routinen-Oberfläche von claude.ai bei der Aufgabe «Viral Watcher» hinzufügen, danach einmal von Hand starten und in «Inspiration» nachsehen. Nicht getestet. Instagram deckt sie nicht ab (Taplio ist LinkedIn).

**Beispielzeilen in Notion** (angelegt am 17.10., alle als «Beispiel» gekennzeichnet, ohne Zahlen): `c-0001` Reel und `c-0002` LinkedIn-Post (beide «Pitch bereit», für Tor I und den Durchgang), `c-0003` Google-Beitrag mit Entwurf (für Tor P). Der **erste Abgleich auf dieser Datenbank muss mit `--erstlauf` laufen**, sonst setzt er die Beispiele auf «Neu» zurück (neue Zeilen beginnen immer in «Neu»). Später löschen oder verwerfen.
Beim Anlegen gefunden und behoben: Der Rohstoff-Verweis erkannte `app.notion.com` nicht, und Notion macht aus einer Adresse im Textfeld eine Erwähnung (`<mention-page …>`), die der Code jetzt als «Name (Adresse)» liest und der Prüfplatz als Name zeigt.

**Offen:**
1. ~~Spalten «Status von» und «Status-Grund»~~ sind in «Inhalte» angelegt, dazu **«Status am»** (Datum). Ein von Hand gesetzter Status (Pausieren, Verwerfen aus der Produktion, «Veröffentlicht» bei Manuell/Paket) gilt nur mit Name, Grund und einem **neuen** Zeitpunkt in «Status am». Der Abgleich merkt sich den verbrauchten Zeitpunkt, auch bei abgelehnten Versuchen: Ein alter Name rutscht so nicht in einen späteren Wechsel.
2. `marken/alperna.json` hat `schnittprofil.textlaengen` leer: Die Längenprüfung des Texts ist damit aus. Zahlen dafür fehlen (keine Zahl ohne Quelle). Bitte Zielwerte je Format nennen.
3. Ein Name im Entscheid ist keine Anmeldung. Wer in Notion schreiben darf, kann jeden Namen eintragen. Der Code verhindert Systemnamen und leere Namen, nicht Fälschung. Das ist die Grenze des Modells ohne Konten.
4. Prüfplatz (neu aufgebaut am 18.10.): Tor I, Tor P, Durchgang, Gate 0 und die Handlungen Pausieren, Verwerfen und «Veröffentlicht» bestätigen stehen (im Seitenfenster eines Inhalts). Es fehlen **Fortsetzen** nach einer Pause (nur zum Status vor der Pause, den der Abgleich im Stand kennt; bis dahin den Status in Notion von Hand zurücksetzen), die Auswahl der Marke je Kunde und Räume.
5. **Gate 0 → Repo:** `./studio marken gate0 --marken marken.json --anwenden` übernimmt die Freigabe mit Namen aus der Ansicht «Marken» ins Profil (zwei Zeilen: `status`, `freigabe`) und setzt es bei einem Widerruf zurück. Die geänderte Datei muss danach committet werden. Bis zur Freigabe bleibt `--final` gesperrt.
6. Gate 0 für Alperna: freigegeben von Andrej am 17.10.2026. Es fehlen laut Profil weiterhin Logo, Caption-Preset und Schlusskarte.

## Prüfplatz: was geprüft ist und was nicht

Stand: **Version 3** (17.10.2026) liest drei Ansichten (Ideen, Inhalte, Marken) und braucht zusätzlich das Notion-Werkzeug `notion-fetch` (Entwurfstext). Die Deklaration des Artifacts ist erweitert,
claude.ai fragt deshalb beim nächsten Öffnen neu nach der Zustimmung.
**Neu aufgebaut am 18.10.2026** (Auftrag von Andrej, `docs/plan/auftrag-pruefplatz-neu.md`): Seitenleiste mit drei Bereichen. **Heute** (nur Karten, auf die ein Mensch wartet, Knopf «Der Reihe nach durchgehen» statt Wochenmodus), **Plattformen** (Instagram, LinkedIn, Blog, Google Maps mit den Gruppen Idee, In Arbeit, Bereit zum Posten, nichts Gepostetes in einer Liste, nur ein Hinweis mit Link ins Cockpit-Archiv) und **Werkstatt** (drei Kacheln: Motion-Bibliothek, Motion-Ideen, Marke). Details und Aktionen im Seitenfenster, Name unten in der Leiste. Design wie alperna-tool (Papier, Tinte, Orange, Sonne, Geist, Hell und Dunkel). **Material anhängen** (Footage, Fotos, Audio, Skript, Logo) als Verweis im Feld «Dateien», auf dem Mac geprüft mit `./studio inhalte material`.
51 Browser-Prüfungen (darunter Plattformzuordnung, nur Offenes auf «Heute», Zähler, kein seitliches Scrollen bei 390 und 1280 px, Fokus im Fenster, Hell und Dunkel), 572 Unit-Tests. Gemessen an Bildern bei 390 und 1280 px, hell und dunkel.
**Offen (braucht Andrej):** (1) Ansehen und sagen, ob er sich zurechtfindet, erst dann gilt es als fertig. (2) Die Referenzdatei `pruefplatz-neu-entwurf.html` lag nicht vor: Das Design folgt dem Wortlaut und `AlpernaGmbH/tool`, die Datei bitte unter `docs/` ablegen, Abweichungen werden nachgezogen. (3) Das Entfernen der importierten Altbeiträge aus «Inhalte» (Regel 3) und das Löschen der drei Beispiele (Regel 5) wartet auf ein ausdrückliches Ja zur Liste. Einwand zur Dublettenprüfung und Vorschlag im Auftragsdokument. Entschieden am 18.10.: Papier, Tinte und Orange nur für die Oberfläche des Prüfplatzes, das Branding der Videos bleibt Navy und Gold.
Seit Version 3: Tor I (Freigeben, Mit Frage zurück, Ablehnen), Tor P (Entwurf aus der Notion-Seite, Freigeben, Änderung nötig), Gate 0 als Handlung mit Bestätigung und Namen. Eine ausgefallene Ansicht «Inhalte» oder «Marken» legt die Motion-Ideen nicht lahm.
Vor dem Neuaufbau: 29 Browser-Prüfungen, 14 Mutationen der Seitenlogik einzeln ausgeschaltet und erkannt (gilt für die alte Seite). Spaltennamen und Auswahlwerte gegen die echten Datenbanken «Inhalte» und «Marken» geprüft.

Geprüft (Headless-Chrome mit nachgebautem Notion, das die an der echten Datenbank beobachteten Antwortformen liefert): Karten, Pflichtfelder, genaue Schreibfelder,
frisch lesen vor Schreiben, Nachlesen, veralteter Entscheid wird nicht überschrieben, getrennte Texte für verweigerten Zugriff, fehlende Verbindung, Richtlinie und unklaren
Ausgang, kein waagrechtes Scrollen bei 390 px, Tastaturbedienung, keine Konsolenfehler, nur erlaubte Hosts (Schriften), kein Emoji.

**Nicht geprüft** (geht von hier aus nicht):
- die echte Zustimmungsabfrage von claude.ai beim ersten Speichern und die echten Fehlercodes des Konnektors;
- die Form der Antwort von `notion-fetch` im Viewer: Der Code sucht `<content>…</content>` im Feld `text` (so liefert es das Werkzeug in dieser Sitzung, beobachtet an einer echten Seite);
- die tatsächliche Form von `result.payload` im Viewer (der Code liest `payload`, sonst den Text des ersten Blocks als JSON);
- Schriften Poppins und Montserrat (im Test gesperrt, es erscheint der Ersatz), Safari und echtes Handy;
- ob `Notion` der richtige Anzeigename deines Konnektors ist (Erwartung: ja, so heisst er in dieser Session).
Beim ersten Gebrauch bitte genau einen Pitch freigeben und in Notion nachsehen, ob die Felder stimmen.

## Gemessen auf dem Mac mini (Apple M4, 10 Kerne, 16 GB, darwin arm64, HyperFrames 0.8.164 (gepinnt), Chrome Headless Shell 152, 17.10.2026)

`npm run selftest:render`: bestanden. `npm run t1b`: bestanden.

| Was | Wert |
|---|---|
| Overlay 2,4 bis 3,0 s als WebM mit Alpha (vier Beispiele) | 4,9 bis 7,4 s Renderzeit (2,0- bis 2,5-fache Echtzeit) |
| `hyperframes check` | 9,9 s |
| T1b, Modell | Renderzeit = 2,4 s fest + 0,85 s je Sekunde Video |
| T1b, sechs Overlays zu 2,5 s (15 s) | einzeln 27 s, als eine Komposition 15 s, Unterschied 12 s |

**Einordnung.** [Sicher] Das ist ein einzelnes transparentes Overlay, nicht T1. T1 verlangt höchstens 3-fache Echtzeit für 10 s mit Captions, Zoom und einem Effekt.
[Wahrscheinlich] Das Overlay allein liegt schon bei 2,0 bis 2,5, die Reserve bis 3 ist klein; ob T1 hält, zeigt erst die Pipeline mit echtem Reel.
**T1b-Empfehlung:** Der feste Aufwand ist auf dem Mac klein (2,4 s). Eine Datei je Overlay kostet bei sechs Overlays 12 s mehr, bleibt cachefähig und engine-neutral.
Entscheid für «eine Datei je Overlay», solange T1 mit der Pipeline nicht das Gegenteil zeigt. **Wartet auf dein Ja.** Der M5 fehlt noch.

## Gemessen auf Linux (Container, nicht der Zielrechner; x64, 4 Kerne Xeon, 16 GB, Software-GL, HyperFrames 0.8.164, Chrome Headless Shell 152)

| Was | Wert |
|---|---|
| Overlay 2,4 bis 3,2 s als WebM mit Alpha | 11 bis 16 s Renderzeit (rund 4,3- bis 5,4-fache Echtzeit) |
| Batch, zwei Fassungen (2,4 s und 3,2 s) | 22 s, kaum schneller als zwei Einzelrenders |
| `hyperframes check` | 7 bis 8 s |
| Look-Bogen (3 Standbilder und Vergleichsblatt) | 21 s |

**Das ist keine Aussage zu T1.** T1 verlangt höchstens 3-fache Echtzeit auf M4 und M5 für 10 s mit Captions, Zoom und einem Effekt. Dieser Rechner
ist ein anderer, und die Messung betrifft ein einzelnes Overlay. Bitte `npm run selftest:render` auf beiden Macs laufen lassen und die Zeiten hier eintragen.

**Offene Architekturfrage für Phase 2 («T1b»):** Jedes Overlay als eigene WebM zu rendern ist cachefähig und engine-neutral (Plan B Remotion muss nur dieselbe
Datei liefern), kostet aber pro Einsatz mehrere Sekunden Fixaufwand. Ein Reel mit 6 Overlays wären hier rund 70 s nur für Overlays. Die Alternative
ist, alle Overlays in einer einzigen Komposition zu rendern (ein Render, aber kein Cache und enger an HyperFrames gebunden). Entscheiden, sobald T1 auf den Macs vorliegt.

## Abweichungen vom Bauplan und Auslegungen

1. **Ort:** eigenes Repo `AlpernaGmbH/video-studio`. Die Website hat keinen Bezug mehr zu diesem Paket.
2. **Kap. 3.6 (Wellen) ist das Startset, nicht die ganze Bibliothek.** Danach wächst sie über die Schleife. Von den 9 Effekten der Welle 1 ist **einer** gebaut (Zahl-Zähler).
3. **Stück-Vertrag Overlay:** (Variablen, Dauer, Marke) → transparentes WebM. Effekte, die das Basisvideo verändern (Zoom, Freisteller, Frame Break), sind `ausgabe: komposition`
   und noch nicht umgesetzt.
4. **Neue Regeln (Vorschlag, nicht im Bauplan):** höchstens 2 Stücke gleichzeitig im Bau, höchstens 5 offene Pitches, mindestens 2 weitere Einsätze im Pitch, höchstens 5 neue Ideen pro Video,
   Ablehnung nur mit Grund. Zahlen sind Startwerte, in `src/motion/idee.ts` änderbar.
5. **Sicherheitsrand:** unten und rechts 20 % (Bauplan 3.10, dort Vermutung), oben 8 % und links 5 % sind meine Annahme. Eine Stelle: `SICHERHEITSRAND` in `src/motion/render.ts`. Test T4 und echte Reels klären es.
6. **Markenprofil Alperna** (`marken/alperna.json`) hat die Werte des Design Systems (Hintergrund `#26324A`, Text `#FDFBFB`, Gold `#FFD700`, Höhenblau `#2B3A5A`, Poppins und
   Montserrat). **Gate 0 ist freigegeben: Andrej, 17.10.2026 13:24 UTC** (Prüfplatz, übernommen mit `marken gate0`, Profil auf `freigegeben` mit Name und Zeit). `--final` ist damit möglich.
   **Ohne Logo, Caption-Preset und Schlusskarte** (laut Profil noch offen): Finale Videos entstehen vorerst ohne diese Teile. Widerruf: In Notion `Gate 0` auf «offen», dann `marken gate0 --anwenden`.
   Die Standardwerte in `MARKEN_VARIABLEN` (`src/motion/stueck.ts`: Weiss, `#FFC629`, `#4B3FD6`) sind Platzhalter aus dem Bauplan und gelten nur, wenn ein Profil sie nicht setzt.
7. **Speicher:** Zustand der Ideen in `Studio/daten/ideen.json` (OneDrive, Versionsprüfung), Anzeige und Entscheide in Notion. Zwei Macs, die gleichzeitig in die Datei schreiben,
   können in OneDrive eine Konfliktkopie erzeugen: Eine Sitzung führt das Protokoll nach, alle anderen entscheiden im Prüfplatz.
8. **«Mensch»:** Der Namenstest ist keine Authentifizierung (siehe `docs/motion-werkstatt.md`).
9. **HyperFrames-Eigenheiten, gegen 0.8.164 geprüft:** Die Dauer ist keine Root-Variable (darum `dauer` als Variable, Root ohne `data-duration`); Listen gibt es nicht (JSON-Text);
   die Timeline muss synchron registriert werden (sonst «zero duration»); im Batch lehnt `--strict-variables` den Dateinamen-Schlüssel ab (Zeilen werden stattdessen selbst streng geprüft).

## Datenschutz

- `hyperframes snapshot` schickt Bilder an Gemini, **sobald `GEMINI_API_KEY` gesetzt ist**. Der Code schaltet das fest ab (`--describe false`). Die Variable bleibt auf Render-Rechnern ungesetzt.
- HyperFrames sendet standardmässig anonyme Nutzungsdaten. Pro Rechner `npx hyperframes@0.8.164 telemetry disable` (im Container dieser Session ist es abgeschaltet, auf den Macs noch zu tun).

## Neue Abhängigkeiten (Begründung)

| Paket | Wofür | Lizenz |
|---|---|---|
| `zod` ^3.25 | Schemas und Validierung (wie in der Website) | MIT |
| `gsap` 3.15.0 | Animation in den Stücken, lokal eingebunden statt vom CDN | «Standard no charge license» von GSAP. **Bitte Lizenztext prüfen** (gsap.com/standard-license), bevor Kundenmaterial damit entsteht |
| `typescript`, `vitest`, `tsx`, `@types/node` | Entwicklung | Apache 2.0, MIT |
| Playwright (nicht in `package.json`) | nur für `scripts/pruefplatz-test.cjs`, global installiert | Apache 2.0 |
| HyperFrames 0.8.164 | Render-Engine, per `npx` (nicht in `package.json`), Version in `src/motion/render.ts` gepinnt | Apache 2.0 |
| Poppins, Montserrat (woff2) | aus `public/fonts/` der Website kopiert | OFL, Lizenztexte liegen bei |

## Konflikt zwischen Bauplan und Marke (Entscheid nötig)

Der Bauplan beschreibt einen schnellen, lauten Instagram-Schnitt (Captions mit 3 bis 5 Wörtern, Zoom-Punches, Soundeffekte). Das Design System und der Produktions-Standard
beschreiben das Gegenteil: ruhig, Bewegungen von 200 bis 400 ms ohne Federn, kürzere Captions, keine Soundeffekte. **Empfehlung:** Tempo und Schnittstil gehören ins Markenprofil
(`effektStil.bewegungstempo` gibt es, ein `schnittProfil` fehlt noch) statt in den Code. Dann kann Alperna ruhig sein und ein anderer Kunde schnell. Bis zum Entscheid gilt die Marke.

## Nicht gebaut (Reihenfolge der nächsten Schritte)

1. **Phase 0 auf den Macs:** T1 (`selftest:render`), T2 (Whisper, 3 echte Clips), T3 (Artifact und Notion, Teile davon sind mit dem Prüfplatz erledigt), T4 (25p/30p bei Instagram), T5 (OneDrive), T6 (Take-Auswahl).
2. **Phase 1:** übrige Notion-Datenbanken (Projekte, Skripte, Marken, Katalog, Regeln, Ereignisse), Gate 0 mit Freigabe der Marke, Katalog benennen (20 Dateien zum Messen der Tokenkosten).
3. **Phase 2 (Durchstich):** Ingest, Transkription, Skript-Zuordnung, Take-Auswahl, Schnitt, Captions, Storyboard, Vorschau, finaler Render, Qualitätsprüfung, Übergabe.
   Der Prototyp der Skript-Zuordnung (Bauplan 3.2) existiert nicht (Antwort aus dem Chat: «keine Ahnung»). Er wird in Phase 2 neu gebaut.
4. **Welle 1** (8 weitere Stücke), danach Welle 2 und 3 und die ersten echten Ideen aus echten Videos.
5. Lernsystem: Regelvorschläge aus den Ereignissen (Schema und Ereignisse stehen, der Vorschlags-Aufruf nicht).
6. Gate 0 für Alperna ist freigegeben und im Profil übernommen (17.10.2026). Für Kunden gilt dasselbe je Marke.

## Offen in Notion (bitte entscheiden)

- Auf der Seite «Video-Studio» liegt eine **leere Datenbank «Ideen»** (Rest eines Platzhalters, nur Spalte «Name»), neben der richtigen «Motion-Ideen» (am 18.10. von «Ideen (Motion-Bibliothek)» umbenannt, wie im Plan v3 vorgesehen und wie die Werkstatt im Prüfplatz sie nennt).
  Zum Löschen braucht es euer Ja.
- Die Zeile **«Beispiel: Wert-Verlauf»** (Idee-ID `beispiel`) ist ein Muster, keine echte Idee. Sie erscheint im Prüfplatz als offener Pitch. Löschen nach eurem Ja.
- Die Seite ist **privat** (nur das Konto, das sie angelegt hat). Teilen und ggf. in einen Teamraum verschieben.

## Fragen an euch

1. Schnell oder ruhig: Stimmt die Empfehlung (Marke gilt, Schnittstil im Markenprofil)?
2. Zahl-Zähler aktivieren? Sichtprüfung `library/motion/zahl-zaehler/vorschau/`, dann im Chat «aktiviere Zahl-Zähler, Freigabe von <Name>» (er hat keine Idee, also keine Abnahme im Prüfplatz).
3. ~~Gate 0~~ erledigt am 17.10.2026 durch Andrej. Offen bleibt: Logo, Caption-Preset und Schlusskarte nachliefern, Look-Beschreibung (LUT) und Probebilder.
4. Passen die Limits (2 im Bau, 5 Pitches, 5 Ideen pro Video)?
5. Wer soll im Prüfplatz entscheiden (Andrej, Leander)? Beide brauchen Zugriff auf das Artifact, die Notion-Seite und eine eigene Notion-Verbindung in claude.ai.
6. Stunden pro Woche und Testprojekt (offene Punkte 3 und 7 des Bauplans).
