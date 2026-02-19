/**
 * Gateway Worker – Industrietauglicher Echtzeit-Streaming-Dienst
 * ==============================================================
 * Läuft als dauerhaft laufender Prozess (z.B. in einem Docker-Container).
 *
 * Loxone Miniserver: WebSocket-Streaming (event-push, < 1s Latenz)
 * Alle anderen Gateways: HTTP-REST-Polling (Intervall = POLL_INTERVAL_MS)
 *
 * Unterstützte Gateways:
 *   - Loxone Miniserver    → WebSocket ws://{ip}/ws/rfc6455 (JWT-Token Auth, RSA+AES256)
 *   - Shelly Cloud         → HTTP REST
 *   - ABB free@home        → HTTP REST
 *   - Siemens Building X   → HTTP REST + OAuth
 *   - Tuya Cloud           → delegiert an Edge Function
 *   - Homematic IP         → HTTP REST
 *   - Omada Cloud          → HTTP REST
 *
 * Umgebungsvariablen:
 *   SUPABASE_URL           – z.B. https://xxxxx.supabase.co
 *   GATEWAY_API_KEY        – Bearer Token für gateway-ingest
 *   POLL_INTERVAL_MS       – Polling-Intervall für nicht-WS Gateways (Standard: 30000)
 *   FLUSH_INTERVAL_MS      – Wie oft der WS-Buffer in die DB geschrieben wird (Standard: 1000)
 *   LOG_LEVEL              – "debug" | "info" | "warn" | "error" (Standard: "info")
 *   GATEWAY_INGEST_URL     – Override für Ingest-URL (optional)
 *
 * Deployment:
 *   docker build -t gateway-worker .
 *   docker run -d --restart=always \
 *     -e SUPABASE_URL=https://xxxxx.supabase.co \
 *     -e GATEWAY_API_KEY=sk_live_... \
 *     -e FLUSH_INTERVAL_MS=1000 \
 *     gateway-worker
 */

import WebSocket from "ws";
import * as crypto from "crypto";

// ─── Configuration ──────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL!;
const GATEWAY_API_KEY = process.env.GATEWAY_API_KEY!;
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || "30000", 10);
const FLUSH_INTERVAL_MS = parseInt(process.env.FLUSH_INTERVAL_MS || "1000", 10);
const LOG_LEVEL = (process.env.LOG_LEVEL || "info") as "debug" | "info" | "warn" | "error";

const GATEWAY_INGEST_URL = process.env.GATEWAY_INGEST_URL ||
  `${SUPABASE_URL}/functions/v1/gateway-ingest`;

