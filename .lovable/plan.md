

# PIN-Schutz für die lokale Gateway-UI

## Übersicht
Die lokale Gateway-UI (auf dem Raspberry Pi) wird mit einem konfigurierbaren PIN geschützt. Der PIN wird in der Cloud-UI pro Gateway konfiguriert, beim Heartbeat an das Gateway synchronisiert und dort lokal validiert. Ohne korrekten PIN ist kein Zugriff auf die lokale UI möglich.

## Architektur

```text
Cloud UI (DeviceCard)          Cloud (gateway-ingest)         Gateway (index.ts + ui/index.html)
┌──────────────────┐           ┌──────────────────┐           ┌──────────────────┐
│ PIN-Eingabefeld  │──UPDATE──▶│ gateway_devices   │           │                  │
│ im DeviceCard    │           │ config.ui_pin     │           │                  │
└──────────────────┘           │ (SHA-256 Hash)    │           │                  │
                               └────────┬─────────┘           │                  │
                                        │ Heartbeat Response   │                  │
                                        ├─────────────────────▶│ Speichert        │
                                        │ ui_pin_hash          │ PIN-Hash lokal   │
                                        │                      │                  │
                                        │                      │ /api/* prüft     │
                                        │                      │ Session-Cookie   │
                                        │                      │                  │
                                        │                      │ Login-Screen     │
                                        │                      │ in index.html    │
                                        │                      └──────────────────┘
```

## Implementierungsschritte

### 1. Cloud-UI: PIN-Konfiguration im DeviceCard
- Neues PIN-Eingabefeld (4-6 Ziffern) im DeviceCard oder in einem separaten Dialog
- Admin kann PIN setzen oder löschen (kein PIN = kein Schutz)
- PIN wird clientseitig SHA-256 gehasht und als `config.ui_pin_hash` in `gateway_devices` gespeichert
- Kein Klartext-PIN in der Datenbank

### 2. Edge Function: PIN-Hash im Heartbeat mitsenden
- `handleHeartbeat` in `gateway-ingest/index.ts` liest `ui_pin_hash` aus dem bestehenden `config`-Feld des Geräts
- Gibt `ui_pin_hash` im Heartbeat-Response an das Gateway zurück (analog zu `pending_command`)

### 3. Gateway (index.ts): PIN-Validierung
- Speichert empfangenen `ui_pin_hash` als In-Memory-Variable
- Neuer API-Endpunkt `POST /api/auth` nimmt PIN entgegen, hasht ihn (SHA-256) und vergleicht mit dem gespeicherten Hash
- Bei Erfolg: setzt ein Session-Token (zufälliger String) als Cookie
- Alle anderen `/api/*`-Endpunkte und die UI prüfen dieses Cookie – ohne gültiges Cookie wird 401 zurückgegeben
- Wenn kein PIN konfiguriert ist (`ui_pin_hash` leer): kein Schutz, alles offen wie bisher

### 4. Lokale UI (index.html): Login-Screen
- Neuer PIN-Eingabe-Screen wird vor dem Dashboard angezeigt
- 4-6 Ziffern-Eingabefeld mit Numpad-Look
- Sendet PIN an `POST /api/auth`, bei Erfolg wird das Dashboard geladen
- Session bleibt bestehen bis Browser-Tab geschlossen oder Cookie abläuft
- Wenn API 401 zurückgibt, wird automatisch der Login-Screen angezeigt

## Technische Details

**Kein Datenbank-Schema-Änderung nötig** – der PIN-Hash wird im bestehenden `config` JSON-Feld von `gateway_devices` gespeichert.

**Dateien die geändert werden:**
1. `src/components/integrations/gateway/DeviceCard.tsx` – PIN-Konfiguration UI
2. `supabase/functions/gateway-ingest/index.ts` – PIN-Hash im Heartbeat-Response
3. `docs/ha-addon/index.ts` – PIN-Validierung, Session-Management, Auth-Endpunkt
4. `docs/ha-addon/ui/index.html` – Login-Screen

**Sicherheit:**
- PIN wird nie im Klartext gespeichert oder übertragen (nur SHA-256 Hash)
- Session-Token mit 1h Ablaufzeit
- Brute-Force-Schutz: 5 Fehlversuche → 60s Sperre

