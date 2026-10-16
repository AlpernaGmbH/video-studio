# Motion-Werkstatt: Bibliothek und Wachstumsschleife

Ergänzung zum Bauplan v2, Kapitel 3.6. Der Bauplan nennt 26 Effekte in drei Wellen und erwähnt nur am Rand, dass neue Effekte
«aus der Praxis» als Ideen in eine Liste kommen. Dieses Dokument macht daraus einen Ablauf. Die Wellen bleiben das **Startset**.
Danach wächst die Bibliothek aus den Videos selbst.

## Die Idee in einem Satz

Beim Schnitt liest Claude, was gesagt wird, und sucht Stellen, an denen eine neue Grafik besser erklärt. Jede Lücke wird mit dem
genauen Satz und der Begründung protokolliert, warum nichts Vorhandenes passt. Ein Mensch gibt frei, wählt einen Look, nimmt ab.
Das fertige Stück wandert in die Bibliothek und ist beim nächsten Video verfügbar.

## Drei Quellen für Ideen

| Quelle | Auslöser | Pflichtangaben |
|---|---|---|
| `video` | ein Satz in Skript oder Transkript | Projekt, Zeile, Zeit, **genauer Satz** |
| `inspiration` | ein gespeichertes Inspirationsvideo | Titel, Link, Zeit, Beobachtung |
| `auftrag` | ein Mensch verlangt eine Grafik | wer, was |

Bei `inspiration` und `auftrag` prüft Claude zuerst, ob ein vorhandenes Stück schon passt, und sagt es dann, statt eine Idee anzulegen.

## Der Ablauf

```
 Skript/Transkript ─► Lückenanalyse ─► IDEE ─► PITCH ─┬─► abgelehnt (mit Grund)
                                                      │
                                              Mensch gibt frei
                                                      ▼
                            LOOKS: drei Standbilder ◄─┐ «keiner passt» (mit Grund)
                                                      │
                                              Mensch wählt einen Look
                                                      ▼
                         IN BAU ─► Selbstprüfung (höchstens 2 Korrekturrunden)
                                                      ▼
                                           RENDER GEPRÜFT ─► Mensch: Änderungswunsch ─► IN BAU
                                                      │
                                              Mensch nimmt ab
                                                      ▼
                                         IN BIBLIOTHEK (Stück «aktiv»)
```

Zustandsautomat: `src/motion/idee.ts`. Was er **erzwingt** (und die Tests belegen):

| Regel | Wo |
|---|---|
| Freigabe, Look-Wahl, Änderungswunsch, Abnahme, Ablehnung nach dem Pitch nur durch einen Menschen | `nurMensch`, `istMensch` |
| Nichts wird gebaut ohne drei verschiedene Looks und eine Wahl | `ERLAUBT`, Guards |
| Eine Ablehnung braucht einen Grund aus mindestens zwei Wörtern | `weiter` |
| «Keiner passt» braucht einen Grund, der in die nächste Runde fliesst | `looks>freigegeben` |
| Höchstens 2 Stücke gleichzeitig im Bau | `WIP_LIMIT_STANDARD` |
| Höchstens 5 offene Pitches | `MAX_OFFENE_PITCHES` |
| Höchstens 2 Selbstkorrekturen, danach entscheidet ein Mensch | `pruefungErfassen` |
| Ein Pitch nennt mindestens 2 weitere Einsätze (keine Einwegstücke) | `Pitch.wiederverwendung` |
| Die Begründung «warum nichts passt» nennt bei grösserer Bibliothek mindestens 3 Stücke einzeln | `WarumNichtsPasst` |
| Titel und Beschreibung sind nach dem Pitch nicht mehr änderbar | `Ideenprotokoll.bearbeite` |
| Nur aktive Stücke im Storyboard | `src/core/storyboard.ts` |

**Grenze:** Der Namenstest für «Mensch» ist keine Authentifizierung. Er verhindert den Flüchtigkeitsfehler, dass Claude sich selbst
einträgt. Echten Schutz bieten erst die Rechte im Prüfplatz oder in Notion (Phase 2).

## Lücken finden

Zwei Stufen (`src/motion/signale.ts`, `luecken.ts`):

1. **Vorstufe (Code, deterministisch):** erkennt in Sätzen Verlauf («von 97 auf 60», «über fünf Scans»), Anteil, Zahl mit Einheit,
   Vergleich, Aufzählung, Prozess und Zeitraum. Deutsche Muster, mit Unicode-Wortgrenzen (JavaScripts `\b` greift vor «über» nie).
2. **Claude liest selbst** und ergänzt, was Muster nicht sehen (räumliche Abfolgen, Bilder, Verhältnisse), als Signal vom Typ `frei`.

Für jede Stelle prüft der Code gegen **jedes** vorhandene Stück, ob es sie zeigen kann (`fitSignal`): Signaltyp, Anzahl der Wertplätze,
fehlende Zwischenwerte. Daraus entsteht das Urteil:

| Urteil | Bedeutung |
|---|---|
| `abgedeckt` | Ein Stück passt. Im Storyboard benutzen. |
| `luecke` | Kein Stück passt. Neue Idee, mit der Begründung pro Stück. |
| `bereits-erfasst` / `bereits-abgelehnt` | Ähnliche Idee gab es schon (Zahlen und Zahlwörter zählen als gleich). Nicht noch einmal. |
| `unsicher` | Nur schwache Signale. Claude entscheidet. |

