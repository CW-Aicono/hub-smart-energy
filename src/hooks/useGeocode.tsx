import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";

interface GeocodeResult {
  latitude: number;
  longitude: number;
  displayName: string;
}

interface NominatimResponse {
  lat: string;
  lon: string;
  display_name: string;
}

export function useGeocode() {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation();

  const geocodeAddress = async (
    address: string,
    postalCode: string,
    city: string,
    country: string = "Deutschland"
  ): Promise<GeocodeResult | null> => {
    // Build the search query
    const parts = [address, postalCode, city, country].filter(Boolean);
    if (parts.length < 2) {
      toast({
        title: t("geocode.incompleteAddress"),
        description: t("geocode.incompleteAddressDesc"),
        variant: "destructive",
      });
      return null;
    }

    const query = encodeURIComponent(parts.join(", "));
    setIsLoading(true);

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`,
        {
          headers: {
            "Accept-Language": "de",
            "User-Agent": "SmartEnergyHub/1.0",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const data: NominatimResponse[] = await response.json();

      if (data.length === 0) {
        toast({
          title: t("geocode.notFound"),
          description: t("geocode.notFoundDesc"),
          variant: "destructive",
        });
        return null;
      }

      const result: GeocodeResult = {
        latitude: parseFloat(data[0].lat),
        longitude: parseFloat(data[0].lon),
        displayName: data[0].display_name,
      };

      toast({
        title: t("geocode.success"),
        description: `${result.latitude.toFixed(6)}, ${result.longitude.toFixed(6)}`,
      });

      return result;
    } catch (error) {
      console.error("Geocoding error:", error);
      toast({
        title: t("common.error"),
        description: t("geocode.error"),
        variant: "destructive",
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  return { geocodeAddress, isLoading };
}
