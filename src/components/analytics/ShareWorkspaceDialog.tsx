import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Users, Trash2, UserPlus } from "lucide-react";
import { useWorkspaceShares, useTenantUsers } from "@/hooks/useAnalysisWorkspaceShares";
import { AnalysisWorkspace } from "@/hooks/useAnalysisWorkspaces";
import { toast } from "sonner";

interface ShareWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: AnalysisWorkspace | null;
  onToggleTenantWide: (isShared: boolean) => void;
}

export function ShareWorkspaceDialog({ open, onOpenChange, workspace, onToggleTenantWide }: ShareWorkspaceDialogProps) {
  const workspaceId = workspace?.id ?? null;
  const { shares, addShare, removeShare } = useWorkspaceShares(workspaceId);
  const { data: users = [] } = useTenantUsers();
  const [search, setSearch] = useState("");
  const [canEdit, setCanEdit] = useState(false);

  const availableUsers = useMemo(() => {
    const shared = new Set(shares.map((s) => s.user_id));
    const excluded = new Set([workspace?.created_by, ...Array.from(shared)].filter(Boolean));
    return users.filter(
      (u) =>
        !excluded.has(u.id) &&
        ((u.full_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
          (u.email ?? "").toLowerCase().includes(search.toLowerCase()))
    );
  }, [users, shares, workspace?.created_by, search]);

  if (!workspace) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" /> Workspace teilen
          </DialogTitle>
          <DialogDescription>„{workspace.name}" mit anderen Tenant-Mitgliedern teilen.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label className="text-sm font-medium">Für alle im Tenant sichtbar</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Jedes Mitglied kann diesen Workspace lesend öffnen.
              </p>
            </div>
            <Switch
              checked={workspace.is_shared}
              onCheckedChange={(v) => {
                onToggleTenantWide(v);
                toast.success(v ? "Workspace ist tenantweit sichtbar" : "Nur noch privat sichtbar");
              }}
            />
          </div>

          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Einzelne Personen</Label>

            <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
              {shares.length === 0 && (
                <p className="text-xs text-muted-foreground italic px-2 py-1">Noch keine Personen hinzugefügt.</p>
              )}
              {shares.map((s) => (
                <div key={s.user_id} className="flex items-center justify-between rounded border px-2 py-1.5 text-xs">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{s.full_name ?? s.email ?? s.user_id.slice(0, 8)}</div>
                    {s.full_name && s.email && <div className="text-muted-foreground truncate">{s.email}</div>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={s.can_edit ? "default" : "outline"} className="text-[10px]">
                      {s.can_edit ? "Bearbeiten" : "Lesen"}
                    </Badge>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => removeShare(s.user_id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t pt-3 space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              <UserPlus className="h-3.5 w-3.5" /> Hinzufügen
            </Label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name oder E-Mail suchen…"
              className="h-8 text-xs"
            />
            <div className="flex items-center justify-between text-xs px-1">
              <span>Bearbeiten erlauben</span>
              <Switch checked={canEdit} onCheckedChange={setCanEdit} />
            </div>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {search.length > 0 && availableUsers.length === 0 && (
                <p className="text-xs text-muted-foreground italic px-2 py-1">Keine passenden Nutzer gefunden.</p>
              )}
              {search.length > 0 &&
                availableUsers.slice(0, 8).map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={async () => {
                      await addShare({ userId: u.id, canEdit });
                      setSearch("");
                      toast.success("Person hinzugefügt");
                    }}
                    className="w-full text-left rounded border px-2 py-1.5 text-xs hover:bg-muted transition-colors"
                  >
                    <div className="font-medium truncate">{u.full_name ?? u.email ?? u.id.slice(0, 8)}</div>
                    {u.full_name && u.email && <div className="text-muted-foreground truncate">{u.email}</div>}
                  </button>
                ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
