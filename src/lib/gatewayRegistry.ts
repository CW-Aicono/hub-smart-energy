/**
 * Gateway Registry – defines config schemas, UI fields and edge function
 * routing for all supported building automation gateways.
 */

export interface GatewayConfigField {
  name: string;
  label: string;
  placeholder: string;
  type: "text" | "password" | "url";
  description?: string;
  required: boolean;
}

export interface GatewaySetupInstructions {
  serverField: string; // which config field or derived value to show as server
  port: string;
  pathTemplate: string; // may contain {tenant_id}
  authMethod: string;
}

export interface GatewayDefinition {
  type: string;
  label: string;
  icon: string; // lucide icon name
  description: string;
  edgeFunctionName: string;
  configFields: GatewayConfigField[];
  setupInstructions?: GatewaySetupInstructions;
}

export const GATEWAY_DEFINITIONS: Record<string, GatewayDefinition> = {
  loxone_miniserver: {
    type: "loxone_miniserver",
    label: "Loxone Miniserver",
    icon: "server",
    description: "Loxone Miniserver über Cloud DNS",
    edgeFunctionName: "loxone-api",
    configFields: [
      { name: "serial_number", label: "Seriennummer", placeholder: "504F94A0XXXX", type: "text", description: "Seriennummer des Loxone Miniservers", required: true },
      { name: "username", label: "Benutzername", placeholder: "admin", type: "text", required: true },
      { name: "password", label: "Passwort", placeholder: "••••••••", type: "password", required: true },
    ],
  },
  shelly_cloud: {
    type: "shelly_cloud",
    label: "Shelly Cloud",
    icon: "zap",
    description: "Shelly Geräte über Cloud API (z.B. Pro 3EM)",
    edgeFunctionName: "shelly-api",
    configFields: [
      { name: "server_uri", label: "Cloud Server URI", placeholder: "shelly-103-eu.shelly.cloud", type: "text", description: "Zu finden unter Shelly App → Einstellungen → Cloud-Autorisierung", required: true },
      { name: "auth_key", label: "Auth Key", placeholder: "MmE5NTAxxxxxxxxxx", type: "password", description: "Cloud-Autorisierungsschlüssel aus der Shelly App", required: true },
    ],
  },
  abb_free_at_home: {
    type: "abb_free_at_home",
    label: "ABB free@home",
    icon: "home",
    description: "ABB free@home System Access Point über Cloud API",
    edgeFunctionName: "abb-api",
    configFields: [
      { name: "api_url", label: "API URL", placeholder: "https://mybuilding.abb.com", type: "url", description: "URL des ABB myBUILDINGS Portals", required: true },
      { name: "client_id", label: "Client ID", placeholder: "client-id", type: "text", description: "OAuth2 Client ID aus dem ABB Developer Portal", required: true },
      { name: "client_secret", label: "Client Secret", placeholder: "••••••••", type: "password", description: "OAuth2 Client Secret", required: true },
      { name: "system_id", label: "System ID", placeholder: "00000000-0000-0000-0000-000000000000", type: "text", description: "ID des free@home Systems", required: true },
    ],
  },
  siemens_building_x: {
    type: "siemens_building_x",
    label: "Siemens Building X",
    icon: "building",
    description: "Siemens Building X Cloud-Plattform",
    edgeFunctionName: "siemens-api",
    configFields: [
      { name: "api_url", label: "API URL", placeholder: "https://api.2.siemens.com", type: "url", description: "Building X API Endpunkt", required: true },
      { name: "client_id", label: "Client ID", placeholder: "client-id", type: "text", description: "OAuth2 Client Credentials", required: true },
      { name: "client_secret", label: "Client Secret", placeholder: "••••••••", type: "password", description: "OAuth2 Client Secret", required: true },
      { name: "partition_id", label: "Partition ID", placeholder: "partition-id", type: "text", description: "Building X Partition / Projekt-ID", required: true },
    ],
  },
  tuya_cloud: {
    type: "tuya_cloud",
    label: "Tuya Smart",
    icon: "plug-zap",
    description: "Tuya IoT Cloud für Smart-Home-Energiemonitoring",
    edgeFunctionName: "tuya-api",
    configFields: [
      { name: "access_id", label: "Access ID", placeholder: "pxxxxxxxxxxxxxxxx", type: "text", description: "Tuya IoT Platform Access ID", required: true },
      { name: "access_secret", label: "Access Secret", placeholder: "••••••••", type: "password", description: "Tuya IoT Platform Access Secret", required: true },
      { name: "region", label: "Region", placeholder: "eu", type: "text", description: "API Region: eu, us, cn, in (Standard: eu)", required: true },
    ],
  },
  homematic_ip: {
    type: "homematic_ip",
    label: "Homematic IP",
    icon: "radio",
    description: "Homematic IP Cloud über Access Point",
    edgeFunctionName: "homematic-api",
    configFields: [
      { name: "access_point_sgtin", label: "Access Point SGTIN", placeholder: "3014-xxxx-xxxx-xxxx-xxxx-xxxx", type: "text", description: "SGTIN des Homematic IP Access Points (auf der Unterseite)", required: true },
      { name: "auth_token", label: "Auth Token", placeholder: "••••••••", type: "password", description: "Autorisierungs-Token (über die Homematic IP App generierbar)", required: true },
      { name: "client_id", label: "Client ID", placeholder: "client-id", type: "text", description: "Client-Kennung für die API-Registrierung", required: true },
    ],
  },
  omada_cloud: {
    type: "omada_cloud",
    label: "TP-Link Omada",
    icon: "network",
    description: "TP-Link Omada Cloud Controller für Netzwerkinfrastruktur",
    edgeFunctionName: "omada-api",
    configFields: [
      { name: "api_url", label: "API URL", placeholder: "https://euw1-northbound-omada-controller.tplinkcloud.com", type: "url", description: "Northbound API Endpunkt (regional, z.B. euw1-northbound-omada-controller.tplinkcloud.com)", required: true },
      { name: "omada_id", label: "Omada Controller ID", placeholder: "z.B. 244500771d29f9dd75dfa5217e04689d", type: "text", description: "omadacId aus der Open API Verwaltung im Omada Cloud Portal", required: true },
      { name: "device_id", label: "Device ID (optional)", placeholder: "z.B. 15F3D33583523FAD...", type: "text", description: "Geräte-ID als Fallback falls Controller-ID nicht funktioniert", required: false },
      { name: "client_id", label: "Client ID", placeholder: "client-id", type: "text", description: "OAuth2 Client ID aus der Omada Open API Verwaltung", required: true },
      { name: "client_secret", label: "Client Secret", placeholder: "••••••••", type: "password", description: "OAuth2 Client Secret", required: true },
    ],
  },
  aicono_gateway: {
    type: "aicono_gateway",
    label: "AICONO Gateway",
    icon: "house",
    description: "AICONO EMS Gateway (Raspberry Pi mit Home Assistant Add-on) – verbindet sich per WebSocket mit der Cloud. Identifikation über MAC-Adresse + Benutzername + Passwort (kein Cloudflare-Tunnel nötig).",
    edgeFunctionName: "gateway-ws",
    configFields: [],
    setupInstructions: {
      serverField: "__supabase_host__",
      port: "443",
      pathTemplate: "functions/v1/gateway-ws",
      authMethod: "MAC-Adresse + Benutzername + Passwort (im Add-on hinterlegen)",
    },
  },
  schneider_panel_server: {
    type: "schneider_panel_server",
    label: "Schneider EcoStruxure Panel Server",
    icon: "gauge",
    description: "Schneider Electric Panel Server (PAS600/PAS800) via HTTPS Push",
    edgeFunctionName: "gateway-ingest",
    configFields: [
      { name: "push_username", label: "Benutzername", placeholder: "panel-server-user", type: "text", description: "Benutzername für die HTTPS-Publikation (wird im Panel Server hinterlegt)", required: true },
      { name: "push_password", label: "Passwort", placeholder: "••••••••", type: "password", description: "Passwort für die HTTPS-Publikation", required: true },
      { name: "webhook_secret", label: "Webhook Secret (optional)", placeholder: "••••••••", type: "password", description: "Shared Secret zur Authentifizierung der eingehenden Pushes vom Panel Server", required: false },
      { name: "device_mapping", label: "Device-Mapping (optional)", placeholder: "modbus:2=meter-uuid,modbus:3=meter-uuid", type: "text", description: "Zuordnung von Schneider Device-IDs zu Meter-UUIDs (kommagetrennt, Format: deviceId=meterUuid)", required: false },
    ],
    setupInstructions: {
      serverField: "__supabase_host__",
      port: "443",
      pathTemplate: "functions/v1/gateway-ingest?action=schneider-push&tenant_id={tenant_id}",
      authMethod: "ID-Authentifizierung (Benutzername / Passwort)",
    },
  },
  siemens_iot2050: {
    type: "siemens_iot2050",
    label: "Siemens IOT2050",
    icon: "cpu",
    description: "Siemens IOT2050 Edge-Gateway mit Node-RED (HTTP Push)",
    edgeFunctionName: "gateway-ingest",
    configFields: [
      { name: "device_name", label: "Gerätename", placeholder: "IOT2050-Energie-01", type: "text", description: "Bezeichnung des IOT2050 zur Identifikation", required: false },
      { name: "node_red_url", label: "Node-RED URL (optional)", placeholder: "http://192.168.1.100:1880", type: "url", description: "Lokale URL der Node-RED-Instanz (nur für Dokumentation)", required: false },
    ],
  },
  sentron_powercenter_3000: {
    type: "sentron_powercenter_3000",
    label: "Siemens Sentron Powercenter 3000",
    icon: "gauge",
    description: "Siemens Sentron Powercenter 3000 – lokale REST API für Energiemonitoring",
    edgeFunctionName: "sentron-poc3000-api",
    configFields: [
      { name: "api_url", label: "API URL", placeholder: "https://poc3000.meingebaeude.de", type: "url", description: "Externe URL des Powercenter 3000 (Reverse Proxy / VPN)", required: true },
      { name: "device_ids", label: "Device IDs", placeholder: "uuid1,uuid2", type: "text", description: "Kommagetrennte Device-UUIDs aus der Powercenter Web-Oberfläche", required: true },
      { name: "poll_interval", label: "Abrufintervall (Sekunden)", placeholder: "60", type: "text", description: "Intervall in Sekunden für den Datenabruf (Standard: 60)", required: false },
    ],
  },
  mqtt_generic: {
    type: "mqtt_generic",
    label: "MQTT-Gerät (generisch)",
    icon: "radio-tower",
    description: "Generische Anbindung beliebiger MQTT-fähiger Geräte (Tasmota, ESPHome, Zigbee2MQTT, KNX-MQTT, Wechselrichter, Wärmepumpen, ...) über den AICONO Cloud-Broker. Unterstützt bidirektionale Schaltbefehle und Home-Assistant-Auto-Discovery.",
    edgeFunctionName: "gateway-ingest",
    configFields: [
      { name: "broker_url", label: "Broker URL", placeholder: "mqtts://mqtt.aicono.org:8883", type: "url", description: "TLS-MQTT-Endpunkt des AICONO Cloud-Brokers (Klartext-Verbindungen werden abgelehnt)", required: true },
      { name: "username", label: "Benutzername", placeholder: "tenant-mustermann", type: "text", description: "Mandantenspezifischer MQTT-Benutzer (wird im Wizard generiert)", required: true },
      { name: "password", label: "Passwort", placeholder: "••••••••", type: "password", description: "MQTT-Passwort (wird einmalig im Klartext angezeigt, danach nur als Hash gespeichert)", required: true },
      { name: "topic_prefix", label: "Topic-Präfix", placeholder: "aicono/tenant-mustermann/#", type: "text", description: "Alle Topics, die diese Bridge für den Mandanten abonniert (Wildcards #/+ erlaubt)", required: true },
      { name: "payload_format", label: "Payload-Format", placeholder: "json", type: "text", description: "Eines von: json, tasmota, esphome, homie, raw_value, shelly_gen2", required: true },
      { name: "device_mapping", label: "Device-Mapping (optional)", placeholder: "tasmota/wallbox1/SENSOR=meter-uuid,esphome/hp/power=meter-uuid", type: "text", description: "Zuordnung Topic-Pattern → Meter-UUID, kommagetrennt. Bei aktivierter Auto-Discovery optional.", required: false },
      { name: "auto_discovery", label: "HA-Auto-Discovery", placeholder: "true", type: "text", description: "true/false – aktiviert Home-Assistant-Discovery (homeassistant/.../config). Auto-erkannte Geräte müssen in der UI bestätigt werden.", required: false },
    ],
    setupInstructions: {
      serverField: "broker_url",
      port: "8883",
      pathTemplate: "{topic_prefix}",
      authMethod: "Username/Password über TLS (mqtts://)",
    },
  },
  shelly_mqtt: {
    type: "shelly_mqtt",
    label: "Shelly Gen2+ via MQTT",
    icon: "zap",
    description: "Shelly Gen2/Gen3 Geräte über MQTT (statt Cloud-Polling). Eine MQTT-Verbindung ersetzt N Polling-Loops. Konfiguration im Shelly-Webinterface unter Einstellungen → MQTT.",
    edgeFunctionName: "gateway-ingest",
    configFields: [
      { name: "broker_url", label: "Broker URL", placeholder: "mqtts://mqtt.aicono.org:8883", type: "url", description: "AICONO Cloud-Broker (identisch zu mqtt_generic)", required: true },
      { name: "username", label: "Benutzername", placeholder: "tenant-mustermann", type: "text", required: true },
      { name: "password", label: "Passwort", placeholder: "••••••••", type: "password", required: true },
      { name: "topic_prefix", label: "Topic-Präfix", placeholder: "aicono/tenant-mustermann/shellies/#", type: "text", description: "Empfohlen: aicono/<slug>/shellies/# – Shelly Gen2+ veröffentlicht unter shellies/<id>/status/em:0 etc.", required: true },
      { name: "payload_format", label: "Payload-Format", placeholder: "shelly_gen2", type: "text", description: "Standard: shelly_gen2 (Gen1 nicht unterstützt → bitte shelly_cloud verwenden)", required: true },
    ],
    setupInstructions: {
      serverField: "broker_url",
      port: "8883",
      pathTemplate: "{topic_prefix}",
      authMethod: "Username/Password über TLS (mqtts://)",
    },
  },
  schneider_cloud: {
    type: "schneider_cloud",
    label: "Schneider EcoStruxure Cloud",
    icon: "cloud",
    description: "Schneider Electric EcoStruxure Energy Hub – GraphQL Cloud API",
    edgeFunctionName: "schneider-api",
    configFields: [
      { name: "api_url", label: "GraphQL API URL", placeholder: "https://api.exchange.se.com", type: "url", description: "EcoStruxure Energy Hub GraphQL API-Basis-URL (Standard: https://api.exchange.se.com)", required: false },
      { name: "token_url", label: "Token URL", placeholder: "https://api.se.com/token", type: "url", description: "OAuth2 Token-Endpunkt (Standard: https://api.se.com/token)", required: false },
      { name: "client_id", label: "Client ID", placeholder: "client-id", type: "text", description: "OAuth2 Client ID aus dem Schneider Exchange Developer Portal (Integrations → Create new access client)", required: true },
      { name: "client_secret", label: "Client Secret", placeholder: "••••••••", type: "password", description: "OAuth2 Client Secret", required: true },
      { name: "site_id", label: "Site ID", placeholder: "site-uuid", type: "text", description: "Site/Building ID aus dem EcoStruxure Energy Hub Portal", required: true },
    ],
  },
};

/** Get ordered list of gateway types for dropdowns */
export function getGatewayTypes(): GatewayDefinition[] {
  return Object.values(GATEWAY_DEFINITIONS);
}

/** Get definition by type slug */
export function getGatewayDefinition(type: string): GatewayDefinition | undefined {
  return GATEWAY_DEFINITIONS[type];
}

/** Get the edge function name for a given integration type */
export function getEdgeFunctionName(integrationType: string): string {
  return GATEWAY_DEFINITIONS[integrationType]?.edgeFunctionName || "loxone-api";
}
