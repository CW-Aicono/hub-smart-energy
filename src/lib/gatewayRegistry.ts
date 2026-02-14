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

export interface GatewayDefinition {
  type: string;
  label: string;
  icon: string; // lucide icon name
  description: string;
  edgeFunctionName: string;
  configFields: GatewayConfigField[];
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
      { name: "api_url", label: "API URL", placeholder: "https://euw1-omada-northbound.tplinkcloud.com", type: "url", description: "Omada Open API Endpunkt (regional)", required: true },
      { name: "omada_id", label: "Omada Controller ID", placeholder: "z.B. 244500771d29f9dd75dfa5217e04689d", type: "text", description: "Controller-ID aus dem Omada Cloud Portal (omadacId in der URL)", required: true },
      { name: "device_id", label: "Device ID (optional)", placeholder: "z.B. 15F3D33583523FAD...", type: "text", description: "Geräte-ID falls Controller-ID nicht funktioniert (deviceId aus der URL)", required: false },
      { name: "client_id", label: "Client ID", placeholder: "client-id", type: "text", description: "OAuth2 Client ID aus der Omada Open API Verwaltung", required: true },
      { name: "client_secret", label: "Client Secret", placeholder: "••••••••", type: "password", description: "OAuth2 Client Secret", required: true },
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
