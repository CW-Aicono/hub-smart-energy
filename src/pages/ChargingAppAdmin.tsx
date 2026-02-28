import { useState, useEffect, useRef } from "react";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { useChargingUsers, useChargingUserGroups } from "@/hooks/useChargingUsers";
import { useTenant } from "@/hooks/useTenant";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Smartphone, Users, ExternalLink, Check, Ban, Archive, Loader2, Copy, Link, QrCode } from "lucide-react";
import { format } from "date-fns";
import QRCode from "qrcode";
import { useTranslation } from "@/hooks/useTranslation";

const APP_URL = `${window.location.origin}/ev`;

const ChargingAppAdmin = () => {
  const { tenant } = useTenant();
  const { users, isLoading } = useChargingUsers();
  const { groups } = useChargingUserGroups();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const { t } = useTranslation();
  const T = (key: string) => t(key as any);

  useEffect(() => {
    if (qrCanvasRef.current) {
      QRCode.toCanvas(qrCanvasRef.current, APP_URL, { width: 180, margin: 2 });
    }
  }, []);

  // Only show users that have auth_user_id (= app users)
  const appUsers = users.filter((u) => u.auth_user_id);
  const filtered = statusFilter === "all" ? appUsers : appUsers.filter((u) => u.status === statusFilter);

  const getGroupName = (gid: string | null) => groups.find((g) => g.id === gid)?.name || "—";

  const statusBadge = (status: string) => {
    switch (status) {
      case "active": return <Badge variant="default"><Check className="h-3 w-3 mr-1" />{T("common.active")}</Badge>;
      case "blocked": return <Badge variant="destructive"><Ban className="h-3 w-3 mr-1" />{T("common.blocked")}</Badge>;
      case "archived": return <Badge variant="secondary"><Archive className="h-3 w-3 mr-1" />{T("task.statusCancelled")}</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-4 md:p-6 space-y-6">
          <div>
            <h1 className="text-2xl font-bold">{T("chargingApp.title")}</h1>
            <p className="text-sm text-muted-foreground">{T("chargingApp.subtitle")}</p>
          </div>

          <Tabs defaultValue="preview" className="space-y-4">
            <TabsList>
              <TabsTrigger value="preview" className="gap-1.5">
                <Smartphone className="h-4 w-4" />
                {T("chargingApp.preview")}
              </TabsTrigger>
              <TabsTrigger value="users" className="gap-1.5">
                <Users className="h-4 w-4" />
                {T("chargingApp.appUsers")}
                {appUsers.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1 text-xs">{appUsers.length}</Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="preview">
              <div className="flex flex-col lg:flex-row gap-6">
                {/* Left: Link & QR */}
                <div className="space-y-4 lg:w-72 shrink-0">
                  <Card>
                    <CardContent className="p-4 space-y-3">
                      <h3 className="font-semibold text-sm flex items-center gap-1.5"><Link className="h-4 w-4" /> {T("chargingApp.appLink")}</h3>
                      <div className="flex items-center gap-2">
                        <Input value={APP_URL} readOnly className="text-xs font-mono" />
                        <Button
                          variant="outline"
                          size="icon"
                          className="shrink-0"
                          onClick={() => {
                            navigator.clipboard.writeText(APP_URL);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                          }}
                        >
                          {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </div>
                      <Button variant="outline" size="sm" asChild className="w-full gap-1.5">
                        <a href="/ev" target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" />
                          {T("chargingApp.openInTab")}
                        </a>
                      </Button>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4 space-y-3">
                      <h3 className="font-semibold text-sm flex items-center gap-1.5"><QrCode className="h-4 w-4" /> {T("chargingApp.qrCode")}</h3>
                      <div className="flex justify-center">
                        <canvas ref={qrCanvasRef} />
                      </div>
                      <p className="text-xs text-muted-foreground text-center">{T("chargingApp.scanToOpen")}</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Right: Phone mockup */}
                <div className="flex-1 flex justify-center">
                  <div className="relative" style={{ width: 375, height: 740 }}>
                    <div className="absolute inset-0 rounded-[2.5rem] border-[8px] border-foreground/80 bg-background shadow-2xl overflow-hidden">
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-foreground/80 rounded-b-2xl z-10" />
                      <iframe
                        src="/ev"
                        className="w-full h-full border-0"
                        title={T("chargingApp.preview")}
                        style={{ borderRadius: "1.8rem" }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="users">
              <Card>
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-[160px]">
                          <SelectValue placeholder={T("common.status")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{T("chargingApp.allStatus")}</SelectItem>
                          <SelectItem value="active">{T("common.active")}</SelectItem>
                          <SelectItem value="blocked">{T("common.blocked")}</SelectItem>
                          <SelectItem value="archived">{T("task.statusCancelled")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <Badge variant="outline">{filtered.length} {T("chargingApp.users")}</Badge>
                    </div>
                  </div>

                  {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : filtered.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>{T("chargingApp.noAppUsers")}</p>
                    </div>
                  ) : (
                    <div className="overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{T("common.name")}</TableHead>
                            <TableHead>{T("common.email")}</TableHead>
                            <TableHead>{T("chargingApp.group")}</TableHead>
                            <TableHead>{T("common.status")}</TableHead>
                            <TableHead>{T("chargingApp.registered")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filtered.map((u) => (
                            <TableRow key={u.id}>
                              <TableCell className="font-medium">{u.name}</TableCell>
                              <TableCell className="text-muted-foreground">{u.email || "—"}</TableCell>
                              <TableCell>{getGroupName(u.group_id)}</TableCell>
                              <TableCell>{statusBadge(u.status)}</TableCell>
                              <TableCell className="text-muted-foreground text-sm">
                                {format(new Date(u.created_at), "dd.MM.yyyy")}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
};

export default ChargingAppAdmin;