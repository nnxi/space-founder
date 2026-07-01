import type { FastifyRequest, FastifyReply } from "fastify";
import { PlanetService, type CreatePlanetDTO } from "./planets.service";
import type { WorldEngine } from "../../engine/world";

export class PlanetController {
  
  static async checkPlanet(request: FastifyRequest, reply: FastifyReply) {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return reply.status(401).send({ error: "Missing or invalid token" });
      }
      const token = authHeader.split(" ")[1];

      const hasPlanet = await PlanetService.checkPlanetExists(token);
      return reply.send({ hasPlanet });
      
    } catch (error: any) {
      if (error.message === "UNAUTHORIZED") {
        return reply.status(401).send({ error: "Unauthorized token" });
      }
      return reply.status(500).send({ error: error.message || "Internal server error" });
    }
  }

  static async createPlanet(request: FastifyRequest, reply: FastifyReply, world: WorldEngine) {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return reply.status(401).send({ error: "Missing or invalid token" });
      }
      const token = authHeader.split(" ")[1];

      const data = request.body as CreatePlanetDTO;
      if (!data.name) {
        return reply.status(400).send({ error: "Missing required fields" });
      }

      const result = await PlanetService.createPlanet(token, data, world);
      return reply.status(201).send({ success: true, planetId: result.planetId });
      
    } catch (error: any) {
      if (error.message === "UNAUTHORIZED") {
        return reply.status(401).send({ error: "Unauthorized token" });
      }
      return reply.status(500).send({ error: error.message || "Internal server error" });
    }
  }
}