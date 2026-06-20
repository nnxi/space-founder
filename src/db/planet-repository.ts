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
  planet_type: string; // 💡 신규 컬럼 반영
  color_hex: string;   // 💡 신규 컬럼 반영
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
  planet_type: string; // 💡 신규 컬럼 반영
  color_hex: string;   // 💡 신규 컬럼 반영
  created_at: string;
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
      // 💡 select 절에 planet_type, color_hex 추가
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
      // 💡 select 절에 planet_type, color_hex 추가
      .select("id, user_id, name, x, y, z, vx, vy, vz, constellation_id, planet_type, color_hex, created_at, warp_authorized")
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
      planetType: row.planet_type as any, // 💡 엔진 Planet 인스턴스 속성 매핑
      colorHex: row.color_hex,           // 💡 엔진 Planet 인스턴스 속성 매핑
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
      planetType: row.planet_type as any, // 💡 엔진 Planet 인스턴스 속성 매핑
      colorHex: row.color_hex,           // 💡 엔진 Planet 인스턴스 속성 매핑
      radius: 1.0,
    },
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
    planet_type: p.planetType || "rocky", // 💡 디비 저장 시 유저 데이터 인계 보장
    color_hex: p.colorHex || "#ffffff",   // 💡 디비 저장 시 유저 데이터 인계 보장
  };
}