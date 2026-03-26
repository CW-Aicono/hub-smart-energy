

## Problem Analysis

The **HTTP 404** error when executing an automation occurs because the `commandValue` sent to the Loxone Miniserver is invalid. 

The screenshot shows the automation "Testautomation" with action **"Reset Max Gesamt"**. This value gets passed directly into the Loxone HTTP API URL:

```
/jdev/sps/io/{controlUuid}/Reset Max Gesamt
```

Loxone doesn't recognize this as a valid command path → **404**.

### Root Cause

The `executeAutomation` function in `useLocationAutomations.tsx` uses `action.action_value || action.action_type || "pulse"` as the command. For older automations created before the multi-action builder was added, `action_value` contains free-text descriptions like "Reset Max Gesamt" instead of valid Loxone commands (`pulse`, `On`, `Off`, `toggle`, or numeric values).

Loxone Miniserver Meter controls support resetting via sub-control UUIDs (found in `states` of the control structure), not via text commands on the main control UUID.

### Fix Plan

**1. Update `executeCommand` in `loxone-api/index.ts`** (edge function)
- URL-encode the `commandValue` to handle spaces
- For Meter controls: map special commands like "Reset Max Gesamt" to the correct Loxone sub-control reset approach (`/jdev/sps/io/{resetUuid}/pulse`)
- Alternatively, if the command is not a recognized Loxone primitive, look up the control's `states` in the structure file to find the correct sub-UUID for the reset operation

**2. Update `useLocationAutomations.tsx`** (client-side)
- Sanitize/validate `commandValue` before sending — if it doesn't match known Loxone commands, either:
  - Map it to the correct command format
  - Or fall back to `pulse`

**3. Add "Reset" action types to `AutomationRuleBuilder.tsx`**
- Extend `ACTION_TYPES` with Meter-specific reset options:
  - `{ value: "resetDay", label: "Tageswert zurücksetzen" }`  
  - `{ value: "resetMonth", label: "Monatswert zurücksetzen" }`
  - `{ value: "resetYear", label: "Jahreswert zurücksetzen" }`
  - `{ value: "resetAll", label: "Alle Werte zurücksetzen" }`

**4. Handle reset commands in the edge function**
- When `commandValue` starts with `reset`, fetch the control's structure to find the correct reset sub-control UUID from `states`, then issue `pulse` on that sub-UUID
- This is the proper Loxone API pattern for resetting meter values

### Files to Modify
- `supabase/functions/loxone-api/index.ts` — add reset command mapping logic in `executeCommand` handler
- `src/hooks/useLocationAutomations.tsx` — clean up command value resolution
- `src/components/locations/AutomationRuleBuilder.tsx` — add reset action types (conditionally for Meter controls)

