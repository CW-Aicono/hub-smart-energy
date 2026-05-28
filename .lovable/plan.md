# Verwaltungslogik Energy Sharing — Bearbeiten ergänzen

## Befund (Ist-Zustand)

Aktuell gibt es in `src/pages/EnergySharing.tsx` und `src/hooks/useEnergyCommunities.tsx` für jeden Bereich nur **Anlegen + Löschen**, aber keinen **Bearbeiten-Button**. Im Detail:

| Bereich      | Anlegen | Bearbeiten | Löschen |
|--------------|---------|------------|---------|
| Community    | ✓ (Wizard) | ✗ (Hook da, UI fehlt) | ✓ |
| Mitglieder   | ✓ | ✗ (Hook da, UI fehlt) | ✓ |
| Anlagen      | ✓ | ✗ (Hook + UI fehlen)  | ✓ |
| Tarife       | ✓ | ✗ (Hook + UI fehlen)  | ✓ |

## Umsetzung

### 1. Hook `useEnergyCommunities.tsx`
- `useCommunityAssets`: `updateAsset` Mutation ergänzen (Felder: `asset_type`, `capacity_kw`, `share_model`).
- `useCommunityTariffs`: `updateTariff` Mutation ergänzen (Felder: `valid_from`, `valid_to`, `price_ct_kwh`, `feed_in_ct_kwh`).

### 2. UI in `src/pages/EnergySharing.tsx`

**Community-Header (Pill-Zeile mit Community-Namen):**
- Neben jedem Pill (oder im Überblick-Tab) ein „Bearbeiten"-Button (Stift-Icon). Öffnet Dialog mit Feldern: `name`, `status` (draft/active/paused/closed). Speichert via `updateCommunity`.

**MembersTab:**
- In jeder Tabellenzeile ein Stift-Button neben dem Vertrag-/Löschen-Button.
- Wiederverwendung des bestehenden Dialogs als „Neu/Bearbeiten" Modus (gleiche Felder, prefill bei Edit). Speichern via `createMember` oder `updateMember`.

**AssetsTab:**
- Stift-Button in jeder Zeile.
- Dialog im „Neu/Bearbeiten" Modus, prefill bei Edit. Speichern via `createAsset` oder `updateAsset`.

**TariffTab:**
- Stift-Button in jeder Zeile.
- Dialog im „Neu/Bearbeiten" Modus, prefill bei Edit. Speichern via `createTariff` oder `updateTariff`.

### 3. Muster
Pro Bereich ein `editing: T | null` State plus existierender `open` State. Beim Klick auf Stift: `setEditing(row); setOpen(true);` mit prefill in `useEffect`. Beim Submit: wenn `editing` → `updateXxx.mutateAsync({id, ...form})`, sonst `createXxx.mutateAsync(form)`.

## Out of scope
- Keine Schema-Änderungen, keine neuen RLS-Policies (vorhandene UPDATE-Policies existieren bereits, da `updateCommunity`/`updateMember` schon funktionieren).
- Marktplatz-Tab, Verträge, Daten-Import etc. werden nicht angefasst.

## Geschätzter Aufwand
~1 Datei (`EnergySharing.tsx`) und 1 Hook-Datei (`useEnergyCommunities.tsx`) editieren. Keine Migration nötig.
