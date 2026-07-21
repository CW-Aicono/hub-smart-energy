## Problem

Beim Beenden einer Support-Sitzung bleibt der Super-Admin scheinbar im Tenant angemeldet. Ursachen:

1. `SuperAdminImpersonationBar.handleEnd` ruft zwar `supabase.auth.setSession(orig)` auf und navigiert dann mit React-Router — dabei bleiben aber alle bereits gemounteten Tenant-Hooks (Tenant-Context, React-Query-Caches, Realtime-Kanäle) mit den Daten des Support-Users bestehen. Ergebnis: der User sieht weiterhin die Tenant-Sicht.
2. `SuperAdminTenantDetail.handleEndRemoteSupport` (Button „Beenden" direkt in der Tenant-Detailseite im Super-Admin) ruft nur `support-session-end` + `clearImpersonation` — die im Browser aktive Support-User-Session wird **gar nicht** durch die Original-Session ersetzt. Wird die Sitzung von hier beendet, ist der Super-Admin danach noch als Support-User eingeloggt.

## Lösung

Beide End-Pfade vereinheitlichen: Original-Session zurückschreiben und einen **harten** Redirect ins Super-Admin ausführen, damit Caches, Tenant-Context und Realtime-Verbindungen komplett neu aufgebaut werden.

### Änderungen

`**src/lib/supportView.ts**`

- Neue Helper-Funktion `endImpersonationAndReturn(sessionId, tenantId)`:
  1. `supabase.functions.invoke("support-session-end", { body: { session_id } })`
  2. Original-Session lesen; falls vorhanden `supabase.auth.setSession(...)`, sonst `supabase.auth.signOut()` als Fallback.
  3. `clearImpersonation()`
  4. `window.location.replace(tenantId ? \`/super-admin/tenants/{tenantId} : "/super-admin/tenants")` — harter Reload, kein SPA-Navigate.
- Bei Fehler in Schritt 1/2 trotzdem versuchen, die Original-Session zu setzen und einen Toast auszulösen (Aufrufer entscheidet).

`**src/components/SuperAdminImpersonationBar.tsx**`

- `handleEnd` durch Aufruf von `endImpersonationAndReturn` ersetzen. Toast + `setEnding` bleiben.

`**src/pages/SuperAdminTenantDetail.tsx**`

- `handleEndRemoteSupport` ebenfalls über `endImpersonationAndReturn` laufen lassen. Damit funktioniert der Beenden-Button auch, wenn er innerhalb der Tenant-Detailseite geklickt wird, während der Browser noch als Support-User eingeloggt ist.
- `queryClient.invalidateQueries` entfällt (hard reload macht es überflüssig).

`**src/components/SupportSessionBanner.tsx**` (nur Tenant-User-Pfad, kein Super-Admin)

- Unverändert — dieser Banner wird für Super-Admins nicht angezeigt (`if (isSuperAdmin) return null`).

## Warum harter Reload

- Der Tenant-Context, `useTenant`, `useSuperAdmin`, alle React-Query-Caches und Supabase-Realtime-Kanäle wurden mit `auth.uid()` des Support-Users initialisiert. Ein `setSession` allein tauscht nur die JWTs; die gecachten Daten und offenen Subscriptions bleiben. Ein `window.location.replace` garantiert einen kompletten Neustart mit der Super-Admin-Session — analog zum Login-Flow.

## Verifikation

1. Als Super-Admin Support-Sitzung starten → in Tenant-Sicht wechseln.
2. Über die rote Impersonation-Leiste „Remote-Support beenden" klicken → landet auf `/super-admin/tenants/:id`, Sidebar zeigt Super-Admin, kein Tenant-Kontext mehr sichtbar.
3. Erneut Support-Sitzung starten, dann in der Tenant-Detailseite (nicht in der Bar) „Beenden" klicken → gleiches Ergebnis.