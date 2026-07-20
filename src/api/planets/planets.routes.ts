import type { FastifyInstance } from "fastify";
import type { WorldEngine } from "../../engine/world";
import { PlanetController } from "./planets.controller";
import { verifyHttpToken } from "../../middleware/auth.middleware";

export function registerPlanetRoutes(app: FastifyInstance, world: WorldEngine): void {
  // 행성 보유 여부 검사
  app.get("/api/planets/check", { preHandler: [verifyHttpToken] }, PlanetController.checkPlanet);
  
  // 행성 생성
  app.post("/api/planets", { preHandler: [verifyHttpToken] }, (request, reply) => 
    PlanetController.createPlanet(request, reply, world)
  );
}