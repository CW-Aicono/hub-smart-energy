import { describe, it, expect } from "vitest";
import {
  getGatewayTypes,
  getGatewayDefinition,
  getEdgeFunctionName,
  GATEWAY_DEFINITIONS,
} from "../gatewayRegistry";

describe("gatewayRegistry", () => {
  describe("getGatewayTypes", () => {
    it("returns all gateway definitions as an array", () => {
      const types = getGatewayTypes();
      expect(types.length).toBe(Object.keys(GATEWAY_DEFINITIONS).length);
      expect(types.length).toBeGreaterThan(0);
    });

    it("each definition has required fields", () => {
      for (const def of getGatewayTypes()) {
        expect(def.type).toBeTruthy();
        expect(def.label).toBeTruthy();
        expect(def.icon).toBeTruthy();
        expect(def.edgeFunctionName).toBeTruthy();
        expect(Array.isArray(def.configFields)).toBe(true);
        expect(def.configFields.length).toBeGreaterThan(0);
      }
    });
  });

  describe("getGatewayDefinition", () => {
    it("returns definition for known type", () => {
      const def = getGatewayDefinition("loxone_miniserver");
      expect(def).toBeDefined();
      expect(def!.label).toBe("Loxone Miniserver");
      expect(def!.edgeFunctionName).toBe("loxone-api");
    });

    it("returns undefined for unknown type", () => {
      expect(getGatewayDefinition("nonexistent_gateway")).toBeUndefined();
    });

    it("returns correct definition for each known type", () => {
      for (const [key, expected] of Object.entries(GATEWAY_DEFINITIONS)) {
        const def = getGatewayDefinition(key);
        expect(def).toBe(expected);
      }
    });
  });

  describe("getEdgeFunctionName", () => {
    it("returns correct edge function for known types", () => {
      expect(getEdgeFunctionName("loxone_miniserver")).toBe("loxone-api");
      expect(getEdgeFunctionName("shelly_cloud")).toBe("shelly-api");
      expect(getEdgeFunctionName("home_assistant")).toBe("home-assistant-api");
      expect(getEdgeFunctionName("omada_cloud")).toBe("omada-api");
      expect(getEdgeFunctionName("schneider_panel_server")).toBe("gateway-ingest");
      expect(getEdgeFunctionName("schneider_cloud")).toBe("schneider-api");
    });

    it("falls back to loxone-api for unknown type", () => {
      expect(getEdgeFunctionName("unknown_type")).toBe("loxone-api");
      expect(getEdgeFunctionName("")).toBe("loxone-api");
    });
  });

  describe("configFields", () => {
    it("loxone requires serial_number, username, password", () => {
      const fields = GATEWAY_DEFINITIONS.loxone_miniserver.configFields;
      const names = fields.map((f) => f.name);
      expect(names).toContain("serial_number");
      expect(names).toContain("username");
      expect(names).toContain("password");
      expect(fields.every((f) => f.required)).toBe(true);
    });

    it("omada has an optional device_id field", () => {
      const fields = GATEWAY_DEFINITIONS.omada_cloud.configFields;
      const deviceId = fields.find((f) => f.name === "device_id");
      expect(deviceId).toBeDefined();
      expect(deviceId!.required).toBe(false);
    });

    it("home_assistant has optional entity_filter", () => {
      const fields = GATEWAY_DEFINITIONS.home_assistant.configFields;
      const filter = fields.find((f) => f.name === "entity_filter");
      expect(filter).toBeDefined();
      expect(filter!.required).toBe(false);
    });

    it("schneider_panel_server has optional webhook_secret and device_mapping", () => {
      const fields = GATEWAY_DEFINITIONS.schneider_panel_server.configFields;
      expect(fields.every((f) => !f.required)).toBe(true);
      expect(fields.map((f) => f.name)).toContain("webhook_secret");
      expect(fields.map((f) => f.name)).toContain("device_mapping");
    });

    it("siemens_iot2050 has optional device_name and node_red_url", () => {
      const fields = GATEWAY_DEFINITIONS.siemens_iot2050.configFields;
      expect(fields.every((f) => !f.required)).toBe(true);
      expect(fields.map((f) => f.name)).toContain("device_name");
      expect(fields.map((f) => f.name)).toContain("node_red_url");
      expect(GATEWAY_DEFINITIONS.siemens_iot2050.edgeFunctionName).toBe("gateway-ingest");
    });

    it("sentron_powercenter_3000 requires api_url and device_ids, poll_interval optional", () => {
      const fields = GATEWAY_DEFINITIONS.sentron_powercenter_3000.configFields;
      const names = fields.map((f) => f.name);
      expect(names).toContain("api_url");
      expect(names).toContain("device_ids");
      expect(names).toContain("poll_interval");
      expect(fields.find((f) => f.name === "api_url")!.required).toBe(true);
      expect(fields.find((f) => f.name === "device_ids")!.required).toBe(true);
      expect(fields.find((f) => f.name === "poll_interval")!.required).toBe(false);
      expect(GATEWAY_DEFINITIONS.sentron_powercenter_3000.edgeFunctionName).toBe("sentron-poc3000-api");
    });

    it("schneider_cloud requires api_url, client_id, client_secret, site_id", () => {
      const fields = GATEWAY_DEFINITIONS.schneider_cloud.configFields;
      const names = fields.map((f) => f.name);
      expect(names).toContain("api_url");
      expect(names).toContain("client_id");
      expect(names).toContain("client_secret");
      expect(names).toContain("site_id");
      expect(fields.every((f) => f.required)).toBe(true);
    });
  });
});
