import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";

export type Colors = {
  background: string;
  card: string;
  foreground: string;
  muted: string;
  accent: string;
  success: string;
  border: string;
};

export interface Theme {
  id: string;
  tenant_id: string | null;
  name: string;
  colors_light: Colors;
  colors_dark: Colors;
  is_system: boolean;
}

const COLOR_KEYS: Array<{ key: keyof Colors; label: string }> = [
  { key: "background", label: "Hintergrund" },
  { key: "card", label: "Karte" },
  { key: "foreground", label: "Text" },
  { key: "muted", label: "Sekundärtext" },
  { key: "accent", label: "Akzent" },
  { key: "success", label: "Erfolg" },
  { key: "border", label: "Rahmen" },
];

export const EMPTY_LIGHT: Colors = {
  background: "220 20% 98%", card: "0 0% 100%", foreground: "220 25% 12%",
  muted: "220 15% 45%", accent: "199 89% 48%", success: "152 55% 42%", border: "220 15% 90%",
};
export const EMPTY_DARK: Colors = {
  background: "222 25% 8%", card: "222 22% 12%", foreground: "220 15% 95%",
  muted: "220 10% 65%", accent: "199 89% 55%", success: "152 55% 50%", border: "222 18% 18%",
};

/** HSL "H S% L%" → CSS color */
const hsl = (v: string) => `hsl(${v})`;

function ColorField({
  value, onChange, label,
}: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="h-7 w-7 shrink-0 rounded-md border"
        style={{ background: hsl(value) }}
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <Label className="text-[11px] text-muted-foreground">{label}</Label>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="220 20% 98%"
          className="h-8 font-mono text-xs"
        />
      </div>
    </div>
  );
}

export function ThemeEditor({
  theme, onSave, onDelete,
}: { theme: Theme; onSave: (t: Theme) => Promise<void>; onDelete?: () => Promise<void> }) {
  const [draft, setDraft] = useState<Theme>(theme);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(theme), [theme]);

  const patch = (mode: "light" | "dark", key: keyof Colors, value: string) =>
    setDraft((d) => ({
      ...d,
      [mode === "light" ? "colors_light" : "colors_dark"]: {
        ...(mode === "light" ? d.colors_light : d.colors_dark),
        [key]: value,
      },
    }));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <Input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className="h-9 font-semibold"
          />
        </div>
        <div className="flex items-center gap-2">
          {onDelete && (
            <Button variant="ghost" size="icon" onClick={onDelete} title="Löschen">
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          )}
          <Button
            size="sm"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try { await onSave(draft); } finally { setSaving(false); }
            }}
          >
            {saving ? "Speichert …" : "Speichern"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid md:grid-cols-2 gap-6">
          {(["light", "dark"] as const).map((mode) => {
            const colors = mode === "light" ? draft.colors_light : draft.colors_dark;
            return (
              <div key={mode} className="space-y-3">
                <div className="text-sm font-medium capitalize">
                  {mode === "light" ? "Hell" : "Dunkel"}
                </div>
                <div
                  className="rounded-xl border p-4 space-y-2"
                  style={{ background: hsl(colors.background), color: hsl(colors.foreground), borderColor: hsl(colors.border) }}
                >
                  <div
                    className="rounded-lg p-3"
                    style={{ background: hsl(colors.card), borderColor: hsl(colors.border) }}
                  >
                    <div className="text-[10px] uppercase tracking-wider" style={{ color: hsl(colors.muted) }}>
                      Vorschau
                    </div>
                    <div className="text-2xl font-semibold tabular-nums">12.480 €</div>
                    <div className="mt-2 inline-block rounded-full px-2 py-0.5 text-[11px]"
                      style={{ background: hsl(colors.accent), color: hsl(colors.background) }}>
                      Akzent
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {COLOR_KEYS.map(({ key, label }) => (
                    <ColorField
                      key={key}
                      label={label}
                      value={colors[key]}
                      onChange={(v) => patch(mode, key, v)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-[11px] text-muted-foreground">
          Farben im Format <code className="font-mono">H S% L%</code> (HSL), z. B. <code className="font-mono">220 20% 98%</code>.
        </p>
      </CardContent>
    </Card>
  );
}

export function BoardThemesSettings() {
  const { tenant } = useTenant();
  const [themes, setThemes] = useState<Theme[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("board_themes")
      .select("*")
      .order("is_system", { ascending: false })
      .order("name");
    if (error) toast.error("Themes konnten nicht geladen werden");
    setThemes((data as unknown as Theme[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [tenant?.id]);

  const systemThemes = themes.filter((t) => t.is_system);
  const tenantThemes = themes.filter((t) => !t.is_system && t.tenant_id === tenant?.id);

  const save = async (t: Theme) => {
    if (!tenant?.id) return;
    const { error } = await supabase
      .from("board_themes")
      .update({
        name: t.name,
        colors_light: t.colors_light as never,
        colors_dark: t.colors_dark as never,
      })
      .eq("id", t.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Theme gespeichert");
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Theme wirklich löschen?")) return;
    const { error } = await supabase.from("board_themes").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Theme gelöscht");
    load();
  };

  const create = async (base?: Theme) => {
    if (!tenant?.id) return;
    const { error } = await supabase.from("board_themes").insert({
      tenant_id: tenant.id,
      name: base ? `${base.name} (Kopie)` : "Neues Theme",
      colors_light: (base?.colors_light ?? EMPTY_LIGHT) as never,
      colors_dark: (base?.colors_dark ?? EMPTY_DARK) as never,
      is_system: false,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Theme angelegt");
    load();
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Lädt …</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">C-Level Dashboard — Themes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Die drei mitgelieferten <strong>System-Themes</strong> (Executive, Editorial, Boardroom)
            stehen allen Nutzern zur Verfügung und können nicht verändert werden. Du kannst beliebig
            viele <strong>eigene Themes</strong> für deinen Tenant anlegen — jeweils mit Farben für
            Hell- und Dunkelmodus.
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button size="sm" onClick={() => create()} className="gap-2">
              <Plus className="h-4 w-4" /> Leeres Theme anlegen
            </Button>
            {systemThemes.map((t) => (
              <Button
                key={t.id}
                size="sm"
                variant="outline"
                onClick={() => create(t)}
                className="gap-2"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Von „{t.name}“ kopieren
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div>
        <h3 className="text-sm font-semibold mb-3">System-Themes (nur lesen)</h3>
        <div className="grid gap-3 md:grid-cols-3">
          {systemThemes.map((t) => (
            <Card key={t.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{t.name}</span>
                  <span className="text-[10px] uppercase text-muted-foreground">System</span>
                </div>
                <div className="flex gap-1">
                  {["background","card","accent","success","foreground"].map((k) => (
                    <span key={k} className="h-5 flex-1 rounded"
                      style={{ background: hsl((t.colors_light as Colors)[k as keyof Colors]) }} />
                  ))}
                </div>
                <div className="flex gap-1">
                  {["background","card","accent","success","foreground"].map((k) => (
                    <span key={k} className="h-5 flex-1 rounded"
                      style={{ background: hsl((t.colors_dark as Colors)[k as keyof Colors]) }} />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-3">
          Eigene Themes ({tenantThemes.length})
        </h3>
        {tenantThemes.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            Noch keine eigenen Themes. Lege oben ein leeres Theme an oder kopiere eines der System-Themes.
          </div>
        ) : (
          <div className="space-y-4">
            {tenantThemes.map((t) => (
              <ThemeEditor
                key={t.id}
                theme={t}
                onSave={save}
                onDelete={() => remove(t.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
