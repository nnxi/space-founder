import { applyGravityTether } from "./gravity";
import { executeRebirth, isInBlackHoleZone } from "./black-hole";
import type { Planet, WorldEvent } from "../types/planet";
import type { PlanetStore } from "./store";
import type { PlanetPersistenceAdapter } from "./world";

// 매 틱마다 물리 연산을 수행하고 변경된 좌표를 그리드에 갱신
export function processPhysicsTick(
  store: PlanetStore,
  intervalSec: number,
  persistence: PlanetPersistenceAdapter | null
): WorldEvent[] {
  const events: WorldEvent[] = [];
  const planets = store.getAllPlanets();

  for (const planet of planets.values()) {
    planet.position.x += planet.velocity.x * intervalSec;
    planet.position.y += planet.velocity.y * intervalSec;
    planet.position.z += planet.velocity.z * intervalSec;

    applyGravityTether(planet, intervalSec);

    if (!planet.warpAuthorized && isInBlackHoleZone(planet)) {
      const rebirthEvent = executeRebirth(planet);
      events.push(rebirthEvent);
      
      if (persistence) {
        const numericId = store.getNumericId(planet.id);
        if (numericId !== undefined) {
          persistence.persistPlanet(planet, numericId);
        }
      }
    }

    // 연산 후 공간 해시 그리드 업데이트 반영
    store.updateGrid(planet);
  }

  return events;
}