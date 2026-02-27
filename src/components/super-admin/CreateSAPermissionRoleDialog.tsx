import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSATranslation } from "@/hooks/useSATranslation";

interface Permission {
  id: string;
  code: string;
  name: string;
  description: string | null;
}

export default function CreateSAPermissionRoleDialog() {
  const { t } = useSATranslation();
  const T = (key: string) => {
    // Try SA translations first, fall back to key
    const result = t(key as any);
    return result !== key ? result : key;
  };
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const { data: permissions = [] } = useQuery<Permission[]>({
    queryKey: ["sa-permissions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("permissions")
        .select("*")
        .eq("category", "super-admin")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const togglePerm = (id: string) => {
    setSelectedPermissions((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error(T("saRole.nameRequired"));
      return;
    }

    setLoading(true);
    try {
      const { data: tenantData } = await supabase.rpc("get_user_tenant_id");
      const tenantId = tenantData as string;

      const { data: role, error: roleErr } = await supabase
        .from("custom_roles")
        .insert({ name: name.trim(), description: description.trim(), tenant_id: tenantId, is_system_role: true })
        .select("id")
        .single();
      if (roleErr) throw roleErr;

      if (selectedPermissions.length > 0) {
        const rows = selectedPermissions.map((pid) => ({ custom_role_id: role.id, permission_id: pid }));
        const { error: permErr } = await supabase.from("custom_role_permissions").insert(rows);
        if (permErr) throw permErr;
      }

      toast.success(T("saRole.created"));
      queryClient.invalidateQueries({ queryKey: ["sa-custom-roles"] });
      setName("");
      setDescription("");
      setSelectedPermissions([]);
      setOpen(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          {T("saRole.newButton")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px] max-h-[80vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{T("saRole.createTitle")}</DialogTitle>
            <DialogDescription>{T("saRole.createDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="sa-role-name">{T("saRole.nameLabel")}</Label>
              <Input id="sa-role-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={T("saRole.namePlaceholder")} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sa-role-desc">{T("saRole.descLabel")}</Label>
              <Textarea id="sa-role-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={T("saRole.descPlaceholder")} />
            </div>
            <div className="grid gap-2">
              <Label>{T("saRole.permissions")}</Label>
              <div className="grid gap-2 max-h-48 overflow-y-auto border rounded-md p-3">
                {permissions.map((p) => (
                  <label key={p.id} className="flex items-start gap-2 cursor-pointer">
                    <Checkbox checked={selectedPermissions.includes(p.id)} onCheckedChange={() => togglePerm(p.id)} className="mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">{p.name}</p>
                      {p.description && <p className="text-xs text-muted-foreground">{p.description}</p>}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{T("common.cancel")}</Button>
            <Button type="submit" disabled={loading}>{loading ? T("createRole.creating") : T("createRole.create")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
