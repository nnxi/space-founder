import { config } from "../config";
import { applyGravityFromDefaultPlanets } from "./gravity";
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

  // 1단계: 유저 행성에 작용하는 모든 중력을 계산하여 속도(Velocity) 갱신
  for (const planet of planets.values()) {
    if ((planet as any).role === "user") {
      applyGravityFromDefaultPlanets(planet, planets, intervalSec);
    }
  }

  // 2단계: 최신화된 속도를 적용하여 실제 위치 이동
  for (const planet of planets.values()) {
    // NASA 행성은 완전히 정지 상태 유지 및 연산 스킵
    if ((planet as any).role === "default") {
      planet.velocity = { x: 0, y: 0, z: 0 };
      continue;
    }

    // 유저 행성 좌표 이동
    planet.localPosition.x += planet.velocity.x * intervalSec;
    planet.localPosition.y += planet.velocity.y * intervalSec;
    planet.localPosition.z += planet.velocity.z * intervalSec;

    // 이동 후 섹터 경계 초과 시 청크 인덱스 보정
    normalizeChunkPosition(planet);

    // 연산 완료 후 공간 해시 그리드에 갱신
    store.updateGrid(planet);

    // 변경된 물리 상태를 DB에 저장
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