if (!SUPABASE_URL || !GATEWAY_API_KEY) {
  console.error("[FATAL] SUPABASE_URL and GATEWAY_API_KEY must be set");
  process.exit(1);
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface MeterWithSensor {
  id: string;
  name: string;
  energy_type: string;
  sensor_uuid: string | null;
  location_integration_id: string | null;
  tenant_id: string;
  location_integration: {
    id: string;
    config: Record<string, any>;
    integration: {
      type: string;
    };
  } | null;
}

interface PowerReading {
  meter_id: string;
  tenant_id: string;
  power_value: number;
  energy_type: string;
  recorded_at: string;
}

// ─── Logging ─────────────────────────────────────────────────────────────────

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LOG_LEVELS[LOG_LEVEL] ?? 1;

function log(level: "debug" | "info" | "warn" | "error", message: string, ...args: any[]) {
  if (LOG_LEVELS[level] >= currentLevel) {
    const ts = new Date().toISOString();
    const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    fn(`[${ts}] [${level.toUpperCase()}] ${message}`, ...args);
  }
}

// ─── Spike Detection ─────────────────────────────────────────────────────────

const SPIKE_THRESHOLDS: Record<string, number> = {
  strom: 10000,
  gas: 5000,
  wasser: 1000,
  wärme: 5000,
  kälte: 2000,
  default: 50000,
};

function isSpike(powerValue: number, energyType: string): boolean {
  if (!isFinite(powerValue) || isNaN(powerValue)) return true;
  const threshold = SPIKE_THRESHOLDS[energyType] ?? SPIKE_THRESHOLDS.default;
  return Math.abs(powerValue) > threshold;
}

// ─── HTTP Ingest Client ───────────────────────────────────────────────────────

async function sendReadings(readings: PowerReading[]): Promise<void> {
  if (readings.length === 0) return;

  const response = await fetch(GATEWAY_INGEST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GATEWAY_API_KEY}`,
    },
    body: JSON.stringify({ readings }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  const result = await response.json() as any;
  log("debug", `✓ Ingest: ${result.inserted} inserted, ${result.skipped ?? 0} skipped`);
}

// ─── Meter List ───────────────────────────────────────────────────────────────

async function fetchMeters(): Promise<MeterWithSensor[]> {
  const listUrl = GATEWAY_INGEST_URL + "?action=list-meters";
  const response = await fetch(listUrl, {
    headers: { "Authorization": `Bearer ${GATEWAY_API_KEY}` },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const text = await response.text();
    log("error", `Failed to fetch meters: HTTP ${response.status}: ${text}`);
    return [];
  }

  const data = await response.json() as any;
  if (!data.success) {
    log("error", "Failed to fetch meters:", data.error);
    return [];
  }

  return (data.meters || []) as unknown as MeterWithSensor[];
}

// ─── Loxone DNS Cache ────────────────────────────────────────────────────────

const loxoneBaseUrlCache = new Map<string, string>();

async function resolveLoxoneBaseUrl(serialNumber: string): Promise<string | null> {
  if (loxoneBaseUrlCache.has(serialNumber)) {
    return loxoneBaseUrlCache.get(serialNumber)!;
  }
  try {
    const dnsResponse = await fetch(
      `http://dns.loxonecloud.com/${serialNumber}`,
      { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(5000) }
    );
    const urlObj = new URL(dnsResponse.url);
    const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
    loxoneBaseUrlCache.set(serialNumber, baseUrl);
    log("info", `[Loxone] DNS resolved: ${serialNumber} → ${baseUrl}`);
    return baseUrl;
  } catch (err) {
    log("warn", `[Loxone] DNS lookup failed for ${serialNumber}: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

// ─── Loxone WebSocket Manager ─────────────────────────────────────────────────
//
// Pro Miniserver (Seriennummer) wird EINE persistente WebSocket-Verbindung
// gehalten. Der Miniserver pusht alle Wertänderungen sofort (< 1s Latenz).
// Der Worker pflegt einen In-Memory-State und flusht ihn sekündlich in die DB.

interface LoxoneWsState {
  serialNumber: string;
  username: string;
  password: string;
  baseUrl: string;
  ws: WebSocket | null;
  // sensor_uuid → { meter_id, tenant_id, energy_type, latest_value }
  uuidMap: Map<string, { meter_id: string; tenant_id: string; energy_type: string; latest_value: number | null }>;
  reconnectDelay: number; // Exponential backoff in ms
  reconnecting: boolean;
  authenticated: boolean;
  statusUpdatesEnabled: boolean;
  keepaliveTimer: ReturnType<typeof setInterval> | null;
}

// Global state map: serialNumber → state
const loxoneConnections = new Map<string, LoxoneWsState>();

// ─── Loxone JWT Token Store ──────────────────────────────────────────────────
// Tokens haben ~4 Wochen Lebensdauer (Permission-Level 4 = App)
// Pro Miniserver wird das Token persistent im Worker-Speicher gehalten.

interface LoxoneToken {
  token: string;
  validUntil: number; // Unix-Timestamp (Sekunden)
}

const loxoneTokenStore = new Map<string, LoxoneToken>();

// ─── AES-256-CBC Verschlüsselung (Loxone-Protokoll) ─────────────────────────
// Zero-Byte-Padding auf 16-Byte-Blockgröße, Base64 ohne Zeilenumbrüche

function loxoneAesEncrypt(plaintext: string, aesKey: Buffer, aesIv: Buffer): string {
  // payload: "salt/{randomSalt}/{command}"
  const salt = crypto.randomBytes(8).toString("hex");
  const cmd = `salt/${salt}/${plaintext}`;
  // Zero-Byte-Padding auf 16-Byte-Blockgröße
  const blockSize = 16;
  const padLen = blockSize - (Buffer.byteLength(cmd, "utf8") % blockSize);
  const padded = Buffer.concat([Buffer.from(cmd, "utf8"), Buffer.alloc(padLen, 0)]);

  const cipher = crypto.createCipheriv("aes-256-cbc", aesKey, aesIv);
  cipher.setAutoPadding(false);
  const encrypted = Buffer.concat([cipher.update(padded), cipher.final()]);
  return encrypted.toString("base64");
}

function loxoneAesDecrypt(ciphertext: string, aesKey: Buffer, aesIv: Buffer): string {
  const buf = Buffer.from(ciphertext, "base64");
  const decipher = crypto.createDecipheriv("aes-256-cbc", aesKey, aesIv);
  decipher.setAutoPadding(false);
  const decrypted = Buffer.concat([decipher.update(buf), decipher.final()]);
  // Nullbytes am Ende entfernen
  return decrypted.toString("utf8").replace(/\0+$/, "");
}

// ─── Loxone WebSocket Auth (JWT-Token-Protokoll, ab Config 9.3) ──────────────
//
// Protokoll (4 Schritte):
//   1. RSA Key Exchange: Öffentlichen Key holen, AES-Session-Key einrichten
//   2. getkey2: Salt + Challenge für Passwort-Hashing holen
//   3. getjwt: JWT-Token (verschlüsselt) anfordern
//   4. authwithtoken: Token verifizieren (verschlüsselt)

async function loxoneWsAuth(
  ws: WebSocket,
  baseUrl: string,
  username: string,
  password: string,
  serialNumber: string
): Promise<boolean> {

  // ── Schritt 1: RSA Public Key holen + AES-Session-Key aufbauen ──────────────
  let publicKeyObj: crypto.KeyObject;
  try {
    const pkRes = await fetch(`${baseUrl}/jdev/sys/getPublicKey`, {
      signal: AbortSignal.timeout(8000),
    });
    const pkData = await pkRes.json() as any;
    const rawKey = (pkData?.LL?.value as string | undefined)?.trim() ?? "";
    if (!rawKey) {
      log("warn", `[Loxone] No public key received from ${baseUrl}`);
      return false;
    }

    // Immer sichtbar (INFO), damit wir das Schlüsselformat diagnostizieren können
    log("info", `[Loxone] rawKey prefix: "${rawKey.substring(0, 60)}"`);

    if (rawKey.startsWith("-----BEGIN CERTIFICATE-----")) {
      // Loxone schickt "BEGIN CERTIFICATE" als Header, aber der Inhalt ist ein SPKI-Public-Key!
      // Base64-Inhalt extrahieren und mit korrektem Header neu verpacken.
      const b64 = rawKey
        .replace("-----BEGIN CERTIFICATE-----", "")
        .replace("-----END CERTIFICATE-----", "")
        .replace(/\s+/g, "");
      const b64Lines = (b64.match(/.{1,64}/g) ?? [b64]).join("\n");

      // Versuch 1: Als SPKI Public Key (der tatsächliche Inhalt laut ASN.1-Analyse)
      let keyParsed = false;
      try {
        const pemSpki = `-----BEGIN PUBLIC KEY-----\n${b64Lines}\n-----END PUBLIC KEY-----`;
        publicKeyObj = crypto.createPublicKey(pemSpki);
        keyParsed = true;
        log("info", `[Loxone] Key format: SPKI (mislabeled as CERTIFICATE)`);
      } catch (_e) { /* weiter */ }

      // Versuch 2: Echter X.509-Zertifikat-Inhalt
      if (!keyParsed) {
        try {
          const pemCert = `-----BEGIN CERTIFICATE-----\n${b64Lines}\n-----END CERTIFICATE-----`;
          const cert = new crypto.X509Certificate(pemCert);
          publicKeyObj = cert.publicKey;
          keyParsed = true;
          log("info", `[Loxone] Key format: X.509 Certificate (reformatted)`);
        } catch (_e) { /* weiter */ }
      }

      // Versuch 3: PKCS#1 RSA Public Key
      if (!keyParsed) {
        const pemPkcs1 = `-----BEGIN RSA PUBLIC KEY-----\n${b64Lines}\n-----END RSA PUBLIC KEY-----`;
        publicKeyObj = crypto.createPublicKey({ key: pemPkcs1, format: "pem" });
        log("info", `[Loxone] Key format: PKCS#1 (mislabeled as CERTIFICATE)`);
      }

      log("info", `[Loxone] Key format: X.509 Certificate`);
    } else if (rawKey.startsWith("-----")) {
      // Fertiges PEM (z.B. BEGIN PUBLIC KEY / BEGIN RSA PUBLIC KEY) → direkt laden
      publicKeyObj = crypto.createPublicKey(rawKey);
      log("info", `[Loxone] Key format: Full PEM`);
    } else {
      // Roher Base64-Block ohne Header → alle Formate ausprobieren
      // Versuch 1: SPKI / PKCS#8 (BEGIN PUBLIC KEY)
      let parsed = false;
      try {
        const pemSpki = `-----BEGIN PUBLIC KEY-----\n${rawKey}\n-----END PUBLIC KEY-----`;
        publicKeyObj = crypto.createPublicKey(pemSpki);
        parsed = true;
        log("info", `[Loxone] Key format: raw Base64 → SPKI/PKCS#8 OK`);
      } catch (_e1) { /* weiter */ }

      // Versuch 2: PKCS#1 (BEGIN RSA PUBLIC KEY)
      if (!parsed) {
        try {
          const pemPkcs1 = `-----BEGIN RSA PUBLIC KEY-----\n${rawKey}\n-----END RSA PUBLIC KEY-----`;
          publicKeyObj = crypto.createPublicKey({ key: pemPkcs1, format: "pem" });
          parsed = true;
          log("info", `[Loxone] Key format: raw Base64 → PKCS#1 OK`);
        } catch (_e2) { /* weiter */ }
      }

      // Versuch 3: rohe DER-Bytes (Base64 → Buffer, createPublicKey mit DER)
      if (!parsed) {
        try {
          const derBuf = Buffer.from(rawKey, "base64");
          publicKeyObj = crypto.createPublicKey({ key: derBuf, format: "der", type: "spki" });
          parsed = true;
          log("info", `[Loxone] Key format: raw Base64 → DER/SPKI OK`);
        } catch (_e3) { /* weiter */ }
      }

      // Versuch 4: DER PKCS#1
      if (!parsed) {
        try {
          const derBuf = Buffer.from(rawKey, "base64");
          publicKeyObj = crypto.createPublicKey({ key: derBuf, format: "der", type: "pkcs1" });
          parsed = true;
          log("info", `[Loxone] Key format: raw Base64 → DER/PKCS#1 OK`);
        } catch (_e4) { /* weiter */ }
      }

      if (!parsed) {
        throw new Error(`All key formats failed for ${baseUrl}. rawKey prefix: "${rawKey.substring(0, 60)}"`);
      }
    }
  } catch (err) {
    log("warn", `[Loxone] getPublicKey failed for ${baseUrl}: ${err instanceof Error ? err.message : err}`);
    return false;
  }

  // AES-256 Key + IV generieren (32 + 16 Byte)
  const aesKey = crypto.randomBytes(32);
  const aesIv  = crypto.randomBytes(16);

  // Session-Key RSA-OAEP verschlüsseln
  let encryptedSessionKey: string;
  try {
    const keyPayload = `${aesKey.toString("hex")}:${aesIv.toString("hex")}`;
    const encBuf = crypto.publicEncrypt(
      {
        key: publicKeyObj,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      },
      Buffer.from(keyPayload, "utf8")
    );
    encryptedSessionKey = encBuf.toString("base64");
  } catch (err) {
    log("warn", `[Loxone] RSA encrypt failed for ${baseUrl}: ${err instanceof Error ? err.message : err}`);
    return false;
  }

  // Key Exchange über WebSocket senden + Antwort abwarten
  const keyExchangeOk = await new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => resolve(false), 8000);
    const onMsg = (data: WebSocket.RawData) => {
      const msg = data.toString();
      let parsed: any;
      try { parsed = JSON.parse(msg); } catch (_e) { return; }
      const ll = parsed?.LL;
      if (!ll) return;
      if (typeof ll.control === "string" && ll.control.includes("keyexchange")) {
        clearTimeout(timeout);
        ws.removeListener("message", onMsg);
        const code = ll.Code ?? ll.code;
        resolve(code === "200" || code === 200);
      }
    };
    ws.on("message", onMsg);
    ws.send(`jdev/sys/keyexchange/${encryptedSessionKey}`);
  });

  if (!keyExchangeOk) {
    log("warn", `[Loxone] Key exchange failed for ${serialNumber}`);
    return false;
  }
  log("info", `[Loxone] Key exchange successful: ${serialNumber}`);

  // ── Schritt 2: Gespeichertes Token prüfen (Token-Persistenz) ──────────────
  const existing = loxoneTokenStore.get(serialNumber);
  const nowSec = Math.floor(Date.now() / 1000);

  if (existing && existing.validUntil > nowSec + 60) {
    // Vorhandenes Token ist noch gültig — direkt authwithtoken aufrufen
    log("debug", `[Loxone] Reusing cached token for ${serialNumber}`);
    return await loxoneAuthWithToken(ws, baseUrl, username, existing.token, aesKey, aesIv, serialNumber);
  }

  // ── Schritt 3: Neues Token anfordern ──────────────────────────────────────
  // getkey2: Salt + Challenge für Passwort-Hashing
  let key2Value: string;
  let saltValue: string;

  const key2Ok = await new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => resolve(false), 8000);
    const onMsg = (data: WebSocket.RawData) => {
      const msg = data.toString();
      let parsed: any;
      try { parsed = JSON.parse(msg); } catch (_e) { return; }
      const ll = parsed?.LL;
      if (!ll) return;
      if (typeof ll.control === "string" && ll.control.includes("getkey2")) {
        clearTimeout(timeout);
        ws.removeListener("message", onMsg);
        const val = ll.value as any;
        if (typeof val === "object" && val.key && val.salt) {
          key2Value = val.key as string;
          saltValue = val.salt as string;
          resolve(true);
        } else {
          resolve(false);
        }
      }
    };
    ws.on("message", onMsg);
    const getkey2Encrypted = loxoneAesEncrypt(`jdev/sys/getkey2/${username}`, aesKey, aesIv);
    ws.send(`jdev/sys/enc/${encodeURIComponent(getkey2Encrypted)}`);
  });

  if (!key2Ok) {
    log("warn", `[Loxone] getkey2 failed for ${serialNumber}`);
    return false;
  }

  // Passwort-Hash berechnen
  const pwHash = crypto.createHash("sha1")
    .update(`${password}:${saltValue!}`)
    .digest("hex")
    .toUpperCase();

  const hash = crypto.createHmac("sha1", key2Value!)
    .update(`${username}:${pwHash}`)
    .digest("hex");

  // getjwt — verschlüsselt senden
  const clientUuid = crypto.randomUUID();
  const jwtCmd = `jdev/sys/getjwt/${hash}/${username}/4/${clientUuid}/GatewayWorker`;

  let receivedToken: string | null = null;
  let validUntil = 0;

  const jwtOk = await new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => resolve(false), 10000);
    const onMsg = (data: WebSocket.RawData) => {
      // Antwort kommt als verschlüsselter Text-Frame
      const msg = data.toString();
      let decrypted = msg;

      // Versuche Entschlüsselung wenn Base64-artig
      try {
        if (!msg.startsWith("{") && !msg.startsWith("[")) {
          decrypted = loxoneAesDecrypt(msg, aesKey, aesIv);
        }
      } catch (_e) { /* ignore, weiterversuchen mit rohem Text */ }

      let parsed: any;
      try { parsed = JSON.parse(decrypted); } catch (_e) { return; }

      const ll = parsed?.LL;
      if (!ll) return;
      if (typeof ll.control === "string" && ll.control.includes("getjwt")) {
        clearTimeout(timeout);
        ws.removeListener("message", onMsg);
        const code = ll.Code ?? ll.code;
        if (code === "200" || code === 200) {
          const val = ll.value as any;
          if (val?.token) {
            receivedToken = val.token as string;
            // validUntil: Loxone liefert Sekunden seit 2009-01-01
            // Konvertierung: loxoneEpoch = 1230768000 (Unix-Timestamp 2009-01-01)
            const loxEpoch = 1230768000;
            validUntil = (val.validUntil as number) + loxEpoch;
          }
          resolve(true);
        } else {
          resolve(false);
        }
      }
    };
    ws.on("message", onMsg);

    // Verschlüsselt senden
    const encrypted = loxoneAesEncrypt(jwtCmd, aesKey, aesIv);
    ws.send(`jdev/sys/enc/${encodeURIComponent(encrypted)}`);
  });

  if (!jwtOk || !receivedToken) {
    log("warn", `[Loxone] getjwt failed for ${serialNumber}`);
    return false;
  }

  // Token speichern
  loxoneTokenStore.set(serialNumber, { token: receivedToken, validUntil });
  const validDate = new Date(validUntil * 1000).toISOString().slice(0, 10);
  log("info", `[Loxone] Token acquired: ${serialNumber} (valid until: ${validDate})`);

  // ── Schritt 4: Mit Token authentifizieren ────────────────────────────────
  return await loxoneAuthWithToken(ws, baseUrl, username, receivedToken, aesKey, aesIv, serialNumber);
}

