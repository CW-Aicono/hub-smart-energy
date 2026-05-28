import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";
import { toast } from "./use-toast";

// ── Communities ──────────────────────────────────────────────────────────────
export interface EnergyCommunity {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  region_plz: string[];
  type: string;
  status: string;
  contract_template_id: string | null;
  settings: any;
  created_at: string;
  updated_at: string;
}

export function useEnergyCommunities() {
  const { tenant } = useTenant();
  const qc = useQueryClient();
  const tenantId = tenant?.id;

  const { data: communities = [], isLoading } = useQuery({
    queryKey: ["energy-communities", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("energy_communities")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as EnergyCommunity[];
    },
  });

  const createCommunity = useMutation({
    mutationFn: async (values: {
      name: string;
      slug: string;
      type: string;
      region_plz?: string[];
      status?: string;
    }) => {
      const { data, error } = await supabase
        .from("energy_communities")
        .insert({
          tenant_id: tenantId!,
          name: values.name,
          slug: values.slug,
          type: values.type,
          region_plz: values.region_plz ?? [],
          status: values.status ?? "draft",
        })
        .select()
        .single();
      if (error) throw error;
      return data as EnergyCommunity;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["energy-communities", tenantId] });
      toast({ title: "Community erstellt" });
    },
    onError: (e: Error) =>
      toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const updateCommunity = useMutation({
    mutationFn: async ({ id, ...values }: { id: string } & Partial<EnergyCommunity>) => {
      const { error } = await supabase.from("energy_communities").update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["energy-communities", tenantId] });
      toast({ title: "Community aktualisiert" });
    },
    onError: (e: Error) =>
      toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const deleteCommunity = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("energy_communities").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["energy-communities", tenantId] });
      toast({ title: "Community gelöscht" });
    },
    onError: (e: Error) =>
      toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  return { communities, isLoading, createCommunity, updateCommunity, deleteCommunity };
}

// ── Members ──────────────────────────────────────────────────────────────────
export interface CommunityMember {
  id: string;
  community_id: string;
  tenant_id: string;
  user_id: string | null;
  member_no: string | null;
  email: string | null;
  display_name: string | null;
  joined_at: string | null;
  left_at: string | null;
  role: string;
  malo_id: string | null;
  melo_id: string | null;
  share_kw: number;
  status: string;
  invited_at?: string | null;
  activated_at?: string | null;
  suspended_at?: string | null;
  last_invite_sent_at?: string | null;
  created_at: string;
  updated_at: string;
}

export function useCommunityMembers(communityId: string | null) {
  const { tenant } = useTenant();
  const qc = useQueryClient();
  const tenantId = tenant?.id;

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["community-members", communityId, tenantId],
    enabled: !!tenantId && !!communityId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_members")
        .select("*")
        .eq("tenant_id", tenantId!)
        .eq("community_id", communityId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as CommunityMember[];
    },
  });

  const createMember = useMutation({
    mutationFn: async (values: Partial<CommunityMember> & { display_name: string }) => {
      const { error } = await supabase.from("community_members").insert({
        tenant_id: tenantId!,
        community_id: communityId!,
        display_name: values.display_name,
        email: values.email ?? null,
        member_no: values.member_no ?? null,
        role: values.role ?? "member",
        malo_id: values.malo_id ?? null,
        melo_id: values.melo_id ?? null,
        share_kw: values.share_kw ?? 0,
        status: values.status ?? "invited",
        joined_at: values.joined_at ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["community-members", communityId, tenantId] });
      toast({ title: "Mitglied hinzugefügt" });
    },
    onError: (e: Error) =>
      toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const updateMember = useMutation({
    mutationFn: async ({ id, ...values }: { id: string } & Partial<CommunityMember>) => {
      const { error } = await supabase.from("community_members").update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["community-members", communityId, tenantId] });
      toast({ title: "Mitglied aktualisiert" });
    },
    onError: (e: Error) =>
      toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const deleteMember = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("community_members").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["community-members", communityId, tenantId] });
      toast({ title: "Mitglied entfernt" });
    },
    onError: (e: Error) =>
      toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  return { members, isLoading, createMember, updateMember, deleteMember };
}

