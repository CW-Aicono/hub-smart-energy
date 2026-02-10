import { useState, useMemo } from "react";

import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useLocations, Location, LocationUsageType } from "@/hooks/useLocations";
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
import { Map, List, Building2, ArrowUpAZ, ArrowDownAZ, Filter, Wifi, WifiOff, AlertCircle, GitBranch, ArrowLeft, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

const usageTypeLabels: Record<LocationUsageType, string> = {
  verwaltungsgebaeude: "Verwaltungsgebäude",
  universitaet: "Universität",
  schule: "Schule",
  kindertageseinrichtung: "Kindertageseinrichtung",
  sportstaette: "Sportstätte",
  jugendzentrum: "Jugendzentrum",
  sonstiges: "Sonstiges",
};

const Locations = () => {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin } = useUserRole();
  const { locations, hierarchicalLocations, loading: locationsLoading, refetch } = useLocations();
  const locationIds = useMemo(() => locations.map((l) => l.id), [locations]);
  const { locationStatuses } = useLocationStatus(locationIds);
  const { t } = useTranslation();
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [usageFilter, setUsageFilter] = useState<string>("all");
  const [sortAscending, setSortAscending] = useState(true);
  const [viewMode, setViewMode] = useState<"list" | "tree">("list");
  const [treeLocationId, setTreeLocationId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Handle clicking a location in list view - show its tree
  const handleLocationClick = (location: Location) => {
    setTreeLocationId(location.id);
    setSelectedLocation(location);
  };


  // Helper to render online status badge
  const getOnlineStatusBadge = (locationId: string) => {
    const status = locationStatuses.get(locationId);
    
    if (!status || status.totalIntegrations === 0) {
      return null; // No integrations, don't show badge
    }

    if (status.hasUnconfigured) {
      return (
        <Badge variant="outline" className="gap-1 text-xs bg-secondary/50 text-secondary-foreground border-border">
          <AlertCircle className="h-3 w-3" />
          Konfig. fehlt
        </Badge>
      );
    }

    if (status.isOnline) {
      return (
        <Badge variant="outline" className="gap-1 text-xs bg-primary/10 text-primary border-primary/20">
          <Wifi className="h-3 w-3" />
          Online
        </Badge>
      );
    }

    return (
      <Badge variant="outline" className="gap-1 text-xs bg-destructive/10 text-destructive border-destructive/20">
        <WifiOff className="h-3 w-3" />
        Offline
      </Badge>
    );
  };

  // Filter and sort locations
  const filteredAndSortedLocations = useMemo(() => {
    let filtered = locations;
    
    // Apply text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((loc) =>
        loc.name.toLowerCase().includes(q) ||
        loc.city?.toLowerCase().includes(q) ||
        loc.address?.toLowerCase().includes(q) ||
        loc.postal_code?.toLowerCase().includes(q)
      );
    }
    
    // Apply usage type filter
    if (usageFilter !== "all") {
      filtered = filtered.filter((loc) => loc.usage_type === usageFilter);
    }
    
    // Separate main location and others
    const mainLocation = filtered.find((loc) => loc.is_main_location);
    const otherLocations = filtered.filter((loc) => !loc.is_main_location);
    
    // Sort others alphabetically
    otherLocations.sort((a, b) => {
      const comparison = a.name.localeCompare(b.name, "de");
      return sortAscending ? comparison : -comparison;
    });
    
    // Main location always first
    return mainLocation ? [mainLocation, ...otherLocations] : otherLocations;
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
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold">{t("locations.title")}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t("locations.subtitle")}
            </p>
          </div>
          {isAdmin && <AddLocationDialog />}
        </header>
        <div className="p-6 space-y-6">
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
                    placeholder="Standort suchen..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <Select value={usageFilter} onValueChange={setUsageFilter}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Nutzungsart filtern" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle Nutzungsarten</SelectItem>
                      {Object.entries(usageTypeLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
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
                <Select value={viewMode} onValueChange={(v) => {
                  const scrollContainer = document.querySelector('main.flex-1.overflow-auto');
                  const scrollTop = scrollContainer?.scrollTop ?? 0;
                  setViewMode(v as "list" | "tree");
                  setTreeLocationId(null);
                  requestAnimationFrame(() => {
                    if (scrollContainer) scrollContainer.scrollTop = scrollTop;
                  });
                }}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectItem value="list">
                      <span className="flex items-center gap-2"><List className="h-4 w-4" /> Liste</span>
                    </SelectItem>
                    <SelectItem value="tree">
                      <span className="flex items-center gap-2"><GitBranch className="h-4 w-4" /> Baumansicht</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
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
                    Zurück zur Liste
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
                      className="flex items-center gap-4 p-4 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => handleLocationClick(location)}
                    >
                      <Building2 className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-base">{location.name}</p>
                          {getOnlineStatusBadge(location.id)}
                        </div>
                        {location.city && (
                          <p className="text-sm text-muted-foreground">
                            {location.city}
                          </p>
                        )}
                      </div>
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
