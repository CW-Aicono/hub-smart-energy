

## Problem

The "Aktuelle Werte" (Live Values) page in `src/pages/LiveValues.tsx` hardcodes `"loxone-api"` when fetching sensor data (line 194). Shelly meters (and any other non-Loxone integration) never get values because the wrong Edge Function is called. The Shelly API returns an error or no matching sensors, so all Shelly meters show "Kein Wert".

## Root Cause

```typescript
// Line 194 — hardcoded to loxone-api for ALL integrations
const { data, error } = await supabase.functions.invoke("loxone-api", {
  body: { locationIntegrationId: integrationId, action: "getSensors" },
});
```

## Solution

Resolve the correct Edge Function per integration using `getEdgeFunctionName()` from the gateway registry — the same pattern already applied in `FloorPlanDialog.tsx`.

### Changes in `src/pages/LiveValues.tsx`

1. **Import** `getEdgeFunctionName` from `@/lib/gatewayRegistry`
2. **Look up integration type** before invoking the Edge Function — query `location_integrations` joined with `integrations` to get the `type` field for each integration ID
3. **Replace hardcoded `"loxone-api"`** with dynamic resolution:
   ```typescript
   const edgeFunction = getEdgeFunctionName(integrationType || "");
   const { data, error } = await supabase.functions.invoke(edgeFunction, {
     body: { locationIntegrationId: integrationId, action: "getSensors" },
   });
   ```

### Implementation Detail

- In `fetchLiveValues`, before the integration loop, fetch all relevant `location_integrations` with their `integration.type` in one query
- Build a `Map<integrationId, integrationType>` for O(1) lookup
- Use this map inside the loop to resolve the correct edge function per integration

This is the same fix previously applied to `FloorPlanDialog.tsx` and consistent with how `useLoxoneSensors.ts` already supports dynamic edge function resolution.

