import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AnalysisWorkspace, WorkspaceInput } from "@/hooks/useAnalysisWorkspaces";
import { Save, FolderOpen, MoreHorizontal, Trash2, Copy, LayoutTemplate, Share2, Bookmark } from "lucide-react";

interface WorkspaceToolbarProps {
  workspaces: AnalysisWorkspace[];
  activeWorkspace: AnalysisWorkspace | null;
  onLoad: (w: AnalysisWorkspace) => void;
  onSave: (input: WorkspaceInput) => void;
  onSaveExisting: (id: string, input: WorkspaceInput) => void;
  onDelete: (id: string) => void;
  onOpenTemplates: () => void;
  onSaveAsTemplate: () => void;
  onOpenShare: () => void;
  currentState: WorkspaceInput;
}

export function WorkspaceToolbar({
  workspaces,
  activeWorkspace,
  onLoad,
  onSave,
  onSaveExisting,
  onDelete,
  currentState,
}: WorkspaceToolbarProps) {
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const handleSave = () => {
    const name = newName.trim() || activeWorkspace?.name || "Neue Analyse";
    if (activeWorkspace) {
      onSaveExisting(activeWorkspace.id, { ...currentState, name });
    } else {
      onSave({ ...currentState, name });
    }
    setSaveDialogOpen(false);
    setNewName("");
  };

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <FolderOpen className="h-4 w-4" />
            {activeWorkspace?.name ?? "Workspace laden"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {workspaces.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">Noch keine Workspaces gespeichert</div>
          )}
          {workspaces.map((w) => (
            <DropdownMenuItem key={w.id} onClick={() => onLoad(w)} className="text-xs justify-between">
              <span className="truncate">{w.name}</span>
              {activeWorkspace?.id === w.id && <span className="text-primary">●</span>}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button variant="outline" size="sm" className="gap-2" onClick={() => setSaveDialogOpen(true)}>
        <Save className="h-4 w-4" />
        Speichern
      </Button>

      {activeWorkspace && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() =>
                onSave({
                  ...currentState,
                  name: `${activeWorkspace.name} (Kopie)`,
                })
              }
            >
              <Copy className="h-4 w-4 mr-2" /> Duplizieren
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setConfirmDelete(activeWorkspace.id)} className="text-destructive focus:text-destructive">
              <Trash2 className="h-4 w-4 mr-2" /> Löschen
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Workspace speichern</DialogTitle>
            <DialogDescription>
              {activeWorkspace ? `Überschreibt „${activeWorkspace.name}".` : "Gib dem Workspace einen Namen."}
            </DialogDescription>
          </DialogHeader>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={activeWorkspace?.name ?? "Neue Analyse"}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleSave}>
              <Save className="h-4 w-4 mr-2" /> Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Workspace löschen?</DialogTitle>
            <DialogDescription>
              Diese Aktion kann nicht rückgängig gemacht werden.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (confirmDelete) onDelete(confirmDelete);
                setConfirmDelete(null);
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" /> Löschen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
