import { config } from "../config";
import type { Planet } from "../types/planet";

export function applyGravityFromDefaultPlanets(
  targetPlanet: Planet,
  allPlanets: ReadonlyMap<string, Planet>,
  tickIntervalSec: number
): void {
  // 중력이 영향을 미치는 최대 거리 제곱값 캐싱
  const maxDistSq = config.gravityMaxDistance * config.gravityMaxDistance;

  for (const other of allPlanets.values()) {
    if ((other as any).role !== "default") {
      continue;
    }

    // 1차 최적화: 섹터 인덱스 차이가 1을 초과하면 (너무 멀면) 연산 자체를 스킵
    const sectorDistX = Math.abs(other.chunkIndex.x - targetPlanet.chunkIndex.x);
    const sectorDistY = Math.abs(other.chunkIndex.y - targetPlanet.chunkIndex.y);
    const sectorDistZ = Math.abs(other.chunkIndex.z - targetPlanet.chunkIndex.z);
    
    if (sectorDistX > 1 || sectorDistY > 1 || sectorDistZ > 1) {
      continue;
    }

    // 인접 섹터인 경우에만 실제 절대 거리 계산
    const dxSector = (other.chunkIndex.x - targetPlanet.chunkIndex.x) * config.sectorSize;
    const dySector = (other.chunkIndex.y - targetPlanet.chunkIndex.y) * config.sectorSize;
    const dzSector = (other.chunkIndex.z - targetPlanet.chunkIndex.z) * config.sectorSize;

    const dx = dxSector + (other.localPosition.x - targetPlanet.localPosition.x);
    const dy = dySector + (other.localPosition.y - targetPlanet.localPosition.y);
    const dz = dzSector + (other.localPosition.z - targetPlanet.localPosition.z);

    const distanceSq = dx * dx + dy * dy + dz * dz;

    // 2차 필터링: 계산된 거리가 설정된 중력장 범위를 벗어나면 스킵
    if (distanceSq === 0 || distanceSq > maxDistSq) {
      continue;
    }

    const distance = Math.sqrt(distanceSq);

    // 너무 가까울 때 가속도 폭주 방지 (Softening)
    const minDistance = 100;
    const effectiveDistSq = Math.max(distanceSq, minDistance * minDistance);

    // 중력 계산
    const pullForce = config.gravityPullStrength / effectiveDistSq;

    // 방향 벡터 정규화 후 속도 누적
    targetPlanet.velocity.x += (dx / distance) * pullForce * tickIntervalSec;
    targetPlanet.velocity.y += (dy / distance) * pullForce * tickIntervalSec;
    targetPlanet.velocity.z += (dz / distance) * pullForce * tickIntervalSec;
  }
}