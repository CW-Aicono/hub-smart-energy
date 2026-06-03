import { randomUUID } from "crypto";
import type { Session } from "./chargePointRegistry";
import { log } from "./logger";
import { logOcppMessage } from "./messageLog";
import { getCapabilitiesAgeMs, upsertCapabilities } from "./backendApi";

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

/** Wie alt darf ein erfolgreicher Probe-Lauf sein, bevor wir erneut probieren? */
const PROBE_TTL_MS = 24 * 60 * 60 * 1000; // 24 h

interface OcppConfigKey {
  key: string;
  readonly: boolean;
  value?: string;
}

interface GetConfigurationResult {
  configurationKey?: OcppConfigKey[];
  unknownKey?: string[];
}

/** Vergleicht zwei Measurand-Listen unabhängig von Reihenfolge/Whitespace. */
function sameMeasurandList(a: string, b: string): boolean {
  const norm = (s: string) =>
    s.split(",").map((x) => x.trim()).filter(Boolean).sort().join(",");
  return norm(a) === norm(b);
}

/** Sendet GetConfiguration → wartet auf Result → setzt sinnvolle Defaults. */
export async function probeChargePointConfiguration(
  session: Session,
  meta: { vendor: string | null; model: string | null },
): Promise<void> {
  if (session.socket.readyState !== session.socket.OPEN) return;

  // Reboot-Loop-Schutz: Wenn wir diesen Charger in den letzten 24 h bereits
  // erfolgreich konfiguriert haben, überspringen wir die Probe komplett.
  // Andernfalls würde jeder BootNotification erneut ChangeConfiguration-Calls
  // auslösen — manche Wallboxen (z. B. wallbe Smart Charge Control,
  // Firmware BF-01.04.x) starten daraufhin neu und erzeugen einen Loop.
  try {
    const ageMs = await getCapabilitiesAgeMs(session.chargePointPk);
    if (ageMs !== null && ageMs < PROBE_TTL_MS) {
      log.info("Skipping config probe (recently probed)", {
        chargePointId: session.chargePointId,
        ageMinutes: Math.round(ageMs / 60000),
      });
      return;
    }
  } catch (e) {
    log.warn("getCapabilitiesAge failed, continuing with probe", {
      chargePointId: session.chargePointId,
      error: (e as Error).message,
    });
  }

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

  // Setze MeterValueSampleInterval / ClockAlignedDataInterval — aber nur,
  // wenn der Wert sich tatsächlich ändert. Sonst riskieren wir bei jedem
  // Boot einen unnötigen Reboot der Wallbox.
  await trySetConfigIfDifferent(session, configMap, "MeterValueSampleInterval", "30");
  await trySetConfigIfDifferent(session, configMap, "ClockAlignedDataInterval", "60");

  // Fallback-Probing für MeterValuesSampledData
  for (const profile of FALLBACK_PROFILES) {
    const desired = profile.join(",");
    const current = configMap["MeterValuesSampledData"]?.value ?? "";

    // Wenn die Wallbox bereits ein passendes Profil aktiv hat → nichts tun.
    if (current && sameMeasurandList(current, desired)) {
      log.info("MeterValuesSampledData already matches profile, no change", {
        chargePointId: session.chargePointId,
        profile,
      });
      await upsertCapabilities(session.chargePointPk, {
        supported_measurands: profile,
        unsupported_keys: unknown,
        configuration: configMap,
        vendor: meta.vendor,
        model: meta.model,
      }).catch(() => { /* ignore */ });
      return;
    }

    if (configMap["MeterValuesSampledData"]?.readonly) {
      log.warn("MeterValuesSampledData is readonly, skipping ChangeConfiguration", {
        chargePointId: session.chargePointId,
      });
      return;
    }

    const ok = await trySetConfig(session, "MeterValuesSampledData", desired);
    if (ok) {
      log.info("MeterValuesSampledData accepted", {
        chargePointId: session.chargePointId,
        profile,
      });
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

/**
 * ChangeConfiguration nur senden, wenn sich der Wert tatsächlich unterscheidet
 * und der Key nicht readonly ist. Verhindert sinnlose Reboots.
 */
async function trySetConfigIfDifferent(
  session: Session,
  configMap: Record<string, { value: string | null; readonly: boolean }>,
  key: string,
  value: string,
): Promise<boolean> {
  const current = configMap[key];
  if (current?.readonly) {
    log.info("Config key is readonly, skipping", { chargePointId: session.chargePointId, key });
    return false;
  }
  if (current && (current.value ?? "") === value) {
    log.info("Config key already at desired value, skipping", {
      chargePointId: session.chargePointId,
      key,
      value,
    });
    return true;
  }
  return await trySetConfig(session, key, value);
}

async function trySetConfig(session: Session, key: string, value: string): Promise<boolean> {
  const result = await sendAndAwait<{ status: string }>(
    session,
    "ChangeConfiguration",
    { key, value },
    8_000,
  );
  if (result?.status === "RebootRequired") {
    log.warn("ChangeConfiguration returned RebootRequired — wallbox may reboot", {
      chargePointId: session.chargePointId,
      key,
      value,
    });
  }
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
