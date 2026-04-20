import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Loader2, Pencil, Check, X, GripVertical } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface CatalogItem {
  id: string;
  hersteller: string;
  modell: string;
}

interface Compat {
  id: string;
  source_device_id: string;
  target_device_id: string;
  relation_type: string;
  auto_quantity_formula: string;
  prio: number;
  notiz: string | null;
}

interface Props {
  sourceDeviceId: string;
}

const RELATION_STYLES: Record<string, { label: string; className: string }> = {
  requires: {
    label: "Pflicht",
    className: "bg-destructive text-destructive-foreground hover:bg-destructive",
  },
  recommends: {
    label: "Empfehlung",
    className:
      "bg-amber-500 text-white hover:bg-amber-500 dark:bg-amber-500 dark:text-white",
  },
  alternative: {
    label: "Alternative",
    className:
      "bg-emerald-600 text-white hover:bg-emerald-600 dark:bg-emerald-600 dark:text-white",
  },
};

function RelationBadge({ type }: { type: string }) {
  const s = RELATION_STYLES[type] ?? RELATION_STYLES.requires;
  return <Badge className={s.className}>{s.label}</Badge>;
}

interface RowProps {
  it: Compat;
  target: CatalogItem | undefined;
  onEdit: (it: Compat) => void;
  onRemove: (id: string) => void;
}

function SortableRow({ it, target, onEdit, onRemove }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: it.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-md border bg-card p-2 text-sm"
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
        {...attributes}
        {...listeners}
        title="Ziehen zum Sortieren"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <RelationBadge type={it.relation_type} />
      <div className="flex-1 min-w-0">
        <div className="truncate">{target ? `${target.hersteller} ${target.modell}` : it.target_device_id}</div>
        {it.notiz && <div className="text-xs text-muted-foreground truncate">{it.notiz}</div>}
      </div>
      <Badge variant="outline" className="text-xs">{it.auto_quantity_formula}</Badge>
      <Button size="icon" variant="ghost" onClick={() => onEdit(it)} title="Bearbeiten">
        <Pencil className="h-4 w-4" />
      </Button>
      <Button size="icon" variant="ghost" onClick={() => onRemove(it.id)} title="Löschen">
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );
}

