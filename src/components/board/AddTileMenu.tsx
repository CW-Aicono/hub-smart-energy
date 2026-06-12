import { Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { TILE_CATALOG, CATEGORY_LABELS, type TileMeta } from "./tileCatalog";

interface Props {
  existing: string[];
  onAdd: (id: string) => void;
}

export default function AddTileMenu({ existing, onAdd }: Props) {
  const grouped = Object.values(TILE_CATALOG).reduce<Record<string, TileMeta[]>>((acc, t) => {
    (acc[t.category] ||= []).push(t);
    return acc;
  }, {});

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Kachel</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 max-h-[70vh] overflow-y-auto">
        {Object.entries(grouped).map(([cat, items]) => (
          <div key={cat}>
            <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
              {CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS]}
            </DropdownMenuLabel>
            {items.map((t) => {
              const inUse = existing.includes(t.id);
              return (
                <DropdownMenuItem
                  key={t.id}
                  disabled={inUse}
                  onClick={() => onAdd(t.id)}
                  className="flex items-center gap-2"
                >
                  <t.icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="flex-1">{t.title}</span>
                  {inUse && <span className="text-[10px] text-muted-foreground">aktiv</span>}
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
