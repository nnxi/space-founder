import type { FastifyInstance } from "fastify";
import type { WorldEngine } from "../../engine/world";
import { SatelliteController } from "./satellites.controller";

export function registerSatelliteRoutes(app: FastifyInstance, world: WorldEngine): void {
  
  // world 인스턴스를 주입하여 컨트롤러 호출
  app.post("/api/satellites", (request, reply) => 
    SatelliteController.createSatellite(request, reply, world)
  );
}