/**
 * authwithtoken — letzter Schritt der JWT-Auth.
 * Holt einen neuen key für den Token-Hash und sendet ihn verschlüsselt.
 */
async function loxoneAuthWithToken(
  ws: WebSocket,
  baseUrl: string,
  username: string,
  token: string,
  aesKey: Buffer,
  aesIv: Buffer,
  serialNumber: string
): Promise<boolean> {

  // Neuen Key für Token-Hash anfordern
  let tokenKey: string | null = null;

  const getKeyOk = await new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => resolve(false), 8000);
    const onMsg = (data: WebSocket.RawData) => {
      const msg = data.toString();
      let parsed: any;
      try { parsed = JSON.parse(msg); } catch (_e) { return; }
      const ll = parsed?.LL;
      if (!ll) return;
      if (typeof ll.control === "string" && ll.control.includes("getkey") && !ll.control.includes("getkey2")) {
        clearTimeout(timeout);
        ws.removeListener("message", onMsg);
        if (ll.value && typeof ll.value === "string") {
          tokenKey = ll.value as string;
          resolve(true);
        } else {
          resolve(false);
        }
      }
    };
    ws.on("message", onMsg);
    ws.send("jdev/sys/getkey");
  });

  if (!getKeyOk || !tokenKey) {
    log("warn", `[Loxone] getkey (for token hash) failed for ${serialNumber}`);
    return false;
  }

  // tokenHash = HMAC-SHA1(token, key)
  const tokenHash = crypto.createHmac("sha1", tokenKey)
    .update(token)
    .digest("hex");

  // authwithtoken verschlüsselt senden
  const authCmd = `authwithtoken/${tokenHash}/${username}`;

  const authOk = await new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => resolve(false), 8000);
    const onMsg = (data: WebSocket.RawData) => {
      const msg = data.toString();
      let decrypted = msg;
      try {
        if (!msg.startsWith("{") && !msg.startsWith("[")) {
          decrypted = loxoneAesDecrypt(msg, aesKey, aesIv);
        }
      } catch (_e) { /* ignore */ }

      let parsed: any;
      try { parsed = JSON.parse(decrypted); } catch (_e) { return; }
      const ll = parsed?.LL;
      if (!ll) return;
      if (typeof ll.control === "string" && ll.control.includes("authwithtoken")) {
        clearTimeout(timeout);
        ws.removeListener("message", onMsg);
        const code = ll.Code ?? ll.code;
        if (code === "200" || code === 200) {
          resolve(true);
        } else {
          // Token ungültig → aus Cache löschen
          loxoneTokenStore.delete(serialNumber);
          log("warn", `[Loxone] authwithtoken failed (code ${code}), token removed: ${serialNumber}`);
          resolve(false);
        }
      }
    };
    ws.on("message", onMsg);

    const encrypted = loxoneAesEncrypt(authCmd, aesKey, aesIv);
    ws.send(`jdev/sys/enc/${encodeURIComponent(encrypted)}`);
  });

  if (authOk) {
    log("info", `[Loxone] Authenticated: ${serialNumber}`);
  }
  return authOk;
}

