import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Pencil } from "lucide-react";
import { useContractTemplates, type ContractTemplate } from "@/hooks/useCommunityContracts";
import { confirmDialog } from "@/components/ui/confirm-dialog";

interface Props {
  communityId: string;
}

export default function ContractTemplatesTab({ communityId }: Props) {
  const { templates, createTemplate, updateTemplate, deleteTemplate } = useContractTemplates(communityId);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ContractTemplate | null>(null);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");

  const openCreate = () => { setEditing(null); setName(""); setBody(""); setOpen(true); };
  const openEdit = (t: ContractTemplate) => { setEditing(t); setName(t.name); setBody(t.body_markdown); setOpen(true); };

  const save = async () => {
    if (!name.trim() || !body.trim()) return;
    if (editing) {
      await updateTemplate.mutateAsync({
        id: editing.id, name: name.trim(), body_markdown: body, bumpVersion: body !== editing.body_markdown,
      });
    } else {
      await createTemplate.mutateAsync({
        name: name.trim(), body_markdown: body,
        placeholders: ["community_name", "member_name", "member_email", "valid_from", "price_ct_kwh"],
        community_id: communityId,
      });
    }
    setOpen(false);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Vertragsschablonen</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Schablone</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{editing ? `Bearbeiten: ${editing.name}` : "Neue Schablone"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div>
                <Label>Vertragstext (Markdown)</Label>
                <textarea
                  className="w-full min-h-[300px] rounded-md border border-input bg-background p-2 text-sm font-mono"
                  value={body} onChange={(e) => setBody(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Platzhalter: <code>{"{{community_name}}"}</code>, <code>{"{{member_name}}"}</code>,
                  <code>{"{{member_email}}"}</code>, <code>{"{{valid_from}}"}</code>, <code>{"{{price_ct_kwh}}"}</code>
                </p>
              </div>
            </div>
            <DialogFooter><Button onClick={save}>Speichern</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {templates.length === 0 ? (
          <p className="text-muted-foreground">Noch keine Schablone hinterlegt.</p>
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Gültigkeit</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {templates.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{t.name}</TableCell>
                  <TableCell>{t.community_id ? "Diese Community" : <Badge variant="outline">Mandantenweit</Badge>}</TableCell>
                  <TableCell>v{t.version}</TableCell>
                  <TableCell><Badge variant={t.is_active ? "default" : "secondary"}>{t.is_active ? "Aktiv" : "Inaktiv"}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(t)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={async () => { if (await confirmDialog({ title: "Schablone löschen", description: `Schablone „${t.name}" löschen?` })) deleteTemplate.mutate(t.id); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
