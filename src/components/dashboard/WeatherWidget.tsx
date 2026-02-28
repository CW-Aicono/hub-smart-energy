import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Cloud, Sun, CloudRain, CloudSnow, CloudLightning, Wind, Thermometer, Droplets, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";

interface WeatherData {
  temperature: number;
  weatherCode: number;
  humidity: number;
  windSpeed: number;
  description: string;
}

interface MainLocation {
  name: string;
  postal_code: string;
  city: string;
  latitude: number;
  longitude: number;
}

// Weather code descriptions are now resolved via t() at render time
const WEATHER_CODE_KEYS: Record<number, { icon: React.ComponentType<{ className?: string }>; key: string }> = {
  0: { icon: Sun, key: "wx.clear" },
  1: { icon: Sun, key: "wx.mostlyClear" },
  2: { icon: Cloud, key: "wx.partlyCloudy" },
  3: { icon: Cloud, key: "wx.cloudy" },
  45: { icon: Cloud, key: "wx.foggy" },
  48: { icon: Cloud, key: "wx.rimeFog" },
  51: { icon: CloudRain, key: "wx.lightDrizzle" },
  53: { icon: CloudRain, key: "wx.drizzle" },
  55: { icon: CloudRain, key: "wx.heavyDrizzle" },
  61: { icon: CloudRain, key: "wx.lightRain" },
  63: { icon: CloudRain, key: "wx.rain" },
  65: { icon: CloudRain, key: "wx.heavyRain" },
  71: { icon: CloudSnow, key: "wx.lightSnow" },
  73: { icon: CloudSnow, key: "wx.snow" },
  75: { icon: CloudSnow, key: "wx.heavySnow" },
  77: { icon: CloudSnow, key: "wx.snowGrains" },
  80: { icon: CloudRain, key: "wx.lightShowers" },
  81: { icon: CloudRain, key: "wx.showers" },
  82: { icon: CloudRain, key: "wx.heavyShowers" },
  85: { icon: CloudSnow, key: "wx.lightSnowShowers" },
  86: { icon: CloudSnow, key: "wx.snowShowers" },
  95: { icon: CloudLightning, key: "wx.thunderstorm" },
  96: { icon: CloudLightning, key: "wx.thunderHail" },
  99: { icon: CloudLightning, key: "wx.thunderHeavyHail" },
};

async function geocodePostalCode(postalCode: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(postalCode)}&country=Germany&format=json&limit=1`,
      {
        headers: {
          "User-Agent": "EnergyDashboard/1.0",
        },
      }
    );
    const data = await response.json();
    if (data && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchWeather(lat: number, lon: number): Promise<WeatherData | null> {
  try {
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=Europe/Berlin`
    );
    const data = await response.json();
    
    if (data.current) {
      const weatherKey = WEATHER_CODE_KEYS[data.current.weather_code]?.key || "wx.unknown";
      // description will be resolved at render time via t()
      return {
        temperature: Math.round(data.current.temperature_2m),
        weatherCode: data.current.weather_code,
        humidity: data.current.relative_humidity_2m,
        windSpeed: Math.round(data.current.wind_speed_10m),
        description: weatherKey,
      };
    }
    return null;
  } catch {
    return null;
  }
}

interface WeatherWidgetProps {
  locationId: string | null;
}

const WeatherWidget = ({ locationId }: WeatherWidgetProps) => {
  const { t } = useTranslation();
  const T = (key: string) => t(key as any);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [mainLocation, setMainLocation] = useState<MainLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadWeather = async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch location - either the selected one or the main location
        let query = supabase
          .from("locations")
          .select("name, postal_code, city, latitude, longitude");
        
        if (locationId) {
          query = query.eq("id", locationId);
        } else {
          query = query.eq("is_main_location", true);
        }
        
        const { data: location, error: locError } = await query.single();

        if (locError || !location) {
          setError(locationId ? t("weather.locationNotFound") : t("weather.noMainLocation"));
          setLoading(false);
          return;
        }

        setMainLocation(location as MainLocation);

        let lat = location.latitude;
        let lon = location.longitude;

        // If no coordinates, try to geocode from postal code
        if ((!lat || !lon) && location.postal_code) {
          const coords = await geocodePostalCode(location.postal_code);
          if (coords) {
            lat = coords.lat;
            lon = coords.lon;
          }
        }

        if (!lat || !lon) {
          setError(t("weather.noCoordinates"));
          setLoading(false);
          return;
        }

        const weatherData = await fetchWeather(lat, lon);
        if (weatherData) {
          setWeather(weatherData);
        } else {
          setError(t("weather.fetchError"));
        }
      } catch (err) {
        setError(t("weather.fetchError"));
      } finally {
        setLoading(false);
      }
    };

    loadWeather();
    
    // Refresh weather every 15 minutes
    const interval = setInterval(loadWeather, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [t, locationId]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5" />
            {t("weather.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-8 w-3/4" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5" />
            {t("weather.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!weather || !mainLocation) return null;

  const WeatherIcon = WEATHER_CODE_KEYS[weather.weatherCode]?.icon || Cloud;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cloud className="h-5 w-5" />
          {t("weather.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span>{mainLocation.name}</span>
              {mainLocation.city && <span>• {mainLocation.city}</span>}
            </div>
            <div className="flex items-center gap-4">
              <WeatherIcon className="h-12 w-12 text-primary" />
              <div>
                <div className="text-4xl font-bold">{weather.temperature}°C</div>
                <div className="text-sm text-muted-foreground">{T(weather.description)}</div>
              </div>
            </div>
          </div>
          <div className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Droplets className="h-4 w-4" />
              <span>{weather.humidity}%</span>
            </div>
            <div className="flex items-center gap-2">
              <Wind className="h-4 w-4" />
              <span>{weather.windSpeed} km/h</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default WeatherWidget;
