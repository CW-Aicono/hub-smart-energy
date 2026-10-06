import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Briefcase, Cpu, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAreaAccess } from "@/hooks/useAreaAccess";
import { setAreaPreference, AREA_PATHS, type AppArea } from "@/lib/areaPreference";

interface AreaSwitcherProps {
  current: AppArea;
  className?: string;
  /**
   * Als eigene Kopfleiste oben rechts im Inhaltsbereich anzeigen.
   * Die Leiste liegt im normalen Seitenfluss (kein Overlay) und schiebt den
   * Seiteninhalt nach unten, statt ihn zu verdecken.
   */
  floating?: boolean;
}

const META: Record<AppArea, { label: string; Icon: typeof Cpu }> = {
  super_admin: { label: "AICONO Portal", Icon: ShieldCheck },
  partner: { label: "Kaufmännisch", Icon: Briefcase },
  ems: { label: "Technisch", Icon: Cpu },
};

const SLOT_ATTR = "data-area-switcher-slot";

/** Legt einen Slot als erstes Kind des Haupt-Inhaltsbereichs (<main>) an. */
function useMainSlot(enabled: boolean) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const main = document.querySelector("main");
    if (!main) return;
    let el = main.querySelector<HTMLElement>(`:scope > [${SLOT_ATTR}]`);
    const created = !el;
    if (!el) {
      el = document.createElement("div");
      el.setAttribute(SLOT_ATTR, "");
      main.prepend(el);
    }
    setSlot(el);
    return () => {
      if (created) el?.remove();
    };
  }, [enabled]);
  return slot;
}

/**
 * Umschalter zwischen Portal-Admin, Partner-Portal und EMS.
 * Erscheint nur bei mindestens zwei berechtigten Bereichen.
 */
export function AreaSwitcher({ current, className, floating = false }: AreaSwitcherProps) {
  const { canSwitch, availableAreas } = useAreaAccess();
  const navigate = useNavigate();
  const slot = useMainSlot(floating && canSwitch);

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

  const pill = (
    <div
      role="tablist"
      aria-label="Bereich wechseln"
      className={cn(
        "inline-flex items-center gap-1 rounded-full border-2 border-border bg-card p-1",
        className,
      )}
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
            <span className="whitespace-nowrap">{label}</span>
          </button>
        );
      })}
    </div>
  );

  if (!floating) return pill;
  if (!slot) return null;
  // Eigene Kopfleiste im Seitenfluss – immer rechts oben, verdeckt nichts.
  return createPortal(
    <div className="flex justify-end border-b bg-background px-4 py-2 print:hidden">{pill}</div>,
    slot,
  );
}

export default AreaSwitcher;
