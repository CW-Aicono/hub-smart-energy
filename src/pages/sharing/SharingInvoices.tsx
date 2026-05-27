import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SharingLayout } from "@/components/sharing/SharingLayout";
import { SharingMemberGuard } from "@/components/sharing/SharingMemberGuard";
import { useMyMembership } from "@/hooks/useMyMembership";
import { Button } from "@/components/ui/button";

function InvoicesContent() {
  const { data: membership } = useMyMembership();
  const memberId = membership?.active?.id ?? null;

  useEffect(() => {
    document.title = "Rechnungen — Meine Energie-Community";
  }, []);

  const { data: invoices, isLoading } = useQuery({
    queryKey: ["my-invoices", memberId],
    enabled: !!memberId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_member_invoices")
        .select("id, invoice_number, period_start, period_end, total_ct, status, issued_at, pdf_path, currency")
        .eq("member_id", memberId!)
        .order("period_start", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const handleDownload = async (path: string | null) => {
    if (!path) return;
    const { data, error } = await supabase.storage
      .from("community-invoices")
      .createSignedUrl(path, 60);
    if (error || !data?.signedUrl) return;
    window.open(data.signedUrl, "_blank");
  };

  return (
    <SharingLayout title="Meine Rechnungen">
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : !invoices?.length ? (
        <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          Noch keine Rechnungen vorhanden.
        </div>
      ) : (
        <div className="space-y-2">
          {invoices.map((inv) => (
            <div key={inv.id} className="rounded-lg border bg-card p-4 flex items-center gap-3">
              <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">
                  {inv.invoice_number ?? "Entwurf"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(inv.period_start).toLocaleDateString("de-DE")} –{" "}
                  {new Date(inv.period_end).toLocaleDateString("de-DE")} ·{" "}
                  {(inv.total_ct / 100).toLocaleString("de-DE", {
                    style: "currency",
                    currency: inv.currency || "EUR",
                  })}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={!inv.pdf_path}
                onClick={() => handleDownload(inv.pdf_path)}
              >
                PDF
              </Button>
            </div>
          ))}
        </div>
      )}
    </SharingLayout>
  );
}

export default function SharingInvoices() {
  return (
    <SharingMemberGuard>
      <InvoicesContent />
    </SharingMemberGuard>
  );
}
