import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useLocations, Location } from "@/hooks/useLocations";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { LocationsMap } from "@/components/locations/LocationsMap";
import { LocationTree } from "@/components/locations/LocationTree";
import { AddLocationDialog } from "@/components/locations/AddLocationDialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Map, List, Building2 } from "lucide-react";

const Locations = () => {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin } = useUserRole();
  const { locations, hierarchicalLocations, loading: locationsLoading } = useLocations();
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);

  // Filter locations that should be shown on map
  const mapLocations = locations.filter((loc) => loc.show_on_map);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Laden...</div>
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
            <h1 className="text-2xl font-display font-bold">Standorte</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Verwalten Sie Ihre Standorte, Gebäude und Bereiche
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
                Standortkarte
              </CardTitle>
              <CardDescription>
                Übersicht aller Standorte auf der Karte
              </CardDescription>
            </CardHeader>
            <CardContent>
            {locationsLoading ? (
              <div className="h-[400px] rounded-lg bg-muted/50 animate-pulse" />
            ) : (
              <LocationsMap 
                locations={mapLocations} 
                onLocationClick={setSelectedLocation}
              />
            )}
            </CardContent>
          </Card>

          {/* Locations List/Tree */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Standortübersicht
              </CardTitle>
              <CardDescription>
                Hierarchische Ansicht aller Standorte und Gebäude
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="tree">
                <TabsList className="mb-4">
                  <TabsTrigger value="tree" className="gap-2">
                    <List className="h-4 w-4" />
                    Baumansicht
                  </TabsTrigger>
                  <TabsTrigger value="list" className="gap-2">
                    <List className="h-4 w-4" />
                    Liste
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="tree">
                  {locationsLoading ? (
                    <div className="space-y-2">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="h-10 bg-muted/50 rounded animate-pulse" />
                      ))}
                    </div>
                  ) : (
                    <LocationTree
                      locations={hierarchicalLocations}
                      selectedId={selectedLocation?.id}
                      onSelect={setSelectedLocation}
                    />
                  )}
                </TabsContent>
                <TabsContent value="list">
                  {locationsLoading ? (
                    <div className="space-y-2">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="h-10 bg-muted/50 rounded animate-pulse" />
                      ))}
                    </div>
                  ) : locations.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Building2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>Keine Standorte vorhanden</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {locations.map((location) => (
                        <div
                          key={location.id}
                          className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                          onClick={() => setSelectedLocation(location)}
                        >
                          <Building2 className="h-5 w-5 text-muted-foreground" />
                          <div className="flex-1">
                            <p className="font-medium">{location.name}</p>
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
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Selected Location Details */}
          {selectedLocation && (
            <Card>
              <CardHeader>
                <CardTitle>{selectedLocation.name}</CardTitle>
                <CardDescription>
                  Details zum ausgewählten Standort
                </CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground">Typ</dt>
                    <dd className="capitalize">{selectedLocation.type}</dd>
                  </div>
                  {selectedLocation.address && (
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">Adresse</dt>
                      <dd>{selectedLocation.address}</dd>
                    </div>
                  )}
                  {selectedLocation.city && (
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">Stadt</dt>
                      <dd>{selectedLocation.postal_code} {selectedLocation.city}</dd>
                    </div>
                  )}
                  {selectedLocation.latitude && selectedLocation.longitude && (
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">Koordinaten</dt>
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
