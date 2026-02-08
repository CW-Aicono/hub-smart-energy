import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil } from "lucide-react";

interface UserData {
  id: string;
  user_id: string;
  company_name: string | null;
  contact_person: string | null;
}

interface EditUserDialogProps {
  user: UserData;
  onSuccess: () => void;
}

const EditUserDialog = ({ user, onSuccess }: EditUserDialogProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [companyName, setCompanyName] = useState(user.company_name || "");
  const [contactPerson, setContactPerson] = useState(user.contact_person || "");

  const handleOpen = () => {
    setCompanyName(user.company_name || "");
    setContactPerson(user.contact_person || "");
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase
      .from("profiles")
      .update({
        company_name: companyName || null,
        contact_person: contactPerson || null,
      })
      .eq("user_id", user.user_id);

    setLoading(false);

    if (error) {
      toast({
        title: t("common.error"),
        description: t("users.userUpdateError"),
        variant: "destructive",
      });
    } else {
      toast({
        title: t("common.success"),
        description: t("users.userUpdated"),
      });
      setOpen(false);
      onSuccess();
    }
  };

  return (
    <>
      <Button variant="ghost" size="sm" onClick={handleOpen}>
        <Pencil className="h-4 w-4 mr-1" />
        {t("common.edit")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("users.editUser")}</DialogTitle>
            <DialogDescription>{t("users.editUserDescription")}</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="contactPerson">{t("users.contactPerson")}</Label>
              <Input
                id="contactPerson"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                placeholder={t("users.contactPersonPlaceholder")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="companyName">{t("users.companyName")}</Label>
              <Input
                id="companyName"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder={t("users.companyNamePlaceholder")}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? t("common.loading") : t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default EditUserDialog;
