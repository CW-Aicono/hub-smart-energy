import { useState, useMemo } from "react";

import { Navigate, useNavigate } from "react-router-dom";
import { useDemoPath } from "@/contexts/DemoMode";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useLocations, Location, LocationUsageType } from "@/hooks/useLocations";
import { useModuleGuard } from "@/hooks/useModuleGuard";
import { useLocationStatus } from "@/hooks/useLocationStatus";
import { useTranslation } from "@/hooks/useTranslation";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { LocationsMap } from "@/components/locations/LocationsMap";
import { LocationTree } from "@/components/locations/LocationTree";
import { AddLocationDialog } from "@/components/locations/AddLocationDialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Map, List, Building2, Landmark, ArrowUpAZ, ArrowDownAZ, Filter, Wifi, WifiOff, AlertCircle, GitBranch, ArrowLeft, Search } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

const usageTypeKeys: Record<LocationUsageType, string> = {
  verwaltungsgebaeude: "locations.usage.verwaltungsgebaeude",
  universitaet: "locations.usage.universitaet",
  schule: "locations.usage.schule",
  kindertageseinrichtung: "locations.usage.kindertageseinrichtung",
  sportstaette: "locations.usage.sportstaette",
  jugendzentrum: "locations.usage.jugendzentrum",
  gewerbe: "locations.usage.gewerbe",
  privat: "locations.usage.privat",
  sonstiges: "locations.usage.sonstiges",
};

