import { useState } from "react";
import { useCustomWidgetDefinitions, CustomWidgetDefinition } from "@/hooks/useCustomWidgetDefinitions";
import { useTranslation } from "@/hooks/useTranslation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, MoreVertical, Pencil, Copy, Trash2, BarChart3, LineChart, Gauge, Activity, Table2 } from "lucide-react";
import { WidgetDesignerDialog } from "./WidgetDesignerDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const CHART_TYPE_ICONS: Record<string, React.ReactNode> = {
  line: <LineChart className="h-5 w-5" />,
  bar: <BarChart3 className="h-5 w-5" />,
  gauge: <Gauge className="h-5 w-5" />,
  kpi: <Activity className="h-5 w-5" />,
  table: <Table2 className="h-5 w-5" />,
};

const CHART_TYPE_LABELS: Record<string, string> = {
  line: "Liniendiagramm",
  bar: "Balkendiagramm",
  gauge: "Gauge",
  kpi: "KPI-Kachel",
  table: "Tabelle",
};

export function WidgetDesigner() {
  const { definitions, isLoading, remove, duplicate } = useCustomWidgetDefinitions();
  const { t } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingWidget, setEditingWidget] = useState<CustomWidgetDefinition | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleEdit = (widget: CustomWidgetDefinition) => {
    setEditingWidget(widget);
    setDialogOpen(true);
  };

  const handleCreate = () => {
    setEditingWidget(null);
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await remove(deleteId);
    setDeleteId(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse text-muted-foreground">{t("common.loading")}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Widget-Designer</h3>
          <p className="text-sm text-muted-foreground">
            Erstellen Sie eigene Widgets für Ihr Dashboard
          </p>
        </div>
        <Button onClick={handleCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Neues Widget
        </Button>
      </div>

      {definitions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <BarChart3 className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h4 className="font-medium mb-1">Keine eigenen Widgets</h4>
            <p className="text-sm text-muted-foreground mb-4">
              Erstellen Sie Ihr erstes Custom Widget, um Ihre Daten individuell zu visualisieren.
            </p>
            <Button onClick={handleCreate} variant="outline" className="gap-2">
              <Plus className="h-4 w-4" />
              Widget erstellen
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {definitions.map((widget) => (
            <Card key={widget.id} className="relative group">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-lg shrink-0"
                      style={{ backgroundColor: `${widget.color}20`, color: widget.color }}
                    >
                      {CHART_TYPE_ICONS[widget.chart_type] || <BarChart3 className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-medium text-sm truncate">{widget.name}</h4>
                      <p className="text-xs text-muted-foreground">
                        {CHART_TYPE_LABELS[widget.chart_type] || widget.chart_type}
                      </p>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEdit(widget)}>
                        <Pencil className="h-4 w-4 mr-2" /> Bearbeiten
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => duplicate(widget.id)}>
                        <Copy className="h-4 w-4 mr-2" /> Duplizieren
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setDeleteId(widget.id)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" /> Löschen
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" className="text-xs">
                    {(widget.config?.meter_ids?.length ?? 0)} Zähler
                  </Badge>
                  {widget.is_shared && (
                    <Badge variant="outline" className="text-xs">Geteilt</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <WidgetDesignerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingWidget={editingWidget}
      />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Widget löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Das Widget wird unwiderruflich gelöscht und aus allen Dashboards entfernt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
