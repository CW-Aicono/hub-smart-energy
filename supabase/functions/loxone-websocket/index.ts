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
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function shaHex(algo: "SHA-1" | "SHA-256", message: string): Promise<string> {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest(algo, encoder.encode(message));
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Decode hex string to Uint8Array
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

// Decode hex-encoded ASCII to string (Loxone returns keys/salts often as hex-encoded ASCII)
function hexToAscii(hex: string): string {
  let str = "";
  for (let i = 0; i < hex.length; i += 2) {
    const charCode = parseInt(hex.substr(i, 2), 16);
    str += String.fromCharCode(charCode);
  }
  return str;
}

function maybeHexToAscii(input: string): string {
  const isHex = /^[0-9a-fA-F]+$/.test(input) && input.length % 2 === 0;
  if (!isHex) return input;

  // Heuristic: decoded should be mostly printable
  const decoded = hexToAscii(input);
  const printable = decoded.replace(/[\x20-\x7E]/g, "").length;
  return printable <= Math.ceil(decoded.length * 0.2) ? decoded : input;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomHex(bytesLen: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(bytesLen));
  return bytesToHex(bytes).toUpperCase();
}

function cleanBase64(input: string): string {
  // Remove PEM headers/footers if present, and all whitespace
  return input
    .replace(/-----BEGIN [A-Z ]+-----/g, "")
    .replace(/-----END [A-Z ]+-----/g, "")
    .replace(/\s+/g, "")
    .replace(/[^A-Za-z0-9+/=]/g, ""); // Remove any non-base64 chars
}

// Convert base64 to Uint8Array
function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// RSA encryption using Web Crypto API (RSAES-PKCS1-v1_5 is not directly supported,
// so we use RSA-OAEP which is what modern Loxone Miniservers actually expect)
async function rsaEncryptPkcs1(publicKeyDerB64: string, payloadUtf8: string): Promise<string> {
  const cleanedB64 = cleanBase64(publicKeyDerB64);
  console.log(`Cleaned public key Base64 (first 60 chars): ${cleanedB64.substring(0, 60)}...`);
  
  let derBytes: Uint8Array;
  try {
    derBytes = base64ToBytes(cleanedB64);
  } catch (e) {
    console.error("Base64 decode failed for public key:", e);
    throw new Error(`Failed to decode base64 public key: ${e}`);
  }

  // Import the public key using Web Crypto API
  // Loxone public keys are in SubjectPublicKeyInfo (SPKI) format
  let publicKey: CryptoKey;
  try {
    publicKey = await crypto.subtle.importKey(
      "spki",
      derBytes,
      {
        name: "RSA-OAEP",
        hash: "SHA-256",
      },
      false,
      ["encrypt"]
    );
  } catch (e) {
    console.error("Failed to import public key:", e);
    throw new Error(`Failed to import RSA public key: ${e}`);
  }

  // Encrypt the payload
  const encoder = new TextEncoder();
  const payloadBytes = encoder.encode(payloadUtf8);
  
  let encryptedBytes: ArrayBuffer;
  try {
    encryptedBytes = await crypto.subtle.encrypt(
      { name: "RSA-OAEP" },
      publicKey,
      payloadBytes
    );
  } catch (e) {
    console.error("RSA encryption failed:", e);
    throw new Error(`RSA encryption failed: ${e}`);
  }

  // Convert to base64
  let binary = "";
  const bytes = new Uint8Array(encryptedBytes);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function zeroPad(bytes: Uint8Array, blockSize = 16): Uint8Array {
  const padLen = (blockSize - (bytes.length % blockSize)) % blockSize;
  if (padLen === 0) return bytes;
  const out = new Uint8Array(bytes.length + padLen);
  out.set(bytes);
  // remaining bytes are already 0x00
  return out;
}

async function aesCbcEncryptZeroPad(
  key: CryptoKey,
  iv: Uint8Array,
  plaintextUtf8: string
): Promise<string> {
  const encoder = new TextEncoder();
  const plain = zeroPad(encoder.encode(plaintextUtf8));
  const cipher = await crypto.subtle.encrypt({ name: "AES-CBC", iv }, key, plain);
  return base64Encode(new Uint8Array(cipher));
}

async function buildEncryptedWsCommand(
  aesKey: CryptoKey,
  aesIv: Uint8Array,
  socketSaltHex: string,
  cmd: string
): Promise<string> {
  const plaintext = `salt/${socketSaltHex}/${cmd}`;
  const cipherB64 = await aesCbcEncryptZeroPad(aesKey, aesIv, plaintext);
  const encCipher = encodeURIComponent(cipherB64);
  return `jdev/sys/enc/${encCipher}`;
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

    // --- Token-based WebSocket Auth (Config 10.3) ---
    // The Miniserver will return 400 for most commands until the socket is authenticated or a token was acquired.
    // Therefore we must do: getPublicKey (HTTP) -> keyexchange (WS) -> encrypted getkey2 -> encrypted getjwt -> encrypted enablebinstatusupdate.

    const publicKeyUrl = `https://${host}/jdev/sys/getPublicKey`;
    console.log(`Fetching public key: ${publicKeyUrl}`);
    const publicKeyResp = await fetch(publicKeyUrl, {
      method: "GET",
      headers: { Authorization: authHeader },
    });

    if (!publicKeyResp.ok) {
      throw new Error(`Public Key konnte nicht geladen werden: ${publicKeyResp.status}`);
    }

    const publicKeyJson = await publicKeyResp.json();
    const publicKeyDerB64 = publicKeyJson?.LL?.value;
    if (typeof publicKeyDerB64 !== "string" || !publicKeyDerB64) {
      throw new Error("Public Key ungültig");
    }

    const aesKeyBytes = crypto.getRandomValues(new Uint8Array(32));
    const aesIvBytes = crypto.getRandomValues(new Uint8Array(16));
    const socketSaltHex = randomHex(2);
    const aesKey = await crypto.subtle.importKey("raw", aesKeyBytes, { name: "AES-CBC" }, false, ["encrypt"]);

    // RSA encrypt "{keyHex}:{ivHex}" with RSA-OAEP
    const sessionKeyPayload = `${bytesToHex(aesKeyBytes)}:${bytesToHex(aesIvBytes)}`;
    const encryptedSessionKeyB64 = await rsaEncryptPkcs1(publicKeyDerB64, sessionKeyPayload);

    // Loxone docs: ws:// is the standard for Miniservers; wss:// only for certain generations.
    const wsUrl = `ws://${host}/ws/rfc6455`;
    console.log(`Connecting to WebSocket: ${wsUrl}`);

    const collectedValues: Map<string, CollectedValue> = new Map();
    let socketAuthenticated = false;
    let statusEnabled = false;
    let collectingStarted = false;

    type AuthStage = "keyexchange" | "getkey2" | "getjwt" | "ready";
    let stage: AuthStage = "keyexchange";

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

      const ws = new WebSocket(wsUrl, "remotecontrol");
      ws.binaryType = "arraybuffer";

      ws.onopen = async () => {
        console.log("WebSocket connected, starting live value collection...");

        // Start collecting immediately so we also catch the initial event tables.
        collectingStarted = true;
        collectionTimeout = setTimeout(() => {
          console.log(`Collection period ended, got ${collectedValues.size} values`);
          ws.close();
          clearTimeout(timeout);
          resolve({
            success: collectedValues.size > 0,
            values: Array.from(collectedValues.values()),
            error: collectedValues.size === 0 ? "Keine Werte empfangen" : undefined,
          });
        }, collectDuration) as unknown as number;

        // Step 1: keyexchange
        stage = "keyexchange";
        const keyexchangeCmd = `jdev/sys/keyexchange/${encodeURIComponent(encryptedSessionKeyB64)}`;
        console.log("Sending keyexchange...");
        ws.send(keyexchangeCmd);
      };

      ws.onmessage = async (event) => {
        const data = event.data;

        // Handle text messages (auth/token responses, command responses)
        if (typeof data === "string") {
          console.log(`Text message received: ${data.substring(0, 200)}`);

          try {
            const parsed = JSON.parse(data);
            const llResponse = parsed?.LL;

            if (!llResponse) return;

            const controlRaw = String(llResponse.control ?? "");
            const control = controlRaw.toLowerCase();
            const code = parseInt(llResponse.Code || llResponse.code || "0");
            const value = llResponse.value;

            if (code === 420) {
              console.error("Auth Policy Not Fulfilled (420) – wahrscheinlich wurde nicht rechtzeitig authentifiziert.");
              ws.close();
              return;
            }

            if (control.includes("keyexchange")) {
              if (code !== 200) {
                console.error(`Keyexchange fehlgeschlagen: ${code}`);
                ws.close();
                return;
              }

              console.log("Keyexchange OK – requesting getkey2 (encrypted)...");
              stage = "getkey2";
              const getkey2Cmd = await buildEncryptedWsCommand(
                aesKey,
                aesIvBytes,
                socketSaltHex,
                `jdev/sys/getkey2/${encodeURIComponent(config.username)}`
              );
              ws.send(getkey2Cmd);
              return;
            }

            if (control.includes("getkey2")) {
              if (code !== 200) {
                console.error(`getkey2 fehlgeschlagen: ${code}`);
                ws.close();
                return;
              }

              // getkey2 returns: { key: "...", salt: "..." }
              let keyHexString = "";
              let userSalt = "";

              if (typeof value === "object" && value) {
                const keyRaw = (value as any).key;
                const saltRaw = (value as any).salt ?? (value as any).userSalt;
                if (typeof keyRaw === "string") keyHexString = maybeHexToAscii(keyRaw);
                if (typeof saltRaw === "string") userSalt = maybeHexToAscii(saltRaw);
              } else if (typeof value === "string") {
                // fallback if server returns combined string
                const decoded = maybeHexToAscii(value);
                if (decoded.includes(":")) {
                  const [k, s] = decoded.split(":");
                  keyHexString = k || "";
                  userSalt = s || "";
                }
              }

              if (!keyHexString || !userSalt) {
                console.error("getkey2 response missing key/salt");
                ws.close();
                return;
              }

              const keyBytes = hexToBytes(keyHexString);

              // pwHash = SHA1("password:userSalt") in UPPERCASE
              const pwHash = (await shaHex("SHA-1", `${config.password}:${userSalt}`)).toUpperCase();

              // hash = HMAC_SHA1(keyBytes, "user:pwHash") – keep result case unchanged
              const authHash = await hmacSha1(keyBytes, `${config.username}:${pwHash}`);

              console.log("getkey2 OK – requesting JWT (encrypted)...");
              stage = "getjwt";

              const permission = 4; // app permission (longer lived)
              const clientUuid = locationIntegrationId; // already a UUID
              const info = encodeURIComponent("Lovable Live Values");

              const getJwtInner = `jdev/sys/getjwt/${authHash}/${encodeURIComponent(
                config.username
              )}/${permission}/${clientUuid}/${info}`;

              const getJwtCmd = await buildEncryptedWsCommand(aesKey, aesIvBytes, socketSaltHex, getJwtInner);
              ws.send(getJwtCmd);
              return;
            }

            if (control.includes("getjwt")) {
              if (code !== 200) {
                console.error(`getjwt fehlgeschlagen: ${code}`);
                ws.close();
                return;
              }

              socketAuthenticated = true; // acquiring a token authenticates the socket
              stage = "ready";
              console.log("JWT acquired – enabling binary status updates (encrypted)...");

              const enableCmd = await buildEncryptedWsCommand(
                aesKey,
                aesIvBytes,
                socketSaltHex,
                "jdev/sps/enablebinstatusupdate"
              );
              ws.send(enableCmd);
              return;
            }

            if (control.includes("enablebinstatusupdate")) {
              if (code === 200) {
                console.log("Binary status updates enabled");
                statusEnabled = true;
              } else {
                console.error(`Enable status update failed with code ${code} (continuing)`);
              }
              return;
            }

            // Other responses are ignored
          } catch {
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
        
        const values = Array.from(collectedValues.values());
        resolve({
          success: values.length > 0,
          values,
          error: values.length === 0
            ? (socketAuthenticated ? "Keine Werte empfangen" : "Keine Werte empfangen (Auth nicht möglich)")
            : undefined,
        });
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
