import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ALL_MODULES } from "@/hooks/useTenantModules";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BadgePercent, Check, X } from "lucide-react";
import { toast } from "sonner";

export interface DiscountRequest {
  id: string; partner_id: string; tenant_id: string | null; module_codes: string[]; approved_module_codes: string[] | null;
  discount_type: "percent" | "absolute"; value: number; valid_from: string; duration_months: number | null;
  reason: string | null; status: "pending" | "approved" | "rejected" | "cancelled"; decision_note: string | null;
  created_at: string; decided_at: string | null;
}

const modLabel = (c: string) => ALL_MODULES.find((m) => m.code === c)?.label ?? c;
const fmtValue = (r: DiscountRequest) =>
  r.discount_type === "percent"
    ? `${Number(r.value).toLocaleString("de-DE", { maximumFractionDigits: 2 })} %`
    : `${Number(r.value).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € / Monat`;
const fmtDate = (d: string) => new Date(d).toLocaleDateString("de-DE");
const STATUS: Record<DiscountRequest["status"], { label: string; variant: "secondary" | "default" | "destructive" | "outline" }> = {
  pending: { label: "Offen", variant: "secondary" },
  approved: { label: "Freigegeben", variant: "default" },
  rejected: { label: "Abgelehnt", variant: "destructive" },
  cancelled: { label: "Zurückgezogen", variant: "outline" },
};

function ModuleList({ r }: { r: DiscountRequest }) {
  return (
    <div className="flex flex-wrap gap-1">
      {r.module_codes.map((c) => {
        const declined = r.status === "approved" && r.approved_module_codes && !r.approved_module_codes.includes(c);
        return <Badge key={c} variant="outline" className={declined ? "line-through opacity-60" : ""}>{modLabel(c)}</Badge>;
      })}
    </div>
  );
}

