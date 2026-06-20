// Kleiner Helper: prüft im worker_controls-Table, ob ein Worker aktiv ist.
// Wird am Anfang von Cron-getriggerten Edge-Functions aufgerufen.
// Bei false → Function sofort 200 OK mit { skipped: true } zurückgeben.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

let cached: { value: boolean; expires: number } | null = null;
const CACHE_MS = 10_000;

export async function isWorkerEnabled(workerKey: string): Promise<boolean> {
  // Mini-Cache: identische Function kann pro Minute mehrfach laufen.
  if (cached && cached.expires > Date.now() && (cached as any).key === workerKey) {
    return cached.value;
  }
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(url, key);
    const { data, error } = await sb
      .from("worker_controls")
      .select("enabled")
      .eq("worker_key", workerKey)
      .maybeSingle();
    if (error) {
      console.warn(`[killswitch] read failed for ${workerKey}: ${error.message} — defaulting to ENABLED`);
      return true;
    }
    const enabled = data?.enabled ?? true;
    cached = { value: enabled, expires: Date.now() + CACHE_MS } as any;
    (cached as any).key = workerKey;
    return enabled;
  } catch (e) {
    console.warn(`[killswitch] exception for ${workerKey}: ${(e as Error).message} — defaulting to ENABLED`);
    return true;
  }
}
