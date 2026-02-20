import { useState } from "react";
import { Navigate, useParams, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useLocations, LocationUsageType } from "@/hooks/useLocations";
import { useFloors } from "@/hooks/useFloors";
import { useTranslation } from "@/hooks/useTranslation";
import { useModuleGuard } from "@/hooks/useModuleGuard";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { FloorList } from "@/components/locations/FloorList";
import { AddFloorDialog } from "@/components/locations/AddFloorDialog";
import { LocationIntegrationsList } from "@/components/integrations/LocationIntegrationsList";
import { LocationAutomation } from "@/components/locations/LocationAutomation";
import { MeterManagement } from "@/components/locations/MeterManagement";
import { BrightHubSettings } from "@/components/settings/BrightHubSettings";
import { EnergyPriceManagement } from "@/components/locations/EnergyPriceManagement";
import { PvForecastSection } from "@/components/locations/PvForecastSection";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  ArrowLeft, 
  Building2, 
  MapPin, 
  Mail, 
  Phone, 
  User, 
  Star,
  Layers,
  ChevronDown,
  ChevronRight,
  Cpu
} from "lucide-react";

const usageTypeLabels: Record<LocationUsageType, string> = {
  verwaltungsgebaeude: "Verwaltungsgebäude",
  universitaet: "Universität",
  schule: "Schule",
  kindertageseinrichtung: "Kindertageseinrichtung",
  sportstaette: "Sportstätte",
  jugendzentrum: "Jugendzentrum",
  sonstiges: "Sonstiges",
};

const FloorsCollapsible = ({ locationId, isAdmin, floors, floorsLoading, refetchFloors }: { locationId: string; isAdmin: boolean; floors: any[]; floorsLoading: boolean; refetchFloors: () => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 text-left group">
              {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="h-5 w-5" />
                  Etagen & Grundrisse
                </CardTitle>
                <CardDescription>
                  Verwalten Sie die Etagen und deren Grundrisspläne für diesen Standort
                </CardDescription>
              </div>
            </button>
          </CollapsibleTrigger>
          {isAdmin && <AddFloorDialog locationId={locationId} onSuccess={refetchFloors} />}
        </CardHeader>
        <CollapsibleContent>
          <CardContent>
            <FloorList floors={floors} loading={floorsLoading} locationId={locationId} onRefresh={refetchFloors} />
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};

const LocationDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const { isAdmin } = useUserRole();
  const { locations, loading: locationsLoading } = useLocations();
  const { floors, loading: floorsLoading, refetch: refetchFloors } = useFloors(id);
  const { t } = useTranslation();
  const { isModuleEnabled } = useModuleGuard();

  const location = locations.find((loc) => loc.id === id);

  if (authLoading || locationsLoading) {
    return (
      <div className="flex min-h-screen bg-background">
        <DashboardSidebar />
        <main className="flex-1 overflow-auto p-6">
          <Skeleton className="h-8 w-48 mb-6" />
          <div className="grid gap-6 md:grid-cols-2">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        </main>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (!location) return <Navigate to="/locations" replace />;

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-6">
          <div className="flex items-center gap-4 mb-4">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/locations">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Zurück
              </Link>
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Building2 className="h-8 w-8 text-primary" />
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-display font-bold">{location.name}</h1>
                  {location.is_main_location && (
                    <Badge variant="secondary" className="gap-1 bg-amber-100 text-amber-700 border-amber-200">
                      <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                      Hauptstandort
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {location.usage_type && usageTypeLabels[location.usage_type]}
                </p>
              </div>
            </div>
          </div>
        </header>

        <div className="p-6 space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Location Info Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Standortinformationen
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {location.address && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Adresse</p>
                    <p>{location.address}</p>
                    {location.city && (
                      <p>{location.postal_code} {location.city}</p>
                    )}
                    {location.country && <p>{location.country}</p>}
                  </div>
                )}
                {location.description && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Beschreibung</p>
                    <p>{location.description}</p>
                  </div>
                )}
                {location.latitude && location.longitude && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Koordinaten</p>
                    <p>{location.latitude}, {location.longitude}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Contact Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Kontakt
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {location.contact_person ? (
                  <>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span>{location.contact_person}</span>
                    </div>
                    {location.contact_email && (
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <a href={`mailto:${location.contact_email}`} className="text-primary hover:underline">
                          {location.contact_email}
                        </a>
                      </div>
                    )}
                    {location.contact_phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <a href={`tel:${location.contact_phone}`} className="text-primary hover:underline">
                          {location.contact_phone}
                        </a>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground">Keine Kontaktdaten hinterlegt</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Floors Card - only if floor_plans module is enabled */}
          {isModuleEnabled("floor_plans") && (
            <FloorsCollapsible locationId={location.id} isAdmin={isAdmin} floors={floors} floorsLoading={floorsLoading} refetchFloors={refetchFloors} />
          )}

          {/* Meters & Alerts */}
          <MeterManagement locationId={location.id} />

          {/* Energy Prices */}
          <EnergyPriceManagement locationId={location.id} />

          {/* PV Forecast */}
          {location.latitude && location.longitude && (
            <PvForecastSection locationId={location.id} />
          )}

          {/* Automation - only if building automation module is enabled */}
          {isModuleEnabled("automation_building") && (
            <LocationAutomation locationId={location.id} />
          )}

          {/* Integrations Card - only if integrations module is enabled */}
          {isModuleEnabled("integrations") && (
            <LocationIntegrationsList locationId={location.id} />
          )}

          {/* BrightHub API - only if brighthub_api module is enabled */}
          {isModuleEnabled("brighthub_api") && (
            <BrightHubSettings locationId={location.id} />
          )}
        </div>
      </main>
    </div>
  );
};

export default LocationDetail;
