import { useState, useEffect, createContext, useContext, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useDemoMode } from "@/contexts/DemoMode";

interface TenantBranding {
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  font_family: string;
}

interface TenantReportSettings {
  footer_text: string;
  show_logo: boolean;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  branding: TenantBranding;
  logo_url: string | null;
  report_settings: TenantReportSettings;
  week_start_day: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  created_at: string;
  updated_at: string;
}

interface TenantContextType {
  tenant: Tenant | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  updateBranding: (branding: Partial<TenantBranding>) => Promise<{ error: Error | null }>;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

const DEFAULT_BRANDING: TenantBranding = {
  primary_color: "#1a365d",
  secondary_color: "#2d8a6e",
  accent_color: "#f59e0b",
  font_family: "Inter",
};

function hexToHSL(hex: string): string {
  // Remove # if present
  hex = hex.replace(/^#/, '');
  
  // Parse hex
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function applyBrandingToCSS(branding: TenantBranding) {
  const root = document.documentElement;
  
  // Apply primary color
  root.style.setProperty('--primary', hexToHSL(branding.primary_color));
  root.style.setProperty('--ring', hexToHSL(branding.primary_color));
  
  // Apply accent color
  root.style.setProperty('--accent', hexToHSL(branding.accent_color));
  
  // Apply sidebar primary
  root.style.setProperty('--sidebar-primary', hexToHSL(branding.secondary_color));
  root.style.setProperty('--sidebar-ring', hexToHSL(branding.secondary_color));
}

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const isDemo = useDemoMode();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTenant = useCallback(async () => {
    if (isDemo) {
      const demoTenant: Tenant = {
        id: "demo-tenant-id",
        name: "Stadtwerke Musterstadt GmbH",
        slug: "demo",
        address: "Musterstraße 1, 80331 München",
        contact_email: "info@stadtwerke-musterstadt.de",
        contact_phone: "+49 89 12345678",
        branding: DEFAULT_BRANDING,
        logo_url: null,
        report_settings: { footer_text: "Stadtwerke Musterstadt GmbH", show_logo: true },
        week_start_day: 1,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
      };
      setTenant(demoTenant);
      applyBrandingToCSS(demoTenant.branding);
      setLoading(false);
      return;
    }

    if (!user) {
      setTenant(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // First get the user's tenant_id from their profile, then fetch that specific tenant.
      // Using .single() on an unfiltered query fails when the user is a super_admin
      // and can see multiple tenants via RLS.
      const { data: profile } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("user_id", user.id)
        .single();

      if (!profile?.tenant_id) {
        setTenant(null);
        setLoading(false);
        return;
      }

      const { data, error: fetchError } = await supabase
        .from("tenants")
        .select("*")
        .eq("id", profile.tenant_id)
        .single();

      if (fetchError) {
        // User might not have a tenant yet
        if (fetchError.code === "PGRST116") {
          setTenant(null);
        } else {
          setError(fetchError.message);
        }
      } else if (data) {
        const tenantData: Tenant = {
          ...data,
          branding: (data.branding as unknown as TenantBranding) || DEFAULT_BRANDING,
          report_settings: (data.report_settings as unknown as TenantReportSettings) || { footer_text: "", show_logo: true },
          week_start_day: (data.week_start_day as 0 | 1 | 2 | 3 | 4 | 5 | 6) ?? 1,
        };
        setTenant(tenantData);
        applyBrandingToCSS(tenantData.branding);
      }
    } catch (err) {
      setError("Failed to fetch tenant");
    } finally {
      setLoading(false);
    }
  }, [user, isDemo]);

  useEffect(() => {
    fetchTenant();
  }, [fetchTenant]);

  const updateBranding = async (branding: Partial<TenantBranding>) => {
    if (!tenant) return { error: new Error("No tenant") };

    const newBranding = { ...tenant.branding, ...branding };

    const { error: updateError } = await supabase
      .from("tenants")
      .update({ branding: newBranding })
      .eq("id", tenant.id);

    if (!updateError) {
      setTenant({ ...tenant, branding: newBranding });
      applyBrandingToCSS(newBranding);
    }

    return { error: updateError as Error | null };
  };

  return (
    <TenantContext.Provider value={{ tenant, loading, error, refetch: fetchTenant, updateBranding }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (!context) throw new Error("useTenant must be used within TenantProvider");
  return context;
}