/**
 * Loxone Binär-Frame-Parser (ValueEvent)
 * Der Miniserver sendet States initial und bei Änderungen als Binär-Frames.
 * Format: Header (8 Bytes) + Payload
 * Header-Byte 1: Identifier (0x03 = ValueEvent)
 * Payload: UUID (16 Bytes, little-endian) + double (8 Bytes, little-endian) — wiederholt
 */
function parseLoxoneValueEvent(buffer: Buffer): Array<{ uuid: string; value: number }> {
  const results: Array<{ uuid: string; value: number }> = [];

  // Minimal-Header: 8 Bytes
  if (buffer.length < 8) return results;

  const msgType = buffer[1]; // 0x03 = ValueEvent
  if (msgType !== 0x03) return results;

  // Payload ab Byte 8
  let offset = 8;
  while (offset + 24 <= buffer.length) {
    // UUID: 16 Bytes in Loxone-spezifischem Format (4 Gruppen: uint32le + uint16le + uint16le + uint8[8])
    const p1 = buffer.readUInt32LE(offset).toString(16).padStart(8, "0");
    const p2 = buffer.readUInt16LE(offset + 4).toString(16).padStart(4, "0");
    const p3 = buffer.readUInt16LE(offset + 6).toString(16).padStart(4, "0");
    const p4 = buffer.slice(offset + 8, offset + 16).toString("hex");
    const uuid = `${p1}-${p2}-${p3}-${p4.slice(0, 4)}-${p4.slice(4)}`;

    // double: 8 Bytes (IEEE 754, little-endian)
    const value = buffer.readDoubleLE(offset + 16);
    results.push({ uuid: uuid.toLowerCase(), value });
    offset += 24;
  }

  return results;
}

