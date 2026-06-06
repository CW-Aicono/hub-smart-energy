import { useMemo, useState } from "react";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Bell, Plus, Trash2, AlertTriangle } from "lucide-react";
import {
  useMonitoringAlertRules, type AlertRule, type AlertRuleInput,
} from "@/hooks/useMonitoringAlertRules";

type MetricGetter = (category: string, name: string) => { metric_value: number | null } | undefined;

interface Props {
  getLatest: MetricGetter;
}

const KNOWN_METRICS: Array<{ category: string; name: string }> = [
  { category: "db_connections", name: "active_connections" },
  { category: "db_connections", name: "max_connections" },
  { category: "disk_usage", name: "database_size_bytes" },
  { category: "db_info", name: "table_count" },
  { category: "app_counts", name: "tenants" },
  { category: "app_counts", name: "users" },
  { category: "app_counts", name: "locations" },
  { category: "app_counts", name: "meters" },
];

const SEVERITY_VARIANT: Record<AlertRule["severity"], "default" | "secondary" | "destructive"> = {
  info: "secondary",
  warning: "default",
  critical: "destructive",
};

function evaluateRule(rule: AlertRule, value: number): boolean {
  switch (rule.comparator) {
    case ">": return value > rule.threshold;
    case ">=": return value >= rule.threshold;
    case "<": return value < rule.threshold;
    case "<=": return value <= rule.threshold;
  }
}

const fmt = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 2 });

export default function AlertRulesCard({ getLatest }: Props) {
  const { data: rules = [], isLoading, create, update, remove } = useMonitoringAlertRules();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<AlertRuleInput>({
    metric_category: KNOWN_METRICS[0].category,
    metric_name: KNOWN_METRICS[0].name,
    comparator: ">",
    threshold: 0,
    severity: "warning",
    enabled: true,
    notify_email: "",
  });

  const violations = useMemo(() => {
    return rules
      .filter((r) => r.enabled)
      .map((r) => {
        const v = getLatest(r.metric_category, r.metric_name)?.metric_value ?? null;
        return v != null && evaluateRule(r, v) ? { rule: r, value: v } : null;
      })
      .filter(Boolean) as Array<{ rule: AlertRule; value: number }>;
  }, [rules, getLatest]);

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="h-4 w-4" />
          Alert-Regeln
          {violations.length > 0 && (
            <Badge variant="destructive" className="ml-2">
              <AlertTriangle className="h-3 w-3 mr-1" /> {violations.length} verletzt
            </Badge>
          )}
        </CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Plus className="h-4 w-4 mr-1" /> Regel
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Alert-Regel anlegen</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Metrik</Label>
                <Select
                  value={`${form.metric_category}::${form.metric_name}`}
                  onValueChange={(v) => {
                    const [c, n] = v.split("::");
                    setForm((f) => ({ ...f, metric_category: c, metric_name: n }));
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {KNOWN_METRICS.map((m) => (
                      <SelectItem key={`${m.category}::${m.name}`} value={`${m.category}::${m.name}`}>
                        {m.category} → {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>Vergleich</Label>
                  <Select
                    value={form.comparator}
                    onValueChange={(v) => setForm((f) => ({ ...f, comparator: v as AlertRule["comparator"] }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value=">">{"größer (>)"}</SelectItem>
                      <SelectItem value=">=">{"größer/gleich (≥)"}</SelectItem>
                      <SelectItem value="<">{"kleiner (<)"}</SelectItem>
                      <SelectItem value="<=">{"kleiner/gleich (≤)"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Schwellwert</Label>
                  <Input
                    type="number"
                    value={form.threshold}
                    onChange={(e) => setForm((f) => ({ ...f, threshold: Number(e.target.value) }))}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Schweregrad</Label>
                <Select
                  value={form.severity}
                  onValueChange={(v) => setForm((f) => ({ ...f, severity: v as AlertRule["severity"] }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="info">Info</SelectItem>
                    <SelectItem value="warning">Warnung</SelectItem>
                    <SelectItem value="critical">Kritisch</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Benachrichtigungs-E-Mail (optional)</Label>
                <Input
                  type="email"
                  value={form.notify_email ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, notify_email: e.target.value || null }))}
                  placeholder="ops@aicono.org"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Abbrechen</Button>
              <Button
                onClick={() => {
                  create.mutate(form, { onSuccess: () => setOpen(false) });
                }}
                disabled={create.isPending}
              >
                Anlegen
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Lädt …</p>
        ) : rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine Regeln definiert.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-2">Metrik</th>
                  <th className="py-2 pr-2">Regel</th>
                  <th className="py-2 pr-2">Aktuell</th>
                  <th className="py-2 pr-2">Schweregrad</th>
                  <th className="py-2 pr-2">Aktiv</th>
                  <th className="py-2 pr-2">E-Mail</th>
                  <th className="py-2 pr-2"></th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => {
                  const cur = getLatest(r.metric_category, r.metric_name)?.metric_value ?? null;
                  const violated = r.enabled && cur != null && evaluateRule(r, cur);
                  return (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2 pr-2 font-mono text-xs">
                        {r.metric_category} → {r.metric_name}
                      </td>
                      <td className="py-2 pr-2">{r.comparator} {fmt(r.threshold)}</td>
                      <td className="py-2 pr-2">
                        {cur != null ? (
                          <span className={violated ? "text-destructive font-medium" : ""}>{fmt(cur)}</span>
                        ) : (
                          <span className="text-muted-foreground">–</span>
                        )}
                      </td>
                      <td className="py-2 pr-2">
                        <Badge variant={SEVERITY_VARIANT[r.severity]}>{r.severity}</Badge>
                      </td>
                      <td className="py-2 pr-2">
                        <Switch
                          checked={r.enabled}
                          onCheckedChange={(checked) => update.mutate({ id: r.id, patch: { enabled: checked } })}
                        />
                      </td>
                      <td className="py-2 pr-2 text-xs text-muted-foreground">{r.notify_email ?? "–"}</td>
                      <td className="py-2 pr-2 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => remove.mutate(r.id)}
                          disabled={remove.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
