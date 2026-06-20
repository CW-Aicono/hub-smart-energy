# Plan: RLS-Last auf Hot-Tabellen reduzieren

## Kurzfassung deiner Frage

> "Können wir die Abfrage bauen, ohne dass RLS-Policies getriggert werden?"

**Kurze Antwort: Ja, aber das ist hier nicht der richtige Hebel.**

Ich habe nachgesehen, woher die teuren Queries wirklich kommen:


| Query                                       | Aufrufe                    | Pfad             | RLS aktiv? |
| ------------------------------------------- | -------------------------- | ---------------- | ---------- |
| INSERT `meter_power_readings` (5,1 Mio)     | Edge `gateway-ingest`      | **service_role** | **Nein**   |
| UPDATE `location_integrations` (2,3 Mio)    | Edge `gateway-ingest` etc. | **service_role** | **Nein**   |
| SELECT `meter_power_readings` (167k, ⌀52ms) | Browser/PostgREST          | User-JWT         | **Ja**     |
| SELECT `integration_errors` (92k, ⌀90ms)    | Browser/PostgREST          | User-JWT         | **Ja**     |


Die **Schreiblast** (das wirkliche IO-Monster) läuft schon heute mit `SERVICE_ROLE_KEY` durch und umgeht RLS komplett. Daran ändert ein RLS-Bypass nichts.

Die **Leselast** (SELECTs) geht direkt vom React-Client über PostgREST mit dem User-JWT — **hier feuert RLS pro Zeile**. Und die aktuellen Policies sind teuer:

```
meter_power_readings:
  USING: tenant_id = get_user_tenant_id()            -- SELECT auf profiles
  USING: partner_has_tenant_access(auth.uid(), ...)  -- JOIN partner_members + tenants
```

Bei einem Chart-Query mit ~10.000 Zeilen werden diese Subselects potenziell pro Zeile evaluiert. Das erklärt die ⌀52 ms.

## Zwei Wege, die Last loszuwerden

### Weg A (empfohlen, klein, sicher): RLS-Policies cachen lassen

Statt RLS zu umgehen, zwingen wir Postgres, die Tenant-Prüfung **einmal pro Query** statt pro Zeile auszuführen. Trick: die Helper-Funktion in ein `(SELECT …)` einwickeln. Das ist ein offiziell von Supabase empfohlenes Muster und wirkt sofort.

Vorher:

```sql
USING (tenant_id = get_user_tenant_id())
```

Nachher:

```sql
USING (tenant_id = (SELECT public.get_user_tenant_id()))
```

Gleiche Änderung für `partner_has_tenant_access`. Effekt typisch: Faktor 10–50 schneller bei großen Lesequeries, weil aus N Funktionsaufrufen ein InitPlan-Cache wird.

**Geplante Tabellen für diese Umstellung** (die Heavy-Hitter aus den Slow-Queries):

- `meter_power_readings`
- `meter_power_readings_5min`
- `meter_period_totals`
- `integration_errors`
- `location_integrations`
- `meters`

Keine Code-Änderungen im Frontend nötig, keine Sicherheitsverschlechterung.

### Weg B (groß, nur falls A nicht reicht): Edge-Function als Daten-Proxy

Chart-Reads über eine neue Edge-Function `chart-data` laufen lassen:

1. Edge prüft einmalig den User-JWT (`getClaims`) und ermittelt `tenant_id`.
2. Edge benutzt `SERVICE_ROLE_KEY` → RLS umgangen.
3. Edge filtert die Query manuell auf diese `tenant_id`.

Kosten: jeder betroffene Hook (`useMeterPowerReadings`, `useIntegrationErrors`, Dashboard-Charts, …) muss umgestellt werden. Risiko: jede vergessene Stelle ist ein Tenant-Leak. Würde ich erst angehen, wenn Weg A messbar nicht ausreicht.

## Vorschlag konkret

1. **Phase 1 (jetzt, 1 Migration, ~2 Min IO):** Policies auf den 6 Tabellen oben auf das `(SELECT …)`-Muster umstellen. Keine Frontend-Änderung.
2. **Phase 2 (Messung, ~30 Min):** IO-Budget und `pg_stat_statements` für `meter_power_readings` SELECT erneut ansehen. Erwartung: `mean_ms` fällt von 52 ms auf <10 ms, Disk-Reads brechen ein.
3. **Phase 3 (nur falls nötig):** Weg B für die Top-2-Hooks.

## Was ich **nicht** tue

- Schreibpfad anfassen (läuft schon ohne RLS).
- Cron-Frequenzen senken (separater Vorschlag, hier nicht vermischt).
- Vorhandene Indizes verändern — Index `idx_meter_power_readings_meter_time` ist passend.

## Freigabe nötig

Bitte sag mir, ob ich **Phase 1** umsetzen soll (eine einzige Migration, reversibel). Danach messen wir, bevor wir über Phase 2/3 reden.  
  
Antwort: ok, jetzt Phase 1 umsetzen