

# Testszenario: Wallbox-OCPP-Integration mit Message-Logging

## Ausgangslage

Die Wallbox wird per WebSocket (`ws://` oder `wss://`) mit dem Backend verbunden. Die URL, die in der Wallbox konfiguriert wird, lautet:

```text
wss://xnveugycurplszevdxtw.supabase.co/functions/v1/ocpp-ws-proxy/{SERIENNUMMER}
```

Dabei ist `{SERIENNUMMER}` die OCPP-ID der Wallbox (= Seriennummer).

## Identifizierte Probleme

1. **`ocpp-ws-proxy` fehlt in `config.toml`**: Ohne `verify_jwt = false` wird die Verbindung der Wallbox mit einem Auth-Fehler abgelehnt, weil die Wallbox keinen JWT-Token mitschickt.
2. **Kein persistentes Logging**: Aktuell landen OCPP-Nachrichten nur in den Edge-Function-Logs (flüchtig). Fuer das schrittweise Debugging brauchen wir eine Datenbank-Tabelle, in der jede ein- und ausgehende Nachricht gespeichert wird.
3. **Kein UI zum Ansehen der Logs**: Es gibt noch keine Oberfläche, um die empfangenen OCPP-Nachrichten einzusehen.

## Umsetzungsplan

### Schritt 1 -- Konfiguration fixen

`ocpp-ws-proxy` in `supabase/config.toml` als JWT-frei registrieren, damit die Wallbox ohne Token verbinden kann.

### Schritt 2 -- Datenbank: `ocpp_message_log`-Tabelle erstellen

Neue Tabelle mit folgenden Spalten:

| Spalte | Typ | Beschreibung |
|---|---|---|
| id | uuid (PK) | Automatisch generiert |
| charge_point_id | text | OCPP-ID der Wallbox |
| direction | text | `incoming` oder `outgoing` |
| message_type | text | z.B. `BootNotification`, `Heartbeat`, `StatusNotification` |
| raw_message | jsonb | Die komplette OCPP-Nachricht als JSON |
| created_at | timestamptz | Zeitstempel |

RLS-Policy: Lesezugriff fuer authentifizierte Nutzer. Schreibzugriff nur ueber Service-Role (Edge Functions).

### Schritt 3 -- Edge Functions erweitern

**`ocpp-ws-proxy/index.ts`**: Jede eingehende und ausgehende Nachricht zusaetzlich in die `ocpp_message_log`-Tabelle schreiben (per Supabase-Client mit Service-Key).

**`ocpp-central/index.ts`**: Ebenfalls eingehende CALL-Nachrichten und ausgehende CALLRESULT/CALLERROR loggen.

### Schritt 4 -- OCPP-Log-Viewer im Frontend

Neue Ansicht auf der Ladepunkt-Detailseite (neuer Tab "OCPP-Log") und/oder im Super-Admin unter "OCPP-Backend":

- Tabelle mit Zeitstempel, Richtung, Nachrichtentyp und Raw-JSON
- Auto-Refresh alle 5 Sekunden (oder Realtime-Subscription)
- Filter nach Ladepunkt-ID
- Farbcodierung: eingehend = blau, ausgehend = gruen, Fehler = rot
- JSON kann per Klick aufgeklappt werden

### Schritt 5 -- Testanleitung

Nach der Umsetzung konfigurierst du in der Wallbox:

1. **OCPP-URL**: `wss://xnveugycurplszevdxtw.supabase.co/functions/v1/ocpp-ws-proxy/{SERIENNUMMER}`
2. **Ladepunkt in der App anlegen** mit der gleichen OCPP-ID (= Seriennummer)
3. Wallbox verbinden lassen
4. Im OCPP-Log-Viewer beobachten, welche Nachrichten ankommen (erwartungsgemäss zuerst ein `BootNotification`)

---

## Technische Details

### Dateien, die geaendert/erstellt werden

| Datei | Aktion |
|---|---|
| `supabase/config.toml` | `[functions.ocpp-ws-proxy] verify_jwt = false` hinzufuegen |
| Migration SQL | Neue Tabelle `ocpp_message_log` + RLS + Realtime |
| `supabase/functions/ocpp-ws-proxy/index.ts` | Logging in DB hinzufuegen |
| `supabase/functions/ocpp-central/index.ts` | Logging in DB hinzufuegen |
| `src/hooks/useOcppLogs.tsx` | Neuer Hook fuer Log-Abfrage mit Realtime |
| `src/pages/ChargePointDetail.tsx` | Neuer Tab "OCPP-Log" |
| `src/pages/SuperAdminOcppIntegrations.tsx` | Globaler Log-Viewer (alle Ladepunkte) |

