
## Befund (verifiziert im Code)

**Ja, es ist ein Bug.** In `src/lib/report/weatherCorrection.ts` (`estimateHotWaterBaselineKwhPerMonth`) wird der Toggle `hot_water_via_gas` nur genutzt, um einen **manuellen Override** zu erlauben. Ist der Toggle **aus**, fällt die Funktion trotzdem in Schritt 2 (Sommer-Baseline) bzw. Schritt 3 (12 %‑Fallback) — es wird also **immer** ein WW-Sockel abgezogen, auch wenn der Nutzer ausdrücklich sagt "kein WW über Gas".

Deshalb siehst du in der Grafik "Warmwasser (geschätzt) 5,48 MWh · Fallback 12 %", obwohl in keiner Liegenschaft der Toggle aktiv ist. Der Toggle steuert aktuell nur *woher* der Wert kommt, nicht *ob* er abgezogen wird.

Zweitens: Das Datenmodell kennt nur "Warmwasser über **Gas**". Realität: WW kann auch über Strom (Boiler/Durchlauferhitzer/Wärmepumpe), Pellets, Öl, Fernwärme oder eine Solarthermie erzeugt werden. Wir brauchen eine generische Quelle.

## Ziel

1. WW-Sockel wird **nur** abgezogen, wenn der Nutzer aktiv eine WW-Quelle konfiguriert hat.
2. Die WW-Quelle ist **frei wählbar** aus den Energiequellen der Liegenschaft (nicht mehr auf Gas festgenagelt).
3. Der Sockel wirkt sich **nur auf die passende Energieart** in der Witterungsbereinigung aus (WW über Strom ⇒ kein Abzug beim Gas, und umgekehrt).
4. Ohne Konfiguration = altes Verhalten vor dem WW-Feature (voller Gasverbrauch wird als Heizung bereinigt).

## Umsetzung

### 1. Datenmodell (Migration)

Neue generische Felder auf `locations`:

| Feld | Typ | Zweck |
|---|---|---|
| `hot_water_energy_type` | `text NULL` | z. B. `gas`, `strom`, `pellets`, `oel`, `fernwaerme`, `waerme`. `NULL` = nicht konfiguriert = kein Abzug. |
| `hot_water_kwh_year` | `numeric NULL` | Manuell bekannter Jahreswert (kWh). |
| `hot_water_share_pct` | `numeric NULL` | Alternativ: Anteil am Jahresverbrauch der WW-Quelle (%). |

Backfill in derselben Migration:
- Wo `hot_water_via_gas = true` → `hot_water_energy_type = 'gas'`, kWh/% aus alten Feldern übernehmen.
- Alte Felder (`hot_water_via_gas`, `hot_water_gas_kwh_year`, `hot_water_gas_share_pct`) **bleiben zunächst bestehen**, werden aber nicht mehr gelesen. Aufräumen in späterer Migration.

### 2. Core-Logik (`src/lib/report/weatherCorrection.ts`)

`estimateHotWaterBaselineKwhPerMonth` wird umgebaut:

```text
Input: monthly[], override { hotWaterEnergyType, kwhYear, sharePct }, currentEnergyType

Regeln:
- Wenn override.hotWaterEnergyType leer/NULL           → source: "none", perMonthKwh: 0
- Wenn override.hotWaterEnergyType !== currentEnergyType → source: "none", perMonthKwh: 0
- Sonst: manual (kwhYear) → manual (sharePct) → summer-baseline → fallback 12 %
```

Damit: kein Konfig = kein Abzug. Konfig für Strom, Analyse zeigt Gas = kein Abzug beim Gas.

### 3. Hook (`src/hooks/useWeatherNormalization.tsx`)

- Selectliste um die neuen Felder erweitern, alte Felder rausnehmen.
- Beim Aufruf der Estimator-Funktion den aktuell gewählten `energyType` mitgeben.
- KPI-Karte "Warmwasser (geschätzt)" zeigt `0 kWh` und "nicht konfiguriert", wenn keine Location für die aktuelle Energieart eine WW-Quelle hinterlegt hat.

### 4. UI (`EditLocationDialog.tsx`)

Section "Warmwasserbereitung" (bereits direkt unter Heizungsart platziert) wird umgebaut:

- **Dropdown "Warmwasser über"** — Optionen: `Nicht konfiguriert (Standard)` + alle Energiequellen der Liegenschaft (aus `energy_sources`, gleiche Logik wie beim Heizungsart-Dropdown), gefiltert auf Wärmeträger-fähige Typen (`gas`, `strom`, `pellets`, `oel`, `fernwaerme`, `waerme`, `solar`).
- Zwei optionale Felder darunter (nur sichtbar, wenn eine Quelle gewählt ist): **WW-Jahresverbrauch (kWh)** und **Anteil an der WW-Quelle (%)**. Label wird generisch ("Anteil am Verbrauch der WW-Quelle") statt "Anteil am Gasverbrauch".
- Hilfetext: "Bleibt beides leer → automatische Sommer-Baseline, sonst Fallback 12 %."

### 5. KPI-/Anzeige-Feinschliff

- KPI-Karte "Warmwasser (geschätzt)" bekommt den Zusatz "Quelle: Gas / Strom / …" statt nur "Fallback 12 %", damit klar ist, auf welchen Träger sich der Sockel bezieht.
- In der Widget-Ansicht (`WeatherNormalizationWidget`) wird bei `hotWaterSource === "none"` die KPI-Karte auf `—` gesetzt (nicht 0 MWh, um Verwechslung zu vermeiden).

### 6. Tests (`src/lib/__tests__/weatherCorrection.test.ts`)

Ergänzen:
- `hotWaterEnergyType = null` → 0, source `none`.
- `hotWaterEnergyType = 'strom'`, currentEnergyType `gas` → 0, source `none`.
- `hotWaterEnergyType = 'gas'`, currentEnergyType `gas`, manuell → korrekter Wert.
- Bestehende Tests auf neue Signatur migrieren.

## Nicht-Ziele

- Kein automatisches Erraten der WW-Quelle. Ohne Nutzereingabe = kein Abzug (bewusst konservativ, um falsche Bereinigungen wie aktuell zu vermeiden).
- Kein Split "Heizung teilweise WW" mit Gewichtung — für einen späteren Schritt.
- Keine Änderung an den Gradtagen / HDD-Berechnung.

## Erwartetes Ergebnis nach dem Fix

- Aktueller Zustand deiner Daten (kein Toggle gesetzt): "Warmwasser (geschätzt)" = `—`, "Ist-Verbrauch" = "Bereinigt"-Basis wie vor dem WW-Feature. Deine Beispielgrafik zeigt dann wieder die alten Werte.
- Sobald ein Standort z. B. "Warmwasser über Gas, 3 500 kWh/Jahr" gesetzt bekommt, wird nur dort und nur beim Gas-Verbrauch abgezogen.
