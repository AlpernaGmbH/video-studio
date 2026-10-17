# T8: Regeln für Google-Maps-Beiträge (Business Profile)

Stand 17.10.2026. Quelle: Google-Hilfeseiten (englische Fassung, Auszug über einen Abruf, nicht Wort für Wort gelesen):
`support.google.com/business/answer/7342169` (Beiträge erstellen und verwalten), `…/answer/7213077` (Inhaltsrichtlinie), `…/answer/6123536` (Fotos).

**Zweck:** Das Modul «Google-Maps-Beitrag» (Plan v3, 5.4) soll erst gebaut werden, wenn die Regeln bekannt sind.

## Gefunden [Sicher, soweit die Seiten stimmen]

| Punkt | Regel |
|---|---|
| Beitragstypen | Update, Angebot (Offer), Ereignis (Event) |
| Schaltfläche | Update und Ereignis: Knopf mit Link (zum Beispiel buchen, online bestellen, mehr erfahren). Angebot: «Angebot ansehen» automatisch |
| Lebensdauer | Beiträge älter als 6 Monate werden archiviert, ausser es ist ein Zeitraum gesetzt. Ereignis ohne Zeiten zeigt sich als 24 Stunden |
| Foto | JPG oder PNG, 10 KB bis 5 MB, empfohlen 720 × 720 Pixel, mindestens 250 Pixel |
| Erscheinen | Auf Mobil in den Tabs «Updates» oder «Überblick» bei Suche und Maps, am Computer im Abschnitt «Vom Inhaber» |
| Verboten oder eingeschränkt | Telefonnummer, E-Mail oder Social-Handle im Text, die sich nicht dem Betrieb zuordnen lassen (Beitrag kann entfernt werden); Schadlinks; Anstössiges; wertlose, automatisch erzeugte oder ablenkende Texte |
| Branchen mit Einschränkung | Alkohol, Tabak, Pharma, Medizinprodukte und Gesundheit, Glücksspiel, Feuerwerk, Waffen, **Finanzdienstleistungen**, Erwachsenenangebote |
| Hotels | Dürfen keine Angebots-Beiträge und keine Beiträge mit Rabatten oder Aktionen |

## Nicht gefunden [Lücke]

- **Maximale Textlänge:** steht auf den geprüften Seiten nicht. Verbreitet wird eine Zahl um 1'500 Zeichen genannt. **[Vermutung]**, bitte vor dem Bau im Profil ausprobieren.
- Deutsche Fassung der Seiten und Besonderheiten für die Schweiz nicht geprüft.
- Ob Beiträge über eine Schnittstelle angelegt werden können, nicht geprüft. Plan v3 sieht «Paket» vor (Mensch postet), das braucht keine Schnittstelle.

## Folgen für das Modul

1. Die Textprüfung vor Tor P prüft: Telefonnummer, E-Mail und Handles im Text nur mit Bestätigung, dass sie zum Betrieb gehören.
2. Je Marke ein Feld «eingeschränkte Branche»: Bei Kunden aus Finanz, Gesundheit oder Medizin warnt Tor I, dass Google Beiträge dazu einschränkt. Das trifft Treuhänder, Physiotherapien und Praxen, also typische Ostschweizer KMU.
3. Das Paket enthält Beitragstyp, Text, Bild (JPG oder PNG, unter 5 MB, mindestens 720 Pixel), Knopf und Link, Zeitraum.
4. Offene Frage 13.3 des Plans (eigene Standorte oder Kunden, wessen Zugang) bleibt: Ohne sie gibt es keinen echten Testbeitrag.
