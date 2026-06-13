import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorldEngine, PlanetPersistenceAdapter } from "../engine/world";
import type { Planet } from "../types/planet";

// DB 스키마에 맞춘 로우 타입 정의
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
  home_sector_x: number;
  home_sector_y: number;
  home_sector_z: number;
  constellation_id: number;
  updated_at: string;
}

export class PlanetRepository implements PlanetPersistenceAdapter {
  constructor(private readonly supabase: SupabaseClient) {}

  // 서버 부트스트랩 시 두 테이블의 데이터를 모두 불러와 엔진에 적재
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

  // 개별 행성 저장 시 유저 행성만 필터링하여 처리
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

  // 물리 틱마다 실행되는 스냅샷 저장 (유저 행성만 추출하여 벌크 업데이트)
  async saveSnapshot(
    planets: ReadonlyMap<string, Planet>,
    resolveNumericId: (planetId: string) => number,
  ): Promise<void> {
    const rows: Partial<UserPlanetRow>[] = [];
    const updatedAt = new Date().toISOString();

    for (const planet of planets.values()) {
      if (!planet.warpAuthorized) {
        continue;
      }

      rows.push({
        ...toUserInsertRow(planet, resolveNumericId(planet.id)),
        updated_at: updatedAt,
      });
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
      .select("id, name, earth_radius, x, y, z, vx, vy, vz, home_sector_x, home_sector_y, home_sector_z, constellation_id")
      .order("id", { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch NASA planets: ${error.message}`);
    }

    return (data ?? []) as NasaPlanetRow[];
  }

  private async fetchUserPlanets(): Promise<UserPlanetRow[]> {
    const { data, error } = await this.supabase
      .from("user_planets")
      .select("id, user_id, name, x, y, z, vx, vy, vz, home_sector_x, home_sector_y, home_sector_z, constellation_id, updated_at")
      .order("id", { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch user planets: ${error.message}`);
    }

    return (data ?? []) as UserPlanetRow[];
  }
}

// NASA 행성 데이터 변환기 (고정 객체 처리)
function toHydratableNasa(row: NasaPlanetRow): { numericId: number; planet: Planet } {
  return {
    numericId: row.id,
    planet: {
      id: row.name,
      position: { x: row.x, y: row.y, z: row.z },
      velocity: { x: row.vx, y: row.vy, z: row.vz },
      warpAuthorized: false, // NASA 행성은 물리 및 워프 제한
      homeSector: {
        x: row.home_sector_x,
        y: row.home_sector_y,
        z: row.home_sector_z,
      },
      constellationId: row.constellation_id,
    },
  };
}

// 유저 행성 데이터 변환기 (동적 객체 처리)
function toHydratableUser(row: UserPlanetRow): { numericId: number; planet: Planet } {
  return {
    numericId: row.id,
    planet: {
      id: row.name,
      position: { x: row.x, y: row.y, z: row.z },
      velocity: { x: row.vx, y: row.vy, z: row.vz },
      warpAuthorized: true, // 유저 행성은 자유로운 이동 허용
      homeSector: {
        x: row.home_sector_x,
        y: row.home_sector_y,
        z: row.home_sector_z,
      },
      constellationId: row.constellation_id,
    },
  };
}

// 유저 행성 DB 적재용 데이터 구조화
function toUserInsertRow(planet: Planet, numericId: number): Partial<UserPlanetRow> {
  return {
    id: numericId,
    name: planet.id,
    x: planet.position.x,
    y: planet.position.y,
    z: planet.position.z,
    vx: planet.velocity.x,
    vy: planet.velocity.y,
    vz: planet.velocity.z,
    home_sector_x: planet.homeSector.x,
    home_sector_y: planet.homeSector.y,
    home_sector_z: planet.homeSector.z,
    constellation_id: planet.constellationId,
  };
}