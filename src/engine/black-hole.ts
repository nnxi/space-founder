import { config } from "../config";
import {
  pickRandomDifferentConstellation,
  pickRandomSectorInConstellation,
} from "../utils/constellation";
import { getLocalSectorPosition, randomPositionInSector } from "../utils/sector-geometry";
import { getSectorIndices } from "../utils/sector";
import type { Planet, WorldEvent } from "../types/planet";
import type { SectorIndices } from "../types/sector";

export function isInBlackHoleZone(planet: Planet): boolean {
  const sector = getSectorIndices(planet.position);
  const local = getLocalSectorPosition(planet.position, sector);
  const shell = config.blackHoleShellDepth;

  return (
    local.x <= shell ||
    local.y <= shell ||
    local.z <= shell ||
    local.x >= config.sectorSize - shell ||
    local.y >= config.sectorSize - shell ||
    local.z >= config.sectorSize - shell
  );
}

export function executeRebirth(planet: Planet): WorldEvent {
  const fromSector = getSectorIndices(planet.position);
  const targetConstellation = pickRandomDifferentConstellation(
    planet.constellationId,
  );
  const targetSector = pickRandomSectorInConstellation(targetConstellation);

  planet.position = randomPositionInSector(targetSector);
  planet.velocity = {
    x: (Math.random() - 0.5) * 2,
    y: (Math.random() - 0.5) * 2,
    z: (Math.random() - 0.5) * 2,
  };
  planet.homeSector = { ...targetSector };
  planet.constellationId = targetConstellation;
  planet.warpAuthorized = false;

  return {
    type: "rebirth",
    planetId: planet.id,
    fromSector,
    toSector: targetSector,
  };
}

export function buildWarpVelocity(
  from: SectorIndices,
  to: SectorIndices,
): { x: number; y: number; z: number } {
  const direction = {
    x: to.x - from.x,
    y: to.y - from.y,
    z: to.z - from.z,
  };

  const magnitude = Math.sqrt(
    direction.x * direction.x +
      direction.y * direction.y +
      direction.z * direction.z,
  );

  if (magnitude === 0) {
    return { x: config.warpBurstVelocity, y: 0, z: 0 };
  }

  const scale = config.warpBurstVelocity / magnitude;

  return {
    x: direction.x * scale,
    y: direction.y * scale,
    z: direction.z * scale,
  };
}