// ── Assets ───────────────────────────────────────────────────────────────────
export interface CommunityAsset {
  id: string;
  community_id: string;
  tenant_id: string;
  location_id: string | null;
  meter_id: string | null;
  asset_type: string;
  capacity_kw: number;
  share_model: string;
  created_at: string;
  updated_at: string;
}

export function useCommunityAssets(communityId: string | null) {
  const { tenant } = useTenant();
  const qc = useQueryClient();
  const tenantId = tenant?.id;

  const { data: assets = [], isLoading } = useQuery({
    queryKey: ["community-assets", communityId, tenantId],
    enabled: !!tenantId && !!communityId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_assets")
        .select("*")
        .eq("tenant_id", tenantId!)
        .eq("community_id", communityId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as CommunityAsset[];
    },
  });

  const createAsset = useMutation({
    mutationFn: async (values: Partial<CommunityAsset> & { asset_type: string; capacity_kw: number }) => {
      const { error } = await supabase.from("community_assets").insert({
        tenant_id: tenantId!,
        community_id: communityId!,
        location_id: values.location_id ?? null,
        meter_id: values.meter_id ?? null,
        asset_type: values.asset_type,
        capacity_kw: values.capacity_kw,
        share_model: values.share_model ?? "gleich",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["community-assets", communityId, tenantId] });
      toast({ title: "Anlage hinzugefügt" });
    },
    onError: (e: Error) =>
      toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const updateAsset = useMutation({
    mutationFn: async ({ id, ...values }: { id: string } & Partial<CommunityAsset>) => {
      const { error } = await supabase.from("community_assets").update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["community-assets", communityId, tenantId] });
      toast({ title: "Anlage aktualisiert" });
    },
    onError: (e: Error) =>
      toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const deleteAsset = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("community_assets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["community-assets", communityId, tenantId] });
      toast({ title: "Anlage entfernt" });
    },
    onError: (e: Error) =>
      toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  return { assets, isLoading, createAsset, updateAsset, deleteAsset };
}


// ── Tariffs ──────────────────────────────────────────────────────────────────
export interface CommunityTariff {
  id: string;
  community_id: string;
  tenant_id: string;
  valid_from: string;
  valid_to: string | null;
  price_ct_kwh: number;
  feed_in_ct_kwh: number;
  created_at: string;
  updated_at: string;
}

export function useCommunityTariffs(communityId: string | null) {
  const { tenant } = useTenant();
  const qc = useQueryClient();
  const tenantId = tenant?.id;

  const { data: tariffs = [], isLoading } = useQuery({
    queryKey: ["community-tariffs", communityId, tenantId],
    enabled: !!tenantId && !!communityId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_tariffs")
        .select("*")
        .eq("tenant_id", tenantId!)
        .eq("community_id", communityId!)
        .order("valid_from", { ascending: false });
      if (error) throw error;
      return data as CommunityTariff[];
    },
  });

  const createTariff = useMutation({
    mutationFn: async (values: {
      valid_from: string;
      valid_to?: string | null;
      price_ct_kwh: number;
      feed_in_ct_kwh: number;
    }) => {
      const { error } = await supabase.from("community_tariffs").insert({
        tenant_id: tenantId!,
        community_id: communityId!,
        valid_from: values.valid_from,
        valid_to: values.valid_to ?? null,
        price_ct_kwh: values.price_ct_kwh,
        feed_in_ct_kwh: values.feed_in_ct_kwh,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["community-tariffs", communityId, tenantId] });
      toast({ title: "Tarif gespeichert" });
    },
    onError: (e: Error) =>
      toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const updateTariff = useMutation({
    mutationFn: async ({ id, ...values }: { id: string } & Partial<CommunityTariff>) => {
      const { error } = await supabase.from("community_tariffs").update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["community-tariffs", communityId, tenantId] });
      toast({ title: "Tarif aktualisiert" });
    },
    onError: (e: Error) =>
      toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const deleteTariff = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("community_tariffs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["community-tariffs", communityId, tenantId] });
      toast({ title: "Tarif gelöscht" });
    },
    onError: (e: Error) =>
      toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  return { tariffs, isLoading, createTariff, updateTariff, deleteTariff };
}

