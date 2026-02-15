
## Standort-Zugriffskontrolle pro Nutzer

### Konzept

Eine neue Zuordnungstabelle `user_location_access` verbindet Nutzer mit den Standorten, die sie sehen duerfen. Admins haben automatisch Zugriff auf alle Standorte und muessen nicht einzeln zugeordnet werden.

```text
+------------------+        +------------------------+        +------------+
|    profiles      |------->| user_location_access   |<-------| locations  |
|  (user_id)       |        | user_id  | location_id |        |   (id)     |
+------------------+        +------------------------+        +------------+
```

### Funktionsweise

- **Admins**: Sehen immer alle Standorte (keine Einschraenkung)
- **Normale Nutzer**: Sehen nur Standorte, die ihnen explizit zugewiesen wurden
- **Zuweisung**: Erfolgt ueber die Benutzerverwaltung (Admin-Bereich) pro Nutzer

---

### 1. Datenbank-Aenderungen

**Neue Tabelle `user_location_access`:**
- `id` (UUID, Primary Key)
- `user_id` (UUID, Referenz auf auth.users)
- `location_id` (UUID, Referenz auf locations)
- `created_at` (Timestamp)
- Unique-Constraint auf (user_id, location_id)

**RLS-Policies:**
- Admins koennen alle Zuordnungen lesen, erstellen und loeschen
- Normale Nutzer koennen nur ihre eigenen Zuordnungen lesen
- Super-Admins haben vollen Zugriff

**Anpassung der `locations`-RLS-Policy:**
- Die bestehende SELECT-Policy "Users can view locations in their tenant" wird ersetzt durch eine Policy, die prueft:
  - Ist der Nutzer Admin? → Alle Standorte des Tenants sichtbar
  - Ist der Nutzer kein Admin? → Nur zugewiesene Standorte sichtbar (via JOIN auf `user_location_access`)

**Hilfsfunktion:**
- `has_location_access(user_id, location_id)` als SECURITY DEFINER Funktion, um rekursive RLS-Probleme zu vermeiden

### 2. Frontend: Standort-Zuweisung in der Benutzerverwaltung

**Neuer Dialog `EditUserLocationsDialog`:**
- Oeffnet sich ueber einen Button in der Benutzer-Tabelle (z.B. MapPin-Icon)
- Zeigt eine Checkliste aller Standorte des Tenants
- Admin kann Standorte per Checkbox an-/abwaehlen
- Aenderungen werden sofort gespeichert
- Wird nur fuer Nicht-Admin-Nutzer angezeigt (Admins haben automatisch Zugriff auf alles)

**Aenderung in `UserManagement.tsx`:**
- Neue Spalte oder Button "Standorte" in der Benutzer-Tabelle
- Oeffnet den `EditUserLocationsDialog`

### 3. Frontend: Standort-Filterung

**Aenderung in `useLocations.tsx`:**
- Keine Code-Aenderung noetig – die RLS-Policy filtert automatisch auf Datenbankebene
- Nutzer sehen nur die ihnen zugewiesenen Standorte in allen Ansichten (Dashboard, Standorte, Karten, etc.)

### 4. Neuer Hook `useUserLocationAccess`

- Laedt die Standort-Zuordnungen eines bestimmten Nutzers
- Bietet Funktionen zum Hinzufuegen/Entfernen von Zuordnungen
- Wird vom `EditUserLocationsDialog` verwendet

---

### Technische Details

**SQL-Migration (Zusammenfassung):**

```
-- Neue Tabelle
CREATE TABLE user_location_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  location_id UUID REFERENCES locations(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, location_id)
);

-- Hilfsfunktion (SECURITY DEFINER)
CREATE FUNCTION has_location_access(_user_id UUID, _location_id UUID)
  ...prueft ob Admin oder Zuordnung existiert...

-- Aktualisierte locations SELECT Policy
  ...Admin sieht alles, andere nur zugewiesene...
```

**Neue Dateien:**
- `src/components/admin/EditUserLocationsDialog.tsx`
- `src/hooks/useUserLocationAccess.tsx`

**Geaenderte Dateien:**
- `src/components/admin/UserManagement.tsx` (neuer Button/Spalte)
- Datenbank: neue Tabelle + angepasste RLS-Policies
