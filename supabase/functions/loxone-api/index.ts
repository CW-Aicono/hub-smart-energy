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

// Resolve Loxone Cloud DNS to get actual IP and port
async function resolveLoxoneCloudDNS(serialNumber: string): Promise<{ ip: string; port: number; useHttps: boolean } | null> {
  try {
    const dnsUrl = `http://dns.loxonecloud.com/?getip&snr=${serialNumber}&json=true`;
    console.log(`Resolving Cloud DNS: ${dnsUrl}`);
    
    const response = await fetch(dnsUrl);
    if (!response.ok) {
      console.error(`DNS resolution failed: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    console.log("DNS response:", JSON.stringify(data));
    
    // Check if Miniserver is registered and reachable
    if (data.Code !== 200 || data["DNS-Status"] !== "registered") {
      console.error("Miniserver not registered or unreachable");
      return null;
    }

    // Prefer HTTP connection since edge functions cannot handle self-signed SSL certs
    // Check PortOpen for HTTP availability first
    if (data.PortOpen && data.IP && data.Port) {
      console.log("Using HTTP connection (PortOpen available)");
      return { ip: data.IP, port: data.Port, useHttps: false };
    }

    // Use loxonecloud.com subdomain format for HTTP (always works if registered)
    // Format: http://{serialNumber}.dns.loxonecloud.com/
    if (data["DNS-Status"] === "registered") {
      console.log("Using Loxone Cloud DNS subdomain for HTTP");
      return { ip: `${serialNumber.toLowerCase()}.dns.loxonecloud.com`, port: 80, useHttps: false };
    }
    
    console.error("Could not establish HTTP connection path:", data);
    return null;
  } catch (error) {
    console.error("DNS resolution error:", error);
    return null;
  }
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

    // Resolve via Loxone Cloud DNS
    console.log(`Resolving Cloud DNS for serial: ${config.serial_number}`);
    const resolved = await resolveLoxoneCloudDNS(config.serial_number);
    
    if (!resolved) {
      throw new Error("Cloud DNS Auflösung fehlgeschlagen. Miniserver nicht erreichbar oder nicht für Remote-Zugriff konfiguriert.");
    }
    
    // Use HTTPS for IPv6 connections via Cloud
    const protocol = resolved.useHttps ? "https" : "http";
    // For IPv6, wrap in brackets
    const host = resolved.ip.includes(":") ? `[${resolved.ip}]` : resolved.ip;
    const baseUrl = `${protocol}://${host}:${resolved.port}`;
    console.log(`Resolved to: ${baseUrl}`);

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
        throw new Error(`Verbindung fehlgeschlagen: ${response.status} - Prüfen Sie Benutzername und Passwort`);
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
      });

      if (!response.ok) {
        console.error(`Failed to fetch structure: ${response.status} ${response.statusText}`);
        
        if (response.status === 401) {
          throw new Error("Authentifizierung fehlgeschlagen. Bitte Benutzername und Passwort prüfen.");
        }
        
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
          value: "-",
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
