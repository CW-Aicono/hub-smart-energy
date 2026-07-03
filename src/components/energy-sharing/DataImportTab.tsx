import { useRef, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SortableHead, useSortableData } from "@/components/ui/sortable-head";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload } from "lucide-react";
import { useMsconsImports } from "@/hooks/useCommunityOperations";

export default function DataImportTab({ communityId }: { communityId: string }) {
  const { imports, uploadFile } = useMsconsImports(communityId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  type SortKey = "file" | "status" | "intervals" | "imported" | "skipped" | "date";
  const { sorted, sort, toggle } = useSortableData(imports, (r, k) => {
    switch (k) {
      case "file": return r.file_name;
      case "status": return r.status;
      case "intervals": return Number(r.parsed_intervals ?? 0);
      case "imported": return Number(r.rows_imported ?? 0);
      case "skipped": return Number(r.rows_skipped ?? 0);
      case "date": return r.created_at;
      default: return null;
    }
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>MSCONS-Datenimport</CardTitle>
        <div>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.edi,.mscons"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setBusy(true);
              try { await uploadFile.mutateAsync({ file: f, communityId }); }
              finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
            }}
          />
          <Button size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" />Datei hochladen
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {imports.length === 0 ? (
          <p className="text-muted-foreground">Noch keine Importe.</p>
        ) : (
          <Table>
            <TableHeader><TableRow>
              <SortableHead sortKey="file" current={sort} onToggle={toggle}>Datei</SortableHead><SortableHead sortKey="status" current={sort} onToggle={toggle}>Status</SortableHead>
              <SortableHead sortKey="intervals" current={sort} onToggle={toggle} className="text-right">Werte</SortableHead>
              <SortableHead sortKey="imported" current={sort} onToggle={toggle} className="text-right">Importiert</SortableHead>
              <SortableHead sortKey="skipped" current={sort} onToggle={toggle} className="text-right">Übersprungen</SortableHead>
              <SortableHead sortKey="date" current={sort} onToggle={toggle}>Zeitpunkt</SortableHead>
            </TableRow></TableHeader>
            <TableBody>
              {sorted.map((i: any) => (
                <TableRow key={i.id}>
                  <TableCell className="font-mono text-xs">{i.file_name}</TableCell>
                  <TableCell>
                    <Badge variant={i.status === "completed" ? "default" : i.status === "failed" ? "destructive" : "secondary"}>
                      {i.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{Number(i.parsed_intervals ?? 0).toLocaleString("de-DE")}</TableCell>
                  <TableCell className="text-right">{Number(i.rows_imported ?? 0).toLocaleString("de-DE")}</TableCell>
                  <TableCell className="text-right">{Number(i.rows_skipped ?? 0).toLocaleString("de-DE")}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(i.created_at).toLocaleString("de-DE")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
