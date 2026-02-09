import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { useTenants } from "@/hooks/useTenants";
import SuperAdminSidebar from "@/components/super-admin/SuperAdminSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, ExternalLink } from "lucide-react";
import { useState } from "react";

const SuperAdminTenants = () => {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: roleLoading } = useSuperAdmin();
  const { tenants, isLoading, createTenant, deleteTenant } = useTenants();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newEmail, setNewEmail] = useState("");

  if (authLoading || roleLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><div className="animate-pulse text-muted-foreground">Laden...</div></div>;
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isSuperAdmin) return <Navigate to="/" replace />;

  const filtered = tenants.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.slug.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = () => {
    if (!newName || !newSlug) return;
    createTenant.mutate(
      { name: newName, slug: newSlug, contact_email: newEmail || undefined },
      {
        onSuccess: () => {
          setDialogOpen(false);
          setNewName("");
          setNewSlug("");
          setNewEmail("");
        },
      }
    );
  };

  return (
    <div className="flex min-h-screen bg-background">
      <SuperAdminSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Mandanten</h1>
            <p className="text-sm text-muted-foreground mt-1">Alle Kunden-Systeme verwalten</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> Neuer Mandant</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Neuen Mandanten anlegen</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Firma GmbH" />
                </div>
                <div className="space-y-2">
                  <Label>Slug (URL-Kennung)</Label>
                  <Input value={newSlug} onChange={(e) => setNewSlug(e.target.value)} placeholder="firma-gmbh" />
                </div>
                <div className="space-y-2">
                  <Label>Kontakt-E-Mail</Label>
                  <Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="info@firma.de" type="email" />
                </div>
                <Button onClick={handleCreate} disabled={createTenant.isPending} className="w-full">
                  {createTenant.isPending ? "Erstelle..." : "Mandant erstellen"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </header>
        <div className="p-6">
          <Input placeholder="Suchen..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm mb-4" />
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>E-Mail</TableHead>
                    <TableHead>Erstellt</TableHead>
                    <TableHead className="w-24">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Laden...</TableCell></TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Keine Mandanten gefunden</TableCell></TableRow>
                  ) : (
                    filtered.map((tenant) => (
                      <TableRow key={tenant.id} className="cursor-pointer" onClick={() => navigate(`/super-admin/tenants/${tenant.id}`)}>
                        <TableCell className="font-medium">{tenant.name}</TableCell>
                        <TableCell className="text-muted-foreground">{tenant.slug}</TableCell>
                        <TableCell className="text-muted-foreground">{tenant.contact_email || "–"}</TableCell>
                        <TableCell className="text-muted-foreground">{new Date(tenant.created_at).toLocaleDateString("de-DE")}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); navigate(`/super-admin/tenants/${tenant.id}`); }}>
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-destructive" onClick={(e) => { e.stopPropagation(); deleteTenant.mutate(tenant.id); }}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default SuperAdminTenants;
