import * as React from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface RowAction {
  label: string;
  /** lucide icon component, e.g. Pencil */
  icon?: React.ComponentType<{ className?: string }>;
  onClick?: () => void;
  variant?: "default" | "destructive";
  disabled?: boolean;
  hidden?: boolean;
  /** Render a custom node instead of a menu item (e.g. an AlertDialogTrigger). */
  render?: React.ReactNode;
}

interface RowActionsProps {
  items: RowAction[];
  align?: "start" | "end";
  className?: string;
  label?: string;
}

/**
 * Einheitliches Drei-Punkte-Menü für Tabellenzeilen.
 * Vorlage: Lade-Nutzer-Tabelle. Destruktive Aktionen werden ans Ende
 * gesetzt und durch eine Trennlinie abgesetzt.
 */
export function RowActions({ items, align = "end", className, label = "Aktionen" }: RowActionsProps) {
  const visible = items.filter((i) => !i.hidden);
  if (visible.length === 0) return null;

  const normal = visible.filter((i) => i.variant !== "destructive");
  const destructive = visible.filter((i) => i.variant === "destructive");

  const renderItem = (item: RowAction, key: React.Key) => {
    if (item.render) return <React.Fragment key={key}>{item.render}</React.Fragment>;
    const Icon = item.icon;
    return (
      <DropdownMenuItem
        key={key}
        disabled={item.disabled}
        onClick={(e) => {
          e.stopPropagation();
          item.onClick?.();
        }}
        className={cn(item.variant === "destructive" && "text-destructive focus:text-destructive")}
      >
        {Icon && <Icon className="h-4 w-4 mr-2" />}
        {item.label}
      </DropdownMenuItem>
    );
  };

  return (
    <div className={cn("flex justify-end", className)} onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={label} className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="bg-popover z-50">
          {normal.map((item, i) => renderItem(item, `n-${i}`))}
          {normal.length > 0 && destructive.length > 0 && <DropdownMenuSeparator />}
          {destructive.map((item, i) => renderItem(item, `d-${i}`))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default RowActions;
