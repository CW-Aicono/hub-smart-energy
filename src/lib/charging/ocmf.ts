/**
 * OCMF (Open Charge Metering Format) – K1 Eichrecht
 *
 * Spec: https://github.com/SAFE-eV/OCMF-Open-Charge-Metering-Format
 *
 * Frame:  OCMF|<header-json>|<signature-json>
 * Beispiel:
 *   OCMF|{"FV":"1.0","GI":"ABL eMH3","GS":"1901000001","GV":"1.0",
 *          "PG":"T12345","MV":"ABL","MM":"eMH3","MS":"1901000001",
 *          "IS":true,"IL":"VERIFIED","IF":["RFID_RELATED"],
 *          "IT":"ISO14443","ID":"04A1B2C3D4",
 *          "RD":[{"TM":"2025-06-07T12:00:00,000+0200 R","TX":"B","RV":12345.6,"RI":"1-0:1.8.0","RU":"kWh","RT":"AC","EF":"","ST":"G"},
 *                {"TM":"2025-06-07T13:00:00,000+0200 R","TX":"E","RV":12350.2,"RI":"1-0:1.8.0","RU":"kWh","RT":"AC","EF":"","ST":"G"}]}
 *   |{"SA":"ECDSA-secp256r1-SHA256","SD":"3045022100..."}
 */

export type OcmfHeader = {
  FV?: string;
  GI?: string;
  GS?: string;
  GV?: string;
  PG?: string;
  MV?: string;
  MM?: string;
  MS?: string;
  IS?: boolean;
  IL?: string;
  IF?: string[];
  IT?: string;
  ID?: string;
  RD?: OcmfReading[];
  [k: string]: unknown;
};

export type OcmfReading = {
  TM: string; // timestamp + sync flag
  TX?: "B" | "E" | "C" | "X" | "T" | "S"; // Begin, End, Charging, ...
  RV: number; // reading value
  RI?: string; // OBIS code
  RU?: string; // unit (kWh, Wh)
  RT?: string; // AC / DC
  EF?: string; // error flag
  ST?: string; // status (G = OK)
};

export type OcmfSignature = {
  SA?: string; // signature algorithm
  SE?: string; // signature encoding
  SM?: string; // signature mime
  SD: string; // signature data (hex)
};

export type OcmfParseResult = {
  ok: boolean;
  header?: OcmfHeader;
  signature?: OcmfSignature;
  raw: string;
  error?: string;
};

export type VerificationStatus = "signed" | "unsigned" | "invalid" | "pending";

const OCMF_PREFIX = "OCMF|";

/**
 * Parse einer OCMF-Zeile.
 * Akzeptiert sowohl "OCMF|{...}|{...}" als auch reines Header-JSON (für ALFEN-Fallback).
 */
export function parseOcmf(input: string): OcmfParseResult {
  const raw = (input ?? "").trim();
  if (!raw) return { ok: false, raw, error: "empty input" };

  // ALFEN-Variante: liefert manchmal Base64-codiertes OCMF
  let work = raw;
  if (!work.startsWith(OCMF_PREFIX) && /^[A-Za-z0-9+/=]+$/.test(work) && work.length > 40) {
    try {
      const decoded = atob(work);
      if (decoded.startsWith(OCMF_PREFIX)) work = decoded;
    } catch {
      /* not base64, ignore */
    }
  }

  if (!work.startsWith(OCMF_PREFIX)) {
    return { ok: false, raw, error: "missing OCMF| prefix" };
  }

  const parts = work.substring(OCMF_PREFIX.length).split("|");
  if (parts.length < 1) return { ok: false, raw, error: "no payload" };

  let header: OcmfHeader;
  try {
    header = JSON.parse(parts[0]);
  } catch (e) {
    return { ok: false, raw, error: `header JSON parse failed: ${(e as Error).message}` };
  }

  let signature: OcmfSignature | undefined;
  if (parts.length >= 2 && parts[1]) {
    try {
      signature = JSON.parse(parts[1]);
    } catch {
      // Signature optional, leave undefined
    }
  }

  return { ok: true, header, signature, raw: work };
}

/**
 * Builder: erzeugt einen OCMF-Frame aus Header (+ optional Signatur).
 * Wird für unsigned Fallback genutzt – wir erzeugen NIEMALS eine eigene Signatur.
 */
