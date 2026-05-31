## Fehleranalyse

Im Deploy-Log sind zwei Punkte sichtbar:

1. **Eigentlicher Fehler** (Zeile aus dem Log):
   ```
   ERROR: relation "public.charging_invoice_settings" does not exist
   CONTEXT: ... CREATE POLICY "Super admins can view all charging_invoice_settings" ...
   ```
   Die neue Migration `20260531091839_..._.sql` legt in einer Schleife `super_admin`-SELECT-Policies für ~50 Tabellen an. Auf der prod-Datenbank existiert die Tabelle `charging_invoice_settings` (und vermutlich noch ein paar weitere) aber nicht — sie ist nur in der Lovable-Cloud-DB vorhanden. `DROP POLICY IF EXISTS` toleriert die fehlende Relation noch (NOTICE), aber `CREATE POLICY` bricht hart ab.

2. **Folgefehler im Auto-Heal**: Das Script versucht daraufhin, die fehlende Tabelle über die früheste CREATE-Migration zu heilen und greift dabei `20260209204836_..._.sql`, die u. a. `CREATE TABLE ... meters` ohne `IF NOT EXISTS` enthält → `relation "meters" already exists`. Auto-Heal scheitert, Rollback wird sauber ausgeführt — prod läuft unverändert weiter.

Der zweite Punkt ist nur ein Symptom des ersten. Sobald die Schleifen-Migration die fehlenden Tabellen überspringt, läuft der Deploy durch.

## Plan

**Schritt 1 — Migration idempotent gegen fehlende Tabellen machen**

Datei `supabase/migrations/20260531091839_3c981d36-5ce9-453f-8ada-78d710a0b2d0.sql` umbauen, sodass im `DO`-Block vor jedem `CREATE POLICY` geprüft wird, ob die Tabelle existiert. Tabellen, die nicht existieren, werden mit einem `RAISE NOTICE` übersprungen.

Pseudocode der Änderung (Detail in der Umsetzung):
```sql
FOREACH t IN ARRAY tables LOOP
  IF to_regclass('public.' || t) IS NULL THEN
    RAISE NOTICE 'Skip %: table does not exist on this DB', t;
    CONTINUE;
  END IF;
  EXECUTE format('DROP POLICY IF EXISTS "Super admins can view all %1$s" ON public.%1$I;', t);
  EXECUTE format('CREATE POLICY "Super admins can view all %1$s" ON public.%1$I FOR SELECT USING (has_role(auth.uid(), ''super_admin''::app_role));', t);
END LOOP;
```

Damit:
- Cloud-DB (alle Tabellen vorhanden) → Policies werden überall gesetzt wie bisher.
- Prod-DB (einige Tabellen fehlen) → fehlende Tabellen werden mit Notice übersprungen, vorhandene bekommen die Policy.

**Schritt 2 — Erneut deployen**

Nach dem Commit auf staging → "Deploy to Production" mit `LIVE` neu starten. Der Deploy sollte jetzt durchlaufen.

**Schritt 3 — Optional: fehlende Tabellen separat sauber nachziehen**

Sobald der Deploy grün ist, in einem nächsten Schritt prüfen, welche der Tabellen aus der Liste (z. B. `charging_invoice_settings`) auf prod tatsächlich fehlen. Falls einzelne Tabellen für die Live-Funktionalität nötig sind, dafür eine eigene, klar benannte Migration erzeugen (`CREATE TABLE IF NOT EXISTS …` + GRANTs + RLS). Das ist **nicht** Teil dieses Fixes — hier geht es nur darum, den Deploy wieder grün zu bekommen, ohne Datenmodell-Änderungen auf prod zu erzwingen.

## Was NICHT geändert wird

- Keine Anpassung an `scripts/apply-migrations.sh` / Auto-Heal-Logik. Der Auto-Heal-Fall war nur Folgeschaden — wenn Schritt 1 greift, wird er gar nicht erst getriggert.
- Keine Anpassung an früheren Migrations (z. B. `20260209204836_...`). Die laufen auf prod längst sauber, sie sind nur durch den fehlerhaften Auto-Heal-Trigger erneut versucht worden.
- Keine Änderung an Code/Hooks/UI — der Bugfix bleibt rein auf der Migrations-Datei.

## Risiko

Sehr gering: die Änderung macht die Migration strikt defensiver. Auf der Lovable-Cloud-DB ist die Migration bereits sauber appliziert; ein erneuter Lauf der geänderten Datei würde dort wegen `_deploy_migrations`-Tracking gar nicht erst stattfinden. Auf prod wird die Migration erstmalig laufen — diesmal ohne Abbruch.
