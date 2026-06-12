import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/hooks/useTenant";

export interface BoardTheme {
  id: string;
  tenant_id: string | null;
  name: string;
  colors_light: Record<string, string>;
  colors_dark: Record<string, string>;
  is_system: boolean;
}

export interface BoardTemplate {
  id: string;
  code: string;
  name: string;
  description: string | null;
  default_layout: { tiles: Array<{ id: string; size: "S" | "M" | "L" }> };
  sort_order: number;
}

export interface BoardUserLayout {
  id: string;
  user_id: string;
  tenant_id: string;
  template_code: string;
  tiles: Array<{ id: string; size: "S" | "M" | "L" }>;
  theme_id: string | null;
  theme_mode: "light" | "dark" | "system";
}

/** Liefert alle für den User sichtbaren Themes (System + Tenant). */
export function useBoardThemes() {
  const [themes, setThemes] = useState<BoardTheme[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("board_themes")
        .select("*")
        .order("is_system", { ascending: false })
        .order("name");
      if (!cancelled && data) setThemes(data as unknown as BoardTheme[]);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { themes, loading };
}

/** Liefert alle vordefinierten Templates. */
export function useBoardTemplates() {
  const [templates, setTemplates] = useState<BoardTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("board_templates")
        .select("*")
        .order("sort_order");
      if (!cancelled && data) setTemplates(data as unknown as BoardTemplate[]);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { templates, loading };
}

/** Layout des aktuellen Users für seinen aktuellen Tenant. */
export function useBoardUserLayout() {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const [layout, setLayout] = useState<BoardUserLayout | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user?.id || !tenant?.id) return;
    const { data } = await supabase
      .from("board_user_layouts")
      .select("*")
      .eq("user_id", user.id)
      .eq("tenant_id", tenant.id)
      .maybeSingle();
    setLayout((data as unknown as BoardUserLayout) ?? null);
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, tenant?.id]);

  const upsert = async (patch: Partial<BoardUserLayout>) => {
    if (!user?.id || !tenant?.id) return;
    const payload = {
      user_id: user.id,
      tenant_id: tenant.id,
      template_code: patch.template_code ?? layout?.template_code ?? "ceo",
      tiles: (patch.tiles ?? layout?.tiles ?? []) as never,
      theme_id: patch.theme_id ?? layout?.theme_id ?? null,
      theme_mode: patch.theme_mode ?? layout?.theme_mode ?? "system",
    };
    const { data } = await supabase
      .from("board_user_layouts")
      .upsert(payload, { onConflict: "user_id,tenant_id" })
      .select()
      .single();
    if (data) setLayout(data as unknown as BoardUserLayout);
  };

  return { layout, loading, upsert, reload: load };
}
