// deno-lint-ignore-file no-explicit-any
import { safeAuthRedirect } from "./appOrigin.ts";

/**
 * Erzeugt einen scanner-sicheren Einladungs-/Reset-Link.
 *
 * In der E-Mail steht nur ein Verweis auf unsere eigene Seite (/accept-invite?t=…).
 * Der eigentliche einmalige Anmeldelink wird erst erzeugt, wenn der Mensch dort
 * auf „Passwort festlegen" klickt (activate-invited-user → getInviteLink).
 * So können Mail-Scanner (z. B. Microsoft Defender) den Link nicht verbrauchen,
 * und die Gültigkeit von 7 Tagen (invite_tokens.expires_at) stimmt wirklich.
 *
 * In `action_link` speichern wir nur die geprüfte Ziel-URL (/set-password[?next=…]).
 */
export async function createSafeInviteLink(
  supabase: any,
  email: string,
  requestedRedirect: string | null | undefined,
  originHeader: string | null | undefined,
  opts: { mode?: "invite" | "reset"; invalidateOld?: boolean } = {},
): Promise<string> {
  const redirect = safeAuthRedirect(requestedRedirect, originHeader, Deno.env.get("APP_ORIGIN"));
  const emailLower = email.trim().toLowerCase();

  if (opts.invalidateOld !== false) {
    // Ältere, noch offene Links dieser Person sperren – nur der neueste gilt.
    await supabase.from("invite_tokens").update({ used_at: new Date().toISOString() })
      .ilike("email", emailLower).is("used_at", null);
  }

  const { data: row, error } = await supabase.from("invite_tokens")
    .insert({ action_link: redirect, email: emailLower })
    .select("id").single();
  if (error || !row) throw new Error("Einladungslink konnte nicht gespeichert werden.");

  const origin = new URL(redirect).origin;
  return `${origin}/accept-invite?t=${row.id}${opts.mode === "reset" ? "&mode=reset" : ""}`;
}

/** Ermittelt die Ziel-URL (/set-password…) aus einem gespeicherten invite_tokens.action_link. */
export function redirectFromStoredLink(stored: string | null | undefined): string {
  if (stored) {
    try {
      const u = new URL(stored);
      // Altes Format: echter Recovery-Link mit redirect_to-Parameter
      const rt = u.searchParams.get("redirect_to");
      if (rt) return safeAuthRedirect(rt, null, Deno.env.get("APP_ORIGIN"));
      // Neues Format: direkt die Ziel-URL
      return safeAuthRedirect(stored, null, Deno.env.get("APP_ORIGIN"));
    } catch { /* ignore */ }
  }
  return safeAuthRedirect(null, null, Deno.env.get("APP_ORIGIN"));
}
