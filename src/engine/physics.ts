import { config } from "../config";
import { applyGravity } from "./gravity";
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

  // 1단계: 유저 행성에 작용하는 중력을 계산하여 속도 갱신
  for (const planet of planets.values()) {
    // 절차적 행성은 중력 연산 대상이 아님
    if (planet.role === "default") {
      continue;
    }

    if (planet.role === "user") {
      // 기획 반영: 유저가 자신의 행성을 관측 중이지 않으면 중력 작용 스킵
      if (!planet.isOnline) {
        continue;
      }

      applyGravity(planet, planets, intervalSec);
    }
  }

  // 2단계: 최신화된 속도를 적용하여 실제 위치 이동
  for (const planet of planets.values()) {
    if (planet.role === "default") {
      planet.velocity = { x: 0, y: 0, z: 0 };
      continue;
    }

    if (planet.role === "user") {
      // 기획 반영: 유저가 관측 중이지 않으면 물리적 이동 정지
      if (!planet.isOnline) {
        continue;
      }
    }

    planet.localPosition.x += planet.velocity.x * intervalSec;
    planet.localPosition.y += planet.velocity.y * intervalSec;
    planet.localPosition.z += planet.velocity.z * intervalSec;

    normalizeChunkPosition(planet);

    store.updateGrid(planet);

    if (persistence) {
      const numericId = store.getNumericId(planet.id);
      if (numericId !== undefined) {
        persistence.persistPlanet(planet, numericId);
      }
    }
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