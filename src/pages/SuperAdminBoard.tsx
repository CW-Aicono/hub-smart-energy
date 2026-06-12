import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import SuperAdminSidebar from "@/components/super-admin/SuperAdminSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  ThemeEditor,
  EMPTY_LIGHT,
  EMPTY_DARK,
  type Theme,
} from "@/components/settings/BoardThemesSettings";

interface TenantRow {
  id: string;
  name: string;
  enabled: boolean;
}

const MODULE_CODE = "c_level_dashboard";

export default function SuperAdminBoard() {
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [themesLoading, setThemesLoading] = useState(true);

  const loadTenants = async () => {
    setLoading(true);
    const [{ data: t }, { data: mods }] = await Promise.all([
      supabase.from("tenants").select("id, name").order("name"),
      supabase
        .from("tenant_modules")
        .select("tenant_id, is_enabled")
        .eq("module_code", MODULE_CODE),
    ]);
    const map = new Map((mods ?? []).map((m: any) => [m.tenant_id, m.is_enabled]));
    setTenants(
      (t ?? []).map((x: any) => ({ id: x.id, name: x.name, enabled: !!map.get(x.id) })),
    );
    setLoading(false);
  };

  const loadThemes = async () => {
    setThemesLoading(true);
    const { data } = await supabase
      .from("board_themes")
      .select("*")
      .eq("is_system", true)
      .order("name");
    setThemes((data as unknown as Theme[]) ?? []);
    setThemesLoading(false);
  };

  useEffect(() => {
    loadTenants();
    loadThemes();
  }, []);

  const toggle = async (tenant: TenantRow, enabled: boolean) => {
    setTenants((rows) => rows.map((r) => (r.id === tenant.id ? { ...r, enabled } : r)));
    const { data: existing } = await supabase
      .from("tenant_modules")
      .select("id")
      .eq("tenant_id", tenant.id)
      .eq("module_code", MODULE_CODE)
      .maybeSingle();
    let error;
    if (existing) {
      ({ error } = await supabase
        .from("tenant_modules")
        .update({ is_enabled: enabled })
        .eq("id", existing.id));
    } else {
      ({ error } = await supabase
        .from("tenant_modules")
        .insert({ tenant_id: tenant.id, module_code: MODULE_CODE, is_enabled: enabled }));
    }
    if (error) {
      toast.error(error.message);
      loadTenants();
    } else {
      toast.success(`${tenant.name}: C-Level Dashboard ${enabled ? "aktiviert" : "deaktiviert"}`);
    }
  };

  const saveTheme = async (t: Theme): Promise<void> => {
    const { error } = await supabase
      .from("board_themes")
      .update({
        name: t.name,
        colors_light: t.colors_light as never,
        colors_dark: t.colors_dark as never,
      })
      .eq("id", t.id);
    if (error) { toast.error(error.message); return; }
    toast.success("System-Theme gespeichert");
    loadThemes();
  };

  const deleteTheme = async (id: string): Promise<void> => {
    if (!confirm("System-Theme wirklich löschen? Es steht dann keinem Tenant mehr zur Verfügung.")) return;
    const { error } = await supabase.from("board_themes").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Theme gelöscht");
    loadThemes();
  };

  const createTheme = async (base?: Theme): Promise<void> => {
    const { error } = await supabase.from("board_themes").insert({
      tenant_id: null,
      is_system: true,
      name: base ? `${base.name} (Kopie)` : "Neues System-Theme",
      colors_light: (base?.colors_light ?? EMPTY_LIGHT) as never,
      colors_dark: (base?.colors_dark ?? EMPTY_DARK) as never,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("System-Theme angelegt");
    loadThemes();
  };

  const filtered = tenants.filter((t) => t.name.toLowerCase().includes(filter.toLowerCase()));
  const activeCount = tenants.filter((t) => t.enabled).length;

  return (
    <div className="flex min-h-screen bg-background">
      <SuperAdminSidebar />
      <main className="flex-1 overflow-auto p-4 md:p-8 space-y-8">
        <header>
          <h1 className="text-2xl font-display font-bold">C-Level Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Modul-Freischaltung pro Tenant und Pflege der mitgelieferten System-Themes.
          </p>
        </header>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Tenant-Freischaltung</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                {activeCount} von {tenants.length} Tenants haben das C-Level Dashboard aktiv.
              </p>
            </div>
            <div className="relative w-64 max-w-full">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Tenant suchen …"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-sm text-muted-foreground">Lädt …</div>
            ) : filtered.length === 0 ? (
              <div className="text-sm text-muted-foreground">Keine Tenants gefunden.</div>
            ) : (
              <div className="divide-y">
                {filtered.map((t) => (
                  <div key={t.id} className="flex items-center justify-between py-2.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-medium truncate">{t.name}</span>
                      {t.enabled && <Badge variant="secondary">aktiv</Badge>}
                    </div>
                    <Switch
                      checked={t.enabled}
                      onCheckedChange={(v) => toggle(t, v)}
                      aria-label={`C-Level Dashboard für ${t.name}`}
                    />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">System-Themes</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Diese Themes stehen allen Tenants im C-Level Dashboard zur Verfügung.
              Tenant-Admins können eigene Themes auf Basis dieser Vorlagen erstellen.
            </p>
            <div className="flex flex-wrap gap-2 pt-3">
              <Button size="sm" onClick={() => createTheme()} className="gap-2">
                <Plus className="h-4 w-4" /> Leeres System-Theme
              </Button>
              {themes.map((t) => (
                <Button
                  key={t.id}
                  size="sm"
                  variant="outline"
                  onClick={() => createTheme(t)}
                  className="gap-2"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Von „{t.name}“ kopieren
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {themesLoading ? (
              <div className="text-sm text-muted-foreground">Lädt …</div>
            ) : themes.length === 0 ? (
              <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                Keine System-Themes vorhanden.
              </div>
            ) : (
              themes.map((t) => (
                <ThemeEditor
                  key={t.id}
                  theme={t}
                  onSave={saveTheme}
                  onDelete={() => deleteTheme(t.id)}
                />
              ))
            )}
            <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
              <Trash2 className="h-3 w-3" /> Löschen entfernt das Theme aus allen Tenants; bereits zugewiesene User-Layouts fallen auf das nächste verfügbare Theme zurück.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
