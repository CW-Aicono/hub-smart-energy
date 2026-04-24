import { supabase } from "@/integrations/supabase/client";

/**
 * Invokes a Supabase Edge Function with automatic retry on transient
 * 503 / "Service is temporarily unavailable" / SUPABASE_EDGE_RUNTIME_ERROR.
 */
export async function invokeWithRetry<T = any>(
  fnName: string,
  options: { body?: any; headers?: Record<string, string> } = {},
  maxAttempts = 3,
): Promise<{ data: T | null; error: any }> {
  let lastResult: { data: any; error: any } = { data: null, error: null };
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await supabase.functions.invoke(fnName, options);
    lastResult = res as any;
    const msg = res.error?.message || (res.data as any)?.error || "";
    const isTransient = /503|temporarily unavailable|SUPABASE_EDGE_RUNTIME_ERROR/i.test(msg);
    if (!res.error && (res.data as any)?.success !== false) return res as any;
    if (!isTransient) return res as any;
    await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
  }
  return lastResult;
}
