/**
 * Maps OCPP server reject messages and error codes into user-friendly German text.
 * Source server messages come from supabase/functions/ocpp-central and from
 * the wallbox itself (relayed by ocpp-ws-proxy).
 */
export function mapOcppRejectMessage(
  action: string,
  rawMessage?: string | null,
  errorCode?: string | null,
): string {
  const msg = (rawMessage || "").toLowerCase();
  const code = (errorCode || "").toLowerCase();

  // Wallbox not yet ready (most common case for RemoteStart on Compleo & co.)
  if (msg.includes("not ready") || msg.includes("not available")) {
    if (action === "Ladevorgang starten") {
      return "Anschluss ist nicht bereit. Bitte das Fahrzeug einstecken und erneut versuchen.";
    }
    return "Die Ladestation ist gerade nicht bereit für diesen Befehl.";
  }

  if (msg.includes("not found") || msg.includes("charge point not found")) {
    return "Ladestation wurde nicht gefunden. Bitte Konfiguration prüfen.";
  }

  if (msg.includes("no active session") || msg.includes("no transaction")) {
    return "Es läuft kein aktiver Ladevorgang, der gestoppt werden könnte.";
  }

  if (msg.includes("failed to queue") || msg.includes("queue command")) {
    return "Befehl konnte nicht in die Warteschlange aufgenommen werden. Bitte erneut versuchen.";
  }

  if (msg.includes("timeout") || code.includes("timeout")) {
    return "Die Ladestation hat nicht rechtzeitig geantwortet. Bitte WLAN/LAN-Verbindung prüfen.";
  }

  if (code === "occurenceconstraintviolation" || code === "formationviolation") {
    return "Die Ladestation hat den Befehl wegen ungültiger Parameter abgelehnt.";
  }

  // OCPP-Generic-Reject (z.B. wenn Connector belegt / Auto bereits lädt)
  if (msg === "rejected" || msg.includes("rejected")) {
    if (action === "Ladevorgang starten") {
      return "Die Ladestation hat den Start abgelehnt – meist weil kein Fahrzeug eingesteckt ist oder der Anschluss bereits belegt ist.";
    }
    if (action === "Ladevorgang stoppen") {
      return "Die Ladestation konnte den Ladevorgang nicht stoppen. Möglicherweise ist die Sitzung bereits beendet.";
    }
    return "Die Ladestation hat den Befehl abgelehnt.";
  }

  // Fallback: zeige die Original-Meldung, aber mit menschlichem Präfix
  return rawMessage
    ? `Ladestation antwortete: „${rawMessage}".`
    : "Der Befehl konnte nicht ausgeführt werden.";
}
