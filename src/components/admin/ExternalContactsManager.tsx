import { useState } from "react";
import { useExternalContacts, ExternalContact } from "@/hooks/useExternalContacts";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Building2, Phone, Mail, Search } from "lucide-react";

const ExternalContactsManager = () => {
  const { contacts, isLoading, createContact, updateContact, deleteContact } = useExternalContacts();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ExternalContact | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [notes, setNotes] = useState("");

  const resetForm = () => {
    setName(""); setEmail(""); setPhone(""); setCompany(""); setNotes("");
    setEditing(null);
  };

  const openEdit = (c: ExternalContact) => {
    setEditing(c);
    setName(c.name);
    setEmail(c.email ?? "");
    setPhone(c.phone ?? "");
    setCompany(c.company ?? "");
    setNotes(c.notes ?? "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    if (editing) {
      await updateContact.mutateAsync({
        id: editing.id,
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        company: company.trim() || null,
        notes: notes.trim() || null,
      });
    } else {
      await createContact.mutateAsync({
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        company: company.trim() || undefined,
        notes: notes.trim() || undefined,
      });
    }
    resetForm();
    setDialogOpen(false);
  };

  const filtered = contacts.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.phone?.includes(q) ||
      c.company?.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Kontakte durchsuchen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="gap-1.5">
              <Plus className="h-4 w-4" /> Kontakt hinzufügen
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Kontakt bearbeiten" : "Neuer externer Kontakt"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div><Label>Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name des Dienstleisters" /></div>
              <div><Label>Firma</Label><Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Firmenname (optional)" /></div>
              <div><Label>E-Mail</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="kontakt@firma.de" type="email" /></div>
              <div><Label>Telefon</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+49 ..." type="tel" /></div>
              <div><Label>Notizen</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Fachgebiet, Anmerkungen..." rows={2} /></div>
            </div>
            <DialogFooter>
              <DialogClose asChild><Button variant="outline">Abbrechen</Button></DialogClose>
              <Button onClick={handleSave} disabled={!name.trim() || createContact.isPending || updateContact.isPending}>
                {editing ? "Speichern" : "Erstellen"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Firma</TableHead>
                <TableHead>E-Mail</TableHead>
                <TableHead>Telefon</TableHead>
                <TableHead>Notizen</TableHead>
                <TableHead className="w-24">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Laden...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  {search ? "Keine Kontakte gefunden" : "Noch keine externen Kontakte angelegt"}
                </TableCell></TableRow>
              ) : (
                filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>
                      {c.company && (
                        <span className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Building2 className="h-3.5 w-3.5" /> {c.company}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {c.email && (
                        <span className="flex items-center gap-1 text-sm">
                          <Mail className="h-3.5 w-3.5 text-muted-foreground" /> {c.email}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {c.phone && (
                        <span className="flex items-center gap-1 text-sm">
                          <Phone className="h-3.5 w-3.5 text-muted-foreground" /> {c.phone}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{c.notes}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Kontakt löschen?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Der Kontakt „{c.name}" wird unwiderruflich gelöscht.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteContact.mutate(c.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                Löschen
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
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
  );
};

export default ExternalContactsManager;
