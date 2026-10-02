# Auto-Reboot auf Hetzner-Supabase einrichten

Diese Anleitung richtet die Funktion **„Automatischer Tages-Reboot"** auf einer selbst‑gehosteten Hetzner-Supabase ein. Sie ist für absolute Einsteiger geschrieben — bitte Schritt für Schritt von oben nach unten abarbeiten und nicht überspringen.

> **Hintergrund (kurz):** Die Funktion besteht aus drei Teilen, die alle vorhanden sein müssen:
> 1. eine **Edge Function** `charge-point-auto-reboot`,
> 2. ein **Zeitplan-Job (pg_cron)**, der diese Funktion stündlich aufruft,
> 3. der **OCPP-Server** `cp.aicono.org` (läuft bereits — nichts zu tun).
>
> Auf der Lovable‑Cloud-Datenbank sind alle drei Teile aktiv. Auf der Hetzner-Supabase fehlt mindestens Teil 1 oder Teil 2 — deshalb passiert nichts.

---

## Voraussetzungen

- Du hast Zugriff auf **Supabase Studio** der Hetzner-Installation (das ist die Weboberfläche der selbst‑gehosteten Supabase, meist erreichbar unter einer URL wie `https://supabase.deine-domain.de`).
- Du kennst die **Service-Role-Key** und die **API-URL** deiner Hetzner-Supabase. Wo du beides findest, steht weiter unten in Schritt 4.

---

## Schritt 1 – Vorprüfung: Sind die Spalten in der Tabelle vorhanden?

1. Öffne **Supabase Studio** der Hetzner-Installation.
2. Klicke links auf **„Table Editor"**.
3. Wähle das Schema **`public`** (Auswahl oben).
4. Suche die Tabelle **`charge_points`** und klicke sie an.
5. Prüfe in der Spaltenliste oben, ob folgende fünf Spalten existieren:
   - `auto_reboot_enabled`
   - `auto_reboot_time`
   - `auto_reboot_type`
   - `auto_reboot_skip_if_charging`
   - `auto_reboot_last_run_at`

**Wenn alle fünf Spalten vorhanden sind:** weiter mit Schritt 2.

**Wenn eine oder mehrere fehlen:**

1. Klicke links auf **„SQL Editor"**.
2. Klicke auf **„+ New query"**.
3. Kopiere den folgenden Block exakt in das Eingabefeld:

```sql
ALTER TABLE public.charge_points
  ADD COLUMN IF NOT EXISTS auto_reboot_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_reboot_time time NOT NULL DEFAULT '04:00:00',
  ADD COLUMN IF NOT EXISTS auto_reboot_type text NOT NULL DEFAULT 'Soft',
  ADD COLUMN IF NOT EXISTS auto_reboot_skip_if_charging boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_reboot_last_run_at timestamptz NULL;
```

4. Klicke unten rechts auf **„Run"**.
5. **Erwartetes Ergebnis:** Meldung „Success. No rows returned".

---

## Schritt 2 – Extensions aktivieren

