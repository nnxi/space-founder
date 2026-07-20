import type { FastifyRequest, FastifyReply } from "fastify";
import { SatelliteService, type CreateSatelliteDTO } from "./satellites.service";
import type { WorldEngine } from "../../engine/world";

export class SatelliteController {
  
  static async createSatellite(request: FastifyRequest, reply: FastifyReply, world: WorldEngine) {
    try {
      // 미들웨어가 주입한 userId 추출
      const userId = request.userId;
      
      if (!userId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const body = request.body as CreateSatelliteDTO;
      if (!body || !body.planetId) {
        return reply.status(400).send({ error: "Missing required field: planetId" });
      }

      // token 대신 userId 전달
      const result = await SatelliteService.createSatellite(userId, body, world);
      
      return reply.status(201).send({ 
        success: true, 
        satelliteId: result.satelliteId,
        orbit_radius: result.orbit_radius,
        orbit_speed: result.orbit_speed,
        orbit_inclination: result.orbit_inclination
      });
      
    } catch (error: any) {
      switch (error.message) {
        case "NOT_FOUND":
          return reply.status(404).send({ error: "User profile not found" });
        case "LIMIT_REACHED":
          return reply.status(400).send({ error: "Satellite limit reached. Maximum 5 satellites allowed." });
        case "FORBIDDEN":
          return reply.status(403).send({ error: "Not authorized to add satellites to this planet" });
        default:
          return reply.status(500).send({ error: error.message || "Internal server error" });
      }
    }
  }
}