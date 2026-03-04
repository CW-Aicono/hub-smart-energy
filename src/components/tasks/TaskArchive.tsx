import { useState, useMemo } from "react";
import { Task } from "@/hooks/useTasks";
import { TaskCard } from "./TaskCard";
import { Input } from "@/components/ui/input";
import { Search, Archive, ChevronDown, ChevronRight, CalendarDays } from "lucide-react";
import { format, isToday, isYesterday, isThisWeek, isThisMonth } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface TaskArchiveProps {
  tasks: Task[];
}

function getDateGroupLabel(dateStr: string): string {
  const date = new Date(dateStr);
  if (isToday(date)) return "Heute";
  if (isYesterday(date)) return "Gestern";
  if (isThisWeek(date, { weekStartsOn: 1 })) return format(date, "EEEE", { locale: de });
  if (isThisMonth(date)) return format(date, "'KW' w – dd. MMMM", { locale: de });
  return format(date, "MMMM yyyy", { locale: de });
}

function getDateKey(dateStr: string): string {
  return format(new Date(dateStr), "yyyy-MM-dd");
}

export const TaskArchive = ({ tasks }: TaskArchiveProps) => {
  const [search, setSearch] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    if (!search) return tasks;
    const q = search.toLowerCase();
    return tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        t.source_label?.toLowerCase().includes(q)
    );
  }, [tasks, search]);

  // Group by created_at date
  const groups = useMemo(() => {
    const map = new Map<string, { label: string; date: string; tasks: Task[] }>();
    for (const task of filtered) {
      const key = getDateKey(task.created_at);
      if (!map.has(key)) {
        map.set(key, { label: getDateGroupLabel(task.created_at), date: key, tasks: [] });
      }
      map.get(key)!.tasks.push(task);
    }
    // Sort groups by date descending
    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [filtered]);

  const isSearching = search.length > 0;

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Archive className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <h3 className="font-medium text-muted-foreground">Kein Archiv vorhanden</h3>
        <p className="text-sm text-muted-foreground mt-1">Erledigte Aufgaben erscheinen hier automatisch.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Archiv durchsuchen…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          Keine Ergebnisse für „{search}"
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            const isCollapsed = !isSearching && collapsedGroups.has(group.date);
            return (
              <div key={group.date} className="space-y-2">
                {/* Group header */}
                <button
                  onClick={() => toggleGroup(group.date)}
                  className="flex items-center gap-2 w-full text-left py-1.5 px-1 hover:bg-muted/40 rounded-md transition-colors group"
                >
                  {isSearching ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : isCollapsed ? (
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-semibold text-foreground">{group.label}</span>
                  <Badge variant="secondary" className="text-xs ml-auto">
                    {group.tasks.length}
                  </Badge>
                </button>

                {/* Tasks (collapsed or expanded) */}
                {!isCollapsed && (
                  <div className="space-y-2 pl-2 border-l-2 border-muted ml-2">
                    {group.tasks.map((task) => (
                      <TaskCard key={task.id} task={task} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <p className="text-xs text-center text-muted-foreground pt-2">
            {filtered.length} erledigte Aufgaben
          </p>
        </div>
      )}
    </div>
  );
};
