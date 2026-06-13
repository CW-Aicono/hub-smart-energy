import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

function greetingFor(date: Date): string {
  const h = date.getHours();
  if (h >= 5 && h < 11) return "Guten Morgen";
  if (h >= 18 || h < 5) return "Guten Abend";
  return "Guten Tag";
}

/**
 * Zeigt einmal pro Session nach Login eine Begrüßung mit Namen.
 * Pro User-ID wird ein sessionStorage-Flag gesetzt, damit das Popup
 * nicht bei jedem Re-Render erneut erscheint.
 */
export default function WelcomeGreeting() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState<string>("");

  useEffect(() => {
    if (!user?.id) return;
    const key = `seh_board_greeted_${user.id}`;
    if (sessionStorage.getItem(key) === "1") return;

    supabase
      .from("profiles")
      .select("contact_person, company_name, email")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        const displayName =
          data?.contact_person?.trim() ||
          data?.company_name?.trim() ||
          (user.email ? user.email.split("@")[0] : "") ||
          "";
        setName(displayName);
        setOpen(true);
        sessionStorage.setItem(key, "1");
      });
  }, [user?.id]);

  const handleClose = () => setOpen(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            {greetingFor(new Date())}
            {name ? `, ${name}` : ""}!
          </DialogTitle>
          <DialogDescription>
            Schön, dass Sie wieder da sind. Hier ist Ihr aktuelles Board.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={handleClose}>Weiter</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
