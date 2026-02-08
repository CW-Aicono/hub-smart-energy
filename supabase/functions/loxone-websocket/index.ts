import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as hexEncode } from "https://deno.land/std@0.168.0/encoding/hex.ts";

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

interface StateUuidMap {
  stateUuid: string;
  controlUuid: string;
  controlName: string;
  controlType: string;
  stateName: string;
  room: string;
  category: string;
}

interface CollectedValue {
  uuid: string;
  value: number;
  controlUuid: string;
  controlName: string;
  controlType: string;
  stateName: string;
  room: string;
  category: string;
}

// Resolve Loxone Cloud DNS by following the redirect
async function resolveLoxoneCloudURL(serialNumber: string): Promise<string | null> {
  try {
    const dnsUrl = `http://dns.loxonecloud.com/${serialNumber}`;
    console.log(`Resolving via Loxone Cloud redirect: ${dnsUrl}`);
    
    const response = await fetch(dnsUrl, {
      method: "HEAD",
      redirect: "follow",
    });
    
    const finalUrl = response.url;
    console.log(`Resolved to final URL: ${finalUrl}`);
    
    const urlObj = new URL(finalUrl);
    return urlObj.host;
  } catch (error) {
    console.error("Cloud DNS resolution error:", error);
    return null;
  }
}

// Convert binary UUID (16 bytes, Little Endian) to string format
function binaryUuidToString(bytes: Uint8Array): string {
  if (bytes.length !== 16) {
    console.error("Invalid UUID length:", bytes.length);
    return "";
  }
  
  // Loxone UUIDs are in Little Endian format
  // Format: XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
  // Bytes:  [0-3]    [4-5] [6-7] [8-9] [10-15]
  
  const hex = (b: number) => b.toString(16).padStart(2, "0");
  
  // First 4 bytes as Little Endian (reversed)
  const part1 = hex(bytes[3]) + hex(bytes[2]) + hex(bytes[1]) + hex(bytes[0]);
  // Bytes 4-5 as Little Endian
  const part2 = hex(bytes[5]) + hex(bytes[4]);
  // Bytes 6-7 as Little Endian
  const part3 = hex(bytes[7]) + hex(bytes[6]);
  // Bytes 8-9 as Big Endian (not reversed in Loxone)
  const part4 = hex(bytes[8]) + hex(bytes[9]);
  // Bytes 10-15 as Big Endian
  const part5 = hex(bytes[10]) + hex(bytes[11]) + hex(bytes[12]) + hex(bytes[13]) + hex(bytes[14]) + hex(bytes[15]);
  
  return `${part1}-${part2}-${part3}-${part4}-${part5}`.toLowerCase();
}

// Parse the Loxone message header (8 bytes)
interface MessageHeader {
  identifier: number;
  payloadLength: number;
  isValueStates: boolean;
  isTextStates: boolean;
  isKeepAlive: boolean;
}

function parseMessageHeader(data: ArrayBuffer): MessageHeader | null {
  if (data.byteLength < 8) return null;
  
  const view = new DataView(data);
  const byte0 = view.getUint8(0);
  
  if (byte0 !== 0x03) {
    console.log(`Unexpected header byte: 0x${byte0.toString(16)}`);
    return null;
  }
  
  const identifier = view.getUint8(1);
  const payloadLength = view.getUint32(4, true); // Little Endian
  
  return {
    identifier,
    payloadLength,
    isValueStates: identifier === 2,
    isTextStates: identifier === 3,
    isKeepAlive: identifier === 6,
  };
}

// Parse value events from binary payload (24 bytes per value: 16-byte UUID + 8-byte double)
function parseValueEvents(data: ArrayBuffer, startOffset: number, length: number): Array<{ uuid: string; value: number }> {
  const events: Array<{ uuid: string; value: number }> = [];
  const eventSize = 24; // 16 bytes UUID + 8 bytes double
  
  const view = new DataView(data, startOffset);
  const numEvents = Math.floor(length / eventSize);
  
  for (let i = 0; i < numEvents; i++) {
    const offset = i * eventSize;
    
    // Extract 16-byte UUID
    const uuidBytes = new Uint8Array(data, startOffset + offset, 16);
    const uuid = binaryUuidToString(uuidBytes);
    
    // Extract 8-byte double (Little Endian)
    const value = view.getFloat64(offset + 16, true);
    
    if (uuid) {
      events.push({ uuid, value });
    }
  }
  
  return events;
}

// Build a map from state UUIDs to control info using LoxAPP3.json structure
function buildStateUuidMap(structure: LoxoneStructure): Map<string, StateUuidMap> {
  const map = new Map<string, StateUuidMap>();
  const rooms = structure.rooms || {};
  const categories = structure.cats || {};
  
  for (const [controlUuid, control] of Object.entries(structure.controls || {})) {
    if (!control.states) continue;
    
    const roomName = control.room ? rooms[control.room]?.name || "Unbekannt" : "Unbekannt";
    const catName = control.cat ? categories[control.cat]?.name || "Sonstige" : "Sonstige";
    
    for (const [stateName, stateUuid] of Object.entries(control.states)) {
      map.set(stateUuid.toLowerCase(), {
        stateUuid,
        controlUuid,
        controlName: control.name,
        controlType: control.type,
        stateName,
        room: roomName,
        category: catName,
      });
    }
  }
  
  console.log(`Built state UUID map with ${map.size} entries`);
  return map;
}

