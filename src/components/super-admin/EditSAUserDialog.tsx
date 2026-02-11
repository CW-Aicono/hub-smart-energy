import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface EditSAUserDialogProps {
  user: {
    id: string;
    user_id: string;
    email: string | null;
    contact_person: string | null;
    company_name: string | null;
  };
}

const EditSAUserDialog = ({ user }: EditSAUserDialogProps) => {
  const [open, setOpen] = useState(false);
  const [contactPerson, setContactPerson] = useState(user.contact_person ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const [companyName, setCompanyName] = useState(user.company_name ?? "");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const updateUser = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        .update({
          contact_person: contactPerson || null,
          email: email || null,
          company_name: companyName || null,
        })
        .eq("user_id", user.user_id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-users"] });
      toast({ title: "Benutzer aktualisiert" });
      setOpen(false);
    },
    onError: (e: Error) => {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    },
  });

  const handleOpen = (isOpen: boolean) => {
    if (isOpen) {
      setContactPerson(user.contact_person ?? "");
      setEmail(user.email ?? "");
      setCompanyName(user.company_name ?? "");
    }
    setOpen(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="Bearbeiten">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Benutzer bearbeiten</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label>Kontaktperson</Label>
            <Input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>E-Mail</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
          </div>
          <div className="space-y-2">
            <Label>Firma</Label>
            <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          </div>
          <Button onClick={() => updateUser.mutate()} disabled={updateUser.isPending} className="w-full">
            {updateUser.isPending ? "Speichere..." : "Speichern"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EditSAUserDialog;
