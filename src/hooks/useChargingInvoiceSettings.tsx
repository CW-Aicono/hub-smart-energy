import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";
import { toast } from "./use-toast";

export interface ChargingInvoiceSettings {
  id: string;
  tenant_id: string;
  company_name: string;
  company_address: string;
  company_email: string;
  company_phone: string;
  tax_id: string;
  iban: string;
  bic: string;
  bank_name: string;
  footer_text: string;
  logo_url: string;
}

export function useChargingInvoiceSettings() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const tenantId = tenant?.id;
  const queryKey = ["charging-invoice-settings", tenantId];

  const { data: settings, isLoading } = useQuery({
    queryKey,
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("charging_invoice_settings")
        .select("*")
        .eq("tenant_id", tenantId!)
        .maybeSingle();
      if (error) throw error;
      return data as ChargingInvoiceSettings | null;
    },
  });

  const upsertSettings = useMutation({
    mutationFn: async (values: Partial<ChargingInvoiceSettings>) => {
      if (settings?.id) {
        const { error } = await supabase
          .from("charging_invoice_settings")
          .update(values as any)
          .eq("id", settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("charging_invoice_settings")
          .insert({ ...values, tenant_id: tenantId! } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: "Rechnungsdesign gespeichert" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const uploadLogo = async (file: File): Promise<string | null> => {
    if (!tenantId) return null;
    const ext = file.name.split(".").pop();
    const path = `${tenantId}/logo.${ext}`;
    const { error } = await supabase.storage
      .from("charging-invoice-assets")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) {
      toast({ title: "Fehler beim Logo-Upload", description: error.message, variant: "destructive" });
      return null;
    }
    const { data } = supabase.storage.from("charging-invoice-assets").getPublicUrl(path);
    return data.publicUrl;
  };

  return { settings, isLoading, upsertSettings, uploadLogo };
}
