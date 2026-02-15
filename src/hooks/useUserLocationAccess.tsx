import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface UserLocationAccess {
  id: string;
  user_id: string;
  location_id: string;
  created_at: string;
}

export function useUserLocationAccess(userId: string | null) {
  const [accessEntries, setAccessEntries] = useState<UserLocationAccess[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!userId) {
      setAccessEntries([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("user_location_access" as any)
      .select("*")
      .eq("user_id", userId);

    if (!error && data) {
      setAccessEntries(data as unknown as UserLocationAccess[]);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const grantAccess = async (locationId: string) => {
    if (!userId) return;
    await supabase
      .from("user_location_access" as any)
      .insert({ user_id: userId, location_id: locationId } as any);
    await fetch();
  };

  const revokeAccess = async (locationId: string) => {
    if (!userId) return;
    await supabase
      .from("user_location_access" as any)
      .delete()
      .eq("user_id", userId)
      .eq("location_id", locationId);
    await fetch();
  };

  const setLocations = async (locationIds: string[]) => {
    if (!userId) return;
    const currentIds = accessEntries.map((e) => e.location_id);
    const toAdd = locationIds.filter((id) => !currentIds.includes(id));
    const toRemove = currentIds.filter((id) => !locationIds.includes(id));

    if (toAdd.length > 0) {
      await supabase
        .from("user_location_access" as any)
        .insert(toAdd.map((location_id) => ({ user_id: userId, location_id })) as any);
    }
    for (const locId of toRemove) {
      await supabase
        .from("user_location_access" as any)
        .delete()
        .eq("user_id", userId)
        .eq("location_id", locId);
    }
    await fetch();
  };

  return {
    accessEntries,
    locationIds: accessEntries.map((e) => e.location_id),
    loading,
    grantAccess,
    revokeAccess,
    setLocations,
    refetch: fetch,
  };
}
