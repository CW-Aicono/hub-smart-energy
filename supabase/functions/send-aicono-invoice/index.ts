// Versendet eine in AICONO festgeschriebene Rechnung (PDF im AICONO-Branding) per E-Mail.
// Nur Portal-Admins bzw. die kaufmännische Portal-Rolle. Entwürfe werden nie versendet.
import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";
import { getCorsHeaders } from "../_shared/cors.ts";
import { resendFrom } from "../_shared/resend-from.ts";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!token) return json({ error: "Nicht angemeldet." }, 401);
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return json({ error: "Nicht angemeldet." }, 401);
    const { data: canWrite } = await admin.rpc("can_portal_write", { _uid: user.id, _area: "commercial" });
    if (!canWrite) return json({ error: "Keine Berechtigung." }, 403);

    const body = await req.json().catch(() => ({}));
    const invoiceId = typeof body.invoice_id === "string" ? body.invoice_id : "";
    const to = typeof body.to === "string" ? body.to.trim() : "";
    const pdf = typeof body.pdf_base64 === "string" ? body.pdf_base64 : "";
    const message = typeof body.message === "string" ? body.message.slice(0, 2000) : "";
    if (!/^[0-9a-f-]{36}$/i.test(invoiceId)) return json({ error: "Ungültige Rechnung." }, 400);
    if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(to) || to.length > 254) return json({ error: "Ungültige E-Mail-Adresse." }, 400);
    if (!pdf || pdf.length > 8_000_000) return json({ error: "PDF fehlt oder ist zu groß." }, 400);

    const { data: inv, error } = await admin.from("tenant_invoices").select("id, invoice_number, issued_at, status, due_date").eq("id", invoiceId).maybeSingle();
    if (error) return json({ error: error.message }, 400);
    if (!inv) return json({ error: "Rechnung nicht gefunden." }, 404);
    if (!inv.issued_at) return json({ error: "Rechnung ist noch nicht festgeschrieben." }, 400);
    if (inv.status === "voided") return json({ error: "Stornierte Rechnungen werden nicht versendet." }, 400);

    const key = Deno.env.get("RESEND_API_KEY");
    if (!key) return json({ error: "E-Mail-Versand ist nicht eingerichtet." }, 500);
    const resend = new Resend(key);
    const due = inv.due_date ? new Date(inv.due_date + "T00:00:00").toLocaleDateString("de-DE") : "";
    const html = `<p>Guten Tag,</p><p>anbei erhalten Sie unsere Rechnung <strong>${esc(inv.invoice_number)}</strong>${due ? ` (fällig am ${due})` : ""}.</p>${message ? `<p>${esc(message).replace(/\n/g, "<br>")}</p>` : ""}<p>Mit freundlichen Grüßen<br>AICONO GmbH</p>`;
    const { error: sendErr } = await resend.emails.send({
      from: resendFrom("AICONO GmbH"),
      to: [to],
      subject: `Rechnung ${inv.invoice_number} – AICONO GmbH`,
      html,
      attachments: [{ filename: `Rechnung_${inv.invoice_number}.pdf`, content: pdf }],
    });
    if (sendErr) return json({ error: "Versand fehlgeschlagen: " + (sendErr as any).message }, 502);

    await admin.from("tenant_invoices").update({ emailed_at: new Date().toISOString(), emailed_to: to }).eq("id", invoiceId);
    return json({ success: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
