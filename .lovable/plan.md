# Stale-Schwelle: Key-Fix + Migration

## Was aktuell schiefläuft

- Zwei verschiedene Keys für dieselbe Einstellung:
  - Panel/Frontend schreibt+liest `public.loxone_ws_stale_threshold_seconds`
  - Edge Function `gateway-worker-status` liest nur `loxone_ws_stale_threshold_seconds` (ohne Präfix)
- Edge Function cappt zusätzlich auf 30–3600s (max. 1h), obwohl das Panel bis 7200s erlaubt.
- Hetzner-Live-Supabase hat den Key nie gesetzt → Anzeige fällt auf Default 300s zurück.

## Änderungen

### 1. Migration (läuft in jeder Umgebung — auch Hetzner beim Deploy)

Idempotent beide Keys auf 900 setzen, falls sie fehlen oder auf 300 (Default) stehen:

```sql
INSERT INTO public.system_settings (key, value)
VALUES
  ('loxone_ws_stale_threshold_seconds', '900'),
  ('public.loxone_ws_stale_threshold_seconds', '900')
ON CONFLICT (key) DO NOTHING;
```

Der `DO NOTHING` schützt manuell gesetzte Werte. Wer bewusst 600 o.ä. gesetzt hat, behält seinen Wert.

### 2. Edge Function `gateway-worker-status`

- Liest **beide** Keys, bevorzugt den unpräfixierten, fällt sonst auf den präfixierten zurück.
- Cap von 3600 auf **7200** erhöhen (Deckungsgleich mit Panel-Input-Limit).

### 3. Frontend `WorkerControlsPanel` + `LoxoneWsStatus`

- Beim Speichern **beide** Keys via Upsert aktualisieren (Backwards-Compat, bis alle Deployments neu laufen).
- Beim Lesen unpräfixierten Key bevorzugen, präfixierten als Fallback.

### 4. Karte `GatewayWorkerStatusCard`

- Kein Codefix nötig — sie zeigt `data.stale_threshold_seconds` vom Server. Nach Fix in (2) zeigt Hetzner nach Redeploy 900s.

## Antworten auf die Diagnose-Fragen

- **300s auf Hetzner**: Key fehlte in dortiger `system_settings` → Default. Migration (1) behebt das.
- **Code identisch, Anzeige unterschiedlich**: Ja, Code ist identisch — Unterschied lag ausschließlich in DB-Daten.
- **Worker-Versionen unterschiedlich möglich**: Ja. `bridge_workers.version` in der jeweiligen Cloud-DB zeigt die aktive Version. Aktuell in Lovable-Cloud: `phase7.5-auth-status` auf `hetzner-staging-1`. Für Hetzner-Live selbes Feld in dortiger DB prüfen.
- **Heartbeats gesund?** In Lovable-Cloud ja (Alter ~162s bei 300s-Sende-Intervall, Status `online`). Screenshot Hetzner: „vor 31s" → ebenfalls gesund.

## Nach dem Deploy

Auf Hetzner-Supabase einmalig prüfen:

```sql
SELECT key, value FROM system_settings WHERE key LIKE '%stale%';
```

Sollten beide Zeilen mit `900` erscheinen. Danach zeigt die Karte „Schwelle 900s".