// HMAC-SHA1 for Legacy Authentication
async function hmacSha1(key: Uint8Array, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
  const hashArray = new Uint8Array(signature);
  
  // Convert to hex string
  return Array.from(hashArray).map(b => b.toString(16).padStart(2, "0")).join("");
}

// Decode hex string to Uint8Array
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

// Decode hex-encoded ASCII to string (Loxone returns keys as hex-encoded ASCII)
function hexToAscii(hex: string): string {
  let str = "";
  for (let i = 0; i < hex.length; i += 2) {
    const charCode = parseInt(hex.substr(i, 2), 16);
    str += String.fromCharCode(charCode);
  }
  return str;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const requestBody = await req.json();
    const { locationIntegrationId, collectDuration = 3000 } = requestBody;

    if (!locationIntegrationId) {
      throw new Error("Location Integration ID ist erforderlich");
    }

    console.log(`WebSocket request for locationIntegrationId=${locationIntegrationId}, collectDuration=${collectDuration}ms`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch location integration config
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
    
    if (!config?.serial_number || !config.username || !config.password) {
      throw new Error("Loxone-Konfiguration unvollständig (Seriennummer, Benutzer, Passwort erforderlich)");
    }

    console.log(`Config: serial=${config.serial_number}, user=${config.username}`);

    // Resolve Miniserver host via Cloud DNS
    const host = await resolveLoxoneCloudURL(config.serial_number);
    
    if (!host) {
      throw new Error("Cloud DNS Auflösung fehlgeschlagen. Miniserver nicht erreichbar.");
    }

    console.log(`Resolved host: ${host}`);

    // First fetch the LoxAPP3.json structure via HTTPS to build UUID mapping
    const structureUrl = `https://${host}/data/LoxAPP3.json`;
    const credentials = btoa(`${config.username}:${config.password}`);
    const authHeader = `Basic ${credentials}`;

    console.log(`Fetching structure from: ${structureUrl}`);
    const structureResponse = await fetch(structureUrl, {
      method: "GET",
      headers: { Authorization: authHeader },
    });

    if (!structureResponse.ok) {
      if (structureResponse.status === 401) {
        throw new Error("Authentifizierung fehlgeschlagen");
      }
      throw new Error(`Struktur konnte nicht geladen werden: ${structureResponse.status}`);
    }

    const structure: LoxoneStructure = await structureResponse.json();
    const stateUuidMap = buildStateUuidMap(structure);

    // Connect via WebSocket using wss (secure) with Basic Auth
    // Loxone supports Basic Auth in WebSocket URL or via authenticate command
    const wsUrl = `wss://${host}/ws/rfc6455`;
    console.log(`Connecting to WebSocket: ${wsUrl}`);

    const collectedValues: Map<string, CollectedValue> = new Map();
    let authCompleted = false;
    let statusEnabled = false;
    let collectingStarted = false;

    // Create a promise that resolves when we've collected enough data
    const result = await new Promise<{ success: boolean; values: CollectedValue[]; error?: string }>((resolve) => {
      const timeout = setTimeout(() => {
        console.log("WebSocket timeout reached");
        resolve({
          success: collectedValues.size > 0,
          values: Array.from(collectedValues.values()),
          error: collectedValues.size === 0 ? "Timeout - keine Werte empfangen" : undefined,
        });
      }, 15000); // Overall timeout

      let collectionTimeout: number | undefined;

      const ws = new WebSocket(wsUrl);
      ws.binaryType = "arraybuffer";

      ws.onopen = async () => {
        console.log("WebSocket connected, starting legacy authentication...");
        
        // Legacy authentication: first request the key
        ws.send("jdev/sys/getkey");
      };

      ws.onmessage = async (event) => {
        const data = event.data;

        // Handle text messages (auth responses, commands)
        if (typeof data === "string") {
          console.log(`Text message received: ${data.substring(0, 200)}`);
          
          try {
            const parsed = JSON.parse(data);
            const llResponse = parsed?.LL;
            
            if (llResponse) {
              const control = llResponse.control?.toLowerCase() || "";
              const code = parseInt(llResponse.Code || llResponse.code || "0");
              const value = llResponse.value;

              // Handle getkey response
              if (control.includes("getkey") && value) {
                console.log(`Received key for authentication, code=${code}, raw value length=${value.length}`);
                
                // The key is returned as hex-encoded ASCII
                // e.g., "30433744..." decodes to ASCII "0C7D..." which is the actual hex key
                // We need to decode hex→ASCII to get the key hex string, then hex→bytes
                const keyHexString = hexToAscii(value);
                console.log(`Decoded key hex string: ${keyHexString.substring(0, 20)}... (length=${keyHexString.length})`);
                
                const keyBytes = hexToBytes(keyHexString);
                console.log(`Key bytes length: ${keyBytes.length}`);
                
                // Compute HMAC-SHA1 hash of "user:password"
                const authString = `${config.username}:${config.password}`;
                const hash = await hmacSha1(keyBytes, authString);
                
                console.log(`Sending authentication command with hash: ${hash.substring(0, 20)}...`);
                ws.send(`authenticate/${hash}`);
              }
              
              // Handle authenticate response
              else if (control.includes("authenticate")) {
                if (code === 200) {
                  console.log("Authentication successful!");
                  authCompleted = true;
                  
                  // Enable binary status updates
                  console.log("Enabling binary status updates...");
                  ws.send("jdev/sps/enablebinstatusupdate");
                } else {
                  console.error(`Authentication failed with code ${code}`);
                  ws.close();
                  clearTimeout(timeout);
                  resolve({ success: false, values: [], error: `Authentifizierung fehlgeschlagen (Code ${code})` });
                }
              }
              
              // Handle enablebinstatusupdate response
              else if (control.includes("enablebinstatusupdate")) {
                if (code === 200) {
                  console.log("Binary status updates enabled, collecting values...");
                  statusEnabled = true;
                  collectingStarted = true;
                  
                  // Start collection timeout
                  collectionTimeout = setTimeout(() => {
                    console.log(`Collection period ended, got ${collectedValues.size} values`);
                    ws.close();
                    clearTimeout(timeout);
                    resolve({
                      success: collectedValues.size > 0,
                      values: Array.from(collectedValues.values()),
                    });
                  }, collectDuration) as unknown as number;
                } else {
                  console.error(`Enable status update failed with code ${code}`);
                }
              }
            }
          } catch {
            // Not JSON, might be a plain text response
            console.log("Non-JSON text message");
          }
        }
        
        // Handle binary messages (value events)
        else if (data instanceof ArrayBuffer) {
          if (!collectingStarted) {
            console.log("Received binary data before collection started, ignoring");
            return;
          }

          const header = parseMessageHeader(data);
          
          if (!header) {
            console.log("Could not parse message header");
            return;
          }

          if (header.isKeepAlive) {
            console.log("Keep-alive received");
            return;
          }

          if (header.isValueStates) {
            const events = parseValueEvents(data, 8, header.payloadLength);
            console.log(`Parsed ${events.length} value events`);
            
            for (const event of events) {
              const mapping = stateUuidMap.get(event.uuid);
              
              if (mapping) {
                collectedValues.set(event.uuid, {
                  uuid: event.uuid,
                  value: event.value,
                  controlUuid: mapping.controlUuid,
                  controlName: mapping.controlName,
                  controlType: mapping.controlType,
                  stateName: mapping.stateName,
                  room: mapping.room,
                  category: mapping.category,
                });
              } else {
                // Unknown UUID - still collect it
                collectedValues.set(event.uuid, {
                  uuid: event.uuid,
                  value: event.value,
                  controlUuid: "",
                  controlName: `Unknown (${event.uuid})`,
                  controlType: "",
                  stateName: "",
                  room: "",
                  category: "",
                });
              }
            }
          } else if (header.isTextStates) {
            console.log(`Text states received (type 3), length=${header.payloadLength}`);
            // Text states are not processed in this version
          } else {
            console.log(`Other message type: identifier=${header.identifier}, length=${header.payloadLength}`);
          }
        }
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
      };

      ws.onclose = (event) => {
        console.log(`WebSocket closed: code=${event.code}, reason=${event.reason}`);
        
        if (collectionTimeout) {
          clearTimeout(collectionTimeout);
        }
        
        clearTimeout(timeout);
        
        if (!authCompleted) {
          resolve({ success: false, values: [], error: "Verbindung geschlossen vor Authentifizierung" });
        } else {
          resolve({
            success: collectedValues.size > 0,
            values: Array.from(collectedValues.values()),
          });
        }
      };
    });

    console.log(`WebSocket session completed: ${result.values.length} values collected`);

    // Group values by control for easier consumption
    const controlValues: Record<string, { 
      name: string; 
      type: string;
      room: string;
      category: string;
      states: Record<string, number>;
    }> = {};

    for (const value of result.values) {
      if (!value.controlUuid) continue;
      
      if (!controlValues[value.controlUuid]) {
        controlValues[value.controlUuid] = {
          name: value.controlName,
          type: value.controlType,
          room: value.room,
          category: value.category,
          states: {},
        };
      }
      
      controlValues[value.controlUuid].states[value.stateName] = value.value;
    }

    // Update sync status
    await supabase
      .from("location_integrations")
      .update({
        sync_status: result.success ? "success" : "error",
        last_sync_at: new Date().toISOString(),
      })
      .eq("id", locationIntegrationId);

    return new Response(
      JSON.stringify({
        success: result.success,
        error: result.error,
        rawValueCount: result.values.length,
        controlCount: Object.keys(controlValues).length,
        controls: controlValues,
        rawValues: result.values,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Loxone WebSocket error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unbekannter Fehler",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
