import type { FastifyInstance } from "fastify";
import type { WorldEngine } from "../engine/world";
import { getSupabaseClient } from "../db/supabase";

export function registerPlanetRoutes(app: FastifyInstance, world: WorldEngine): void {
  
  // 유저의 행성 보유 여부 검사
  app.get("/api/planets/check", async (request, reply) => {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return reply.status(401).send({ error: "Missing or invalid token" });
      }
      const token = authHeader.split(" ")[1];

      const supabase = getSupabaseClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);

      if (authError || !user) {
        return reply.status(401).send({ error: "Unauthorized token" });
      }

      const { data, error } = await supabase
        .from("user_planets")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) return reply.status(500).send({ error: error.message });

      return reply.send({ hasPlanet: !!data });
    } catch (error: any) {
      return reply.status(500).send({ error: error.message });
    }
  });

  // 나만의 행성 생성 및 궤도 속도 주입
  app.post("/api/planets", async (request, reply) => {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return reply.status(401).send({ error: "Missing or invalid token" });
      }
      const token = authHeader.split(" ")[1];

      // 프론트엔드에서 보내는 디자인 메타데이터 속성 추가 추출
      const { name, constellationId, planetType, colorHex } = request.body as { 
        name: string; 
        constellationId: number;
        planetType: "rocky" | "gaseous" | "icy";
        colorHex: string;
      };
      
      if (!name) return reply.status(400).send({ error: "Missing required fields" });

      const supabase = getSupabaseClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);

      if (authError || !user) return reply.status(401).send({ error: "Unauthorized token" });

      // 초기 위치 계산
      const radius = 5000 + Math.random() * 15000;
      const theta = Math.random() * Math.PI * 2;
      const x = radius * Math.cos(theta);
      const y = (Math.random() - 0.5) * 2000;
      const z = radius * Math.sin(theta);

      // 중심(0,0,0)을 공전하기 위한 접선 벡터 및 속도 계산
      const length = Math.sqrt(x * x + z * z);
      const tangentX = -z / length;
      const tangentZ = x / length;

      const GRAVITY_CONSTANT = 12000000;
      const orbitSpeed = Math.sqrt(GRAVITY_CONSTANT / radius);

      const vx = tangentX * orbitSpeed;
      const vy = (Math.random() - 0.5) * 10;
      const vz = tangentZ * orbitSpeed;

      // DB 저장 시 디자인 메타데이터 매핑
      const { data: newPlanet, error: dbError } = await supabase
        .from("user_planets")
        .insert({
          user_id: user.id,
          name: name.trim(),
          x, y, z, vx, vy, vz,
          constellation_id: Number(constellationId || 0),
          planet_type: planetType || "rocky",
          color_hex: colorHex || "#ffffff"
        })
        .select("id")
        .single();

      if (dbError || !newPlanet) throw new Error(`Database failed: ${dbError?.message}`);

      // 실시간 물리 엔진 메모리 적재 시 디자인 메타데이터 매핑
      world.hydrate([{
        numericId: newPlanet.id,
        planet: {
          id: name.trim(),
          position: { x, y, z },
          velocity: { x: vx, y: vy, z: vz },
          warpAuthorized: true,
          constellationId: Number(constellationId || 0),
          planetType: planetType || "rocky",
          colorHex: colorHex || "#ffffff",
          radius: 1.0,
        },
      }]);

      return reply.status(201).send({ success: true, planetId: newPlanet.id });
    } catch (error: any) {
      return reply.status(500).send({ error: error.message });
    }
  });
}