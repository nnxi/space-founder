import { config } from "../config";
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
    // NASA 행성은 속도를 0으로 강제하고 위치 업데이트 생략
    if (!planet.warpAuthorized) {
      planet.velocity = { x: 0, y: 0, z: 0 };
      continue;
    }

    // 1. 로컬 좌표에 속도 적용
    planet.localPosition.x += planet.velocity.x * intervalSec;
    planet.localPosition.y += planet.velocity.y * intervalSec;
    planet.localPosition.z += planet.velocity.z * intervalSec;

    // 2. 섹터 경계 초과 시 청크 인덱스 및 로컬 좌표 보정
    normalizeChunkPosition(planet);

    // 3. 중력 적용
    applyGravityTether(planet, intervalSec);

    // 중력 연산으로 인해 위치가 크게 변했을 수 있으므로 다시 한번 보정
    normalizeChunkPosition(planet);

    // 연산 완료 후 공간 해시 그리드에 갱신
    store.updateGrid(planet);
  }

  return events;
}

// 로컬 좌표가 범위를 벗어나면 청크 인덱스를 갱신하는 헬퍼 함수
function normalizeChunkPosition(planet: Planet): void {
  const deltaX = Math.floor(planet.localPosition.x / config.sectorSize);
  if (deltaX !== 0) {
    planet.chunkIndex.x += deltaX;
    planet.localPosition.x -= deltaX * config.sectorSize;
  }

  const deltaY = Math.floor(planet.localPosition.y / config.sectorSize);
  if (deltaY !== 0) {
    planet.chunkIndex.y += deltaY;
    planet.localPosition.y -= deltaY * config.sectorSize;
  }

  const deltaZ = Math.floor(planet.localPosition.z / config.sectorSize);
  if (deltaZ !== 0) {
    planet.chunkIndex.z += deltaZ;
    planet.localPosition.z -= deltaZ * config.sectorSize;
  }
}