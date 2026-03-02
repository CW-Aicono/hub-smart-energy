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
import { EditLocationDialog } from "@/components/locations/EditLocationDialog";
import { ArrowLeft, Building2, MapPin, Mail, Phone, User, Star, Layers, ChevronDown, ChevronRight, Cpu, Pencil, Calendar, Ruler, Flame } from "lucide-react";

const FloorsCollapsible = ({ locationId, isAdmin, floors, floorsLoading, refetchFloors, t }: { locationId: string; isAdmin: boolean; floors: any[]; floorsLoading: boolean; refetchFloors: () => void; t: (key: any) => string }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 text-left group">
              {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              <div>
                <CardTitle className="flex items-center gap-2"><Layers className="h-5 w-5" />{t("locationDetail.floorsTitle")}</CardTitle>
                <CardDescription>{t("locationDetail.floorsDesc")}</CardDescription>
              </div>
            </button>
          </CollapsibleTrigger>
          {isAdmin && <AddFloorDialog locationId={locationId} onSuccess={refetchFloors} />}
        </CardHeader>
        <CollapsibleContent><CardContent><FloorList floors={floors} loading={floorsLoading} locationId={locationId} onRefresh={refetchFloors} /></CardContent></CollapsibleContent>
      </Card>
    </Collapsible>
  );
};

const LocationDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const { isAdmin } = useUserRole();
  const { locations, loading: locationsLoading, refetch: refetchLocations } = useLocations();
  const { floors, loading: floorsLoading, refetch: refetchFloors } = useFloors(id);
  const { t } = useTranslation();
  const { isModuleEnabled } = useModuleGuard();

  const location = locations.find((loc) => loc.id === id);

  const usageTypeKeys: Record<LocationUsageType, string> = {
    verwaltungsgebaeude: "locations.usage.verwaltungsgebaeude",
    universitaet: "locations.usage.universitaet",
    schule: "locations.usage.schule",
    kindertageseinrichtung: "locations.usage.kindertageseinrichtung",
    sportstaette: "locations.usage.sportstaette",
    jugendzentrum: "locations.usage.jugendzentrum",
    sonstiges: "locations.usage.sonstiges",
  };

  if (authLoading || locationsLoading) {
    return (
      <div className="flex flex-col md:flex-row min-h-screen bg-background">
        <DashboardSidebar />
        <main className="flex-1 overflow-auto p-3 md:p-6">
          <Skeleton className="h-8 w-48 mb-6" />
          <div className="grid gap-6 md:grid-cols-2"><Skeleton className="h-64" /><Skeleton className="h-64" /></div>
        </main>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (!location) return <Navigate to="/locations" replace />;

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-4 md:p-6">
          <div className="flex items-center gap-4 mb-4">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/locations"><ArrowLeft className="h-4 w-4 mr-2" />{t("common.back" as any)}</Link>
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
                      {t("locationDetail.mainLocation" as any)}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {location.usage_type && t(usageTypeKeys[location.usage_type] as any)}
                </p>
              </div>
            </div>
          </div>
        </header>

        <div className="p-6 space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5" />{t("locationDetail.locationInfo" as any)}</CardTitle>
                {isAdmin && (
                  <EditLocationDialog location={location} onSuccess={refetchLocations} trigger={<Button variant="ghost" size="icon" className="h-8 w-8"><Pencil className="h-4 w-4" /></Button>} />
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {location.address && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{t("common.address" as any)}</p>
                    <p>{location.address}</p>
                    {location.city && <p>{location.postal_code} {location.city}</p>}
                    {location.country && <p>{location.country}</p>}
                  </div>
                )}
                {location.description && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{t("common.description" as any)}</p>
                    <p>{location.description}</p>
                  </div>
                )}
                {location.latitude && location.longitude && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{t("common.coordinates" as any)}</p>
                    <p>{location.latitude}, {location.longitude}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><User className="h-5 w-5" />{t("common.contact" as any)}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {location.contact_person ? (
                  <>
                    <div className="flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground" /><span>{location.contact_person}</span></div>
                    {location.contact_email && (<div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" /><a href={`mailto:${location.contact_email}`} className="text-primary hover:underline">{location.contact_email}</a></div>)}
                    {location.contact_phone && (<div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /><a href={`tel:${location.contact_phone}`} className="text-primary hover:underline">{location.contact_phone}</a></div>)}
                  </>
                ) : (
                  <p className="text-muted-foreground">{t("common.noContactData" as any)}</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Building Data Card */}
          {(location.construction_year || location.net_floor_area || location.heating_type) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" />{t("building.data" as any) || "Gebäudedaten"}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {location.construction_year && (
                    <div className="flex items-start gap-2">
                      <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">{t("building.constructionYear" as any)}</p>
                        <p className="font-medium">{location.construction_year}{location.renovation_year ? ` (San. ${location.renovation_year})` : ""}</p>
                      </div>
                    </div>
                  )}
                  {location.net_floor_area && (
                    <div className="flex items-start gap-2">
                      <Ruler className="h-4 w-4 mt-0.5 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">{t("building.netFloorArea" as any)}</p>
                        <p className="font-medium">{location.net_floor_area.toLocaleString("de-DE")} m²{location.gross_floor_area ? ` / ${location.gross_floor_area.toLocaleString("de-DE")} m² BGF` : ""}</p>
                      </div>
                    </div>
                  )}
                  {location.heating_type && (
                    <div className="flex items-start gap-2">
                      <Flame className="h-4 w-4 mt-0.5 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">{t("building.heatingType" as any)}</p>
                        <p className="font-medium">{location.heating_type}</p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {isModuleEnabled("floor_plans") && (
            <FloorsCollapsible locationId={location.id} isAdmin={isAdmin} floors={floors} floorsLoading={floorsLoading} refetchFloors={refetchFloors} t={t} />
          )}
          <MeterManagement locationId={location.id} />
          <EnergyPriceManagement locationId={location.id} />
          {location.latitude && location.longitude && <PvForecastSection locationId={location.id} />}
          {isModuleEnabled("automation_building") && <LocationAutomation locationId={location.id} />}
          {isModuleEnabled("integrations") && <LocationIntegrationsList locationId={location.id} />}
          {isModuleEnabled("brighthub_api") && <BrightHubSettings locationId={location.id} />}
        </div>
      </main>
    </div>
  );
};

export default LocationDetail;
