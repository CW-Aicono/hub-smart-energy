import { Sun, Moon, Monitor, Palette, LayoutTemplate, LogOut, Pencil, Check, RotateCcw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import type { BoardTheme, BoardTemplate, BoardUserLayout } from "@/hooks/useBoard";
import AddTileMenu from "./AddTileMenu";

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
}: Props) {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const currentTemplate = templates.find((t) => t.code === layout?.template_code);
  const currentTheme = themes.find((t) => t.id === layout?.theme_id) ?? themes[0];

  const ModeIcon =
    layout?.theme_mode === "dark" ? Moon : layout?.theme_mode === "light" ? Sun : Monitor;

  return (
    <header className="sticky top-0 z-30 border-b border-[hsl(var(--board-border))] bg-[hsl(var(--board-background))]/85 backdrop-blur">
      <div className="mx-auto max-w-7xl flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="text-xs uppercase tracking-[0.2em] text-[hsl(var(--board-muted))]">
            AICONO C-Level
          </div>
          <div className="text-lg font-semibold truncate">
            {currentTemplate?.name ?? "Board"}
          </div>
        </div>

        {/* Template-Auswahl */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2">
              <LayoutTemplate className="h-4 w-4" />
              <span className="hidden sm:inline">Template</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>Vorlage wählen</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {templates.map((t) => (
              <DropdownMenuItem
                key={t.code}
                onClick={() => onChangeTemplate(t.code)}
                className="flex flex-col items-start gap-0.5 py-2"
              >
                <span className="font-medium">
                  {t.name}
                  {layout?.template_code === t.code && " ✓"}
                </span>
                {t.description && (
                  <span className="text-xs text-muted-foreground line-clamp-2">
                    {t.description}
                  </span>
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Theme-Auswahl */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2">
              <Palette className="h-4 w-4" />
              <span className="hidden sm:inline">{currentTheme?.name ?? "Theme"}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Farbschema</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {themes.map((t) => (
              <DropdownMenuItem key={t.id} onClick={() => onChangeTheme(t.id)}>
                <span className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 rounded-full border"
                    style={{ background: `hsl(${t.colors_light.accent})` }}
                  />
                  {t.name}
                  {layout?.theme_id === t.id && " ✓"}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Light / Dark / System */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Hell/Dunkel">
              <ModeIcon className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onChangeMode("light")}>
              <Sun className="mr-2 h-4 w-4" /> Hell
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onChangeMode("dark")}>
              <Moon className="mr-2 h-4 w-4" /> Dunkel
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onChangeMode("system")}>
              <Monitor className="mr-2 h-4 w-4" /> System
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {editMode && (
          <>
            <AddTileMenu existing={tileIds} onAdd={onAddTile} />
            <Button
              variant="ghost"
              size="sm"
              className="gap-2"
              onClick={onResetTemplate}
              title="Layout auf Template zurücksetzen"
            >
              <RotateCcw className="h-4 w-4" />
              <span className="hidden sm:inline">Reset</span>
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
          <span className="hidden sm:inline">{editMode ? "Fertig" : "Anpassen"}</span>
        </Button>

        <Button
          variant="ghost"
          size="icon"
          aria-label="Abmelden"
          onClick={async () => {
            await signOut();
            navigate("/auth");
          }}
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
