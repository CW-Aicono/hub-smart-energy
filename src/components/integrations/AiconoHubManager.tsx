import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useLocations } from "@/hooks/useLocations";
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

const TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // omit I,O,0,1
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

function tokenStatus(t: PairingToken): { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof CheckCircle2 } {
  if (t.used_at) return { label: "Gepairt", variant: "default", icon: CheckCircle2 };
  if (new Date(t.expires_at).getTime() < Date.now()) return { label: "Abgelaufen", variant: "destructive", icon: XCircle };
  return { label: "Offen", variant: "secondary", icon: Clock };
}

export function AiconoHubManager() {
  const { tenant } = useTenant();
  const { data: locations = [] } = useLocations();
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
      toast.success("Pairing-Token erstellt", {
        description: `Token ${row.token} ist 7 Tage gültig.`,
      });
    },
    onError: (e: Error) => toast.error("Erstellung fehlgeschlagen", { description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("gateway_pairing_tokens").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gateway-pairing-tokens", tenant?.id] });
      toast.success("Pairing-Token entfernt");
    },
    onError: (e: Error) => toast.error("Löschen fehlgeschlagen", { description: e.message }),
  });

  const tokens = tokensQuery.data || [];
  const openTokens = tokens.filter((t) => !t.used_at && new Date(t.expires_at).getTime() >= Date.now());

  return (
    <div className="space-y-6">
      <ImageDownloadCard />

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5" />
                Pairing-Token
              </CardTitle>
              <CardDescription className="mt-1">
                Erzeuge einen Einmal-Code für ein neues AICONO Hub. Der Kunde gibt den Code beim
                ersten Start im Setup-Wizard ein – das Hub bindet sich anschließend automatisch
                an die hinterlegte Liegenschaft.
              </CardDescription>
            </div>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Neuer Token
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {tokensQuery.isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Lade Token …
            </div>
          ) : tokens.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Noch keine Pairing-Token. Erzeuge einen, um ein Hub auszuliefern.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Token</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Liegenschaft</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Gültig bis</TableHead>
                  <TableHead>MAC</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokens.map((t) => {
                  const status = tokenStatus(t);
                  const StatusIcon = status.icon;
                  const locationName = locations.find((l) => l.id === t.location_id)?.name ?? "—";
                  return (
                    <TableRow key={t.id}>
                      <TableCell>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(t.token);
                            toast.success("Token kopiert");
                          }}
                          className="font-mono text-base tracking-wider hover:underline"
                          title="Klicken zum Kopieren"
                        >
                          {t.token}
                        </button>
                      </TableCell>
                      <TableCell className="text-sm">{t.label || "—"}</TableCell>
                      <TableCell className="text-sm">{locationName}</TableCell>
                      <TableCell>
                        <Badge variant={status.variant} className="gap-1">
                          <StatusIcon className="h-3 w-3" />
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDateDE(t.expires_at)}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {t.bound_to_mac || "—"}
                      </TableCell>
                      <TableCell>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Token entfernen?</AlertDialogTitle>
                              <AlertDialogDescription>
                                {t.used_at
                                  ? "Das verbundene Gateway bleibt aktiv. Nur der Token-Eintrag wird gelöscht."
                                  : "Der Token kann danach nicht mehr für ein neues Hub genutzt werden."}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteMutation.mutate(t.id)}>
                                Löschen
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
              {openTokens.length.toLocaleString("de-DE")} offene{openTokens.length === 1 ? "r" : ""} Token
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neues Pairing-Token</DialogTitle>
            <DialogDescription>
              Wird beim ersten Start eines AICONO Hubs einmalig eingegeben. 7 Tage gültig.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="hub-label">Label (optional)</Label>
              <Input
                id="hub-label"
                placeholder="z. B. Hub Filiale Nord"
                value={pendingLabel}
                onChange={(e) => setPendingLabel(e.target.value)}
                maxLength={64}
              />
            </div>
            <div>
              <Label htmlFor="hub-location">Liegenschaft (optional)</Label>
              <Select value={pendingLocationId} onValueChange={setPendingLocationId}>
                <SelectTrigger id="hub-location">
                  <SelectValue placeholder="Keine Vorbindung" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Keine Vorbindung</SelectItem>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Wird vorgegeben, ordnet sich das Hub direkt der Liegenschaft zu.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Token erzeugen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ImageDownloadCard() {
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
      // Trigger download immediately
      const a = document.createElement("a");
      a.href = data.url;
      a.download = data.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success("Download gestartet", { description: `Version ${data.version}` });
    } catch (e) {
      toast.error("Download fehlgeschlagen", {
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
          AICONO Hub Image
        </CardTitle>
        <CardDescription>
          Lade das aktuelle AICONO Gateway OS für x86 Mini-PCs oder ARM-Hardware (HA Yellow/Green,
          Raspberry Pi 5). Das Image enthält bereits unser Add-on und den Pairing-Wizard.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label>Hardware-Variante</Label>
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
            Image herunterladen
          </Button>
        </div>
        {latest && (
          <div className="mt-4 p-3 rounded-md border border-border bg-muted/30 text-sm">
            <div className="font-medium">{latest.filename}</div>
            <div className="text-muted-foreground text-xs mt-1">
              Version {latest.version} · {(latest.size_bytes / 1024 / 1024).toLocaleString("de-DE", { maximumFractionDigits: 0 })} MB
            </div>
            {latest.sha256 && (
              <div className="text-muted-foreground text-xs font-mono break-all mt-1">
                SHA-256: {latest.sha256}
                <button
                  onClick={() => { navigator.clipboard.writeText(latest.sha256!); toast.success("SHA-256 kopiert"); }}
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
