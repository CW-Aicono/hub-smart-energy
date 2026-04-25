Ich nehme das ernst: Die bisherigen Fixes waren Symptombehandlung. Die aktuelle Analyse zeigt, dass der eigentliche Fehler nicht primär ein einzelner kaputter Codeblock ist, sondern die Architektur der Live-Gateway-Abfragen.

Do I know what the issue is? Ja.

## Diagnose

Die App ruft auf normalen Seiten weiterhin direkt Gateway-Funktionen auf, insbesondere `loxone-api` mit `action: "getSensors"`.

Das ist problematisch, weil `getSensors` bei Loxone kein kleiner Datenbank-Read ist. Pro Integration passiert ungefähr Folgendes:

```text
Browser-Seite öffnet
  -> mehrere React-Komponenten/Hooks wollen Live-Werte
  -> loxone-api getSensors
      -> Loxone Cloud DNS auflösen
      -> LoxAPP3.json laden
      -> für jeden Loxone-Control /all abrufen
      -> Sensorliste bauen
      -> optional Daten speichern
```

In den Logs sieht man genau dieses Muster:

- viele `loxone-api`-Starts und `shutdown`-Ereignisse innerhalb weniger Sekunden
- mehrere parallele/nahezu gleichzeitige `getSensors`-Aufrufe
- pro Aufruf viele externe Loxone-Requests (`/jdev/sps/io/.../all`)
- teilweise Laufzeiten bis ca. 8 Sekunden, während im Hintergrund zusätzlich periodische Syncs laufen
- ähnliche Polling-Muster bei `gateway-ws`

Die bisherigen Retry-Mechanismen helfen nur kurzfristig. Sie verhindern nicht, dass die App überhaupt zu viele schwere Edge-Function-Aufrufe erzeugt. Im Gegenteil: In Lastsituationen können Retries die Last noch erhöhen.

## Root Cause

Die UI ist aktuell zu stark an externe Gateway-Live-Abfragen gekoppelt.

Eine normale Dashboard-/Zähler-/Automationsseite darf nicht davon abhängen, dass in diesem Moment ein externer Miniserver, Shelly Cloud oder Gateway über eine Edge Function abgefragt wird. Wenn diese Funktion kurz überlastet, kalt startet, blockiert oder vom Runtime-System beendet wird, erscheint beim Nutzer sofort der 503-Fehler bzw. ein Blank Screen.

Die nachhaltige Lösung ist deshalb:

```text
Alt:
Browser -> Edge Function -> externer Gateway/Miniserver -> UI

Neu:
Background Sync -> Edge Function -> externer Gateway/Miniserver -> Cache in Datenbank
Browser -> Datenbank-Cache -> UI
```

Die UI liest also stabile, zuletzt bekannte Werte. Externe Gateway-Abfragen laufen kontrolliert im Hintergrund oder nur bei bewusstem manuellem Refresh.

## Nachhaltiger Fix

### 1. Gateway-Snapshot-Cache einführen

Ich werde eine neue backendseitige Cache-Tabelle anlegen, z. B. `gateway_sensor_snapshots`.

Sie speichert pro Standort-Integration die zuletzt erfolgreich gelesene Sensorliste:

- `tenant_id`
- `location_id`
- `location_integration_id`
- `sensors` als JSONB
- `system_messages` als JSONB
- `status`: `fresh`, `stale`, `error`, `refreshing`
- `fetched_at`
- `expires_at`
- `error_message`
- Timestamps

Wichtig: Zugang wird per RLS mandantensicher gemacht. Nutzer dürfen nur Snapshots ihres eigenen Mandanten lesen. Schreiben darf nur die Backend-Logik.

### 2. Pro-Integration-Lock gegen parallele Refreshes

Ich werde zusätzlich einen kleinen Lock-Mechanismus einbauen, damit eine Integration nicht mehrfach gleichzeitig live abgefragt wird.

Beispiel:

```text
Integration A wird gerade aktualisiert
  -> zweiter Refresh-Versuch erkennt Lock
  -> gibt vorhandenen Cache zurück
  -> startet keinen weiteren Loxone-/Shelly-/Gateway-Aufruf
```

Dafür wird eine kleine Lock-Tabelle oder eine atomare Datenbankfunktion genutzt, damit parallele Edge-Function-Instanzen sich gegenseitig sauber begrenzen.

### 3. `loxone-api` umbauen: Cache-first statt immer live

`loxone-api` wird so angepasst, dass normale Nutzeraufrufe nicht mehr blind live pollen.

Geplantes Verhalten:

- `cacheOnly`: gibt nur gespeicherte Werte zurück, ruft Loxone nie live ab
- `refresh`: führt bewusst einen Live-Refresh aus, aber nur mit Lock und Rate Limit
- Hintergrund-Job: darf live abrufen und danach den Snapshot aktualisieren
- wenn Loxone temporär nicht erreichbar ist: alter Snapshot bleibt nutzbar, UI zeigt höchstens „Daten veraltet“ statt Blank Screen

### 4. `shelly-api` und `gateway-ws` in dieselbe Strategie einbeziehen

Die Fehler kamen nicht nur von Loxone, sondern vorher auch von Shelly und `gateway-ws`.

