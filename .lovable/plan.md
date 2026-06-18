## 4 Bugfixes (Live Hetzner)

### Bug 1 — Logo-Upload "Bucket not found"
**Ursache**: Storage-Bucket `charging-invoice-logos` fehlt auf Hetzner-Supabase. Auf Lovable-Cloud existiert er, weil die Migration dort gelaufen ist.

**Fix**: Code prüfen, welcher Bucket-Name verwendet wird (z. B. `charging-invoice-logos`). Sicherstellen, dass eine Migration den Bucket idempotent anlegt (`INSERT ... ON CONFLICT DO NOTHING` in `storage.buckets`) plus Storage-RLS-Policies. So legt jede frische Supabase-Instanz (auch Hetzner) den Bucket beim nächsten Migrations-Lauf automatisch an.

### Bug 2 — Nutzer kann nicht in andere Gruppe verschoben werden
**Ursache** (Code, `BillingGroupsTab.tsx` + `useChargingBillingGroups.tsx`):
- Die Sperr-Logik im Dialog liest aus React-Query-Cache `charging-billing-group-members-all`.
- `setMembers.onSuccess` invalidiert nur `charging-billing-group-members` (für die gerade bearbeitete Gruppe) und `charging-billing-groups`, **nicht** `charging-billing-group-members-all`.
- Beim Entfernen aus Gruppe A bleibt der Eintrag im "all"-Cache. Beim Öffnen von Gruppe B ist der User dann fälschlich "in anderer Gruppe".
- Beim erneuten Hinzufügen in Gruppe A wird er nicht gesperrt, weil `m.group_id === group.id` ausgefiltert wird.

**Fix**: In `setMembers.onSuccess` zusätzlich invalidieren:
```ts
qc.invalidateQueries({ queryKey: ["charging-billing-group-members-all"] });
```
Und (defensiv) `staleTime: 0` für die `-all`-Query, damit beim Öffnen jedes Dialogs frisch geladen wird.

### Bug 3 — "Could not find the table 'public.charging_invoice_settings' in the schema cache"
**Ursache**: Tabelle existiert auf Hetzner-Supabase noch nicht (Migration nicht eingespielt) **oder** PostgREST-Schema-Cache ist veraltet. Lovable-Cloud kennt die Tabelle, Hetzner nicht.

**Fix**:
- Prüfen, ob die Migration für `charging_invoice_settings` (inkl. GRANTs + RLS) im Repo unter `supabase/migrations/` vorhanden ist. Wenn nein: anlegen. Wenn ja: nichts im Code zu tun — der Hetzner-Programmierer muss die Migration einspielen und PostgREST neu starten (`NOTIFY pgrst, 'reload schema'`).

### Bug 4 — Abmelden aus Rechnungsdesigner zeigt erst "Benutzer", dann erst Login
**Ursache** (`useAuth.tsx` + `DashboardSidebar.tsx`):
- `signOut()` ruft `supabase.auth.signOut()` und setzt `user=null`.
- Es gibt aber **keine explizite Navigation** nach `/login`. Bis die Route-Guards (AppLayout/TenantStatusGuard) reagieren, rendert die Sidebar weiter mit altem React-Query-Cache → `isAdmin` wird zu `false` → Label springt auf "Benutzer".
- Erst der zweite Klick triggert eine Route-Änderung, die den Guard zur Redirect-Entscheidung zwingt.

**Fix**:
- In `signOut()` nach `supabase.auth.signOut()` zusätzlich:
  1. `queryClient.clear()` (oder gezielt `invalidateQueries` für `user-roles`, `tenant`, etc.) damit kein stale Admin/Role-State angezeigt wird.
  2. `window.location.href = "/login"` (Hard-Navigation), damit alle Provider/State frisch starten.
  Hard-Reload ist hier sauberer als `navigate()`, weil sonst React-Query / Tenant-Context den alten User noch kurz weiter halten.

## Reihenfolge
1. Bug 2 (reiner Frontend-Fix, sofort wirksam)
2. Bug 4 (reiner Frontend-Fix, sofort wirksam)
3. Bug 1 (Migration für Storage-Bucket — wirkt nach Migrations-Run auf Hetzner)
4. Bug 3 (Migration prüfen/anlegen — wirkt nach Migrations-Run auf Hetzner)

## Hinweis Hetzner
Nach Implementierung muss der Hetzner-Programmierer die neuen Migrationen einspielen (Bug 1 + ggf. Bug 3). Bug 2 + 4 sind reine Frontend-Fixes und greifen sofort nach Deploy.
