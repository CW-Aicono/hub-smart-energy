import { useState, useMemo } from "react";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { TableHead } from "@/components/ui/table";


export type SortDirection = "asc" | "desc";

export interface SortState<K extends string> {
  key: K | null;
  direction: SortDirection;
}

/** Generic hook for column sorting. Pass a getter that maps a row + key to a value. */
export function useSortableData<T, K extends string>(
  rows: T[],
  getValue: (row: T, key: K) => unknown,
  initial?: SortState<K>,
) {
  const [sort, setSort] = useState<SortState<K>>(initial ?? { key: null, direction: "asc" });

  const toggle = (key: K) => {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" },
    );
  };

  const sorted = useMemo(() => {
    if (!sort.key) return rows;
    const dir = sort.direction === "asc" ? 1 : -1;
    const arr = [...rows];
    arr.sort((a, b) => {
      const av = getValue(a, sort.key as K);
      const bv = getValue(b, sort.key as K);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      if (av instanceof Date && bv instanceof Date) return (av.getTime() - bv.getTime()) * dir;
      return String(av).localeCompare(String(bv), "de", { sensitivity: "base", numeric: true }) * dir;
    });
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort.key, sort.direction]);

  return { sorted, sort, toggle };
}

/** Clickable table-header button with sort indicator. Backwards-compatible props. */
export function SortableHead<K extends string>({
  label,
  children,
  sortKey,
  column,
  sort,
  current,
  onToggle,
  onSort,
  align,
  className,
}: {
  label?: React.ReactNode;
  children?: React.ReactNode;
  sortKey?: K;
  column?: K;
  sort?: SortState<K>;
  current?: SortState<K>;
  onToggle?: (k: K) => void;
  onSort?: (k: K) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const key = (sortKey ?? column) as K;
  const toggle = onToggle ?? onSort ?? (() => {});
  const content = label ?? children;
  const state = (sort ?? current ?? { key: null, direction: "asc" }) as SortState<K>;
  const isActive = state.key === key;
  const Icon = !isActive ? ArrowUpDown : state.direction === "asc" ? ArrowUp : ArrowDown;

  return (
    <TableHead className={cn(align === "right" && "text-right", className)}>
      <button
        type="button"
        onClick={() => toggle(key)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          isActive && "text-foreground",
        )}
      >
        {content}
        <Icon className="h-3 w-3 opacity-60" />
      </button>
    </TableHead>
  );
}


