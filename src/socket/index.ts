import { Server, type Socket } from "socket.io";
import type { Server as HttpServer } from "node:http";
import type { WorldEngine } from "../engine/world";
import { config } from "../config";
import { encodeWorldUpdatePacket } from "../protocol/world-packet";
import type { WorldEvent } from "../types/planet";
import type { SectorIndices } from "../types/sector";
import { getSectorRoomId } from "../utils/sector";
import * as jwt from "jsonwebtoken"; // 💡 JWT 라이브러리 추가
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from "../types/socket-events";

import { getSupabaseClient } from "../db/supabase"; 

export type SpaceSocketServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData & { myPlanetId?: number | null; userId?: string } // 💡 userId 타입 추가
>;

type SpaceSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData & { myPlanetId?: number | null; userId?: string } // 💡 userId 타입 추가
>;

interface JwtPayload {
  userId: string;
  email: string;
}

export function attachSocketServer(
  httpServer: HttpServer,
  world: WorldEngine,
): SpaceSocketServer {
  const io: SpaceSocketServer = new Server(httpServer, {
    cors: {
      origin: config.corsOrigin,
      methods: ["GET", "POST"],
    },
  });

  world.start((_, events) => {
    broadcastSectorUpdates(io, world);
    
    if (events.length > 0) {
      emitWorldEvents(io, events);
    }
  });

  // 💡 소켓 미들웨어: 자체 JWT 토큰 검증 및 행성 ID 세션 매핑 완료
  io.use(async (socket, next) => {
    try {
      let token = socket.handshake.auth.token;

      console.log("[DEBUG] 소켓 들어오는 토큰 확인:", token);

      if (!token) {
        return next(new Error("Authentication token is missing."));
      }

      // Bearer 접두사가 포함되어 있으면 분리하고, 없으면 전달받은 토큰을 그대로 사용
      if (typeof token === "string" && token.startsWith("Bearer ")) {
        token = token.split(" ")[1];
      }

      // 1. 자체 JWT 시크릿 키 검증 및 복호화
      const decoded = jwt.verify(token, config.jwtSecretKey!) as JwtPayload;
      
      // 소켓 데이터 세션에 가입된 유저 고유 ID 바인딩
      socket.data.userId = decoded.userId;

      // 2. 가입된 유저 ID 기반으로 내 행성 보유 여부 직접 조회
      const supabase = getSupabaseClient();
      const { data: planetRecord, error: dbError } = await supabase
        .from("user_planets")
        .select("id")
        .eq("user_id", decoded.userId)
        .maybeSingle(); // 한 건만 안전하게 수신

      if (dbError || !planetRecord) {
        socket.data.myPlanetId = null; 
      } else {
        socket.data.myPlanetId = planetRecord.id;
      }

      next();
    } catch (error) {
      console.error("[Socket Auth Error]", error);
      next(new Error("Internal server error during authentication."));
    }
  });

  io.on("connection", (socket) => {
    const myPlanetNumericId = socket.data.myPlanetId;

    console.log(`[Socket Connected] User Planet ID:`, myPlanetNumericId || "Spectator");

    socket.data.sectorRoom = null;

    if (myPlanetNumericId !== null && myPlanetNumericId !== undefined) {
      let currentSector = { x: 0, y: 0, z: 0 };
      const myPlanetIdString = world.getPlanetIdByNumericId(myPlanetNumericId);
      
      if (myPlanetIdString) {
        const myPlanet = world.getPlanet(myPlanetIdString);
        if (myPlanet && myPlanet.position) {
          const SECTOR_SIZE = 100000;
          currentSector = {
            x: Math.floor(myPlanet.position.x / SECTOR_SIZE),
            y: Math.floor(myPlanet.position.y / SECTOR_SIZE),
            z: Math.floor(myPlanet.position.z / SECTOR_SIZE),
          };
        }
      }

      socket.emit("player:init", { 
        myPlanetId: myPlanetNumericId,
        currentSector: currentSector
      });
    }

    const handleSectorJoin = (sector: SectorIndices): void => {
      const normalizedSector: SectorIndices = {
        x: typeof sector?.x === "string" ? parseInt(sector.x, 10) : Number(sector?.x || 0),
        y: typeof sector?.y === "string" ? parseInt(sector.y, 10) : Number(sector?.y || 0),
        z: typeof sector?.z === "string" ? parseInt(sector.z, 10) : Number(sector?.z || 0),
      };

      if (isNaN(normalizedSector.x) || isNaN(normalizedSector.y) || isNaN(normalizedSector.z)) {
        return;
      }

      void joinSectorRoom(socket, normalizedSector, world);
    };

    socket.on("sector:update", handleSectorJoin);
  });

  return io;
}

