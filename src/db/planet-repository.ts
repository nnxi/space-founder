import type { SupabaseClient } from "@supabase/supabase-js";
import { buildDummyPlanetRows } from "../data/dummy-planets";
import type { WorldEngine } from "../engine/world";
import type { PlanetPersistenceAdapter } from "../engine/world";
import type { Planet } from "../types/planet";
import type { PlanetInsertRow, PlanetRow } from "../types/planet-row";

export class PlanetRepository implements PlanetPersistenceAdapter {
  constructor(private readonly supabase: SupabaseClient) {}

  async bootstrapWorld(world: WorldEngine): Promise<void> {
    let rows = await this.fetchAll();

    if (rows.length === 0) {
      await this.seedDummyPlanets();
      rows = await this.fetchAll();
    }

    world.hydrate(rows.map((row) => toHydratablePlanet(row)));
  }

  persistPlanet(planet: Planet, numericId: number): void {
    void this.savePlanet(planet, numericId).catch((error: unknown) => {
      console.error(
        `[PlanetRepository] Immediate persist failed for ${planet.id}:`,
        error,
      );
    });
  }

  async savePlanet(planet: Planet, numericId: number): Promise<void> {
    const row = toInsertRow(planet, numericId);
    const { error } = await this.supabase
      .from("planets")
      .upsert(row, { onConflict: "id" });

    if (error) {
      throw new Error(`Failed to persist planet ${planet.id}: ${error.message}`);
    }
  }

  async saveSnapshot(
    planets: ReadonlyMap<string, Planet>,
    resolveNumericId: (planetId: string) => number,
  ): Promise<void> {
    const rows: PlanetInsertRow[] = [];
    const updatedAt = new Date().toISOString();

    for (const planet of planets.values()) {
      rows.push({
        ...toInsertRow(planet, resolveNumericId(planet.id)),
        updated_at: updatedAt,
      });
    }

    const { error } = await this.supabase
      .from("planets")
      .upsert(rows, { onConflict: "id" });

    if (error) {
      throw new Error(`Failed to upsert planet snapshot: ${error.message}`);
    }
  }

  private async fetchAll(): Promise<PlanetRow[]> {
    const { data, error } = await this.supabase
      .from("planets")
      .select(
        "id, name, x, y, z, vx, vy, vz, warp_authorized, home_sector_x, home_sector_y, home_sector_z, constellation_id, updated_at",
      )
      .order("id", { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch planets: ${error.message}`);
    }

    return (data ?? []) as PlanetRow[];
  }

  private async seedDummyPlanets(): Promise<void> {
    const rows = buildDummyPlanetRows().map((row) => ({
      ...row,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await this.supabase.from("planets").insert(rows);

    if (error) {
      throw new Error(`Failed to seed dummy planets: ${error.message}`);
    }
  }
}

function toHydratablePlanet(row: PlanetRow): {
  numericId: number;
  planet: Planet;
} {
  return {
    numericId: row.id,
    planet: {
      id: row.name,
      position: { x: row.x, y: row.y, z: row.z },
      velocity: { x: row.vx, y: row.vy, z: row.vz },
      warpAuthorized: row.warp_authorized,
      homeSector: {
        x: row.home_sector_x,
        y: row.home_sector_y,
        z: row.home_sector_z,
      },
      constellationId: row.constellation_id,
    },
  };
}

function toInsertRow(planet: Planet, numericId: number): PlanetInsertRow {
  return {
    id: numericId,
    name: planet.id,
    x: planet.position.x,
    y: planet.position.y,
    z: planet.position.z,
    vx: planet.velocity.x,
    vy: planet.velocity.y,
    vz: planet.velocity.z,
    warp_authorized: planet.warpAuthorized,
    home_sector_x: planet.homeSector.x,
    home_sector_y: planet.homeSector.y,
    home_sector_z: planet.homeSector.z,
    constellation_id: planet.constellationId,
    updated_at: new Date().toISOString(),
  };
}
