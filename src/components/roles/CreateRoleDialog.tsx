import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "@/hooks/useTranslation";

interface CreateRoleDialogProps {
  onCreateRole: (name: string, description: string) => Promise<{ error: Error | null }>;
}

export function CreateRoleDialog({ onCreateRole }: CreateRoleDialogProps) {
  const { t } = useTranslation();
  const T = (key: string) => t(key as any);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error(T("createRole.nameRequired"));
      return;
    }

    setLoading(true);
    const { error } = await onCreateRole(name.trim(), description.trim());
    setLoading(false);

    if (error) {
      toast.error(T("createRole.errorCreate") + ": " + error.message);
    } else {
      toast.success(T("createRole.success"));
      setName("");
      setDescription("");
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          {T("createRole.button")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{T("createRole.title")}</DialogTitle>
            <DialogDescription>{T("createRole.description")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">{T("createRole.nameLabel")}</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={T("createRole.namePlaceholder")}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">{T("createRole.descLabel")}</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={T("createRole.descPlaceholder")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? T("createRole.creating") : T("createRole.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
