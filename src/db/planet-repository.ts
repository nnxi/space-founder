import type { SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config";
import type { WorldEngine, PlanetPersistenceAdapter } from "../engine/world";
import type { Planet } from "../types/planet";

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
  constellation_id: number;
  planet_type: string;
  color_hex: string;
  role: string;
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
  planet_satellites?: SatelliteRow[];
  profiles?: { username: string } | { username: string }[] | null;
  role: string;
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
    if ((planet as any).role == "default") {
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
      if ((planet as any).role == "default") {
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
      .select("id, name, earth_radius, x, y, z, vx, vy, vz, constellation_id, planet_type, color_hex, role")
      .order("id", { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch NASA planets: ${error.message}`);
    }

    return (data ?? []) as NasaPlanetRow[];
  }

  private async fetchUserPlanets(): Promise<UserPlanetRow[]> {
    const { data, error } = await this.supabase
      .from("user_planets")
      .select("id, user_id, name, x, y, z, vx, vy, vz, constellation_id, planet_type, color_hex, created_at, planet_satellites(id, orbit_radius, orbit_speed, orbit_inclination), profiles:user_id(username), role")
      .order("id", { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch user planets: ${error.message}`);
    }

    return (data ?? []) as UserPlanetRow[];
  }
}

// 절대 좌표를 청크 좌표계로 변환하는 유틸리티 함수
function toChunkSpace(x: number, y: number, z: number) {
  const cx = Math.floor(x / config.sectorSize);
  const cy = Math.floor(y / config.sectorSize);
  const cz = Math.floor(z / config.sectorSize);
  
  return {
    chunkIndex: { x: cx, y: cy, z: cz },
    localPosition: {
      x: x - (cx * config.sectorSize),
      y: y - (cy * config.sectorSize),
      z: z - (cz * config.sectorSize),
    }
  };
}

// 청크 좌표계를 절대 좌표계로 변환하는 유틸리티 함수
function toAbsoluteSpace(chunkIndex: { x: number, y: number, z: number }, localPosition: { x: number, y: number, z: number }) {
  return {
    x: (chunkIndex.x * config.sectorSize) + localPosition.x,
    y: (chunkIndex.y * config.sectorSize) + localPosition.y,
    z: (chunkIndex.z * config.sectorSize) + localPosition.z,
  };
}

function toHydratableNasa(row: NasaPlanetRow): { numericId: number; planet: Planet } {
  const { chunkIndex, localPosition } = toChunkSpace(row.x, row.y, row.z);

  return {
    numericId: row.id,
    planet: {
      id: row.name,
      chunkIndex,
      localPosition,
      velocity: { x: row.vx, y: row.vy, z: row.vz },
      constellationId: row.constellation_id,
      planetType: row.planet_type as any,
      colorHex: row.color_hex,
      radius: row.earth_radius ?? 1.0,
      username: "NASA",
      role: row.role || "default",
    } as any,
  };
}

function toHydratableUser(row: UserPlanetRow): { numericId: number; planet: Planet } {
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  const username = profile?.username || "Space Explorer";
  
  const { chunkIndex, localPosition } = toChunkSpace(row.x, row.y, row.z);

  return {
    numericId: row.id,
    planet: {
      id: row.name,
      chunkIndex,
      localPosition,
      velocity: { x: row.vx, y: row.vy, z: row.vz },
      constellationId: row.constellation_id,
      planetType: row.planet_type as any,
      colorHex: row.color_hex,
      radius: 1.0,
      satellites: row.planet_satellites ?? [],
      username,
      role: row.role || "user",
    } as any,
  };
}

function toUserInsertRow(planet: Planet, numericId: number): Partial<UserPlanetRow> {
  const p = planet as any;
  const absPos = toAbsoluteSpace(planet.chunkIndex, planet.localPosition);

  return {
    id: numericId,
    name: planet.id,
    x: absPos.x,
    y: absPos.y,
    z: absPos.z,
    vx: planet.velocity.x,
    vy: planet.velocity.y,
    vz: planet.velocity.z,
    constellation_id: planet.constellationId,
    planet_type: p.planetType || "rocky",
    color_hex: p.colorHex || "#ffffff",
  };
}