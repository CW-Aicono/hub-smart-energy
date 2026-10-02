---
name: PV-Stundenwerte: Lückenfüllung und Abgleich
description: Loxone-Backfill nutzt Step-Hold auf 5-Min-Buckets; Abgleich gegen Tagessumme nur auf nachgetragenen/unvollständigen Stunden
type: feature
---
Zwei Regeln für PV-Ist-Stundenwerte:

1. **Backfill (`loxone-api` → `backfillRange`)**: Loxone-Statistiken liefern je nach Block nur alle 10/30/60 Minuten einen Wert. Im Gap-Modus wird jeder Wert per Step-Hold (max. 60 Min.) auf alle abgedeckten 5-Minuten-Buckets verteilt. Ohne das enthält eine Stunde nur 10 statt 60 Minuten Energie.
2. **Frontend (`src/lib/pvActuals.ts`)**: `reconcileHourlyWithCoverage` gleicht gegen die autoritative Tagessumme (Zählerstand) ab — aber **nur** auf Stunden mit Deckung < 55 Min. oder Stunden mit `source = gateway_backfill` (`fetchBackfilledHours`). Live gemessene Vollstunden bleiben unverändert. `scaleHourlyToTotal` (Verschmierung über den ganzen Tag) ist nur noch Fallback ohne Deckungsinfo.

Grund: Step-Hold aus groben 30-Min-Samples überschätzt bei wechselnder Bewölkung (Beispiel 01.08.2026: Bucket-Summe 991 kWh vs. Zählerstand 856 kWh). Der Abgleich korrigiert genau diese nachgetragenen Stunden, statt korrekte Messstunden zu verfälschen.
