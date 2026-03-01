import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  // Validate pitch API key
  const pitchKey = Deno.env.get("PITCH_API_KEY");
  if (!pitchKey) return json({ error: "PITCH_API_KEY not configured" }, 500);

  const url = new URL(req.url);
  const providedKey =
    req.headers.get("x-pitch-api-key") || url.searchParams.get("key");

  if (providedKey !== pitchKey) {
    return json({ error: "Unauthorized" }, 401);
  }

  // Sign in as the pitch demo user
  const email = Deno.env.get("PITCH_USER_EMAIL");
  const password = Deno.env.get("PITCH_USER_PASSWORD");
  if (!email || !password) {
    return json({ error: "Pitch user credentials not configured" }, 500);
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session) {
      console.error("Pitch login error:", error);
      return json({ error: "Login failed" }, 401);
    }

    return json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
    });
  } catch (err) {
    console.error("pitch-session error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
