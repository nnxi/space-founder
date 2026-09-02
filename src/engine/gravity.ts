import { config } from "../config";
import type { Planet } from "../types/planet";

const SOFTENING_CONSTANT = 1000 * 1000;
const REPULSION_THRESHOLD = 3000;
const REPULSION_MULTIPLIER = 5;

export function applyGravity(
  targetPlanet: Planet,
  allPlanets: ReadonlyMap<string, Planet>,
  tickIntervalSec: number
): void {
  const target = targetPlanet as any;

  if (target.role === "default") {
    return;
  }

  const maxDistSq = config.gravityMaxDistance * config.gravityMaxDistance;

  for (const other of allPlanets.values()) {
    if (other.id === targetPlanet.id) {
      continue;
    }

    const sectorDistX = Math.abs(other.chunkIndex.x - targetPlanet.chunkIndex.x);
    const sectorDistY = Math.abs(other.chunkIndex.y - targetPlanet.chunkIndex.y);
    const sectorDistZ = Math.abs(other.chunkIndex.z - targetPlanet.chunkIndex.z);
    
    if (sectorDistX > 1 || sectorDistY > 1 || sectorDistZ > 1) {
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

    const pullForce = (currentStrength / effectiveDistSq) * forceDirection;

    targetPlanet.velocity.x += (dx / distance) * pullForce * tickIntervalSec;
    targetPlanet.velocity.y += (dy / distance) * pullForce * tickIntervalSec;
    targetPlanet.velocity.z += (dz / distance) * pullForce * tickIntervalSec;
  }
}