/**
 * Baut eine WebSocket-Verbindung zum Loxone Miniserver auf und startet Streaming.
 */
function connectLoxoneWs(state: LoxoneWsState): void {
  if (state.ws) {
    try { state.ws.terminate(); } catch (_e) {}
    state.ws = null;
  }

  // Keepalive-Timer stoppen falls vorhanden
  if (state.keepaliveTimer) {
    clearInterval(state.keepaliveTimer);
    state.keepaliveTimer = null;
  }

  state.authenticated = false;
  state.statusUpdatesEnabled = false;

  const wsUrl = state.baseUrl.replace(/^http/, "ws") + "/ws/rfc6455";
  log("info", `[Loxone] WebSocket connecting: ${state.serialNumber} → ${wsUrl}`);

  const ws = new WebSocket(wsUrl, {
    handshakeTimeout: 10000,
  });
  state.ws = ws;

  ws.on("open", async () => {
    log("info", `[Loxone] WebSocket open: ${state.serialNumber}`);
    state.reconnectDelay = 1000; // Reset backoff

    // JWT-Token-basierte Authentifizierung (RSA Key Exchange + AES + Token)
    const ok = await loxoneWsAuth(ws, state.baseUrl, state.username, state.password, state.serialNumber);
    if (!ok) {
      ws.terminate();
      scheduleReconnect(state);
      return;
    }

    state.authenticated = true;

    // Status-Updates aktivieren: Miniserver sendet jetzt bei jeder Wertänderung
    ws.send("jdev/sps/enablestatusupdate");
    log("info", `[Loxone] Status updates requested: ${state.serialNumber} (${state.uuidMap.size} UUIDs registered)`);

    // Keepalive: alle 4 Minuten "keepalive" senden (Miniserver schließt nach 5 min Inaktivität)
    state.keepaliveTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send("keepalive");
        log("debug", `[Loxone] Keepalive sent: ${state.serialNumber}`);
      }
    }, 4 * 60 * 1000);
  });

  ws.on("message", (data: WebSocket.RawData) => {
    // Binäre Frames → ValueEvents
    if (Buffer.isBuffer(data)) {
      const events = parseLoxoneValueEvent(data);
      for (const { uuid, value } of events) {
        const entry = state.uuidMap.get(uuid);
        if (entry) {
          if (!isSpike(value, entry.energy_type)) {
            entry.latest_value = value;
          }
        }
      }
      if (events.length > 0) {
        log("debug", `[Loxone] ${events.length} value events from ${state.serialNumber}`);
      }
      return;
    }

    // Text-Frames → Status/Ack
    const msg = data.toString();
    let parsed: any;
    try { parsed = JSON.parse(msg); } catch (_e) { return; }

    const ll = parsed?.LL;
    if (!ll) return;

    // enablestatusupdate Bestätigung
    if (typeof ll.control === "string" && ll.control.includes("enablestatusupdate")) {
      state.statusUpdatesEnabled = true;
      log("info", `[Loxone] Status updates enabled: ${state.serialNumber}`);
    }

    // Text-basierte Wert-Events (ältere Miniserver-Versionen)
    if (ll.control && ll.value !== undefined) {
      const uuidMatch = String(ll.control).match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
      if (uuidMatch) {
        const uuid = uuidMatch[1].toLowerCase();
        const entry = state.uuidMap.get(uuid);
        if (entry) {
          const v = parseFloat(String(ll.value));
          if (!isNaN(v) && !isSpike(v, entry.energy_type)) {
            entry.latest_value = v;
          }
        }
      }
    }
  });

  ws.on("close", (code, reason) => {
    log("warn", `[Loxone] WebSocket closed: ${state.serialNumber} (${code} ${reason?.toString() || ""})`);
    if (state.keepaliveTimer) {
      clearInterval(state.keepaliveTimer);
      state.keepaliveTimer = null;
    }
    state.ws = null;
    state.authenticated = false;
    state.statusUpdatesEnabled = false;
    scheduleReconnect(state);
  });

  ws.on("error", (err) => {
    log("warn", `[Loxone] WebSocket error: ${state.serialNumber}: ${err.message}`);
    // close event folgt automatisch
  });
}

