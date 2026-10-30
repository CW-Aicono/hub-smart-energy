import { Zap, PlugZap, AlertTriangle, WifiOff, ZapOff, Settings, Clock, Pause, Lock, HelpCircle } from "lucide-react";
import type { ChargePointStatusKey } from "./chargePointStatus";

type StatusPresentation = {
  labelKey: string;
  variant: "default" | "secondary" | "destructive" | "outline";
  icon: typeof Zap;
  color: string;
  dotColor: string;
  token: string;
};

function status(key: ChargePointStatusKey, icon: typeof Zap, token: string, variant: StatusPresentation["variant"] = "outline"): StatusPresentation {
  return { labelKey: `chargePointStatus.${key}`, icon, token, variant,
    color: `text-${token}`, dotColor: `bg-${token}` };
}

// Explicit classes keep Tailwind's scanner aware of the semantic tokens.
const styles = {
  accent: { color: "text-accent", dotColor: "bg-accent" },
  primary: { color: "text-primary", dotColor: "bg-primary" },
  warning: { color: "text-[hsl(var(--chart-3))]", dotColor: "bg-[hsl(var(--chart-3))]" },
  muted: { color: "text-muted-foreground", dotColor: "bg-muted-foreground" },
  destructive: { color: "text-destructive", dotColor: "bg-destructive" },
};

export const CHARGE_POINT_STATUS_META: Record<ChargePointStatusKey, StatusPresentation> = {
  available: { ...status("available", Zap, "accent", "default"), ...styles.accent },
  charging: { ...status("charging", PlugZap, "primary", "secondary"), ...styles.primary },
  preparing: { ...status("preparing", Clock, "chart-3"), ...styles.warning },
  suspended_ev: { ...status("suspended_ev", Pause, "chart-3"), ...styles.warning },
  suspended_evse: { ...status("suspended_evse", Pause, "chart-3"), ...styles.warning },
  finishing: { ...status("finishing", PlugZap, "chart-3"), ...styles.warning },
  reserved: { ...status("reserved", Lock, "chart-3"), ...styles.warning },
  occupied: { ...status("occupied", PlugZap, "chart-3"), ...styles.warning },
  faulted: { ...status("faulted", AlertTriangle, "destructive", "destructive"), ...styles.destructive },
  unavailable: { ...status("unavailable", ZapOff, "muted-foreground"), ...styles.muted },
  offline: { ...status("offline", WifiOff, "muted-foreground"), ...styles.muted },
  unconfigured: { ...status("unconfigured", Settings, "muted-foreground"), ...styles.muted },
  unknown: { ...status("unknown", HelpCircle, "muted-foreground"), ...styles.muted },
};

export function getChargePointStatusMeta(key: string): StatusPresentation {
  return CHARGE_POINT_STATUS_META[key as ChargePointStatusKey] ?? CHARGE_POINT_STATUS_META.unknown;
}