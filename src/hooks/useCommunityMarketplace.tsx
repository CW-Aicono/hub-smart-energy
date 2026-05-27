import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";
import { toast } from "./use-toast";

export interface MarketplaceListing {
  id: string;
  tenant_id: string;
  community_id: string;
  slug: string;
  title: string;
  short_description: string | null;
  long_description: string | null;
  hero_image_url: string | null;
  region_plz: string | null;
  region_city: string | null;
  price_ct_kwh: number;
  feed_in_ct_kwh: number;
  max_members: number | null;
  contact_email: string | null;
  is_public: boolean;
  view_count: number;
  created_at: string;
  updated_at: string;
}

export interface JoinRequest {
  id: string;
  community_id: string;
  listing_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  message: string | null;
  status: "new" | "contacted" | "accepted" | "rejected";
  rejection_reason: string | null;
  source_ip: string | null;
  created_member_id: string | null;
  created_at: string;
}

export function useMarketplaceListings(communityId?: string) {
  const { tenant } = useTenant();
  const qc = useQueryClient();
  const tenantId = tenant?.id;

  const { data: listings = [], isLoading } = useQuery({
    queryKey: ["marketplace-listings", tenantId, communityId],
    enabled: !!tenantId,
    queryFn: async () => {
      let q = supabase
        .from("community_marketplace_listings" as any)
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      if (communityId) q = q.eq("community_id", communityId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as MarketplaceListing[];
    },
  });

  const upsertListing = useMutation({
    mutationFn: async (
      values: Partial<MarketplaceListing> & { community_id: string; title: string; slug: string }
    ) => {
      const payload: any = { tenant_id: tenantId!, ...values };
      if (values.id) {
        const { id, ...rest } = payload;
        const { error } = await supabase
          .from("community_marketplace_listings" as any)
          .update(rest)
          .eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("community_marketplace_listings" as any)
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketplace-listings"] });
      toast({ title: "Gespeichert" });
    },
    onError: (e: any) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const deleteListing = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("community_marketplace_listings" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketplace-listings"] });
      toast({ title: "Gelöscht" });
    },
  });

  return { listings, isLoading, upsertListing, deleteListing };
}

export function useJoinRequests(communityId?: string) {
  const { tenant } = useTenant();
  const qc = useQueryClient();
  const tenantId = tenant?.id;

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["join-requests", tenantId, communityId],
    enabled: !!tenantId,
    queryFn: async () => {
      let q = supabase
        .from("community_join_requests" as any)
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      if (communityId) q = q.eq("community_id", communityId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as JoinRequest[];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({
      id,
      status,
      rejection_reason,
    }: {
      id: string;
      status: JoinRequest["status"];
      rejection_reason?: string;
    }) => {
      const { error } = await supabase
        .from("community_join_requests" as any)
        .update({ status, rejection_reason: rejection_reason ?? null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["join-requests"] });
      toast({ title: "Status aktualisiert" });
    },
  });

  const acceptAsMember = useMutation({
    mutationFn: async (req: JoinRequest) => {
      // Create community member
      const { data: member, error: mErr } = await supabase
        .from("community_members")
        .insert({
          tenant_id: tenantId!,
          community_id: req.community_id,
          display_name: req.name,
          email: req.email,
          role: "member",
          status: "invited",
        })
        .select()
        .single();
      if (mErr) throw mErr;
      const { error } = await supabase
        .from("community_join_requests" as any)
        .update({ status: "accepted", created_member_id: member.id })
        .eq("id", req.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["join-requests"] });
      qc.invalidateQueries({ queryKey: ["community-members"] });
      toast({ title: "Mitglied angelegt" });
    },
    onError: (e: any) =>
      toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  return { requests, isLoading, updateStatus, acceptAsMember };
}
