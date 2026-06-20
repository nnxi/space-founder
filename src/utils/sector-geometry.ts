import { config } from "../config";
import type { SectorIndices } from "../types/sector";
import type { Vec3 } from "../types/planet";

export function getSectorOrigin(sector: SectorIndices): Vec3 {
  const half = config.sectorSize / 2;
  return {
    x: sector.x * config.sectorSize + half,
    y: sector.y * config.sectorSize + half,
    z: sector.z * config.sectorSize + half,
  };
}

export function getLocalSectorPosition(
  position: Vec3,
  sector: SectorIndices,
): Vec3 {
  return {
    x: position.x - sector.x * config.sectorSize,
    y: position.y - sector.y * config.sectorSize,
    z: position.z - sector.z * config.sectorSize,
  };
}

export function randomPositionInSector(sector: SectorIndices): Vec3 {
  const padding = 5000;
  const innerSize = config.sectorSize - padding * 2;

  return {
    x: sector.x * config.sectorSize + padding + Math.random() * innerSize,
    y: sector.y * config.sectorSize + padding + Math.random() * innerSize,
    z: sector.z * config.sectorSize + padding + Math.random() * innerSize,
  };
}

export function distanceBetween(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function isValidSectorIndex(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}
