import { config } from "../config";
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

  // world.ts 내의 hydrate 메서드 수정
  hydrate(records: HydratablePlanet[]): void {
    this.store.clear();

    for (const { numericId, planet } of records) {
      const p = planet as any;
      
      // 1. 안전하게 깊은 복사 처리 (위성 배열 포함)
      const copy: Planet = {
        ...planet,
        position: { ...planet.position },
        velocity: { ...planet.velocity },
        homeSector: planet.homeSector 
          ? { x: planet.homeSector.x, y: planet.homeSector.y, z: planet.homeSector.z }
          : undefined,
        // 주입된 위성 데이터가 있다면 안전하게 배열 복사
        satellites: p.satellites ? [...p.satellites] : [] 
      } as Planet;

      // 2. NASA 행성(다중 행성 배치 로직) 처리
      if (!copy.warpAuthorized) {
        const angle = numericId * 137.5 * (Math.PI / 180);
        const spreadRadius = 25000 + numericId * 1500;

        copy.position.x += Math.cos(angle) * spreadRadius;
        copy.position.y += (Math.random() - 0.5) * 2000;
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