import { useLocations } from "@/hooks/useLocations";
import { LocationsMap } from "@/components/locations/LocationsMap";
import { Card, CardContent } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";

const LocationMapWidget = () => {
  const { locations, loading } = useLocations();
  const navigate = useNavigate();

  // Filter locations that should be shown on map and exclude child buildings of complexes
  const mapLocations = locations.filter((loc) => loc.show_on_map && !loc.parent_id);

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
