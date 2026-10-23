# Inspiration: was aus den gesichteten Beiträgen folgt

Stand 23.10.2026. Andrej hat 59 Links aus Instagram und einen aus YouTube geschickt (Reels, Karussells, vier Profile) und verlangt, dass sie **angesehen und gehört** werden, nicht nur als Beschreibung gelesen. Diese Seite ist der Einstieg: Methode, Grenzen, ein Stand je Link und die Liste der Themen-Dateien.

**Nur intern.** Die Dateien sind in eigenen Worten geschrieben und enthalten keine Bilder, keine Videos und keine langen Zitate. Die Beiträge gehören den Autoren; sie dienen als Anschauung und nicht als Material für Kunden (`CLAUDE.md`, Regel 5 und 7).

## Die Themen

| Datei | Inhalt |
|---|---|
| `hooks.md` | Anfänge, Wiederholungs-Haken, offene Schleifen |
| `skripte-und-formate.md` | Aufbau von Skripten, Talking Head, Formate |
| `karussells.md` | Karussells: Aufbau, Gestaltung, Ablauf von Folie zu Folie |
| `ads.md` | Anzeigenformate, Varianten aus Haken, Körper und Aufruf |
| `editing.md` | Schnittdichte, Tempo, Ablauf in Durchgängen |
| `kamera-und-shots.md` | Einstellungsgrössen, Winkel, Shotlisten mit Beispielbildern |
| `sound.md` | Ton und Sounddesign, gemessen und nicht gehört |
| `grafik-und-effekte.md` | Effektlisten, Erklärgrafik, Motion-Familien |
| `farbe-und-foto.md` | V-Log, Foto-Looks, Masken |
| `ki-footage.md` | KI-Aufnahmen und Verwandlung echten Materials (ruht, Regel 5) |
| `profile.md` | vier Konten als Stichprobe |

## Methode

Die Sichtung läuft mit `./studio inspiration sichten <links.txt> --out <ordner>` (`src/inspiration/`). Sie ist **Code im Repo**. Videos, Bilder, Bögen und Transkripte liegen im Zielordner ausserhalb des Repos und bleiben dort (Urheberrecht, Grösse).

1. **Medien holen.** Die öffentliche Einbettung von Instagram (`/reel|p/<code>/embed/captioned/`) liefert ohne Anmeldung die Adressen der Videos und Bilder. Sperrt sie oder fehlt sie, versucht das Programm `yt-dlp` (Reels gehen, Bildkarussells nicht; YouTube wird von dieser Umgebung aus abgewiesen).
2. **Ton transkribieren** mit Whisper (`scripts/whisper-faster.py`, ohne PyTorch, auf Linux).
3. **Bilder ansehen.** Pro Video: Bögen bei Szenenwechseln mit Zeitmarken, dazu ein **Überblick** in gleichen Abständen (bis zu zwölf Bilder), damit schnelle Schnitte nicht nur den Anfang zeigen. Pro Karussell: ein Bogen mit vier Folien je Seite; gemischte Formate werden vorher auf eine gemeinsame Zellgrösse gebracht.
4. **Messen:** Schnittzahl (harte Schnitte, keine Einblendungen), Lautheit, Pausen, bei Ton Frequenzanteile.
5. **Dossier** je Link in eigenen Worten: Zweck, Haken, Aufbau, Tempo, Kamera, Licht, Text und Grafik, Ton, Werkzeuge, Eignung für Alperna. Die Dossiers liegen unter `dossiers/<Code>.md` (ein Dossier je Reel und Karussell, 54 Stück; für die vier Profile gilt `profile.md`, für das YouTube-Video gibt es keines); die Themen-Dateien hier fassen sie zusammen. Jedes Dossier eines gesehenen Beitrags nennt unter «Belege» drei Stellen mit Zeitmarke, an denen sich die Aussage im Video nachprüfen lässt.

**Gesehen heisst:** Überblick und Bögen angesehen und das Transkript gelesen. **Nicht jede Szene einzeln in Originalgrösse.** Bei Karussells liegen alle Folien auf den Bögen; Ausnahme: beim Karussell `DexfHNYFKHQ` (jdomito_, neun Folien) habe ich nur die ersten vier angesehen (`profile.md`).

## Grenzen