1. Bleibe im **SQL Editor**.
2. Klicke auf **„+ New query"**.
3. Kopiere folgenden Block exakt:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
```

4. Klicke auf **„Run"**.
5. **Erwartetes Ergebnis:** „Success. No rows returned".

> Falls eine Fehlermeldung „extension not available" erscheint: Die Extensions sind in deinem Docker-Compose-Stack nicht enthalten. Bitte den Server-Admin, die Postgres-Container-Variante mit aktivierten Extensions zu verwenden.

---

## Schritt 3 – Edge Function `charge-point-auto-reboot` anlegen

1. Klicke links in Supabase Studio auf **„Edge Functions"**.
2. Klicke oben rechts auf **„Create a new function"**.
3. Trage als Namen exakt ein: `charge-point-auto-reboot`
4. Lösche den Beispiel-Code im Editor komplett.
5. Kopiere den folgenden vollständigen Code-Block exakt in den Editor:

```typescript
// Edge Function: charge-point-auto-reboot
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ChargePointRow {
  id: string;
  ocpp_id: string | null;
  name: string;
  auto_reboot_time: string;
  auto_reboot_type: "Soft" | "Hard";
  auto_reboot_skip_if_charging: boolean;
  auto_reboot_last_run_at: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const authHeader = req.headers.get("Authorization") || "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (bearer !== serviceKey) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const nowUtc = new Date();
  const berlinNow = new Date(nowUtc.toLocaleString("en-US", { timeZone: "Europe/Berlin" }));
  const todayBerlin = `${berlinNow.getFullYear()}-${String(berlinNow.getMonth() + 1).padStart(2, "0")}-${String(berlinNow.getDate()).padStart(2, "0")}`;
  const nowBerlinTime = `${String(berlinNow.getHours()).padStart(2, "0")}:${String(berlinNow.getMinutes()).padStart(2, "0")}:${String(berlinNow.getSeconds()).padStart(2, "0")}`;

  console.log(`[auto-reboot] tick — Berlin date=${todayBerlin}, time=${nowBerlinTime}`);

  const { data: candidates, error } = await supabase
    .from("charge_points")
    .select("id, ocpp_id, name, auto_reboot_time, auto_reboot_type, auto_reboot_skip_if_charging, auto_reboot_last_run_at")
    .eq("auto_reboot_enabled", true)
    .not("ocpp_id", "is", null);

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let dispatched = 0;
  let skippedCharging = 0;
  let skippedAlreadyRun = 0;
  let skippedTimeNotReached = 0;

  for (const cp of (candidates ?? []) as ChargePointRow[]) {
    if (cp.auto_reboot_time > nowBerlinTime) { skippedTimeNotReached++; continue; }

    if (cp.auto_reboot_last_run_at) {
      const lastBerlin = new Date(new Date(cp.auto_reboot_last_run_at).toLocaleString("en-US", { timeZone: "Europe/Berlin" }));
      const lastDate = `${lastBerlin.getFullYear()}-${String(lastBerlin.getMonth() + 1).padStart(2, "0")}-${String(lastBerlin.getDate()).padStart(2, "0")}`;
      if (lastDate === todayBerlin) { skippedAlreadyRun++; continue; }
    }

    if (cp.auto_reboot_skip_if_charging) {
      const { count } = await supabase
        .from("charging_sessions")
        .select("id", { count: "exact", head: true })
        .eq("charge_point_id", cp.id)
        .eq("status", "active");
      if ((count ?? 0) > 0) { skippedCharging++; continue; }
    }

    const { error: insErr } = await supabase
      .from("pending_ocpp_commands")
      .insert({
        charge_point_ocpp_id: cp.ocpp_id!,
        command: "Reset",
        payload: { type: cp.auto_reboot_type },
        status: "pending",
      });
    if (insErr) { console.error(insErr); continue; }

    await supabase.from("charge_points").update({ auto_reboot_last_run_at: nowUtc.toISOString() }).eq("id", cp.id);
    dispatched++;
    console.log(`[auto-reboot] dispatched ${cp.auto_reboot_type} reset to ${cp.name}`);
  }

  return new Response(JSON.stringify({
    ok: true, dispatched, skippedCharging, skippedAlreadyRun, skippedTimeNotReached,
    candidates: candidates?.length ?? 0, berlinDate: todayBerlin, berlinTime: nowBerlinTime,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
```

6. Klicke unten rechts auf **„Deploy function"**.
7. **Erwartetes Ergebnis:** Grüne Meldung „Function deployed successfully".

---

## Schritt 4 – API-URL und Service-Role-Key heraussuchen

Diese beiden Werte brauchst du gleich in Schritt 5.

### API-URL finden
1. In Supabase Studio links auf **„Project Settings"** (Zahnrad-Symbol).
2. Klicke auf **„API"**.
3. Notiere den Wert **„Project URL"** — sie sieht so aus: `https://supabase.deine-domain.de`

### Service-Role-Key finden
1. Auf derselben Seite **„API"** scrollst du nach unten zum Abschnitt **„Project API keys"**.
2. Du siehst einen Eintrag **`service_role`** — daneben ist ein Auge-Symbol zum Einblenden und ein Kopier-Symbol.
3. Klicke auf das Kopier-Symbol — der Key liegt jetzt in der Zwischenablage. Füge ihn temporär in einen Texteditor ein.

> **Wichtig:** Der Service-Role-Key gibt vollen Datenbankzugriff. Niemals an Dritte weitergeben, nicht in E-Mails verschicken.

---

## Schritt 5 – Cron-Job anlegen

1. Gehe in Supabase Studio auf **„SQL Editor"** → **„+ New query"**.
2. Kopiere den folgenden Block.
3. **Ersetze** vor dem Ausführen:
   - **`HIER_DEINE_PROJECT_URL`** durch die in Schritt 4 notierte URL (ohne abschließenden Schrägstrich).
   - **`HIER_DEIN_SERVICE_ROLE_KEY`** durch den in Schritt 4 kopierten Key (an **beiden** Stellen!).

```sql
select cron.schedule(
  'charge-point-auto-reboot-hourly',
  '5 * * * *',
  $$
  select net.http_post(
    url := 'HIER_DEINE_PROJECT_URL/functions/v1/charge-point-auto-reboot',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'HIER_DEIN_SERVICE_ROLE_KEY',
      'Authorization', 'Bearer HIER_DEIN_SERVICE_ROLE_KEY'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

4. Klicke auf **„Run"**.
5. **Erwartetes Ergebnis:** Eine Zeile mit einer Job-ID (z. B. `schedule | 1`).

> Der Job läuft ab jetzt **jede Stunde um xx:05 Uhr UTC**. Die Funktion selbst prüft danach in Europe/Berlin, ob die konfigurierte Reboot‑Zeit erreicht ist.

---

## Schritt 6 – Sofort-Testlauf (ohne auf die nächste Stunde zu warten)

1. SQL Editor → **„+ New query"**.
2. Kopiere folgenden Block und ersetze wieder die beiden Platzhalter wie in Schritt 5:

```sql
select net.http_post(
  url := 'HIER_DEINE_PROJECT_URL/functions/v1/charge-point-auto-reboot',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'apikey', 'HIER_DEIN_SERVICE_ROLE_KEY',
    'Authorization', 'Bearer HIER_DEIN_SERVICE_ROLE_KEY'
  ),
  body := '{}'::jsonb
);
```

3. **„Run"** klicken.
4. **Erwartetes Ergebnis:** Eine Zeile mit einer Zahl (`request_id`).

5. Warte 5 Sekunden, dann öffne in Supabase Studio links **„Edge Functions"** → `charge-point-auto-reboot` → Tab **„Logs"**.
6. Du musst eine Zeile wie diese sehen:
   ```
   [auto-reboot] done {"ok":true,"dispatched":1,...}
   ```
   - **`dispatched: 1`** = Reboot wurde ausgelöst. Weiter mit Schritt 7.
   - **`skippedTimeNotReached: 1`** = Aktuelle Uhrzeit liegt vor der eingestellten Reboot‑Zeit. Stelle in der Wallbox-Detailseite die Reboot-Uhrzeit testweise auf eine Zeit ein, die ein paar Minuten in der Vergangenheit liegt, speichere und wiederhole Schritt 6.
   - **`skippedAlreadyRun: 1`** = Heute wurde schon ein Reboot ausgeführt. Setze testweise `auto_reboot_last_run_at` auf `null` (siehe Troubleshooting unten).
   - **`401 Unauthorized`** = Der Service-Role-Key im Aufruf ist falsch. Schritt 5 prüfen.

---

## Schritt 7 – Verifikation an der Wallbox

1. SQL Editor → folgende Abfrage einfügen und **„Run"**:

```sql
select id, charge_point_ocpp_id, command, status, created_at, processed_at, result
from public.pending_ocpp_commands
where command = 'Reset'
order by created_at desc
limit 5;
```

2. **Erwartetes Ergebnis:** Der oberste Eintrag muss:
   - `command = Reset`,
   - `status = completed` (innerhalb von 2 Sekunden nach Schritt 6 — vorher kurz `pending` oder `sent`),
   - `result` enthält `"status":"Accepted"`.

3. Lade im AICONO-Frontend die Wallbox-Detailseite neu (Strg+F5). Unter „Automatischer Tages-Reboot" muss jetzt die Zeile **„Letzter Auto-Reboot: <heutiges Datum> <Uhrzeit>"** erscheinen.

**Wenn der Reboot innerhalb von 30 Sekunden erfolgreich war: Setup ist fertig. ✅**

---

## Troubleshooting

### Problem 1: `auto_reboot_last_run_at` bleibt `null`, der Cron-Job läuft nicht

SQL-Editor:
```sql
select jobid, jobname, schedule, active from cron.job where jobname = 'charge-point-auto-reboot-hourly';
select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'charge-point-auto-reboot-hourly') order by start_time desc limit 5;
```

- Liefert die erste Abfrage **keine Zeile**: Schritt 5 wurde nicht ausgeführt.
- Liefert die zweite Abfrage Zeilen mit `status = failed`: schau in `return_message` — meistens ist es ein 401/404 → Project-URL oder Service-Role-Key falsch.

### Problem 2: Reset bleibt auf `status = pending`

Das heißt: Der OCPP-Server hat den Befehl gesehen, kann ihn aber nicht zustellen, weil die Wallbox gerade nicht verbunden ist. Prüfen:

```sql
select name, ocpp_id, ws_connected, ws_connected_since from public.charge_points where auto_reboot_enabled = true;
```

- `ws_connected = true` → Wallbox ist verbunden, weiter recherchieren (OCPP-Logs).
- `ws_connected = false` → Wallbox-Konfiguration prüfen: Sie muss als OCPP-URL `wss://cp.aicono.org/<ocpp_id>` eingetragen haben.

### Problem 3: Edge Function gibt 401 Unauthorized

Der Service-Role-Key im Cron-Job (Schritt 5) stimmt nicht. So korrigierst du:

```sql
select cron.unschedule('charge-point-auto-reboot-hourly');
```

Danach Schritt 5 erneut ausführen — diesmal mit dem korrekten Key.

### Problem 4: Manueller Reset für erneuten Test

Wenn `skippedAlreadyRun: 1` erscheint und du erneut testen willst:

```sql
update public.charge_points set auto_reboot_last_run_at = null where auto_reboot_enabled = true;
```

Danach Schritt 6 wiederholen.

---

## Anhang: Was unterscheidet das Hetzner-Setup vom Lovable-Setup?

| Baustein | Lovable Cloud | Hetzner self-hosted |
|---|---|---|
| Edge Function `charge-point-auto-reboot` | Automatisch deployed durch Lovable | **Muss einmalig manuell deployed werden (Schritt 3)** |
| pg_cron Job | Automatisch angelegt durch Migration | **Muss einmalig manuell angelegt werden (Schritt 5)** |
| OCPP-Server | nicht relevant für diese Funktion | `cp.aicono.org` — bereits aktiv |
| Frontend-Schalter | identisch | identisch |

Wenn Schritte 3 und 5 einmal durchgeführt sind, läuft die Funktion auf Hetzner genauso zuverlässig wie auf Lovable Cloud — jeden Tag zur konfigurierten Uhrzeit (Europe/Berlin) ein Reset pro aktivierter Wallbox.
