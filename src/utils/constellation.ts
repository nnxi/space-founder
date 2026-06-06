import { config } from "../config";
import type { SectorIndices } from "../types/sector";

export function getConstellationId(sector: SectorIndices): number {
  const normalized =
    sector.x * 7 + sector.y * 13 + sector.z * 17;

  return (
    ((normalized % config.constellationCount) + config.constellationCount) %
    config.constellationCount
  );
}

export function pickRandomDifferentConstellation(
  currentConstellationId: number,
): number {
  if (config.constellationCount <= 1) {
    return 0;
  }

  let next = currentConstellationId;

  while (next === currentConstellationId) {
    next = Math.floor(Math.random() * config.constellationCount);
  }

  return next;
}

export function pickRandomSectorInConstellation(
  constellationId: number,
): SectorIndices {
  for (let attempt = 0; attempt < 128; attempt += 1) {
    const candidate: SectorIndices = {
      x: randomSectorCoordinate(),
      y: randomSectorCoordinate(),
      z: randomSectorCoordinate(),
    };

    if (getConstellationId(candidate) === constellationId) {
      return candidate;
    }
  }

  return {
    x: constellationId,
    y: 0,
    z: 0,
  };
}

function randomSectorCoordinate(): number {
  return Math.floor(Math.random() * 11) - 5;
}
