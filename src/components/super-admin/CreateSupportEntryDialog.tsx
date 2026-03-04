import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

const ACTIONS = [
  { value: "support_session", label: "Support-Sitzung" },
  { value: "phone_call", label: "Telefonat" },
  { value: "email_support", label: "E-Mail-Support" },
  { value: "other", label: "Sonstiges" },
];

const CreateSupportEntryDialog = () => {
  const [open, setOpen] = useState(false);
  const [tenantId, setTenantId] = useState("");
  const [duration, setDuration] = useState("");
  const [action, setAction] = useState("support_session");
  const [notes, setNotes] = useState("");
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: tenants = [] } = useQuery({
    queryKey: ["all-tenants-for-support"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const createEntry = useMutation({
    mutationFn: async () => {
      const durationMin = parseInt(duration, 10);
      if (!tenantId || !durationMin || durationMin <= 0) {
        throw new Error("Bitte alle Pflichtfelder ausfüllen");
      }
      const now = new Date();
      const endedAt = new Date(now.getTime());
      const startedAt = new Date(now.getTime() - durationMin * 60000);

      const { error } = await supabase.from("support_sessions").insert({
        tenant_id: tenantId,
        super_admin_user_id: user!.id,
        started_at: startedAt.toISOString(),
        ended_at: endedAt.toISOString(),
        expires_at: endedAt.toISOString(),
        duration_minutes: durationMin,
        is_manual: true,
        reason: ACTIONS.find((a) => a.value === action)?.label ?? action,
        notes: notes || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support-sessions"] });
      toast.success("Support-Eintrag erstellt");
      setOpen(false);
      setTenantId("");
      setDuration("");
      setAction("support_session");
      setNotes("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Support-Eintrag erstellen
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Support-Eintrag erstellen</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label>Kunde</Label>
            <Select value={tenantId} onValueChange={setTenantId}>
              <SelectTrigger>
                <SelectValue placeholder="Kunde wählen" />
              </SelectTrigger>
              <SelectContent>
                {tenants.map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Dauer (Minuten)</Label>
            <Input
              type="number"
              min={1}
              placeholder="z.B. 30"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Aktion</Label>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTIONS.map((a) => (
                  <SelectItem key={a.value} value={a.value}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Notizen (optional)</Label>
            <Textarea
              placeholder="Beschreibung der Support-Leistung..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <Button
            className="w-full"
            onClick={() => createEntry.mutate()}
            disabled={createEntry.isPending}
          >
            Eintrag erstellen & Abrechnung erzeugen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreateSupportEntryDialog;
