## Was wirklich kaputt ist

Der Hook `src/hooks/useChargePointDailyUptime.tsx` lädt die 5‑Minuten‑Snapshots so:

```ts
.select("recorded_at, is_online")
.eq("charge_point_id", ...)
.gte("recorded_at", since)
.order("recorded_at", { ascending: true })
.limit(20000)
```

Bei 7 Tagen × 288 Snapshots/Tag = **2 016 Zeilen** pro Ladepunkt — eigentlich kein Problem. Aber: **PostgREST (die Daten‑API von Supabase) deckelt die Antwort standardmäßig bei 1 000 Zeilen.** Der `.limit(20000)`‑Wunsch im Client wird ignoriert, wenn der Server eine niedrigere Obergrenze hat. Sowohl Lovable‑Cloud als auch eure Hetzner‑Instanz haben diese Deckelung aktiv.

Konsequenz: die ersten 1 000 Zeilen kommen zurück, das sind **aufsteigend** sortiert ungefähr die ältesten ~3,5 Tage. Die jüngsten Tage (Do/Fr/Sa) fehlen komplett → in `buckets` bleibt `total = 0` → der Chart malt für sie den grauen „Keine Daten"‑Balken.

Verifiziert in der Cloud‑DB:


| Tag       | Snapshots | online |
| --------- | --------- | ------ |
| 07.06. So | 288       | 288    |
| 08.06. Mo | 288       | 288    |
| 09.06. Di | 288       | 288    |
| 10.06. Mi | 288       | 288    |
| 11.06. Do | 288       | 288    |
| 12.06. Fr | 288       | 288    |
| 13.06. Sa | 133       | 133    |


Bricht man die Antwort nach ~1 000 Zeilen ab, ist genau ab Mi/Do Schluss — exakt dein Screenshot.

Dass der „Betriebszeit"‑Wert mit 86,73 % trotzdem korrekt erscheint, passt ins Bild: die Stabilitäts‑Berechnung benutzt `count: "exact", head: true` — eine reine Zähl‑Abfrage, die nie Zeilen zieht und deshalb nicht in den 1 000‑Zeilen‑Deckel läuft.

## Warum gleich mehrere UI‑Stellen betroffen sind

Die Karte „Statistiken" auf der Ladepunkt‑Detailseite ist die **einzige** UI‑Stelle, die diesen Hook benutzt — die Tenant‑Übersicht (`ChargingOverviewStats.tsx`) rechnet wie von dir richtig erkannt aus dem aktuellen Live‑Status und ist von dem Datendeckel nicht betroffen. Der „mehrfach gleiche Fehler" ist also derselbe Aufruf, nicht mehrere unabhängige Stellen.

## Vorgeschlagene Lösung

Server‑seitige Aggregation per Datenbankfunktion — analog zur bereits existierenden `public.get_charge_point_uptime_pct`. Damit fließen pro Tag nur **eine** Zeile (Tag, total, online) zurück. Kein Zeilen‑Deckel‑Risiko, weniger Bandbreite, schneller.

### Änderung 1 — neue SQL‑Funktion (Migration)

```sql
CREATE OR REPLACE FUNCTION public.get_charge_point_daily_uptime(
  p_charge_point_id uuid,
  p_days integer DEFAULT 7
)
RETURNS TABLE (day date, total bigint, online bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH days AS (
    SELECT generate_series(
      (CURRENT_DATE AT TIME ZONE 'Europe/Berlin') - (p_days - 1),
      (CURRENT_DATE AT TIME ZONE 'Europe/Berlin'),
      interval '1 day'
    )::date AS day
  )
  SELECT
    d.day,
    COUNT(s.id)::bigint                                 AS total,
    COUNT(s.id) FILTER (WHERE s.is_online)::bigint      AS online
  FROM days d
  LEFT JOIN public.charge_point_uptime_snapshots s
    ON s.charge_point_id = p_charge_point_id
   AND (s.recorded_at AT TIME ZONE 'Europe/Berlin')::date = d.day
  GROUP BY d.day
  ORDER BY d.day;
$$;

GRANT EXECUTE ON FUNCTION public.get_charge_point_daily_uptime(uuid, integer)
  TO authenticated, service_role;
```

- `SECURITY DEFINER` + impliziter `charge_point_id`‑Filter wie bei der bestehenden 30‑Tage‑Funktion — kein RLS‑Bypass für fremde Ladepunkte, weil der Aufrufer die ID kennen muss.
- Falls zusätzliche Absicherung gewünscht: vorab in der Funktion prüfen, ob `auth.uid()` Zugriff auf den Tenant des Ladepunkts hat (per `has_role` oder `get_user_tenant_id`). Sag Bescheid, dann baue ich diesen Check in der Migration mit ein.

### Änderung 2 — Hook umstellen

`src/hooks/useChargePointDailyUptime.tsx` ruft statt `.from(...).select(...)` jetzt `supabase.rpc("get_charge_point_daily_uptime", { p_charge_point_id, p_days: days })` auf und mappt das schon fertig aggregierte Ergebnis 1:1 in `DailyUptime[]`. Keine andere Komponente muss angefasst werden.

## Auswirkungen auf den Live‑Betrieb (Hetzner und Cloud)

- **Keine Verhaltensänderung für Kunden.** Es werden weder Tabellen, RLS noch Cron‑Jobs angefasst. Die Wallboxen laden, der OCPP‑Server, die Abrechnung und alle anderen Charts laufen unverändert weiter.
- **Was sich ändert, ist ausschließlich** der Datenpfad für die Wochen‑/Monats‑/Quartals‑Statistik einer einzelnen Ladepunkt‑Detailseite.
- **Reihenfolge des Rollouts:** zuerst Migration auf Cloud anwenden (geht automatisch über deine Lovable‑Pipeline). Anschließend dieselbe SQL‑Datei in der Hetzner‑Supabase‑Instanz nachziehen — ich liefere dir dafür auf Wunsch eine anfänger‑sichere Schritt‑für‑Schritt‑Anleitung mit fertigem Copy‑Paste‑Block.
- **Rollback** ist trivial: `DROP FUNCTION public.get_charge_point_daily_uptime(uuid, integer);` und den Hook auf die alte Version zurücksetzen.

## Was ich als nächstes tun würde

1. Migration anlegen (eine SQL‑Datei, eine Funktion, ein GRANT).
2. Hook `useChargePointDailyUptime.tsx` auf den RPC‑Aufruf umstellen.
3. Verifizieren: in der Cloud‑Preview den Detail‑Chart für `4016aacc‑…` öffnen, alle 7 Balken müssen farbig sein.
4. Wenn ok → Anleitung für die Hetzner‑Migration nachliefern.

## Frage an dich

Soll ich die Migration zusätzlich um eine harte Tenant‑Prüfung in der Funktion (`has_role(super_admin) OR cp.tenant_id = get_user_tenant_id()`) ergänzen? Aktuell genügt das Wissen der UUID, was im UI ohnehin der Fall ist, aber der Extra‑Riegel kostet nichts.  
  
Antwort: Ja, bitte gleich die harte Tenant-Prüfung mit einbauen.