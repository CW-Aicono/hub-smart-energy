/**
 * Action Executor – Integration-specific payload builders
 * ========================================================
 * Shared between Cloud Scheduler and HA Add-on.
 */

import type { AutomationAction } from "./types.ts";

/** Maps integration types to their Edge Function names (Cloud only) */
export const GATEWAY_EDGE_FUNCTIONS: Record<string, string> = {
  loxone_miniserver: "loxone-api",
  shelly_cloud: "shelly-api",
  abb_free_at_home: "abb-api",
  siemens_building_x: "siemens-api",
  tuya_cloud: "tuya-api",
  homematic_ip: "homematic-api",
  omada_cloud: "omada-api",
  home_assistant: "home-assistant-api",
  schneider_panel_server: "gateway-ingest",
  schneider_cloud: "schneider-api",
  sentron_powercenter_3000: "sentron-poc3000-api",
};

export function getEdgeFunction(integrationType: string): string {
  return GATEWAY_EDGE_FUNCTIONS[integrationType] || "loxone-api";
}

/**
 * Build the correct payload for each integration type.
 * Home Assistant needs domain/service/entity_id.
 */
export function buildActionPayload(
  integrationType: string,
  locationIntegrationId: string,
  action: AutomationAction,
): Record<string, unknown> {
  const commandValue = action.action_value || action.action_type || "pulse";

  if (integrationType === "home_assistant") {
    const entityId = action.actuator_uuid;
    const domain = entityId.split(".")[0];

    let service = "toggle";
    const cmd = commandValue.toLowerCase();
    if (cmd === "on") service = "turn_on";
    else if (cmd === "off") service = "turn_off";
    else if (cmd === "toggle") service = "toggle";
    else if (cmd === "pulse") service = "toggle";
    else if (domain === "cover") {
      if (cmd === "open") service = "open_cover";
      else if (cmd === "close") service = "close_cover";
      else if (cmd === "stop") service = "stop_cover";
      else service = "toggle";
    }

    return {
      locationIntegrationId,
      action: "executeCommand",
      domain,
      service,
      entity_id: entityId,
    };
  }

  return {
    locationIntegrationId,
    action: "executeCommand",
    controlUuid: action.actuator_uuid,
    commandValue,
  };
}

/**
 * Build HA REST API call parameters for local execution (no Edge Function needed).
 */
export function buildHALocalPayload(action: AutomationAction): {
  domain: string;
  service: string;
  entity_id: string;
  service_data?: Record<string, unknown>;
} {
  const entityId = action.actuator_uuid;
  const domain = entityId.split(".")[0];
  const commandValue = action.action_value || action.action_type || "pulse";

  let service = "toggle";
  const cmd = commandValue.toLowerCase();
  if (cmd === "on") service = "turn_on";
  else if (cmd === "off") service = "turn_off";
  else if (cmd === "toggle") service = "toggle";
  else if (cmd === "pulse") service = "toggle";
  else if (domain === "cover") {
    if (cmd === "open") service = "open_cover";
    else if (cmd === "close") service = "close_cover";
    else if (cmd === "stop") service = "stop_cover";
    else service = "toggle";
  }

  return { domain, service, entity_id: entityId };
}
