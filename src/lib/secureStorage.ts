import { supabase } from "@/integrations/supabase/client";

const objectUrlCache = new Map<string, string>();

async function getAccessToken(): Promise<string | null> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (token) return token;
    await new Promise((resolve) => window.setTimeout(resolve, 100));
  }
  return null;
}

async function callDownload(token: string, bucket: string, path: string) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    || `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co`;
  return fetch(`${supabaseUrl}/functions/v1/secure-storage-download`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify({ bucket, path }),
  });
}

export async function downloadSecureStorageObject(bucket: string, path: string): Promise<string | null> {
  if (!path || path.startsWith("blob:")) return path || null;
  if (/^https?:\/\//i.test(path)) return path;

  const cacheKey = `${bucket}:${path}`;
  const cached = objectUrlCache.get(cacheKey);
  if (cached) return cached;

  let token = await getAccessToken();
  if (!token) return null;

  let response = await callDownload(token, bucket, path);

  // Stale session (logout/login in another tab): refresh once and retry
  if (response.status === 401) {
    const { data, error } = await supabase.auth.refreshSession();
    if (error || !data.session?.access_token) {
      console.warn("Secure storage: session refresh failed", { bucket, path });
      return null;
    }
    token = data.session.access_token;
    response = await callDownload(token, bucket, path);
  }

  if (!response.ok) {
    console.error("Secure storage download failed", { bucket, path, status: response.status, body: await response.text() });
    return null;
  }

  const objectUrl = URL.createObjectURL(await response.blob());
  objectUrlCache.set(cacheKey, objectUrl);
  return objectUrl;
}