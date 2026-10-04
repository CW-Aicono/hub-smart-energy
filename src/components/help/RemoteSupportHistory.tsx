import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useTranslation } from "@/hooks/useTranslation";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, History } from "lucide-react";

interface SessionRow {
  id: string;
  started_at: string;
  ended_at: string | null;
  reason: string | null;
  impersonated_user_id: string | null;
  is_manual: boolean;
}

const fmtDate = (s: string) =>
  new Date(s).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const fmtTime = (s: string) => new Date(s).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

function duration(start: string, end: string | null) {
  const mins = Math.max(1, Math.round(((end ? new Date(end) : new Date()).getTime() - new Date(start).getTime()) / 60000));
  const h = Math.floor(mins / 60);
  return h > 0 ? `${h} h ${(mins % 60).toLocaleString("de-DE")} min` : `${mins.toLocaleString("de-DE")} min`;
}

function SessionChanges({ session }: { session: SessionRow }) {
  const { t } = useTranslation();
  const { data = [], isLoading } = useQuery({
    queryKey: ["support-session-changes", session.id],
    queryFn: async () => {
      // Direkt zugeordnete Einträge + Einträge des Support-Users im Zeitfenster
      let q = supabase
        .from("audit_logs")
        .select("id, created_at, action, entity_type, entity_label")
        .order("created_at", { ascending: true })
        .limit(200);
      if (session.impersonated_user_id) {
        const end = session.ended_at ?? new Date().toISOString();
        q = q.or(
          `support_session_id.eq.${session.id},and(actor_user_id.eq.${session.impersonated_user_id},created_at.gte.${session.started_at},created_at.lte.${end})`,
        );
      } else {
        q = q.eq("support_session_id", session.id);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">…</p>;
  if (data.length === 0) return <p className="text-sm text-muted-foreground">{t("help.remoteHistoryNoChanges" as any)}</p>;
  return (
    <ul className="space-y-1">
      {data.map((r) => (
        <li key={r.id} className="text-sm flex gap-3">
          <span className="tabular-nums text-muted-foreground shrink-0">{fmtTime(r.created_at)}</span>
          <span>
            {r.action}
            {r.entity_label ? ` – ${r.entity_label}` : ` (${r.entity_type})`}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function RemoteSupportHistory() {
  const { tenant } = useTenant();
  const { t } = useTranslation();
  const [open, setOpen] = useState<string | null>(null);

  const { data: sessions = [] } = useQuery<SessionRow[]>({
    queryKey: ["support-session-history", tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_sessions")
        .select("id, started_at, ended_at, reason, impersonated_user_id, is_manual")
        .eq("tenant_id", tenant!.id)
        .order("started_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as SessionRow[];
    },
  });

  return (
    <div className="mt-6 space-y-3">
      <h4 className="font-medium flex items-center gap-2">
        <History className="h-4 w-4" />
        {t("help.remoteHistory" as any)}
      </h4>
      {sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("help.remoteHistoryEmpty" as any)}</p>
      ) : (
        <div className="divide-y rounded-lg border">
          {sessions.map((s) => {
            const isOpen = open === s.id;
            const running = !s.ended_at && !s.is_manual;
            return (
              <div key={s.id} className="p-3">
                <button
                  type="button"
                  className="w-full flex flex-wrap items-center gap-x-4 gap-y-1 text-left"
                  onClick={() => setOpen(isOpen ? null : s.id)}
                >
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <span className="text-sm font-medium">{fmtDate(s.started_at)}</span>
                  <span className="text-sm text-muted-foreground">
                    {s.ended_at ? `– ${fmtTime(s.ended_at)}` : ""} · {duration(s.started_at, s.ended_at)}
                  </span>
                  {running && <Badge variant="destructive">{t("help.remoteHistoryRunning" as any)}</Badge>}
                  {s.reason && <span className="text-sm text-muted-foreground truncate">{s.reason}</span>}
                </button>
                {isOpen && (
                  <div className="mt-2 pl-6">
                    <SessionChanges session={s} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