function scheduleReconnect(state: LoxoneWsState): void {
  if (state.reconnecting) return;
  state.reconnecting = true;

  const delay = state.reconnectDelay;
  state.reconnectDelay = Math.min(state.reconnectDelay * 2, 60000); // max 60s

  log("info", `[Loxone] Reconnecting ${state.serialNumber} in ${delay}ms...`);
  setTimeout(() => {
    state.reconnecting = false;
    connectLoxoneWs(state);
  }, delay);
}

/**
 * Registriert alle Loxone-Meter und baut WebSocket-Verbindungen auf.
 * Nicht-Loxone-Meter werden dem HTTP-Polling-Pool übergeben.
 */
async function initLoxoneConnections(meters: MeterWithSensor[]): Promise<MeterWithSensor[]> {
  const nonLoxoneMeters: MeterWithSensor[] = [];

  // Loxone-Meter nach Seriennummer gruppieren
  const loxoneBySerial = new Map<string, { config: any; meters: MeterWithSensor[] }>();

  for (const meter of meters) {
    const type = (meter.location_integration?.integration as any)?.type as string | undefined;
    if (type !== "loxone" && type !== "loxone_miniserver") {
      nonLoxoneMeters.push(meter);
      continue;
    }

    const config = meter.location_integration?.config as {
      serial_number?: string;
      username?: string;
      password?: string;
    } | undefined;

    if (!config?.serial_number || !config.username || !config.password || !meter.sensor_uuid) {
      log("debug", `[Loxone] Skipping meter ${meter.name}: incomplete config`);
      nonLoxoneMeters.push(meter); // Fallback auf HTTP-Polling
      continue;
    }

    const serial = config.serial_number;
    if (!loxoneBySerial.has(serial)) {
      loxoneBySerial.set(serial, { config, meters: [] });
    }
    loxoneBySerial.get(serial)!.meters.push(meter);
  }

  // Pro Miniserver: DNS auflösen und WebSocket-State registrieren
  for (const [serial, { config, meters: loxMeters }] of loxoneBySerial) {
    const baseUrl = await resolveLoxoneBaseUrl(serial);
    if (!baseUrl) {
      log("warn", `[Loxone] DNS failed for ${serial} – falling back to HTTP polling`);
      nonLoxoneMeters.push(...loxMeters);
      continue;
    }

    let state = loxoneConnections.get(serial);

    if (!state) {
      // Neuer Miniserver: State anlegen
      state = {
        serialNumber: serial,
        username: config.username,
        password: config.password,
        baseUrl,
        ws: null,
        uuidMap: new Map(),
        reconnectDelay: 1000,
        reconnecting: false,
        authenticated: false,
        statusUpdatesEnabled: false,
        keepaliveTimer: null,
      };
      loxoneConnections.set(serial, state);
    }

    // UUID-Map aktualisieren (bei Meter-Änderungen)
    state.uuidMap.clear();
    for (const meter of loxMeters) {
      if (meter.sensor_uuid) {
        state.uuidMap.set(meter.sensor_uuid.toLowerCase(), {
          meter_id: meter.id,
          tenant_id: meter.tenant_id,
          energy_type: meter.energy_type,
          latest_value: null,
        });
      }
    }

    // Verbindung aufbauen (idempotent wenn schon verbunden)
    if (!state.ws || state.ws.readyState === WebSocket.CLOSED || state.ws.readyState === WebSocket.CLOSING) {
      connectLoxoneWs(state);
    }
  }

  return nonLoxoneMeters;
}

/**
 * Flush: Liest den aktuellen In-Memory-State aller WebSocket-Verbindungen
 * und sendet alle bekannten Werte als Batch an gateway-ingest.
 */
