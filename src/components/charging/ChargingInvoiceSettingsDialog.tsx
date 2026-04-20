import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useChargingInvoiceSettings } from "@/hooks/useChargingInvoiceSettings";
import { Settings, Upload, X } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ChargingInvoiceSettingsDialog({ open, onOpenChange }: Props) {
  const { settings, upsertSettings, uploadLogo } = useChargingInvoiceSettings();

  const [form, setForm] = useState({
    company_name: "",
    company_address: "",
    company_email: "",
    company_phone: "",
    tax_id: "",
    iban: "",
    bic: "",
    bank_name: "",
    footer_text: "",
    logo_url: "",
  });

  useEffect(() => {
    if (settings) {
      setForm({
        company_name: settings.company_name || "",
        company_address: settings.company_address || "",
        company_email: settings.company_email || "",
        company_phone: settings.company_phone || "",
        tax_id: settings.tax_id || "",
        iban: settings.iban || "",
        bic: settings.bic || "",
        bank_name: settings.bank_name || "",
        footer_text: settings.footer_text || "",
        logo_url: settings.logo_url || "",
      });
    }
  }, [settings]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadLogo(file);
    if (url) setForm((f) => ({ ...f, logo_url: url }));
  };

  const handleSave = () => {
    upsertSettings.mutate(form);
    onOpenChange(false);
  };

  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Rechnungsdesign
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Logo */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Firmenlogo</Label>
            <div className="flex items-center gap-4">
              {form.logo_url ? (
                <div className="relative">
                  <img src={form.logo_url} alt="Logo" className="h-16 max-w-[200px] object-contain border rounded p-1" />
                  <button
                    onClick={() => set("logo_url", "")}
                    className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center gap-2 px-4 py-2 border border-dashed rounded-lg cursor-pointer hover:bg-muted transition-colors">
                  <Upload className="h-4 w-4" />
                  <span className="text-sm">Logo hochladen</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                </label>
              )}
            </div>
          </div>

          {/* Company Info */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Firmendaten</h3>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Firmenname</Label><Input value={form.company_name} onChange={(e) => set("company_name", e.target.value)} /></div>
              <div><Label>USt-IdNr. / Steuernummer</Label><Input value={form.tax_id} onChange={(e) => set("tax_id", e.target.value)} placeholder="DE123456789" /></div>
            </div>
            <div><Label>Adresse</Label><Textarea rows={2} value={form.company_address} onChange={(e) => set("company_address", e.target.value)} placeholder="Straße, PLZ Ort" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>E-Mail</Label><Input type="email" value={form.company_email} onChange={(e) => set("company_email", e.target.value)} /></div>
              <div><Label>Telefon</Label><Input value={form.company_phone} onChange={(e) => set("company_phone", e.target.value)} /></div>
            </div>
          </div>

          {/* Bank Info */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Bankverbindung</h3>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>IBAN</Label><Input value={form.iban} onChange={(e) => set("iban", e.target.value)} placeholder="DE89 3704 0044 0532 0130 00" /></div>
              <div><Label>BIC</Label><Input value={form.bic} onChange={(e) => set("bic", e.target.value)} placeholder="COBADEFFXXX" /></div>
            </div>
            <div><Label>Bankname</Label><Input value={form.bank_name} onChange={(e) => set("bank_name", e.target.value)} /></div>
          </div>

          {/* Footer */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Fußzeile</h3>
            <div><Label>Freitext (z. B. Geschäftsführer, HRB-Nr.)</Label><Textarea rows={3} value={form.footer_text} onChange={(e) => set("footer_text", e.target.value)} /></div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={handleSave} disabled={upsertSettings.isPending}>
            {upsertSettings.isPending ? "Wird gespeichert…" : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
