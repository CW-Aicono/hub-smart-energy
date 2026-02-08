import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface LoxoneConfig {
  serial_number: string;
  username: string;
  password: string;
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

interface LoxoneStateValue {
  value: number | string;
  text?: string;
}

// Resolve Loxone Cloud DNS by following the redirect from dns.loxonecloud.com/{serial}
async function resolveLoxoneCloudURL(serialNumber: string): Promise<string | null> {
  try {
    // The Loxone Cloud DNS service redirects to the actual Miniserver URL
    // Format: http://dns.loxonecloud.com/{SERIAL} -> https://{ip-encoded}.{serial}.dyndns.loxonecloud.com:{port}
    const dnsUrl = `http://dns.loxonecloud.com/${serialNumber}`;
    console.log(`Resolving via Loxone Cloud redirect: ${dnsUrl}`);
    
    // Make a HEAD request and follow redirects to get the final URL
    const response = await fetch(dnsUrl, {
      method: "HEAD",
      redirect: "follow",
    });
    
    // The final URL after redirects is what we need
    const finalUrl = response.url;
    console.log(`Resolved to final URL: ${finalUrl}`);
    
    // Extract base URL (remove any path)
    const urlObj = new URL(finalUrl);
    const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
    console.log(`Using base URL: ${baseUrl}`);
    
    return baseUrl;
  } catch (error) {
    console.error("Cloud DNS resolution error:", error);
    return null;
  }
}

// Update sync status in database
async function updateSyncStatus(
  supabase: ReturnType<typeof createClient>,
  locationIntegrationId: string,
  status: "success" | "error" | "syncing",
  error?: string
) {
  const updateData: Record<string, unknown> = {
    sync_status: status,
    last_sync_at: new Date().toISOString(),
  };
  
  await supabase
    .from("location_integrations")
    .update(updateData)
    .eq("id", locationIntegrationId);
    
  console.log(`Updated sync_status to: ${status}`);
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { locationIntegrationId, action } = await req.json();

    if (!locationIntegrationId) {
      throw new Error("Location Integration ID ist erforderlich");
    }

    console.log(`Loxone API request: action=${action}, locationIntegrationId=${locationIntegrationId}`);

    // Get Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch location_integration with its config (contains credentials)
    const { data: locationIntegration, error: liError } = await supabase
      .from("location_integrations")
      .select("*, integration:integrations(*)")
      .eq("id", locationIntegrationId)
      .maybeSingle();

    if (liError || !locationIntegration) {
      console.error("Location integration not found:", liError);
      throw new Error("Standort-Integration nicht gefunden");
    }

    const config = locationIntegration.config as LoxoneConfig;
    
    if (!config) {
      throw new Error("Keine Konfiguration vorhanden");
    }

    if (!config.serial_number) {
      throw new Error("Seriennummer nicht konfiguriert");
    }

    if (!config.username || !config.password) {
      throw new Error("Benutzername oder Passwort nicht konfiguriert");
    }

    console.log(`Config: serial=${config.serial_number}, user=${config.username}`);

    // Resolve via Loxone Cloud redirect
    console.log(`Resolving Cloud URL for serial: ${config.serial_number}`);
    const baseUrl = await resolveLoxoneCloudURL(config.serial_number);
    
    if (!baseUrl) {
      await updateSyncStatus(supabase, locationIntegrationId, "error");
      throw new Error("Cloud DNS Auflösung fehlgeschlagen. Miniserver nicht erreichbar oder nicht für Remote-Zugriff konfiguriert.");
    }

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
      });

      if (!response.ok) {
        console.error(`Connection test failed: ${response.status} ${response.statusText}`);
        await updateSyncStatus(supabase, locationIntegrationId, "error");
        throw new Error(`Verbindung fehlgeschlagen: ${response.status} - Prüfen Sie Benutzername und Passwort`);
      }

      const data = await response.json();
      console.log("Connection test successful:", data);

      // Update sync status to success
      await updateSyncStatus(supabase, locationIntegrationId, "success");

      return new Response(
        JSON.stringify({ success: true, data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "getSensors") {
      // Set status to syncing
      await updateSyncStatus(supabase, locationIntegrationId, "syncing");

      // Fetch structure file (LoxAPP3.json)
      const structureUrl = `${baseUrl}/data/LoxAPP3.json`;
      console.log(`Fetching structure: ${structureUrl}`);

      const structureResponse = await fetch(structureUrl, {
        method: "GET",
        headers: {
          Authorization: authHeader,
        },
      });

      if (!structureResponse.ok) {
        console.error(`Failed to fetch structure: ${structureResponse.status} ${structureResponse.statusText}`);
        await updateSyncStatus(supabase, locationIntegrationId, "error");
        
        if (structureResponse.status === 401) {
          throw new Error("Authentifizierung fehlgeschlagen. Bitte Benutzername und Passwort prüfen.");
        }
        
        throw new Error(`Struktur konnte nicht geladen werden: ${structureResponse.status}`);
      }

      const structure: LoxoneStructure = await structureResponse.json();
      console.log(`Loaded structure with ${Object.keys(structure.controls || {}).length} controls`);

      // Fetch current states from the Miniserver
      const statesUrl = `${baseUrl}/jdev/sps/status`;
      console.log(`Fetching current states: ${statesUrl}`);
      
      let currentStates: Record<string, unknown> = {};
      try {
        const statesResponse = await fetch(statesUrl, {
          method: "GET",
          headers: {
            Authorization: authHeader,
          },
        });
        
        if (statesResponse.ok) {
          const statesData = await statesResponse.json();
          currentStates = statesData?.LL?.value || {};
          console.log(`Loaded ${Object.keys(currentStates).length} state values`);
        } else {
          console.log(`States endpoint returned ${statesResponse.status}, will use structure values`);
        }
      } catch (statesError) {
        console.log("Could not fetch states, will use structure values:", statesError);
      }

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

        // Try to get current value from states
        let value = "-";
        let status: "online" | "offline" = "online";

        // Check if this control has states defined and try to get their values
        if (control.states) {
          // Try common state names: value, actual, position, level, etc.
          const stateKeys = Object.keys(control.states);
          for (const stateKey of stateKeys) {
            const stateUuid = control.states[stateKey];
            if (stateUuid && currentStates[stateUuid] !== undefined) {
              const stateValue = currentStates[stateUuid];
              if (typeof stateValue === "number") {
                // Format the value based on type
                if (sensorType === "temperature") {
                  value = stateValue.toFixed(1);
                } else if (sensorType === "humidity" || sensorType === "light" || sensorType === "blind") {
                  value = Math.round(stateValue).toString();
                } else if (sensorType === "switch" || sensorType === "digital") {
                  value = stateValue > 0 ? "Ein" : "Aus";
                  unit = "";
                } else if (sensorType === "power") {
                  value = stateValue.toFixed(2);
                } else {
                  value = typeof stateValue === "number" ? stateValue.toFixed(2) : String(stateValue);
                }
                break; // Use first found value
              } else if (typeof stateValue === "string") {
                value = stateValue;
                break;
              }
            }
          }
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
          status: status,
          states: control.states,
        });
      }

      console.log(`Parsed ${sensors.length} sensors`);

      // Update sync status to success
      await updateSyncStatus(supabase, locationIntegrationId, "success");

      return new Response(
        JSON.stringify({ success: true, sensors }),
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
      // IMPORTANT: return 200 so the client can read the structured error payload
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
