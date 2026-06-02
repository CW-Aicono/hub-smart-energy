import { randomUUID } from "crypto";
import type { Session } from "./chargePointRegistry";
import { log } from "./logger";
import { logOcppMessage } from "./messageLog";
import { upsertCapabilities } from "./backendApi";

/**
 * Erwartete Measurands für Live-Daten (Leistung, Spannung, Strom, Zählerstand).
 * Werden nach GetConfiguration mit der tatsächlich vom Charger unterstützten
 * Menge geschnitten und per ChangeConfiguration gesetzt.
 */
const DESIRED_MEASURANDS = [
  "Energy.Active.Import.Register",
  "Power.Active.Import",
  "Voltage",
  "Current.Import",
];

/** Fallback-Reihenfolge, falls ChangeConfiguration teilweise rejected wird. */
const FALLBACK_PROFILES: string[][] = [
  DESIRED_MEASURANDS,
  ["Energy.Active.Import.Register", "Power.Active.Import", "Voltage"],
  ["Energy.Active.Import.Register", "Power.Active.Import"],
  ["Energy.Active.Import.Register"],
];

interface OcppConfigKey {
  key: string;
  readonly: boolean;
  value?: string;
}

interface GetConfigurationResult {
  configurationKey?: OcppConfigKey[];
  unknownKey?: string[];
}

/** Sendet GetConfiguration → wartet auf Result → setzt sinnvolle Defaults. */
export async function probeChargePointConfiguration(
  session: Session,
  meta: { vendor: string | null; model: string | null },
): Promise<void> {
  if (session.socket.readyState !== session.socket.OPEN) return;

  const result = await sendAndAwait<GetConfigurationResult>(
    session,
    "GetConfiguration",
    {},
    10_000,
  );
  if (!result) {
    log.warn("GetConfiguration: no response", { chargePointId: session.chargePointId });
    return;
  }

  const keys = result.configurationKey ?? [];
  const unknown = result.unknownKey ?? [];
  const configMap: Record<string, { value: string | null; readonly: boolean }> = {};
  for (const k of keys) {
    configMap[k.key] = { value: k.value ?? null, readonly: !!k.readonly };
  }

  // Welche Measurands kennt der Charger laut MeterValuesSampledData(.MaxLength)?
  // OCPP-Spec gibt es keinen direkten "supported measurands"-Key, aber
  // viele Charger listen unterstützte Werte in MeterValuesSampledDataMaxLength
  // oder im aktuellen Wert von MeterValuesSampledData. Wir versuchen beides.
  const currentSampled = configMap["MeterValuesSampledData"]?.value ?? "";
  const supported = new Set<string>();
  currentSampled.split(",").map((s) => s.trim()).filter(Boolean).forEach((m) => supported.add(m));

  await upsertCapabilities(session.chargePointPk, {
    supported_measurands: Array.from(supported),
    unsupported_keys: unknown,
    configuration: configMap,
    vendor: meta.vendor,
    model: meta.model,
  }).catch((e) => log.warn("upsert-capabilities failed", { error: (e as Error).message }));

  // Setze MeterValueSampleInterval / ClockAlignedDataInterval
  await trySetConfig(session, "MeterValueSampleInterval", "30");
  await trySetConfig(session, "ClockAlignedDataInterval", "60");

  // Fallback-Probing für MeterValuesSampledData
  for (const profile of FALLBACK_PROFILES) {
    const ok = await trySetConfig(session, "MeterValuesSampledData", profile.join(","));
    if (ok) {
      log.info("MeterValuesSampledData accepted", {
        chargePointId: session.chargePointId,
        profile,
      });
      // Erkannte Measurands persistieren
      await upsertCapabilities(session.chargePointPk, {
        supported_measurands: profile,
        unsupported_keys: unknown,
        configuration: configMap,
        vendor: meta.vendor,
        model: meta.model,
      }).catch(() => { /* ignore */ });
      return;
    }
  }
  log.warn("All measurand profiles rejected", { chargePointId: session.chargePointId });
}

async function trySetConfig(session: Session, key: string, value: string): Promise<boolean> {
  const result = await sendAndAwait<{ status: string }>(
    session,
    "ChangeConfiguration",
    { key, value },
    8_000,
  );
  return result?.status === "Accepted" || result?.status === "RebootRequired";
}

/** Sendet einen OCPP-CALL und wartet auf CALLRESULT/CALLERROR. */
function sendAndAwait<T>(
  session: Session,
  action: string,
  payload: Record<string, unknown>,
  timeoutMs: number,
): Promise<T | null> {
  return new Promise((resolve) => {
    const uniqueId = randomUUID();
    const call = [2, uniqueId, action, payload];
    const callStr = JSON.stringify(call);

    let resolved = false;
    const finish = (val: T | null) => {
      if (resolved) return;
      resolved = true;
      session.pendingCalls.delete(uniqueId);
      resolve(val);
    };

    session.pendingCalls.set(uniqueId, {
      commandId: `probe:${uniqueId}`,
      createdAt: Date.now(),
      command: action,
      chargePointPk: session.chargePointPk,
      resolveProbe: (ok: boolean, p: unknown) => finish(ok ? (p as T) : null),
    });

    logOcppMessage(session.chargePointPk, "outgoing", callStr).catch(() => {});
    try {
      session.socket.send(callStr);
      session.lastOutgoingAt = Date.now();
    } catch (e) {
      log.error("probe send failed", { action, error: (e as Error).message });
      finish(null);
      return;
    }
    setTimeout(() => finish(null), timeoutMs);
  });
}
