import { useMemo } from "react";
import { useLocations } from "./useLocations";

const ALL_ENERGY_TYPES = ["strom", "gas", "waerme", "wasser"] as const;

/**
 * Returns the set of energy types configured for the given location.
 * If no location is selected or the location has no energy_sources configured,
 * returns all energy types (no filtering).
 */
export function useLocationEnergySources(locationId: string | null): Set<string> {
  const { locations } = useLocations();

  return useMemo(() => {
    if (!locationId) return new Set(ALL_ENERGY_TYPES);
    const loc = locations.find((l) => l.id === locationId);
    if (!loc || !loc.energy_sources || loc.energy_sources.length === 0) {
      return new Set(ALL_ENERGY_TYPES);
    }
    return new Set(loc.energy_sources);
  }, [locationId, locations]);
}
