const DEFAULT_FROM = "info@aicono.org";

export function resendFrom(displayName: string): string {
  const email = Deno.env.get("RESEND_FROM_EMAIL") ?? DEFAULT_FROM;
  return `${displayName} <${email}>`;
}
