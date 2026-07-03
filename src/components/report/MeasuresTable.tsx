import { EnergyMeasure } from "@/hooks/useEnergyMeasures";
import { SortableHead, useSortableData } from "@/components/ui/sortable-head";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

interface MeasuresTableProps {
  measures: EnergyMeasure[];
  onDelete?: (id: string) => void;
  readOnly?: boolean;
}

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  planned: { label: "Geplant", variant: "outline" },
  in_progress: { label: "In Umsetzung", variant: "secondary" },
  completed: { label: "Abgeschlossen", variant: "default" },
};

function formatDE(n: number | null): string {
  if (n === null || n === undefined) return "–";
  return n.toLocaleString("de-DE", { maximumFractionDigits: 0 });
}

export function MeasuresTable({ measures, onDelete, readOnly }: MeasuresTableProps) {
  type SortKey = "title" | "category" | "status" | "cost" | "savings_kwh" | "savings_eur";
  const { sorted, sort, toggle } = useSortableData(measures, (r, k) => {
    switch (k) {
      case "title": return r.title;
      case "category": return r.category;
      case "status": return r.status;
      case "cost": return r.investment_cost ?? 0;
      case "savings_kwh": return r.estimated_annual_savings_kwh ?? 0;
      case "savings_eur": return r.estimated_annual_savings_eur ?? 0;
      default: return null;
    }
  });

  if (measures.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        Keine Maßnahmen hinterlegt.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SortableHead sortKey="title" current={sort} onToggle={toggle}>Maßnahme</SortableHead>
          <SortableHead sortKey="category" current={sort} onToggle={toggle}>Kategorie</SortableHead>
          <SortableHead sortKey="status" current={sort} onToggle={toggle}>Status</SortableHead>
          <SortableHead sortKey="cost" current={sort} onToggle={toggle} className="text-right">Investition (€)</SortableHead>
          <SortableHead sortKey="savings_kwh" current={sort} onToggle={toggle} className="text-right">Einsparung (kWh/a)</SortableHead>
          <SortableHead sortKey="savings_eur" current={sort} onToggle={toggle} className="text-right">Einsparung (€/a)</SortableHead>
          {!readOnly && <TableHead className="w-12" />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((m) => {
          const status = STATUS_LABELS[m.status] || STATUS_LABELS.planned;
          return (
            <TableRow key={m.id}>
              <TableCell>
                <div>
                  <p className="font-medium">{m.title}</p>
                  {m.implementation_date && (
                    <p className="text-xs text-muted-foreground">
                      {new Date(m.implementation_date).toLocaleDateString("de-DE")}
                    </p>
                  )}
                </div>
              </TableCell>
              <TableCell className="capitalize text-sm">{m.category}</TableCell>
              <TableCell>
                <Badge variant={status.variant}>{status.label}</Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatDE(m.investment_cost)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatDE(m.estimated_annual_savings_kwh)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatDE(m.estimated_annual_savings_eur)}</TableCell>
              {!readOnly && (
                <TableCell>
                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => onDelete?.(m.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
