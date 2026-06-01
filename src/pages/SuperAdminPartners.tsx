import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Briefcase, Loader2, Plus, Mail, Users } from "lucide-react";

interface Partner {
  id: string;
  name: string;
  slug: string;
  subdomain: string | null;
  contact_email: string | null;
  is_active: boolean;
  billing_mode: string;
  created_at: string;
}

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);

export default function SuperAdminPartners() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminName, setAdminName] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: partners = [], isLoading } = useQuery({
    queryKey: ["super-admin-partners"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partners")
        .select("id, name, slug, subdomain, contact_email, is_active, billing_mode, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Partner[];
    },
  });

  const { data: memberCounts = {} } = useQuery({
    queryKey: ["super-admin-partner-member-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_members")
        .select("partner_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((r: { partner_id: string }) => {
        counts[r.partner_id] = (counts[r.partner_id] ?? 0) + 1;
      });
      return counts;
    },
  });

  const reset = () => {
    setName(""); setSlug(""); setAdminEmail(""); setAdminName("");
  };

  const handleCreate = async () => {
    if (!name.trim() || !slug.trim() || !adminEmail.trim() || !adminEmail.includes("@")) {
      toast({ title: "Bitte alle Pflichtfelder ausfüllen.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-partner-admin", {
        body: {
          partnerName: name.trim(),
          partnerSlug: slug.trim(),
          adminEmail: adminEmail.trim().toLowerCase(),
          adminName: adminName.trim() || undefined,
          redirectTo: `${window.location.origin}/set-password`,
        },
      });
      if (error) throw error;
      const result = typeof data === "string" ? JSON.parse(data) : data;
      if (!result?.success) throw new Error(result?.error || "Einladung fehlgeschlagen");

      toast({ title: "Partner angelegt", description: `Einladung an ${adminEmail} versendet.` });
      qc.invalidateQueries({ queryKey: ["super-admin-partners"] });
      qc.invalidateQueries({ queryKey: ["super-admin-partner-member-counts"] });
      setOpen(false);
      reset();
    } catch (e) {
      toast({
        title: "Fehler",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = useMutation({
    mutationFn: async (p: Partner) => {
      const { error } = await supabase
        .from("partners")
        .update({ is_active: !p.is_active })
        .eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["super-admin-partners"] }),
    onError: (e: Error) =>
      toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="p-3 md:p-6 space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <Briefcase className="h-6 w-6" /> Partner
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Vertriebspartner anlegen und verwalten. Jeder Partner verwaltet eigene Kunden.
          </p>
        </div>

        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> Neuen Partner anlegen</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Neuen Partner anlegen</DialogTitle>
              <DialogDescription>
                Der Partner-Admin erhält per E-Mail einen Link, um sein Passwort selbst zu vergeben.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="p-name">Firmenname *</Label>
                <Input
                  id="p-name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!slug) setSlug(slugify(e.target.value));
                  }}
                  placeholder="Mustermann Elektro GmbH"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-slug">Kürzel (Slug) *</Label>
                <Input
                  id="p-slug"
                  value={slug}
                  onChange={(e) => setSlug(slugify(e.target.value))}
                  placeholder="mustermann-elektro"
                />
                <p className="text-xs text-muted-foreground">
                  Wird intern verwendet, nur Kleinbuchstaben, Zahlen und Bindestriche.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-admin-email">E-Mail Partner-Admin *</Label>
                <Input
                  id="p-admin-email"
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="admin@mustermann-elektro.de"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-admin-name">Name Partner-Admin (optional)</Label>
                <Input
                  id="p-admin-name"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  placeholder="Max Mustermann"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                Abbrechen
              </Button>
              <Button onClick={handleCreate} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
                Anlegen & Einladen
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      <div className="border rounded-lg overflow-x-auto bg-card">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Lade Partner …
          </div>
        ) : partners.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            Noch keine Partner angelegt.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Kontakt</TableHead>
                <TableHead className="text-center"><Users className="h-4 w-4 inline" /></TableHead>
                <TableHead>Modell</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Aktion</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {partners.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{p.slug}</TableCell>
                  <TableCell className="text-sm">{p.contact_email ?? "–"}</TableCell>
                  <TableCell className="text-center">{memberCounts[p.id] ?? 0}</TableCell>
                  <TableCell className="text-xs">{p.billing_mode}</TableCell>
                  <TableCell>
                    <Badge variant={p.is_active ? "default" : "secondary"}>
                      {p.is_active ? "aktiv" : "inaktiv"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleActive.mutate(p)}
                      disabled={toggleActive.isPending}
                    >
                      {p.is_active ? "Deaktivieren" : "Aktivieren"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
