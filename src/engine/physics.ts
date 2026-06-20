import { applyGravityTether } from "./gravity";
import type { Planet, WorldEvent } from "../types/planet";
import type { PlanetStore } from "./store";
import type { PlanetPersistenceAdapter } from "./world";

export function processPhysicsTick(
  store: PlanetStore,
  intervalSec: number,
  persistence: PlanetPersistenceAdapter | null
): WorldEvent[] {
  const events: WorldEvent[] = [];
  const planets = store.getAllPlanets();

  for (const planet of planets.values()) {
    // NASA 행성(warpAuthorized 플래그 없음)은 속도를 0으로 강제하고 위치 업데이트를 건너뜀
    // 그리드 업데이트도 생략하여 O(1) 성능 최적화 달성
    if (!planet.warpAuthorized) {
      planet.velocity = { x: 0, y: 0, z: 0 };
      continue;
    }

    // 유저 행성에 대해서만 물리 이동 연산 수행
    planet.position.x += planet.velocity.x * intervalSec;
    planet.position.y += planet.velocity.y * intervalSec;
    planet.position.z += planet.velocity.z * intervalSec;

    applyGravityTether(planet, intervalSec);

    // 연산이 끝난 후 공간 해시 그리드에 새로운 위치 갱신
    store.updateGrid(planet);
  }

  return events;
}