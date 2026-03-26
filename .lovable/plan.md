

## Siemens IOT2050 – Gateway-Integration

### Recherche-Ergebnis

Das Siemens IOT2050 ist ein **industrieller Edge-PC** (kein Cloud-Service). Es hat keine eigene REST-API, über die man Daten abrufen kann. Stattdessen läuft darauf typischerweise **Node-RED**, das Daten von Modbus-Zählern (z.B. Siemens SENTRON PAC) liest und per **MQTT oder HTTP POST** an einen Endpunkt weiterleitet.

**Integrationsstrategie:** Das IOT2050 wird so konfiguriert, dass es Messwerte per HTTP POST an unseren bestehenden `gateway-ingest`-Endpunkt pusht. Wir brauchen also **keine neue Edge Function**, sondern nur einen neuen Gateway-Typ im Registry, der dem Nutzer die Konfigurationsanleitung und den API-Key bereitstellt.

Das ist identisch zum Muster des bestehenden Gateway-Worker-Containers (siehe `docs/gateway-worker/`).

---

### Lösung

**1. `src/lib/gatewayRegistry.ts` – Neuer Gateway-Typ `siemens_iot2050`**

```typescript
siemens_iot2050: {
  type: "siemens_iot2050",
  label: "Siemens IOT2050",
  icon: "cpu",
  description: "Siemens IOT2050 Edge-Gateway mit Node-RED (HTTP Push)",
  edgeFunctionName: "gateway-ingest",
  configFields: [
    { name: "device_name", label: "Gerätename", placeholder: "IOT2050-Energie-01", type: "text",
      description: "Bezeichnung des IOT2050 zur Identifikation", required: false },
    { name: "node_red_url", label: "Node-RED URL (optional)", placeholder: "http://192.168.1.100:1880", type: "url",
      description: "Lokale URL der Node-RED-Instanz (nur für Dokumentation)", required: false },
  ],
}
```

Da das IOT2050 Daten an `gateway-ingest` pusht (wie der Gateway Worker), wird als `edgeFunctionName` `"gateway-ingest"` gesetzt. Die eigentliche Authentifizierung erfolgt über den `GATEWAY_API_KEY`, der bereits im System existiert.

**2. `src/lib/__tests__/gatewayRegistry.test.ts` – Tests erweitern**

Test für den neuen Gateway-Typ hinzufügen (Existenz, Felder, edgeFunctionName).

### Dateien
- `src/lib/gatewayRegistry.ts` – 1 neuer Gateway-Typ
- `src/lib/__tests__/gatewayRegistry.test.ts` – Tests erweitern

### Hinweis
Es wird keine neue Edge Function benötigt – der IOT2050 nutzt denselben `gateway-ingest`-Endpunkt wie der Gateway Worker. Der Kunde muss in Node-RED einen HTTP-Request-Node konfigurieren, der die Messwerte im bestehenden Format an `POST /functions/v1/gateway-ingest` mit `Authorization: Bearer <GATEWAY_API_KEY>` sendet.

