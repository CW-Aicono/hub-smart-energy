import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface LoxoneConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  use_ssl: boolean;
  serial_number: string;
}

interface LoxoneControl {
  name: string;
  type: string;
  uuidAction: string;
  room: string;
  cat: string;
  states?: Record<string, string>;
}

interface LoxoneStructure {
  controls: Record<string, LoxoneControl>;
  rooms: Record<string, { name: string }>;
  cats: Record<string, { name: string }>;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { integrationId, action } = await req.json();

    if (!integrationId) {
      throw new Error("Integration ID ist erforderlich");
    }

    console.log(`Loxone API request: action=${action}, integrationId=${integrationId}`);

    // Get Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch integration config
    const { data: integration, error: integrationError } = await supabase
      .from("integrations")
      .select("*")
      .eq("id", integrationId)
      .single();

    if (integrationError || !integration) {
      console.error("Integration not found:", integrationError);
      throw new Error("Integration nicht gefunden");
    }

    const config = integration.config as LoxoneConfig;
    
    if (!config?.serial_number) {
      throw new Error("Seriennummer nicht konfiguriert");
    }

    console.log(`Connecting to Loxone Miniserver with serial: ${config.serial_number}`);

    // Build Loxone URL - use Cloud DNS with serial number
    const protocol = config.use_ssl ? "https" : "http";
    let baseUrl: string;

    if (config.host && config.host.includes(".")) {
      // Direct IP/hostname provided
      baseUrl = `${protocol}://${config.host}:${config.port}`;
    } else {
      // Use Loxone Cloud DNS with serial number
      baseUrl = `http://dns.loxonecloud.com/${config.serial_number}`;
    }

    console.log(`Base URL: ${baseUrl}`);

    // Create Basic Auth header
    const credentials = btoa(`${config.username}:${config.password}`);
    const authHeader = `Basic ${credentials}`;

    if (action === "test") {
      // Test connection by fetching API status
      const testUrl = `${baseUrl}/jdev/cfg/api`;
      console.log(`Testing connection: ${testUrl}`);

      const response = await fetch(testUrl, {
        method: "GET",
        headers: {
          Authorization: authHeader,
        },
        redirect: "follow",
      });

      if (!response.ok) {
        console.error(`Connection test failed: ${response.status} ${response.statusText}`);
        throw new Error(`Verbindung fehlgeschlagen: ${response.status}`);
      }

      const data = await response.json();
      console.log("Connection test successful:", data);

      return new Response(
        JSON.stringify({ success: true, data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "getSensors") {
      // Fetch structure file (LoxAPP3.json)
      const structureUrl = `${baseUrl}/data/LoxAPP3.json`;
      console.log(`Fetching structure: ${structureUrl}`);

      const response = await fetch(structureUrl, {
        method: "GET",
        headers: {
          Authorization: authHeader,
        },
        redirect: "follow",
      });

      if (!response.ok) {
        console.error(`Failed to fetch structure: ${response.status} ${response.statusText}`);
        throw new Error(`Struktur konnte nicht geladen werden: ${response.status}`);
      }

      const structure: LoxoneStructure = await response.json();
      console.log(`Loaded structure with ${Object.keys(structure.controls || {}).length} controls`);

      // Parse controls into sensors
      const sensors = [];
      const controls = structure.controls || {};
      const rooms = structure.rooms || {};
      const categories = structure.cats || {};

      for (const [uuid, control] of Object.entries(controls)) {
        // Get room and category names
        const roomName = control.room ? rooms[control.room]?.name || "Unbekannt" : "Unbekannt";
        const catName = control.cat ? categories[control.cat]?.name || "Sonstige" : "Sonstige";

        // Determine sensor type based on control type
        let sensorType = "unknown";
        let value = "-";
        let unit = "";

        const controlType = control.type?.toLowerCase() || "";

        if (controlType.includes("temperature") || controlType.includes("temp")) {
          sensorType = "temperature";
          unit = "°C";
        } else if (controlType.includes("humidity") || controlType.includes("feuchte")) {
          sensorType = "humidity";
          unit = "%";
        } else if (controlType.includes("meter") || controlType.includes("zähler")) {
          sensorType = "power";
          unit = "kWh";
        } else if (controlType.includes("switch") || controlType.includes("schalter")) {
          sensorType = "switch";
        } else if (controlType.includes("dimmer") || controlType.includes("light")) {
          sensorType = "light";
          unit = "%";
        } else if (controlType.includes("jalousie") || controlType.includes("blind")) {
          sensorType = "blind";
          unit = "%";
        } else if (controlType.includes("infoonlyanalog")) {
          sensorType = "analog";
        } else if (controlType.includes("infoonlydigital")) {
          sensorType = "digital";
        } else if (controlType.includes("pushbutton") || controlType.includes("taster")) {
          sensorType = "button";
        } else if (controlType.includes("presence") || controlType.includes("motion")) {
          sensorType = "motion";
        }

        sensors.push({
          id: uuid,
          name: control.name || "Unbekannt",
          type: sensorType,
          controlType: control.type,
          room: roomName,
          category: catName,
          value: value,
          unit: unit,
          status: "online",
          states: control.states,
        });
      }

      console.log(`Parsed ${sensors.length} sensors`);

      return new Response(
        JSON.stringify({ success: true, sensors }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "getStates") {
      // Fetch current states for all controls
      const statesUrl = `${baseUrl}/jdev/sps/io`;
      console.log(`Fetching states: ${statesUrl}`);

      // Note: This endpoint might need adjustments based on Loxone version
      // Some miniservers use WebSocket for real-time updates
      
      return new Response(
        JSON.stringify({ success: true, message: "State fetching not yet implemented" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    throw new Error(`Unbekannte Aktion: ${action}`);
  } catch (error) {
    console.error("Loxone API error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unbekannter Fehler" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
