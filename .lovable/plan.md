
# Ehrliche Analyse & Empfehlung für industrietaugliche Echtzeit-Daten

## Das eigentliche Problem – klar benannt

Der Kern des Problems liegt nicht in der Architektur dieser Anwendung, sondern in einer grundsätzlichen technischen Einschränkung: **Der Loxone Miniserver bietet keine API, die historische Leistungswerte mit hoher Zeitauflösung (< 5 Minuten) rückwirkend liefert.**

Die aktuelle Loxone HTTP-API gibt bei einem Aufruf nur den **aktuellen Momentanwert** zurück. Es gibt keine Möglichkeit, nachträglich zu fragen: "Was hat der Zähler um 14:32 Uhr gemessen?" Daher sind Datenpunkte im Verlaufsdiagramm immer genau so dicht wie die Abfragefrequenz.

## Was ist realistisch erreichbar – und was nicht?

### Option 1: Cron-Job auf 1 Minute reduzieren (innerhalb der bestehenden Architektur)

Das ist die einzige Verbesserung, die **ohne externe Infrastruktur** funktioniert.

- Ergebnis: 60 Datenpunkte pro Stunde statt 12
- Datenqualität: Gut, aber nicht industrietauglich im Sinne von Sekunden-Präzision
- Für alle Gateways gleichzeitig
- Umsetzung: 2 Datenbankzeilen ändern

**Grenze:** pg_cron erlaubt maximal 1 Ausführung pro Minute. Feiner ist innerhalb der Serverless-Architektur nicht möglich.

### Option 2: Dedizierter Hintergrund-Worker-Dienst (industrietauglich)

Für präzise, lückenlose Leistungsdaten in einer industriellen Anwendung ist ein **dauerhaft laufender Prozess** erforderlich. Das ist die technisch korrekte Lösung.

Dieser Worker würde:
- Alle 10–30 Sekunden die Loxone HTTP-API (und andere Gateways) abfragen
- Werte direkt in die bestehende `meter_power_readings`-Tabelle schreiben
- Vollständig von der bestehenden App getrennt laufen
- Die bestehenden Spike-Detection-Regeln anwenden
- Bei Ausfall oder Neustart selbst weitermachen

**Kein Umbau der App nötig** – die Datenbank bleibt dieselbe, das Dashboard zeigt automatisch die dichteren Daten an.

```text
Worker-Dienst (alle 30 Sek.)           App (bestehend, unverändert)
      │                                        │
      │  HTTP → Loxone API                     │  Zeigt Daten an
      │  HTTP → Shelly API                     │  aus meter_power_readings
      │  HTTP → ABB API ...                    │
      ▼                                        ▼
              ┌─────────────────────────┐
              │    meter_power_readings  │
              │    (Supabase Datenbank)  │
              └─────────────────────────┘
```

Dieser Worker kann auf jeder einfachen Infrastruktur betrieben werden:

| Plattform | Beschreibung | Kosten |
|---|---|---|
| **Railway** | Docker-Container, immer an, einfaches Deployment | ~5 USD/Monat |
| **Fly.io** | Ähnlich wie Railway, globale Regionen | ~3–5 USD/Monat |
| **VPS** (z.B. Hetzner CX11) | Root-Server, maximale Kontrolle | ~4 EUR/Monat |
| **Bestehender Server** | Falls ein Server vor Ort oder in der Cloud vorhanden | Keine Zusatzkosten |

Der Worker wäre ein kleines Node.js- oder Deno-Skript (~200 Zeilen), das in einem Docker-Container läuft.

## Ehrliche Empfehlung

Für eine **industrielle Anwendung mit Präzisionsanforderungen** ist Option 2 die richtige Antwort. Option 1 ist ein nützlicher Quick-Win, löst aber das grundsätzliche Problem nur teilweise.

**Konkret empfehle ich eine Kombination:**

1. **Sofort:** Cron-Job auf 1 Minute reduzieren – verbessert die Datendichte sofort ohne Aufwand
2. **Mittelfristig:** Einen dedizierten Worker-Dienst aufbauen und betreiben

## Was wird in diesem Plan umgesetzt?

Da der Worker-Dienst außerhalb dieser Anwendung läuft, kann ich hier nur **Teil 1** umsetzen (Cron-Intervall). Für **Teil 2** werde ich den vollständigen Worker-Code erstellen, den du dann in einem Docker-Container betreiben kannst.

### Schritt 1: Cron-Jobs auf 1 Minute reduzieren (Datenbankänderung)

Beide bestehenden Jobs werden aktualisiert:
- `loxone-power-readings-sync`: `*/5 * * * *` → `* * * * *`
- `gateway-power-readings-sync`: `*/5 * * * *` → `* * * * *`

### Schritt 2: Worker-Skript erstellen

Eine neue Datei `docs/gateway-worker/index.ts` (Deno/Node.js) wird als Dokumentation und einsatzbereiter Code erstellt. Sie enthält:

- Verbindungslogik für alle registrierten Gateways (Loxone, Shelly, ABB, Siemens, Tuya, Homematic, Omada)
- Konfigurierbares Polling-Intervall (Standard: 30 Sekunden)
- Direkte Schreibzugriffe in die Supabase-Datenbank über den Service-Role-Key
- Dieselbe Spike-Detection wie die bestehende Edge Function
- Fehlerbehandlung und automatischen Neustart bei Verbindungsfehlern
- Ein `Dockerfile` für einfaches Deployment

### Schritt 3: Dokumentation

Die bestehende `docs/DEVELOPER_DOCUMENTATION.md` wird um einen Abschnitt "Gateway Worker Deployment" erweitert, der erklärt, wie der Worker auf Railway, Fly.io oder einem eigenen Server deployt wird.

## Betroffene Dateien

| Datei | Änderung |
|---|---|
| Datenbank (SQL) | Cron-Intervall von `*/5` auf `*` ändern |
| `docs/gateway-worker/index.ts` | Neuer Worker-Dienst (einsatzbereit) |
| `docs/gateway-worker/Dockerfile` | Docker-Konfiguration |
| `docs/DEVELOPER_DOCUMENTATION.md` | Deployment-Anleitung ergänzen |

## Was bleibt offen?

Der Worker-Dienst benötigt den Supabase **Service-Role-Key** als Umgebungsvariable, um direkt in die Datenbank zu schreiben. Dieser Key muss beim Deployment des Workers als Secret gesetzt werden (nicht im Code gespeichert). Die App selbst muss nicht verändert werden.
