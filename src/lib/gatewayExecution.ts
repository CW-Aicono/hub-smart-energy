/**
 * Classification of gateway integration types by execution capability.
 *
 * "Cloud-only" integrations are only reachable via provider cloud APIs.
 * They MUST NOT be used when an automation runs on a local runtime
 * (execution_mode = "loxone_local" or "hybrid"), because the local
 * runtime (Miniserver / AICONO Gateway) cannot reach these devices.
 */

export const LOCAL_CAPABLE_INTEGRATION_TYPES = new Set<string>([
  "loxone_miniserver",
  "loxone_miniserver_go",
  "aicono_gateway",
  "schneider_panel_server",
  "siemens_iot2050",
  "sentron_powercenter_3000",
  "mqtt_generic",
  "shelly_mqtt",
  "smart_meter_imsys",
]);

export const CLOUD_ONLY_INTEGRATION_TYPES = new Set<string>([
  "shelly_cloud",
  "tuya_cloud",
  "abb_free_at_home",
  "siemens_building_x",
  "homematic_ip",
  "omada_cloud",
  "schneider_cloud",
]);

export function isCloudOnlyIntegration(type?: string | null): boolean {
  return !!type && CLOUD_ONLY_INTEGRATION_TYPES.has(type);
}

export function isLocalCapableIntegration(type?: string | null): boolean {
  return !!type && LOCAL_CAPABLE_INTEGRATION_TYPES.has(type);
}

export type AutomationExecutionMode = "cloud" | "loxone_local" | "hybrid";

/**
 * Whether a device on the given integration type may be used with the
 * given automation execution mode.
 */
export function isDeviceAllowedForExecutionMode(
  integrationType: string | null | undefined,
  mode: AutomationExecutionMode,
): boolean {
  if (mode === "cloud") return true;
  // For local & hybrid modes, cloud-only integrations are forbidden.
  return !isCloudOnlyIntegration(integrationType);
}
