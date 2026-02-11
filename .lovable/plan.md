
# Aktuelle Werte: Live-Intervall, Tagesverbrauch und Wertformatierung

## Probleme

1. **Nachkommastellen alle ",00"**: Die Loxone Edge Function gibt `value` als **formatierten deutschen String** zuruck (z.B. `"85,58"`). In `LiveValues.tsx` wird darauf `parseFloat("85,58")` angewandt -- das stoppt beim Komma und liefert `85`, daher immer `,00`.

2. **Intervall zu lang**: Aktuell 5 Minuten (300.000 ms).

3. **Tagesverbrauch fehlt**: Die Loxone-API liefert bereits `totalDay` (Loxone-Output "Rd"), aber dieser Wert wird im Sensor-Objekt nicht an das Frontend weitergegeben.

## Geplante Anderungen

### 1. Edge Function erweitern (`supabase/functions/loxone-api/index.ts`)

- Dem Sensor-Objekt zwei neue Felder hinzufugen:
  - `rawValue`: numerischer Rohwert (nicht formatiert) fur prazise Frontend-Anzeige
  - `totalDay`: Tagesverbrauch als Zahl (aus dem "Rd"-Output / "totalDay"-State)
- Bestehende Felder bleiben unverandert (Abwartskompatibilitat)

### 2. LiveValues.tsx grundlich uberarbeiten

**Datenabfrage:**
- Intervall von 300.000 ms auf **30.000 ms** (30 Sekunden) reduzieren
- Manueller Refresh-Button ist bereits vorhanden

**Wertauslesen:**
- Statt `parseFloat(sensor.value)` das neue `sensor.rawValue` verwenden (numerisch, kein Formatierungsproblem)
- Zusatzlich `sensor.totalDay` fur den Tagesverbrauch speichern

**Kachel-Anzeige (pro Meter):**
- Aktueller Wert mit 2 Nachkommastellen
- Bei Wasser/Gas: Label **"Durchfluss"** hinter dem aktuellen Wert
- Neue Zeile: Tagesverbrauch in kWh (bzw. m3) mit Label **"Gesamt heute"**
- Alle Werte mit `toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })`

### 3. Technische Details

**Edge Function -- neues Sensor-Objekt (Zeilen ~430-444):**

```text
sensors.push({
  ...bisherige Felder...,
  rawValue: stateData?.value ?? null,        // NEU: numerischer Rohwert
  totalDay: mappedStates["totalDay"] ?? null, // NEU: Tagesverbrauch
});
```

Dazu muss `mappedStates` aus dem `stateResults`-Objekt heraus zuganglich gemacht werden. Aktuell wird nur primary/secondary gespeichert -- `totalDay` muss ebenfalls in `stateResults` durchgereicht werden.

**LiveValues.tsx -- State erweitern:**

```text
// Statt Map<string, number> wird Map<string, { value: number; totalDay: number | null }>
const [liveValues, setLiveValues] = useState<Map<string, { value: number; totalDay: number | null }>>(new Map());

// Intervall
const interval = setInterval(fetchLiveValues, 30000); // 30 Sekunden

// Sensor-Wert auslesen (rawValue statt value)
const numVal = typeof sensor.rawValue === "number" ? sensor.rawValue : parseFloat(String(sensor.rawValue));
const totalDay = typeof sensor.totalDay === "number" ? sensor.totalDay : null;
newValues.set(meter.id, { value: numVal, totalDay });
```

**LiveValues.tsx -- Kachel-Rendering:**

```text
// Aktueller Wert
<div className="text-2xl font-bold">
  {formattedValue} {meter.unit}
  {(meter.energy_type === "wasser" || meter.energy_type === "gas") && (
    <span className="text-sm font-normal text-muted-foreground ml-1">Durchfluss</span>
  )}
</div>

// Tagesverbrauch
{totalDay !== null && (
  <div className="text-sm text-muted-foreground">
    {formattedTotalDay} {meter.unit}
    <span className="ml-1">Gesamt heute</span>
  </div>
)}
```

### Zusammenfassung der Dateianderungen

| Datei | Anderung |
|---|---|
| `supabase/functions/loxone-api/index.ts` | `rawValue` und `totalDay` zum Sensor-Objekt hinzufugen; `mappedStates` im stateResults durchreichen |
| `src/pages/LiveValues.tsx` | Intervall auf 30s; `rawValue` statt `value` parsen; `totalDay` anzeigen; Labels "Durchfluss" und "Gesamt heute" |
