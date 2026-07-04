import { Navigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { useSATranslation } from "@/hooks/useSATranslation";
import SuperAdminSidebar from "@/components/super-admin/SuperAdminSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Ban } from "lucide-react";
import LicenseDialog from "@/components/super-admin/LicenseDialog";
import { SortableHead, useSortableData } from "@/components/ui/sortable-head";

type SortKey = "tenant" | "plan" | "price" | "cycle" | "status";

const SuperAdminLicenses = () => {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: roleLoading } = useSuperAdmin();
  const { t } = useSATranslation();
  const qc = useQueryClient();
  const [cancelTarget, setCancelTarget] = useState<{ id: string; tenant: string } | null>(null);

  const { data: licenses = [] } = useQuery({
    queryKey: ["super-admin-licenses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_licenses")
        .select("*, tenants(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { sorted, sort, toggle } = useSortableData<any, SortKey>(licenses, (r, k) => {
    switch (k) {
      case "tenant": return r.tenants?.name ?? "";
      case "plan": return r.plan_name;
      case "price": return Number(r.price_monthly ?? 0);
      case "cycle": return r.billing_cycle;
      case "status": return r.status;
      default: return null;
    }
  }, { key: "tenant", direction: "asc" });

  if (authLoading || roleLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">{t("common.loading")}</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isSuperAdmin) return <Navigate to="/" replace />;

  const cancelLicense = async (id: string) => {
    const { error } = await supabase
      .from("tenant_licenses")
      .update({ status: "cancelled" } as any)
      .eq("id", id);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Lizenz gekündigt" });
    qc.invalidateQueries({ queryKey: ["super-admin-licenses"] });
  };

  return (
    <div className="flex min-h-screen bg-background">
      <SuperAdminSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t("billing.active_licenses")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("licenses.subtitle")}</p>
          </div>
          <LicenseDialog mode="create" />
        </header>
        <div className="p-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("billing.active_licenses")}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHead label={t("billing.tenant")} sortKey="tenant" sort={sort} onToggle={toggle} />
                    <SortableHead label={t("billing.plan")} sortKey="plan" sort={sort} onToggle={toggle} />
                    <SortableHead label={t("billing.price_month")} sortKey="price" sort={sort} onToggle={toggle} />
                    <SortableHead label={t("billing.cycle")} sortKey="cycle" sort={sort} onToggle={toggle} />
                    <SortableHead label={t("common.status")} sortKey="status" sort={sort} onToggle={toggle} />
                    <TableCell className="w-32 text-right">{t("common.actions")}</TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        {t("billing.no_licenses")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    sorted.map((lic: any) => (
                      <TableRow key={lic.id}>
                        <TableCell className="font-medium">{lic.tenants?.name ?? "–"}</TableCell>
                        <TableCell>{lic.plan_name}</TableCell>
                        <TableCell>
                          {Number(lic.price_monthly ?? 0).toLocaleString("de-DE", {
                            style: "currency",
                            currency: "EUR",
                          })}
                        </TableCell>
                        <TableCell>
                          {lic.billing_cycle === "monthly"
                            ? t("billing.monthly")
                            : t("billing.yearly")}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              lic.status === "active"
                                ? "default"
                                : lic.status === "cancelled"
                                ? "destructive"
                                : "secondary"
                            }
                          >
                            {lic.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <LicenseDialog
                              mode="edit"
                              initial={{
                                id: lic.id,
                                tenant_id: lic.tenant_id,
                                plan_name: lic.plan_name,
                                price_monthly: lic.price_monthly,
                                price_yearly: lic.price_yearly,
                                billing_cycle: lic.billing_cycle,
                                status: lic.status,
                                max_users: lic.max_users,
                                max_locations: lic.max_locations,
                                valid_from: lic.valid_from,
                                valid_until: lic.valid_until,
                              }}
                            />
                            {lic.status === "active" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Lizenz kündigen"
                                onClick={() =>
                                  setCancelTarget({
                                    id: lic.id,
                                    tenant: lic.tenants?.name ?? "",
                                  })
                                }
                              >
                                <Ban className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </main>

      <AlertDialog
        open={!!cancelTarget}
        onOpenChange={(open) => !open && setCancelTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Lizenz kündigen?</AlertDialogTitle>
            <AlertDialogDescription>
              Die Lizenz für „{cancelTarget?.tenant}" wird als gekündigt markiert. Diese Aktion
              kann durch Bearbeiten wieder rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (cancelTarget) cancelLicense(cancelTarget.id);
                setCancelTarget(null);
              }}
            >
              Kündigen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SuperAdminLicenses;
