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
    "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors";

  return (
    <div className={cn("inline-flex items-center gap-1 rounded-full border bg-muted/40 p-1", className)}>
      <button
        type="button"
        onClick={() => go("partner")}
        className={cn(base, current === "partner" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
      >
        <Briefcase className="h-3.5 w-3.5" />
        <span>Kaufmännisch</span>
      </button>
      <button
        type="button"
        onClick={() => go("ems")}
        className={cn(base, current === "ems" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
      >
        <Cpu className="h-3.5 w-3.5" />
        <span>Technisch</span>
      </button>
    </div>
  );
}

export default AreaSwitcher;
