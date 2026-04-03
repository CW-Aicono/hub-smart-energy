/**
 * Shared Automation Evaluator
 * ============================
 * Ported 1:1 from automation-scheduler/index.ts.
 * Used by both Cloud Scheduler and HA Add-on.
 */

import type {
  AutomationCondition,
  AutomationRule,
  TimeParts,
  SensorProvider,
  EvaluationResult,
} from "./types.ts";

export const DEBOUNCE_MINUTES = 5;

/** Get current time parts in a given IANA timezone */
export function getLocalTimeParts(timezone: string): TimeParts {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("de-DE", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const hours = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
  const minutes = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
  const timeStr = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;

  const dayFormatter = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" });
  const dayStr = dayFormatter.format(now);
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const weekday = dayMap[dayStr] ?? 0;

  return { hours, minutes, weekday, timeStr };
}

/** Check if current time is within a time window (handles overnight ranges) */
export function isTimeInRange(currentTime: string, timeFrom: string, timeTo: string): boolean {
  if (timeFrom <= timeTo) {
    return currentTime >= timeFrom && currentTime <= timeTo;
  } else {
    return currentTime >= timeFrom || currentTime <= timeTo;
  }
}

/** Check if current time is within ±2 minutes of a target time point */
export function isNearTimePoint(currentTimeStr: string, targetTime: string): boolean {
  const [tH, tM] = targetTime.split(":").map(Number);
  const targetMin = tH * 60 + tM;
  const [cH, cM] = currentTimeStr.split(":").map(Number);
  const currentMin = cH * 60 + cM;
  const diff = Math.abs(currentMin - targetMin);
  return diff <= 2 || diff >= (24 * 60 - 2);
}

/** Check if debounce period has elapsed */
export function isDebounceExpired(lastExecutedAt: string | null | undefined): boolean {
  if (!lastExecutedAt) return true;
  const lastExec = new Date(lastExecutedAt);
  const diffMs = Date.now() - lastExec.getTime();
  return diffMs >= DEBOUNCE_MINUTES * 60 * 1000;
}

/**
 * Evaluate a single condition against current time and sensor data.
 */
export async function evaluateCondition(
  condition: AutomationCondition,
  timeParts: TimeParts,
  sensorProvider: SensorProvider,
): Promise<boolean> {
  switch (condition.type) {
    case "time": {
      if (condition.time_from && condition.time_to) {
        return isTimeInRange(timeParts.timeStr, condition.time_from, condition.time_to);
      }
      return false;
    }

    case "time_point": {
      if (condition.time_point) {
        return isNearTimePoint(timeParts.timeStr, condition.time_point);
      }
      return false;
    }

    case "time_switch": {
      if (condition.time_points && condition.time_points.length > 0) {
        return condition.time_points.some((tp) => isNearTimePoint(timeParts.timeStr, tp));
      }
      return false;
    }

    case "weekday": {
      if (condition.weekdays && condition.weekdays.length > 0) {
        return condition.weekdays.includes(timeParts.weekday);
      }
      return false;
    }

    case "sensor_value": {
      if (!condition.sensor_uuid) return false;
      try {
        const sensor = await sensorProvider.getSensorValue(condition.sensor_uuid, condition.gateway_id);
        if (!sensor || sensor.value === undefined) return false;
        const sensorVal = typeof sensor.value === "number" ? sensor.value : parseFloat(String(sensor.value));
        if (!isFinite(sensorVal)) return false;
        const threshold = condition.value ?? 0;
        switch (condition.operator) {
          case ">": return sensorVal > threshold;
          case "<": return sensorVal < threshold;
          case "=": return Math.abs(sensorVal - threshold) < 0.001;
          case ">=": return sensorVal >= threshold;
          case "<=": return sensorVal <= threshold;
          default: return false;
        }
      } catch (e) {
        console.error(`[evaluator] Sensor fetch error for ${condition.sensor_uuid}:`, e);
        return false;
      }
    }

    case "status": {
      if (!condition.actuator_uuid) return false;
      try {
        const sensor = await sensorProvider.getSensorValue(condition.actuator_uuid, condition.gateway_id);
        if (!sensor) return false;
        return String(sensor.value) === String(condition.expected_status);
      } catch (e) {
        console.error(`[evaluator] Status fetch error for ${condition.actuator_uuid}:`, e);
        return false;
      }
    }

    default:
      return false;
  }
}

/**
 * Evaluate all conditions for an automation rule.
 */
export async function evaluateAutomation(
  rule: AutomationRule,
  timezone: string,
  sensorProvider: SensorProvider,
): Promise<EvaluationResult> {
  const timeParts = getLocalTimeParts(timezone);
  const conditionResults: boolean[] = [];

  for (const condition of rule.conditions) {
    const result = await evaluateCondition(condition, timeParts, sensorProvider);
    conditionResults.push(result);
  }

  const conditionsMet = rule.logic_operator === "AND"
    ? conditionResults.every(Boolean)
    : conditionResults.some(Boolean);

  return {
    automationId: rule.id,
    conditionsMet,
    conditionResults,
  };
}

/**
 * Resolve actions from rule (handles legacy single-action format).
 */
export function resolveActions(rule: AutomationRule): AutomationAction[] {
  if (Array.isArray(rule.actions) && rule.actions.length > 0) {
    return rule.actions;
  }
  return [{
    actuator_uuid: rule.actuator_uuid || "",
    action_type: rule.action_value || rule.action_type || "pulse",
    action_value: rule.action_value,
  }];
}
