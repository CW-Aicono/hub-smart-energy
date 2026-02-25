import { useState } from "react";
import DOMPurify from "dompurify";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Mail, Plus, Pencil, Trash2, FileText, Eye } from "lucide-react";
import { useEmailTemplates, type EmailTemplate } from "@/hooks/useEmailTemplates";
import { useTenant } from "@/hooks/useTenant";

export function EmailTemplateSettings() {
  const { templates, isLoading, upsertTemplate, deleteTemplate, DEFAULT_TEMPLATES } = useEmailTemplates();
  const { tenant } = useTenant();
  const [editTpl, setEditTpl] = useState<Partial<EmailTemplate> | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  const handleInitDefaults = async () => {
    if (!tenant) return;
    for (const d of DEFAULT_TEMPLATES) {
      const exists = templates.find((t) => t.template_key === d.template_key);
      if (!exists) {
        await upsertTemplate.mutateAsync({ ...d, tenant_id: tenant.id });
      }
    }
  };

  const handleSave = async () => {
    if (!editTpl || !tenant) return;
    await upsertTemplate.mutateAsync({
      tenant_id: tenant.id,
      template_key: editTpl.template_key!,
      name: editTpl.name!,
      subject: editTpl.subject!,
      body_html: editTpl.body_html!,
      description: editTpl.description || null,
      is_active: editTpl.is_active ?? true,
      ...(editTpl.id ? { id: editTpl.id } : {}),
    } as any);
    setEditTpl(null);
  };

  if (isLoading) return <Skeleton className="h-48" />;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary" />
                Mailvorlagen
              </CardTitle>
              <CardDescription>
                Erstellen und bearbeiten Sie E-Mail-Vorlagen für automatische Benachrichtigungen.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {templates.length === 0 && (
                <Button onClick={handleInitDefaults} variant="outline" size="sm">
                  <FileText className="h-4 w-4 mr-1" /> Standardvorlagen laden
                </Button>
              )}
              <Button
                onClick={() =>
                  setEditTpl({
                    template_key: "",
                    name: "",
                    subject: "",
                    body_html: "",
                    description: "",
                    is_active: true,
                  })
                }
                size="sm"
              >
                <Plus className="h-4 w-4 mr-1" /> Neue Vorlage
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {templates.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Noch keine Mailvorlagen angelegt. Laden Sie die Standardvorlagen oder erstellen Sie eine neue.
            </p>
          ) : (
            <div className="space-y-3">
              {templates.map((t) => (
                <div key={t.id} className="flex items-center justify-between p-3 rounded-md border">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{t.name}</span>
                      <Badge variant="outline" className="font-mono text-xs">
                        {t.template_key}
                      </Badge>
                      <Badge variant={t.is_active ? "default" : "secondary"}>
                        {t.is_active ? "Aktiv" : "Inaktiv"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{t.subject}</p>
                    {t.description && (
                      <p className="text-xs text-muted-foreground">{t.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 ml-3">
                    <Button size="icon" variant="ghost" onClick={() => setPreviewHtml(t.body_html)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setEditTpl(t)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setDeleteId(t.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit/Create Dialog */}
      <Dialog open={!!editTpl} onOpenChange={(o) => !o && setEditTpl(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTpl?.id ? "Vorlage bearbeiten" : "Neue Vorlage"}</DialogTitle>
          </DialogHeader>
          {editTpl && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    value={editTpl.name || ""}
                    onChange={(e) => setEditTpl({ ...editTpl, name: e.target.value })}
                    placeholder="z.B. Ladeabrechnung"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Template-Key</Label>
                  <Input
                    value={editTpl.template_key || ""}
                    onChange={(e) => setEditTpl({ ...editTpl, template_key: e.target.value })}
                    placeholder="z.B. charging_invoice"
                    disabled={!!editTpl.id}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Betreff</Label>
                <Input
                  value={editTpl.subject || ""}
                  onChange={(e) => setEditTpl({ ...editTpl, subject: e.target.value })}
                  placeholder="z.B. Ihre monatliche Abrechnung – {{month}} {{year}}"
                />
              </div>
              <div className="space-y-2">
                <Label>Beschreibung</Label>
                <Input
                  value={editTpl.description || ""}
                  onChange={(e) => setEditTpl({ ...editTpl, description: e.target.value })}
                  placeholder="Kurze Beschreibung der Vorlage"
                />
              </div>
              <div className="space-y-2">
                <Label>HTML-Inhalt</Label>
                <Textarea
                  value={editTpl.body_html || ""}
                  onChange={(e) => setEditTpl({ ...editTpl, body_html: e.target.value })}
                  rows={12}
                  className="font-mono text-xs"
                  placeholder="<h2>Betreff</h2><p>Inhalt...</p>"
                />
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
                <FileText className="h-4 w-4 shrink-0" />
                <span>
                  Verfügbare Platzhalter: <code className="text-xs">{"{{tenant_name}}"}</code>, <code className="text-xs">{"{{user_name}}"}</code>, <code className="text-xs">{"{{month}}"}</code>, <code className="text-xs">{"{{year}}"}</code>, <code className="text-xs">{"{{total_energy}}"}</code>, <code className="text-xs">{"{{total_amount}}"}</code>, <code className="text-xs">{"{{currency}}"}</code>, <code className="text-xs">{"{{invite_link}}"}</code>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={editTpl.is_active ?? true}
                  onCheckedChange={(checked) => setEditTpl({ ...editTpl, is_active: checked })}
                />
                <Label>Aktiv</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTpl(null)}>Abbrechen</Button>
            <Button onClick={handleSave} disabled={!editTpl?.name || !editTpl?.template_key || !editTpl?.subject}>
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!previewHtml} onOpenChange={(o) => !o && setPreviewHtml(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Vorschau</DialogTitle>
          </DialogHeader>
          <div
            className="prose prose-sm max-w-none border rounded-md p-4 bg-white text-black"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(previewHtml || "") }}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vorlage löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Diese Mailvorlage wird unwiderruflich gelöscht.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteId) { deleteTemplate.mutate(deleteId); setDeleteId(null); } }}>
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
