import { EnergyMeasure } from "@/hooks/useEnergyMeasures";
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
          <TableHead>Maßnahme</TableHead>
          <TableHead>Kategorie</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Investition (€)</TableHead>
          <TableHead className="text-right">Einsparung (kWh/a)</TableHead>
          <TableHead className="text-right">Einsparung (€/a)</TableHead>
          {!readOnly && <TableHead className="w-12" />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {measures.map((m) => {
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