Deshalb wird nicht nur `loxone-api` gepatcht. Ich werde die UI-Abfragen für alle Gateway-Arten vereinheitlichen:

- Loxone Miniserver
- Shelly Cloud
- AICONO Gateway / `gateway-ws`
- vorhandene pushbasierte Gateways bleiben pushbasiert

AICONO Gateway-Daten liegen bereits teilweise in `gateway_device_inventory`; diese werden entweder direkt cachefähig gelesen oder in denselben Snapshot-Mechanismus überführt.

### 5. Frontend-Hooks refactoren: keine schweren Edge Calls im Render-Pfad

Die zentralen Hooks werden geändert:

- `useLoxoneSensors`
- `useLoxoneSensorsMulti`
- `useGatewayLivePower`
- indirekte Nutzer in Dashboard, Meter Management, Automation, Floorplan/Live Values

Ziel:

```text
Normale Seitenanzeige:
  liest nur Cache/Datenbank

Manueller Button „Aktualisieren“:
  darf refresh auslösen
  zeigt Ladezustand
  fällt bei Fehler auf Cache zurück
```

Die bestehenden Importnamen können weitgehend kompatibel bleiben, damit nicht die ganze App unnötig umgebaut werden muss.

### 6. Client-Retry entschärfen

`invokeWithRetry` bleibt für echte manuelle Aktionen sinnvoll, aber nicht mehr als Hauptstabilisator.

Ich werde verhindern, dass automatische UI-Polling-Fehler weiter eskalieren:

- keine aggressiven Retries bei Gateway-Live-Daten
- kein Throw, der einen Runtime Error / Blank Screen erzeugt
- Fehler werden als UI-Status dargestellt: „Live-Aktualisierung aktuell nicht verfügbar, letzte Werte werden angezeigt“

### 7. Periodische Syncs kontrollieren

Die bestehenden Hintergrundfunktionen wie `loxone-periodic-sync` und `shelly-periodic-sync` werden auf den neuen Cache ausgerichtet:

- kontrollierte Reihenfolge
- Lock pro Integration
- keine unnötigen parallelen Refreshes
- optional Jitter/Abstand zwischen Integrationen
- Snapshot wird auch bei Teilerfolg gespeichert
- bei Fehler bleibt letzter erfolgreicher Snapshot erhalten

### 8. Monitoring und Beweis der Stabilisierung

Nach der Umsetzung werde ich nicht einfach behaupten, dass es funktioniert. Ich werde prüfen:

1. Build/TypeScript läuft sauber.
2. Die betroffenen Edge Functions lassen sich deployen.
3. Direkte Testaufrufe liefern kontrollierte Antworten.
4. Im Preview-Netzwerk sieht man auf normalen Seiten keine massenhaften `loxone-api`-Live-Aufrufe mehr.
5. Logs zeigen deutlich weniger Edge-Function-Boots/Shutdowns.
6. Die UI zeigt Werte weiterhin an, aber aus dem Cache.
7. Wenn ein Gateway nicht erreichbar ist, bleibt die Seite sichtbar und zeigt einen verständlichen Status statt Blank Screen.

## Ergebnis nach Umsetzung

Nach dem Fix sollte die App so funktionieren:

```text
Gateway erreichbar:
  Hintergrund aktualisiert Cache
  UI zeigt frische Werte

Gateway kurz langsam/offline:
  UI zeigt letzte Werte
  Status: veraltet / nicht erreichbar
  kein Blank Screen
  kein 503-Runtime-Overlay

Viele Komponenten auf einer Seite:
  lesen denselben Cache
  erzeugen keine eigene Gateway-Abfrage pro Komponente

Mehrere Nutzer gleichzeitig:
  Cache wird geteilt
  nicht jeder Browser startet eigene Loxone-/Shelly-Abfragen
```

## Warum das diesmal dauerhaft ist

Der Unterschied zu den bisherigen Fixes:

- bisher: „Wenn Edge Function 503 liefert, nochmal versuchen“
- jetzt: „Die UI darf diese schwere Edge Function im Normalbetrieb gar nicht mehr benötigen“

Damit wird die Ursache reduziert, nicht nur der Fehler abgefangen.

## Technische Umsetzungsschwerpunkte

Betroffene Bereiche:

- Datenbankmigration für Snapshot-Cache und Locking
- `supabase/functions/loxone-api/index.ts`
- `supabase/functions/shelly-api/index.ts`
- `supabase/functions/gateway-ws/index.ts` bzw. dessen Datenquelle
- `supabase/functions/loxone-periodic-sync/index.ts`
- `supabase/functions/shelly-periodic-sync/index.ts`
- `src/hooks/useLoxoneSensors.ts`
- `src/hooks/useGatewayLivePower.ts`
- Komponenten, die noch direkt `getSensors` live aufrufen

Optional, falls nach dem Architekturfix weiterhin Lastgrenzen sichtbar bleiben: Die Lovable-Cloud-Instanz kann zusätzlich größer dimensioniert werden. Das ist aber nicht der erste Schritt; zuerst wird die unnötige Last aus der App entfernt.

<lov-actions>
  <lov-open-history>View History</lov-open-history>
  <lov-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</lov-link>
</lov-actions>