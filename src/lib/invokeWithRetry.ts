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
      body:
        action != null
          ? { ...(options.body ?? {}), __action: action }
          : options.body,
    },
  };
}

async function getErrorSignal(res: { data: any; error: any }): Promise<string> {
  return [res.error?.message, res.error?.status, res.data?.error, res.data?.message, res.data?.code]
    .filter(Boolean)
    .map(String)
    .join(" ");
}

async function invokeFunction(fnName: string, options: { body?: any; headers?: Record<string, string> }) {
  const session = (await supabase.auth.getSession()).data.session;
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${fnName}`, {
    method: "POST",
    headers: {
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
      Authorization: `Bearer ${session?.access_token ?? ""}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text ? { message: text } : null;
  }

  if (!res.ok) {
    return {
      data,
      error: {
        message: data?.message ?? data?.error ?? `Edge function returned ${res.status}`,
        status: res.status,
      },
    };
  }

  return { data, error: null };
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
      let res: { data: any; error: any };
      try {
        res = await invokeFunction(normalized.fnName, normalized.options);
      } catch (error) {
        res = { data: null, error };
      }

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
