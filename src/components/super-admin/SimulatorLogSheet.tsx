import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowDown, ArrowUp } from "lucide-react";
import { format } from "date-fns";

interface OcppLogEntry {
  ts: string;
  dir: "in" | "out";
  action: string;
  payload: unknown;
}

interface Props {
  instanceId: string | null;
  ocppId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SimulatorLogSheet({ instanceId, ocppId, open, onOpenChange }: Props) {
  const { data, isFetching } = useQuery({
    queryKey: ["simulator-logs", instanceId],
    enabled: !!instanceId && open,
    refetchInterval: open ? 3000 : false,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke(
        `ocpp-simulator-control?action=logs&instanceId=${instanceId}`,
        { method: "GET" },
      );
      if (error) throw error;
      return ((data as { logs?: OcppLogEntry[] }).logs ?? []).slice().reverse();
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>OCPP Live-Log</SheetTitle>
          <SheetDescription>
            Letzte 50 Nachrichten — {ocppId ?? "—"} (auto-refresh alle 3s)
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 h-[calc(100vh-8rem)]">
          {isFetching && !data ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Logs werden geladen …
            </div>
          ) : !data || data.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Noch keine OCPP-Nachrichten in dieser Sitzung.
            </div>
          ) : (
            <ScrollArea className="h-full pr-4">
              <div className="space-y-2 font-mono text-xs">
                {data.map((entry, idx) => (
                  <div
                    key={idx}
                    className="rounded-md border border-border bg-muted/30 p-2"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {entry.dir === "in" ? (
                        <ArrowDown className="h-3 w-3 text-green-600" />
                      ) : (
                        <ArrowUp className="h-3 w-3 text-blue-600" />
                      )}
                      <Badge variant="outline" className="text-xs">
                        {entry.action}
                      </Badge>
                      <span className="text-muted-foreground ml-auto">
                        {format(new Date(entry.ts), "HH:mm:ss")}
                      </span>
                    </div>
                    <pre className="whitespace-pre-wrap break-all text-muted-foreground">
                      {JSON.stringify(entry.payload, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
