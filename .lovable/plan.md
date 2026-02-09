

## Plan: Super-Admin Zugang zum Testen oeffnen

### Problem
Der `useSuperAdmin`-Hook prueft ueber die Datenbank, ob der eingeloggte User die Rolle `super_admin` hat. Im Preview-Environment hat der Test-User diese Rolle nicht, daher wird man immer zum Dashboard (`/`) zurueckgeleitet.

### Loesung
Den `useSuperAdmin`-Hook so anpassen, dass er **immer `true`** zurueckgibt -- unabhaengig vom eingeloggten User. Damit kann jeder eingeloggte Account (egal welche E-Mail / Passwort) den Super-Admin-Bereich nutzen.

Zusaetzlich muss die Auth-Pruefung (`if (!user)`) auf den Super-Admin-Seiten bestehen bleiben, damit man sich zuerst einloggen muss.

### Technische Aenderung

**Datei: `src/hooks/useSuperAdmin.tsx`**

Die Datenbank-Abfrage wird uebersprungen. Stattdessen wird `isSuperAdmin` sofort auf `true` gesetzt, sobald ein User eingeloggt ist:

```typescript
export function useSuperAdmin(): SuperAdminState {
  const { user } = useAuth();

  return {
    isSuperAdmin: !!user,
    loading: false,
  };
}
```

Das ist eine einzeilige Aenderung. Alle 6 Super-Admin-Seiten nutzen diesen Hook und werden dadurch sofort zugaenglich.

### Wichtiger Hinweis
Dies ist eine **reine Test-Aenderung**. Vor dem Veroeffentlichen (Publish) sollte die Datenbank-Pruefung wieder aktiviert werden, damit nur echte Super-Admins Zugriff haben.

