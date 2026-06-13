import { config } from "../config";
import { buildWarpVelocity } from "./black-hole";
import { PlanetStore } from "./store";
import { processPhysicsTick } from "./physics";
import type { Planet, WarpRequest, WorldEvent } from "../types/planet";
import { getConstellationId } from "../utils/constellation";
import { randomPositionInSector } from "../utils/sector-geometry";
import { getSectorIndices } from "../utils/sector";
import type { SectorIndices } from "../types/sector";

export interface HydratablePlanet {
  numericId: number;
  planet: Planet;
}

export interface PlanetPersistenceAdapter {
  persistPlanet(planet: Planet, numericId: number): void;
}

export type TickCallback = (
  planets: ReadonlyMap<string, Planet>,
  events: WorldEvent[],
) => void;

const TICK_INTERVAL_SEC = config.physicsTickIntervalMs / 1000;
const CORE_SECTOR: SectorIndices = { x: 0, y: 0, z: 0 };
const PLAYER_SUMMON_POSITION = { x: 500, y: 500, z: 500 };
const SECTOR_SIZE = 100000;

export class WorldEngine {
  private readonly store = new PlanetStore();
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private persistence: PlanetPersistenceAdapter | null = null;

  setPersistenceAdapter(adapter: PlanetPersistenceAdapter): void {
    this.persistence = adapter;
  }

  hydrate(records: HydratablePlanet[]): void {
    this.store.clear();

    for (const { numericId, planet } of records) {
      // 1. 객체 얕은 복사로 인한 포인터 오염 방지를 위해 깊은 복사 처리
      const copy = {
        ...planet,
        position: { ...planet.position },
        velocity: { ...planet.velocity },
        homeSector: { ...planet.homeSector }
      };

      // 2. NASA 행성(다중 행성계) 겹침 방지를 위한 마이크로 흩뿌리기
      if (!copy.warpAuthorized) {
        // 자연계의 잎차례 배열에 쓰이는 황금각(Golden Angle)을 사용해 
        // 겹치지 않고 태양계 공전 궤도처럼 예쁘게 분산시킵니다.
        const angle = numericId * 137.508; 
        
        // 항성 중심으로부터 2500 ~ 5700 유닛 사이에 배치
        const spreadRadius = 2500 + (numericId % 5) * 800; 
        
        copy.position.x += Math.cos(angle) * spreadRadius;
        copy.position.y += Math.sin(angle) * spreadRadius * 0.2; // 황도면을 살짝 눕혀줌
        copy.position.z += Math.sin(angle) * spreadRadius;
      }

      this.store.setPlanet(copy, numericId);
    }
  }

  start(onAfterTick?: TickCallback): void {
    if (this.tickTimer) return;

    this.tickTimer = setInterval(() => {
      const events = processPhysicsTick(this.store, TICK_INTERVAL_SEC, this.persistence);
      onAfterTick?.(this.store.getAllPlanets(), events);
    }, config.physicsTickIntervalMs);
  }

  stop(): void {
    if (!this.tickTimer) return;

    clearInterval(this.tickTimer);
    this.tickTimer = null;
  }

  getPlanets(): ReadonlyMap<string, Planet> {
    return this.store.getAllPlanets();
  }

  getPlanet(planetId: string): Planet | undefined {
    return this.store.getPlanet(planetId);
  }

  getNumericPlanetId(planetId: string): number {
    const numericId = this.store.getNumericId(planetId);
    if (numericId === undefined) {
      throw new Error(`Unknown planet id: ${planetId}`);
    }
    return numericId;
  }

  getPlanetIdByNumericId(numericPlanetId: number): string | undefined {
    return this.store.getPlanetIdByNumeric(numericPlanetId);
  }

  getPlanetsInRoom(roomId: string): Planet[] {
    return this.store.getPlanetsInRoom(roomId);
  }

  getAllRooms(): Map<string, Planet[]> {
    return this.store.getAllRooms();
  }

  summonPlanetByNumericId(numericPlanetId: number): WorldEvent {
    const planetId = this.getPlanetIdByNumericId(numericPlanetId);
    if (!planetId) throw new Error(`Unknown numeric id: ${numericPlanetId}`);

    const planet = this.getPlanet(planetId);
    if (!planet) throw new Error(`Planet not found: ${planetId}`);

    const fromSector = getSectorIndices(planet.position);

    planet.position = { ...PLAYER_SUMMON_POSITION };
    planet.velocity = { x: 0, y: 0, z: 0 };
    planet.homeSector = { ...CORE_SECTOR };
    planet.constellationId = getConstellationId(CORE_SECTOR);
    planet.warpAuthorized = true;

    this.persistPlanet(planet);

    return {
      type: "warp",
      planetId: planet.id,
      fromSector,
      toSector: CORE_SECTOR,
    };
  }

  warpPlanetByNumericId(numericPlanetId: number): WorldEvent {
    const planetId = this.getPlanetIdByNumericId(numericPlanetId);
    if (!planetId) throw new Error(`Unknown numeric id: ${numericPlanetId}`);

    const planet = this.getPlanet(planetId);
    if (!planet) throw new Error(`Planet not found: ${planetId}`);

    const sector = getSectorIndices(planet.position);
    planet.velocity = buildWarpVelocity(sector, sector);
    planet.warpAuthorized = true;

    this.persistPlanet(planet);

    return {
      type: "warp",
      planetId: planet.id,
      fromSector: sector,
      toSector: sector,
    };
  }

  warpPlanet(request: WarpRequest): WorldEvent {
    const planet = this.getPlanet(request.planetId);
    if (!planet) throw new Error(`Unknown planet id: ${request.planetId}`);

    const fromSector = getSectorIndices(planet.position);
    const targetSector: SectorIndices = {
      x: request.targetSectorX,
      y: request.targetSectorY,
      z: request.targetSectorZ,
    };

    planet.position = randomPositionInSector(targetSector);
    planet.velocity = buildWarpVelocity(fromSector, targetSector);
    planet.homeSector = { ...targetSector };
    planet.constellationId = getConstellationId(targetSector);
    planet.warpAuthorized = true;

    this.persistPlanet(planet);

    return {
      type: "warp",
      planetId: planet.id,
      fromSector,
      toSector: targetSector,
    };
  }

  private persistPlanet(planet: Planet): void {
    if (!this.persistence) return;
    this.persistence.persistPlanet(planet, this.getNumericPlanetId(planet.id));
  }
}