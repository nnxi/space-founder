import { config } from "../config";
import { applyGravityTether } from "./gravity";
import {
  buildWarpVelocity,
  executeRebirth,
  isInBlackHoleZone,
} from "./black-hole";
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
  private readonly planets = new Map<string, Planet>();
  private readonly planetNumericIds = new Map<string, number>();
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private persistence: PlanetPersistenceAdapter | null = null;

  setPersistenceAdapter(adapter: PlanetPersistenceAdapter): void {
    this.persistence = adapter;
  }

  hydrate(records: HydratablePlanet[]): void {
    this.planets.clear();
    this.planetNumericIds.clear();

    for (const { numericId, planet } of records) {
      this.planetNumericIds.set(planet.id, numericId);
      const copy = { ...planet };

      // 1번 플레이어를 제외한 행성들을 절대 좌표계에 맞추어 청크별로 분산 배치
      if (numericId !== 1) {
        // ID를 5로 나눈 몫과 나머지를 사용하여 5x5 그리드 방(25개)에 완벽하게 분산 배정
        const sectorX = (numericId % 5) - 2;
        const sectorY = (Math.floor(numericId / 5) % 5) - 2;
        const sectorZ = 0;

        const baseX = sectorX * SECTOR_SIZE;
        const baseY = sectorY * SECTOR_SIZE;
        const baseZ = sectorZ * SECTOR_SIZE;

        copy.position = {
          x: baseX + (numericId * 3000 % 40000) - 20000,
          y: baseY + (numericId * 5000 % 40000) - 20000,
          z: baseZ + (numericId * 2000 % 40000) - 20000,
        };

        const calculatedSector = getSectorIndices(copy.position);
        copy.homeSector = calculatedSector;
        copy.constellationId = getConstellationId(calculatedSector);
      }

      this.planets.set(planet.id, copy);
    }
  }

  start(onAfterTick?: TickCallback): void {
    if (this.tickTimer) return;

    this.tickTimer = setInterval(() => {
      const events = this.tick();
      onAfterTick?.(this.planets, events);
    }, config.physicsTickIntervalMs);
  }

  stop(): void {
    if (!this.tickTimer) return;

    clearInterval(this.tickTimer);
    this.tickTimer = null;
  }

  getPlanets(): ReadonlyMap<string, Planet> {
    return this.planets;
  }

  getPlanet(planetId: string): Planet | undefined {
    return this.planets.get(planetId);
  }

  getNumericPlanetId(planetId: string): number {
    const numericId = this.planetNumericIds.get(planetId);

    if (numericId === undefined) {
      throw new Error(`Unknown planet id: ${planetId}`);
    }

    return numericId;
  }

  getPlanetIdByNumericId(numericPlanetId: number): string | undefined {
    for (const [planetId, numericId] of this.planetNumericIds) {
      if (numericId === numericPlanetId) {
        return planetId;
      }
    }

    return undefined;
  }

  summonPlanetByNumericId(numericPlanetId: number): WorldEvent {
    const planetId = this.getPlanetIdByNumericId(numericPlanetId);

    if (!planetId) {
      throw new Error(`Unknown planet id: ${numericPlanetId}`);
    }

    const planet = this.planets.get(planetId);

    if (!planet) {
      throw new Error(`Unknown planet id: ${numericPlanetId}`);
    }

    const fromSector = getSectorIndices(planet.position);

    planet.position = { ...PLAYER_SUMMON_POSITION };
    planet.velocity = { x: 0, y: 0, z: 0 };
    planet.homeSector = { ...CORE_SECTOR };
    planet.constellationId = getConstellationId(CORE_SECTOR);
    planet.warpAuthorized = true;

    const event: WorldEvent = {
      type: "warp",
      planetId: planet.id,
      fromSector,
      toSector: CORE_SECTOR,
    };

    this.persistPlanet(planet);
    return event;
  }

  warpPlanetByNumericId(numericPlanetId: number): WorldEvent {
    const planetId = this.getPlanetIdByNumericId(numericPlanetId);

    if (!planetId) {
      throw new Error(`Unknown planet id: ${numericPlanetId}`);
    }

    const planet = this.planets.get(planetId);

    if (!planet) {
      throw new Error(`Unknown planet id: ${numericPlanetId}`);
    }

    const sector = getSectorIndices(planet.position);
    planet.velocity = buildWarpVelocity(sector, sector);
    planet.warpAuthorized = true;

    const event: WorldEvent = {
      type: "warp",
      planetId: planet.id,
      fromSector: sector,
      toSector: sector,
    };

    this.persistPlanet(planet);
    return event;
  }

  warpPlanet(request: WarpRequest): WorldEvent {
    const planet = this.planets.get(request.planetId);

    if (!planet) {
      throw new Error(`Unknown planet id: ${request.planetId}`);
    }

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

    const event: WorldEvent = {
      type: "warp",
      planetId: planet.id,
      fromSector,
      toSector: targetSector,
    };

    this.persistPlanet(planet);
    return event;
  }

  private tick(): WorldEvent[] {
    const events: WorldEvent[] = [];

    for (const planet of this.planets.values()) {
      planet.position.x += planet.velocity.x * TICK_INTERVAL_SEC;
      planet.position.y += planet.velocity.y * TICK_INTERVAL_SEC;
      planet.position.z += planet.velocity.z * TICK_INTERVAL_SEC;

      applyGravityTether(planet, TICK_INTERVAL_SEC);

      if (!planet.warpAuthorized && isInBlackHoleZone(planet)) {
        const rebirthEvent = executeRebirth(planet);
        events.push(rebirthEvent);
        this.persistPlanet(planet);
      }
    }

    return events;
  }

  private persistPlanet(planet: Planet): void {
    if (!this.persistence) {
      return;
    }

    this.persistence.persistPlanet(
      planet,
      this.getNumericPlanetId(planet.id),
    );
  }
}