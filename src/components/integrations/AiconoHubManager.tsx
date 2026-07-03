import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useLocations } from "@/hooks/useLocations";
import { useTranslation } from "@/hooks/useTranslation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortableHead, useSortableData } from "@/components/ui/sortable-head";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Loader2,
  Plus,
  Copy,
  Trash2,
  Download,
  CheckCircle2,
  Clock,
  XCircle,
  HardDrive,
  KeyRound,
  Cpu,
  Factory,
  Home,
} from "lucide-react";

interface PairingToken {
  id: string;
  tenant_id: string;
  location_id: string | null;
  token: string;
  label: string | null;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  bound_to_mac: string | null;
  bound_device_id: string | null;
}

const TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function generateToken(): string {
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  const raw = Array.from(buf, (b) => TOKEN_ALPHABET[b % TOKEN_ALPHABET.length]).join("");
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
}

function formatDateDE(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AiconoHubManager() {
  const { tenant } = useTenant();
  const { locations } = useLocations();
  const { t } = useTranslation();
  const qc = useQueryClient();

  const tokensQuery = useQuery({
    queryKey: ["gateway-pairing-tokens", tenant?.id],
    enabled: !!tenant?.id,
    staleTime: 30_000,
    queryFn: async (): Promise<PairingToken[]> => {
      const { data, error } = await supabase
        .from("gateway_pairing_tokens")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as PairingToken[];
    },
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [pendingLocationId, setPendingLocationId] = useState<string>("none");
  const [pendingLabel, setPendingLabel] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      const token = generateToken();
      const { data, error } = await supabase
        .from("gateway_pairing_tokens")
        .insert({
          tenant_id: tenant!.id,
          token,
          label: pendingLabel.trim() || null,
          location_id: pendingLocationId === "none" ? null : pendingLocationId,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as PairingToken;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["gateway-pairing-tokens", tenant?.id] });
      setCreateOpen(false);
      setPendingLabel("");
      setPendingLocationId("none");
      toast.success(t("aiconoHub.token.created"), {
        description: t("aiconoHub.token.createdDesc").replace("{token}", row.token),
      });
    },
    onError: (e: Error) => toast.error(t("aiconoHub.token.createFailed"), { description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("gateway_pairing_tokens").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gateway-pairing-tokens", tenant?.id] });
      toast.success(t("aiconoHub.token.removed"));
    },
    onError: (e: Error) => toast.error(t("aiconoHub.token.removeFailed"), { description: e.message }),
  });

  function tokenStatus(tok: PairingToken) {
    if (tok.used_at) return { label: t("aiconoHub.token.statusPaired"), variant: "default" as const, icon: CheckCircle2 };
    if (new Date(tok.expires_at).getTime() < Date.now())
      return { label: t("aiconoHub.token.statusExpired"), variant: "destructive" as const, icon: XCircle };
    return { label: t("aiconoHub.token.statusOpen"), variant: "secondary" as const, icon: Clock };
  }

  const tokens = tokensQuery.data || [];
  type SortKey = "token" | "label" | "location" | "status" | "expires" | "mac";
  const { sorted, sort, toggle } = useSortableData<PairingToken, SortKey>(tokens, (tok, k) => {
    switch (k) {
      case "token": return tok.token;
      case "label": return tok.label || "";
      case "location": return locations.find((l) => l.id === tok.location_id)?.name ?? "";
      case "status": return tok.used_at ? 2 : (new Date(tok.expires_at).getTime() < Date.now() ? 0 : 1);
      case "expires": return tok.expires_at;
      case "mac": return tok.bound_to_mac || "";
      default: return null;
    }
  });

  const openTokens = tokens.filter((tok) => !tok.used_at && new Date(tok.expires_at).getTime() >= Date.now());

  return (
    <div className="space-y-6">
      <HardwareSkuCards />
      <ImageDownloadCard />

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5" />
                {t("aiconoHub.token.title")}
              </CardTitle>
              <CardDescription className="mt-1">{t("aiconoHub.token.desc")}</CardDescription>
            </div>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t("aiconoHub.token.new")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {tokensQuery.isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("aiconoHub.token.loading")}
            </div>
          ) : tokens.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">{t("aiconoHub.token.empty")}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead><SortableHead label={t("aiconoHub.token.colToken")} sortKey="token" sort={sort} onToggle={toggle} /></TableHead>
                  <TableHead><SortableHead label={t("aiconoHub.token.colLabel")} sortKey="label" sort={sort} onToggle={toggle} /></TableHead>
                  <TableHead><SortableHead label={t("aiconoHub.token.colLocation")} sortKey="location" sort={sort} onToggle={toggle} /></TableHead>
                  <TableHead><SortableHead label={t("aiconoHub.token.colStatus")} sortKey="status" sort={sort} onToggle={toggle} /></TableHead>
                  <TableHead><SortableHead label={t("aiconoHub.token.colExpires")} sortKey="expires" sort={sort} onToggle={toggle} /></TableHead>
                  <TableHead><SortableHead label={t("aiconoHub.token.colMac")} sortKey="mac" sort={sort} onToggle={toggle} /></TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((tok) => {
                  const status = tokenStatus(tok);
                  const StatusIcon = status.icon;
                  const locationName = locations.find((l) => l.id === tok.location_id)?.name ?? "—";
                  return (
                    <TableRow key={tok.id}>
                      <TableCell>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(tok.token);
                            toast.success(t("aiconoHub.token.copied"));
                          }}
                          className="font-mono text-base tracking-wider hover:underline"
                        >
                          {tok.token}
                        </button>
                      </TableCell>
                      <TableCell className="text-sm">{tok.label || "—"}</TableCell>
                      <TableCell className="text-sm">{locationName}</TableCell>
                      <TableCell>
                        <Badge variant={status.variant} className="gap-1">
                          <StatusIcon className="h-3 w-3" />
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDateDE(tok.expires_at)}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">{tok.bound_to_mac || "—"}</TableCell>
                      <TableCell>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t("aiconoHub.token.removeQ")}</AlertDialogTitle>
                              <AlertDialogDescription>
                                {tok.used_at ? t("aiconoHub.token.removeUsed") : t("aiconoHub.token.removeUnused")}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t("aiconoHub.token.cancel")}</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteMutation.mutate(tok.id)}>
                                {t("aiconoHub.token.delete")}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {openTokens.length > 0 && (
            <p className="text-xs text-muted-foreground mt-4">
              {t("aiconoHub.token.openCount").replace("{count}", openTokens.length.toLocaleString("de-DE"))}
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("aiconoHub.token.dialogTitle")}</DialogTitle>
            <DialogDescription>{t("aiconoHub.token.dialogDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="hub-label">{t("aiconoHub.token.labelField")}</Label>
              <Input
                id="hub-label"
                placeholder={t("aiconoHub.token.labelPh")}
                value={pendingLabel}
                onChange={(e) => setPendingLabel(e.target.value)}
                maxLength={64}
              />
            </div>
            <div>
              <Label htmlFor="hub-location">{t("aiconoHub.token.locationField")}</Label>
              <Select value={pendingLocationId} onValueChange={setPendingLocationId}>
                <SelectTrigger id="hub-location">
                  <SelectValue placeholder={t("aiconoHub.token.locationNone")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("aiconoHub.token.locationNone")}</SelectItem>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">{t("aiconoHub.token.locationHint")}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {t("aiconoHub.token.cancel")}
            </Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("aiconoHub.token.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ──────────────────────────── Hardware-Pakete ──────────────────────────── */

function HardwareSkuCards() {
  const { t } = useTranslation();
  const skus = [
    { key: "mini", icon: Cpu, name: t("aiconoHub.sku.miniName"), desc: t("aiconoHub.sku.miniDesc"), price: 349 },
    { key: "industrial", icon: Factory, name: t("aiconoHub.sku.industrialName"), desc: t("aiconoHub.sku.industrialDesc"), price: 1190 },
    { key: "home", icon: Home, name: t("aiconoHub.sku.homeName"), desc: t("aiconoHub.sku.homeDesc"), price: 129 },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("aiconoHub.sku.title")}</CardTitle>
        <CardDescription>{t("aiconoHub.sku.desc")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-3">
          {skus.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.key}
                className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3"
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-5 w-5 text-primary" />
                  <span className="font-semibold">{s.name}</span>
                </div>
                <p className="text-sm text-muted-foreground flex-1">{s.desc}</p>
                <div className="text-sm">
                  <span className="text-muted-foreground">{t("aiconoHub.sku.priceFrom")} </span>
                  <span className="text-lg font-semibold">
                    {s.price.toLocaleString("de-DE")} €
                  </span>
                  <span className="text-muted-foreground"> netto</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary" className="text-xs">{t("aiconoHub.sku.preflashed")}</Badge>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <a href={`mailto:sales@aicono.org?subject=${encodeURIComponent(s.name)}`}>
                    {t("aiconoHub.sku.requestQuote")}
                  </a>
                </Button>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-4">{t("aiconoHub.sku.bringYourOwn")}</p>
      </CardContent>
    </Card>
  );
}

/* ──────────────────────────── Image-Download ──────────────────────────── */

function ImageDownloadCard() {
  const { t } = useTranslation();
  const [variant, setVariant] = useState<"x86_64" | "aarch64">("x86_64");
  const [loading, setLoading] = useState(false);
  const [latest, setLatest] = useState<{ version: string; filename: string; sha256: string | null; size_bytes: number } | null>(null);

  async function requestDownload() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("gateway-image-download", {
        body: { variant, version: "latest" },
      });
      if (error) throw error;
      if (!data?.url) throw new Error(data?.error || "Keine Download-URL erhalten");
      setLatest({
        version: data.version,
        filename: data.filename,
        sha256: data.sha256 ?? null,
        size_bytes: data.size_bytes ?? 0,
      });
      const a = document.createElement("a");
      a.href = data.url;
      a.download = data.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success(t("aiconoHub.image.downloadStarted"), { description: `Version ${data.version}` });
    } catch (e) {
      toast.error(t("aiconoHub.image.downloadFailed"), {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HardDrive className="h-5 w-5" />
          {t("aiconoHub.image.title")}
        </CardTitle>
        <CardDescription>{t("aiconoHub.image.desc")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label>{t("aiconoHub.image.variant")}</Label>
            <Select value={variant} onValueChange={(v) => setVariant(v as "x86_64" | "aarch64")}>
              <SelectTrigger className="w-[260px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="x86_64">x86_64 (Intel/AMD Mini-PC)</SelectItem>
                <SelectItem value="aarch64">aarch64 (HA Yellow/Green, Pi 5)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={requestDownload} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            {t("aiconoHub.image.download")}
          </Button>
        </div>
        {latest && (
          <div className="mt-4 p-3 rounded-md border border-border bg-muted/30 text-sm">
            <div className="font-medium">{latest.filename}</div>
            <div className="text-muted-foreground text-xs mt-1">
              Version {latest.version} ·{" "}
              {(latest.size_bytes / 1024 / 1024).toLocaleString("de-DE", { maximumFractionDigits: 0 })} MB
            </div>
            {latest.sha256 && (
              <div className="text-muted-foreground text-xs font-mono break-all mt-1">
                SHA-256: {latest.sha256}
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(latest.sha256!);
                    toast.success(t("aiconoHub.image.copySha"));
                  }}
                  className="ml-2 inline-flex items-center text-foreground hover:underline"
                >
                  <Copy className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
