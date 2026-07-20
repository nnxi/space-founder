import type { FastifyInstance } from "fastify";
import type { WorldEngine } from "../../engine/world";
import { SatelliteController } from "./satellites.controller";
import { verifyHttpToken } from "../../middleware/auth.middleware";

export function registerSatelliteRoutes(app: FastifyInstance, world: WorldEngine): void {
  // 위성 생성
  app.post("/api/satellites", { preHandler: [verifyHttpToken] }, (request, reply) => 
    SatelliteController.createSatellite(request, reply, world)
  );
}