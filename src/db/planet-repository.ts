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
    if ((planet as any).role === "default") {
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
    try {
      const rows: Partial<UserPlanetRow>[] = [];

      for (const planet of planets.values()) {
        if ((planet as any).role === "default") {
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
        console.error(`[SnapshotScheduler] DB Upsert failed: ${error.message}`);
      }
    } catch (error) {
      console.error(`[SnapshotScheduler] Network request failed:`, error);
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
      id: `nasa_${row.id}`, // 고유 식별 키
      name: row.name, // 행성 표시 이름
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
      id: `user_${row.id}`, // 고유 식별 키
      name: row.name, // 행성 표시 이름
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
      userId: row.user_id,
    } as any,
  };
}

function toUserInsertRow(planet: Planet, numericId: number): Partial<UserPlanetRow> {
  const p = planet as any;
  const absPos = toAbsoluteSpace(planet.chunkIndex, planet.localPosition);

  const row: Partial<UserPlanetRow> = {
    id: numericId,
    name: p.name || planet.id, // DB name 컬럼에는 행성 표시 이름 저장
    x: absPos.x || 0,
    y: absPos.y || 0,
    z: absPos.z || 0,
    vx: planet.velocity?.x || 0,
    vy: planet.velocity?.y || 0,
    vz: planet.velocity?.z || 0,
    constellation_id: planet.constellationId || 0,
    planet_type: p.planetType || "rocky",
    color_hex: p.colorHex || "#ffffff",
    role: p.role || "user",
  };

  if (p.userId) {
    row.user_id = p.userId;
  }

  return row;
}