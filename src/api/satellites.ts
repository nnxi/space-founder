import type { FastifyInstance } from "fastify";
import type { WorldEngine } from "../engine/world";
import { getSupabaseClient } from "../db/supabase";

export function registerSatelliteRoutes(app: FastifyInstance, world: WorldEngine): void {
  
  // 위성 생성 및 궤도 주입
  app.post("/api/satellites", async (request, reply) => {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return reply.status(401).send({ error: "Missing or invalid token" });
      }
      const token = authHeader.split(" ")[1];

      const body = request.body as { planetId: number };
      const targetPlanetId = body?.planetId;

      if (!targetPlanetId) {
        return reply.status(400).send({ error: "Missing required field: planetId" });
      }

      const supabase = getSupabaseClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);

      if (authError || !user) {
        return reply.status(401).send({ error: "Unauthorized token" });
      }

      const { data: planetRecord, error: planetError } = await supabase
        .from("user_planets")
        .select("id")
        .eq("id", targetPlanetId)
        .eq("user_id", user.id)
        .single();

      if (planetError || !planetRecord) {
        return reply.status(403).send({ error: "Not authorized to add satellites to this planet" });
      }

      const orbitRadius = 250 + Math.random() * 500;
      const orbitSpeed = 0.1 + Math.random() * 0.1;
      const orbitInclination = (Math.random() - 0.5) * 0.8;

      const { data: newSatellite, error: dbError } = await supabase
        .from("planet_satellites")
        .insert({
          planet_id: targetPlanetId,
          orbit_radius: orbitRadius,
          orbit_speed: orbitSpeed,
          orbit_inclination: orbitInclination
        })
        .select("id")
        .single();

      if (dbError || !newSatellite) {
        throw new Error(`Database failed: ${dbError?.message}`);
      }

      // 4. 실시간 물리 엔진 메모리(RAM)에 즉시 주입
      const enginePlanetId = world.getPlanetIdByNumericId(targetPlanetId);
      
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

      return reply.status(201).send({ 
        success: true, 
        satelliteId: newSatellite.id,
        orbit_radius: orbitRadius,
        orbit_speed: orbitSpeed,
        orbit_inclination: orbitInclination
      });
      
    } catch (error: any) {
      return reply.status(500).send({ error: error.message });
    }
  });
}