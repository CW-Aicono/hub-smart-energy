import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export type LicenseFormValues = {
  tenant_id: string;
  plan_name: string;
  price_monthly: number;
  price_yearly: number;
  billing_cycle: "monthly" | "yearly";
  status: "active" | "cancelled" | "expired";
  max_users: number | null;
  max_locations: number | null;
  valid_from?: string | null;
  valid_until?: string | null;
};

interface Props {
  mode: "create" | "edit";
  initial?: Partial<LicenseFormValues> & { id?: string };
  trigger?: React.ReactNode;
}

const empty: LicenseFormValues = {
  tenant_id: "",
  plan_name: "Standard",
  price_monthly: 0,
  price_yearly: 0,
  billing_cycle: "monthly",
  status: "active",
  max_users: null,
  max_locations: null,
  valid_from: null,
  valid_until: null,
};

export default function LicenseDialog({ mode, initial, trigger }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<LicenseFormValues>({ ...empty, ...(initial as any) });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setValues({ ...empty, ...(initial as any) });
  }, [open, initial]);

  const { data: tenantOptions = [] } = useQuery({
    queryKey: ["sa-license-tenant-options"],
    enabled: open && mode === "create",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("id, name")
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = async () => {
    if (!values.tenant_id || !values.plan_name) {
      toast({ title: "Fehler", description: "Mandant und Plan-Name erforderlich", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload: any = { ...values };
      if (mode === "create") {
        const { error } = await supabase.from("tenant_licenses").insert(payload);
        if (error) throw error;
        toast({ title: "Lizenz angelegt" });
      } else {
        const { error } = await supabase
          .from("tenant_licenses")
          .update(payload)
          .eq("id", initial?.id as string);
        if (error) throw error;
        toast({ title: "Lizenz aktualisiert" });
      }
      qc.invalidateQueries({ queryKey: ["super-admin-licenses"] });
      setOpen(false);
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const defaultTrigger =
    mode === "create" ? (
      <Button>
        <Plus className="h-4 w-4 mr-2" /> Neue Lizenz
      </Button>
    ) : (
      <Button variant="ghost" size="icon" title="Bearbeiten">
        <Pencil className="h-4 w-4" />
      </Button>
    );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger ?? defaultTrigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Neue Lizenz" : "Lizenz bearbeiten"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          {mode === "create" && (
            <div className="space-y-1.5">
              <Label>Mandant *</Label>
              <Select
                value={values.tenant_id}
                onValueChange={(v) => setValues({ ...values, tenant_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Mandant wählen" />
                </SelectTrigger>
                <SelectContent>
                  {tenantOptions.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Plan-Name *</Label>
            <Input
              value={values.plan_name}
              onChange={(e) => setValues({ ...values, plan_name: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Preis / Monat (€)</Label>
              <Input
                type="number"
                value={values.price_monthly ?? 0}
                onChange={(e) =>
                  setValues({ ...values, price_monthly: parseFloat(e.target.value) || 0 })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Preis / Jahr (€)</Label>
              <Input
                type="number"
                value={values.price_yearly ?? 0}
                onChange={(e) =>
                  setValues({ ...values, price_yearly: parseFloat(e.target.value) || 0 })
                }
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Abrechnung</Label>
              <Select
                value={values.billing_cycle}
                onValueChange={(v: "monthly" | "yearly") =>
                  setValues({ ...values, billing_cycle: v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monatlich</SelectItem>
                  <SelectItem value="yearly">Jährlich</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={values.status}
                onValueChange={(v: "active" | "cancelled" | "expired") =>
                  setValues({ ...values, status: v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Aktiv</SelectItem>
                  <SelectItem value="cancelled">Gekündigt</SelectItem>
                  <SelectItem value="expired">Abgelaufen</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Max. Benutzer</Label>
              <Input
                type="number"
                value={values.max_users ?? ""}
                onChange={(e) =>
                  setValues({
                    ...values,
                    max_users: e.target.value ? parseInt(e.target.value) : null,
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Max. Standorte</Label>
              <Input
                type="number"
                value={values.max_locations ?? ""}
                onChange={(e) =>
                  setValues({
                    ...values,
                    max_locations: e.target.value ? parseInt(e.target.value) : null,
                  })
                }
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Gültig ab</Label>
              <Input
                type="date"
                value={values.valid_from ? values.valid_from.substring(0, 10) : ""}
                onChange={(e) =>
                  setValues({ ...values, valid_from: e.target.value || null })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Gültig bis</Label>
              <Input
                type="date"
                value={values.valid_until ? values.valid_until.substring(0, 10) : ""}
                onChange={(e) =>
                  setValues({ ...values, valid_until: e.target.value || null })
                }
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Abbrechen
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Speichert…" : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
