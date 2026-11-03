import { describe, it, expect } from "vitest";
import { applyTemplate, canUnlockConnector, templateLocks, type ChargerVariant } from "../chargerTemplates";

const elmi: ChargerVariant = { key: "standard", label: "ELMI", charging_type: "DC", connector_types: ["CCS"], max_power_kw: 180, cable_attached: true, supports_connector_lock: false };
const geminiSocket: ChargerVariant = { key: "ac22_socket", label: "AC22", connector_types: ["Type2"], connector_count: 2, max_power_kw: 22, cable_attached: false, supports_connector_lock: true };

describe("Ladestations-Vorlagen", () => {
  it("ELMI All-in-One erlaubt nur CCS, Typ 2 wird ersetzt", () => {
    expect(applyTemplate(elmi, { connector_type: "Type2", connector_count: "1", max_power_kw: "22" }).connector_type).toBe("CCS");
  });
  it("fest angeschlagenes Kabel kann nicht entriegelt werden", () => {
    expect(templateLocks(elmi).canUnlock).toBe(false);
    expect(canUnlockConnector({ cable_attached: true, supports_connector_lock: true })).toBe(false);
  });
  it("Gemini-Steckdose ist entriegelbar und hat 2 Ladepunkte", () => {
    const r = applyTemplate(geminiSocket, { connector_type: "", connector_count: "1", max_power_kw: "22" });
    expect(r.connector_count).toBe("2");
    expect(templateLocks(geminiSocket).canUnlock).toBe(true);
  });
  it("Leistung über der Vorlagengrenze wird auf die Grenze gesetzt, darunter bleibt sie", () => {
    expect(applyTemplate(geminiSocket, { connector_type: "Type2", connector_count: "2", max_power_kw: "44" }).max_power_kw).toBe("22");
    expect(applyTemplate(geminiSocket, { connector_type: "Type2", connector_count: "2", max_power_kw: "11" }).max_power_kw).toBe("11");
  });
  it("Altbestand ohne Angabe bleibt entriegelbar", () => {
    expect(canUnlockConnector({})).toBe(true);
  });
});
