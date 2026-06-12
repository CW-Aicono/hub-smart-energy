import { useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/hooks/useTenant";
import { useTenantModules } from "@/hooks/useTenantModules";
import {
  useBoardThemes,
  useBoardTemplates,
  useBoardUserLayout,
} from "@/hooks/useBoard";
import BoardThemeScope from "@/components/board/BoardThemeScope";
import BoardHeader from "@/components/board/BoardHeader";
import BentoGrid from "@/components/board/BentoGrid";

/**
 * Phase-2-Einstieg für das C-Level-Dashboard.
 * - Lädt Themes, Templates und User-Layout
 * - Initialisiert beim ersten Besuch automatisch ein CEO-Layout
 * - Rendert Bento-Grid mit Platzhalter-Kacheln (echte KPIs → Phase 3)
 */
export default function BoardHome() {
  const { user, loading: authLoading } = useAuth();
  const { tenant, loading: tenantLoading } = useTenant();
  const { isModuleActive, loading: modulesLoading } = useTenantModules();
  const { themes, loading: themesLoading } = useBoardThemes();
  const { templates, loading: templatesLoading } = useBoardTemplates();
  const { layout, loading: layoutLoading, upsert } = useBoardUserLayout();
  const navigate = useNavigate();

  // Erstes-Mal-Setup: CEO-Template + erstes verfügbares Theme
  useEffect(() => {
    if (layoutLoading || templatesLoading || themesLoading) return;
    if (layout) return;
    if (!user?.id || !tenant?.id) return;
    if (!templates.length) return;
    const ceo = templates.find((t) => t.code === "ceo") ?? templates[0];
    upsert({
      template_code: ceo.code,
      tiles: ceo.default_layout.tiles,
      theme_id: themes[0]?.id ?? null,
      theme_mode: "system",
    });
  }, [layout, layoutLoading, templates, templatesLoading, themes, themesLoading, user?.id, tenant?.id, upsert]);

  if (authLoading || tenantLoading) {
    return <div className="min-h-screen flex items-center justify-center">Lädt …</div>;
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (!tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        Kein Tenant-Zugriff für diesen Account.
      </div>
    );
  }

  if (!modulesLoading && !isModuleActive("c_level_dashboard")) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-xl font-semibold">C-Level Dashboard nicht aktiviert</h1>
        <p className="text-muted-foreground max-w-md">
          Dieses Modul ist für deinen Tenant noch nicht freigeschaltet.
          Bitte wende dich an deinen AICONO-Ansprechpartner.
        </p>
        <button
          className="text-sm underline"
          onClick={() => navigate("/")}
        >
          Zurück zur Hauptanwendung
        </button>
      </div>
    );
  }

  const activeTemplate =
    templates.find((t) => t.code === layout?.template_code) ?? templates[0];
  const tiles = layout?.tiles?.length
    ? layout.tiles
    : activeTemplate?.default_layout.tiles ?? [];

  const activeTheme = themes.find((t) => t.id === layout?.theme_id) ?? themes[0] ?? null;

  return (
    <BoardThemeScope theme={activeTheme} mode={layout?.theme_mode ?? "system"}>
      <BoardHeader
        themes={themes}
        templates={templates}
        layout={layout}
        onChangeTemplate={(code) => {
          const t = templates.find((x) => x.code === code);
          upsert({
            template_code: code,
            tiles: t?.default_layout.tiles ?? [],
          });
        }}
        onChangeTheme={(themeId) => upsert({ theme_id: themeId })}
        onChangeMode={(mode) => upsert({ theme_mode: mode })}
      />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <BentoGrid tiles={tiles} />
        <p className="mt-8 text-center text-xs text-[hsl(var(--board-muted))]">
          Phase 2: Layout & Themes aktiv · KPI-Daten folgen in Phase 3
        </p>
      </main>
    </BoardThemeScope>
  );
}
