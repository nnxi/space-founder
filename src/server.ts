import Fastify from "fastify";
import cors from "@fastify/cors";
import { registerWarpRoutes } from "./api/warp";
import { registerPlanetRoutes } from "./api/planets";
import { registerSatelliteRoutes } from "./api/satellites";
import { registerUserRoutes } from "./api/users"
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

  // Cross-Origin Resource Sharing 차단 문제 해결을 위한 전역 허용 플러그인 등록
  await app.register(cors, {
    origin: true
  });

  // 기본 헬스체크 라우트 등록
  app.get("/health", async () => ({
    status: "ok",
    planetCount: world.getPlanets().size,
  }));

  // 워프 트리거 HTTP API 라우트 등록
  registerWarpRoutes(app, world, (event) => {
    if (io) publishWorldEvents(io, world, [event]);
  });

  // 행성 생성 HTTP API 라우트 등록
  registerPlanetRoutes(app, world);

  // 위성 생성 HTTP API 라우트 등록
  registerSatelliteRoutes(app, world);

  // 유저 관련 HTTP API
  registerUserRoutes(app);

  // Fastify HTTP 서버 가동
  await app.listen({ port: config.port, host: config.host });

  // HTTP 서버 가동 완료 후 의존성 바인딩 및 물리 루프 가동
  const io = attachSocketServer(app.server, world);

  world.start((planets, events) => {
    broadcastSectorUpdates(io, world);
    handleTickEvents(io, world, events);
  });

  return { app, io };
}