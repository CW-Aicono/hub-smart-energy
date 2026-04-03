/**
 * Shared Automation Types
 * Used by both Cloud Scheduler (Deno) and HA Add-on (Node.js)
 */

export interface AutomationCondition {
  id: string;
  type: "sensor_value" | "time" | "weekday" | "status" | "time_point" | "time_switch";
  sensor_uuid?: string;
  operator?: string;
  value?: number;
  time_from?: string;
  time_to?: string;
  time_point?: string;
  time_points?: string[];
  weekdays?: number[];
  actuator_uuid?: string;
  expected_status?: string;
  gateway_id?: string;
}

export interface AutomationAction {
  actuator_uuid: string;
  action_type: string;
  action_value?: string;
  gateway_id?: string;
}

export interface AutomationRule {
  id: string;
  name: string;
  tenant_id: string;
  location_id: string;
  location_integration_id?: string;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  logic_operator: "AND" | "OR";
  is_active: boolean;
  last_executed_at?: string | null;
  updated_at: string;
  // Legacy single-action fields
  actuator_uuid?: string;
  action_value?: string;
  action_type?: string;
}

export interface TimeParts {
  hours: number;
  minutes: number;
  weekday: number;
  timeStr: string;
}

export interface SensorValue {
  uuid: string;
  value: number | string;
}

/**
 * Interface for fetching sensor values.
 * Cloud implementation calls Edge Functions; local implementation calls HA REST API.
 */
export interface SensorProvider {
  getSensorValue(sensorUuid: string, gatewayId?: string): Promise<SensorValue | null>;
}

/**
 * Interface for executing actions.
 * Cloud implementation calls Edge Functions; local implementation calls HA REST API directly.
 */
export interface ActionExecutor {
  execute(action: AutomationAction, locationIntegrationId: string): Promise<void>;
}

export interface EvaluationResult {
  automationId: string;
  conditionsMet: boolean;
  conditionResults: boolean[];
}

export interface ExecutionLogEntry {
  automation_id: string;
  tenant_id: string;
  trigger_type: "scheduled" | "manual";
  status: "success" | "error";
  error_message?: string;
  actions_executed?: AutomationAction[];
  duration_ms?: number;
  execution_source: "cloud" | "local";
}
