// Edge Function: ocmf-finalize
// Wird vom OCPP-persistent-server nach StopTransaction aufgerufen.
// Bauteil-Verantwortung:
//  - Lade alle charging_session_meter_records einer Session
//  - Erzeuge finalen OCMF-Payload (entweder direkt aus Wallbox-Records oder unsigned-Stub)
//  - Verifiziere Signatur (sofern vorhanden) gegen charge_points.meter_public_key
//  - Schreibe Ergebnis in charging_sessions.ocmf_payload + ocmf_status

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OCMF_PREFIX = "OCMF|";

type Record_ = {
  id: string;
  session_id: string;
  charge_point_id: string | null;
  sampled_at: string;
  context: string;
  meter_format: string;
  raw_payload: string;
  signed_value: string | null;
  reading_wh: number | null;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const sessionId = body.session_id as string | undefined;
    if (!sessionId) {
      return json({ error: "session_id required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Session laden
    const { data: session, error: sErr } = await supabase
      .from("charging_sessions")
      .select(
        "id, tenant_id, charge_point_id, transaction_id, id_tag, start_time, stop_time, meter_start, meter_stop, energy_kwh",
      )
      .eq("id", sessionId)
      .single();
    if (sErr || !session) return json({ error: `session not found: ${sErr?.message}` }, 404);

    // Charge-Point Eichrecht-Config
    let cp: any = null;
    if (session.charge_point_id) {
      const { data } = await supabase
        .from("charge_points")
        .select("id, vendor, model, serial_number, eichrecht_enabled, meter_public_key, meter_format")
        .eq("id", session.charge_point_id)
        .maybeSingle();
      cp = data;
    }

    // Records laden
    const { data: records } = await supabase
      .from("charging_session_meter_records")
      .select("*")
      .eq("session_id", sessionId)
      .order("sampled_at", { ascending: true });

    const recs = (records ?? []) as Record_[];

    let ocmf = "";
    let status: "signed" | "unsigned" | "invalid" | "pending" = "pending";
    let fingerprint: string | null = null;

    // Variante A: Wallbox hat signiertes OCMF geliefert → wir nehmen den finalen Datensatz (oder kombinieren B+E)
    const ocmfRecords = recs.filter((r) => r.raw_payload?.includes(OCMF_PREFIX));

    if (ocmfRecords.length > 0 && cp?.eichrecht_enabled) {
      // Bevorzugt: Record mit context "Transaction.End" oder letzter Record
      const endRec =
        ocmfRecords.find((r) => /end|stop/i.test(r.context)) ??
        ocmfRecords[ocmfRecords.length - 1];
      ocmf = endRec.raw_payload.trim();

      if (cp.meter_public_key) {
        const verifyStatus = await verifySignature(ocmf, cp.meter_public_key);
        status = verifyStatus;
        fingerprint = await fingerprintKey(cp.meter_public_key);
      } else {
        status = "unsigned"; // signiert von Wallbox, aber kein Key zur Prüfung hinterlegt
      }
    } else {
      // Variante B: Unsigned Fallback aus meter_start / meter_stop
      ocmf = buildUnsignedStub({
        transactionId: String(session.transaction_id ?? session.id.substring(0, 8)),
        startTs: session.start_time,
        stopTs: session.stop_time ?? new Date().toISOString(),
        startWh: Number(session.meter_start ?? 0),
        stopWh: Number(session.meter_stop ?? (Number(session.meter_start ?? 0) + Number(session.energy_kwh ?? 0) * 1000)),
        identifier: session.id_tag ?? undefined,
        meterSerial: cp?.serial_number ?? "UNKNOWN",
        vendor: cp?.vendor ?? "AICONO",
        model: cp?.model ?? "SoftMeter",
      });
      status = "unsigned";
    }

    const { error: upErr } = await supabase
      .from("charging_sessions")
      .update({
        ocmf_payload: ocmf,
        ocmf_status: status,
        ocmf_public_key_fingerprint: fingerprint,
        ocmf_finalized_at: new Date().toISOString(),
      })
      .eq("id", sessionId);

    if (upErr) return json({ error: `update failed: ${upErr.message}` }, 500);

    return json({ ok: true, session_id: sessionId, status, fingerprint });
  } catch (e) {
    console.error("[ocmf-finalize] error", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// --- OCMF Helpers (kopiert aus src/lib/charging/ocmf.ts, Edge-tauglich) ---

function buildUnsignedStub(opts: {
  transactionId: string;
  startTs: string;
  stopTs: string;
  startWh: number;
  stopWh: number;
  identifier?: string;
  meterSerial?: string;
  vendor?: string;
  model?: string;
}): string {
  const fmtTs = (iso: string) => {
    const d = new Date(iso);
    const pad = (n: number, w = 2) => String(n).padStart(w, "0");
    return (
      `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
      `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())},${pad(d.getUTCMilliseconds(), 3)}+0000 U`
    );
  };
  const header = {
    FV: "1.0",
    GI: "AICONO EMS Unsigned Stub",
    GS: opts.meterSerial,
    GV: "1.0",
    PG: `T${opts.transactionId}`,
    MV: opts.vendor,
    MM: opts.model,
    MS: opts.meterSerial,
    IS: !!opts.identifier,
    IL: "NONE",
    IF: ["RFID_NONE"],
    IT: opts.identifier ? "ISO14443" : "NONE",
    ID: opts.identifier,
    RD: [
      { TM: fmtTs(opts.startTs), TX: "B", RV: Number((opts.startWh / 1000).toFixed(4)), RI: "1-0:1.8.0", RU: "kWh", RT: "AC", EF: "", ST: "G" },
      { TM: fmtTs(opts.stopTs), TX: "E", RV: Number((opts.stopWh / 1000).toFixed(4)), RI: "1-0:1.8.0", RU: "kWh", RT: "AC", EF: "", ST: "G" },
    ],
  };
  return `OCMF|${JSON.stringify(header)}|`;
}

async function verifySignature(ocmf: string, pubKey: string): Promise<"signed" | "invalid" | "unsigned"> {
  try {
    if (!ocmf.startsWith(OCMF_PREFIX)) return "invalid";
    const parts = ocmf.substring(OCMF_PREFIX.length).split("|");
    if (parts.length < 2 || !parts[1]) return "unsigned";
    const sig = JSON.parse(parts[1]);
    if (!sig?.SD) return "unsigned";

    const algo = (sig.SA ?? "").toUpperCase();
    const namedCurve: "P-256" | "P-384" = algo.includes("384") ? "P-384" : "P-256";
    const hash = namedCurve === "P-384" ? "SHA-384" : "SHA-256";

    const keyBuf = pemToBuffer(pubKey);
    const cryptoKey = await crypto.subtle.importKey("spki", keyBuf, { name: "ECDSA", namedCurve }, false, ["verify"]);
    const data = new TextEncoder().encode(parts[0]);
    const sigBytes = decodeSig(sig.SD, sig.SE);
    const raw = derToRaw(sigBytes, namedCurve === "P-384" ? 48 : 32);
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash }, cryptoKey, raw, data);
    return ok ? "signed" : "invalid";
  } catch (e) {
    console.warn("[ocmf-finalize] verify error", (e as Error).message);
    return "invalid";
  }
}

function pemToBuffer(pem: string): ArrayBuffer {
  const cleaned = pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g, "");
  if (/^[0-9a-fA-F]+$/.test(cleaned)) {
    const arr = new Uint8Array(cleaned.length / 2);
    for (let i = 0; i < arr.length; i++) arr[i] = parseInt(cleaned.substring(i * 2, i * 2 + 2), 16);
    return arr.buffer;
  }
  const bin = atob(cleaned);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr.buffer;
}

function decodeSig(sd: string, enc?: string): Uint8Array {
  const e = (enc ?? "").toLowerCase();
  const looksB64 = /^[A-Za-z0-9+/=]+$/.test(sd) && sd.length % 4 === 0 && !/^[0-9a-fA-F]+$/.test(sd);
  if (e === "base64" || looksB64) {
    const bin = atob(sd);
    const a = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return a;
  }
  const clean = sd.replace(/[^0-9a-fA-F]/g, "");
  const a = new Uint8Array(clean.length / 2);
  for (let i = 0; i < a.length; i++) a[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  return a;
}

function derToRaw(der: Uint8Array, intLen: number): Uint8Array {
  if (der[0] !== 0x30) {
    if (der.length === intLen * 2) return der;
    throw new Error("invalid DER");
  }
  let off = 2;
  if (der[1] & 0x80) off += der[1] & 0x7f;
  if (der[off] !== 0x02) throw new Error("DER: expected INT r");
  const rLen = der[off + 1];
  let r = der.slice(off + 2, off + 2 + rLen);
  off += 2 + rLen;
  if (der[off] !== 0x02) throw new Error("DER: expected INT s");
  const sLen = der[off + 1];
  let s = der.slice(off + 2, off + 2 + sLen);
  const norm = (x: Uint8Array) => {
    if (x.length > intLen) x = x.slice(x.length - intLen);
    if (x.length < intLen) {
      const p = new Uint8Array(intLen);
      p.set(x, intLen - x.length);
      x = p;
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

async function fingerprintKey(pem: string): Promise<string> {
  const buf = pemToBuffer(pem);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
    .join(":");
}
