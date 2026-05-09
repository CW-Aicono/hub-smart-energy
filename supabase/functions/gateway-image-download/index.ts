/**
 * gateway-image-download
 * ======================
 * Returns a short-lived (15 min) signed download URL for an AICONO Gateway OS
 * image hosted as a GitHub Release asset on `CW-Aicono/aicono-os`.
 *
 * Auth: requires a logged-in tenant admin (verify_jwt=false, manual check).
 *
 * Body:
 *   { variant: "x86_64" | "aarch64", version?: "latest" | "v3.2.0" }
 *
 * Response:
 *   { url, filename, expires_at, sha256, version, release_notes_url }
 *
 * Implementation:
 *   - Reads HA_ADDONS_PUSH_TOKEN secret (GitHub PAT with repo:read on aicono-os)
 *   - Fetches /releases/latest (or /releases/tags/<version>) from GitHub API
 *   - Picks the asset matching the variant
 *   - GitHub redirects asset downloads through a short-lived signed URL when you
 *     follow the API redirect with `Accept: application/octet-stream`.
 *     We forward that signed URL to the client.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GH_TOKEN = Deno.env.get("HA_ADDONS_PUSH_TOKEN") || "";
const GH_REPO = "CW-Aicono/aicono-os";

const VARIANTS: Record<string, RegExp> = {
  "x86_64": /aicono-os.*x86[_-]?64\.img\.xz$/i,
  "aarch64": /aicono-os.*aarch64\.img\.xz$/i,
};

async function resolveAdmin(token: string): Promise<{ ok: boolean }> {
  const sb = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data } = await sb.auth.getUser();
  if (!data?.user) return { ok: false };
  const svc = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: roles } = await svc
    .from("user_roles").select("role").eq("user_id", data.user.id);
  const isAdmin = (roles || []).some((r: any) => r.role === "admin" || r.role === "super_admin");
  return { ok: isAdmin };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const auth = req.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return json({ error: "Unauthorized" }, 401);

  const { ok } = await resolveAdmin(token);
  if (!ok) return json({ error: "Forbidden – admin role required" }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const variant = String(body?.variant || "x86_64");
  const version = String(body?.version || "latest");
  if (!VARIANTS[variant]) return json({ error: "Unknown variant" }, 400);
  if (!GH_TOKEN) return json({ error: "Image release token not configured" }, 503);

  const releasePath = version === "latest"
    ? `/repos/${GH_REPO}/releases/latest`
    : `/repos/${GH_REPO}/releases/tags/${encodeURIComponent(version)}`;

  const releaseRes = await fetch(`https://api.github.com${releasePath}`, {
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "aicono-cloud",
    },
  });
  if (!releaseRes.ok) {
    return json({ error: `Release not found (${releaseRes.status})` }, 404);
  }
  const release = await releaseRes.json();

  const assetRegex = VARIANTS[variant];
  const asset = (release.assets || []).find((a: any) => assetRegex.test(a.name));
  if (!asset) return json({ error: "No matching image asset in release" }, 404);

  // Find SHA256SUMS asset to look up checksum
  let sha256: string | null = null;
  const sumsAsset = (release.assets || []).find((a: any) => /SHA256SUMS\.txt$/i.test(a.name));
  if (sumsAsset) {
    try {
      const sumsRes = await fetch(sumsAsset.url, {
        headers: {
          Authorization: `Bearer ${GH_TOKEN}`,
          Accept: "application/octet-stream",
          "User-Agent": "aicono-cloud",
        },
      });
      const sumsText = await sumsRes.text();
      const line = sumsText.split("\n").find((l) => l.includes(asset.name));
      if (line) sha256 = line.trim().split(/\s+/)[0];
    } catch (e) {
      console.warn("[gateway-image-download] sha256 lookup failed", (e as Error).message);
    }
  }

  // Resolve signed download URL by following the asset redirect manually
  const assetRes = await fetch(asset.url, {
    method: "GET",
    redirect: "manual",
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: "application/octet-stream",
      "User-Agent": "aicono-cloud",
    },
  });
  const signedUrl = assetRes.headers.get("location");
  if (!signedUrl) {
    return json({ error: "Could not resolve signed download URL" }, 502);
  }

  // GitHub signed URLs are valid for ~5 minutes. We mirror that conservatively.
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  return json({
    success: true,
    url: signedUrl,
    filename: asset.name,
    size_bytes: asset.size,
    sha256,
    version: release.tag_name,
    expires_at: expiresAt,
    release_notes_url: release.html_url,
  });
});
