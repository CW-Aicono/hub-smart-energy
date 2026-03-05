import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Authenticate user
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(
      authHeader?.replace("Bearer ", "") || ""
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { tenantId } = await req.json();
    if (!tenantId) throw new Error("tenantId required");

    // Fetch context data for AI analysis
    const [automationsRes, locationsRes, metersRes] = await Promise.all([
      supabase.from("location_automations").select("name, category, conditions, actions, is_active, estimated_savings_kwh").eq("tenant_id", tenantId),
      supabase.from("locations").select("id, name, type").eq("tenant_id", tenantId).eq("is_archived", false),
      supabase.from("meters").select("id, name, energy_type, meter_type").eq("tenant_id", tenantId).limit(50),
    ]);

    const existingRules = automationsRes.data || [];
    const locations = locationsRes.data || [];
    const meters = metersRes.data || [];

    const systemPrompt = `Du bist ein Experte für Gebäudeautomation und Energieeffizienz. Analysiere die folgenden Daten eines Gebäudeportfolios und generiere 3-5 konkrete, umsetzbare Empfehlungen für Automatisierungsregeln, die Energie sparen.

Antworte NUR mit dem Tool-Call, keine zusätzliche Erklärung.

Kontext:
- ${locations.length} Standorte: ${locations.map(l => l.name).join(", ")}
- ${meters.length} Zähler, Energiearten: ${[...new Set(meters.map(m => m.energy_type))].join(", ")}
- ${existingRules.length} bestehende Regeln: ${existingRules.map(r => r.name).join(", ")}

Berücksichtige typische Einsparpotenziale:
- Nachtabsenkung Heizung: 10-15%
- Präsenzbasierte Beleuchtung: 20-30%
- CO2-gesteuerte Lüftung: 5-10%
- Wochenend-Absenkprofil: 15-25%
- Peak-Shaving: 10-20% der Spitzenlastkosten`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Generiere Empfehlungen für Gebäudeautomation basierend auf dem Kontext." },
        ],
        tools: [{
          type: "function",
          function: {
            name: "suggest_automations",
            description: "Return 3-5 automation recommendations",
            parameters: {
              type: "object",
              properties: {
                suggestions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      description: { type: "string" },
                      estimated_savings_kwh: { type: "number", description: "Monthly savings in kWh" },
                      confidence: { type: "number", description: "Confidence 0-100" },
                      category: { type: "string", enum: ["heating", "lighting", "hvac", "peak_shaving", "custom"] },
                    },
                    required: ["title", "description", "estimated_savings_kwh", "confidence", "category"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["suggestions"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "suggest_automations" } },
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit erreicht, bitte später erneut versuchen." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Guthaben erschöpft." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${status}`);
    }

    const aiData = await response.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    let recommendations = [];
    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      recommendations = (parsed.suggestions || []).map((s: any, i: number) => ({
        id: `ai-${i}-${Date.now()}`,
        ...s,
        suggested_conditions: [],
        suggested_actions: [],
      }));
    }

    return new Response(JSON.stringify({ recommendations }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("automation-ai-recommendations error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
