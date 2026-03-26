
Ziel: Den Grundriss-Upload stabil beheben (nicht nur Workaround), inkl. sauberer Ursachenbehebung auf Datenbank-/RLS-Ebene.

1) Tiefenanalyse-Ergebnis (Root Cause)
- Der Fehler ist serverseitig/RLS, nicht im Frontend-Upload-Code:
  - Console: `new row violates row-level security policy`
  - Sowohl XHR-Upload als auch SDK-Fallback schlagen identisch fehl.
- Die aktuell aktiven Storage-Policies für `floor-plans` sind logisch kaputt:
  - In `floor_plans_insert` (und analog select/update/delete) wird intern effektiv auf `storage.foldername(l.name)` geprüft statt auf den Objektpfad `storage.objects.name`.
  - Ursache: In der Policy wurde `storage.foldername(name)` innerhalb einer Subquery mit Tabelle `locations l` verwendet; dadurch wird `name` als `l.name` gebunden (Shadowing).
  - Ergebnis: Der Vergleich mit `location_id` ist fast immer false → Upload blockiert.
- Der letzte Migrationsschritt (Drop alter Admin-Policies) hat den Fehler sichtbar gemacht:
  - Früher gab es noch permissive Alt-Policies als „Rettungsnetz“.
  - Nach deren Entfernung bleibt nur die defekte Policy → kompletter Upload-Ausfall.

2) Umsetzung (Migration-Fix)
- Neue Migration erstellen, die die fehlerhaften Policies für `floor-plans` explizit droppt und korrekt neu anlegt.
- Neue Policy-Logik so schreiben, dass der Dateipfad außerhalb der Subquery ausgewertet wird (kein Namenskonflikt möglich), z. B.:
  - `split_part(name, '/', 1)` oder `(storage.foldername(name))[1]` nur außerhalb der Subquery
  - Vergleich gegen erlaubte `location_id`s der User-Tenant-Zugehörigkeit.
- Betroffene Policies:
  - `floor_plans_select`
  - `floor_plans_insert`
  - `floor_plans_update`
  - `floor_plans_delete`

3) Systematische Härtung (gleich mit beheben)
- Dieselbe Shadowing-Problematik ist auch bei weiteren Storage-Policies sichtbar (z. B. `floor_3d_models_*`, `meter_photos_*`).
- Ich plane, in derselben Migration auch diese Policies auf die gleiche robuste Formel umzustellen, damit nicht der nächste Upload-Fehler unmittelbar folgt.
- Zusätzlich prüfe ich überlappende Alt-Policies (z. B. sehr permissive 3D-Policies) und bereinige sie, damit Zugriff konsistent tenant-/location-basiert bleibt.

4) Frontend/Hook-Anpassungen (minimal)
- `useFloors.tsx` Upload-Logik bleibt grundsätzlich erhalten (Progress + SDK-Fallback ist okay).
- Optional: Fehlertext bei RLS-Fehlern präzisieren (z. B. „Keine Berechtigung für diesen Speicherpfad“), damit künftige Diagnosen schneller sind.

5) Validierung nach Fix
- DB-Validierung:
  - `pg_policies` prüfen: keine Referenzen mehr wie `storage.foldername(l.name)` / `storage.foldername(m.name)`.
- E2E-Tests im UI:
  - Edit Floor: PNG/PDF hochladen → speichern erfolgreich.
  - Add Floor mit direktem Grundriss-Upload → erfolgreich.
  - Optional: 3D-Upload (GLB/OBJ+MTL) weiterhin erfolgreich.
- Sicherheitscheck:
  - Upload in fremde Location bleibt verboten (RLS greift korrekt).

Technische Details (SQL-Ansatz, gekürzt)
- Muster für INSERT:
  - `bucket_id = 'floor-plans'`
  - `AND split_part(name, '/', 1) IN (SELECT l.id::text FROM public.locations l JOIN public.profiles p ON p.tenant_id = l.tenant_id WHERE p.user_id = auth.uid())`
- Analog für SELECT/UPDATE/DELETE mit `USING (...)`.

Erwartetes Ergebnis
- Grundriss-Upload funktioniert wieder zuverlässig.
- Kein Rückfall auf alte, zu breite Admin-Policies nötig.
- Storage-RLS ist zugleich robuster und konsistenter über verwandte Buckets.
