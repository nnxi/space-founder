import { getSupabaseClient } from "../../db/supabase";
import type { WorldEngine } from "../../engine/world";

export interface CreateSatelliteDTO {
  planetId: number;
}

export class SatelliteService {
  
  static async createSatellite(token: string, data: CreateSatelliteDTO, world: WorldEngine) {
    const supabase = getSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      throw new Error("UNAUTHORIZED");
    }

    // 1. 프로필 위성 개수 검사
    const { data: profileRecord, error: profileGetError } = await supabase
      .from("profiles")
      .select("satellite_count")
      .eq("id", user.id)
      .single();

    if (profileGetError || !profileRecord) {
      throw new Error("NOT_FOUND");
    }

    if (profileRecord.satellite_count >= 5) {
      throw new Error("LIMIT_REACHED");
    }

    // 2. 행성 소유권 검사
    const { data: planetRecord, error: planetError } = await supabase
      .from("user_planets")
      .select("id")
      .eq("id", data.planetId)
      .eq("user_id", user.id)
      .single();

    if (planetError || !planetRecord) {
      throw new Error("FORBIDDEN");
    }

    // 위성 궤도 연산
    const orbitRadius = 250 + Math.random() * 500;
    const orbitSpeed = 0.1 + Math.random() * 0.1;
    const orbitInclination = (Math.random() - 0.5) * 0.8;

    // 3. 위성 데이터 삽입
    const { data: newSatellite, error: dbError } = await supabase
      .from("planet_satellites")
      .insert({
        planet_id: data.planetId,
        orbit_radius: orbitRadius,
        orbit_speed: orbitSpeed,
        orbit_inclination: orbitInclination
      })
      .select("id")
      .single();

    if (dbError || !newSatellite) {
      throw new Error(`Database failed: ${dbError?.message}`);
    }

    // 4. 프로필 위성 개수 증가
    const { error: profileUpdateError } = await supabase
      .from("profiles")
      .update({ satellite_count: profileRecord.satellite_count + 1 })
      .eq("id", user.id);

    if (profileUpdateError) {
      throw new Error(`Failed to increment satellite count: ${profileUpdateError.message}`);
    }

    // 5. 물리 엔진 메모리 주입
    const enginePlanetId = world.getPlanetIdByNumericId(data.planetId);
    
    if (enginePlanetId) {
      const enginePlanet = world.getPlanet(enginePlanetId) as any;
      
      if (enginePlanet) {
        if (!enginePlanet.satellites) {
          enginePlanet.satellites = [];
        }
        
        enginePlanet.satellites.push({
          id: newSatellite.id,
          orbit_radius: orbitRadius,
          orbit_speed: orbitSpeed,
          orbit_inclination: orbitInclination
        });
      }
    }

    return {
      satelliteId: newSatellite.id,
      orbit_radius: orbitRadius,
      orbit_speed: orbitSpeed,
      orbit_inclination: orbitInclination
    };
  }
}