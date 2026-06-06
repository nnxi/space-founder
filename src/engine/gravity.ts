import { config } from "../config";
import type { Planet } from "../types/planet";
import { getSectorOrigin } from "../utils/sector-geometry";

export function applyGravityTether(
  planet: Planet,
  tickIntervalSec: number,
): void {
  if (planet.warpAuthorized) {
    return;
  }

  const origin = getSectorOrigin(planet.homeSector);
  const dx = planet.position.x - origin.x;
  const dy = planet.position.y - origin.y;
  const dz = planet.position.z - origin.z;
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

  if (distance === 0) {
    return;
  }

  const inwardX = -dx / distance;
  const inwardY = -dy / distance;
  const inwardZ = -dz / distance;

  if (distance > config.gravityTetherRadius) {
    const excess = distance - config.gravityTetherRadius;
    const pull = config.gravityPullStrength * (1 + excess / config.sectorSize);

    planet.velocity.x += inwardX * pull * tickIntervalSec;
    planet.velocity.y += inwardY * pull * tickIntervalSec;
    planet.velocity.z += inwardZ * pull * tickIntervalSec;
  }

  if (distance > config.gravityMaxDistance) {
    const scale = config.gravityMaxDistance / distance;

    planet.position.x = origin.x + dx * scale;
    planet.position.y = origin.y + dy * scale;
    planet.position.z = origin.z + dz * scale;

    const outwardDot =
      planet.velocity.x * (-inwardX) +
      planet.velocity.y * (-inwardY) +
      planet.velocity.z * (-inwardZ);

    if (outwardDot > 0) {
      planet.velocity.x += inwardX * outwardDot;
      planet.velocity.y += inwardY * outwardDot;
      planet.velocity.z += inwardZ * outwardDot;
    }
  }
}
