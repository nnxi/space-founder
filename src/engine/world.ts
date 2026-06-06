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
      this.planets.set(planet.id, { ...planet });
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
