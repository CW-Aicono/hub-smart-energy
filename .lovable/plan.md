## Problem

Beim Abmelden aus dem C-Level Board wird der Logout-Button in `src/components/board/BoardHeader.tsx` (Zeile 217) auf `/auth` ohne `redirect`-Parameter geleitet. `src/pages/Auth.tsx` (Zeile 47–53) nutzt deshalb den Default `/` → Index → Tenant-Dashboard. Das Board wird beim erneuten Login nicht mehr geöffnet — weder im Browser noch in der installierten PWA.

## Lösung (klein und gezielt, nur Frontend)

Zwei Stellen anpassen, damit der Board-Kontext beim Re-Login erhalten bleibt:

### 1. `src/components/board/BoardHeader.tsx`
Logout-Handler so ändern, dass nach `signOut()` mit `redirect=/board` zur Auth-Seite navigiert wird:
```ts
navigate("/auth?redirect=/board");
```

### 2. `src/pages/Auth.tsx` (Fallback für Board-Host / installierte PWA)
Der bestehende Code liest `?redirect=` aus der URL. Zusätzlich als Sicherheitsnetz: Wenn kein `redirect`-Parameter vorhanden ist **und** die App auf der Board-Subdomain läuft (`isBoardHost()` aus `src/lib/hostname.ts`), als Default `/board` statt `/` verwenden. So landet auch ein User, der direkt `/auth` aufruft (z. B. wenn die PWA „kalt" startet), wieder im Board.

```ts
import { isBoardHost } from "@/lib/hostname";
...
const fallback = isBoardHost() ? "/board" : "/";
const safe = redirect && redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : fallback;
```

`BoardHostGuard` greift zwar bereits auf `board.aicono.org` und schickt Nicht-Board-Pfade auf `/board` — der Auth-Fallback ist aber wichtig für die Custom-Domain-PWA und vermeidet das kurze „Flackern" über das Tenant-Dashboard.

## Nicht im Scope
- Keine Änderungen an Auth-Logik, Sessions, Backend, RLS oder anderen Subdomains (Partner/Sales bleiben unverändert).
- Kein Refactor von `useAuth`.

## Verifikation
1. Im Board einloggen → Logout-Button klicken → URL ist `/auth?redirect=/board` → erneut einloggen → landet auf `/board`. ✅
2. Gleicher Test in der installierten Board-PWA (Home-Screen-Icon). ✅
3. Normaler Tenant-Login (über `/auth`) führt weiterhin ins Tenant-Dashboard. ✅
