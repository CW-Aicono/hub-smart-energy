import { useNavigate } from "react-router-dom";
import { Briefcase, Cpu, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAreaAccess } from "@/hooks/useAreaAccess";
import { setAreaPreference, AREA_PATHS, type AppArea } from "@/lib/areaPreference";

interface AreaSwitcherProps {
  current: AppArea;
  className?: string;
}

const META: Record<AppArea, { label: string; Icon: typeof Cpu }> = {
  super_admin: { label: "Super-Admin", Icon: ShieldCheck },
  partner: { label: "Kaufmännisch", Icon: Briefcase },
  ems: { label: "Technisch", Icon: Cpu },
};

/**
 * Umschalter zwischen Super-Admin, Partner-Portal und EMS.
 * Erscheint nur bei mindestens zwei berechtigten Bereichen.
 */
export function AreaSwitcher({ current, className }: AreaSwitcherProps) {
  const { canSwitch, availableAreas } = useAreaAccess();
  const navigate = useNavigate();

  if (!canSwitch) return null;

  const go = (area: AppArea) => {
    if (area === current) return;
    setAreaPreference(area);
    navigate(AREA_PATHS[area], { replace: true });
  };

  const base =
    "flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const active = "bg-primary text-primary-foreground shadow-sm";
  const inactive = "bg-transparent text-foreground/85 hover:bg-accent hover:text-accent-foreground";

  return (
    <div
      role="tablist"
      aria-label="Bereich wechseln"
      className={cn("inline-flex items-center gap-1 rounded-full border-2 border-border bg-card p-1", className)}
    >
      {availableAreas.map((area) => {
        const { label, Icon } = META[area];
        return (
          <button
            key={area}
            type="button"
            role="tab"
            aria-selected={current === area}
            onClick={() => go(area)}
            className={cn(base, current === area ? active : inactive)}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default AreaSwitcher;
