import Fastify from "fastify";
import { registerWarpRoutes } from "./api/warp";
import type { WorldEngine } from "./engine/world";
import { config } from "./config";
import {
  attachSocketServer,
  broadcastSectorUpdates,
  handleTickEvents,
  publishWorldEvents,
  type SpaceSocketServer,
} from "./socket";

export interface AppContext {
  app: ReturnType<typeof Fastify>;
  io: SpaceSocketServer;
}

export async function createServer(world: WorldEngine): Promise<AppContext> {
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({
    status: "ok",
    planetCount: world.getPlanets().size,
  }));

  await app.listen({ port: config.port, host: config.host });

  const io = attachSocketServer(app.server, world);

  registerWarpRoutes(app, world, (event) => {
    publishWorldEvents(io, world, [event]);
  });

  world.start((planets, events) => {
    broadcastSectorUpdates(io, world);
    handleTickEvents(io, world, events);
  });

  return { app, io };
}
