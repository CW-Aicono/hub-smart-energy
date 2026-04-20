/**
 * cf-tunnel-cleanup
 * =================
 * Einmaliger Job zum Löschen ALLER aicono-* Cloudflare Tunnels und ihrer
 * zugehörigen *.aicono.org CNAME-Records aus dem Cloudflare-Account.
 *
 * Hintergrund: Mit dem Wechsel von Home-Assistant + Cloudflare-Tunnel auf das
 * neue AICONO Gateway (WebSocket-Push, kein Tunnel mehr) müssen alle bisher
 * bereitgestellten Tunnel-Ressourcen entfernt werden.
 *
 * Aufruf (nur Admins):
 *   POST /functions/v1/cf-tunnel-cleanup
 *   Authorization: Bearer <user-access-token>
 *   Body: { dry_run?: boolean }   // default: false
 *
 * Sicherheitsmerkmale:
 *  - Nur authentifizierte Admin-User dürfen ausführen.
 *  - Löscht ausschließlich Tunnels, deren Name mit "aicono-" beginnt.
 *  - Löscht ausschließlich CNAMEs, die auf "*.cfargotunnel.com" zeigen
 *    UND deren Hostname auf ".aicono.org" endet.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const CF_TOKEN = Deno.env.get("CLOUDFLARE_API_TOKEN")!;
const CF_ACCOUNT = Deno.env.get("CLOUDFLARE_ACCOUNT_ID")!;
const CF_ZONE = Deno.env.get("CLOUDFLARE_ZONE_ID")!;

interface CfApiResp<T> {
  success: boolean;
  errors?: Array<{ code: number; message: string }>;
  result: T;
  result_info?: { page: number; total_pages: number; count: number };
}

async function cf<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${CF_TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const json = (await res.json()) as CfApiResp<T>;
  if (!json.success) {
    throw new Error(
      `Cloudflare API ${path}: ${json.errors?.map((e) => `${e.code} ${e.message}`).join(", ") || res.status}`,
    );
  }
  return json.result;
}

interface CfTunnel {
  id: string;
  name: string;
  deleted_at: string | null;
}
interface CfDnsRecord {
  id: string;
  name: string;
  type: string;
  content: string;
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Auth: must be admin
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const authClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await authClient.auth.getUser(token);
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .in("role", ["admin", "super_admin"])
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Forbidden – admin only" }), {
        status: 403,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun: boolean = body.dry_run === true;

    const report = {
      dry_run: dryRun,
      tunnels_found: 0,
      tunnels_deleted: 0,
      tunnels_failed: [] as Array<{ id: string; name: string; error: string }>,
      dns_found: 0,
      dns_deleted: 0,
      dns_failed: [] as Array<{ id: string; name: string; error: string }>,
    };

    // ── 1. List all aicono-* tunnels (paginated) ───────────────────────────
    const tunnels: CfTunnel[] = [];
    let page = 1;
    while (true) {
      const list = await cf<CfTunnel[]>(
        `/accounts/${CF_ACCOUNT}/cfd_tunnel?per_page=50&page=${page}&is_deleted=false`,
      );
      tunnels.push(...list.filter((t) => t.name.startsWith("aicono-") && !t.deleted_at));
      if (list.length < 50) break;
      page++;
      if (page > 20) break; // safety
    }
    report.tunnels_found = tunnels.length;

    // ── 2. Delete tunnels (cleanup_connections=true to force-close active conns) ──
    if (!dryRun) {
      for (const t of tunnels) {
        try {
          await cf(`/accounts/${CF_ACCOUNT}/cfd_tunnel/${t.id}?cascade=true`, {
            method: "DELETE",
          });
          report.tunnels_deleted++;
        } catch (e) {
          report.tunnels_failed.push({ id: t.id, name: t.name, error: String(e?.message || e) });
        }
      }
    }

    // ── 3. List all DNS records pointing to *.cfargotunnel.com ─────────────
    const dnsRecords: CfDnsRecord[] = [];
    page = 1;
    while (true) {
      const list = await cf<CfDnsRecord[]>(
        `/zones/${CF_ZONE}/dns_records?type=CNAME&per_page=100&page=${page}`,
      );
      dnsRecords.push(
        ...list.filter(
          (r) => r.content.endsWith(".cfargotunnel.com") && r.name.endsWith(".aicono.org"),
        ),
      );
      if (list.length < 100) break;
      page++;
      if (page > 20) break;
    }
    report.dns_found = dnsRecords.length;

    // ── 4. Delete DNS records ─────────────────────────────────────────────
    if (!dryRun) {
      for (const r of dnsRecords) {
        try {
          await cf(`/zones/${CF_ZONE}/dns_records/${r.id}`, { method: "DELETE" });
          report.dns_deleted++;
        } catch (e) {
          report.dns_failed.push({ id: r.id, name: r.name, error: String(e?.message || e) });
        }
      }
    }

    return new Response(JSON.stringify({ success: true, ...report }, null, 2), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[cf-tunnel-cleanup]", e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
