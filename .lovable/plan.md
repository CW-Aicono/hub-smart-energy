

## Fehleranalyse: Einladungs- und Passwort-vergessen-Flow

### Kernproblem

**Der Einladungslink loggt den User ein, ohne dass ein Passwort vergeben wurde.**

Der Flow ist:
1. `/accept-invite?t=...` → User klickt Button → Edge Function gibt `actionLink` (Supabase Recovery-URL) zurück
2. `window.location.href = actionLink` → Supabase tauscht den Recovery-Token automatisch aus und erstellt eine **vollständige Session**
3. Redirect zu `/set-password` mit Token im Hash → **aber**: Supabase hat den User bereits eingeloggt
4. `onAuthStateChange` feuert `SIGNED_IN` → `useAuth` setzt `user` → App-Routing sieht authentifizierten User
5. **Race Condition**: Wenn der User auf `/` navigiert (oder die App ihn dorthin leitet), wird er direkt ins Dashboard weitergeleitet, obwohl er nie ein Passwort gesetzt hat

Das `/set-password`-Formular zeigt zwar an, **aber der User ist bereits vollständig eingeloggt** und kann einfach zu `/` navigieren – oder die App leitet ihn automatisch weiter.

### Zweites Problem: Passwort-Vergessen-Redirect

In `Auth.tsx` Zeile 64 wird `redirectTo: window.location.origin + '/profile'` verwendet. Das leitet nach dem Recovery-Token-Austausch zum Profil weiter, **nicht zu einer Passwort-Setzen-Seite**. Der User wird eingeloggt und kann das Passwort nur manuell im Profil ändern – es gibt keinen erzwungenen Passwort-Setzen-Schritt.

---

## Geplante Fixes

### 1. SetPassword: Passwort-Pflicht erzwingen

**Datei:** `src/pages/SetPassword.tsx`

- **Vor** dem Rendern des Passwort-Formulars prüfen, ob die Session vom Typ `PASSWORD_RECOVERY` ist
- **Navigation blockieren**: Solange kein Passwort gesetzt wurde, darf der User nicht weg navigieren
- Nach erfolgreichem Passwort-Setzen erst dann zum Dashboard weiterleiten

### 2. Auth.tsx: Passwort-Vergessen auf /set-password umleiten

**Datei:** `src/pages/Auth.tsx`

- `redirectTo` von `/profile` auf `/set-password` ändern, damit der User nach dem Klick auf den Reset-Link zum Passwort-Formular gelangt statt direkt ins Profil

### 3. Index.tsx: Recovery-Session erkennen und umleiten

**Datei:** `src/pages/Index.tsx`

- Beim Laden prüfen, ob die aktuelle Session eine Recovery-Session ist (Hash enthält `type=recovery`)
- Falls ja, sofort nach `/set-password` umleiten statt das Dashboard zu laden
- Dies verhindert, dass ein User mit Recovery-Token direkt ins Dashboard gelangt

### 4. App.tsx: Recovery-Hash global abfangen

**Datei:** `src/App.tsx`

- Globaler Check am App-Root: Wenn die URL einen Recovery-Hash enthält (`type=recovery` im Fragment), sofort zu `/set-password` navigieren
- Dies fängt alle Einstiegspunkte ab, nicht nur `/`

### 5. AcceptInvite: Kein direkter actionLink-Redirect mehr

**Datei:** `src/pages/AcceptInvite.tsx`

- Statt `window.location.href = data.actionLink` (was den Supabase-Token direkt austauscht und den User einloggt), den `actionLink` als State speichern und in einem versteckten iframe/fetch den Token austauschen, **oder** besser: den actionLink direkt an `/set-password` weiterleiten, damit der Token-Austausch dort kontrolliert passiert

---

## Zusammenfassung der Änderungen

| Datei | Änderung |
|-------|----------|
| `src/App.tsx` | Globaler Recovery-Hash-Guard → redirect zu `/set-password` |
| `src/pages/Auth.tsx` | `redirectTo` von `/profile` auf `/set-password` ändern |
| `src/pages/SetPassword.tsx` | Recovery-Session erzwingen, Navigation blockieren bis PW gesetzt |
| `src/pages/Index.tsx` | Recovery-Session erkennen → redirect zu `/set-password` |
| `src/pages/AcceptInvite.tsx` | actionLink-Handling absichern |

