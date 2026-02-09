import { Navigate, useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import SuperAdminSidebar from "@/components/super-admin/SuperAdminSidebar";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import LocationsMapContent from "@/components/locations/LocationsMapContent";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, ExternalLink, MapPin, X } from "lucide-react";

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

const SuperAdminMap = () => {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: roleLoading } = useSuperAdmin();
  const navigate = useNavigate();
  const [selectedLocation, setSelectedLocation] = useState<TenantLocation | null>(null);

  const { data: locations = [], isLoading } = useQuery({
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
        .filter((loc: any) => !loc.parent_id) // Only show top-level locations
        .map((loc: any): TenantLocation => ({
          id: loc.id,
          name: loc.name,
          address: loc.address,
          city: loc.city,
          postal_code: loc.postal_code,
          latitude: loc.latitude,
          longitude: loc.longitude,
          type: loc.type,
          tenant_id: loc.tenant_id,
          tenant_name: loc.tenants?.name ?? "–",
          is_main_location: loc.is_main_location,
          parent_id: loc.parent_id,
          show_on_map: loc.show_on_map,
        }));
    },
  });

  if (authLoading || roleLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><div className="animate-pulse text-muted-foreground">Laden...</div></div>;
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isSuperAdmin) return <Navigate to="/" replace />;

  // Group by tenant for the sidebar summary
  const tenantGroups = locations.reduce<Record<string, { name: string; id: string; count: number }>>((acc, loc) => {
    if (!acc[loc.tenant_id]) {
      acc[loc.tenant_id] = { name: loc.tenant_name, id: loc.tenant_id, count: 0 };
    }
    acc[loc.tenant_id].count++;
    return acc;
  }, {});

  const handleLocationClick = (loc: any) => {
    const found = locations.find((l) => l.id === loc.id);
    if (found) setSelectedLocation(found);
  };

  return (
    <div className="flex min-h-screen bg-background">
      <SuperAdminSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-6">
          <h1 className="text-2xl font-bold">Standort-Karte</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Alle Kundenstandorte auf einen Blick ({locations.length} Standorte, {Object.keys(tenantGroups).length} Mandanten)
          </p>
        </header>
        <div className="p-6 space-y-4">
          <div className="relative">
            <LocationsMapContent
              locations={locations as any}
              onLocationClick={handleLocationClick}
              className="h-[500px]"
            />

            {/* Selected location detail overlay */}
            {selectedLocation && (
              <div className="absolute top-4 right-4 z-[1000] w-80">
                <Card className="shadow-lg">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-primary shrink-0" />
                        <CardTitle className="text-base">{selectedLocation.name}</CardTitle>
                      </div>
                      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setSelectedLocation(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Mandant</p>
                      <p className="text-sm font-medium">{selectedLocation.tenant_name}</p>
                    </div>
                    {selectedLocation.address && (
                      <div>
                        <p className="text-xs text-muted-foreground">Adresse</p>
                        <p className="text-sm">
                          {selectedLocation.address}
                          {selectedLocation.postal_code && `, ${selectedLocation.postal_code}`}
                          {selectedLocation.city && ` ${selectedLocation.city}`}
                        </p>
                      </div>
                    )}
                    <div className="flex gap-2">
                      {selectedLocation.is_main_location && (
                        <Badge variant="default">Hauptstandort</Badge>
                      )}
                      <Badge variant="secondary">
                        {selectedLocation.type === "einzelgebaeude" ? "Einzelgebäude" :
                         selectedLocation.type === "gebaeudekomplex" ? "Komplex" : "Sonstiges"}
                      </Badge>
                    </div>
                    <Button
                      className="w-full"
                      size="sm"
                      onClick={() => navigate(`/super-admin/tenants/${selectedLocation.tenant_id}`)}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Mandant anzeigen
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>

          {/* Tenant summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Standorte nach Mandant
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-muted-foreground text-sm">Laden...</p>
              ) : Object.keys(tenantGroups).length === 0 ? (
                <p className="text-muted-foreground text-sm">Keine Standorte mit Geodaten vorhanden</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {Object.values(tenantGroups).map((t) => (
                    <Badge
                      key={t.id}
                      variant="outline"
                      className="cursor-pointer hover:bg-accent transition-colors"
                      onClick={() => navigate(`/super-admin/tenants/${t.id}`)}
                    >
                      {t.name} ({t.count})
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default SuperAdminMap;
