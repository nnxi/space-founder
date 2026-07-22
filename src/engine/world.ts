import { config } from "../config";
import { PlanetStore } from "./store";
import { processPhysicsTick } from "./physics";
import type { Planet, WarpRequest, WorldEvent } from "../types/planet";
import { getConstellationId } from "../utils/constellation";
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
      const p = planet as any;
      
      // 1. 깊은 복사 처리 (homeSector 제거 완료)
      const copy: Planet = {
        ...planet,
        chunkIndex: { ...planet.chunkIndex },
        localPosition: { ...planet.localPosition },
        velocity: { ...planet.velocity },
        satellites: p.satellites ? [...p.satellites] : [] 
      } as Planet;

      // 2. 다중 행성 배치 로직 처리 (role 기준 검사)
      if ((copy as any).role !== "user") {
        const angle = numericId * 137.5 * (Math.PI / 180);
        const spreadRadius = 25000 + numericId * 1500;

        copy.localPosition.x += Math.cos(angle) * spreadRadius;
        copy.localPosition.y += (Math.random() - 0.5) * 2000;
        copy.localPosition.z += Math.sin(angle) * spreadRadius;

        // 분산 배치 시 로컬 좌표가 청크 크기를 초과할 경우 보정
        this.normalizeChunkPosition(copy);
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

  getPlanetIdByNumericId(numericPlanetId: number, role: string = "user"): string | undefined {
    return this.store.getPlanetIdByNumeric(numericPlanetId, role);
  }

  getPlanetsInRoom(roomId: string): Planet[] {
    return this.store.getPlanetsInRoom(roomId);
  }

  getAllRooms(): Map<string, Planet[]> {
    return this.store.getAllRooms();
  }

  summonPlanetByNumericId(numericPlanetId: number): WorldEvent {
    const planetId = this.getPlanetIdByNumericId(numericPlanetId, "user");
    if (!planetId) throw new Error(`Unknown numeric id: ${numericPlanetId}`);

    const planet = this.getPlanet(planetId);
    if (!planet) throw new Error(`Planet not found: ${planetId}`);

    const fromSector = { ...planet.chunkIndex };

    planet.chunkIndex = { ...CORE_SECTOR };
    planet.localPosition = { ...PLAYER_SUMMON_POSITION };
    planet.velocity = { x: 0, y: 0, z: 0 };
    planet.constellationId = getConstellationId(CORE_SECTOR);

    this.persistPlanet(planet);

    return {
      type: "warp",
      planetId: planet.id,
      fromSector,
      toSector: CORE_SECTOR,
    };
  }

  warpPlanetByNumericId(numericPlanetId: number): WorldEvent {
    const planetId = this.getPlanetIdByNumericId(numericPlanetId, "user");
    if (!planetId) throw new Error(`Unknown numeric id: ${numericPlanetId}`);

    const planet = this.getPlanet(planetId);
    if (!planet) throw new Error(`Planet not found: ${planetId}`);

    const sector = { ...planet.chunkIndex };

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

    const fromSector = { ...planet.chunkIndex };
    const targetSector: SectorIndices = {
      x: request.targetSectorX,
      y: request.targetSectorY,
      z: request.targetSectorZ,
    };

    planet.chunkIndex = { ...targetSector };
    planet.localPosition = {
      x: Math.random() * config.sectorSize,
      y: Math.random() * config.sectorSize,
      z: Math.random() * config.sectorSize,
    };
    planet.constellationId = getConstellationId(targetSector);

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

  private normalizeChunkPosition(planet: Planet): void {
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
}