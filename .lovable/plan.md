# Warum die Karte bei dir nicht auftaucht

Ich habe den Code verifiziert – der Fehler liegt bei mir, nicht bei dir:

- `src/components/locations/LoxoneTemplatesCard.tsx` (Zeile 40-42) sucht nach einer Integration mit **`integration.type === "loxone"`**.
- Tatsächlich vergibt die App aber den Typ **`"loxone_miniserver"`** (siehe `src/lib/gatewayRegistry.ts` Zeile 34, und alle anderen Loxone-Stellen im Code prüfen konsequent `=== "loxone" || === "loxone_miniserver"`).
- Ergebnis: Die Karte liefert `return null` und wird nie gerendert – egal wie oft du auf der Liegenschaft nach unten scrollst. Deshalb hast du zurecht nichts gefunden.

Die Karte ist in `src/pages/LocationDetail.tsx` Zeile 224 korrekt eingebunden – der Filter innerhalb der Karte ist das Problem.

# Was ich fixen werde

## 1. Filter reparieren (Kernfix)
`LoxoneTemplatesCard.tsx`: Bedingung auf beide Typen erweitern (`"loxone"` **oder** `"loxone_miniserver"`), analog zu `IntegrationCard.tsx`, `MiniserverStatus.tsx`, `EditIntegrationDialog.tsx`. Danach erscheint die Karte auf der Liegenschafts-Detailseite unterhalb von „Integrationen" mit dem Button **„Neu scannen"** oben rechts.

## 2. Scan-Button zusätzlich direkt in die Miniserver-Kachel
Damit du in Zukunft nicht mehr suchen musst, kommt der Button **„Templates scannen"** (Icon 🔄) direkt in die Integrations-Kachel „Miniserver Hendrik Verst" – neben die vorhandenen Icons (Firmware prüfen / Bearbeiten / Löschen). Klick ruft dieselbe Edge-Function `loxone-template-sync` auf und zeigt ein Toast mit der Anzahl erkannter Bausteine.
- Datei: `src/components/integrations/IntegrationCard.tsx` (nur wenn `type ∈ {loxone, loxone_miniserver}` **und** `location_integration_id` vorhanden).

## 3. Hinweis-Text auf der Übersichts-Seite präzisieren
Auf `/integrations` steht aktuell nur „…in der jeweiligen Liegenschaft unter Integrationen anlegen". Ich ergänze einen kurzen Zusatz: „Loxone-Templates werden pro Liegenschaft über die Karte **Loxone-Templates** oder das 🔄-Icon auf der Miniserver-Kachel gescannt."

# Verifikation nach dem Fix
1. Liegenschaft „Rathaus" öffnen → runter scrollen → Karte „Loxone-Templates" muss sichtbar sein.
2. Oben rechts in der Karte **„Neu scannen"** klicken → Toast „Discovery abgeschlossen – X Template-Instanz(en) erkannt".
3. Alternativ: In der Miniserver-Kachel auf das neue 🔄-Icon klicken → gleicher Toast.

# Was ich **nicht** ändere
- Keine Änderungen an Edge-Function `loxone-template-sync`, DB-Schema, Katalog oder Worker.
- Keine Menü-Umbauten.
