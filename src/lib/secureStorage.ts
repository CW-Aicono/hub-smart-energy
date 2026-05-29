import { supabase } from "@/integrations/supabase/client";

export async function downloadSecureStorageObject(bucket: string, path: string): Promise<string | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return null;

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/secure-storage-download`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify({ bucket, path }),
  });

  if (!response.ok) {
    console.error("Secure storage download failed", { bucket, path, status: response.status, body: await response.text() });
    return null;
  }

  return URL.createObjectURL(await response.blob());
}