import { config } from "../config";
import type { Planet } from "../types/planet";

const SOFTENING_CONSTANT = 1000 * 1000;

// 함수명을 범용적으로 변경 (이제 모든 행성으로부터 중력을 받으므로)
export function applyGravity(
  targetPlanet: Planet,
  allPlanets: ReadonlyMap<string, Planet>,
  tickIntervalSec: number
): void {
  const target = targetPlanet as any;

  // 1. 절차적 생성 행성(default)은 중력의 영향을 받지 않고 우주에 고정(Static)됩니다.
  if (target.role === "default") {
    return;
  }

  // (참고) "자신이 함께하지 않으면 움직이지 않는다"는 기획에 따라, 
  // 타겟 행성의 주인이 현재 오프라인이거나 해당 섹터를 구독 중이 아니라면 
  // 상위 물리 루프(physics.ts)에서 이 함수 호출 자체를 스킵하도록 처리하는 것이 가장 깔끔합니다.

  const maxDistSq = config.gravityMaxDistance * config.gravityMaxDistance;

  for (const other of allPlanets.values()) {
    // 2. 자기 자신이 뿜는 중력은 무시
    if (other.id === targetPlanet.id) {
      continue;
    }

    // 3. 1차 최적화: 유저 카메라 인접 섹터(3x3x3)를 벗어나는 거리는 연산 스킵
    const sectorDistX = Math.abs(other.chunkIndex.x - targetPlanet.chunkIndex.x);
    const sectorDistY = Math.abs(other.chunkIndex.y - targetPlanet.chunkIndex.y);
    const sectorDistZ = Math.abs(other.chunkIndex.z - targetPlanet.chunkIndex.z);
    
    if (sectorDistX > 1 || sectorDistY > 1 || sectorDistZ > 1) {
      continue;
    }

    // 4. 인접 섹터 내 천체와의 절대 상대 거리 연산
    const dx = (other.chunkIndex.x - targetPlanet.chunkIndex.x) * config.sectorSize + (other.localPosition.x - targetPlanet.localPosition.x);
    const dy = (other.chunkIndex.y - targetPlanet.chunkIndex.y) * config.sectorSize + (other.localPosition.y - targetPlanet.localPosition.y);
    const dz = (other.chunkIndex.z - targetPlanet.chunkIndex.z) * config.sectorSize + (other.localPosition.z - targetPlanet.localPosition.z);

    const distanceSq = dx * dx + dy * dy + dz * dz;

    // 5. 2차 최적화: 유효 중력장 사거리 초과 시 스킵
    if (distanceSq === 0 || distanceSq > maxDistSq) {
      continue;
    }

    const distance = Math.sqrt(distanceSq);

    // 6. 중력 소프트닝 적용 (너무 가까울 때 가속도가 무한대로 튀는 현상 방지)
    const effectiveDistSq = distanceSq + SOFTENING_CONSTANT;
    
    // (other 천체가 targetPlanet을 끌어당기는 힘)
    const pullForce = config.gravityPullStrength / effectiveDistSq;

    // 7. 타겟 행성(유저 행성)에 속도 벡터 누적
    targetPlanet.velocity.x += (dx / distance) * pullForce * tickIntervalSec;
    targetPlanet.velocity.y += (dy / distance) * pullForce * tickIntervalSec;
    targetPlanet.velocity.z += (dz / distance) * pullForce * tickIntervalSec;
  }
}