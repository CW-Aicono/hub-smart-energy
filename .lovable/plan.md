## Ziel

Im Automation-Editor werden Sensor- und Aktor-Dropdowns strikt an den gewählten **Ausführungsort** gekoppelt. Sobald *nicht* „Cloud" gewählt ist (also „Loxone lokal" oder „Hybrid"), dürfen ausschließlich Geräte angeboten werden, die auch lokal ansprechbar sind. Cloud-API-Geräte (Shelly Cloud, Tuya, ABB, Siemens Building X, Homematic IP, Omada, Schneider Cloud, …) werden dann ausgeblendet.

## Warum

„Loxone lokal" bedeutet: die Regel läuft ausschließlich auf dem Miniserver. Ein Cloud-Aktor kann von dort nicht angesteuert werden – die Kombination widerspricht sich. „Hybrid" fällt bei Cloud-Ausfall auf lokale Ausführung zurück; auch dort sind Cloud-Geräte nicht sinnvoll.

## Klassifizierung der Integrationen

Neuer zentraler Helper `src/lib/gatewayExecution.ts`:

- `LOCAL_CAPABLE_TYPES = ["loxone_miniserver", "aicono_gateway", "schneider_panel_server", "siemens_iot2050", "sentron_powercenter_3000", "mqtt_generic", "shelly_mqtt", "smart_meter_imsys"]`
- `CLOUD_ONLY_TYPES = ["shelly_cloud", "tuya_cloud", "abb_free_at_home", "siemens_building_x", "homematic_ip", "omada_cloud", "schneider_cloud"]`
- `isCloudOnlyIntegration(type)` / `isLocalCapableIntegration(type)`

Für „Loxone lokal"-Templates gilt zusätzlich: nur `loxone_miniserver`-Geräte des jeweils gewählten Miniservers sind zulässig (Templates laufen im Miniserver-Programm).

## Änderungen

### 1. `src/lib/gatewayExecution.ts` (neu)
Klassifizierungs-Helper wie oben.

### 2. `src/components/locations/AutomationRuleBuilder.tsx`
- `GatewayOption` um `integrationType: string` erweitern.
- Neue Prop `integrationType?: string` für den Single-Gateway-Modus (Nicht-MLA).
- In `ConditionEditor` und `ActionEditor`:
  - Wenn `executionMode !== "cloud"`:
    - **MLA**: `gatewayOptions` beim Rendern des Gateway-Dropdowns filtern (`isLocalCapableIntegration`), und bei „Loxone lokal" mit gewähltem Template weiter auf `loxone_miniserver` reduzieren.
    - **Single-Gateway**: Wenn die Integration cloud-only ist, Sensor-/Aktor-Auswahl deaktivieren und einen Hinweis anzeigen: „Diese Integration ist nur mit Ausführungsort ‚Cloud' verfügbar."
  - Bereits gewählte `sensor_uuid`/`actuator_uuid`, die durch den Wechsel nicht mehr zulässig sind, werden geleert und rot markiert („Gerät nicht mit gewähltem Ausführungsort kompatibel").
- `executionMode`-Änderung: `useEffect` bereinigt betroffene Conditions/Actions (Reset auf leere Auswahl statt stillem Fortbestand).
- Speichern-Button wird deaktiviert, solange inkompatible Referenzen existieren.

### 3. `src/components/locations/LocationAutomation.tsx`
- `integrationType` des lokalen Gateways an `AutomationRuleBuilder` durchreichen.
- MLA-Modus: `gatewayOptions` um `integrationType` (aus `gatewayIntegrations[i].integration?.type`) anreichern.

### 4. i18n / Texte
Neue Strings in `src/i18n/de.ts` (+ EN/ES/NL Aliasse):
- `automation.cloudOnlyDeviceHidden`: „Cloud-Geräte sind bei lokaler Ausführung nicht verfügbar."
- `automation.incompatibleSelection`: „Diese Auswahl passt nicht zum Ausführungsort und wurde entfernt."

### 5. Tests
- Unit-Test `AutomationRuleBuilder.test.tsx`: Wechsel des Ausführungsorts entfernt Shelly-Cloud-Aktor aus dem Dropdown und aus einer bereits bestehenden Aktion.
- Snapshot der Gateway-Filterlogik in `gatewayExecution.test.ts`.

## Was nicht geändert wird

- Bestehende Automations in der DB bleiben unverändert. Beim Öffnen im Editor werden sie normal geladen; erst beim Wechsel des Ausführungsorts durch den User wird bereinigt.
- Cloud-Ausführung („Cloud" gewählt) verhält sich exakt wie heute – alle Integrationen bleiben verfügbar.
- Keine Änderungen an Edge Functions oder DB-Schema.
