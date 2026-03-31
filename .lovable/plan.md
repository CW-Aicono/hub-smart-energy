

## Problem Analysis

Three issues prevent Shelly data from appearing in the Energiefluss (Sankey) and Energieverbrauch (EnergyChart) widgets:

### 1. Wrong Edge Function in `useEnergyData`
`useEnergyData` calls `useLoxoneSensorsMulti(integrationIds)` **without integration types**, so `fetchSensors()` defaults to `"loxone-api"` for all integrations — Shelly meters get no sensor response.

### 2. Shelly API returns no period totals
The `shelly-api` Edge Function sets `totalDay: null`, `totalWeek: null`, `totalMonth: null`, `totalYear: null` for every sensor. Unlike Loxone (which provides aggregated totals from its Miniserver statistics), the Shelly Cloud API does not expose pre-computed consumption totals. The Sankey widget relies on these `livePeriodTotals` for its flow visualization.

### 3. No `meter_power_readings` in DB for Shelly
The EnergyChart day view queries `get_power_readings_5min` (which reads from `meter_power_readings` / `meter_power_readings_5min`). Without a periodic sync job writing Shelly power values to the database, these tables are empty for Shelly meters.

---

## Solution (3 parts)

### Part A — Fix `useEnergyData` to resolve integration types dynamically

**File: `src/hooks/useEnergyData.tsx`**

- Fetch `location_integrations` joined with `integrations(type)` for the collected integration IDs
- Pass the resolved types array into `useLoxoneSensorsMulti(integrationIds, integrationTypes)`
- This ensures Shelly meters call `shelly-api` instead of `loxone-api`

### Part B — Use live gateway power as fallback for period totals

Since Shelly cannot provide `totalDay`/`totalMonth`, we integrate the existing `useGatewayLivePower` data as a real-time fallback. When a sensor's `totalDay` is null, the current live power value is still surfaced to the Sankey widget (showing instantaneous flow rather than nothing).

**File: `src/hooks/useEnergyData.tsx`**
- Import and use `useGatewayLivePower` for meters where sensor period totals are unavailable
- For the Sankey "Leistung" (power) view: use the live gateway value as current power
- For "Kosten" view with period aggregation: acknowledge limitation (no historical totals without DB data)

### Part C — Write Shelly power readings to DB via periodic sync

**New Edge Function: `supabase/functions/shelly-periodic-sync/index.ts`**
- Runs on a schedule (e.g., every 5 minutes via cron or external trigger)
- For each Shelly `location_integration`, calls `shelly-api` with `getSensors`
- Writes power values into `meter_power_readings` for each mapped meter
- This populates the DB so `get_power_readings_5min`, `meter_period_totals`, and the EnergyChart all work natively

The function follows the existing pattern of `gateway-periodic-sync` / `loxone-periodic-sync`.

---

## Implementation Order

1. **Part A** — Immediate fix: dynamic type resolution in `useEnergyData` (1 file change)
2. **Part B** — Live power fallback in `useEnergyData` for Sankey instantaneous view (same file)
3. **Part C** — New `shelly-periodic-sync` Edge Function for DB persistence (new file, follows existing `loxone-periodic-sync` pattern)

### Technical Details

**Part A change in `useEnergyData.tsx`:**
```text
- Add a useQuery to fetch integration types for integrationIds
- Build integrationTypes array matching integrationIds order
- Pass to useLoxoneSensorsMulti(integrationIds, integrationTypes)
```

**Part C `shelly-periodic-sync` logic:**
```text
1. Query all location_integrations where integration.type = 'shelly'
2. For each, call shelly-api getSensors
3. For each meter linked to that integration (via sensor_uuid match):
   - Extract power value (W) from sensor
   - INSERT into meter_power_readings (meter_id, tenant_id, energy_type, power_value, recorded_at)
4. Return summary of written readings
```

This ensures the EnergyChart day view and all DB-based aggregation (daily totals, 5min compaction) work for Shelly meters going forward.

