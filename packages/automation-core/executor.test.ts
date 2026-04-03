import { describe, it, expect } from "vitest";
import {
  getEdgeFunction,
  buildActionPayload,
  buildHALocalPayload,
  GATEWAY_EDGE_FUNCTIONS,
} from "../executor";
import type { AutomationAction } from "../types";

// ---------- getEdgeFunction ----------
describe("getEdgeFunction", () => {
  it("returns correct edge function for known integration types", () => {
    expect(getEdgeFunction("loxone_miniserver")).toBe("loxone-api");
    expect(getEdgeFunction("shelly_cloud")).toBe("shelly-api");
    expect(getEdgeFunction("home_assistant")).toBe("home-assistant-api");
    expect(getEdgeFunction("tuya_cloud")).toBe("tuya-api");
    expect(getEdgeFunction("abb_free_at_home")).toBe("abb-api");
    expect(getEdgeFunction("schneider_panel_server")).toBe("gateway-ingest");
  });

  it("falls back to loxone-api for unknown types", () => {
    expect(getEdgeFunction("unknown_type")).toBe("loxone-api");
  });

  it("has all expected integration types", () => {
    const expectedTypes = [
      "loxone_miniserver", "shelly_cloud", "abb_free_at_home",
      "siemens_building_x", "tuya_cloud", "homematic_ip",
      "omada_cloud", "home_assistant", "schneider_panel_server",
      "schneider_cloud", "sentron_powercenter_3000",
    ];
    for (const type of expectedTypes) {
      expect(GATEWAY_EDGE_FUNCTIONS).toHaveProperty(type);
    }
  });
});

// ---------- buildActionPayload ----------
describe("buildActionPayload", () => {
  const liId = "li-123";

  it("builds generic payload for non-HA integrations", () => {
    const action: AutomationAction = { actuator_uuid: "uuid-1", action_type: "on", action_value: "on" };
    const payload = buildActionPayload("shelly_cloud", liId, action);
    expect(payload).toEqual({
      locationIntegrationId: liId,
      action: "executeCommand",
      controlUuid: "uuid-1",
      commandValue: "on",
    });
  });

  it("builds HA payload with domain/service/entity_id", () => {
    const action: AutomationAction = { actuator_uuid: "light.kitchen", action_type: "on", action_value: "on" };
    const payload = buildActionPayload("home_assistant", liId, action);
    expect(payload).toEqual({
      locationIntegrationId: liId,
      action: "executeCommand",
      domain: "light",
      service: "turn_on",
      entity_id: "light.kitchen",
    });
  });

  it("maps off command to turn_off for HA", () => {
    const action: AutomationAction = { actuator_uuid: "switch.pump", action_type: "off", action_value: "off" };
    const payload = buildActionPayload("home_assistant", liId, action);
    expect(payload.service).toBe("turn_off");
  });

  it("maps toggle command for HA", () => {
    const action: AutomationAction = { actuator_uuid: "switch.pump", action_type: "toggle" };
    const payload = buildActionPayload("home_assistant", liId, action);
    expect(payload.service).toBe("toggle");
  });

  it("maps pulse to toggle for HA", () => {
    const action: AutomationAction = { actuator_uuid: "switch.pump", action_type: "pulse" };
    const payload = buildActionPayload("home_assistant", liId, action);
    expect(payload.service).toBe("toggle");
  });

  it("handles cover commands for HA", () => {
    const open: AutomationAction = { actuator_uuid: "cover.blinds", action_type: "on", action_value: "open" };
    const close: AutomationAction = { actuator_uuid: "cover.blinds", action_type: "on", action_value: "close" };
    const stop: AutomationAction = { actuator_uuid: "cover.blinds", action_type: "on", action_value: "stop" };

    expect(buildActionPayload("home_assistant", liId, open).service).toBe("open_cover");
    expect(buildActionPayload("home_assistant", liId, close).service).toBe("close_cover");
    expect(buildActionPayload("home_assistant", liId, stop).service).toBe("stop_cover");
  });

  it("defaults to pulse when no action_value/action_type", () => {
    const action = { actuator_uuid: "uuid-1" } as AutomationAction;
    const payload = buildActionPayload("loxone_miniserver", liId, action);
    expect(payload.commandValue).toBe("pulse");
  });
});

// ---------- buildHALocalPayload ----------
describe("buildHALocalPayload", () => {
  it("builds correct domain/service/entity_id for turn_on", () => {
    const action: AutomationAction = { actuator_uuid: "light.living", action_type: "on", action_value: "on" };
    const result = buildHALocalPayload(action);
    expect(result).toEqual({ domain: "light", service: "turn_on", entity_id: "light.living" });
  });

  it("handles cover open command", () => {
    const action: AutomationAction = { actuator_uuid: "cover.garage", action_type: "open", action_value: "open" };
    const result = buildHALocalPayload(action);
    expect(result.service).toBe("open_cover");
    expect(result.domain).toBe("cover");
  });

  it("defaults to toggle for unknown commands", () => {
    const action: AutomationAction = { actuator_uuid: "switch.x", action_type: "pulse" };
    const result = buildHALocalPayload(action);
    expect(result.service).toBe("toggle");
  });

  it("extracts domain from entity_id", () => {
    const action: AutomationAction = { actuator_uuid: "climate.thermostat", action_type: "on", action_value: "on" };
    const result = buildHALocalPayload(action);
    expect(result.domain).toBe("climate");
  });
});