export function CompatibilityEditor({ sourceDeviceId }: Props) {
  const [items, setItems] = useState<Compat[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newTarget, setNewTarget] = useState("");
  const [newRel, setNewRel] = useState("requires");
  const [newQty, setNewQty] = useState("1");
  const [newNotiz, setNewNotiz] = useState("");

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRel, setEditRel] = useState("requires");
  const [editQty, setEditQty] = useState("1");
  const [editNotiz, setEditNotiz] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const load = async () => {
    setLoading(true);
    const [c, cat] = await Promise.all([
      supabase
        .from("device_compatibility")
        .select("*")
        .eq("source_device_id", sourceDeviceId)
        .order("prio")
        .order("created_at"),
      supabase.from("device_catalog").select("id, hersteller, modell").eq("is_active", true).order("hersteller"),
    ]);
    setItems((c.data ?? []) as Compat[]);
    setCatalog((cat.data ?? []) as CatalogItem[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [sourceDeviceId]);

  const add = async () => {
    if (!newTarget) return;
    setAdding(true);
    const nextPrio = (items.reduce((m, x) => Math.max(m, x.prio ?? 0), 0) ?? 0) + 1;
    const { error } = await supabase.from("device_compatibility").insert({
      source_device_id: sourceDeviceId,
      target_device_id: newTarget,
      relation_type: newRel,
      auto_quantity_formula: newQty || "1",
      notiz: newNotiz.trim() || null,
      prio: nextPrio,
    });
    setAdding(false);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
      return;
    }
    setNewTarget(""); setNewQty("1"); setNewNotiz("");
    load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("device_compatibility").delete().eq("id", id);
    if (error) toast({ title: "Fehler", description: error.message, variant: "destructive" });
    else load();
  };

  const startEdit = (it: Compat) => {
    setEditingId(it.id);
    setEditRel(it.relation_type);
    setEditQty(it.auto_quantity_formula || "1");
    setEditNotiz(it.notiz ?? "");
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = async (id: string) => {
    setSavingEdit(true);
    const { error } = await supabase
      .from("device_compatibility")
      .update({
        relation_type: editRel,
        auto_quantity_formula: editQty || "1",
        notiz: editNotiz.trim() || null,
      })
      .eq("id", id);
    setSavingEdit(false);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
      return;
    }
    setEditingId(null);
    load();
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(items, oldIndex, newIndex).map((it, idx) => ({
      ...it,
      prio: idx + 1,
    }));
    setItems(reordered);

    // Persist new prio for all items
    const updates = await Promise.all(
      reordered.map((it) =>
        supabase.from("device_compatibility").update({ prio: it.prio }).eq("id", it.id),
      ),
    );
    const failed = updates.find((u) => u.error);
    if (failed?.error) {
      toast({ title: "Sortierung nicht gespeichert", description: failed.error.message, variant: "destructive" });
      load();
    }
  };

  if (loading) return <div className="text-sm text-muted-foreground">Lade…</div>;

  const catMap = new Map(catalog.map((c) => [c.id, c]));

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        {items.length === 0 ? (
          <div className="text-sm text-muted-foreground py-2">Noch keine Beziehungen.</div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              {items.map((it) => {
                const t = catMap.get(it.target_device_id);
                if (editingId === it.id) {
                  return (
                    <div key={it.id} className="rounded-md border border-primary/40 bg-primary/5 p-2 space-y-2">
                      <div className="text-sm font-medium truncate">
                        {t ? `${t.hersteller} ${t.modell}` : it.target_device_id}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">Beziehung</Label>
                          <Select value={editRel} onValueChange={setEditRel}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="requires">Pflicht</SelectItem>
                              <SelectItem value="recommends">Empfehlung</SelectItem>
                              <SelectItem value="alternative">Alternative</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Menge / Formel</Label>
                          <Input value={editQty} onChange={(e) => setEditQty(e.target.value)} />
                        </div>
                        <div className="col-span-2">
                          <Label className="text-xs">Notiz</Label>
                          <Input value={editNotiz} onChange={(e) => setEditNotiz(e.target.value)} placeholder="optional" />
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={savingEdit}>
                          <X className="h-4 w-4 mr-1" /> Abbrechen
                        </Button>
                        <Button size="sm" onClick={() => saveEdit(it.id)} disabled={savingEdit}>
                          {savingEdit ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
                          Speichern
                        </Button>
                      </div>
                    </div>
                  );
                }
                return (
                  <SortableRow key={it.id} it={it} target={t} onEdit={startEdit} onRemove={remove} />
                );
              })}
            </SortableContext>
          </DndContext>
        )}
      </div>

      <div className="rounded-md border p-3 space-y-2">
        <div className="text-sm font-medium">Beziehung hinzufügen</div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Ziel-Gerät</Label>
            <Select value={newTarget} onValueChange={setNewTarget}>
              <SelectTrigger><SelectValue placeholder="Gerät wählen" /></SelectTrigger>
              <SelectContent>
                {catalog.filter((c) => c.id !== sourceDeviceId).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.hersteller} {c.modell}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Beziehung</Label>
            <Select value={newRel} onValueChange={setNewRel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="requires">Pflicht</SelectItem>
                <SelectItem value="recommends">Empfehlung</SelectItem>
                <SelectItem value="alternative">Alternative</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Menge / Formel</Label>
            <Input value={newQty} onChange={(e) => setNewQty(e.target.value)} placeholder="1 oder ceil(source.menge/8)" />
          </div>
          <div>
            <Label className="text-xs">Notiz</Label>
            <Input value={newNotiz} onChange={(e) => setNewNotiz(e.target.value)} placeholder="optional" />
          </div>
        </div>
        <Button size="sm" onClick={add} disabled={!newTarget || adding} className="w-full">
          {adding ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
          Hinzufügen
        </Button>
      </div>
    </div>
  );
}
