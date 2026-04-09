

# Connector-Auswahl & Pro-Connector-Status

## Problem

Aktuell speichert `charge_points` nur **einen** Status pro Ladepunkt. Bei Stationen mit mehreren Anschlüssen (z. B. Compleo mit 2× Typ 2) geht die Information verloren, welcher Connector frei/belegt ist. Außerdem ist `connectorId: 1` in App und Admin-Seite hardcodiert.

## Lösung

### 1. Neue Tabelle `charge_point_connectors`

Migration:

```sql
CREATE TABLE public.charge_point_connectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_point_id uuid NOT NULL REFERENCES charge_points(id) ON DELETE CASCADE,
  connector_id integer NOT NULL,  -- OCPP connectorId (1, 2, …)
  status text NOT NULL DEFAULT 'available',
  connector_type text NOT NULL DEFAULT 'Type2',
  max_power_kw numeric NOT NULL DEFAULT 22,
  last_status_at timestamptz,
  UNIQUE (charge_point_id, connector_id)
);

ALTER TABLE public.charge_point_connectors ENABLE ROW LEVEL SECURITY;

-- RLS: Lesezugriff für authentifizierte Nutzer (wie charge_points)
CREATE POLICY "Authenticated users can read connectors"
  ON public.charge_point_connectors FOR SELECT TO authenticated
  USING (true);

-- Admins können ändern
CREATE POLICY "Admins can manage connectors"
  ON public.charge_point_connectors FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Realtime aktivieren
ALTER PUBLICATION supabase_realtime ADD TABLE public.charge_point_connectors;
```

### 2. Backend: StatusNotification pro Connector speichern

**Datei: `supabase/functions/ocpp-central/index.ts`**

In `handleStatusNotification`: Zusätzlich zum bestehenden `charge_points.status`-Update einen Upsert in `charge_point_connectors` machen:

```
connectorId aus payload lesen (default 0)
wenn connectorId > 0:
  UPSERT in charge_point_connectors (charge_point_id, connector_id, status)
```

Der Gesamt-Status des Ladepunkts (`charge_points.status`) wird weiterhin aktualisiert — als Aggregat: wenn mindestens ein Connector "available" ist, bleibt der Ladepunkt "available".

### 3. Seed-Connector-Daten bei BootNotification

In `handleBootNotification` oder bei der Auto-Registrierung: Connector-Rows basierend auf `connector_count` anlegen, falls noch nicht vorhanden.

### 4. Admin-Seite: Connector-Status-Anzeige

**Datei: `src/pages/ChargePointDetail.tsx`**

- Connector-Daten per Query laden (`charge_point_connectors` WHERE `charge_point_id = id`)
- Realtime-Subscription auf `charge_point_connectors`
- Im Details-Tab: Visuelle Anzeige pro Connector (Connector 1: Verfügbar ●, Connector 2: Lädt ●)
- Bei "Ladevorgang starten": Dropdown zur Connector-Auswahl statt hardcodiertem `connectorId: 1`

### 5. Lade-App: Connector-Auswahl

**Datei: `src/pages/ChargingApp.tsx`**

- Beim Klick auf "Laden starten" an einer Station mit `connector_count > 1`:
  - Connector-Status laden
  - Kurzes Auswahl-UI zeigen (z. B. zwei Buttons "Anschluss 1 ✓" / "Anschluss 2 ✓" mit Live-Status)
  - Gewählte `connectorId` im `RemoteStartTransaction`-Body senden
- Bei Stationen mit nur 1 Connector: Verhalten bleibt wie bisher (kein Extra-Dialog)

### 6. Connector-Anzeige in Übersichtskarten

**Datei: `src/components/charging/ChargePointDetailDialog.tsx`**

- Pro Connector eine Statuszeile im Details-Tab
- Farbkodiert: Grün (available), Blau (charging), Grau (unavailable), Rot (faulted)

## Technische Details

| Komponente | Änderung |
|---|---|
| DB-Migration | Neue Tabelle `charge_point_connectors` + RLS + Realtime |
| `ocpp-central` | `handleStatusNotification` → Upsert Connector-Status |
| `ocpp-central` | Auto-Seed Connectors bei Registrierung |
| `ChargePointDetail.tsx` | Connector-Grid + Dropdown bei Remote-Start |
| `ChargingApp.tsx` | Connector-Auswahl-UI bei multi-connector Stationen |
| `ChargePointDetailDialog.tsx` | Connector-Status-Anzeige |
| `useChargePoints.tsx` | Optional: Connector-Daten mit-laden |

## Nicht betroffen

- Bestehende Sessions (haben bereits `connector_id`)
- OCPP-WS-Proxy (leitet `connectorId` bereits korrekt durch)
- Tarif-/Abrechnungslogik