const Locations = () => {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin } = useUserRole();
  const { locations: allLocations, hierarchicalLocations: allHierarchical, loading: locationsLoading, refetch } = useLocations();
  const { locationsFullEnabled } = useModuleGuard();

  // When locations module is disabled, only show main location
  const locations = useMemo(() => {
    if (locationsFullEnabled) return allLocations;
    return allLocations.filter((l) => l.is_main_location);
  }, [allLocations, locationsFullEnabled]);

  const hierarchicalLocations = useMemo(() => {
    if (locationsFullEnabled) return allHierarchical;
    return allHierarchical.filter((l) => l.is_main_location);
  }, [allHierarchical, locationsFullEnabled]);

  const locationIds = useMemo(() => locations.map((l) => l.id), [locations]);
  const { locationStatuses } = useLocationStatus(locationIds);
  const { t } = useTranslation();
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [usageFilter, setUsageFilter] = useState<string>("all");
  const [sortAscending, setSortAscending] = useState(true);
  const [viewMode, setViewMode] = useState<"list" | "tree">("list");
  const [treeLocationId, setTreeLocationId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const navigate = useNavigate();
  const demoPath = useDemoPath();

  // Handle clicking a location - navigate to detail page
  const handleLocationClick = (location: Location) => {
    navigate(demoPath(`/locations/${location.id}`));
  };


  // Helper to render online status badge
  const getOnlineStatusBadge = (locationId: string) => {
    const status = locationStatuses.get(locationId);
    
    if (!status || status.totalIntegrations === 0) {
      return null; // No integrations, don't show badge
    }

    const badges: React.ReactNode[] = [];

    // Show Online badge if at least one integration is connected
    if (status.isOnline) {
      badges.push(
        <Badge key="online" variant="outline" className="gap-1 text-xs bg-primary/10 text-primary border-primary/20">
          <Wifi className="h-3 w-3" />
          Online
        </Badge>
      );
    } else if (status.onlineIntegrations === 0 && !status.hasUnconfigured) {
      badges.push(
        <Badge key="offline" variant="outline" className="gap-1 text-xs bg-destructive/10 text-destructive border-destructive/20">
          <WifiOff className="h-3 w-3" />
          Offline
        </Badge>
      );
    }

    // Show warning badges for unconfigured integrations with their short name
    if (status.hasUnconfigured) {
      status.unconfiguredNames.forEach((name, i) => {
        badges.push(
          <Badge key={`unconf-${i}`} variant="outline" className="gap-1 text-xs bg-secondary/50 text-secondary-foreground border-border">
            <AlertCircle className="h-3 w-3" />
            {name}
          </Badge>
        );
      });
    }

    return badges.length > 0 ? <>{badges}</> : null;
  };

  // Filter and sort locations, grouping children under parents
  const filteredAndSortedLocations = useMemo(() => {
    let filtered = locations;
    
    // Apply text search (include parent if any child matches)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchingIds = new Set(
        filtered
          .filter((loc) =>
            loc.name.toLowerCase().includes(q) ||
            loc.city?.toLowerCase().includes(q) ||
            loc.address?.toLowerCase().includes(q) ||
            loc.postal_code?.toLowerCase().includes(q)
          )
          .map((loc) => loc.id)
      );
      filtered.forEach((loc) => {
        if (matchingIds.has(loc.id) && loc.parent_id) matchingIds.add(loc.parent_id);
      });
      filtered = filtered.filter((loc) => matchingIds.has(loc.id));
    }
    
    // Apply usage type filter
    if (usageFilter !== "all") {
      const matchingIds = new Set(
        filtered.filter((loc) => loc.usage_type === usageFilter).map((loc) => loc.id)
      );
      filtered.forEach((loc) => {
        if (matchingIds.has(loc.id) && loc.parent_id) matchingIds.add(loc.parent_id);
      });
      filtered = filtered.filter((loc) => matchingIds.has(loc.id));
    }
    
    // Only top-level locations
    const topLevel = filtered.filter((loc) => !loc.parent_id);
    const mainLocation = topLevel.find((loc) => loc.is_main_location);
    const otherLocations = topLevel.filter((loc) => !loc.is_main_location);
    
    otherLocations.sort((a, b) => {
      const comparison = a.name.localeCompare(b.name, "de");
      return sortAscending ? comparison : -comparison;
    });
    
    const sorted = mainLocation ? [mainLocation, ...otherLocations] : otherLocations;

    // Attach children to each top-level location
    return sorted.map((loc) => ({
      ...loc,
      _children: filtered
        .filter((child) => child.parent_id === loc.id)
        .sort((a, b) => {
          const comparison = a.name.localeCompare(b.name, "de");
          return sortAscending ? comparison : -comparison;
        }),
    }));
  }, [locations, usageFilter, sortAscending, searchQuery]);

  // Build hierarchy with filter applied
  const filteredHierarchicalLocations = useMemo(() => {
    if (usageFilter === "all") {
      // Apply sorting to hierarchical view too
      const sortLocations = (locs: Location[]): Location[] => {
        const mainLoc = locs.find((loc) => loc.is_main_location);
        const others = locs.filter((loc) => !loc.is_main_location);
        
        others.sort((a, b) => {
          const comparison = a.name.localeCompare(b.name, "de");
          return sortAscending ? comparison : -comparison;
        });
        
        const sorted = mainLoc ? [mainLoc, ...others] : others;
        
        return sorted.map((loc) => ({
          ...loc,
          children: loc.children ? sortLocations(loc.children) : undefined,
        }));
      };
      
      return sortLocations(hierarchicalLocations);
    }
    
    // When filtering, show flat list instead of hierarchy
    return filteredAndSortedLocations.map((loc) => ({ ...loc, children: undefined }));
  }, [hierarchicalLocations, filteredAndSortedLocations, usageFilter, sortAscending]);

  // Get locations for tree view (single selected or all)
  const treeViewLocations = useMemo(() => {
    if (treeLocationId) {
      const found = filteredHierarchicalLocations.find((l) => l.id === treeLocationId);
      return found ? [found] : [];
    }
    return filteredHierarchicalLocations;
  }, [treeLocationId, filteredHierarchicalLocations]);

  // Filter locations that should be shown on map
  const mapLocations = locations.filter((loc) => loc.show_on_map);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">{t("common.loading")}</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-4 md:p-6 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-display font-bold">{t("locations.title")}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t("locations.subtitle")}
            </p>
          </div>
          {isAdmin && locationsFullEnabled && <AddLocationDialog />}
        </header>
        <div className="p-3 md:p-6 space-y-6">
          {/* Map Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Map className="h-5 w-5" />
                {t("locations.map")}
              </CardTitle>
              <CardDescription>
                {t("locations.mapDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent>
            {locationsLoading ? (
              <div className="h-[400px] rounded-lg bg-muted/50 animate-pulse" />
            ) : (
              <div className="h-[400px]">
                <LocationsMap 
                  locations={mapLocations} 
                  onLocationClick={setSelectedLocation}
                  className="h-full"
                />
              </div>
            )}
            </CardContent>
          </Card>

          {/* Locations List/Tree */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                {t("locations.overview")}
              </CardTitle>
              <CardDescription>
                {t("locations.overviewDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Filter and Sort Controls */}
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t("locations.searchPlaceholder" as any)}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <Select value={usageFilter} onValueChange={setUsageFilter}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder={t("locations.filterUsageType" as any)} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("locations.allUsageTypes" as any)}</SelectItem>
                      {Object.entries(usageTypeKeys).map(([value, key]) => (
                        <SelectItem key={value} value={value}>
                          {t(key as any)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSortAscending(!sortAscending)}
                  className="gap-2"
                >
                  {sortAscending ? (
                    <>
                      <ArrowUpAZ className="h-4 w-4" />
                      A-Z
                    </>
                  ) : (
                    <>
                      <ArrowDownAZ className="h-4 w-4" />
                      Z-A
                    </>
                  )}
                </Button>
                <div className="flex items-center gap-2">
                  <List className="h-4 w-4 text-muted-foreground" />
                  <Switch
                    checked={viewMode === "tree"}
                    onCheckedChange={(checked) => {
                      const scrollContainer = document.querySelector('main.flex-1.overflow-auto');
                      const scrollTop = scrollContainer?.scrollTop ?? 0;
                      setViewMode(checked ? "tree" : "list");
                      setTreeLocationId(null);
                      requestAnimationFrame(() => {
                        if (scrollContainer) scrollContainer.scrollTop = scrollTop;
                      });
                    }}
                  />
                  <GitBranch className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>

              {/* Back button when viewing single location tree */}
              {viewMode === "list" && treeLocationId && (
                <div className="mb-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setTreeLocationId(null); setSelectedLocation(null); }}
                    className="gap-2"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    {t("locations.backToList" as any)}
                  </Button>
                </div>
              )}

              {locationsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-10 bg-muted/50 rounded animate-pulse" />
                  ))}
                </div>
              ) : viewMode === "tree" || treeLocationId ? (
                <LocationTree
                  locations={treeViewLocations}
                  selectedId={selectedLocation?.id}
                  onSelect={setSelectedLocation}
                  onRefresh={refetch}
                  locationStatuses={locationStatuses}
                />
              ) : filteredAndSortedLocations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Building2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>{t("locations.noLocations")}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredAndSortedLocations.map((location) => (
                    <div
                      key={location.id}
                      className="rounded-lg border overflow-hidden"
                    >
                      <div
                        className="flex items-center gap-4 p-4 hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => handleLocationClick(location)}
                      >
                        {location.type === "gebaeudekomplex" ? (
                          <Landmark className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                        ) : (
                          <Building2 className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-base">{location.name}</p>
                            {getOnlineStatusBadge(location.id)}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            {location.city && <span>{location.city}</span>}
                            {location.city && (location.usage_type || location.type) && <span>·</span>}
                            {location.usage_type && <span>{t(`locations.usage.${location.usage_type}` as any)}</span>}
                            {location.usage_type && location.type && <span>·</span>}
                            {location.type && (
                              <span>{t(`locations.types.${location.type}` as any)}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      {location._children && location._children.length > 0 && (
                        <div className="border-t bg-muted/20">
                          {location._children.map((child: Location) => (
                            <div
                              key={child.id}
                              className="flex items-center gap-4 p-3 pl-12 hover:bg-muted/50 cursor-pointer transition-colors border-t first:border-t-0"
                              onClick={() => handleLocationClick(child)}
                            >
                              <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" /> {/* Children are always Einzelgebäude */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="font-medium text-sm">{child.name}</p>
                                  {getOnlineStatusBadge(child.id)}
                                </div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  {child.usage_type && <span>{t(`locations.usage.${child.usage_type}` as any)}</span>}
                                  {child.usage_type && child.type && <span>·</span>}
                                  {child.type && (
                                    <span>{t(`locations.types.${child.type}` as any)}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Selected Location Details */}
          {selectedLocation && (
            <Card>
              <CardHeader>
                <CardTitle>{selectedLocation.name}</CardTitle>
                <CardDescription>
                  {t("locations.details")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground">{t("locations.type")}</dt>
                    <dd className="capitalize">{t(`locations.types.${selectedLocation.type}` as any)}</dd>
                  </div>
                  {selectedLocation.address && (
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">{t("locations.address")}</dt>
                      <dd>{selectedLocation.address}</dd>
                    </div>
                  )}
                  {selectedLocation.city && (
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">{t("locations.city")}</dt>
                      <dd>{selectedLocation.postal_code} {selectedLocation.city}</dd>
                    </div>
                  )}
                  {selectedLocation.latitude && selectedLocation.longitude && (
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">{t("locations.coordinates")}</dt>
                      <dd>{selectedLocation.latitude}, {selectedLocation.longitude}</dd>
                    </div>
                  )}
                </dl>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
};

export default Locations;