async function flushLoxoneBuffer(): Promise<void> {
  const readings: PowerReading[] = [];
  const now = new Date().toISOString();

  for (const [serial, state] of loxoneConnections) {
    if (!state.authenticated) {
      log("debug", `[Loxone] Skipping flush for ${serial}: not authenticated`);
      continue;
    }

    for (const [, entry] of state.uuidMap) {
      if (entry.latest_value === null) continue;
      readings.push({
        meter_id: entry.meter_id,
        tenant_id: entry.tenant_id,
        power_value: entry.latest_value,
        energy_type: entry.energy_type,
        recorded_at: now,
      });
    }
  }

  if (readings.length > 0) {
    try {
      await sendReadings(readings);
      log("info", `✓ Flush: ${readings.length} Loxone readings inserted`);
    } catch (err) {
      log("warn", `Flush failed: ${err instanceof Error ? err.message : err}`);
    }
  }
}

// ─── HTTP Gateway Pollers ─────────────────────────────────────────────────────

async function pollLoxoneHttp(meter: MeterWithSensor): Promise<number | null> {
  // HTTP-Fallback für Loxone (wenn WebSocket nicht verfügbar)
  const config = meter.location_integration?.config as {
    serial_number: string;
    username: string;
    password: string;
  } | undefined;

  if (!config?.serial_number || !config.username || !config.password || !meter.sensor_uuid) return null;

  try {
    const baseUrl = await resolveLoxoneBaseUrl(config.serial_number);
    if (!baseUrl) return null;

    const authHeader = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`;
    const response = await fetch(`${baseUrl}/jdev/sps/io/${meter.sensor_uuid}/all`, {
      headers: { Authorization: authHeader },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) return null;

    const data = await response.json() as any;
    const ll = data?.LL;
    if (!ll) return null;

    let powerKw: number | null = null;
    for (const key of Object.keys(ll)) {
      if (key.startsWith("output")) {
        const output = ll[key];
        if (output?.name === "Pf" || output?.name === "actual") {
          const v = parseFloat(String(output.value));
          if (!isNaN(v)) { powerKw = v; break; }
        }
      }
    }
    if (powerKw === null && ll.value !== undefined) {
      const v = parseFloat(String(ll.value));
      if (!isNaN(v)) powerKw = v;
    }
    return powerKw;
  } catch (err) {
    log("warn", `[Loxone-HTTP] Error polling ${meter.name}: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

async function pollShelly(meter: MeterWithSensor): Promise<number | null> {
  const config = meter.location_integration?.config as {
    server_uri: string;
    auth_key: string;
  } | undefined;

  if (!config?.server_uri || !config.auth_key || !meter.sensor_uuid) return null;

  try {
    const baseUrl = `https://${config.server_uri.replace(/^https?:\/\//, "")}`;
    const response = await fetch(
      `${baseUrl}/device/all_status?auth_key=${config.auth_key}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!response.ok) return null;

    const data = await response.json() as any;
    const devices = data?.data?.devices_status || {};
    const parts = meter.sensor_uuid.split("_");
    if (parts.length < 2) return null;
    const deviceId = parts.slice(0, -2).join("_");
    const sensorType = parts[parts.length - 2];
    const deviceStatus = devices[deviceId];
    if (!deviceStatus) return null;

    if (sensorType === "em0") return deviceStatus["em:0"]?.total_act_power ?? null;
    if (sensorType.startsWith("switch")) {
      const ch = parseInt(sensorType.replace("switch", ""), 10);
      return deviceStatus[`switch:${ch}`]?.apower ?? null;
    }
    return null;
  } catch (err) {
    log("warn", `[Shelly] Error polling ${meter.name}: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

async function pollABB(meter: MeterWithSensor): Promise<number | null> {
  const config = meter.location_integration?.config as {
    host: string;
    username: string;
    password: string;
    system_access_point?: string;
  } | undefined;

  if (!config?.host || !meter.sensor_uuid) return null;

  try {
    const baseUrl = config.host.startsWith("http") ? config.host : `http://${config.host}`;
    const sapId = config.system_access_point || "00000000-0000-0000-0000-000000000000";
    const authHeader = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`;
    const [deviceId, channelId, datapointId] = meter.sensor_uuid.split(".");
    if (!deviceId || !channelId || !datapointId) return null;

    const response = await fetch(
      `${baseUrl}/api/rest/v1/datapoint/${sapId}/${deviceId}.${channelId}.${datapointId}`,
      { headers: { Authorization: authHeader }, signal: AbortSignal.timeout(8000) }
    );
    if (!response.ok) return null;

    const data = await response.json() as any;
    const values = data?.values || {};
    const rawValue = Object.values(values)[0];
    if (rawValue === undefined) return null;
    return parseFloat(String(rawValue));
  } catch (err) {
    log("warn", `[ABB] Error polling ${meter.name}: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

async function pollSiemens(meter: MeterWithSensor): Promise<number | null> {
  const config = meter.location_integration?.config as {
    api_url: string;
    client_id: string;
    client_secret: string;
    partition_id: string;
  } | undefined;

  if (!config?.api_url || !config.client_id || !config.client_secret || !meter.sensor_uuid) return null;

  try {
    const tokenRes = await fetch("https://login.siemens.com/access/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: config.client_id,
        client_secret: config.client_secret,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!tokenRes.ok) return null;

    const { access_token } = await tokenRes.json() as any;
    const dataRes = await fetch(
      `${config.api_url}/api/v1/points/${meter.sensor_uuid}/values?limit=1`,
      { headers: { Authorization: `Bearer ${access_token}` }, signal: AbortSignal.timeout(8000) }
    );
    if (!dataRes.ok) return null;

    const data = await dataRes.json() as any;
    const value = data?.data?.[0]?.attributes?.presentValue ?? data?.data?.[0]?.attributes?.value;
    if (value === undefined) return null;
    return parseFloat(String(value));
  } catch (err) {
    log("warn", `[Siemens] Error polling ${meter.name}: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

async function pollHomematic(meter: MeterWithSensor): Promise<number | null> {
  const config = meter.location_integration?.config as {
    host: string;
    auth_token?: string;
  } | undefined;

  if (!config?.host || !meter.sensor_uuid) return null;

  try {
    const baseUrl = config.host.startsWith("http") ? config.host : `https://${config.host}`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (config.auth_token) headers["AUTHORIZATION"] = `Bearer ${config.auth_token}`;

    const [address, paramName] = meter.sensor_uuid.includes(":")
      ? meter.sensor_uuid.split(/:(.+)/)
      : [meter.sensor_uuid, "POWER"];

    const response = await fetch(`${baseUrl}/api/homematic.cgi`, {
      method: "POST",
      headers,
      body: JSON.stringify({ method: "getValue", params: [address, paramName || "POWER"], id: 1 }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;

    const data = await response.json() as any;
    const value = data?.result;
    if (value === null || value === undefined) return null;
    return parseFloat(String(value));
  } catch (err) {
    log("warn", `[Homematic] Error polling ${meter.name}: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

// ─── Gateway Dispatcher ──────────────────────────────────────────────────────

const GATEWAY_POLLERS: Record<string, (meter: MeterWithSensor) => Promise<number | null>> = {
  // Loxone: Nur als HTTP-Fallback (primär läuft WebSocket)
  loxone: pollLoxoneHttp,
  loxone_miniserver: pollLoxoneHttp,
  shelly_cloud: pollShelly,
  abb_free_at_home: pollABB,
  siemens_building_x: pollSiemens,
  homematic_ip: pollHomematic,
};

// ─── HTTP Poll Cycle (für Nicht-Loxone-Gateways) ────────────────────────────

async function httpPollCycle(meters: MeterWithSensor[]): Promise<void> {
  if (meters.length === 0) return;

  const now = new Date().toISOString();
  const readings: PowerReading[] = [];
  const errors: string[] = [];

  const results = await Promise.allSettled(
    meters.map(async (meter) => {
      const integrationType = (meter.location_integration?.integration as any)?.type as string | undefined;
      if (!integrationType) return null;

      const poller = GATEWAY_POLLERS[integrationType];
      if (!poller) {
        log("debug", `No poller for type "${integrationType}" – skipping ${meter.name}`);
        return null;
      }

      const powerValue = await poller(meter);
      if (powerValue === null) return null;

      if (isSpike(powerValue, meter.energy_type)) {
        log("warn", `Spike detected for ${meter.name}: ${powerValue} – skipped`);
        return null;
      }

      return {
        meter_id: meter.id,
        tenant_id: meter.tenant_id,
        power_value: powerValue,
        energy_type: meter.energy_type,
        recorded_at: now,
      } satisfies PowerReading;
    })
  );

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled" && result.value !== null) {
      readings.push(result.value);
    } else if (result.status === "rejected") {
      errors.push(`${meters[i].name}: ${result.reason}`);
    }
  }

  if (errors.length > 0) {
    log("warn", `${errors.length} meters failed:`, errors.join("; "));
  }

  if (readings.length > 0) {
    await sendReadings(readings);
    log("info", `✓ HTTP Poll: ${readings.length}/${meters.length} readings inserted`);
  }
}

// ─── Entry Point ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log("info", `Gateway Worker starting (WebSocket mode)...`);
  log("info", `  Supabase URL:      ${SUPABASE_URL}`);
  log("info", `  HTTP Poll interval: ${POLL_INTERVAL_MS}ms`);
  log("info", `  WS Flush interval:  ${FLUSH_INTERVAL_MS}ms`);
  log("info", `  Log level:          ${LOG_LEVEL}`);

  process.on("SIGTERM", () => { log("info", "SIGTERM – shutting down..."); process.exit(0); });
  process.on("SIGINT", () => { log("info", "SIGINT – shutting down..."); process.exit(0); });

  // Meter laden und Loxone WebSocket-Verbindungen aufbauen
  let nonLoxoneMeters: MeterWithSensor[] = [];

  const initMeters = async () => {
    const allMeters = await fetchMeters();
    log("info", `Found ${allMeters.length} active meters`);
    nonLoxoneMeters = await initLoxoneConnections(allMeters);
    log("info", `Loxone WebSocket: ${loxoneConnections.size} Miniserver(s) | HTTP Poll: ${nonLoxoneMeters.length} meters`);
  };

  await initMeters();

  // Meter-Liste alle 5 Minuten neu laden (um neue Meter zu erkennen)
  setInterval(initMeters, 5 * 60 * 1000);

  // ── Loxone Flush-Timer (sekündlich) ──────────────────────────────────────
  setInterval(async () => {
    try {
      await flushLoxoneBuffer();
    } catch (err) {
      log("error", "Flush error:", err instanceof Error ? err.message : err);
    }
  }, FLUSH_INTERVAL_MS);

  // ── HTTP Poll-Timer (für alle anderen Gateways) ───────────────────────────
  const httpPoll = async () => {
    try {
      await httpPollCycle(nonLoxoneMeters);
    } catch (err) {
      log("error", "HTTP poll error:", err instanceof Error ? err.message : err);
    }
  };

  // Initialer Poll sofort, dann im Intervall
  await httpPoll();
  setInterval(httpPoll, POLL_INTERVAL_MS);
}

main().catch((err) => {
  console.error("[FATAL] Worker crashed:", err);
  process.exit(1);
});
