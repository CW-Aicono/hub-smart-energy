import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SharingLayout } from "@/components/sharing/SharingLayout";
import { SharingMemberGuard } from "@/components/sharing/SharingMemberGuard";
import { useMyMembership } from "@/hooks/useMyMembership";

function OnboardingContent() {
  const { data, refetch } = useMyMembership();
  const member = data?.active;

  const [malo, setMalo] = useState("");
  const [melo, setMelo] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.title = "Stammdaten — Meine Energie-Community";
  }, []);

  useEffect(() => {
    setMalo(member?.malo_id ?? "");
    setMelo(member?.melo_id ?? "");
  }, [member?.malo_id, member?.melo_id]);

  if (!member) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase
      .from("community_members")
      .update({ malo_id: malo.trim() || null, melo_id: melo.trim() || null })
      .eq("id", member.id);
    setSaving(false);
    if (error) {
      toast.error("Speichern fehlgeschlagen", { description: error.message });
      return;
    }
    toast.success("Stammdaten gespeichert");
    refetch();
  };

  return (
    <SharingLayout title="Meine Stammdaten">
      <form onSubmit={handleSave} className="rounded-lg border bg-card p-5 space-y-4">
        <div className="space-y-2">
          <Label>Name</Label>
          <Input value={member.display_name ?? ""} disabled />
        </div>
        <div className="space-y-2">
          <Label>E-Mail</Label>
          <Input value={member.email ?? ""} disabled />
        </div>
        <div className="space-y-2">
          <Label htmlFor="malo">Marktlokations-ID (MaLo)</Label>
          <Input
            id="malo"
            value={malo}
            onChange={(e) => setMalo(e.target.value)}
            placeholder="11 Stellen"
            maxLength={11}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="melo">Messlokations-ID (MeLo)</Label>
          <Input
            id="melo"
            value={melo}
            onChange={(e) => setMelo(e.target.value)}
            placeholder="33 Stellen"
            maxLength={33}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Diese IDs benötigt dein Community-Betreiber für die Datenabholung beim Netzbetreiber.
        </p>
        <Button type="submit" className="w-full" disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Speichern
        </Button>
      </form>
    </SharingLayout>
  );
}

export default function SharingOnboarding() {
  return (
    <SharingMemberGuard>
      <OnboardingContent />
    </SharingMemberGuard>
  );
}
