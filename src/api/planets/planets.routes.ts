import type { FastifyInstance } from "fastify";
import type { WorldEngine } from "../../engine/world";
import { PlanetController } from "./planets.controller";

export function registerPlanetRoutes(app: FastifyInstance, world: WorldEngine): void {
  
  app.get("/api/planets/check", PlanetController.checkPlanet);
  
  // world 인스턴스를 컨트롤러로 전달하기 위한 래핑
  app.post("/api/planets", (request, reply) => 
    PlanetController.createPlanet(request, reply, world)
  );
}