Beispiel (Satz aus der Beschreibung): «Die Läuferin fiel über fünf Scans von 97 auf 60.» Mit dem Zahl-Zähler allein ist das eine Lücke:
«Zahl-Zähler zeigt eine einzelne Kennzahl und deckt zahl, anteil ab. Der Satz verlangt «verlauf» («über fünf Scans von 97 auf 60»).»
Sobald ein Verlaufs-Stück aktiv ist, meldet die Analyse `abgedeckt` und nennt, dass noch drei Zwischenwerte fehlen.

## Das Stück (Vertrag)

- **Datenblatt** `piece.json` = Bauplan Anhang A3 plus Einsatzangaben (wann, wann nicht, Beispiele mit Satz). Ab Status «geprueft» Pflicht.
- **Komposition** `index.html` = HyperFrames. Variablen stehen in `data-composition-variables` und werden aus `piece.json` erzeugt (`motion sync`),
  der Lint prüft, dass beides übereinstimmt.
- **Dauer** ist keine Root-Variable in HyperFrames. Darum hat der Root kein `data-duration`, das Stück liest `dauer` und endet seine Timeline dort.
- **Ausgabe** `overlay`: transparentes WebM, 1080×1920, 25p. `komposition` (für Zoom, Freisteller, Frame Break): nimmt das Basisvideo entgegen.
- **Marke** über acht Variablen (`markeBg` … `markeTempo`). Nichts fest verdrahtet.
- **Listen** gibt es in HyperFrames nicht: Zahlenreihen und Textlisten laufen als JSON-Text.
- **Status** `entwurf → gebaut → geprueft → aktiv`. «aktiv» setzt nur ein Mensch (`motion aktivieren`).

## Selbstprüfung (`render-pruefung.ts`)

Messbar, ohne Hinsehen: Länge (±1 Bild), Auflösung, 25p, Alphakanal, leerer Render, Sicherheitsrand (Pixelumfang aus dem Alphakanal),
Anfang und Ende leer, `hyperframes check` (Layout, Kontrast, Laufzeitfehler). Danach Claudes Bildprüfung an Standbildern
(`prompts/bildpruefung.md`). Geschmack beurteilt Claude nicht.

Beim Bau des Referenzstücks sind drei echte Mängel aufgefallen, mit unterschiedlicher Entdeckung:

- **Hartes Ende** (das letzte gerenderte Bild lag eine Bildlänge vor dem Ende der Ausblendung und war noch zu 16 % sichtbar): fand die automatische Prüfung (`ende_nicht_leer`).
- **Leeres Vorschaubild trotz «bestanden»:** fand erst der Blick auf das Bild. Der Selbsttest vergleicht Vorschauen jetzt mit einer leeren Grundlinie.
- **Zu knapp gemessene Schriftbreite** (`getBoundingClientRect` rechnet Transformationen mit, die Zahl ragte 30 px ins Polster): fand erst der Blick auf das Bild.
  Keine Messung sieht das, solange der Text noch in der Karte liegt. Deshalb bleibt die Bildprüfung (Claude und Mensch) ein eigener Schritt.

## Neue Fassungen

Weil ein Stück wiederverwendbar ist: gleiche Komposition, andere Variablen. `motion render … --set …` für eine Fassung,
`motion batch` für mehrere (jede Zeile wird vorher streng geprüft, ein Fehler stoppt den ganzen Lauf).

## Was dieses Konzept übertragbar macht

Die Schleife (Lücke belegen, pitchen, Richtung wählen, bauen, selbst prüfen, in die Bibliothek) ist unabhängig von Video. Sie passt auf alles,
was Alperna immer wieder neu baut: Sales-Decks, E-Mail-Vorlagen, Ad-Creatives, Angebote. Dafür wäre die Komposition ein anderes Format,
der Zustandsautomat und das Protokoll blieben gleich. Nicht Teil dieser Etappe.

## Grenzen und Risiken

- **Engpass ist Aufmerksamkeit, nicht Claude.** Jedes Stück braucht drei menschliche Entscheide. «Täglich neue Stücke» ist bei Dritten ein Ziel,
  hier nicht der Startwert. Die Limits (2 im Bau, 5 offene Pitches) schützen davor, dass sich Halbfertiges stapelt (Risiko 2 im Bauplan).
- **Prompt-Grösse.** Bei hunderten Stücken darf nicht jedes Datenblatt in jeden Storyboard-Prompt. `kompakterIndex` liefert eine Zeile pro Stück;
  ab etwa 100 Stücken braucht es eine Vorauswahl nach Signaltyp (noch nicht gebaut).
- **Fit ist Datenblatt-Logik.** Ein Stück, das mehr kann, als sein Datenblatt sagt, wird übersehen. Datenblätter ehrlich pflegen.
- **Regex-Vorstufe** hat Fehlalarme («mehr als 100 Kunden»). Darum entscheidet Claude bei `unsicher`, und neue Ideen sind auf 5 pro Video begrenzt.
- **Speicher** ist vorerst eine Datei mit Versionsprüfung. Zwei Rechner auf derselben OneDrive-Datei sind keine Dauerlösung: Notion (Bauplan Kap. 6).
