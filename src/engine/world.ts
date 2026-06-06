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
      const copy = { ...planet };

      if (numericId !== 1) {
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