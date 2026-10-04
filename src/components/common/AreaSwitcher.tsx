import { useNavigate } from "react-router-dom";
import { Briefcase, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAreaAccess } from "@/hooks/useAreaAccess";
import { setAreaPreference } from "@/lib/areaPreference";

interface AreaSwitcherProps {
  /** Welcher Bereich wird gerade angezeigt */
  current: "partner" | "ems";
  className?: string;
}

/**
 * Umschalter zwischen kaufmännischem Partner-Portal und technischem EMS.
 * Wird nur angezeigt, wenn der Nutzer beide Bereiche nutzen darf.
 */
export function AreaSwitcher({ current, className }: AreaSwitcherProps) {
  const { canSwitch } = useAreaAccess();
  const navigate = useNavigate();

  if (!canSwitch) return null;

  const go = (area: "partner" | "ems") => {
    if (area === current) return;
    setAreaPreference(area);
    navigate(area === "partner" ? "/partner" : "/", { replace: true });
  };

  const base =
    "flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const active = "bg-primary text-primary-foreground shadow-sm";
  const inactive = "bg-transparent text-foreground/85 hover:bg-accent hover:text-accent-foreground";

  return (
    <div
      role="tablist"
      aria-label="Bereich wechseln"
      className={cn("flex w-full items-center gap-1 rounded-full border-2 border-border bg-card p-1", className)}
    >
      <button
        type="button"
        role="tab"
        aria-selected={current === "partner"}
        onClick={() => go("partner")}
        className={cn(base, current === "partner" ? active : inactive)}
      >
        <Briefcase className="h-3.5 w-3.5 shrink-0" />
        <span>Kaufmännisch</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={current === "ems"}
        onClick={() => go("ems")}
        className={cn(base, current === "ems" ? active : inactive)}
      >
        <Cpu className="h-3.5 w-3.5 shrink-0" />
        <span>Technisch</span>
      </button>
    </div>
  );
}

export default AreaSwitcher;
