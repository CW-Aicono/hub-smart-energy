

# WebSocket-Integration für Loxone Miniserver

## Übersicht

Das aktuelle REST-API-basierte Abfrageverfahren hat Einschränkungen: Bestimmte Sensor-Typen wie `Meter` (PAC 3220) und `Fronius` (Energiemonitor) liefern über die REST-Schnittstelle keine Echtzeit-Werte. Die Lösung ist eine WebSocket-Verbindung zum Miniserver, die kontinuierliche Status-Updates empfängt.

## Loxone WebSocket-Protokoll

Das Loxone-Protokoll erfordert:

1. **Verbindungsaufbau**: WebSocket zu `ws://{host}/ws/rfc6455`
2. **Authentifizierung**: Token-basiert oder Legacy (HMAC-SHA1)
3. **Status-Aktivierung**: Befehl `jdev/sps/enablebinstatusupdate`
4. **Binäre Events**: Value-States als 24-Byte-Pakete (16-Byte UUID + 8-Byte Double)

## Architektur-Entscheidung

Da Edge Functions keine dauerhaften WebSocket-Verbindungen halten können (Timeout nach 2min), wird eine **On-Demand WebSocket-Session** implementiert:

```text
┌─────────────────┐     ┌─────────────────────┐     ┌───────────────┐
│    Frontend     │────►│  Edge Function      │────►│   Loxone      │
│  SensorsDialog  │     │  loxone-websocket   │     │  Miniserver   │
└─────────────────┘     └─────────────────────┘     └───────────────┘
       │                         │                         │
       │  HTTP Request           │  WebSocket Connect      │
       │─────────────────────────►──────────────────────────►
       │                         │  Authenticate           │
       │                         │──────────────────────────►
       │                         │  enablebinstatusupdate  │
       │                         │──────────────────────────►
       │                         │  Receive value-events   │
       │                         │◄──────────────────────────
       │                         │  Parse & Collect        │
       │                         │  (wait ~3s for events)  │
       │  JSON Response          │  Close WebSocket        │
       │◄─────────────────────────◄──────────────────────────
       │                         │                         │
```

## Implementierungsplan

### 1. Neue Edge Function: `loxone-websocket`

**Datei**: `supabase/functions/loxone-websocket/index.ts`

Diese Funktion:
- Öffnet eine WebSocket-Verbindung zum Miniserver (via Cloud DNS)
- Authentifiziert sich mit Legacy-Token (HMAC-SHA1) - da einfacher ohne RSA/AES
- Sendet `jdev/sps/enablebinstatusupdate`
- Sammelt eingehende Value-Events über ~3 Sekunden
- Parst die binären 24-Byte Events (UUID + Double)
- Mappt UUIDs auf Sensor-Namen via LoxAPP3.json
- Gibt alle Werte als JSON zurück

**Kernfunktionen**:
```text
- resolveLoxoneCloudURL() → Miniserver-URL auflösen
- connectWebSocket() → WebSocket-Verbindung aufbauen
- authenticateLegacy() → HMAC-SHA1 Authentifizierung
- parseMessageHeader() → Binär-Header dekodieren
- parseValueEvents() → UUID+Double aus Binary extrahieren
- mapUuidToControl() → UUID zu Sensor-Name zuordnen
```

### 2. Binäres Message-Parsing

Das Loxone-Protokoll sendet:

**Message Header** (8 Bytes):
```text
Byte 0: 0x03 (fix)
Byte 1: Identifier (2 = Value-States)
Byte 2-3: Reserved
Byte 4-7: Payload length (uint32 LE)
```

**Value-Event** (24 Bytes pro Wert):
```text
Byte 0-15: UUID (128-bit, Little Endian)
Byte 16-23: Value (float64, Little Endian)
```

### 3. Authentifizierung (Legacy-Token)

Da die vollständige Token-Authentifizierung RSA/AES-Verschlüsselung erfordert, nutzen wir den vereinfachten Legacy-Modus:

```text
1. Sende: jdev/sys/getkey
2. Empfange: Key (hex-encoded)
3. Berechne: HMAC-SHA1(key, "{user}:{password}")
4. Sende: authenticate/{hash}
5. Empfange: Bestätigung (Code 200)
```

### 4. Frontend-Integration

**Änderung in `SensorsDialog.tsx`**:
- Neuer Button "Live-Werte" oder automatischer Fallback
- Ruft `loxone-websocket` statt `loxone-api` auf wenn REST null liefert
- Zeigt Echtzeit-Werte für PAC 3220 und andere Meter-Typen

### 5. Fallback-Strategie

```text
1. Versuche REST-API (loxone-api) für schnelle Abfragen
2. Für Sensoren mit null-Werten → WebSocket-Fallback
3. Merge REST + WebSocket Ergebnisse
```

---

## Technische Details

### UUID-Konvertierung

Loxone verwendet binäre UUIDs die in Strings konvertiert werden müssen:
```text
Input: 16 Bytes (Little Endian)
Output: "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"

Format: Bytes [0-3]-[4-5]-[6-7]-[8-9]-[10-15]
        jeweils in Hex, Little Endian für die ersten 4 Gruppen
```

### State-UUID Mapping

Die `LoxAPP3.json` enthält für jeden Control:
```text
{
  "controls": {
    "UUID": {
      "name": "PAC 3220 NSHV Nord",
      "type": "Meter",
      "states": {
        "actual": "STATE-UUID-1",
        "total": "STATE-UUID-2",
        ...
      }
    }
  }
}
```

Die WebSocket-Events liefern die State-UUIDs, die wir zurück auf den Control mappen.

### Timeout-Handling

- WebSocket-Verbindung: Max 10 Sekunden
- Event-Sammlung: 3 Sekunden nach erstem Event
- Gesamtlaufzeit Edge Function: Max 25 Sekunden

### Fehlerbehandlung

- Verbindungsfehler → Fallback auf REST-API
- Auth-Fehler → Klare Fehlermeldung an Frontend
- Timeout → Partielle Ergebnisse zurückgeben

---

## Dateien

| Datei | Aktion |
|-------|--------|
| `supabase/functions/loxone-websocket/index.ts` | Neu erstellen |
| `supabase/config.toml` | Neue Function registrieren |
| `src/components/integrations/SensorsDialog.tsx` | WebSocket-Aufruf integrieren |
| `src/hooks/useIntegrations.tsx` | Optional: Helper für WebSocket-Call |

## Erwartetes Ergebnis

Nach der Implementierung werden alle Sensoren einschließlich PAC 3220 NSHV Nord ihre Echtzeit-Werte anzeigen:
- **Pf** (aktuelle Leistung in kW)
- **Mrc** (Zählerstand in kWh)
- Alle anderen Meter- und Fronius-Werte

