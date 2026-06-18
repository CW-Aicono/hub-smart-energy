## Ist-Zustand (wichtig, weil's vieles vorwegnimmt)

Das Feature **existiert bereits zu ca. 90 %** — der Loxone-Sync respektiert schon heute ein per-Integration konfigurierbares Abfrage-Intervall:

- Tabelle `location_integrations.config.poll_interval_minutes` (pro Loxone-Miniserver)
- Erlaubt: **1–15 Min**, Default **5 Min**
- UI: `EditIntegrationDialog.tsx` (Slider 1–15)
- Sync-Function: `loxone-periodic-sync` rechnet wall-clock-Buckets und überspringt Miniserver, deren Intervall noch nicht "fällig" ist
- Cron läuft alle 2 Min, das bleibt unverändert (nur leerlauf-Polling)

**Was fehlt zu deinem Wunsch:**

1. Default `5` → `15`
2. Max `15` → größerer Wert (Vorschlag: `60`)
3. Hinweis-Text im UI anpassen

---

## Ehrliche Antwort: Was bringt's an Entlastung?

Annahmen: Schreiblast skaliert ~linear mit Sync-Frequenz. Ein Sync schreibt pro Miniserver in `meter_power_readings_5min`, `meter_readings`, `gateway_sensor_snapshots`, `meter_period_totals`, `last_sync_at` etc.


| Intervall                  | Syncs/Tag pro Miniserver | Relativ zu 1 Min |
| -------------------------- | ------------------------ | ---------------- |
| 1 Min (Worst Case heute)   | 1 440                    | 100 %            |
| 5 Min (heutiger Default)   | 288                      | 20 %             |
| **15 Min (neuer Default)** | **96**                   | **6,7 %**        |
| 30 Min                     | 48                       | 3,3 %            |
| 60 Min                     | 24                       | 1,7 %            |


**Realistische Ersparnis** (Default `5` → `15`, wenn die Mehrheit beim Default bleibt):

- **~67 % weniger Schreiboperationen pro Miniserver** (von 288 auf 96/Tag)
- Bei 1 000 Tenants × Ø 1 Miniserver: statt ~288 000 → ~96 000 Sync-Zyklen/Tag
- Pro Sync werden 5–20 Rows geschrieben (abhängig von Sensoranzahl). Grob: **1–4 Mio. Writes/Tag eingespart**

**Wichtige Einschränkung — was es NICHT bringt:**

- 5-Min-Aggregate (`meter_power_readings_5min`) werden bei 15-Min-Polling **weiterhin gefüllt**, nur mit gröberen Stützstellen (Interpolation/Lücken). Die Anzahl der Rows in dieser Tabelle ändert sich kaum, weil sie zeitrasterbasiert ist — nur die `inserts/upserts` darauf sinken.
- Dashboards/Realtime-Werte zeigen Daten **bis zu 15 Min alt** statt 5 Min. Du hast oben gesagt 30–60 s Latenz ist ok → für die meisten Tenants kein Problem, aber Live-Verbrauchsanzeige wirkt träger.
- `gateway_sensor_snapshots` & Heartbeats laufen unabhängig weiter (kein riesiger Schreibtreiber).
- **Größter Hebel wäre nicht das Intervall, sondern Push statt Pull** (Loxone-MQTT, dein vorheriges Thema). Das Intervall ist ein günstiger Quick-Win, aber keine architektonische Lösung.

---

## Vorgeschlagene Änderung

### Code (3 kleine Edits)

1. `**src/components/integrations/EditIntegrationDialog.tsx**`
  - Z. 72: Default `5` → `15`, Max `15` → `60`
  - Z. 87: Clamp `Math.min(15, …)` → `Math.min(60, …)`
  - Z. 169: `max={15}` → `max={60}`
  - Z. 175: Hilfetext: "Erlaubt: 1–60 Minuten. Niedriger = aktuellere Werte (höhere Schreiblast), höher = weniger Datenbank-Last. **Empfehlung: 15 Minuten.**"
2. `**supabase/functions/loxone-periodic-sync/index.ts**` (Z. 91)
  - Validierung: `raw >= 1 && raw <= 15` → `raw >= 1 && raw <= 60`
  - Default-Fallback `5` → `15`
3. `**src/components/super-admin/LoxonePollingOverviewCard.tsx**`
  - Falls Default-Anzeige hartkodiert: `5` → `15`

### Migration (1 SQL)

Bestehende Loxone-Integrationen **ohne** explizit gesetztes Intervall behalten automatisch den neuen Default (Fallback im Code). **Keine Daten-Migration nötig** — bestehende Tenants mit `poll_interval_minutes = 5` behalten ihre 5 Min, neue/leere bekommen 15.

→ Optional: ein **Super-Admin-Button** "Alle Loxone-Integrationen, die noch keinen expliziten Wert haben, auf 15 Min setzen" — kann ich machen, würde ich aber **nur auf deine ausdrückliche Bestätigung** umsetzen, damit kein Tenant ungefragt langsamer wird.

### Nicht im Plan (bewusst)

- Globale Tenant-Default-Einstellung: deine Aussage war "pro Tenant und pro Miniserver". Da heute aber jede Loxone-Integration zu einem Standort gehört und Tenants oft nur 1–2 Miniserver haben, ist "pro Miniserver" praktisch identisch zu "pro Tenant". Ein zusätzliches Tenant-Feld wäre Overengineering → schlage ich nicht vor, außer du willst es explizit.
- Andere Gateways (Shelly, Schneider …): Frage war nur für Loxone — lassen wir.

---

## Frage vor Umsetzung

**Welcher Max-Wert?** 15, 30 oder 60 Minuten? Ich würde 60 nehmen (gibt Tenants mit minimaler Anforderung maximale Schonung), aber sag mir kurz Bescheid.  
  
Antwort: max-wert = 60 Minuten ist bestätigt