import { useLocations } from "@/hooks/useLocations";
import { LocationsMap } from "@/components/locations/LocationsMap";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Map } from "lucide-react";
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
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Map className="h-5 w-5" />
          Standortkarte
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="h-[300px] bg-muted/50 animate-pulse" />
        ) : (
          <div className="h-[300px] overflow-hidden">
            <LocationsMap 
              locations={mapLocations} 
              onLocationClick={handleLocationClick}
              className="h-full rounded-none border-0"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default LocationMapWidget;
