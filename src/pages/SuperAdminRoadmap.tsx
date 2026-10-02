import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import SuperAdminSidebar from "@/components/super-admin/SuperAdminSidebar";
import RoadmapItemSheet from "@/components/super-admin/roadmap/RoadmapItemSheet";
import {
  CATEGORY_LABELS,
  CATEGORY_VARIANT,
  STATUS_LABELS,
  STATUS_ORDER,
} from "@/components/super-admin/roadmap/constants";
import { RoadmapItem, roadmapScore, useRoadmapItems } from "@/hooks/useRoadmapItems";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RowActions } from "@/components/ui/row-actions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ListChecks, Plus, Search, Pencil, Trash2, ArrowRight, CalendarDays } from "lucide-react";
import { format } from "date-fns";

export default function SuperAdminRoadmap() {
  const { user, loading } = useAuth();
  const { items, isLoading, createItem, updateItem, deleteItem } = useRoadmapItems();

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editItem, setEditItem] = useState<RoadmapItem | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (categoryFilter !== "all" && i.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        i.title.toLowerCase().includes(q) ||
        (i.description ?? "").toLowerCase().includes(q) ||
        (i.owner ?? "").toLowerCase().includes(q)
      );
    });
  }, [items, search, categoryFilter]);

  const byStatus = useMemo(() => {
    const map: Record<string, RoadmapItem[]> = {};
    for (const s of STATUS_ORDER) map[s] = [];
    for (const i of filtered) (map[i.status] ??= []).push(i);
    return map;
  }, [filtered]);

  const openNew = () => {
    setEditItem(null);
    setIsNew(true);
    setSheetOpen(true);
  };

  const openEdit = (item: RoadmapItem) => {
    setEditItem(item);
    setIsNew(false);
    setSheetOpen(true);
  };

  const handleSave = (values: Partial<RoadmapItem> & { id?: string }) => {
    if (values.id) {
      const { id, ...rest } = values;
      updateItem.mutate({ id, ...rest });
    } else {
      createItem.mutate(values);
    }
  };

  const openCount = items.filter((i) => i.status !== "done").length;
  const doneCount = items.filter((i) => i.status === "done").length;
  const stabilityCount = items.filter((i) => i.category === "stability" && i.status !== "done").length;

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  const renderCard = (item: RoadmapItem) => (
    <div
      key={item.id}
      draggable
      onDragStart={() => setDragId(item.id)}
      onDragEnd={() => setDragId(null)}
      className="rounded-lg border bg-card p-3 space-y-2 cursor-grab active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <button className="text-left font-medium hover:underline" onClick={() => openEdit(item)}>
          {item.title}
        </button>
        <RowActions
          items={[
            { label: "Bearbeiten", icon: Pencil, onClick: () => openEdit(item) },
            { label: "Löschen", icon: Trash2, variant: "destructive", onClick: () => deleteItem.mutate(item.id) },
          ]}
        />
      </div>
      {item.description && (
        <p className="text-xs text-muted-foreground line-clamp-3">{item.description}</p>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={CATEGORY_VARIANT[item.category] ?? "outline"}>
          {CATEGORY_LABELS[item.category] ?? item.category}
        </Badge>
        <Badge variant="outline">Score {roadmapScore(item).toLocaleString("de-DE")}</Badge>
        {item.owner && <Badge variant="secondary">{item.owner}</Badge>}
        {item.due_date && (
          <Badge variant="outline" className="gap-1">
            <CalendarDays className="h-3 w-3" />
            {format(new Date(item.due_date), "dd.MM.yyyy")}
          </Badge>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen w-full bg-background">
      <SuperAdminSidebar />
      <main className="flex-1 overflow-auto">
        <div className="container mx-auto p-4 md:p-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg bg-primary/10 grid place-items-center">
                <ListChecks className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Roadmap</h1>
                <p className="text-sm text-muted-foreground">
                  Zentrale Liste für Stabilität, Datenqualität und Produktreife
                </p>
              </div>
            </div>
            <Button onClick={openNew}>
              <Plus className="h-4 w-4 mr-2" /> Eintrag anlegen
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Offen</CardTitle></CardHeader>
              <CardContent className="text-2xl font-bold">{openCount.toLocaleString("de-DE")}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Davon Stabilität</CardTitle></CardHeader>
              <CardContent className="text-2xl font-bold">{stabilityCount.toLocaleString("de-DE")}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Erledigt</CardTitle></CardHeader>
              <CardContent className="text-2xl font-bold">{doneCount.toLocaleString("de-DE")}</CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Suchen …"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Kategorien</SelectItem>
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Tabs defaultValue="board">
            <TabsList>
              <TabsTrigger value="board">Board</TabsTrigger>
              <TabsTrigger value="list">Liste</TabsTrigger>
            </TabsList>

            <TabsContent value="board" className="mt-4">
              <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
                {STATUS_ORDER.map((status) => (
                  <div
                    key={status}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragId) updateItem.mutate({ id: dragId, status });
                      setDragId(null);
                    }}
                    className="rounded-lg border bg-muted/30 p-3 space-y-3 min-h-[160px]"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{STATUS_LABELS[status]}</span>
                      <Badge variant="outline">{(byStatus[status]?.length ?? 0).toLocaleString("de-DE")}</Badge>
                    </div>
                    {(byStatus[status] ?? []).map(renderCard)}
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Karten per Drag &amp; Drop in eine andere Spalte ziehen, um den Status zu ändern.
              </p>
            </TabsContent>

            <TabsContent value="list" className="mt-4">
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Titel</TableHead>
                        <TableHead>Kategorie</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Score</TableHead>
                        <TableHead>Verantwortlich</TableHead>
                        <TableHead>Fällig</TableHead>
                        <TableHead className="w-[60px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading && (
                        <TableRow><TableCell colSpan={7} className="text-muted-foreground">Lädt …</TableCell></TableRow>
                      )}
                      {!isLoading && filtered.length === 0 && (
                        <TableRow><TableCell colSpan={7} className="text-muted-foreground">Keine Einträge</TableCell></TableRow>
                      )}
                      {[...filtered]
                        .sort((a, b) => roadmapScore(b) - roadmapScore(a))
                        .map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>
                              <button className="font-medium hover:underline text-left" onClick={() => openEdit(item)}>
                                {item.title}
                              </button>
                            </TableCell>
                            <TableCell>
                              <Badge variant={CATEGORY_VARIANT[item.category] ?? "outline"}>
                                {CATEGORY_LABELS[item.category] ?? item.category}
                              </Badge>
                            </TableCell>
                            <TableCell>{STATUS_LABELS[item.status] ?? item.status}</TableCell>
                            <TableCell className="text-right">{roadmapScore(item).toLocaleString("de-DE")}</TableCell>
                            <TableCell>{item.owner || "—"}</TableCell>
                            <TableCell>{item.due_date ? format(new Date(item.due_date), "dd.MM.yyyy") : "—"}</TableCell>
                            <TableCell>
                              <RowActions
                                items={[
                                  { label: "Bearbeiten", icon: Pencil, onClick: () => openEdit(item) },
                                  {
                                    label: "Nächster Status",
                                    icon: ArrowRight,
                                    onClick: () => {
                                      const idx = STATUS_ORDER.indexOf(item.status as typeof STATUS_ORDER[number]);
                                      const next = STATUS_ORDER[Math.min(STATUS_ORDER.length - 1, idx + 1)];
                                      updateItem.mutate({ id: item.id, status: next });
                                    },
                                  },
                                  {
                                    label: "Löschen",
                                    icon: Trash2,
                                    variant: "destructive",
                                    onClick: () => deleteItem.mutate(item.id),
                                  },
                                ]}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <RoadmapItemSheet
        item={editItem}
        isNew={isNew}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onSave={handleSave}
      />
    </div>
  );
}
