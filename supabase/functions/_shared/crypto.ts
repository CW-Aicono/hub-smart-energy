/**
 * AES-256-GCM encryption/decryption helpers – BSI TR-03181 K1
 * Uses Web Crypto API (native in Deno).
 * Encrypted values are stored as "enc:<base64(iv + ciphertext + tag)>".
 */

const ENC_PREFIX = "enc:";

/** Derive a 256-bit CryptoKey from any passphrase/key string via SHA-256 */
async function importKey(secret: string): Promise<CryptoKey> {
  // Hash the secret to always get exactly 32 bytes, regardless of input format
  const encoded = new TextEncoder().encode(secret);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

/** Encrypt plaintext → "enc:<base64>" */
export async function encrypt(
  plaintext: string,
  hexKey: string
): Promise<string> {
  const key = await importKey(hexKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );
  // iv (12) + ciphertext+tag
  const combined = new Uint8Array(iv.length + cipherBuf.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuf), iv.length);
  // base64 encode
  const b64 = btoa(String.fromCharCode(...combined));
  return ENC_PREFIX + b64;
}

/** Decrypt "enc:<base64>" → plaintext. Returns raw value if not encrypted. */
export async function decrypt(
  value: string,
  hexKey: string
): Promise<string> {
  if (!value.startsWith(ENC_PREFIX)) return value; // legacy plaintext
  const b64 = value.slice(ENC_PREFIX.length);
  const combined = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const key = await importKey(hexKey);
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );
  return new TextDecoder().decode(plainBuf);
}

/** Check whether a value is already encrypted */
export function isEncrypted(value: string): boolean {
  return value.startsWith(ENC_PREFIX);
}

/** Mask a value for frontend display: "••••••ab12" */
export function mask(value: string): string {
  if (!value || value.length < 4) return "••••••••";
  return "••••••" + value.slice(-4);
}
