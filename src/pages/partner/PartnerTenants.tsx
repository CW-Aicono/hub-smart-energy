import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { usePartnerAccess } from "@/hooks/usePartnerAccess";

interface Row {
  id: string;
  name: string | null;
  created_at: string;
  is_active: boolean | null;
}

export default function PartnerTenants() {
  const { partnerId } = usePartnerAccess();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!partnerId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("tenants")
        .select("id, name, created_at, is_active")
        .eq("partner_id", partnerId)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      setRows((data as Row[]) ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [partnerId]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Meine Tenants</h1>
        <p className="text-muted-foreground">Alle Mandanten, die diesem Partner zugeordnet sind.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Tenant-Liste</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Lade…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Es sind noch keine Tenants zugeordnet. Wende dich an AICONO, um deinen ersten Tenant
              zuordnen zu lassen, oder lege ihn in Stufe 4 selbst an.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Erstellt</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString("de-DE")}
                    </TableCell>
                    <TableCell>
                      {r.is_active === false ? (
                        <Badge variant="outline">inaktiv</Badge>
                      ) : (
                        <Badge>aktiv</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
