import { Navigate, useNavigate } from "react-router-dom";
import { useMemo, useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import SuperAdminSidebar from "@/components/super-admin/SuperAdminSidebar";
import { usePlatformStats } from "@/hooks/usePlatformStats";
import { useSATranslation } from "@/hooks/useSATranslation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, Users, MapPin, Settings2, GripVertical, RotateCcw, X, ExternalLink } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import LocationsMapContent from "@/components/locations/LocationsMapContent";

const SA_WIDGETS_KEY = "sa-dashboard-widgets";

type WidgetSize = "full" | "2/3" | "1/3";

interface SAWidget {
  type: string;
  visible: boolean;
  size: WidgetSize;
  position: number;
}

const DEFAULT_WIDGETS: SAWidget[] = [
  { type: "kpi_tenants", visible: true, size: "1/3", position: 0 },
  { type: "kpi_users", visible: true, size: "1/3", position: 1 },
  { type: "kpi_locations", visible: true, size: "1/3", position: 2 },
  { type: "map", visible: true, size: "full", position: 3 },
];

function loadWidgets(): SAWidget[] {
  try {
    const stored = localStorage.getItem(SA_WIDGETS_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return DEFAULT_WIDGETS;
}

const SIZE_MAP: Record<WidgetSize, string> = {
  full: "w-full",
  "2/3": "w-full md:w-[calc(66.666%-0.5rem)]",
  "1/3": "w-full md:w-[calc(33.333%-0.667rem)]",
};

interface TenantLocation {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  type: string;
  tenant_id: string;
  tenant_name: string;
  is_main_location: boolean;
  parent_id: string | null;
  show_on_map: boolean;
}

const SuperAdminDashboard = () => {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: roleLoading } = useSuperAdmin();
  const { tenantCount, userCount, locationCount } = usePlatformStats();
  const { t } = useSATranslation();
  const navigate = useNavigate();

  const [widgets, setWidgets] = useState<SAWidget[]>(loadWidgets);
  const [selectedLocation, setSelectedLocation] = useState<TenantLocation | null>(null);
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [dragOverItem, setDragOverItem] = useState<string | null>(null);

  const saveWidgets = useCallback((w: SAWidget[]) => {
    setWidgets(w);
    localStorage.setItem(SA_WIDGETS_KEY, JSON.stringify(w));
  }, []);

  const { data: locations = [] } = useQuery({
    queryKey: ["super-admin-map-locations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("locations")
        .select("*, tenants(name)")
        .not("latitude", "is", null)
        .not("longitude", "is", null)
        .eq("show_on_map", true);
      if (error) throw error;
      return (data || [])
        .filter((loc: any) => !loc.parent_id)
        .map((loc: any): TenantLocation => ({
          id: loc.id, name: loc.name, address: loc.address, city: loc.city,
          postal_code: loc.postal_code, latitude: loc.latitude, longitude: loc.longitude,
          type: loc.type, tenant_id: loc.tenant_id, tenant_name: loc.tenants?.name ?? "–",
          is_main_location: loc.is_main_location, parent_id: loc.parent_id, show_on_map: loc.show_on_map,
        }));
    },
  });

  if (authLoading || roleLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><div className="animate-pulse text-muted-foreground">{t("common.loading")}</div></div>;
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isSuperAdmin) return <Navigate to="/" replace />;

  const widgetLabels: Record<string, string> = {
    kpi_tenants: t("dashboard.tenants"),
    kpi_users: t("dashboard.users"),
    kpi_locations: t("dashboard.locations"),
    map: t("dashboard.map"),
  };

  const sizeLabels: Record<WidgetSize, string> = {
    full: t("size.full"),
    "2/3": t("size.2/3"),
    "1/3": t("size.1/3"),
  };

  const sorted = [...widgets].sort((a, b) => a.position - b.position);
  const visible = sorted.filter((w) => w.visible);

  const kpis = [
    { type: "kpi_tenants", label: t("dashboard.tenants"), value: tenantCount, icon: Building2 },
    { type: "kpi_users", label: t("dashboard.users"), value: userCount, icon: Users },
    { type: "kpi_locations", label: t("dashboard.locations"), value: locationCount, icon: MapPin },
  ];

  const tenantGroups = locations.reduce<Record<string, { name: string; id: string; count: number }>>((acc, loc) => {
    if (!acc[loc.tenant_id]) acc[loc.tenant_id] = { name: loc.tenant_name, id: loc.tenant_id, count: 0 };
    acc[loc.tenant_id].count++;
    return acc;
  }, {});

  const toggleVisibility = (type: string) => {
    saveWidgets(widgets.map((w) => w.type === type ? { ...w, visible: !w.visible } : w));
  };

  const resizeWidget = (type: string, size: WidgetSize) => {
    saveWidgets(widgets.map((w) => w.type === type ? { ...w, size } : w));
  };

  const reorder = (newOrder: string[]) => {
    saveWidgets(widgets.map((w) => ({ ...w, position: newOrder.indexOf(w.type) })));
  };

  const resetLayout = () => saveWidgets(DEFAULT_WIDGETS);

  const handleDragStart = (e: React.DragEvent, type: string) => { setDraggedItem(type); e.dataTransfer.effectAllowed = "move"; };
  const handleDragOver = (e: React.DragEvent, type: string) => { e.preventDefault(); if (type !== draggedItem) setDragOverItem(type); };
  const handleDrop = (e: React.DragEvent, target: string) => {
    e.preventDefault();
    if (!draggedItem || draggedItem === target) { setDraggedItem(null); setDragOverItem(null); return; }
    const order = sorted.map((w) => w.type);
    const di = order.indexOf(draggedItem);
    const ti = order.indexOf(target);
    order.splice(di, 1);
    order.splice(ti, 0, draggedItem);
    reorder(order);
    setDraggedItem(null);
    setDragOverItem(null);
  };

  const renderWidget = (widget: SAWidget) => {
    const kpi = kpis.find((k) => k.type === widget.type);
    if (kpi) {
      return (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{kpi.label}</CardTitle>
            <kpi.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{kpi.value}</div>
          </CardContent>
        </Card>
      );
    }

    if (widget.type === "map") {
      return (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              {t("dashboard.map")}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {t("dashboard.map_subtitle")} ({locations.length} {t("dashboard.locations")}, {Object.keys(tenantGroups).length} {t("dashboard.tenants")})
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <LocationsMapContent
                locations={locations as any}
                onLocationClick={(loc: any) => {
                  const found = locations.find((l) => l.id === loc.id);
                  if (found) setSelectedLocation(found);
                }}
                className="h-[400px]"
              />
              {selectedLocation && (
                <div className="absolute top-4 right-4 z-[1000] w-72">
                  <Card className="shadow-lg">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 shrink-0" style={{ color: `hsl(var(--sa-primary))` }} />
                          <CardTitle className="text-sm">{selectedLocation.name}</CardTitle>
                        </div>
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setSelectedLocation(null)}><X className="h-4 w-4" /></Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">{t("billing.tenant")}</p>
                        <p className="font-medium">{selectedLocation.tenant_name}</p>
                      </div>
                      {selectedLocation.address && (
                        <div>
                          <p className="text-xs text-muted-foreground">{t("tenant_detail.address")}</p>
                          <p>{selectedLocation.address}{selectedLocation.postal_code && `, ${selectedLocation.postal_code}`}{selectedLocation.city && ` ${selectedLocation.city}`}</p>
                        </div>
                      )}
                      <div className="flex gap-2">
                        {selectedLocation.is_main_location && <Badge variant="default">{t("dashboard.main_location")}</Badge>}
                        <Badge variant="secondary">
                          {selectedLocation.type === "einzelgebaeude" ? t("location.einzelgebaeude") : selectedLocation.type === "gebaeudekomplex" ? t("location.gebaeudekomplex") : t("location.sonstiges")}
                        </Badge>
                      </div>
                      <Button className="w-full" size="sm" onClick={() => navigate(`/super-admin/tenants/${selectedLocation.tenant_id}`)}>
                        <ExternalLink className="h-4 w-4 mr-2" />{t("dashboard.show_tenant")}
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
            {Object.keys(tenantGroups).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {Object.values(tenantGroups).map((tg) => (
                  <Badge key={tg.id} variant="outline" className="cursor-pointer hover:bg-accent transition-colors" onClick={() => navigate(`/super-admin/tenants/${tg.id}`)}>
                    {tg.name} ({tg.count})
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      );
    }

    return null;
  };

  return (
    <div className="flex min-h-screen bg-background">
      <SuperAdminSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t("dashboard.title")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("dashboard.subtitle")}</p>
          </div>
          <Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="icon" className="h-9 w-9"><Settings2 className="h-4 w-4" /></Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent>{t("dashboard.customize")}</TooltipContent>
            </Tooltip>
            <PopoverContent align="end" className="w-96 bg-popover border shadow-lg z-50">
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium text-sm mb-1">{t("dashboard.show_widgets")}</h4>
                  <p className="text-xs text-muted-foreground">{t("dashboard.drag_hint")}</p>
                </div>
                <div className="space-y-2">
                  {sorted.map((widget) => (
                    <div
                      key={widget.type}
                      draggable
                      onDragStart={(e) => handleDragStart(e, widget.type)}
                      onDragOver={(e) => handleDragOver(e, widget.type)}
                      onDragLeave={() => setDragOverItem(null)}
                      onDrop={(e) => handleDrop(e, widget.type)}
                      onDragEnd={() => { setDraggedItem(null); setDragOverItem(null); }}
                      className={cn(
                        "flex items-center justify-between p-2 rounded-lg bg-muted/50 cursor-grab active:cursor-grabbing transition-all gap-2",
                        draggedItem === widget.type && "opacity-50 scale-95",
                        dragOverItem === widget.type && "ring-2 ring-primary ring-offset-1"
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <Label className="text-sm cursor-grab truncate">{widgetLabels[widget.type] || widget.type}</Label>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Select value={widget.size} onValueChange={(v) => resizeWidget(widget.type, v as WidgetSize)}>
                          <SelectTrigger className="h-7 w-[100px] text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(Object.entries(sizeLabels) as [WidgetSize, string][]).map(([val, lbl]) => (
                              <SelectItem key={val} value={val} className="text-xs">{lbl}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Switch checked={widget.visible} onCheckedChange={() => toggleVisibility(widget.type)} />
                      </div>
                    </div>
                  ))}
                </div>
                <Button variant="outline" size="sm" className="w-full" onClick={resetLayout}>
                  <RotateCcw className="h-4 w-4 mr-2" />{t("dashboard.reset_layout")}
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </header>
        <div className="p-6">
          <div className="flex flex-wrap gap-4">
            {visible.map((widget) => (
              <div key={widget.type} className={SIZE_MAP[widget.size]}>
                {renderWidget(widget)}
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

export default SuperAdminDashboard;
