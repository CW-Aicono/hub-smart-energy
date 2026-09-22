import { useNavigate } from "react-router-dom";
import { Briefcase, Cpu } from "lucide-react";
import { Card } from "@/components/ui/card";
import { setAreaPreference } from "@/lib/areaPreference";

/**
 * Auswahl nach der Anmeldung für Nutzer, die Partner-Mitglied sind UND einen
 * eigenen Mandanten haben.
 */
export default function AreaChooser({ partnerName, tenantName }: { partnerName?: string | null; tenantName?: string | null }) {
  const navigate = useNavigate();

  const choose = (area: "partner" | "ems") => {
    setAreaPreference(area);
    navigate(area === "partner" ? "/partner" : "/", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-2xl space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold">Wohin möchtest du?</h1>
          <p className="text-sm text-muted-foreground">
            Du kannst jederzeit oben im Kopfbereich zwischen beiden Bereichen wechseln.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card
            role="button"
            tabIndex={0}
            onClick={() => choose("partner")}
            onKeyDown={(e) => e.key === "Enter" && choose("partner")}
            className="p-6 cursor-pointer hover:border-primary transition-colors space-y-3"
          >
            <Briefcase className="h-8 w-8 text-primary" />
            <div>
              <p className="font-semibold">Partner-Portal</p>
              <p className="text-xs text-muted-foreground">Kaufmännisch</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Mandanten, Abrechnung, Reporting und Gain-Sharing
              {partnerName ? ` für ${partnerName}` : ""}.
            </p>
          </Card>

          <Card
            role="button"
            tabIndex={0}
            onClick={() => choose("ems")}
            onKeyDown={(e) => e.key === "Enter" && choose("ems")}
            className="p-6 cursor-pointer hover:border-primary transition-colors space-y-3"
          >
            <Cpu className="h-8 w-8 text-primary" />
            <div>
              <p className="font-semibold">EMS</p>
              <p className="text-xs text-muted-foreground">Technisch</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Energiedaten, Anlagen, Automation und Ladepunkte
              {tenantName ? ` von ${tenantName}` : ""}.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
