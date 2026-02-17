import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useTenant } from "./useTenant";
import { toast } from "sonner";
import { getT } from "@/i18n/getT";

const QUEUE_KEY = "offline_meter_readings";

export interface PendingReading {
  id: string;
  meter_id: string;
  value: number;
  reading_date: string;
  capture_method: string;
  notes?: string;
  queued_at: string;
}

function loadQueue(): PendingReading[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: PendingReading[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function useOfflineReadings() {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const tenantId = tenant?.id ?? null;
  const [pending, setPending] = useState<PendingReading[]>(loadQueue);
  const [syncing, setSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const syncingRef = useRef(false);

  // Track online/offline status
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // Enqueue a reading (works offline)
  const enqueue = useCallback((data: Omit<PendingReading, "id" | "queued_at">) => {
    const entry: PendingReading = {
      ...data,
      id: crypto.randomUUID(),
      queued_at: new Date().toISOString(),
    };
    const updated = [...loadQueue(), entry];
    saveQueue(updated);
    setPending(updated);
    return entry;
  }, []);

  // Sync all pending readings to backend
  const syncAll = useCallback(async () => {
    if (syncingRef.current || !tenantId || !user) return;
    const queue = loadQueue();
    if (queue.length === 0) return;

    syncingRef.current = true;
    setSyncing(true);

    const failed: PendingReading[] = [];
    let successCount = 0;

    for (const item of queue) {
      try {
        const { error } = await supabase.from("meter_readings").insert({
          meter_id: item.meter_id,
          value: item.value,
          reading_date: item.reading_date,
          capture_method: item.capture_method,
          notes: item.notes || null,
          tenant_id: tenantId,
          created_by: user.id,
        } as any);

        if (error) {
          console.error("Sync failed for reading:", item.id, error);
          failed.push(item);
        } else {
          successCount++;
        }
      } catch (err) {
        console.error("Network error syncing reading:", item.id, err);
        failed.push(item);
      }
    }

    saveQueue(failed);
    setPending(failed);
    syncingRef.current = false;
    setSyncing(false);

    const t = getT();
    if (successCount > 0) {
      const label = successCount > 1 ? t("offlineReading.synced_many") : t("offlineReading.synced_one");
      toast.success(`${successCount} ${label}`);
    }
    if (failed.length > 0) {
      const label = failed.length > 1 ? t("offlineReading.errorSync_many") : t("offlineReading.errorSync_one");
      toast.error(`${failed.length} ${label}`);
    }
  }, [tenantId, user]);

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline && pending.length > 0 && tenantId && user) {
      syncAll();
    }
  }, [isOnline, tenantId, user]);

  // Also try syncing on mount
  useEffect(() => {
    if (isOnline && tenantId && user) {
      const timer = setTimeout(() => syncAll(), 2000);
      return () => clearTimeout(timer);
    }
  }, [tenantId, user]);

  const clearQueue = useCallback(() => {
    saveQueue([]);
    setPending([]);
  }, []);

  return {
    pending,
    pendingCount: pending.length,
    isOnline,
    syncing,
    enqueue,
    syncAll,
    clearQueue,
  };
}
