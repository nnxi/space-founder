import { config } from "../config";
import { applyGravity } from "./gravity";
import type { Planet, WorldEvent } from "../types/planet";
import type { PlanetStore } from "./store";

export function processPhysicsTick(
  store: PlanetStore,
  intervalSec: number
): WorldEvent[] {
  const events: WorldEvent[] = [];
  const planets = store.getAllPlanets();

  // 활성(접속 중인 유저) 행성만 순회. 절차적 행성은 중력원으로만 쓰이며 움직이지 않음
  const activePlanets: Planet[] = [];
  for (const id of store.getActivePlanetIds()) {
    const planet = planets.get(id);
    if (planet) activePlanets.push(planet);
  }

  // 1단계: 활성 행성에 작용하는 중력을 계산하여 속도 갱신 (3x3x3 인접 청크만 조회)
  for (const planet of activePlanets) {
    applyGravity(planet, store.getPlanetsNear(planet.chunkIndex), intervalSec);
  }

  // 2단계: 최신화된 속도를 적용하여 실제 위치 이동
  for (const planet of activePlanets) {
    planet.localPosition.x += planet.velocity.x * intervalSec;
    planet.localPosition.y += planet.velocity.y * intervalSec;
    planet.localPosition.z += planet.velocity.z * intervalSec;

    normalizeChunkPosition(planet);

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