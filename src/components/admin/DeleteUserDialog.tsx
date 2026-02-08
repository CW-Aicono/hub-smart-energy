import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface DeleteUserDialogProps {
  userId: string;
  userName: string;
  isAdmin: boolean;
  adminCount: number;
  onSuccess: () => void;
}

const DeleteUserDialog = ({
  userId,
  userName,
  isAdmin,
  adminCount,
  onSuccess,
}: DeleteUserDialogProps) => {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const isLastAdmin = isAdmin && adminCount <= 1;
  const isSelf = currentUser?.id === userId;
  // Cannot delete if: last admin trying to delete themselves
  const cannotDelete = isLastAdmin && isSelf;

  const handleDelete = async () => {
    if (cannotDelete) {
      toast({
        title: t("common.error"),
        description: t("users.cannotDeleteLastAdmin"),
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    // Delete user role first
    await supabase.from("user_roles").delete().eq("user_id", userId);

    // Delete profile
    const { error } = await supabase
      .from("profiles")
      .delete()
      .eq("user_id", userId);

    setLoading(false);

    if (error) {
      toast({
        title: t("common.error"),
        description: t("users.deleteError"),
        variant: "destructive",
      });
    } else {
      toast({
        title: t("common.success"),
        description: t("users.userDeleted"),
      });
      onSuccess();
    }
  };

  if (cannotDelete) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              disabled
            >
              <Trash2 className="h-4 w-4 mr-1" />
              {t("common.delete")}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{t("users.cannotDeleteLastAdmin")}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="h-4 w-4 mr-1" />
          {t("common.delete")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("users.deleteUserTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("users.deleteUserConfirmation")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={loading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {loading ? t("common.loading") : t("common.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeleteUserDialog;
