import { useLocations } from "@/hooks/useLocations";
import { LocationsMap } from "@/components/locations/LocationsMap";
import { Card, CardContent } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";

interface LocationMapWidgetProps {
  locationId: string | null;
}

const LocationMapWidget = ({ locationId }: LocationMapWidgetProps) => {
  const { locations, loading } = useLocations();
  const navigate = useNavigate();

  // Filter locations based on selection
  let mapLocations = locations.filter((loc) => loc.show_on_map && !loc.parent_id);
  
  // If a specific location is selected, only show that one
  if (locationId) {
    mapLocations = locations.filter((loc) => loc.id === locationId && loc.show_on_map);
  }

  const handleLocationClick = () => {
    navigate("/locations");
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        {loading ? (
          <div className="h-[350px] bg-muted/50 animate-pulse" />
        ) : (
          <div className="h-[350px] overflow-hidden">
            <LocationsMap 
              locations={mapLocations} 
              onLocationClick={handleLocationClick}
              className="h-full rounded-b-lg border-0"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default LocationMapWidget;
