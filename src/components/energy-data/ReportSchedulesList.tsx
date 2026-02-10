import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, Pencil, Clock, Mail, CalendarClock } from "lucide-react";
import { useReportSchedules, type ReportScheduleInsert } from "@/hooks/useReportSchedules";
import { useLocations, type Location } from "@/hooks/useLocations";
import ReportScheduleDialog from "./ReportScheduleDialog";
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

const FREQ_LABELS: Record<string, string> = {
  weekly: "Wöchentlich", monthly: "Monatlich", quarterly: "Quartalsweise", yearly: "Jährlich",
};
const FORMAT_LABELS: Record<string, string> = {
  pdf: "PDF", csv: "CSV", both: "PDF & CSV",
};
const ENERGY_LABELS: Record<string, string> = {
  strom: "Strom", gas: "Gas", waerme: "Wärme", wasser: "Wasser",
};

export default function ReportSchedulesList() {
  const { schedules, loading, createSchedule, updateSchedule, deleteSchedule } = useReportSchedules();
  const { locations } = useLocations();
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const editSchedule = schedules.find((s) => s.id === editId);

  if (loading) return <Skeleton className="h-48" />;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarClock className="h-5 w-5 text-primary" />
                Automatische Reports
              </CardTitle>
              <CardDescription>
                Erstellen Sie Report-Templates, die automatisch versendet werden
              </CardDescription>
            </div>
            <Button onClick={() => setCreateOpen(true)} size="sm">
              <Plus className="h-4 w-4 mr-1" /> Neues Template
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {schedules.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Noch keine Report-Templates angelegt. Erstellen Sie ein Template, um automatisch Reports zu versenden.
            </p>
          ) : (
            <div className="space-y-3">
              {schedules.map((s) => (
                <div key={s.id} className="flex items-center justify-between p-3 rounded-md border">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{s.name}</span>
                      <Badge variant={s.is_active ? "default" : "secondary"}>
                        {s.is_active ? "Aktiv" : "Pausiert"}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{FREQ_LABELS[s.frequency]}</span>
                      <span>{FORMAT_LABELS[s.format]}</span>
                      <span className="flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {s.recipients.length} Empfänger
                      </span>
                      <span>
                        {s.energy_types.map((t) => ENERGY_LABELS[t] || t).join(", ")}
                      </span>
                      {s.location_ids.length > 0 ? (
                        <span>{s.location_ids.length} Standort(e)</span>
                      ) : (
                        <span>Alle Standorte</span>
                      )}
                    </div>
                    {s.last_sent_at && (
                      <p className="text-xs text-muted-foreground">
                        Zuletzt: {new Date(s.last_sent_at).toLocaleDateString("de-DE")}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <Switch
                      checked={s.is_active}
                      onCheckedChange={(checked) => updateSchedule(s.id, { is_active: checked })}
                    />
                    <Button size="icon" variant="ghost" onClick={() => setEditId(s.id)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setDeleteId(s.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <ReportScheduleDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={createSchedule}
        locations={locations}
      />

      {/* Edit Dialog */}
      {editSchedule && (
        <ReportScheduleDialog
          open={!!editId}
          onOpenChange={(o) => !o && setEditId(null)}
          onSubmit={(data) => updateSchedule(editSchedule.id, data)}
          locations={locations}
          initial={{
            name: editSchedule.name,
            recipients: editSchedule.recipients,
            frequency: editSchedule.frequency,
            format: editSchedule.format,
            energy_types: editSchedule.energy_types,
            location_ids: editSchedule.location_ids,
          }}
          title="Report-Template bearbeiten"
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Template löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Dieses Report-Template wird unwiderruflich gelöscht. Es werden keine weiteren Reports mehr versendet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteId) { deleteSchedule(deleteId); setDeleteId(null); } }}>
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
