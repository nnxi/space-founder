import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorldEngine, PlanetPersistenceAdapter } from "../engine/world";
import type { Planet } from "../types/planet";

// 위성 데이터 로우 타입 정의
export interface SatelliteRow {
  id: number;
  orbit_radius: number;
  orbit_speed: number;
  orbit_inclination: number;
}

export interface NasaPlanetRow {
  id: number;
  name: string;
  earth_radius?: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  home_sector_x: number;
  home_sector_y: number;
  home_sector_z: number;
  constellation_id: number;
  planet_type: string;
  color_hex: string;
}

export interface UserPlanetRow {
  id: number;
  user_id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  constellation_id: number;
  planet_type: string;
  color_hex: string;
  created_at: string;
  planet_satellites?: SatelliteRow[]; // JOIN된 위성 배열
}

export class PlanetRepository implements PlanetPersistenceAdapter {
  constructor(private readonly supabase: SupabaseClient) {}

  async bootstrapWorld(world: WorldEngine): Promise<void> {
    const [nasaRows, userRows] = await Promise.all([
      this.fetchNasaPlanets(),
      this.fetchUserPlanets()
    ]);

    const hydratablePlanets = [
      ...nasaRows.map((row) => toHydratableNasa(row)),
      ...userRows.map((row) => toHydratableUser(row))
    ];

    world.hydrate(hydratablePlanets);
  }

  persistPlanet(planet: Planet, numericId: number): void {
    if (!planet.warpAuthorized) {
      return; 
    }

    void this.savePlanet(planet, numericId).catch((error: unknown) => {
      console.error(`[PlanetRepository] Immediate persist failed for ${planet.id}:`, error);
    });
  }

  async savePlanet(planet: Planet, numericId: number): Promise<void> {
    const row = toUserInsertRow(planet, numericId);
    const { error } = await this.supabase
      .from("user_planets")
      .upsert(row, { onConflict: "id" });

    if (error) {
      throw new Error(`Failed to persist user planet ${planet.id}: ${error.message}`);
    }
  }

  async saveSnapshot(
    planets: ReadonlyMap<string, Planet>,
    resolveNumericId: (planetId: string) => number,
  ): Promise<void> {
    const rows: Partial<UserPlanetRow>[] = [];

    for (const planet of planets.values()) {
      if (!planet.warpAuthorized) {
        continue;
      }

      rows.push(toUserInsertRow(planet, resolveNumericId(planet.id)));
    }

    if (rows.length === 0) {
      return;
    }

    const { error } = await this.supabase
      .from("user_planets")
      .upsert(rows, { onConflict: "id" });

    if (error) {
      throw new Error(`Failed to upsert user planet snapshot: ${error.message}`);
    }
  }

  private async fetchNasaPlanets(): Promise<NasaPlanetRow[]> {
    const { data, error } = await this.supabase
      .from("nasa_planets")
      .select("id, name, earth_radius, x, y, z, vx, vy, vz, home_sector_x, home_sector_y, home_sector_z, constellation_id, planet_type, color_hex")
      .order("id", { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch NASA planets: ${error.message}`);
    }

    return (data ?? []) as NasaPlanetRow[];
  }

  private async fetchUserPlanets(): Promise<UserPlanetRow[]> {
    const { data, error } = await this.supabase
      .from("user_planets")
      // user_planets 조회 시 planet_satellites 테이블 JOIN
      .select("id, user_id, name, x, y, z, vx, vy, vz, constellation_id, planet_type, color_hex, created_at, warp_authorized, planet_satellites(id, orbit_radius, orbit_speed, orbit_inclination)")
      .order("id", { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch user planets: ${error.message}`);
    }

    return (data ?? []) as UserPlanetRow[];
  }
}

function toHydratableNasa(row: NasaPlanetRow): { numericId: number; planet: Planet } {
  return {
    numericId: row.id,
    planet: {
      id: row.name,
      position: { x: row.x, y: row.y, z: row.z },
      velocity: { x: row.vx, y: row.vy, z: row.vz },
      warpAuthorized: false,
      homeSector: {
        x: row.home_sector_x,
        y: row.home_sector_y,
        z: row.home_sector_z,
      },
      constellationId: row.constellation_id,
      planetType: row.planet_type as any,
      colorHex: row.color_hex,
      radius: row.earth_radius ?? 1.0,
    },
  };
}

function toHydratableUser(row: UserPlanetRow): { numericId: number; planet: Planet } {
  return {
    numericId: row.id,
    planet: {
      id: row.name,
      position: { x: row.x, y: row.y, z: row.z },
      velocity: { x: row.vx, y: row.vy, z: row.vz },
      warpAuthorized: true,
      constellationId: row.constellation_id,
      planetType: row.planet_type as any,
      colorHex: row.color_hex,
      radius: 1.0,
      satellites: row.planet_satellites ?? [],
    } as any,
  };
}

function toUserInsertRow(planet: Planet, numericId: number): Partial<UserPlanetRow> {
  const p = planet as any;
  return {
    id: numericId,
    name: planet.id,
    x: planet.position.x,
    y: planet.position.y,
    z: planet.position.z,
    vx: planet.velocity.x,
    vy: planet.velocity.y,
    vz: planet.velocity.z,
    constellation_id: planet.constellationId,
    planet_type: p.planetType || "rocky",
    color_hex: p.colorHex || "#ffffff",
  };
}