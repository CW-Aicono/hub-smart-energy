
# Loxone-Periodenwerte korrekt nutzen und Quartale berechnen

## Problemstellung

Aktuell werden nur aktuelle Leistung (`value`) und Tagessumme (`totalDay`) vom Miniserver ans Frontend durchgereicht. Wochen-, Monats- und Jahres-Charts fuer automatische Zaehler zeigen keine korrekten Werte, da keine historischen Daten in der Datenbank vorliegen. Zudem dient der Miniserver als Zwischenspeicher bei Internetausfaellen -- seine akkumulierten Periodenwerte sind die zuverlaessigste Datenquelle.

Quartale liefert Loxone nicht direkt. Die Loesung: Monatssummen periodisch speichern und fuer ein Quartal die drei zugehoerigen Monatswerte addieren. Fuer das **laufende Quartal** werden gespeicherte abgeschlossene Monate mit dem Live-Monatswert (`Rm`) vom Miniserver kombiniert.

## Uebersicht der Aenderungen

```text
Loxone Miniserver
       |
       v
loxone-api Edge Function
  (NEU: totalWeek, totalMonth, totalYear durchreichen)
       |
       v
GatewaySensor Interface (erweitert)
       |
       +---> useEnergyData (NEU: livePeriodTotals extrahieren)
       |         |
       |         +---> EnergyChart (Perioden-Ansichten nutzen Loxone-Werte)
       |         +---> SankeyWidget / KPIs (profitieren ebenfalls)
       |
       +---> LiveValues.tsx (optional: Monat/Jahr anzeigen)
       |
       v
meter_period_totals (NEUE DB-Tabelle)
  - Speichert Monatssummen fuer Quartalsberechnung
  - Wird beim Abruf automatisch befuellt
```

## Schritt 1: Neue Datenbanktabelle `meter_period_totals`

Neue Tabelle zum Speichern von Monatssummen (und optional weiterer Perioden) fuer historische Auswertungen und Quartalsberechnung.

```sql
CREATE TABLE public.meter_period_totals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  meter_id UUID NOT NULL REFERENCES public.meters(id) ON DELETE CASCADE,
  period_type TEXT NOT NULL CHECK (period_type IN ('month', 'year')),
  period_start DATE NOT NULL,       -- z.B. 2025-01-01 fuer Januar
  total_value NUMERIC NOT NULL,
  energy_type TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'loxone',  -- Herkunft: loxone, manual, etc.
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(meter_id, period_type, period_start)
);

-- RLS aktivieren
ALTER TABLE public.meter_period_totals ENABLE ROW LEVEL SECURITY;

-- RLS-Policy: Tenant-basierter Zugriff
CREATE POLICY "Tenant users can manage period totals"
  ON public.meter_period_totals
  FOR ALL USING (tenant_id = get_user_tenant_id());
```

**Zweck:** Wenn der Miniserver abgefragt wird und ein Monat abgeschlossen ist (z.B. wir sind im Februar, also ist Januar abgeschlossen), wird der `totalMonthLast`-Wert (`Rlm`) als Monatssumme fuer den Vormonat gespeichert (UPSERT). So entsteht ueber die Zeit ein vollstaendiges Archiv.

## Schritt 2: Edge Function `loxone-api` erweitern

### 2a: `StateValueResult`-Interface erweitern

Neue Felder hinzufuegen:

```typescript
interface StateValueResult {
  // ... bestehende Felder ...
  totalDay?: number | null;
  totalWeek?: number | null;
  totalMonth?: number | null;
  totalYear?: number | null;
}
```

### 2b: Periodenwerte extrahieren (gleiche Priorisierungs-Logik wie bei totalDay)

Nach der bestehenden `totalDay`-Berechnung (Zeile 386-406) die gleiche Logik fuer Week, Month und Year anwenden:

```typescript
// totalWeek
const totalWeekRaw = isNegativePower
  ? (mappedStates["totalWeekDelivery"] ?? mappedStates["totalWeek"] ?? mappedStates["totalWeekConsumption"] ?? null)
  : (mappedStates["totalWeekConsumption"] ?? mappedStates["totalWeek"] ?? mappedStates["totalWeekDelivery"] ?? null);

// totalMonth
const totalMonthRaw = isNegativePower
  ? (mappedStates["totalMonthDelivery"] ?? mappedStates["totalMonth"] ?? mappedStates["totalMonthConsumption"] ?? null)
  : (mappedStates["totalMonthConsumption"] ?? mappedStates["totalMonth"] ?? mappedStates["totalMonthDelivery"] ?? null);

// totalYear
const totalYearRaw = isNegativePower
  ? (mappedStates["totalYearDelivery"] ?? mappedStates["totalYear"] ?? mappedStates["totalYearConsumption"] ?? null)
  : (mappedStates["totalYearConsumption"] ?? mappedStates["totalYear"] ?? mappedStates["totalYearDelivery"] ?? null);
```

