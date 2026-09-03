import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import path from "path";
import { registerPlanetRoutes } from "./api/planets/planets.routes";
import { registerSatelliteRoutes } from "./api/satellites/satellites.routes";
import { registerUserRoutes } from "./api/users/users.routes";
import type { WorldEngine } from "./engine/world";
import { config } from "./config";
import {
  attachSocketServer,
  broadcastSectorUpdates,
  handleTickEvents,
  type SpaceSocketServer,
} from "./socket";

export interface AppContext {
  app: ReturnType<typeof Fastify>;
  io: SpaceSocketServer;
}

export async function createServer(world: WorldEngine): Promise<AppContext> {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: true
  });

  // 유니티 WebGL 정적 파일 서빙 설정
  await app.register(fastifyStatic, {
    root: path.join(process.cwd(), "public"),
    prefix: "/", 
  });

  app.get("/health", async () => ({
    status: "ok",
  }));

  registerPlanetRoutes(app, world);
  registerSatelliteRoutes(app, world);
  registerUserRoutes(app);

  await app.listen({ port: config.port, host: "0.0.0.0" });

  const io = attachSocketServer(app.server, world);

  world.start((planets, events) => {
    broadcastSectorUpdates(io, world);
    handleTickEvents(io, world, events);
  });

  return { app, io };
}