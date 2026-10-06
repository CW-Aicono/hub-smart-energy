import { useNavigate } from "react-router-dom";
import { Briefcase, Cpu, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { setAreaPreference, AREA_PATHS, type AppArea } from "@/lib/areaPreference";

/**
 * Auswahl nach der Anmeldung für Nutzer mit mehreren Bereichen.
 */
export default function AreaChooser({
  partnerName,
  tenantName,
  areas,
}: {
  partnerName?: string | null;
  tenantName?: string | null;
  areas: AppArea[];
}) {
  const navigate = useNavigate();

  const choose = (area: AppArea) => {
    setAreaPreference(area);
    navigate(AREA_PATHS[area], { replace: true });
  };

  const items: Record<AppArea, { Icon: typeof Cpu; title: string; sub: string; text: string }> = {
    super_admin: {
      Icon: ShieldCheck,
      title: "AICONO Portal",
      sub: "Plattform",
      text: "Partner, Mandanten, Module, Lizenzen und Systemüberwachung.",
    },
    partner: {
      Icon: Briefcase,
      title: "Partner-Portal",
      sub: "Kaufmännisch",
      text: `Mandanten, Abrechnung, Reporting und Gain-Sharing${partnerName ? ` für ${partnerName}` : ""}.`,
    },
    ems: {
      Icon: Cpu,
      title: "EMS",
      sub: "Technisch",
      text: `Energiedaten, Anlagen, Automation und Ladepunkte${tenantName ? ` von ${tenantName}` : ""}.`,
    },
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-3xl space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold">Wohin möchtest du?</h1>
          <p className="text-sm text-muted-foreground">
            Du kannst jederzeit über den Umschalter zwischen den Bereichen wechseln.
          </p>
        </div>
        <div className={`grid gap-4 ${areas.length >= 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
          {areas.map((area) => {
            const { Icon, title, sub, text } = items[area];
            return (
              <Card
                key={area}
                role="button"
                tabIndex={0}
                onClick={() => choose(area)}
                onKeyDown={(e) => e.key === "Enter" && choose(area)}
                className="p-6 cursor-pointer hover:border-primary transition-colors space-y-3"
              >
                <Icon className="h-8 w-8 text-primary" />
                <div>
                  <p className="font-semibold">{title}</p>
                  <p className="text-xs text-muted-foreground">{sub}</p>
                </div>
                <p className="text-sm text-muted-foreground">{text}</p>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