export function buildOcmf(header: OcmfHeader, signature?: OcmfSignature): string {
  const headerJson = JSON.stringify(header);
  if (signature) return `${OCMF_PREFIX}${headerJson}|${JSON.stringify(signature)}`;
  return `${OCMF_PREFIX}${headerJson}|`;
}

/**
 * Erzeugt einen unsignierten OCMF-Stub aus Start-/Stop-Werten.
 * Für reine Anzeige (NICHT eichrechtskonform – wird im UI als "unsigned" gelabelt).
 */
export function buildUnsignedOcmf(opts: {
  identifier?: string;
  identifierType?: string;
  meterSerial?: string;
  vendor?: string;
  model?: string;
  transactionId: string;
  startTs: string;
  stopTs: string;
  startWh: number;
  stopWh: number;
}): string {
  const fmtTs = (iso: string) => {
    // OCMF wants format "YYYY-MM-DDTHH:mm:ss,SSS+ZZZZ R" (R=realtime sync, U=unsync)
    const d = new Date(iso);
    const pad = (n: number, w = 2) => String(n).padStart(w, "0");
    const tz = -d.getTimezoneOffset();
    const sign = tz >= 0 ? "+" : "-";
    const tzAbs = Math.abs(tz);
    const tzStr = `${sign}${pad(Math.floor(tzAbs / 60))}${pad(tzAbs % 60)}`;
    return (
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
      `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())},${pad(d.getMilliseconds(), 3)}` +
      `${tzStr} U`
    );
  };
  const header: OcmfHeader = {
    FV: "1.0",
    GI: "AICONO EMS Unsigned Stub",
    GS: opts.meterSerial ?? "UNKNOWN",
    GV: "1.0",
    PG: `T${opts.transactionId}`,
    MV: opts.vendor,
    MM: opts.model,
    MS: opts.meterSerial,
    IS: !!opts.identifier,
    IL: "NONE",
    IF: ["RFID_NONE"],
    IT: opts.identifierType ?? "NONE",
    ID: opts.identifier,
    RD: [
      {
        TM: fmtTs(opts.startTs),
        TX: "B",
        RV: Number((opts.startWh / 1000).toFixed(4)),
        RI: "1-0:1.8.0",
        RU: "kWh",
        RT: "AC",
        EF: "",
        ST: "G",
      },
      {
        TM: fmtTs(opts.stopTs),
        TX: "E",
        RV: Number((opts.stopWh / 1000).toFixed(4)),
        RI: "1-0:1.8.0",
        RU: "kWh",
        RT: "AC",
        EF: "",
        ST: "G",
      },
    ],
  };
  return buildOcmf(header);
}

/**
 * Verifiziert eine OCMF-ECDSA-Signatur via WebCrypto.
 * Unterstützt secp256r1 (P-256) und secp384r1 (P-384).
 *
 * publicKeyPem: PEM-Format ("-----BEGIN PUBLIC KEY----- ...") oder roher Hex-String.
 */
export async function verifyOcmfSignature(
  parsed: OcmfParseResult,
  publicKeyPem: string,
): Promise<VerificationStatus> {
  if (!parsed.ok || !parsed.header) return "invalid";
  if (!parsed.signature?.SD) return "unsigned";
  if (!publicKeyPem) return "unsigned";

  const algo = (parsed.signature.SA ?? "").toUpperCase();
  let namedCurve: "P-256" | "P-384" = "P-256";
  let hash: "SHA-256" | "SHA-384" = "SHA-256";
  if (algo.includes("SECP384") || algo.includes("P-384")) {
    namedCurve = "P-384";
    hash = "SHA-384";
  }

  try {
    const keyBuf = await importPublicKey(publicKeyPem, namedCurve);
    const cryptoKey = await crypto.subtle.importKey(
      "spki",
      keyBuf,
      { name: "ECDSA", namedCurve },
      false,
      ["verify"],
    );

    // OCMF signiert byte-exakt den header-JSON-String (zwischen den ersten beiden Pipes).
    const headerJson = parsed.raw.substring(OCMF_PREFIX.length).split("|")[0];
    const data = new TextEncoder().encode(headerJson);

    const sigBytes = decodeSignature(parsed.signature.SD, parsed.signature.SE);
    const rawSig = derToRaw(sigBytes, namedCurve === "P-384" ? 48 : 32);

    const ok = await crypto.subtle.verify({ name: "ECDSA", hash }, cryptoKey, rawSig, data);
    return ok ? "signed" : "invalid";
  } catch (e) {
    console.warn("[ocmf] verify failed:", (e as Error).message);
    return "invalid";
  }
}

