import { getSupabaseClient } from "../../db/supabase";
import type { WorldEngine } from "../../engine/world";

export interface CreatePlanetDTO {
  name: string;
  constellationId: number;
  planetType: "rocky" | "gaseous" | "icy";
  colorHex: string;
}

export class PlanetService {
  
  static async checkPlanetExists(token: string): Promise<boolean> {
    const supabase = getSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) throw new Error("UNAUTHORIZED");

    const { data, error } = await supabase
      .from("user_planets")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) throw new Error(error.message);

    return !!data;
  }

  static async createPlanet(token: string, data: CreatePlanetDTO, world: WorldEngine) {
    const supabase = getSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) throw new Error("UNAUTHORIZED");

    // 초기 위치 및 궤도 물리 연산
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

    // 프로필 닉네임 조회
    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .single();

    const currentUsername = profile?.username || "Space Founder";

    // 1. DB에 행성 인서트
    const { data: newPlanet, error: dbError } = await supabase
      .from("user_planets")
      .insert({
        user_id: user.id,
        name: data.name.trim(),
        x, y, z, vx, vy, vz,
        constellation_id: Number(data.constellationId || 0),
        planet_type: data.planetType || "rocky",
        color_hex: data.colorHex || "#ffffff"
      })
      .select("id")
      .single();

    if (dbError || !newPlanet) throw new Error(`Database failed: ${dbError?.message}`);

    // 2. 프로필 업데이트
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ has_planet: true })
      .eq("id", user.id);

    if (profileError) {
      throw new Error(`Profile update failed: ${profileError.message}`);
    }

    // 3. 물리 엔진 적재
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