# Marketing System: Bestand in Notion und was daraus wird

Stand 17.10.2026. Gelesen von zwei Agenten (nur lesen, Zeilen nur über gespeicherte Ansichten), zusammengefasst hier. Die Seiten «Instagram» und «LinkedIn» unter «Alperna GmbH» bleiben unverändert.
Entscheid vom 17.10. (Andrej): Das Marketing System entsteht neu unter «Marketing System», alles andere wird nicht weitergeführt. Übernommen wird nur, was ausdrücklich freigegeben ist.

## Was es gibt

**LinkedIn** (aktuell, zuletzt geändert 05.10.2026): das einzige gepflegte System.
- **Cockpit** mit vier Bausteinen: Rohstoff-Speicher (48 Zeilen, alle 15. bis 17.09.2026 erfasst), Beiträge-Archiv (95 Zeilen, 22.04.2025 bis 15.10.2026), Wochen-Analytics (0 Zeilen), Engagement-Bank (16 Zeilen).
- Regeln: kein Post ohne Rohstoff, kein Fakt der letzten 90 Tage, «Viral-first» seit 17.09.2026 (Struktur nachbauen, nie Text übernehmen, Vorlage mit mindestens 500 Likes oder mehr Kommentaren als Likes).
- **Viral-Vorlagen-Bibliothek** (14 Aufbauten). Die Datenbank «Viral · LinkedIn» (6 Zeilen vom 27.06.2026) wird faktisch nicht mehr benutzt.
- Veraltet: Strategie Q1 2026 und Formate (Zahlen ohne Quelle), Wochen-Analytics 2025/2026, Beitragsideen-Tabellen von Dezember und Januar, Fremdvorlagen (Content Calendar 2024/25).

**Instagram** (überwiegend veraltet, zuletzt geändert 16.07.2026): Content-Ideen (23), Trends «Content Inspiration» (rund 83, davon 30 nur mit URL), Serie Kundenprojekte (9, mit echten Kundennamen und Kennzahlen), Educational Content (14), Creators (30, davon 6 mit beschädigten Handles), «Viral · Instagram» (5 Zeilen vom 17. bis 24.06.2026, Stapelimport). Strategie Q4 2025 ist ein Jahr alt, die Wochentabellen enthalten nur Beispielwerte.

## Was daraus wiederverwendet wird

| Aus dem Bestand | Im neuen System |
|---|---|
| Rohstoff-Schema (Konkretes ist Pflicht, Uniqueness-Ebene, Freigabe, Status) | Datenbank **Rohstoffe**, dazu Marke, Beleg mit Link, «Bestätigt von/am» und Kundenfreigabe (fehlten) |
| Schema der Viral-Datenbanken (Hook, CTA, Psychologie, Struktur, Adaption, Status) | Datenbank **Inspiration** mit Plattform, Quelle, Eignung je Marke, Verknüpfung zum Inhalt und Ergebnis |
| Beiträge-Lebenslauf (Idee bis Ausgewertet, Hook-Muster, CTA-Typ, Experiment) | **Inhalte** mit den Toren I und P statt eines Freigabe-Hakens |
| Engagement-Bank (Typ, Quelle, Angle, nächster Schritt) | noch nicht gebaut, kommt mit dem Engagement-Teil |
| 90-Tage-Regel, «fehlt der Fakt, wird gefragt», «nur Struktur, nie Text» | im Code (Dublettenprüfung, Rohstoff-Regel) und im Skill |

## Was fehlte und jetzt vorgesehen ist

Marke als Dimension in jeder Tabelle, Beleg pro Rohstoff mit bestätigendem Menschen und Datum, Verknüpfungen (Inspiration zu Inhalt, Rohstoff zu Inhalt), ein Ereignisprotokoll mit echten Zahlen, maschinenlesbare Regeln je Marke, Schweizer Schreibweise (bestehende Texte nutzen «ß»), Dublettenprüfung zwischen den beiden Inspirationslisten.

## Datenschutz

Rohstoff-Speicher, Kundenprojekte und Lücken-Fragen nennen Kundinnen und Kunden mit Namen, teils mit Kennzahlen, dazu Privates von Mitarbeitenden (Militärdienst, politische Haltung, Studium) und Dritten. **Nichts davon wird ungeprüft übernommen.** Zahlen im Bestand ohne Beleg (zum Beispiel «über 100'000 Aufrufe im Monat», «170 Mio. Views in 2025», «65 % mobile Nutzer») gelten nicht als Fakt (Regel 7).

## Offen (braucht einen Entscheid)

1. Den Rohstoff-Speicher (48) und das Beiträge-Archiv (95) übernehmen oder neu beginnen? Übernahme hiesse: je Eintrag Marke, Beleg und Bestätigung nachtragen, Kundendaten prüfen.
2. Zahlenkonflikt im Bestand: Partnerzahl 17 (08.07.), 21 (24.08.), «heute 26». Welche gilt, mit Quelle?
3. Ob «Viral-first» wirkt, ist nicht belegt: keine der 20 Viral-Zeilen im Archiv ist ausgewertet.
4. Wer erzeugt die Analysetexte der Viral-Zeilen? Sie müssen in einer Claude-Sitzung entstehen, nie über die API (Regel 10).
5. Voice-Memo-Ideen: Die Seite ist leer. Wo liegen sie?
