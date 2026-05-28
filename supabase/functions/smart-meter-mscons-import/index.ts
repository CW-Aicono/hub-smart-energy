// MSCONS Import (Iter C – produktiv)
// Parst EDIFACT MSCONS 2.4c (Subset: Lastgang ¼-h / Tageswerte) und schreibt
// nach community_member_readings_15min. Mapping über MeLo -> community_members.melo_id.
//
// Begrenzter Funktionsumfang: nur RFF+Z19/LOC+172 als MeLo-Quelle, DTM+163 als Intervallstart,
// QTY+220 (Bezug) bzw. QTY+187 (Einspeisung). UTC-Zeitstempel.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PARSER_VERSION = "mscons-2.4c-min/1.0.0";

async function sha256(buf: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface ParsedInterval {
  melo: string;
  ts_start: string; // ISO
  kwh: number;
  direction: "consumption" | "feed_in";
}

interface ParseResult {
  intervals: ParsedInterval[];
  errors: { segment: string; reason: string }[];
  meloCount: number;
}

// EDIFACT-Datetime 203 (CCYYMMDDHHMM) -> ISO UTC (Behandlung wie lokale Berliner Zeit -> UTC ist
// in der Marktkommunikation strittig; hier nehmen wir UTC direkt, weil VNB i.d.R. UTC liefert).
function parseDtm203(value: string): string | null {
  if (!/^\d{12}$/.test(value)) return null;
  const y = value.slice(0, 4);
  const mo = value.slice(4, 6);
  const d = value.slice(6, 8);
  const h = value.slice(8, 10);
  const mi = value.slice(10, 12);
  return `${y}-${mo}-${d}T${h}:${mi}:00Z`;
}

function parseMscons(text: string): ParseResult {
  const result: ParseResult = { intervals: [], errors: [], meloCount: 0 };

  // UNA-Defaults
  let compSep = ":";
  let elSep = "+";
  let decimalChar = ".";
  let releaseChar = "?";
  let segSep = "'";

  if (text.startsWith("UNA")) {
    compSep = text[3];
    elSep = text[4];
    decimalChar = text[5];
    releaseChar = text[6];
    segSep = text[8];
    text = text.slice(9);
  }

  // Segmente trennen (release char beachten – minimal)
  const rawSegments = text.split(segSep).map((s) => s.trim().replace(/[\r\n]+/g, "")).filter(Boolean);

  let currentMelo: string | null = null;
  let currentDirection: "consumption" | "feed_in" = "consumption";
  let pendingTs: string | null = null;
  let meloSet = new Set<string>();

  for (const seg of rawSegments) {
    const parts = seg.split(elSep);
    const tag = parts[0];

    try {
      // LOC+172+<MeLo>::9
      if (tag === "LOC" && parts[1] === "172" && parts[2]) {
        const melo = parts[2].split(compSep)[0];
        if (melo) {
          currentMelo = melo;
          meloSet.add(melo);
        }
      }
      // RFF+Z19:<MeLo>
      else if (tag === "RFF" && parts[1]) {
        const sub = parts[1].split(compSep);
        if (sub[0] === "Z19" && sub[1]) {
          currentMelo = sub[1];
          meloSet.add(sub[1]);
        }
      }
      // CCI segment for direction (heuristic): CCI++Z03 = feed_in
      else if (tag === "CCI" && parts[2]) {
        const code = parts[2].split(compSep)[0];
        if (code === "Z03" || code === "Z04") currentDirection = "feed_in";
        if (code === "Z01" || code === "Z02") currentDirection = "consumption";
      }
      // DTM+163:<value>:203  -> Intervallstart
      else if (tag === "DTM" && parts[1]) {
        const sub = parts[1].split(compSep);
        if (sub[0] === "163" && sub[2] === "203") {
          pendingTs = parseDtm203(sub[1]);
        }
      }
      // QTY+220:<value>:KWH oder QTY+187:<value>:KWH
      else if (tag === "QTY" && parts[1]) {
        const sub = parts[1].split(compSep);
        const code = sub[0];
        const valueStr = (sub[1] ?? "").replace(decimalChar === "." ? "," : ".", ".");
        const value = Number(valueStr);
        if (!Number.isFinite(value)) {
          result.errors.push({ segment: seg, reason: "QTY value not numeric" });
          continue;
        }
        let direction: "consumption" | "feed_in" = currentDirection;
        if (code === "220") direction = "consumption";
        else if (code === "187") direction = "feed_in";
        else continue; // andere QTY-Codes ignorieren

        if (!currentMelo) {
          result.errors.push({ segment: seg, reason: "QTY ohne MeLo-Kontext" });
          continue;
        }
        if (!pendingTs) {
          result.errors.push({ segment: seg, reason: "QTY ohne Intervallstart (DTM+163)" });
          continue;
        }

        result.intervals.push({
          melo: currentMelo,
          ts_start: pendingTs,
          kwh: Math.abs(value),
          direction,
        });
      }
    } catch (e) {
      result.errors.push({ segment: seg, reason: String(e) });
    }
  }

  result.meloCount = meloSet.size;
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: profile } = await admin
      .from("profiles").select("tenant_id").eq("user_id", userData.user.id).maybeSingle();
    if (!profile?.tenant_id) {
      return new Response(JSON.stringify({ error: "No tenant" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const form = await req.formData();
    const file = form.get("file");
    const locationId = (form.get("location_id") as string) || null;
    const communityId = (form.get("community_id") as string) || null;
    if (!(file instanceof File)) {
      return new Response(JSON.stringify({ error: "file required (multipart)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const buf = await file.arrayBuffer();
    const hash = await sha256(buf);

    const { data: existing } = await admin
      .from("smart_meter_mscons_imports")
      .select("id, status, rows_imported, rows_skipped, parsed_intervals")
      .eq("tenant_id", profile.tenant_id).eq("file_hash", hash).maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ ok: true, deduplicated: true, import: existing }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Initialer Audit-Eintrag
    const { data: imp, error: insErr } = await admin
      .from("smart_meter_mscons_imports")
      .insert({
        tenant_id: profile.tenant_id,
        location_id: locationId,
        community_id: communityId,
        uploaded_by: userData.user.id,
        file_name: file.name,
        file_hash: hash,
        file_size_bytes: buf.byteLength,
        status: "parsing",
        parser_version: PARSER_VERSION,
      })
      .select().single();
    if (insErr || !imp) {
      return new Response(JSON.stringify({ error: insErr?.message ?? "insert failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parsen
    const text = new TextDecoder("latin1").decode(buf);
    const parsed = parseMscons(text);

    let imported = 0;
    let skipped = 0;

    if (parsed.intervals.length > 0) {
      // MeLo-Liste eindeutig
      const meloList = Array.from(new Set(parsed.intervals.map((i) => i.melo)));
      const memberQuery = admin
        .from("community_members")
        .select("id, community_id, melo_id")
        .eq("tenant_id", profile.tenant_id)
        .in("melo_id", meloList);
      if (communityId) memberQuery.eq("community_id", communityId);
      const { data: members } = await memberQuery;
      const meloToMember = new Map<string, { id: string; community_id: string }>();
      for (const m of members ?? []) {
        if (m.melo_id) meloToMember.set(m.melo_id, { id: m.id, community_id: m.community_id });
      }

      const rows = parsed.intervals.flatMap((iv) => {
        const member = meloToMember.get(iv.melo);
        if (!member) { skipped++; return []; }
        return [{
          tenant_id: profile.tenant_id,
          community_id: member.community_id,
          member_id: member.id,
          ts_start: iv.ts_start,
          kwh: iv.kwh,
          direction: iv.direction,
          source: "mscons",
          import_id: imp.id,
        }];
      });

      // Batch-Upsert in Chunks
      const CHUNK = 500;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const { error: upErr } = await admin
          .from("community_member_readings_15min")
          .upsert(chunk, { onConflict: "member_id,ts_start,direction" });
        if (upErr) {
          parsed.errors.push({ segment: "BATCH", reason: upErr.message });
        } else {
          imported += chunk.length;
        }
      }
    }

    await admin.from("smart_meter_mscons_imports").update({
      status: parsed.errors.length === 0 && imported > 0 ? "completed" : (imported > 0 ? "partial" : "failed"),
      rows_imported: imported,
      rows_skipped: skipped,
      parsed_intervals: parsed.intervals.length,
      error_segments: parsed.errors.slice(0, 100),
      imported_at: new Date().toISOString(),
      error_message: parsed.errors.length > 0 ? `${parsed.errors.length} Fehler beim Parsen` : null,
      meta: { melo_count: parsed.meloCount },
    }).eq("id", imp.id);

    return new Response(JSON.stringify({
      ok: true,
      import_id: imp.id,
      parsed_intervals: parsed.intervals.length,
      imported,
      skipped,
      errors: parsed.errors.length,
      melo_count: parsed.meloCount,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
