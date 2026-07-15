import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useDocumentCategories, useUploadDocument, type DocumentScope } from "@/hooks/useDocuments";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Upload } from "lucide-react";

interface FixedScope {
  scope: DocumentScope;
  scope_id: string | null;
  location_id?: string | null;
  label?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  fixedScope?: FixedScope; // when uploading from a context (e.g. from a meter card)
}

interface Option {
  id: string;
  label: string;
  location_id?: string | null;
}

export function DocumentUploadDialog({ open, onOpenChange, fixedScope }: Props) {
  const { tenant } = useTenant();
  const { data: categories = [] } = useDocumentCategories();
  const upload = useUploadDocument();

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [tenantWide, setTenantWide] = useState(false);
  const [locations, setLocations] = useState<Option[]>([]);
  const [meters, setMeters] = useState<Option[]>([]);
  const [chargePoints, setChargePoints] = useState<Option[]>([]);
  const [gateways, setGateways] = useState<Option[]>([]);
  const [storages, setStorages] = useState<Option[]>([]);
  const [selLoc, setSelLoc] = useState<Set<string>>(new Set());
  const [selMeter, setSelMeter] = useState<Set<string>>(new Set());
  const [selCp, setSelCp] = useState<Set<string>>(new Set());
  const [selGw, setSelGw] = useState<Set<string>>(new Set());
  const [selSt, setSelSt] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open || !tenant?.id) return;
    (async () => {
      const [locRes, meterRes, cpRes, gwRes, stRes] = await Promise.all([
        supabase.from("locations").select("id, name").eq("tenant_id", tenant.id).order("name"),
        supabase.from("meters").select("id, name, location_id").eq("tenant_id", tenant.id).order("name"),
        supabase.from("charge_points").select("id, name, location_id").eq("tenant_id", tenant.id).order("name"),
        supabase.from("gateway_devices").select("id, name, location_id").eq("tenant_id", tenant.id).order("name"),
        supabase.from("energy_storages").select("id, name, location_id").eq("tenant_id", tenant.id).order("name"),
      ]);
      setLocations((locRes.data ?? []).map((r: any) => ({ id: r.id, label: r.name })));
      setMeters((meterRes.data ?? []).map((r: any) => ({ id: r.id, label: r.name, location_id: r.location_id })));
      setChargePoints((cpRes.data ?? []).map((r: any) => ({ id: r.id, label: r.name, location_id: r.location_id })));
      setGateways((gwRes.data ?? []).map((r: any) => ({ id: r.id, label: r.name, location_id: r.location_id })));
      setStorages((stRes.data ?? []).map((r: any) => ({ id: r.id, label: r.name, location_id: r.location_id })));
    })();
  }, [open, tenant?.id]);

  useEffect(() => {
    if (!open) {
      setFile(null); setTitle(""); setDescription(""); setTags(""); setCategoryId("");
      setTenantWide(false);
      setSelLoc(new Set()); setSelMeter(new Set()); setSelCp(new Set()); setSelGw(new Set()); setSelSt(new Set());
    }
  }, [open]);

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    setter(next);
  };

  const handleSubmit = async () => {
    if (!file || !title.trim()) return;
    const links: Array<{ scope: DocumentScope; scope_id: string | null; location_id?: string | null }> = [];
    if (fixedScope) {
      links.push({ scope: fixedScope.scope, scope_id: fixedScope.scope_id, location_id: fixedScope.location_id ?? null });
    } else {
      if (tenantWide) links.push({ scope: "tenant", scope_id: null });
      selLoc.forEach((id) => links.push({ scope: "location", scope_id: id, location_id: id }));
      selMeter.forEach((id) => {
        const m = meters.find((x) => x.id === id);
        links.push({ scope: "meter", scope_id: id, location_id: m?.location_id ?? null });
      });
      selCp.forEach((id) => {
        const m = chargePoints.find((x) => x.id === id);
        links.push({ scope: "charge_point", scope_id: id, location_id: m?.location_id ?? null });
      });
      selGw.forEach((id) => {
        const m = gateways.find((x) => x.id === id);
        links.push({ scope: "gateway_device", scope_id: id, location_id: m?.location_id ?? null });
      });
      selSt.forEach((id) => {
        const m = storages.find((x) => x.id === id);
        links.push({ scope: "energy_storage", scope_id: id, location_id: m?.location_id ?? null });
      });
    }
    if (!links.length) return;
    try {
      await upload.mutateAsync({
        file,
        title: title.trim(),
        description: description.trim() || undefined,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        categoryId: categoryId || null,
        links,
      });
      onOpenChange(false);
    } catch { /* toast handled in hook */ }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>Dokument hochladen</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
          <div className="space-y-4">
            <div>
              <Label>Datei (max. 25 MB)</Label>
              <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              {file && <p className="text-xs text-muted-foreground mt-1">{file.name} · {(file.size / 1024).toFixed(0)} KB</p>}
            </div>
            <div>
              <Label>Titel *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z.B. Bedienungsanleitung Wallbox" />
            </div>
            <div>
              <Label>Kategorie</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue placeholder="Kategorie wählen" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Beschreibung</Label>
              <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div>
              <Label>Tags (Komma-separiert)</Label>
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="z.B. wallbox, garage" />
            </div>

            {fixedScope ? (
              <div className="rounded-lg border p-3 bg-muted/40 text-sm">
                Verknüpft mit: <strong>{fixedScope.label ?? fixedScope.scope}</strong>
              </div>
            ) : (
              <div className="space-y-3">
                <Label className="text-base">Verknüpfen mit</Label>
                <div className="flex items-center gap-2">
                  <Checkbox id="tw" checked={tenantWide} onCheckedChange={(v) => setTenantWide(!!v)} />
                  <Label htmlFor="tw" className="font-normal">Tenant-weit (für alle Standorte sichtbar)</Label>
                </div>
                <ScopeMultiPicker title="Liegenschaften" options={locations} selected={selLoc} onToggle={(id) => toggle(selLoc, setSelLoc, id)} />
                <ScopeMultiPicker title="Zähler" options={meters} selected={selMeter} onToggle={(id) => toggle(selMeter, setSelMeter, id)} />
                <ScopeMultiPicker title="Ladepunkte" options={chargePoints} selected={selCp} onToggle={(id) => toggle(selCp, setSelCp, id)} />
                <ScopeMultiPicker title="Gateways / Geräte" options={gateways} selected={selGw} onToggle={(id) => toggle(selGw, setSelGw, id)} />
                <ScopeMultiPicker title="Speicher" options={storages} selected={selSt} onToggle={(id) => toggle(selSt, setSelSt, id)} />
              </div>
            )}
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={handleSubmit} disabled={!file || !title.trim() || upload.isPending}>
            {upload.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            Hochladen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScopeMultiPicker({
  title, options, selected, onToggle,
}: {
  title: string; options: Option[]; selected: Set<string>; onToggle: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  if (!options.length) return null;
  const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options;
  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-sm font-medium">{title} <span className="text-muted-foreground">({selected.size}/{options.length})</span></span>
        <Input className="h-7 w-40" placeholder="Suche…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="max-h-32 overflow-y-auto p-2 space-y-1">
        {filtered.map((o) => (
          <label key={o.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-2 py-1">
            <Checkbox checked={selected.has(o.id)} onCheckedChange={() => onToggle(o.id)} />
            <span>{o.label}</span>
          </label>
        ))}
        {filtered.length === 0 && <p className="text-xs text-muted-foreground px-2 py-1">Keine Treffer.</p>}
      </div>
    </div>
  );
}
