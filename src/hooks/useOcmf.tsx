import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { parseOcmf, ocmfFilename, safeTransparenzUrl, type VerificationStatus } from "@/lib/charging/ocmf";

export interface OcmfSessionData {
  sessionId: string;
  transactionId: number | null;
  ocmfPayload: string | null;
  status: VerificationStatus | null;
  fingerprint: string | null;
  finalizedAt: string | null;
}

/**
 * Hook für den OCMF-Beleg einer einzelnen Charging-Session.
 * Lädt Payload + Status, bietet Download / S.A.F.E.-Link / Re-Finalize.
 */
export function useOcmf(sessionId: string | null | undefined) {
  const [data, setData] = useState<OcmfSessionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const { data: row, error } = await supabase
        .from("charging_sessions")
        .select("id, transaction_id, ocmf_payload, ocmf_status, ocmf_public_key_fingerprint, ocmf_finalized_at")
        .eq("id", sessionId)
        .maybeSingle();
      if (error) throw error;
      if (!row) {
        setData(null);
        return;
      }
      setData({
        sessionId: row.id,
        transactionId: row.transaction_id ?? null,
        ocmfPayload: row.ocmf_payload ?? null,
        status: (row.ocmf_status as VerificationStatus) ?? null,
        fingerprint: row.ocmf_public_key_fingerprint ?? null,
        finalizedAt: row.ocmf_finalized_at ?? null,
      });
    } catch (e) {
      console.error("[useOcmf] refresh", e);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  /** Erzeuge / aktualisiere OCMF-Payload serverseitig. */
  const finalize = useCallback(async () => {
    if (!sessionId) return;
    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke("ocmf-finalize", { body: { session_id: sessionId } });
      if (error) throw error;
      toast.success("OCMF-Beleg erzeugt");
      await refresh();
    } catch (e) {
      console.error("[useOcmf] finalize", e);
      toast.error(`Fehler beim Erzeugen: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [sessionId, refresh]);

  const download = useCallback(() => {
    if (!data?.ocmfPayload) return;
    const blob = new Blob([data.ocmfPayload], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = ocmfFilename(data.sessionId, data.transactionId);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [data]);

  const safeUrl = data?.ocmfPayload ? safeTransparenzUrl(data.ocmfPayload) : null;
  const parsed = data?.ocmfPayload ? parseOcmf(data.ocmfPayload) : null;

  /** Erzeugt einen öffentlichen (token-basierten) Download-Link für den Endkunden. */
  const getPublicLink = useCallback(async (): Promise<string | null> => {
    if (!sessionId) return null;
    try {
      const { data: tokenData, error } = await supabase.functions.invoke("ocmf-public-link", {
        body: { session_id: sessionId },
      });
      if (error) throw error;
      return (tokenData as { url?: string })?.url ?? null;
    } catch (e) {
      console.error("[useOcmf] getPublicLink", e);
      toast.error("Konnte Link nicht erzeugen");
      return null;
    }
  }, [sessionId]);

  return { data, loading, busy, refresh, finalize, download, getPublicLink, safeUrl, parsed };
}
