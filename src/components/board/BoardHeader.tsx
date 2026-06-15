import { useState } from "react";
import { Sun, Moon, Monitor, LogOut, Pencil, Check, RotateCcw, Settings, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/hooks/useTenant";
import type { BoardTheme, BoardTemplate, BoardUserLayout } from "@/hooks/useBoard";
import AddTileMenu from "./AddTileMenu";
import { boardT, type BoardLang } from "@/i18n/boardStrings";
import { cn } from "@/lib/utils";

interface Props {
  themes: BoardTheme[];
  templates: BoardTemplate[];
  layout: BoardUserLayout | null;
  onChangeTheme: (themeId: string | null) => void;
  onChangeMode: (mode: "light" | "dark" | "system") => void;
  onChangeTemplate: (code: string) => void;
  editMode: boolean;
  onToggleEdit: () => void;
  onAddTile: (id: string) => void;
  onResetTemplate: () => void;
  tileIds: string[];
  lang?: BoardLang;
}

export default function BoardHeader({
  themes,
  templates,
  layout,
  onChangeTheme,
  onChangeMode,
  onChangeTemplate,
  editMode,
  onToggleEdit,
  onAddTile,
  onResetTemplate,
  tileIds,
  lang = "de",
}: Props) {
  const { signOut } = useAuth();
  const { tenant } = useTenant();
  const navigate = useNavigate();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const tt = (k: Parameters<typeof boardT>[0]) => boardT(k, lang);

  const mode = layout?.theme_mode ?? "system";

  return (
    <header className="sticky top-0 z-30 border-b border-[hsl(var(--board-border))] bg-[hsl(var(--board-background))]/85 backdrop-blur">
      <div className="mx-auto max-w-7xl flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0 flex items-center gap-3">
          {tenant?.logo_url ? (
            <img
              src={tenant.logo_url}
              alt={`${tenant.name} Logo`}
              className="h-9 w-9 rounded-lg object-contain bg-[hsl(var(--board-surface))]"
            />
          ) : (
            <div className="h-9 w-9 rounded-lg bg-[hsl(var(--board-accent))]/15 flex items-center justify-center">
              <Zap className="h-5 w-5 text-[hsl(var(--board-accent))]" />
            </div>
          )}
          <div className="text-lg font-semibold truncate">
            {tenant?.name ?? "Board"}
          </div>
        </div>

        {/* Einstellungen (Vorlage + Theme + Hell/Dunkel) */}
        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={tt("settings")} title={tt("settings")}>
              <Settings className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{tt("settings")}</DialogTitle>
            </DialogHeader>

            <div className="space-y-6 pt-2">
              {/* Vorlage */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">{tt("pickTemplate")}</Label>
                <div className="grid grid-cols-1 gap-2">
                  {templates.map((t) => {
                    const active = layout?.template_code === t.code;
                    return (
                      <button
                        key={t.code}
                        onClick={() => onChangeTemplate(t.code)}
                        className={cn(
                          "flex flex-col items-start gap-0.5 rounded-lg border p-3 text-left transition-colors",
                          active
                            ? "border-[hsl(var(--board-accent))] bg-[hsl(var(--board-accent))]/10"
                            : "border-[hsl(var(--board-border))] hover:bg-[hsl(var(--board-surface))]"
                        )}
                      >
                        <span className="text-sm font-medium">
                          {t.name}
                          {active && " ✓"}
                        </span>
                        {t.description && (
                          <span className="text-xs text-muted-foreground line-clamp-2">
                            {t.description}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Farbschema */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">{tt("colorScheme")}</Label>
                <div className="grid grid-cols-2 gap-2">
                  {themes.map((t) => {
                    const active = layout?.theme_id === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => onChangeTheme(t.id)}
                        className={cn(
                          "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                          active
                            ? "border-[hsl(var(--board-accent))] bg-[hsl(var(--board-accent))]/10"
                            : "border-[hsl(var(--board-border))] hover:bg-[hsl(var(--board-surface))]"
                        )}
                      >
                        <span
                          className="h-4 w-4 rounded-full border"
                          style={{ background: `hsl(${t.colors_light.accent})` }}
                        />
                        <span className="truncate">{t.name}</span>
                        {active && <span className="ml-auto">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Hell / Dunkel / System */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">{tt("appearance")}</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: "light", icon: Sun, label: tt("light") },
                      { id: "dark", icon: Moon, label: tt("dark") },
                      { id: "system", icon: Monitor, label: tt("system") },
                    ] as const
                  ).map(({ id, icon: Icon, label }) => {
                    const active = mode === id;
                    return (
                      <button
                        key={id}
                        onClick={() => onChangeMode(id)}
                        className={cn(
                          "flex flex-col items-center gap-1 rounded-lg border px-3 py-2 text-xs transition-colors",
                          active
                            ? "border-[hsl(var(--board-accent))] bg-[hsl(var(--board-accent))]/10"
                            : "border-[hsl(var(--board-border))] hover:bg-[hsl(var(--board-surface))]"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {editMode && (
          <>
            <AddTileMenu existing={tileIds} onAdd={onAddTile} />
            <Button
              variant="ghost"
              size="sm"
              className="gap-2"
              onClick={onResetTemplate}
              title={tt("resetTitle")}
            >
              <RotateCcw className="h-4 w-4" />
              <span className="hidden sm:inline">{tt("reset")}</span>
            </Button>
          </>
        )}

        <Button
          variant={editMode ? "default" : "ghost"}
          size="sm"
          className="gap-2"
          onClick={onToggleEdit}
        >
          {editMode ? <Check className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
          <span className="hidden sm:inline">{editMode ? tt("done") : tt("customize")}</span>
        </Button>

        <Button
          variant="ghost"
          size="icon"
          aria-label={tt("signOut")}
          onClick={async () => {
            await signOut();
            navigate("/auth?redirect=/board");
          }}
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
