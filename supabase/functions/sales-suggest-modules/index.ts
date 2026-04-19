import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { getCorsHeaders } from "../_shared/cors.ts";

interface Suggestion {
  module_code: string;
  reason: string;
  required: boolean;
}

const ALL_MODULES = [
  "locations", "energy_monitoring", "live_values", "alerts", "reporting",
  "energy_report", "automation_building", "automation_multi", "floor_plans",
  "ev_charging", "tenant_electricity", "arbitrage_trading", "meter_scanning",
  "integrations", "brighthub_api", "task_management", "remote_support",
  "support_billing", "network_infra",
];

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { project_id } = await req.json();
    if (!project_id) {
      return new Response(JSON.stringify({ error: "project_id required" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: project } = await supabase
      .from("sales_projects")
      .select("kunde_typ")
      .eq("id", project_id)
      .maybeSingle();

    const { data: dists } = await supabase
      .from("sales_distributions")
      .select("id, name, typ")
      .eq("project_id", project_id);

    const distIds = (dists ?? []).map((d) => d.id);
    const { data: points } = distIds.length
      ? await supabase
          .from("sales_measurement_points")
          .select("energieart, anwendungsfall, bestand")
          .in("distribution_id", distIds)
      : { data: [] };

    const energyTypes = new Set((points ?? []).map((p) => p.energieart));
    const useCases = new Set((points ?? []).map((p) => p.anwendungsfall).filter(Boolean));
    const isIndustry = project?.kunde_typ === "industry";

    const suggestions: Suggestion[] = [];
    const add = (code: string, reason: string, required = false) =>
      suggestions.push({ module_code: code, reason, required });

    // Always required
    add("locations", "Basis-Modul: Liegenschaftsverwaltung", true);
    add("energy_monitoring", "Basis-Modul: Energiemonitoring", true);
    add("live_values", "Live-Anzeige der Messpunkte");
    add("alerts", "Schwellwert-Alarme für Verbrauchsanomalien");
    add("reporting", "Standard-Reports & Auswertungen");
    add("integrations", "Anbindung der Messgeräte");

    if ((dists?.length ?? 0) > 1 || isIndustry) {
      add("automation_multi", "Mehrere Verteilungen / industrielles Setup");
    } else {
      add("automation_building", "Gebäude-Automation für eine Liegenschaft");
    }

    if (Array.from(useCases).some((u) => /lade|wallbox|ev|charging/i.test(String(u)))) {
      add("ev_charging", "Ladepunkte erkannt", true);
    }
    if (Array.from(useCases).some((u) => /miet|tenant|wohnung/i.test(String(u)))) {
      add("tenant_electricity", "Mieterstrom-Szenario erkannt");
    }
    if (Array.from(useCases).some((u) => /pv|solar|speicher|battery/i.test(String(u)))) {
      add("arbitrage_trading", "PV / Speicher → Spotmarkt-Optimierung möglich");
    }
    if (energyTypes.has("electricity") && (points?.length ?? 0) >= 5) {
      add("energy_report", "Mehrere Messpunkte → Energiebericht sinnvoll");
    }
    if (isIndustry) {
      add("task_management", "Aufgabenverwaltung für Industrie-Standorte");
      add("remote_support", "Premium-Fernwartung empfohlen");
    }

    return new Response(JSON.stringify({ suggestions, available: ALL_MODULES }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