function decodeSignature(sd: string, encoding?: string): Uint8Array {
  const enc = (encoding ?? "").toLowerCase();
  if (enc === "base64" || /^[A-Za-z0-9+/=]+$/.test(sd) && sd.length % 4 === 0 && !/^[0-9a-fA-F]+$/.test(sd)) {
    const bin = atob(sd);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }
  // hex (default for OCMF)
  const clean = sd.replace(/[^0-9a-fA-F]/g, "");
  const arr = new Uint8Array(clean.length / 2);
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  return arr;
}

/** DER-encoded ECDSA signature -> raw r||s (Web Crypto wants raw). */
function derToRaw(der: Uint8Array, intLen: number): Uint8Array {
  // Minimal DER parser for SEQUENCE { INTEGER r, INTEGER s }
  if (der[0] !== 0x30) {
    // Already raw (r||s)?
    if (der.length === intLen * 2) return der;
    throw new Error("invalid DER signature");
  }
  let offset = 2;
  if (der[1] & 0x80) offset += der[1] & 0x7f;
  if (der[offset] !== 0x02) throw new Error("DER: expected INTEGER for r");
  const rLen = der[offset + 1];
  let r = der.slice(offset + 2, offset + 2 + rLen);
  offset += 2 + rLen;
  if (der[offset] !== 0x02) throw new Error("DER: expected INTEGER for s");
  const sLen = der[offset + 1];
  let s = der.slice(offset + 2, offset + 2 + sLen);

  // Strip leading zero / pad to intLen
  const norm = (x: Uint8Array) => {
    if (x.length > intLen) x = x.slice(x.length - intLen);
    if (x.length < intLen) {
      const padded = new Uint8Array(intLen);
      padded.set(x, intLen - x.length);
      x = padded;
    }
    return x;
  };
  r = norm(r);
  s = norm(s);

  const out = new Uint8Array(intLen * 2);
  out.set(r, 0);
  out.set(s, intLen);
  return out;
}

async function importPublicKey(pem: string, _curve: "P-256" | "P-384"): Promise<ArrayBuffer> {
  const cleaned = pem
    .replace(/-----BEGIN PUBLIC KEY-----/g, "")
    .replace(/-----END PUBLIC KEY-----/g, "")
    .replace(/\s+/g, "");
  // If raw hex provided, assume it's the raw SPKI – uncommon. Prefer base64 SPKI.
  if (/^[0-9a-fA-F]+$/.test(cleaned) && cleaned.length > 100) {
    const arr = new Uint8Array(cleaned.length / 2);
    for (let i = 0; i < arr.length; i++) arr[i] = parseInt(cleaned.substring(i * 2, i * 2 + 2), 16);
    return arr.buffer;
  }
  const bin = atob(cleaned);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

/** SHA-256 Fingerprint des Public-Keys (hex, uppercase, colon-separated). */
export async function publicKeyFingerprint(pem: string): Promise<string> {
  const cleaned = pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g, "");
  let bytes: Uint8Array;
  if (/^[0-9a-fA-F]+$/.test(cleaned)) {
    bytes = new Uint8Array(cleaned.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(cleaned.substring(i * 2, i * 2 + 2), 16);
  } else {
    const bin = atob(cleaned);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  }
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
    .join(":");
}

/**
 * Erzeugt einen Deep-Link auf die S.A.F.E. Transparenzsoftware (online),
 * über den der Endkunde den OCMF-Beleg direkt prüfen kann.
 * Fallback: lokale Transparenzsoftware-Anleitung.
 */
export function safeTransparenzUrl(ocmf: string): string {
  // S.A.F.E. bietet keinen direkten URL-Parameter-Modus → wir verlinken auf die Anleitung
  // und legen den Beleg per ?ocmf= (für eigene Online-Viewer wie chargeprice.app/transparenz) an.
  return `https://www.safe-ev.de/de/transparenzsoftware.html#ocmf=${encodeURIComponent(ocmf)}`;
}

/** Datei-Name für den OCMF-Download einer Session. */
export function ocmfFilename(sessionId: string, transactionId?: number | null): string {
  const tx = transactionId ?? sessionId.substring(0, 8);
  return `eichrecht-session-${tx}.ocmf`;
}
