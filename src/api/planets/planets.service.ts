import { getSupabaseClient } from "../../db/supabase";
import type { WorldEngine } from "../../engine/world";

export interface CreatePlanetDTO {
  name: string;
  constellationId: number;
  planetType: "rocky" | "gaseous" | "icy";
  colorHex: string;
}

export class PlanetService {
  
  // token 대신 userId를 직접 주입받습니다.
  static async checkPlanetExists(userId: string): Promise<boolean> {
    const supabase = getSupabaseClient();
    
    // 미들웨어에서 이미 검증했으므로, Supabase Auth 호출 로직 삭제 완료
    const { data, error } = await supabase
      .from("user_planets")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw new Error(error.message);

    return !!data;
  }

  // token 대신 userId를 직접 주입받습니다.
  static async createPlanet(userId: string, data: CreatePlanetDTO, world: WorldEngine) {
    const supabase = getSupabaseClient();

    const radius = 5000 + Math.random() * 15000;
    const theta = Math.random() * Math.PI * 2;
    const x = radius * Math.cos(theta);
    const y = (Math.random() - 0.5) * 2000;
    const z = radius * Math.sin(theta);

    const length = Math.sqrt(x * x + z * z);
    const tangentX = -z / length;
    const tangentZ = x / length;

    const GRAVITY_CONSTANT = 12000000;
    const orbitSpeed = Math.sqrt(GRAVITY_CONSTANT / radius);

    const vx = tangentX * orbitSpeed;
    const vy = (Math.random() - 0.5) * 10;
    const vz = tangentZ * orbitSpeed;

    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", userId)
      .single();

    const currentUsername = profile?.username || "Space Founder";

    const { data: newPlanet, error: dbError } = await supabase
      .from("user_planets")
      .insert({
        user_id: userId,
        name: data.name.trim(),
        x, y, z, vx, vy, vz,
        constellation_id: Number(data.constellationId || 0),
        planet_type: data.planetType || "rocky",
        color_hex: data.colorHex || "#ffffff"
      })
      .select("id")
      .single();

    if (dbError || !newPlanet) throw new Error(`Database failed: ${dbError?.message}`);

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ has_planet: true })
      .eq("id", userId);

    if (profileError) {
      throw new Error(`Profile update failed: ${profileError.message}`);
    }

    world.hydrate([{
      numericId: newPlanet.id,
      planet: {
        id: data.name.trim(),
        position: { x, y, z },
        velocity: { x: vx, y: vy, z: vz },
        warpAuthorized: true,
        constellationId: Number(data.constellationId || 0),
        planetType: data.planetType || "rocky",
        colorHex: data.colorHex || "#ffffff",
        radius: 1.0,
        username: currentUsername
      },
    }]);

    return { planetId: newPlanet.id };
  }
}