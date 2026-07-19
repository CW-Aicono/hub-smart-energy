import { useEffect, useMemo, useState } from "react";
import SuperAdminSidebar from "@/components/super-admin/SuperAdminSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Puzzle, AlertTriangle, CheckCircle2, DatabaseZap } from "lucide-react";
import { SNIPPET_BY_KEY, GROUP_BY_TEMPLATE_KEY } from "@/lib/loxone/snippetsCatalog";
import { seedRegistryFromSnippets } from "@/lib/loxone/catalogSeed";
import LoxoneMasterProject from "@/components/super-admin/LoxoneMasterProject";
import LoxoneInjector from "@/components/super-admin/LoxoneInjector";
import LoxoneManualsEditor from "@/components/super-admin/LoxoneManualsEditor";

interface RegistryEntry {
  id: string;
  template_key: string;
  version: string;
  category: string;
  title: string;
  description: string | null;
  min_miniserver_fw: string | null;
  changelog: string | null;
  snippet_url: string | null;
  is_active: boolean;
  updated_at: string;
}

interface InstallationRow {
  id: string;
  tenant_id: string;
  location_id: string;
  template_key: string;
  instance_id: string | null;
  installed_version: string | null;
  last_seen_at: string | null;
  location_name?: string | null;
  tenant_name?: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  ev: "E-Mobilität",
  pv: "PV & Speicher",
  storage: "Speicher",
  heating: "Heizung / WP",
  comfort: "Komfort",
  safety: "Sicherheit",
  generic: "Baukasten",
};

const SNIPPET_KEYS = new Set(Object.keys(SNIPPET_BY_KEY));

