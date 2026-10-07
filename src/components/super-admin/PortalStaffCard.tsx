import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Briefcase, Cpu, ShieldCheck, UserPlus, Pencil } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

type StaffRole = "super_admin" | "portal_technical" | "portal_commercial";
const ROLES: { role: StaffRole; label: string; desc: string; Icon: typeof Cpu }[] = [
  { role: "super_admin", label: "Admin", desc: "Vollzugriff und Benutzerverwaltung", Icon: ShieldCheck },
  { role: "portal_technical", label: "Technisch", desc: "Technische Infrastruktur, Support und Roadmap", Icon: Cpu },
  { role: "portal_commercial", label: "Kaufmännisch", desc: "Kunden, Abrechnung, Lizenzen und Preise", Icon: Briefcase },
];

interface Staff {
  user_id: string; email: string; name: string; roles: string[];
  is_blocked: boolean; last_sign_in_at: string | null; invited: boolean;
}

/**
 * Portal-Rollen der Teammitglieder. Serverseitig geschützt:
 * RPC portal_set_user_roles (nur super_admin, Selbst-/Letzter-Admin-Schutz),
 * Trigger guard_privileged_roles + guard_last_portal_admin auf user_roles.
 * Ändert ausschließlich Portal-Rollen – Partner-/Mandantenrollen bleiben unberührt.
 */
export default function PortalStaffCard() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [edit, setEdit] = useState<Staff | null>(null);
  const [draft, setDraft] = useState<StaffRole[]>([]);

  const { data: staff = [], isLoading, error } = useQuery({
    queryKey: ["portal-staff"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("portal_staff_overview" as any);
      if (error) throw error;
      return ((data ?? []) as Staff[]).sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email, "de"));
    },
  });

  const adminCount = staff.filter((s) => s.roles.includes("super_admin")).length;

  const save = useMutation({
    mutationFn: async ({ target, roles }: { target: Staff; roles: StaffRole[] }) => {
      const losesAdmin = target.roles.includes("super_admin") && !roles.includes("super_admin");
      if (losesAdmin && target.user_id === user?.id) throw new Error("Sie können sich die Portal-Admin-Rolle nicht selbst entziehen.");
      if (losesAdmin && adminCount <= 1) throw new Error("Der letzte verbleibende Portal-Admin kann nicht herabgestuft werden.");
      const { error } = await supabase.rpc("portal_set_user_roles" as any, { _target: target.user_id, _roles: roles });
      if (error) throw error;
      return target;
    },
    onSuccess: (t) => {
      toast({ title: `Die Portal-Rollen von ${t.name || t.email} wurden erfolgreich aktualisiert.` });
      setEdit(null);
      qc.invalidateQueries({ queryKey: ["portal-staff"] });
    },
    onError: (e: Error) => toast({ title: "Änderung fehlgeschlagen", description: e.message, variant: "destructive" }),
  });

  const add = useMutation({
    mutationFn: async () => {
      const mail = email.trim().toLowerCase();
      const { data: p, error } = await supabase.from("profiles").select("user_id").ilike("email", mail).maybeSingle();
      if (error) throw error;
      if (!p) throw new Error("Kein registrierter Benutzer mit dieser E-Mail-Adresse gefunden.");
      const existing = staff.find((s) => s.user_id === p.user_id);
      const roles = Array.from(new Set([...(existing?.roles ?? []), "portal_technical"])) as StaffRole[];
      const { error: e2 } = await supabase.rpc("portal_set_user_roles" as any, { _target: p.user_id, _roles: roles });
      if (e2) throw e2;
    },
    onSuccess: () => {
      setEmail("");
      toast({ title: "Portal-Benutzer hinzugefügt", description: "Rolle „Technisch“ vergeben – bei Bedarf anpassen." });
      qc.invalidateQueries({ queryKey: ["portal-staff"] });
    },
    onError: (e: Error) => toast({ title: "Hinzufügen fehlgeschlagen", description: e.message, variant: "destructive" }),
  });

  const openEdit = (s: Staff) => { setEdit(s); setDraft(s.roles.filter((r) => ROLES.some((x) => x.role === r)) as StaffRole[]); };
  const adminLocked = !!edit && edit.roles.includes("super_admin") && (edit.user_id === user?.id || adminCount <= 1);

  const status = (s: Staff) =>
    s.is_blocked ? <Badge variant="destructive">Deaktiviert</Badge>
      : s.invited ? <Badge variant="outline">Eingeladen</Badge>
      : <Badge variant="secondary">Aktiv</Badge>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Portal-Rollen</CardTitle>
        <CardDescription>Verwalte die Zugriffsrechte der AICONO Portal-Teammitglieder.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {ROLES.map(({ role, label, desc, Icon }) => (
            <div key={role} className="rounded-lg border p-3">
              <div className="flex items-center gap-2 font-medium"><Icon className="h-4 w-4 text-primary" />{label}</div>
              <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Technisch + Kaufmännisch ergibt die kombinierten Fachrechte, aber keinen Admin-Zugriff. Partner- und Kundenrollen werden hier nie verändert.
        </p>

        <form className="flex max-w-md gap-2" onSubmit={(e) => { e.preventDefault(); if (email.trim()) add.mutate(); }}>
          <Input type="email" placeholder="E-Mail eines registrierten Benutzers" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" disabled={add.isPending}><UserPlus className="mr-1 h-4 w-4" />Hinzufügen</Button>
        </form>

        {error && <p className="text-sm text-destructive">Teammitglieder konnten nicht geladen werden: {(error as Error).message}</p>}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>E-Mail</TableHead>
              <TableHead>Portal-Rollen</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Letzter Login</TableHead>
              <TableHead className="text-right">Aktion</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {staff.map((s) => (
              <TableRow key={s.user_id}>
                <TableCell className="font-medium">{s.name || "–"}</TableCell>
                <TableCell className="text-muted-foreground">{s.email}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {ROLES.filter((r) => s.roles.includes(r.role)).map((r) => (
                      <Badge key={r.role} variant={r.role === "super_admin" ? "default" : "secondary"}>{r.label}</Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>{status(s)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {s.last_sign_in_at ? new Date(s.last_sign_in_at).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) : "–"}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm" onClick={() => openEdit(s)}><Pencil className="mr-1 h-3 w-3" />Rollen bearbeiten</Button>
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && staff.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Noch keine Portal-Benutzer.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Portal-Rollen für {edit?.name || edit?.email}</DialogTitle>
            <DialogDescription>{edit?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {ROLES.map((r) => {
              const locked = r.role === "super_admin" && adminLocked;
              return (
                <div key={r.role} className="flex items-start gap-3">
                  <Checkbox
                    id={`role-${r.role}`}
                    checked={draft.includes(r.role)}
                    disabled={locked}
                    onCheckedChange={(v) => setDraft((d) => (v ? [...d, r.role] : d.filter((x) => x !== r.role)))}
                  />
                  <Label htmlFor={`role-${r.role}`} className="leading-tight">
                    {r.role === "super_admin" ? "Portal-Admin" : r.label}
                    <span className="block text-xs font-normal text-muted-foreground">
                      {locked ? (edit?.user_id === user?.id ? "Eigene Admin-Rolle kann nicht entzogen werden." : "Letzter Portal-Admin – kann nicht herabgestuft werden.") : r.desc}
                    </span>
                  </Label>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Abbrechen</Button>
            <Button disabled={save.isPending} onClick={() => edit && save.mutate({ target: edit, roles: draft })}>Änderungen speichern</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
