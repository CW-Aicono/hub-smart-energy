import { useState } from "react";
import { useAuditLogs, type AuditLogRow } from "@/hooks/useAuditLogs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SortableHead, useSortableData } from "@/components/ui/sortable-head";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  TableHead,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, FileSearch } from "lucide-react";

type Props = {
  tenantId?: string | null;
  partnerId?: string | null;
  title?: string;
};

const ACTION_LABELS: Record<string, string> = {
  "tenant.status_change": "Tenant Status geändert",
  "tenant.update": "Tenant bearbeitet",
  "tenant.delete": "Tenant gelöscht",
  "module.toggle": "Modul umgeschaltet",
  "pricing.update": "Preis geändert",
  "bundle.update": "Bundle geändert",
  "partner.create": "Partner angelegt",
  "partner.update": "Partner bearbeitet",
  "partner.delete": "Partner gelöscht",
  "member.add": "Mitglied hinzugefügt",
  "member.remove": "Mitglied entfernt",
  "license.change": "Lizenz geändert",
};

function actionLabel(a: string) {
  return ACTION_LABELS[a] ?? a;
}

function formatTs(iso: string) {
  return new Date(iso).toLocaleString("de-DE", {
    dateStyle: "short",
    timeStyle: "medium",
  });
}

export function AuditLogList({ tenantId, partnerId, title = "Aktivitätslog" }: Props) {
  const [daysBack, setDaysBack] = useState<7 | 30 | 90>(30);
  const [actionFilter, setActionFilter] = useState<string>("__all__");
  const [selected, setSelected] = useState<AuditLogRow | null>(null);

  const { data, isLoading, error } = useAuditLogs({
    tenantId,
    partnerId,
    daysBack,
    action: actionFilter === "__all__" ? null : actionFilter,
    limit: 300,
  });

  // Sortiert die aktuelle Seite
  const { sorted, sort, toggle } = useSortableData(data ?? [], (r, k) => {
    switch (k) {
      case "time": return r.created_at ? new Date(r.created_at) : null;
      case "actor": return r.actor_email ?? "";
      case "action": return r.action;
      case "object": return r.entity_label ?? r.entity_type;
      default: return null;
    }
  });

  const distinctActions = Array.from(
    new Set((data ?? []).map((r) => r.action)),
  ).sort();

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="flex items-center gap-2">
          <FileSearch className="h-5 w-5" /> {title}
        </CardTitle>
        <div className="flex flex-wrap gap-2">
          <Select value={String(daysBack)} onValueChange={(v) => setDaysBack(Number(v) as 7 | 30 | 90)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Letzte 7 Tage</SelectItem>
              <SelectItem value="30">Letzte 30 Tage</SelectItem>
              <SelectItem value="90">Letzte 90 Tage</SelectItem>
            </SelectContent>
          </Select>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Aktion filtern" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Alle Aktionen</SelectItem>
              {distinctActions.map((a) => (
                <SelectItem key={a} value={a}>
                  {actionLabel(a)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Lade Einträge…
          </div>
        ) : error ? (
          <div className="text-sm text-destructive">
            Fehler beim Laden: {(error as Error).message}
          </div>
        ) : !data || data.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Keine Einträge im gewählten Zeitraum.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead column="time" onSort={toggle} sort={sort}>Zeitpunkt</SortableHead>
                  <SortableHead column="actor" onSort={toggle} sort={sort}>Actor</SortableHead>
                  <SortableHead column="action" onSort={toggle} sort={sort}>Aktion</SortableHead>
                  <SortableHead column="object" onSort={toggle} sort={sort}>Objekt</SortableHead>
                  <TableHead className="text-right">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {formatTs(row.created_at)}
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="font-medium">{row.actor_email ?? "—"}</div>
                      {row.actor_role && (
                        <Badge variant="outline" className="mt-1 text-[10px]">
                          {row.actor_role}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{actionLabel(row.action)}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="font-medium">{row.entity_label ?? row.entity_type}</div>
                      <div className="text-muted-foreground">{row.entity_type}</div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => setSelected(row)}>
                        Anzeigen
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {selected ? actionLabel(selected.action) : "Details"}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">Zeitpunkt</div>
                  <div>{formatTs(selected.created_at)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Actor</div>
                  <div>{selected.actor_email ?? "—"} ({selected.actor_role ?? "—"})</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Objekt</div>
                  <div>{selected.entity_label ?? selected.entity_type}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">IP</div>
                  <div>{selected.ip_address ?? "—"}</div>
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold text-muted-foreground">Vorher</div>
                <pre className="max-h-48 overflow-auto rounded-md bg-muted p-3 text-xs">
                  {JSON.stringify(selected.before ?? null, null, 2)}
                </pre>
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold text-muted-foreground">Nachher</div>
                <pre className="max-h-48 overflow-auto rounded-md bg-muted p-3 text-xs">
                  {JSON.stringify(selected.after ?? null, null, 2)}
                </pre>
              </div>
              {selected.metadata && (
                <div>
                  <div className="mb-1 text-xs font-semibold text-muted-foreground">Metadaten</div>
                  <pre className="max-h-32 overflow-auto rounded-md bg-muted p-3 text-xs">
                    {JSON.stringify(selected.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