- **Ich höre nichts.** Zu Ton und Sounddesign liegen Messwerte und Zeitleisten vor, kein Urteil über Klang. Musiktitel erkenne ich nicht. Ob etwas gut klingt, entscheidet ein Mensch mit Kopfhörer.
- **Kamerabewegung** erkenne ich nur aus Bildfolgen. Objektiv, Blende und Brennweite kann ich aus den Bildern nicht sicher bestimmen; wo sie genannt werden, stammen sie von den Autoren.
- **Profile** lassen sich ohne Anmeldung nicht durchblättern. Die Einbettung liefert die sechs jüngsten Beiträge und die Kennzahlen; ich habe daraus zwei bis drei Beiträge je Konto angesehen. Das ist eine **Stichprobe vom 23.10.2026** (`profile.md`). Eine Dauerbeobachtung gibt es nicht; der Viral Watcher bleibt aus.
- **Zwei Links nicht gesehen:** `DeHgoP8kxyV` (die Einbettung liefert keine Medien, auch `yt-dlp` findet keine) und das YouTube-Video `H9yhVi_8eVU` (Bot-Sperre; es liegt nur der Titel vor). Für beide braucht es eine Datei von Andrej oder einen Lauf auf dem Mac mit angemeldetem Browser.
- **Die GitHub-Repositories**, die ein Beitrag nennt, habe ich nicht geöffnet (HTTP 403 aus dieser Umgebung).
- **Alle Zahlen der Autoren** (Aufrufe, Umsatz, Klickraten, Wirkungen auf das Gehirn, Prozentwerte und Zeiten in Erzählkurven) sind **Behauptungen ohne Beleg**. Sie stehen nur als solche im Text und kommen nie in Marken, Regeln oder Kundenunterlagen (Regel 7). Was in diesen Dateien als Zahl steht, ist entweder eine Messung dieser Sichtung (mit Beleg im Dossier) oder als Behauptung gekennzeichnet.
- **Rechtliches:** Das Abrufen über die Einbettung ist von Instagram nicht ausdrücklich erlaubt. Es ist kein Konto im Spiel, aber Instagram kann Abrufe sperren (HTTP 429, was die Pipeline abwartet). Das Material bleibt intern, wird nicht weitergegeben und nicht als eigenes Material verwendet. Das ist keine Rechtsberatung (Regel 8: Rechtsaussagen gehören nach `content/legal/`).

## Stand je Link

