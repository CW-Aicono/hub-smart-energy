import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, FileDown, Loader2, Mail, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { buildAiconoInvoicePdf, type AiconoBillingSettings, type InvoiceRecipient } from "@/lib/aiconoInvoicePdf";
import { ALL_MODULES } from "@/hooks/useTenantModules";

const db = supabase as any;

export function useAiconoBillingSettings() {
  return useQuery({
    queryKey: ["aicono-billing-settings"],
    queryFn: async () => {
      const { data, error } = await db.from("aicono_billing_settings").select("*").eq("id", true).maybeSingle();
      if (error) throw error;
      return (data ?? null) as (AiconoBillingSettings & Record<string, any>) | null;
    },
  });
}

async function loadRecipient(inv: any): Promise<{ recipient: InvoiceRecipient; email: string | null }> {
  if (inv.partner_id) {
    const { data: p } = await db.from("partners").select("name, billing_address, contact_email").eq("id", inv.partner_id).maybeSingle();
    const a = (p?.billing_address ?? {}) as Record<string, any>;
    return {
      recipient: {
        name: a.company || a.name || p?.name || "Partner",
        contact: a.contact || null,
        street: [a.street, a.house_number].filter(Boolean).join(" ") || a.address || null,
        postalCity: [a.postal_code ?? a.zip, a.city].filter(Boolean).join(" ") || null,
        country: a.country || null,
      },
      email: a.email || p?.contact_email || null,
    };
  }
  const { data: t } = await db.from("tenants").select("name, contact_person, street, house_number, address, postal_code, city, contact_email").eq("id", inv.tenant_id).maybeSingle();
  return {
    recipient: {
      name: t?.name ?? "Kunde",
      contact: t?.contact_person ? `z. Hd. ${t.contact_person}` : null,
      street: [t?.street, t?.house_number].filter(Boolean).join(" ") || t?.address || null,
      postalCity: [t?.postal_code, t?.city].filter(Boolean).join(" ") || null,
    },
    email: t?.contact_email ?? null,
  };
}

/** Schreibt eine Rechnung fest (fortlaufende Nummer, Datum, Fälligkeit). Danach ist der Inhalt unveränderlich. */
async function ensureIssued(inv: any): Promise<any> {
  if (inv.issued_at) return inv;
  const ok = window.confirm(
    "Rechnung jetzt festschreiben?\n\nSie erhält eine fortlaufende Rechnungsnummer und Rechnungsdatum. Danach können Positionen und Beträge nicht mehr geändert werden – Korrekturen nur noch per Storno.",
  );
  if (!ok) return null;
  const { data, error } = await db.rpc("issue_aicono_invoice", { p_invoice_id: inv.id });
  if (error) throw error;
  return { ...inv, ...data };
}

async function makePdf(inv: any, settings: AiconoBillingSettings) {
  const { recipient, email } = await loadRecipient(inv);
  const doc = await buildAiconoInvoicePdf({ settings, recipient, invoice: inv });
  return { doc, email };
}

export function canUseAiconoInvoice(inv: any) {
  return inv.document_type !== "subscription_notice" && Number(inv.amount) > 0 && (inv.issued_at || inv.status !== "voided");
}

