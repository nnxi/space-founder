import { config } from "../config";
import type { Planet } from "../types/planet";
import type { Vec3 } from "../types/planet";
import type { SectorIndices } from "../types/sector";
import { isValidSectorIndex } from "./sector-geometry";

export function getSectorIndices(
  position: Vec3,
  sectorSize = config.sectorSize,
): SectorIndices {
  return {
    x: Math.floor(position.x / sectorSize),
    y: Math.floor(position.y / sectorSize),
    z: Math.floor(position.z / sectorSize),
  };
}

export function getSectorRoomId(sector: SectorIndices): string {
  return `sector_${sector.x}_${sector.y}_${sector.z}`;
}

export function getSectorRoomIdFromPosition(position: Vec3): string {
  return getSectorRoomId(getSectorIndices(position));
}

export function isPlanetInSector(
  planet: Planet,
  sector: SectorIndices,
  sectorSize = config.sectorSize,
): boolean {
  const planetSector = getSectorIndices(planet.position, sectorSize);
  return (
    planetSector.x === sector.x &&
    planetSector.y === sector.y &&
    planetSector.z === sector.z
  );
}

export function filterPlanetsInSector(
  planets: ReadonlyMap<string, Planet>,
  sector: SectorIndices,
): Planet[] {
  const result: Planet[] = [];

  for (const planet of planets.values()) {
    if (isPlanetInSector(planet, sector)) {
      result.push(planet);
    }
  }

  return result;
}

export function groupPlanetsBySectorRoom(
  planets: ReadonlyMap<string, Planet>,
): Map<string, Planet[]> {
  const grouped = new Map<string, Planet[]>();

  for (const planet of planets.values()) {
    const roomId = getSectorRoomIdFromPosition(planet.position);
    const sectorPlanets = grouped.get(roomId);

    if (sectorPlanets) {
      sectorPlanets.push(planet);
    } else {
      grouped.set(roomId, [planet]);
    }
  }

  return grouped;
}

export function isValidSectorIndices(value: unknown): value is SectorIndices {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    isValidSectorIndex(candidate.x) &&
    isValidSectorIndex(candidate.y) &&
    isValidSectorIndex(candidate.z)
  );
}

export function isValidVec3(value: unknown): value is Vec3 {
  if (typeof value !== "object" || value === null) return false;

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.x === "number" &&
    typeof candidate.y === "number" &&
    typeof candidate.z === "number" &&
    Number.isFinite(candidate.x) &&
    Number.isFinite(candidate.y) &&
    Number.isFinite(candidate.z)
  );
}
