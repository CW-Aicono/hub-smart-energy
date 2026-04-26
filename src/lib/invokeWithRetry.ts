import { supabase } from "@/integrations/supabase/client";

const inFlightInvocations = new Map<string, Promise<{ data: any; error: any }>>();

const TRANSIENT_EDGE_ERROR = /503|temporarily unavailable|SUPABASE_EDGE_RUNTIME_ERROR|BOOT_ERROR|Service is temporarily unavailable/i;

function stableSerialize(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, val]) => `${JSON.stringify(key)}:${stableSerialize(val)}`).join(",")}}`;
}

function getInvocationKey(fnName: string, options: { body?: any; headers?: Record<string, string> }) {
  return `${fnName}::${stableSerialize({ body: options.body ?? null, headers: options.headers ?? null })}`;
}

function normalizeInvocation(fnName: string, options: { body?: any; headers?: Record<string, string> }) {
  const [name, query] = fnName.split("?");
  if (!query) return { fnName, options };

  const action = new URLSearchParams(query).get("action");
  return {
    fnName: name,
    options: {
      ...options,
      headers: {
        ...(options.headers ?? {}),
        ...(action ? { "x-ocpp-simulator-action": action } : {}),
      },
    },
  };
}

async function getErrorSignal(res: { data: any; error: any }): Promise<string> {
  const parts = [res.error?.message, res.error?.status, res.data?.error, res.data?.message, res.data?.code]
    .filter(Boolean)
    .map(String);

  const context = res.error?.context;
  if (context instanceof Response) {
    parts.push(String(context.status));
    try {
      parts.push(await context.clone().text());
    } catch {
      /* ignore unreadable response bodies */
    }
  }

  return parts.join(" ");
}

/**
 * Invokes a Supabase Edge Function with automatic retry on transient
 * 503 / "Service is temporarily unavailable" / SUPABASE_EDGE_RUNTIME_ERROR.
 */
export async function invokeWithRetry<T = any>(
  fnName: string,
  options: { body?: any; headers?: Record<string, string> } = {},
  maxAttempts = 3,
): Promise<{ data: T | null; error: any }> {
  const normalized = normalizeInvocation(fnName, options);
  const key = getInvocationKey(normalized.fnName, normalized.options);
  const existing = inFlightInvocations.get(key);
  if (existing) return existing as Promise<{ data: T | null; error: any }>;

  const request = (async () => {
    let lastResult: { data: any; error: any } = { data: null, error: null };
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const res = await supabase.functions.invoke(normalized.fnName, normalized.options);
      lastResult = res as any;
      const msg = await getErrorSignal(res as any);
      const isTransient = TRANSIENT_EDGE_ERROR.test(msg);
      if (!res.error && (res.data as any)?.success !== false) return res as any;
      if (!isTransient) return res as any;
      if (attempt === maxAttempts - 1) return res as any;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
    return lastResult;
  })().finally(() => {
    inFlightInvocations.delete(key);
  });

  inFlightInvocations.set(key, request);
  return request as Promise<{ data: T | null; error: any }>;
}
