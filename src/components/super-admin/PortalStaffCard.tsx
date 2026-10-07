import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Briefcase, Cpu, ShieldCheck, UserPlus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

type StaffRole = "super_admin" | "portal_commercial" | "portal_technical";
const ROLES: { role: StaffRole; label: string; Icon: typeof Cpu }[] = [
  { role: "super_admin", label: "Admin", Icon: ShieldCheck },
  { role: "portal_commercial", label: "Kaufmännisch", Icon: Briefcase },
  { role: "portal_technical", label: "Technisch", Icon: Cpu },
];

/**
 * Verwaltung der Portal-Benutzer (Kaufmännisch / Technisch).
 * Server-seitig geschützt: RLS auf user_roles + Trigger guard_privileged_roles
 * (nur Portal-Admins dürfen Portal-Rollen ändern).
 */
export default function PortalStaffCard() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const { user } = useAuth();

  const { data: staff = [], isLoading } = useQuery({
    queryKey: ["portal-staff"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["super_admin", "portal_commercial", "portal_technical"] as any);
      if (error) throw error;
      const ids = Array.from(new Set((data ?? []).map((r) => r.user_id)));
      if (!ids.length) return [];
      const { data: profiles } = await supabase.from("profiles").select("user_id, email, contact_person").in("user_id", ids);
      return ids.map((id) => {
        const p = profiles?.find((x) => x.user_id === id);
        return {
          user_id: id,
          email: p?.email ?? "–",
          name: p?.contact_person ?? "–",
          roles: (data ?? []).filter((r) => r.user_id === id).map((r) => r.role as string),
        };
      });
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ userId, role, on }: { userId: string; role: StaffRole; on: boolean }) => {
      if (!on && role === "super_admin") {
        if (userId === user?.id) throw new Error("Sie können sich die Admin-Rolle nicht selbst entziehen.");
        if (adminCount <= 1) throw new Error("Der letzte Portal-Admin kann nicht entfernt werden.");
      }
      const res = on
        ? await supabase.from("user_roles").insert({ user_id: userId, role: role as any })
        : await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role as any);
      if (res.error) throw res.error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["portal-staff"] }),
    onError: (e: Error) => toast({ title: "Änderung fehlgeschlagen", description: e.message, variant: "destructive" }),
  });

  const adminCount = staff.filter((s) => s.roles.includes("super_admin")).length;

  const add = useMutation({
    mutationFn: async () => {
      const mail = email.trim().toLowerCase();
      const { data: p, error } = await supabase.from("profiles").select("user_id").ilike("email", mail).maybeSingle();
      if (error) throw error;
      if (!p) throw new Error("Kein registrierter Benutzer mit dieser E-Mail-Adresse gefunden.");
      const { error: e2 } = await supabase.from("user_roles").insert({ user_id: p.user_id, role: "portal_technical" as any });
      if (e2 && !e2.message.includes("duplicate")) throw e2;
    },
    onSuccess: () => {
      setEmail("");
      toast({ title: "Portal-Benutzer hinzugefügt", description: "Rolle „Technisch“ vergeben – bei Bedarf anpassen." });
      qc.invalidateQueries({ queryKey: ["portal-staff"] });
    },
    onError: (e: Error) => toast({ title: "Hinzufügen fehlgeschlagen", description: e.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Portal-Benutzer ({isLoading ? "…" : staff.length})</CardTitle>
        <CardDescription>
          Kaufmännisch: Abrechnung, Lizenzen, Modulpreise; bearbeitet Kunden/Partner, liest Roadmap.
          Technisch: Gateways, Templates, OCPP, Monitoring, Support; bearbeitet Roadmap, liest Kunden/Partner.
          Admin: darf alles, auch Portal-Rollen vergeben. Mehrere Rollen pro Person sind möglich.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="flex max-w-md gap-2"
          onSubmit={(e) => { e.preventDefault(); if (email.trim()) add.mutate(); }}
        >
          <Input type="email" placeholder="E-Mail eines registrierten Benutzers" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" disabled={add.isPending}><UserPlus className="mr-1 h-4 w-4" />Hinzufügen</Button>
        </form>
        <Table>
          <TableHeader>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>E-Mail</TableCell>
              {ROLES.map((r) => <TableCell key={r.role}>{r.label}</TableCell>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {staff.map((s) => (
              <TableRow key={s.user_id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell className="text-muted-foreground">{s.email}</TableCell>
                {ROLES.map((r) => (
                  <TableCell key={r.role}>
                    <Checkbox
                      checked={s.roles.includes(r.role)}
                      disabled={toggle.isPending || (r.role === "super_admin" && s.roles.includes("super_admin") && (s.user_id === user?.id || adminCount <= 1))}
                      onCheckedChange={(v) => toggle.mutate({ userId: s.user_id, role: r.role, on: !!v })}
                      aria-label={r.label}
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {!isLoading && staff.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Noch keine Portal-Benutzer.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