export function AiconoInvoiceRowActions({ inv }: { inv: any }) {
  const qc = useQueryClient();
  const { data: settings } = useAiconoBillingSettings();
  const [busy, setBusy] = useState<"pdf" | "mail" | null>(null);
  const [mailOpen, setMailOpen] = useState(false);
  const [mailTo, setMailTo] = useState("");
  const [msg, setMsg] = useState("");
  const [issued, setIssued] = useState<any>(null);

  if (!canUseAiconoInvoice(inv)) return <span className="text-xs text-muted-foreground">—</span>;

  const refresh = () => qc.invalidateQueries({ queryKey: ["super-admin-invoices"] });

  const onPdf = async () => {
    if (!settings) return toast.error("Rechnungsabsender fehlt");
    setBusy("pdf");
    try {
      const cur = await ensureIssued(inv);
      if (!cur) return;
      const { doc } = await makePdf(cur, settings);
      doc.save(`Rechnung_${cur.invoice_number}.pdf`);
      refresh();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };

  const openMail = async () => {
    if (!settings) return toast.error("Rechnungsabsender fehlt");
    setBusy("mail");
    try {
      const cur = await ensureIssued(inv);
      if (!cur) return;
      setIssued(cur);
      const { email } = await loadRecipient(cur);
      setMailTo(cur.emailed_to || email || "");
      setMsg("");
      setMailOpen(true);
      refresh();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };

  const sendMail = async () => {
    if (!issued || !settings) return;
    setBusy("mail");
    try {
      const { doc } = await makePdf(issued, settings);
      const pdf_base64 = (doc.output("datauristring") as string).split(",")[1];
      const { data, error } = await supabase.functions.invoke("send-aicono-invoice", { body: { invoice_id: issued.id, to: mailTo, message: msg, pdf_base64 } });
      if (error || !data?.success) throw new Error(data?.error || error?.message || "Versand fehlgeschlagen");
      toast.success(`Rechnung ${issued.invoice_number} an ${mailTo} gesendet`);
      setMailOpen(false);
      refresh();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };

  return (
    <div className="flex items-center justify-center gap-1">
      <Button size="sm" variant="ghost" title="PDF (AICONO GmbH)" disabled={!!busy} onClick={onPdf}>
        {busy === "pdf" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
      </Button>
      <Button size="sm" variant="ghost" title={inv.emailed_at ? `Gesendet an ${inv.emailed_to} am ${new Date(inv.emailed_at).toLocaleString("de-DE")}` : "Per E-Mail senden"} disabled={!!busy || inv.status === "voided"} onClick={openMail}>
        {busy === "mail" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className={`h-3.5 w-3.5 ${inv.emailed_at ? "text-primary" : ""}`} />}
      </Button>
      <Dialog open={mailOpen} onOpenChange={setMailOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechnung {issued?.invoice_number} per E-Mail senden</DialogTitle>
            <DialogDescription>Das PDF im AICONO-Branding wird als Anhang verschickt.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Empfänger</Label><Input type="email" value={mailTo} onChange={(e) => setMailTo(e.target.value)} /></div>
            <div className="space-y-1"><Label>Zusätzliche Nachricht (optional)</Label><Textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMailOpen(false)}>Abbrechen</Button>
            <Button disabled={!mailTo || busy === "mail"} onClick={sendMail}>{busy === "mail" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Senden</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type Line = { label: string; quantity: string; unit_price: string };
const num = (s: string) => Number(String(s).replace(/\./g, "").replace(",", ".")) || 0;

export function ManualInvoiceDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<"tenant" | "partner">("tenant");
  const [tenantId, setTenantId] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [lines, setLines] = useState<Line[]>([{ label: "", quantity: "1", unit_price: "" }]);
  const [saving, setSaving] = useState(false);

  const { data: tenants = [] } = useQuery({
    queryKey: ["manual-invoice-tenants"], enabled: open,
    queryFn: async () => (await db.from("tenants").select("id, name, partner_id").is("deleted_at", null).order("name")).data ?? [],
  });
  const { data: partners = [] } = useQuery({
    queryKey: ["manual-invoice-partners"], enabled: open,
    queryFn: async () => (await db.from("partners").select("id, name").order("name")).data ?? [],
  });

  const { data: pkgs = [] } = useQuery({
    queryKey: ["manual-invoice-packages"], enabled: open,
    queryFn: async () => (await db.from("pricing_packages").select("code, name, uvp, ek, active, sort").eq("active", true).order("sort")).data ?? [],
  });
  const { data: modPrices = [] } = useQuery({
    queryKey: ["manual-invoice-module-prices"], enabled: open,
    queryFn: async () => (await db.from("module_prices").select("module_code, price_monthly, partner_price_monthly")).data ?? [],
  });
  // Prefill only: price is the partner purchase price (EK) for partner invoices, otherwise the customer price; always editable.
  const isPartner = target === "partner";
  const catalog = [
    ...(pkgs as any[]).map((p) => ({ key: `pkg:${p.code}`, group: "Paket", label: p.name, price: Number(isPartner ? p.ek : p.uvp) || 0 })),
    ...ALL_MODULES.map((m) => {
      const mp = (modPrices as any[]).find((x) => x.module_code === m.code);
      return { key: `mod:${m.code}`, group: "Modul", label: m.label, price: Number(isPartner ? mp?.partner_price_monthly : mp?.price_monthly) || 0 };
    }),
  ];

  const partnerTenants = (tenants as any[]).filter((t) => t.partner_id === partnerId);
  const net = lines.reduce((s, l) => s + Math.round(num(l.quantity) * num(l.unit_price) * 100) / 100, 0);

  const save = async () => {
    if (!tenantId) return toast.error(target === "partner" ? "Bitte Partner und zugehörigen Kunden wählen" : "Bitte Kunden wählen");
    const p_lines = lines.filter((l) => l.label.trim()).map((l) => ({ label: l.label.trim(), quantity: num(l.quantity), unit_price: num(l.unit_price) }));
    if (p_lines.length === 0) return toast.error("Mindestens eine Position angeben");
    setSaving(true);
    const { error } = await db.rpc("create_manual_aicono_invoice", {
      p_tenant_id: tenantId, p_partner_id: target === "partner" ? partnerId : null, p_period_start: from, p_period_end: to || from, p_lines,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Rechnungsentwurf angelegt");
    qc.invalidateQueries({ queryKey: ["super-admin-invoices"] });
    setOpen(false); setLines([{ label: "", quantity: "1", unit_price: "" }]); setTenantId(""); setPartnerId("");
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" />Neue Rechnung</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Freie Rechnung erstellen</DialogTitle>
            <DialogDescription>Wird als Entwurf angelegt. Preise netto, die Umsatzsteuer wird im PDF ausgewiesen.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Rechnung an</Label>
                <Select value={target} onValueChange={(v: any) => { setTarget(v); setTenantId(""); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="tenant">Kunde</SelectItem><SelectItem value="partner">Partner</SelectItem></SelectContent>
                </Select>
              </div>
              {target === "partner" && (
                <div className="space-y-1">
                  <Label>Partner</Label>
                  <Select value={partnerId} onValueChange={(v) => { setPartnerId(v); setTenantId(""); }}>
                    <SelectTrigger><SelectValue placeholder="Partner wählen" /></SelectTrigger>
                    <SelectContent>{(partners as any[]).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1 col-span-2">
                <Label>{target === "partner" ? "Betrifft Kunde des Partners" : "Kunde"}</Label>
                <Select value={tenantId} onValueChange={setTenantId}>
                  <SelectTrigger><SelectValue placeholder="Kunde wählen" /></SelectTrigger>
                  <SelectContent>{(target === "partner" ? partnerTenants : (tenants as any[])).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Leistung von</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
              <div className="space-y-1"><Label>Leistung bis</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            </div>
            <div className="space-y-2">
              <Label>Positionen</Label>
              {lines.map((l, i) => (
                <div key={i} className="flex gap-2">
                  <Select value="" onValueChange={(v) => { const o = catalog.find((c) => c.key === v); if (o) setLines((ls) => ls.map((x, j) => j === i ? { ...x, label: o.label, unit_price: o.price.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }) } : x)); }}>
                    <SelectTrigger className="w-40"><SelectValue placeholder="Modul/Paket" /></SelectTrigger>
                    <SelectContent>
                      {catalog.map((c) => <SelectItem key={c.key} value={c.key}>{c.group}: {c.label} ({c.price.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €)</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input className="flex-1" placeholder="Bezeichnung" value={l.label} onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
                  <Input className="w-20" placeholder="Menge" value={l.quantity} onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))} />
                  <Input className="w-28" placeholder="Preis €" value={l.unit_price} onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, unit_price: e.target.value } : x))} />
                  <Button variant="ghost" size="icon" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button variant="ghost" size="sm" onClick={() => setLines((ls) => [...ls, { label: "", quantity: "1", unit_price: "" }])}><Plus className="h-4 w-4 mr-1" />Position</Button>
              <p className="text-sm text-right">Summe netto: <strong>{net.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</strong></p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Abbrechen</Button>
            <Button disabled={saving} onClick={save}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Entwurf anlegen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const FIELDS: [string, string][] = [
  ["company_name", "Firma"], ["street", "Straße"], ["postal_code", "PLZ"], ["city", "Ort"],
  ["register_court", "Registergericht"], ["register_number", "Handelsregister"], ["managing_director", "Geschäftsführer"],
  ["vat_id", "USt-IdNr."], ["tax_number", "Steuernummer"], ["bank_name", "Bank"], ["iban", "IBAN"], ["bic", "BIC"],
  ["email", "E-Mail"], ["phone", "Telefon"], ["website", "Website"], ["payment_terms_days", "Zahlungsziel (Tage)"],
  ["vat_rate", "USt.-Satz (%)"], ["number_prefix", "Nummernpräfix"],
];

export function BillingSenderDialog() {
  const qc = useQueryClient();
  const { data } = useAiconoBillingSettings();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const payload: Record<string, any> = { id: true };
    for (const [k] of FIELDS) payload[k] = form[k] === "" ? null : form[k];
    payload.footer_note = form.footer_note || null;
    payload.payment_terms_days = Number(form.payment_terms_days) || 14;
    payload.vat_rate = Number(String(form.vat_rate).replace(",", ".")) || 19;
    payload.number_prefix = form.number_prefix || "AIC";
    payload.company_name = form.company_name || "AICONO GmbH";
    payload.updated_at = new Date().toISOString();
    const { error } = await db.from("aicono_billing_settings").upsert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Rechnungsabsender gespeichert");
    qc.invalidateQueries({ queryKey: ["aicono-billing-settings"] });
    setOpen(false);
  };

  return (
    <>
      <Button variant="outline" onClick={() => { setForm({ ...(data ?? {}) }); setOpen(true); }}><Building2 className="h-4 w-4 mr-2" />Rechnungsabsender</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Rechnungsabsender AICONO GmbH</DialogTitle>
            <DialogDescription>Pflichtangaben für Briefkopf und Fußzeile. Änderungen gelten nur für neu erzeugte PDFs.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {FIELDS.map(([k, l]) => (
              <div key={k} className="space-y-1"><Label>{l}</Label><Input value={form[k] ?? ""} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} /></div>
            ))}
            <div className="space-y-1 col-span-2"><Label>Zusatztext unter der Rechnung</Label><Textarea rows={2} value={form.footer_note ?? ""} onChange={(e) => setForm((f) => ({ ...f, footer_note: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Abbrechen</Button>
            <Button disabled={saving} onClick={save}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Speichern</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
