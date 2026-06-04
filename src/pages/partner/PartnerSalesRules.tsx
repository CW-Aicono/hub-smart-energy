import { useEffect, useState } from "react";
import { usePartnerAccess } from "@/hooks/usePartnerAccess";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { SalesRulesManager } from "@/components/sales/SalesRulesManager";
import { supabase } from "@/integrations/supabase/client";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldCheck } from "lucide-react";

export default function PartnerSalesRules() {
  const { partnerId, isPartnerAdmin, isPartnerMember, loading } = usePartnerAccess();
  const { isSuperAdmin, loading: saLoading } = useSuperAdmin();

  const [partners, setPartners] = useState<{ id: string; name: string }[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);

  // Super-Admin ohne eigene Partner-Mitgliedschaft: Partner-Auswahl ermöglichen
  useEffect(() => {
    if (loading || saLoading) return;
    if (isPartnerMember || !isSuperAdmin) return;
    (async () => {
      const { data } = await supabase
        .from("partners")
        .select("id,name")
        .eq("is_active", true)
        .order("name");
      const list = (data ?? []) as { id: string; name: string }[];
      setPartners(list);
      if (list.length > 0) setSelectedPartnerId((prev) => prev ?? list[0].id);
    })();
  }, [loading, saLoading, isPartnerMember, isSuperAdmin]);

  if (loading || saLoading) return <div className="p-6 text-muted-foreground">Lade …</div>;

  // Echter Partner-User
  if (isPartnerMember && partnerId) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <SalesRulesManager scope="partner" partnerId={partnerId} canManage={isPartnerAdmin} />
      </div>
    );
  }

  // Super-Admin-Vorschau ohne Partner-Mitgliedschaft
  if (isSuperAdmin) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-4">
        <Card className="border-amber-500/40 bg-amber-50/40 dark:bg-amber-950/20">
          <CardContent className="py-4 flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-amber-600" />
            <div className="flex-1">
              <div className="text-sm font-medium">Super-Admin-Vorschau</div>
              <p className="text-xs text-muted-foreground">
                Du bist kein Mitglied einer Partner-Organisation. Wähle einen Partner aus, um seine Regeln und den KI-Analyse-Modus zu verwalten.
              </p>
            </div>
            <div className="w-64">
              <Select
                value={selectedPartnerId ?? undefined}
                onValueChange={(v) => setSelectedPartnerId(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Partner wählen" />
                </SelectTrigger>
                <SelectContent>
                  {partners.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
        {selectedPartnerId && (
          <SalesRulesManager scope="partner" partnerId={selectedPartnerId} canManage={true} />
        )}
      </div>
    );
  }

  // Weder Partner-Member noch Super-Admin (PartnerLayout schließt das eigentlich aus)
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <SalesRulesManager scope="partner" partnerId={null} canManage={false} />
    </div>
  );
}