export default function SuperAdminLoxoneTemplates() {
  const { toast } = useToast();
  const [registry, setRegistry] = useState<RegistryEntry[]>([]);
  const [installations, setInstallations] = useState<InstallationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<RegistryEntry | null>(null);

  const load = async () => {
    setLoading(true);
    const [regRes, instRes, locRes, tenRes] = await Promise.all([
      supabase.from("loxone_template_registry").select("*").order("category").order("template_key"),
      supabase
        .from("location_loxone_templates")
        .select("id, tenant_id, location_id, template_key, instance_id, installed_version, last_seen_at")
        .order("last_seen_at", { ascending: false }),
      supabase.from("locations").select("id, name"),
      supabase.from("tenants").select("id, name"),
    ]);
    if (regRes.error) toast({ title: "Fehler", description: regRes.error.message, variant: "destructive" });
    if (instRes.error) toast({ title: "Fehler", description: instRes.error.message, variant: "destructive" });
    const locMap = new Map((locRes.data ?? []).map((l: any) => [l.id, l.name]));
    const tenMap = new Map((tenRes.data ?? []).map((t: any) => [t.id, t.name]));
    setRegistry((regRes.data as RegistryEntry[]) ?? []);
    setInstallations(
      ((instRes.data as any[]) ?? []).map((row) => ({
        ...row,
        location_name: locMap.get(row.location_id) ?? row.location_id,
        tenant_name: tenMap.get(row.tenant_id) ?? row.tenant_id,
      })),
    );
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const health = useMemo(() => {
    const map = new Map<string, { total: number; outdated: number; versions: Record<string, number> }>();
    for (const r of registry) map.set(r.template_key, { total: 0, outdated: 0, versions: {} });
    for (const inst of installations) {
      const entry = map.get(inst.template_key);
      if (!entry) continue;
      entry.total += 1;
      const v = inst.installed_version || "?";
      entry.versions[v] = (entry.versions[v] || 0) + 1;
      const latest = registry.find((r) => r.template_key === inst.template_key)?.version;
      if (latest && inst.installed_version && latest !== inst.installed_version) entry.outdated += 1;
    }
    return map;
  }, [registry, installations]);

  const filteredRegistry = registry.filter((r) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return r.template_key.toLowerCase().includes(q) || r.title.toLowerCase().includes(q) || r.category.includes(q);
  });

  const categoryGroups = useMemo(() => {
    const groups: Record<string, RegistryEntry[]> = {};
    for (const r of filteredRegistry) {
      groups[r.category] = groups[r.category] || [];
      groups[r.category].push(r);
    }
    return groups;
  }, [filteredRegistry]);

  const outdatedTotal = Array.from(health.values()).reduce((s, h) => s + h.outdated, 0);
  const installsTotal = installations.length;

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: `hsl(var(--sa-background))`, color: `hsl(var(--sa-foreground))` }}>
      <SuperAdminSidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-4 md:p-8 space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2"><Puzzle className="h-6 w-6" /> Loxone-Templates</h1>
              <p className="text-sm text-muted-foreground">Katalog, Health-Report & Snippet-Rollout für die AICO_*-Bausteine.</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" onClick={load} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Aktualisieren
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    const res = await seedRegistryFromSnippets();
                    toast({ title: "Katalog befüllt", description: `${res.total} Templates upserted.` });
                    await load();
                  } catch (e: any) {
                    toast({ title: "Fehler", description: e.message ?? String(e), variant: "destructive" });
                  }
                }}
              >
                <DatabaseZap className="h-4 w-4 mr-2" /> Katalog aus Snippet-Bibliothek befüllen
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Templates im Katalog</p><p className="text-2xl font-bold">{registry.length}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Aktive Installationen</p><p className="text-2xl font-bold">{installsTotal}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Locations mit Loxone-Templates</p><p className="text-2xl font-bold">{new Set(installations.map((i) => i.location_id)).size}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Update erforderlich</p><p className="text-2xl font-bold flex items-center gap-2">{outdatedTotal}{outdatedTotal > 0 && <AlertTriangle className="h-5 w-5 text-destructive" />}</p></CardContent></Card>
          </div>

          <Tabs defaultValue="catalog">
            <TabsList>
              <TabsTrigger value="catalog">Katalog</TabsTrigger>
              <TabsTrigger value="health">Health-Report</TabsTrigger>
              <TabsTrigger value="master">Master-Projekt</TabsTrigger>
              <TabsTrigger value="injector">Injektor</TabsTrigger>
            </TabsList>

            <TabsContent value="catalog" className="space-y-4">
              <Input placeholder="Suche nach Key, Titel, Kategorie…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
              {Object.entries(categoryGroups).map(([cat, items]) => (
                <div key={cat} className="space-y-2">
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{CATEGORY_LABELS[cat] ?? cat}</h2>
                  <div className="grid gap-2">
                    {items.map((r) => {
                      const h = health.get(r.template_key);
                      const groupOfTpl = GROUP_BY_TEMPLATE_KEY[r.template_key];
                      const hasSnippet = SNIPPET_KEYS.has(r.template_key);
                      return (
                        <Card key={r.id} className="cursor-pointer hover:border-primary" onClick={() => setDetail(r)}>
                          <CardContent className="p-3 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium">{r.title}</span>
                                <Badge variant="outline" className="text-[10px]">v{r.version}</Badge>
                                {!r.is_active && <Badge variant="secondary" className="text-[10px]">inaktiv</Badge>}
                                {groupOfTpl && <Badge className="text-[10px]" variant="default">Gruppe {groupOfTpl.key}</Badge>}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">{r.template_key}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 text-xs">
                              <Badge variant="secondary">{h?.total ?? 0} Installationen</Badge>
                              {h && h.outdated > 0 ? (
                                <Badge variant="destructive">{h.outdated} veraltet</Badge>
                              ) : (
                                <CheckCircle2 className="h-4 w-4 text-green-600" />
                              )}
                              {hasSnippet && (
                                <Badge variant="outline" className="text-[10px]">im Master-Projekt</Badge>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="health">
              <Card>
                <CardHeader>
                  <CardTitle>Rollout je Location</CardTitle>
                  <CardDescription>Wer hat welchen Baustein in welcher Version installiert. Rot = Katalog-Version ist neuer als Installation.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tenant</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Template</TableHead>
                        <TableHead>Instanz</TableHead>
                        <TableHead>Installiert</TableHead>
                        <TableHead>Katalog</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Zuletzt gesehen</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {installations.map((row) => {
                        const latest = registry.find((r) => r.template_key === row.template_key)?.version;
                        const outdated = !!(latest && row.installed_version && latest !== row.installed_version);
                        return (
                          <TableRow key={row.id}>
                            <TableCell className="text-xs">{row.tenant_name}</TableCell>
                            <TableCell className="text-xs">{row.location_name}</TableCell>
                            <TableCell className="text-xs font-mono">{row.template_key}</TableCell>
                            <TableCell className="text-xs">{row.instance_id ?? "—"}</TableCell>
                            <TableCell className="text-xs">{row.installed_version ?? "—"}</TableCell>
                            <TableCell className="text-xs">{latest ?? "—"}</TableCell>
                            <TableCell>
                              {outdated
                                ? <Badge variant="destructive" className="text-[10px]">Update</Badge>
                                : <Badge variant="secondary" className="text-[10px]">aktuell</Badge>}
                            </TableCell>
                            <TableCell className="text-xs">
                              {row.last_seen_at ? new Date(row.last_seen_at).toLocaleString("de-DE") : "—"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {installations.length === 0 && (
                        <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">Noch keine Installationen erfasst.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="master">
              <LoxoneMasterProject />
            </TabsContent>

            <TabsContent value="injector">
              <LoxoneInjector />
            </TabsContent>
          </Tabs>

          <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{detail?.title}</DialogTitle>
                <DialogDescription>
                  {detail?.template_key} · v{detail?.version} · {detail && (CATEGORY_LABELS[detail.category] ?? detail.category)}
                </DialogDescription>
              </DialogHeader>
              {detail && (
                <div className="space-y-3 text-sm">
                  {detail.description && <p>{detail.description}</p>}
                  {detail.min_miniserver_fw && (
                    <p className="text-xs text-muted-foreground">Miniserver FW ≥ {detail.min_miniserver_fw}</p>
                  )}
                  {detail.changelog && (
                    <div>
                      <p className="text-xs font-semibold mb-1">Changelog</p>
                      <pre className="text-xs bg-muted p-2 rounded whitespace-pre-wrap">{detail.changelog}</pre>
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-semibold mb-1">Rollout</p>
                    <p className="text-xs">
                      {health.get(detail.template_key)?.total ?? 0} Installationen ·{" "}
                      {health.get(detail.template_key)?.outdated ?? 0} veraltet
                    </p>
                  </div>
                  {SNIPPET_KEYS.has(detail.template_key) && (
                    <Badge variant="outline" className="text-[10px]">im Master-Projekt enthalten</Badge>
                  )}
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </main>
    </div>
  );
}
