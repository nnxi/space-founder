import type { FastifyRequest, FastifyReply } from "fastify";
import { PlanetService, type CreatePlanetDTO } from "./planets.service";
import type { WorldEngine } from "../../engine/world";

export class PlanetController {
  
  static async checkPlanet(request: FastifyRequest, reply: FastifyReply) {
    try {
      // 미들웨어가 주입한 userId 추출
      const userId = request.userId;
      
      if (!userId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      // token 대신 userId 전달
      const hasPlanet = await PlanetService.checkPlanetExists(userId);
      return reply.send({ hasPlanet });
      
    } catch (error: any) {
      return reply.status(500).send({ error: error.message || "Internal server error" });
    }
  }

  static async createPlanet(request: FastifyRequest, reply: FastifyReply, world: WorldEngine) {
    try {
      // 미들웨어가 주입한 userId 추출
      const userId = request.userId;
      
      if (!userId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const data = request.body as CreatePlanetDTO;
      if (!data.name) {
        return reply.status(400).send({ error: "Missing required fields" });
      }

      // token 대신 userId 전달
      const result = await PlanetService.createPlanet(userId, data, world);
      return reply.status(201).send({ success: true, planetId: result.planetId });
      
    } catch (error: any) {
      return reply.status(500).send({ error: error.message || "Internal server error" });
    }
  }
}