| Code | Deine Bezeichnung | Art | Konto | Umfang | Stand |
|---|---|---|---|---|---|
| DetbRtDRQUP | marketing system 1 | Reel | @alexbrandshaw | 47 s | gesehen, Transkript |
| Dej8homsIzp | marketing system 2 | Reel | @justyn.ai | 21 s | gesehen, Transkript |
| DekGFjDhWgp | marketing system 3 | Reel | @corbinsylk | 25 s | gesehen, Transkript |
| DekNPnCiNW5 | marketing system 4 | Reel | @andremass.ai | 23 s | gesehen, Transkript |
| DeulxG-t1li | interface | Reel | @YANNY | 9 s | gesehen, Transkript, über yt-dlp |
| Dc2A1V4qLzi | ads | Reel | @tim.techhustles | 39 s | gesehen, Transkript |
| Dee5ObigMNa | claude editing guide | Reel | @paytkaleiwahea | 85 s | gesehen, Transkript |
| Dd4S2RFqCDT | broll cinematographie ai footage | Reel | @kkasnoreal | 39 s | gesehen, Transkript |
| DegOQG6Tydw | content system | Reel | @AidenJohnston | 68 s | gesehen, Transkript, über yt-dlp |
| Da0DayIpsie | gute graphics | Reel | @divyansh.fx_ | 26 s | gesehen, Transkript |
| lemonadsstudio | beste graphics profil | Profil | @lemonadsstudio |  | Stichprobe (siehe `profile.md`) |
| DVOb7_LD9Pt | graphics wie hier | Reel | @lemonadsstudio | 90 s | gesehen, Transkript |
| DdpCoibIthe | crazy editing beispiel | Reel | @ara.editorr | 24 s | gesehen, Transkript |
| Dd5Kr8OCAu0 | formate | Reel | @kienobifilms | 9 s | gesehen, Transkript |
| DdMEpR4xurB | talking head format | Reel | @stephlovesdigital | 57 s | gesehen, Transkript |
| DctTp5ay2Pa | sound design | Reel | @motionthekx | 11 s | gesehen |
| Dei5MKHgHyB | video editing ablauf 101 | Karussell | @zeeuiux | 11 Folien | gesehen |
| DevY6-ogAEe | animated carousels | Karussell | @gannon.meyer | 14 Folien | gesehen |
| DeAIV5qmTMK | hooks | Karussell | @sam.gaudet | 10 Folien | gesehen |
| Dd953y5IA_4 | guide to carousels | Karussell | @watch.gabe | 10 Folien | gesehen |
| DekASnnAK3z | visual hooks | Karussell | @cj.filmed.it | 13 Folien | gesehen |
| DepZQzHD9YV | openloop | Karussell | @sam.gaudet | 9 Folien | gesehen |
| DemfMAsmyKc | ideas | Karussell | @edendotso | 13 Folien | gesehen |
| DbSNmTbIrQb | ad formats | Reel | @Luke | 36 s | gesehen, Transkript, über yt-dlp |
| Dd7iE_HjrF0 | hook rules | Karussell | @kallawaymarketing | 6 Folien | gesehen |
| Deg3WGXkRPi | batch ideen 1 | Karussell | @longevitypenguin | 6 Folien | gesehen |
| DeIiLkEjqAg | batch ideen 2 | Karussell | @kallawaymarketing | 6 Folien | gesehen |
| DbZxUmzNqv9 | batch ideen 3 | Reel | @jun_yuh | 65 s | gesehen, Transkript |
| DeOn0a3AscK | batch ideen 4 | Karussell | @longevitypenguin | 7 Folien | gesehen |
| DeHfg98vhjh | batch ideen 5 | Reel | @peter.visuals | 18 s | gesehen, Transkript |
| DeS-FmBDrDX | batch ideen 6 | Karussell | @kallawaymarketing | 9 Folien | gesehen |
| Dd2pNfBjgts | sehr wichtig | Karussell | @kallawaymarketing | 10 Folien | gesehen |
| DenmLE0Dty7 | batch ideen 8 | Karussell | @kallawaymarketing | 6 Folien | gesehen |
| Dd__INdueH4 | batch ideen 9 | Reel | @gobirdmasterclass | 25 s | gesehen, Transkript |
| DcHAMh2MIip | batch ideen 10 | Reel | @ant.lon | 55 s | gesehen, Transkript |
| DemW3Z0CblC | batch ideen 11 | Karussell | @gabechiaa | 12 Folien | gesehen |
| DevOItRDtJw | batch ideen 12 | Karussell | @kallawaymarketing | 8 Folien | gesehen |
| Dd9-L-pEVcA | batch ideen 13 | Karussell | @kallawaymarketing | 7 Folien | gesehen |
| DeZRDzXEiUg | batch ideen 14 | Karussell | @vectorayush | 8 Folien | gesehen |
| Dew3PAQTMCs | video effects beispiele | Reel | @tenfoldmarc | 36 s | gesehen, Transkript |
| Dd_iThjj32v | skills fuer design | Karussell | @ai.theshift | 7 Folien | gesehen |
| DeNvLD8Dg8S | video formate | Karussell | @kallawaymarketing | 8 Folien | gesehen |
| DeN9Tp2FSoC | camera angles | Karussell | @kienobifilms | 12 Folien | gesehen |
| kallawaymarketing | profil analyse 1 | Profil | @kallawaymarketing |  | Stichprobe (siehe `profile.md`) |
| jdomito_ | profil analyse 2 | Profil | @jdomito_ |  | Stichprobe (siehe `profile.md`) |
| omgadrian | profil cinematographie | Profil | @omgadrian |  | Stichprobe (siehe `profile.md`) |
| DdUXS0Ipk6Y | neue videos 1 | Reel | @its.normss | 74 s | gesehen, Transkript |
| Dd-ZkWQjUAU | neue videos 2 | Karussell | @its.normss | 8 Folien | gesehen |
| DeHgoP8kxyV | skills | Karussell |  |  | nicht gesehen (nicht einbettbar) |
| DeUFkeYir-x | cinematic look | Karussell | @ac.apture | 5 Folien | gesehen |
| DeH8vGJjPOQ | shotlist | Karussell | @rubenscott | 12 Folien | gesehen |
| DeWQ8x8jK9f | cinematography | Karussell | @timavisual | 10 Folien | gesehen |
| Dexrx7XEcyT | shots and emotion | Karussell | @explain | 10 Folien | gesehen |
| DdqrKRDilMR | cinematographie look | Karussell | @ac.apture | 10 Folien | gesehen |
| DeOk9mNExld | cinematic sounddesign | Karussell | @gakuyen | 14 Folien | gesehen |
| DeRRCivjL3A | foto masking | Karussell | @mikita.yo | 11 Folien | gesehen |
| DeuEgjxFGJO | masking bei video | Karussell | @loris_marie | 6 Folien | gesehen |
| H9yhVi_8eVU | v-log guide | YouTube | Evan Schneider |  | nicht gesehen (Sperre), nur Titel |
| Deyz9hVk-q4 | visual effects graphics ideas | Karussell | @corbinsylk | 8 Folien | gesehen |

Zählung: 32 Karussells, 22 Reels, 4 Profile, 1 YouTube-Video. **53 gesehen**, 4 Profile als Stichprobe, 1 nicht einbettbar, 1 gesperrt.
