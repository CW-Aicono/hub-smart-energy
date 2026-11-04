import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import type { PvFlowConfig, PvFlowData } from "@/hooks/usePvSurplusFlow";
import { isStale, minutesSince } from "@/lib/pvFlow";

type Level = "ok" | "warn" | "error";
export interface PvCheck { level: Level; text: string }

export function buildPvChecks(config: PvFlowConfig, data: PvFlowData, lastLog: any | null): PvCheck[] {
  const out: PvCheck[] = [];
  if (!config.is_active) out.push({ level: "warn", text: "PV-Überschussladen ist ausgeschaltet." });
  if (!data.grid) {
    out.push({ level: "error", text: "Kein Bezugszähler gewählt oder Zähler nicht am Standort." });
  } else {
    const age = minutesSince(data.grid.at);
    if (isStale(data.grid.at)) {
      out.push({ level: "error", text: `Bezugszähler „${data.grid.name}" liefert keine aktuellen Werte (${age === null ? "keine Daten heute" : `letzter Wert vor ${age} min`}). Ohne aktuelle Werte regelt das System nicht. Ein Zähler mit laufenden 5‑Minuten-Werten wählen.` });
    } else {
      out.push({ level: "ok", text: `Bezugszähler „${data.grid.name}" liefert Werte (vor ${age} min).` });
    }
    if (data.grid.meter_function !== "bidirectional") out.push({ level: "warn", text: "Bezugszähler ist kein Zweirichtungszähler – Einspeisung (negativer Wert) wird ggf. nicht erkannt." });
  }
  if (data.pv.length === 0) out.push({ level: "warn", text: "Kein PV-Erzeugungszähler am Standort – PV wird in der Grafik nicht angezeigt." });
  if (data.pvConnectorCount === 0) out.push({ level: "error", text: "Kein Ladepunkt steht auf „PV-Überschuss“ oder „PV-Priorität“." });
  else out.push({ level: "ok", text: `${data.pvConnectorCount} Ladepunkt(e) im PV-Modus.` });
  if (data.ev.length === 0 && data.chargePointIds.length > 0) out.push({ level: "warn", text: "Für die Ladepunkte gibt es noch keine Leistungswerte." });

  if (!config.storage_id) {
    out.push({ level: "ok", text: "Modus: nur Bezugszähler, ohne Speicher." });
  } else if (data.storage) {
    if (data.storage.control_mode !== "pv_surplus") out.push({ level: "warn", text: `Speicher „${data.storage.name}" ist nicht auf PV-Überschuss gestellt.` });
    if (!data.storage.hasOutput) out.push({ level: "error", text: "Speicher hat keinen Sollwert-Ausgang (Loxone virtueller Eingang) – Sollwerte kommen nicht an." });
    if (data.storage.setpointError) out.push({ level: "error", text: `Letzter Speicher-Sollwert fehlgeschlagen: ${data.storage.setpointError}` });
    if (data.storage.soc === null || isStale(data.storage.socAt)) out.push({ level: "warn", text: "Ladestand des Speichers ist unbekannt oder veraltet." });
    const coupled = config.storage_coupled ?? data.storage.device_template === "elmi_aio";
    if (coupled) out.push({ level: "ok", text: "ELMI: Speicher gehört zur Ladestation und darf beim Laden immer entladen. Entladeleistung zählt nicht als PV-Überschuss." });
  }

  if (lastLog) {
    const age = minutesSince(lastLog.executed_at);
    if (age !== null && age > 10) out.push({ level: "error", text: `Letzte Regelung vor ${age} min – die Regelung läuft nicht.` });
    else if (lastLog.status === "no_data") out.push({ level: "error", text: "Letzte Regelung: keine aktuellen Messwerte vom Bezugszähler." });
    else if (lastLog.status === "error") out.push({ level: "error", text: `Letzte Regelung mit Fehler: ${lastLog.error_message}` });
    else out.push({ level: "ok", text: `Regelung läuft (letzter Lauf vor ${age} min, alle 3 Minuten).` });
  } else {
    out.push({ level: "warn", text: "Noch kein Regellauf protokolliert." });
  }
  return out;
}

const ICON = { ok: CheckCircle2, warn: AlertTriangle, error: XCircle };
const COLOR = { ok: "text-primary", warn: "text-accent-foreground", error: "text-destructive" };

export default function PvSetupChecks({ checks }: { checks: PvCheck[] }) {
  return (
    <ul className="space-y-1.5">
      {checks.map((c, i) => {
        const Icon = ICON[c.level];
        return (
          <li key={i} className="flex items-start gap-2 text-xs">
            <Icon className={`h-4 w-4 shrink-0 ${COLOR[c.level]}`} />
            <span>{c.text}</span>
          </li>
        );
      })}
    </ul>
  );
}