export function publishWorldEvents(
  io: SpaceSocketServer,
  world: WorldEngine,
  events: WorldEvent[],
): void {
  emitWorldEvents(io, events);
  broadcastAffectedSectorUpdates(io, world, events);
}

export function broadcastSectorUpdates(
  io: SpaceSocketServer,
  world: WorldEngine,
): void {
  const groupedPlanets = world.getAllRooms();
  const timestamp = Date.now();
  const resolveNumericId = (planetId: string) =>
    world.getNumericPlanetId(planetId);

  for (const [roomId, planets] of groupedPlanets.entries()) {
    if (!roomId) continue;
    const packet = encodeWorldUpdatePacket(planets, timestamp, resolveNumericId);
    io.to(roomId).emit("world:update", packet);
  }
}

export function handleTickEvents(
  io: SpaceSocketServer,
  _world: WorldEngine,
  events: WorldEvent[],
): void {
  if (events.length === 0) {
    return;
  }

  emitWorldEvents(io, events);
}

function emitWorldEvents(
  io: SpaceSocketServer,
  events: WorldEvent[],
): void {
  for (const event of events) {
    const fromRoom = getSectorRoomId(event.fromSector);
    const toRoom = getSectorRoomId(event.toSector);

    if (fromRoom) io.to(fromRoom).emit("world:event", event);
    if (toRoom && toRoom !== fromRoom) io.to(toRoom).emit("world:event", event);
  }
}

function broadcastAffectedSectorUpdates(
  io: SpaceSocketServer,
  world: WorldEngine,
  events: WorldEvent[],
): void {
  const affectedRooms = new Set<string>();

  for (const event of events) {
    affectedRooms.add(getSectorRoomId(event.fromSector));
    affectedRooms.add(getSectorRoomId(event.toSector));
  }

  const timestamp = Date.now();
  const resolveNumericId = (planetId: string) =>
    world.getNumericPlanetId(planetId);

  for (const roomId of affectedRooms) {
    if (!roomId) continue;
    
    const planets = world.getPlanetsInRoom(roomId);
    if (planets.length === 0) continue;

    const packet = encodeWorldUpdatePacket(planets, timestamp, resolveNumericId);
    io.to(roomId).emit("world:update", packet);
  }
}

async function joinSectorRoom(
  socket: SpaceSocket,
  sector: SectorIndices,
  world: WorldEngine,
): Promise<void> {
  const newRoom = getSectorRoomId(sector);
  const previousRoom = socket.data.sectorRoom;

  if (previousRoom && previousRoom !== newRoom) {
    await socket.leave(previousRoom);
  }

  if (socket.data.sectorRoom !== newRoom) {
    await socket.join(newRoom);
    socket.data.sectorRoom = newRoom;
  }

  const planets = world.getPlanetsInRoom(newRoom);

  const staticPlanets = planets.map((planet) => {
    const p = planet as any;
    const numericId = world.getNumericPlanetId(planet.id) || 0;
    
    return {
      id: numericId,
      name: p.name || planet.id || `Planet-${numericId}`,
      username: p.username || "Space Explorer",
      colorHex: p.colorHex || "#ffffff",
      planetType: p.planetType || "rocky",
      constellationId: Number(p.constellationId) || numericId,
      satellites: p.satellites || [] 
    };
  });

  socket.emit("sector:joined", { 
    room: newRoom, 
    sector,
    staticPlanets 
  });

  const packet = encodeWorldUpdatePacket(
    planets,
    Date.now(),
    (planetId) => world.getNumericPlanetId(planetId),
  );
  socket.emit("world:update", packet);
}