### 2c: Werte im Sensor-Objekt zurueckgeben

Das `sensors.push()`-Objekt (Zeile 478-494) um die drei neuen Felder erweitern:

```typescript
sensors.push({
  // ... bestehend ...
  totalDay: stateData?.totalDay ?? null,
  totalWeek: stateData?.totalWeek ?? null,
  totalMonth: stateData?.totalMonth ?? null,
  totalYear: stateData?.totalYear ?? null,
});
```

### 2d: Automatisches Speichern abgeschlossener Monatssummen

Nach dem Sensor-Aufbau (vor der Response) pruefen: Wenn `totalMonthLast` (`Rlm`) verfuegbar ist, den Wert als abgeschlossenen Vormonat in `meter_period_totals` per UPSERT speichern. Dies geschieht bei jedem Abruf automatisch, ohne zusaetzlichen Cron-Job.

```typescript
// Fuer jeden Meter-Sensor mit totalMonthLast:
// -> UPSERT in meter_period_totals mit period_start = Erster des Vormonats
```

## Schritt 3: Frontend `GatewaySensor`-Interface erweitern

In `src/hooks/useLoxoneSensors.ts`:

```typescript
export interface GatewaySensor {
  // ... bestehend ...
  totalDay: number | null;
  totalWeek: number | null;    // NEU
  totalMonth: number | null;   // NEU
  totalYear: number | null;    // NEU
}
```

## Schritt 4: `useEnergyData`-Hook anpassen

In `src/hooks/useEnergyData.tsx`:

- Neben `liveReadings` ein neues Objekt `livePeriodTotals` aufbauen:

```typescript
interface LivePeriodTotals {
  [meterId: string]: {
    totalDay: number | null;
    totalWeek: number | null;
    totalMonth: number | null;
    totalYear: number | null;
  };
}
```

- Dieses Objekt aus den Sensor-Daten extrahieren und als zusaetzliche Rueckgabe exportieren.
- Fuer die **Quartalsberechnung**: Abgeschlossene Monatssummen aus `meter_period_totals` laden + Live-`totalMonth` fuer den laufenden Monat addieren.

## Schritt 5: `EnergyChart` fuer Perioden-Ansichten aktualisieren

In `src/components/dashboard/EnergyChart.tsx`:

Neue Logik fuer automatische Zaehler je Ansicht:

| Ansicht  | Datenquelle automatische Zaehler         |
|----------|------------------------------------------|
| Tag      | `totalDay` direkt vom Miniserver         |
| Woche    | `totalWeek` direkt vom Miniserver        |
| Monat    | `totalMonth` direkt vom Miniserver       |
| Quartal  | Summe aus gespeicherten Monatssummen (DB) + Live-`totalMonth` fuer laufenden Monat |
| Jahr     | `totalYear` direkt vom Miniserver        |

Manuelle Zaehler nutzen weiterhin die bestehende Berechnung aus `meter_readings`.

## Schritt 6: Live-Werte-Seite erweitern (optional)

In `src/pages/LiveValues.tsx`:

- `totalWeek`, `totalMonth`, `totalYear` aus dem Sensor-Abruf mitlesen
- Optional als zusaetzliche Zeilen in den Meter-Karten anzeigen (z.B. "Monat: X kWh", "Jahr: X kWh")

## Zusammenfassung Quartalslogik

```text
Quartal Q1 (Jan-Mär), aktueller Monat: Februar

  Q1 = gespeicherter Januar (Rlm aus DB, automatisch gespeichert)
     + Live-Februar (Rm vom Miniserver)

Quartal Q2 (Apr-Jun), aktueller Monat: Juni

  Q2 = gespeicherter April (DB)
     + gespeicherter Mai (DB)
     + Live-Juni (Rm vom Miniserver)
```

Sobald ein Monat abgeschlossen ist, wird sein `totalMonthLast`-Wert automatisch bei der naechsten Abfrage in die Datenbank geschrieben. So fuellt sich das Archiv automatisch und Quartale sind immer berechenbar -- auch rueckwirkend, sobald Daten vorhanden sind.
