import { useLocationIntegrations } from "@/hooks/useIntegrations";
import { useUserRole } from "@/hooks/useUserRole";
import { useTranslation } from "@/hooks/useTranslation";
import { IntegrationCard } from "./IntegrationCard";
import { AddIntegrationDialog } from "./AddIntegrationDialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Plug } from "lucide-react";

interface LocationIntegrationsListProps {
  locationId: string;
}

export function LocationIntegrationsList({ locationId }: LocationIntegrationsListProps) {
  const { locationIntegrations, loading, refetch, updateIntegration, removeIntegration } = useLocationIntegrations(locationId);
  const { isAdmin } = useUserRole();
  const { t } = useTranslation();

  if (loading && locationIntegrations.length === 0) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Plug className="h-5 w-5" />
            {t("locationIntegrations.title" as any)}
          </CardTitle>
          <CardDescription>
            {t("locationIntegrations.subtitle" as any)}
          </CardDescription>
        </div>
        {isAdmin && <AddIntegrationDialog locationId={locationId} onSuccess={refetch} />}
      </CardHeader>
      <CardContent>
        {locationIntegrations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="rounded-full bg-muted p-3 mb-4">
              <Plug className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground font-medium">{t("locationIntegrations.none" as any)}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {t("locationIntegrations.addHint" as any)}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {locationIntegrations.map((li) => (
              <IntegrationCard
                key={li.id}
                locationIntegration={li}
                onUpdate={updateIntegration}
                onDelete={removeIntegration}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
