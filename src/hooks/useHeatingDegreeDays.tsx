import { useQuery } from "@tanstack/react-query";
import { fetchHeatingDegreeDays, HddResult, REFERENCE_HDD_GERMANY } from "@/lib/report/weatherCorrection";

export interface LocationCoord {
  id: string;
  latitude?: number | null;
  longitude?: number | null;
}

/**
 * Liefert HDD-Werte je Liegenschaft + Jahr (Open-Meteo Archive).
 * Liegenschaften ohne Koordinaten werden mit dem Referenz-HDD befüllt
 * (keine Witterungsbereinigung möglich).
 */
export function useHeatingDegreeDays(locations: LocationCoord[], years: number[]) {
  const key = locations
    .map((l) => `${l.id}:${l.latitude ?? "x"}:${l.longitude ?? "x"}`)
    .join("|");
  return useQuery({
    queryKey: ["hdd", key, years.join(",")],
    enabled: locations.length > 0 && years.length > 0,
    staleTime: 1000 * 60 * 60 * 24,
    queryFn: async () => {
      const map: Record<string, Record<number, HddResult>> = {};
      await Promise.all(
        locations.flatMap((loc) =>
          years.map(async (y) => {
            map[loc.id] = map[loc.id] || {};
            if (loc.latitude == null || loc.longitude == null) {
              map[loc.id][y] = {
                year: y,
                latitude: 0,
                longitude: 0,
                hdd: REFERENCE_HDD_GERMANY,
                baseTempC: 15,
                daysCovered: 0,
                source: "fallback-reference",
              };
              return;
            }
            map[loc.id][y] = await fetchHeatingDegreeDays(loc.latitude, loc.longitude, y);
          }),
        ),
      );
      return map;
    },
  });
}
