import { useEffect } from "react";
import { SharingLayout } from "@/components/sharing/SharingLayout";
import { SharingMemberGuard } from "@/components/sharing/SharingMemberGuard";
import { useMyMembership } from "@/hooks/useMyMembership";

function DashboardContent() {
  const { data } = useMyMembership();
  const member = data?.active;

  useEffect(() => {
    document.title = "Übersicht — Meine Energie-Community";
  }, []);

  return (
    <SharingLayout title={`Hallo${member?.display_name ? `, ${member.display_name}` : ""}`}>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground">Eingebrachte Leistung</div>
          <div className="text-2xl font-semibold mt-1">
            {member?.share_kw?.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) ?? "—"}{" "}
            <span className="text-sm text-muted-foreground">kW</span>
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground">Status</div>
          <div className="text-sm font-medium mt-2 capitalize">{member?.status ?? "—"}</div>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        Tageskurve und allozierte kWh werden in Stufe 4 ergänzt.
      </div>
    </SharingLayout>
  );
}

export default function SharingDashboard() {
  return (
    <SharingMemberGuard>
      <DashboardContent />
    </SharingMemberGuard>
  );
}
