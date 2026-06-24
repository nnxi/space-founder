import type { FastifyInstance } from "fastify";
import { getSupabaseClient } from "../db/supabase";

export function registerUserRoutes(app: FastifyInstance): void {

  // 현재 로그인한 유저의 프로필 정보 조회
  app.get("/api/users/me", async (request, reply) => {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return reply.status(401).send({ error: "Missing or invalid token" });
      }
      const token = authHeader.split(" ")[1];

      const supabase = getSupabaseClient();
      
      // Supabase Auth 토큰 검증 및 유저 정보 추출
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);

      if (authError || !user) {
        return reply.status(401).send({ error: "Unauthorized token" });
      }

      // profiles 테이블에서 필요한 컬럼만 명시적으로 셀렉트
      const { data: profile, error: dbError } = await supabase
        .from("profiles")
        .select("id, email, username, has_planet, satellite_count")
        .eq("id", user.id)
        .maybeSingle();

      if (dbError) {
        return reply.status(500).send({ error: dbError.message });
      }

      if (!profile) {
        return reply.status(404).send({ error: "User profile not found" });
      }

      // 획득한 프로필 스펙을 규격화하여 클라이언트에 반환
      return reply.send({
        id: profile.id,
        email: profile.email,
        username: profile.username,
        hasPlanet: profile.has_planet,
        satelliteCount: profile.satellite_count || 0
      });

    } catch (error: any) {
      return reply.status(500).send({ error: error.message });
    }
  });
}