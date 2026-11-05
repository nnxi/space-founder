import { config } from "../config";
import type { Planet, PlanetType } from "../types/planet";

const SOFTENING_CONSTANT = 1000 * 1000;
const REPULSION_THRESHOLD = 3000;
const REPULSION_MULTIPLIER = 5;

// 중력을 끌어당기는(영향을 주는) 쪽 천체의 타입별 질량 계수
const MASS_BY_TYPE: Record<PlanetType, number> = {
  star: 10,
  gaseous: 3,
  rocky: 1,
  icy: 1,
  lava: 1,
};

export function applyGravity(
  targetPlanet: Planet,
  nearbyPlanets: readonly Planet[],
  tickIntervalSec: number
): void {
  if (targetPlanet.role === "default") {
    return;
  }

  const maxDistSq = config.gravityMaxDistance * config.gravityMaxDistance;

  for (const other of nearbyPlanets) {
    if (other.id === targetPlanet.id) {
      continue;
    }

    const dx = (other.chunkIndex.x - targetPlanet.chunkIndex.x) * config.sectorSize + (other.localPosition.x - targetPlanet.localPosition.x);
    const dy = (other.chunkIndex.y - targetPlanet.chunkIndex.y) * config.sectorSize + (other.localPosition.y - targetPlanet.localPosition.y);
    const dz = (other.chunkIndex.z - targetPlanet.chunkIndex.z) * config.sectorSize + (other.localPosition.z - targetPlanet.localPosition.z);

    const distanceSq = dx * dx + dy * dy + dz * dz;

    if (distanceSq === 0 || distanceSq > maxDistSq) {
      continue;
    }

    const distance = Math.sqrt(distanceSq);
    const effectiveDistSq = distanceSq + SOFTENING_CONSTANT;
    
    let forceDirection = 1;
    let currentStrength = config.gravityPullStrength;

    if (distance < REPULSION_THRESHOLD) {
      forceDirection = -1;
      currentStrength = config.gravityPullStrength * REPULSION_MULTIPLIER;
    }

    const pullForce = (currentStrength * MASS_BY_TYPE[other.planetType] / effectiveDistSq) * forceDirection;

    targetPlanet.velocity.x += (dx / distance) * pullForce * tickIntervalSec;
    targetPlanet.velocity.y += (dy / distance) * pullForce * tickIntervalSec;
    targetPlanet.velocity.z += (dz / distance) * pullForce * tickIntervalSec;
  }
}