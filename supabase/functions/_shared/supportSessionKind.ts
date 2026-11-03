// Entscheidet, welche Art Fernzugriff auf einen Tenant erlaubt ist.
// "setup": Tenant ist noch in der Einrichtungsphase (vor Übergabe an den Kunden).
// "support": regulärer Remote-Support – nur mit Kundenfreigabe.
export type SessionKind = "setup" | "support";

export function resolveSessionKind(tenant: {
  setup_status?: string | null;
  remote_support_enabled?: boolean | null;
}): { kind: SessionKind } | { error: string } {
  if (tenant.setup_status === "setup") return { kind: "setup" };
  if (tenant.remote_support_enabled) return { kind: "support" };
  return { error: "Kunde hat Remote-Zugriff nicht freigegeben." };
}
