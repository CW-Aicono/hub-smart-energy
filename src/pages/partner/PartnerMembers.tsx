import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { UserPlus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePartnerAccess } from "@/hooks/usePartnerAccess";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface MemberRow {
  id: string;
  user_id: string;
  partner_role: "partner_admin" | "partner_user";
  created_at: string;
  email?: string | null;
  contact_person?: string | null;
}

export default function PartnerMembers() {
  const { partnerId, isPartnerAdmin } = usePartnerAccess();
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"partner_user" | "partner_admin">("partner_user");

  const [deleteTarget, setDeleteTarget] = useState<MemberRow | null>(null);

  const load = async () => {
    if (!partnerId) { setLoading(false); return; }
    setLoading(true);
    const { data: members } = await supabase
      .from("partner_members")
      .select("id, user_id, partner_role, created_at")
      .eq("partner_id", partnerId)
      .order("created_at", { ascending: true });
    const list = (members as MemberRow[]) ?? [];

    if (list.length > 0) {
      const userIds = list.map((m) => m.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, email, contact_person")
        .in("user_id", userIds);
      const byId = new Map((profiles ?? []).map((p: any) => [p.user_id, p]));
      list.forEach((m) => {
        const p = byId.get(m.user_id);
        m.email = p?.email ?? null;
        m.contact_person = p?.contact_person ?? null;
      });
    }
    setRows(list);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerId]);

  const handleInvite = async () => {
    if (!email) return;
    setInviting(true);
    try {
      const { data, error } = await supabase.functions.invoke("partner-invite-member", {
        body: { email, name: name || undefined, role },
      });
      const res: any = typeof data === "string" ? JSON.parse(data) : data;
      if (error || !res?.success) throw new Error(res?.error || error?.message || "Einladung fehlgeschlagen");
      toast({ title: "Einladung gesendet", description: `${email} wurde eingeladen.` });
      setInviteOpen(false);
      setEmail(""); setName(""); setRole("partner_user");
      await load();
    } catch (e: any) {
      toast({ title: "Fehler", description: e?.message ?? "Unbekannt", variant: "destructive" });
    } finally {
      setInviting(false);
    }
  };

  const handleDelete = async (m: MemberRow) => {
    const { error } = await supabase.from("partner_members").delete().eq("id", m.id);
    if (error) {
      toast({ title: "Löschen fehlgeschlagen", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Partner-User entfernt" });
    await load();
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Partner-User</h1>
          <p className="text-muted-foreground">
            Mitglieder dieses Partners. Partner-Admins können weitere User einladen.
          </p>
        </div>
        {isPartnerAdmin && (
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <Button><UserPlus className="h-4 w-4 mr-2" />User einladen</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Neuen Partner-User einladen</DialogTitle></DialogHeader>
              <div className="space-y-3 pt-2">
                <div className="space-y-2">
                  <Label>E-Mail *</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="kollege@partner.de" />
                </div>
                <div className="space-y-2">
                  <Label>Name (optional)</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Anna Beispiel" />
                </div>
                <div className="space-y-2">
                  <Label>Rolle</Label>
                  <Select value={role} onValueChange={(v) => setRole(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="partner_user">Partner-User</SelectItem>
                      <SelectItem value="partner_admin">Partner-Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setInviteOpen(false)}>Abbrechen</Button>
                <Button onClick={handleInvite} disabled={inviting || !email}>
                  {inviting ? "Sende…" : "Einladen"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </header>

      <Card>
        <CardHeader><CardTitle>Mitglieder</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Lade…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Noch keine Mitglieder.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>E-Mail</TableHead>
                  <TableHead>Rolle</TableHead>
                  <TableHead>Beigetreten</TableHead>
                  <TableHead className="w-16 text-right">Aktion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.contact_person ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{m.email ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={m.partner_role === "partner_admin" ? "default" : "secondary"}>
                        {m.partner_role === "partner_admin" ? "Partner-Admin" : "Partner-User"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(m.created_at).toLocaleDateString("de-DE")}
                    </TableCell>
                    <TableCell className="text-right">
                      {isPartnerAdmin && m.user_id !== user?.id && (
                        <Button variant="ghost" size="icon" className="text-destructive"
                          onClick={() => setDeleteTarget(m)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Partner-User entfernen?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.email ?? deleteTarget?.contact_person ?? "Dieser Eintrag"} verliert
              den Zugriff auf das Partner-Portal. Der Auth-Account bleibt erhalten.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteTarget) { handleDelete(deleteTarget); setDeleteTarget(null); } }}
            >
              Entfernen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