/** Partner-Portal: Rabatt bei AICONO anfragen und Status verfolgen. */
export function PartnerDiscountRequestsCard({ partnerId, canRequest }: { partnerId: string; canRequest: boolean }) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [tenant, setTenant] = useState("__all");
  const [mods, setMods] = useState<string[]>([]);
  const [type, setType] = useState<"percent" | "absolute">("percent");
  const [value, setValue] = useState("");
  const [from, setFrom] = useState(today);
  const [months, setMonths] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: portfolio = [] } = useQuery({
    queryKey: ["partner-portfolio", partnerId],
    queryFn: async () => {
      const { data, error } = await supabase.from("partner_modules").select("module_code").eq("partner_id", partnerId);
      if (error) throw error;
      return (data ?? []).map((r) => r.module_code);
    },
  });
  const { data: tenants = [] } = useQuery({
    queryKey: ["partner-request-tenants", partnerId],
    queryFn: async () => {
      const { data, error } = await supabase.from("tenants").select("id, name").eq("partner_id", partnerId).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: requests = [], error: listError } = useQuery({
    queryKey: ["discount-requests", partnerId],
    queryFn: async () => {
      const { data, error } = await supabase.from("partner_discount_requests").select("*").eq("partner_id", partnerId).order("created_at", { ascending: false });
      if (error) throw error;
      return data as DiscountRequest[];
    },
  });
  const tenantName = (id: string | null) => (id ? tenants.find((t) => t.id === id)?.name ?? "–" : "Alle meine Kunden");
  const options = ALL_MODULES.filter((m) => !("alwaysOn" in m) && portfolio.includes(m.code));

  const submit = async () => {
    const v = parseFloat(value.replace(",", "."));
    const m = months ? parseInt(months, 10) : null;
    if (!mods.length) return toast.error("Bitte mindestens ein Modul wählen");
    if (!(v > 0) || (type === "percent" && v > 100)) return toast.error(type === "percent" ? "Prozent zwischen 0 und 100 eingeben" : "Betrag größer 0 eingeben");
    if (m !== null && !(m >= 1 && m <= 120)) return toast.error("Laufzeit 1 bis 120 Monate");
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("partner_discount_requests").insert({
        partner_id: partnerId, tenant_id: tenant === "__all" ? null : tenant, module_codes: mods,
        discount_type: type, value: v, valid_from: from, duration_months: m,
        reason: reason.trim().slice(0, 500) || null, requested_by: user!.id,
      });
      if (error) throw error;
      toast.success("Rabatt-Anfrage an AICONO gesendet");
      setMods([]); setValue(""); setMonths(""); setReason("");
      qc.invalidateQueries({ queryKey: ["discount-requests", partnerId] });
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  const cancel = async (id: string) => {
    const { error } = await supabase.from("partner_discount_requests").update({ status: "cancelled" }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["discount-requests", partnerId] });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><BadgePercent className="h-5 w-5" />Rabatt bei AICONO anfragen</CardTitle>
        <CardDescription>
          Ihre Anfrage geht an AICONO. Nach der Freigabe gilt der Rabatt für die freigegebenen Module – für einen Kunden oder für alle Ihre Kunden.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {canRequest && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Kunde</Label>
              <Select value={tenant} onValueChange={setTenant}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Alle meine Kunden</SelectItem>
                  {tenants.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label>Art</Label>
                <Select value={type} onValueChange={(v) => setType(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Prozent</SelectItem>
                    <SelectItem value="absolute">€ pro Monat</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Höhe</Label>
                <Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={type === "percent" ? "z. B. 10" : "z. B. 5,00"} />
              </div>
              <div className="space-y-2">
                <Label>Gültig ab</Label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Laufzeit (Monate)</Label>
                <Input inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value)} placeholder="unbefristet" />
              </div>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Module ({mods.length} gewählt)</Label>
              {options.length === 0 ? (
                <p className="text-sm text-muted-foreground">In Ihrem Partner-Portfolio sind noch keine Module freigegeben.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {options.map((m) => (
                    <label key={m.code} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={mods.includes(m.code)} onCheckedChange={(v) => setMods((p) => v ? [...p, m.code] : p.filter((c) => c !== m.code))} />
                      {m.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Begründung (optional)</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="z. B. Großprojekt mit 20 Standorten" />
            </div>
            <div className="md:col-span-2"><Button onClick={submit} disabled={busy}>Anfrage senden</Button></div>
          </div>
        )}
        {listError && <p className="text-sm text-destructive">Anfragen konnten nicht geladen werden: {(listError as Error).message}</p>}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Datum</TableHead><TableHead>Kunde</TableHead><TableHead>Module</TableHead>
              <TableHead>Rabatt</TableHead><TableHead>Status</TableHead><TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{fmtDate(r.created_at)}</TableCell>
                <TableCell>{tenantName(r.tenant_id)}</TableCell>
                <TableCell><ModuleList r={r} /></TableCell>
                <TableCell>{fmtValue(r)}<div className="text-xs text-muted-foreground">ab {fmtDate(r.valid_from)}{r.duration_months ? `, ${r.duration_months} Monate` : ""}</div></TableCell>
                <TableCell>
                  <Badge variant={STATUS[r.status].variant}>{STATUS[r.status].label}</Badge>
                  {r.decision_note && <div className="text-xs text-muted-foreground mt-1">{r.decision_note}</div>}
                </TableCell>
                <TableCell>{canRequest && r.status === "pending" && <Button size="sm" variant="ghost" onClick={() => cancel(r.id)}>Zurückziehen</Button>}</TableCell>
              </TableRow>
            ))}
            {requests.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Noch keine Anfragen.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/** AICONO Portal: Rabatt-Anfragen der Partner freigeben (ganz oder für einzelne Module) oder ablehnen. */
export function PortalDiscountRequestsCard() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, error } = useQuery({
    queryKey: ["portal-discount-requests"],
    queryFn: async () => {
      const { data: reqs, error } = await supabase.from("partner_discount_requests").select("*").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      const pIds = [...new Set((reqs ?? []).map((r) => r.partner_id))];
      const tIds = [...new Set((reqs ?? []).map((r) => r.tenant_id).filter(Boolean))] as string[];
      const [{ data: ps }, { data: ts }] = await Promise.all([
        pIds.length ? supabase.from("partners").select("id, name").in("id", pIds) : Promise.resolve({ data: [] as any[] }),
        tIds.length ? supabase.from("tenants").select("id, name").in("id", tIds) : Promise.resolve({ data: [] as any[] }),
      ]);
      return { reqs: (reqs ?? []) as DiscountRequest[], partners: ps ?? [], tenants: ts ?? [] };
    },
  });
  const reqs = data?.reqs ?? [];
  const pending = reqs.filter((r) => r.status === "pending");
  const done = reqs.filter((r) => r.status !== "pending").slice(0, 20);
  const pName = (id: string) => data?.partners.find((p: any) => p.id === id)?.name ?? "–";
  const tName = (id: string | null) => (id ? data?.tenants.find((t: any) => t.id === id)?.name ?? "–" : "Alle Kunden des Partners");

  const decide = async (r: DiscountRequest, decision: "approve" | "reject") => {
    const moduleCodes = selected[r.id] ?? r.module_codes;
    if (decision === "approve" && !moduleCodes.length) return toast.error("Mindestens ein Modul freigeben oder ablehnen");
    setBusyId(r.id);
    try {
      const { data: res, error } = await supabase.functions.invoke("portal-decide-discount-request", {
        body: { requestId: r.id, decision, moduleCodes, note: notes[r.id]?.trim() || null },
      });
      if (error || !res?.success) throw new Error(res?.error ?? error?.message ?? "Fehler");
      toast.success(decision === "approve" ? `Rabatt freigegeben (${res.created} Kundenrabatte angelegt)` : "Anfrage abgelehnt");
      qc.invalidateQueries({ queryKey: ["portal-discount-requests"] });
    } catch (e: any) { toast.error(e.message); } finally { setBusyId(null); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><BadgePercent className="h-5 w-5" />Rabatt-Anfragen von Partnern ({pending.length} offen)</CardTitle>
        <CardDescription>Freigabe ganz oder nur für einzelne Module. Bei Freigabe werden die Rabatte automatisch beim Kunden hinterlegt und in der Abrechnung berücksichtigt.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-destructive">Anfragen konnten nicht geladen werden: {(error as Error).message}</p>}
        {pending.length === 0 && <p className="text-sm text-muted-foreground">Keine offenen Anfragen.</p>}
        {pending.map((r) => {
          const sel = selected[r.id] ?? r.module_codes;
          return (
            <div key={r.id} className="rounded-lg border p-4 space-y-3">
              <div className="flex flex-wrap justify-between gap-2">
                <div>
                  <div className="font-medium">{pName(r.partner_id)} → {tName(r.tenant_id)}</div>
                  <div className="text-sm text-muted-foreground">
                    {fmtValue(r)} ab {fmtDate(r.valid_from)}{r.duration_months ? `, ${r.duration_months} Monate` : ", unbefristet"} · angefragt am {fmtDate(r.created_at)}
                  </div>
                  {r.reason && <div className="text-sm mt-1">„{r.reason}“</div>}
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {r.module_codes.map((c) => (
                  <label key={c} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={sel.includes(c)} onCheckedChange={(v) => setSelected((p) => ({ ...p, [r.id]: v ? [...sel, c] : sel.filter((x) => x !== c) }))} />
                    {modLabel(c)}
                  </label>
                ))}
              </div>
              <Input placeholder="Notiz an den Partner (optional)" value={notes[r.id] ?? ""} onChange={(e) => setNotes((p) => ({ ...p, [r.id]: e.target.value }))} maxLength={500} />
              <div className="flex gap-2">
                <Button size="sm" disabled={busyId === r.id || !sel.length} onClick={() => decide(r, "approve")}>
                  <Check className="mr-1 h-4 w-4" />{sel.length === r.module_codes.length ? "Freigeben" : `${sel.length} von ${r.module_codes.length} Modulen freigeben`}
                </Button>
                <Button size="sm" variant="outline" disabled={busyId === r.id} onClick={() => decide(r, "reject")}><X className="mr-1 h-4 w-4" />Ablehnen</Button>
              </div>
            </div>
          );
        })}
        {done.length > 0 && (
          <Table>
            <TableHeader><TableRow><TableHead>Entschieden</TableHead><TableHead>Partner / Kunde</TableHead><TableHead>Module</TableHead><TableHead>Rabatt</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {done.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{fmtDate(r.decided_at ?? r.created_at)}</TableCell>
                  <TableCell>{pName(r.partner_id)}<div className="text-xs text-muted-foreground">{tName(r.tenant_id)}</div></TableCell>
                  <TableCell><ModuleList r={r} /></TableCell>
                  <TableCell>{fmtValue(r)}</TableCell>
                  <TableCell><Badge variant={STATUS[r.status].variant}>{STATUS[r.status].label}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
