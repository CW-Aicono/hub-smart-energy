import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useContractTemplates,
  useMemberSignatures,
  renderTemplate,
} from "@/hooks/useCommunityContracts";
import { useCommunityTariffs } from "@/hooks/useEnergyCommunities";
import type { CommunityMember } from "@/hooks/useEnergyCommunities";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  communityId: string;
  communityName: string;
  member: CommunityMember | null;
}

export default function SignContractDialog({ open, onOpenChange, communityId, communityName, member }: Props) {
  const { templates } = useContractTemplates(communityId);
  const { signatures, signContract } = useMemberSignatures(communityId);
  const { tariffs } = useCommunityTariffs(communityId);

  const activeTemplates = templates.filter((t) => t.is_active);
  const [templateId, setTemplateId] = useState<string>("");
  const [signerName, setSignerName] = useState<string>(member?.display_name ?? "");
  const [agree, setAgree] = useState(false);

  // Reset on open
  useMemo(() => {
    if (open) {
      setTemplateId(activeTemplates[0]?.id ?? "");
      setSignerName(member?.display_name ?? "");
      setAgree(false);
    }
  }, [open, member]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedTpl = activeTemplates.find((t) => t.id === templateId);
  const currentTariff = tariffs[0];

  const rendered = useMemo(() => {
    if (!selectedTpl || !member) return "";
    return renderTemplate(selectedTpl.body_markdown, {
      community_name: communityName,
      member_name: member.display_name ?? "",
      member_email: member.email ?? "",
      valid_from: currentTariff?.valid_from ?? new Date().toISOString().slice(0, 10),
      price_ct_kwh: currentTariff?.price_ct_kwh != null
        ? Number(currentTariff.price_ct_kwh).toLocaleString("de-DE", { maximumFractionDigits: 2 })
        : "—",
      price_includes_vat: currentTariff?.price_includes_vat !== false ? "inkl. MwSt." : "zzgl. MwSt.",
    });
  }, [selectedTpl, member, communityName, currentTariff]);

  const memberSignatures = signatures.filter((s) => s.member_id === member?.id);

  const submit = async () => {
    if (!member || !selectedTpl || !agree || !signerName.trim()) return;
    await signContract.mutateAsync({
      memberId: member.id,
      template: selectedTpl,
      signerName: signerName.trim(),
      renderedBody: rendered,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Vertrag unterzeichnen — {member?.display_name}</DialogTitle>
        </DialogHeader>

        {activeTemplates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Keine aktive Vertragsschablone vorhanden. Bitte zuerst im Tab „Verträge" eine Schablone anlegen.
          </p>
        ) : (
          <div className="space-y-3">
            <div>
              <Label>Vertragsschablone</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger><SelectValue placeholder="Bitte wählen" /></SelectTrigger>
                <SelectContent>
                  {activeTemplates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name} (v{t.version})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {rendered && (
              <div>
                <Label>Vorschau</Label>
                <ScrollArea className="h-64 rounded-md border p-3 bg-muted/30">
                  <pre className="text-xs whitespace-pre-wrap font-sans">{rendered}</pre>
                </ScrollArea>
              </div>
            )}

            <div>
              <Label>Name des Unterzeichnenden</Label>
              <Input value={signerName} onChange={(e) => setSignerName(e.target.value)} />
            </div>

            <div className="flex items-start gap-2">
              <input type="checkbox" id="agree" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1" />
              <Label htmlFor="agree" className="text-sm font-normal leading-snug">
                Ich bestätige den oben angezeigten Vertragstext und willige in die elektronische Unterzeichnung ein.
                Zeitstempel, IP-Adresse und ein Hash des Vertragstexts werden zur Beweissicherung gespeichert.
              </Label>
            </div>

            {memberSignatures.length > 0 && (
              <div className="rounded-md border p-2 text-xs">
                <b>Vorhandene Unterschriften:</b>
                <ul className="mt-1 space-y-1">
                  {memberSignatures.map((s) => (
                    <li key={s.id} className="text-muted-foreground">
                      {new Date(s.signed_at).toLocaleString("de-DE")} – {s.signer_name} – Hash {s.body_hash.slice(0, 12)}…
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={submit} disabled={!agree || !selectedTpl || !signerName.trim() || signContract.isPending}>
            {signContract.isPending ? "Speichere…" : "Digital unterzeichnen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
