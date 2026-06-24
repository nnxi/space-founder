import { Server, type Socket } from "socket.io";
import type { Server as HttpServer } from "node:http";
import { executeWarp } from "../api/warp";
import type { WorldEngine } from "../engine/world";
import { config } from "../config";
import { encodeWorldUpdatePacket } from "../protocol/world-packet";
import type { WorldEvent } from "../types/planet";
import type { SectorIndices } from "../types/sector";
import { getSectorRoomId } from "../utils/sector";
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
  SocketData & { myPlanetId?: number | null }
>;

type SpaceSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData & { myPlanetId?: number | null }
>;

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

  // 소켓 미들웨어: 연결 및 재연결 시마다 실행
  // JWT 토큰 검증 및 행성 ID 세션 매핑
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error("Authentication token is missing."));
      }

      const supabase = getSupabaseClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);

      if (authError || !user) {
        return next(new Error("Invalid authentication token."));
      }

      // DB에서 행성 ID 조회 및 소켓 세션 데이터에 주입
      const { data: planetRecord, error: dbError } = await supabase
        .from("user_planets")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (dbError || !planetRecord) {
        socket.data.myPlanetId = null; // 관전자 모드
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

    // 연결 시 서버 기준의 최신 행성 위치를 프론트엔드로 전달
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

    socket.on("sector:join", handleSectorJoin);
    socket.on("sector:update", handleSectorJoin);
    
    (socket as any).on("cheat:summon_me", (targetSector: SectorIndices) => {
      if (!myPlanetNumericId) return;

      const myPlanetId = world.getPlanetIdByNumericId(myPlanetNumericId);
      if (!myPlanetId) return;

      const event = world.warpPlanet({
        planetId: myPlanetId,
        targetSectorX: targetSector.x,
        targetSectorY: targetSector.y,
        targetSectorZ: targetSector.z,
      });

      publishWorldEvents(io, world, [event]);
    });

    (socket as any).on("camera:track_me", (payload: { planetId?: number } | undefined, callback: unknown) => {
      const targetNumericId = payload?.planetId ?? myPlanetNumericId;
      
      if (!targetNumericId) {
        if (typeof callback === "function") callback({ ok: false, error: "No target planet specified" });
        return;
      }
      
      const targetPlanetId = world.getPlanetIdByNumericId(targetNumericId);
      
      if (!targetPlanetId) {
        if (typeof callback === "function") callback({ ok: false, error: "Planet not found in engine" });
        return;
      }
      
      const targetPlanet = world.getPlanet(targetPlanetId);
      
      if (targetPlanet && targetPlanet.position) {
        const SECTOR_SIZE = 100000;
        const realSector = {
          x: Math.floor(targetPlanet.position.x / SECTOR_SIZE),
          y: Math.floor(targetPlanet.position.y / SECTOR_SIZE),
          z: Math.floor(targetPlanet.position.z / SECTOR_SIZE),
        };

        void joinSectorRoom(socket, realSector, world);

        if (typeof callback === "function") {
          callback({ ok: true, position: targetPlanet.position });
        }
      } else {
        if (typeof callback === "function") callback({ ok: false, error: "Planet position unavailable" });
      }
    });

    socket.on("planet:warp", (payload, callback) => {
      if (!myPlanetNumericId) {
         if (typeof callback === "function") callback({ ok: false, error: "Spectators cannot warp" });
         return;
      }

      const myPlanetId = world.getPlanetIdByNumericId(myPlanetNumericId);
      if (!myPlanetId) {
        if (typeof callback === "function") callback({ ok: false, error: "Player planet not found in engine" });
        return;
      }

      const p = payload as any;
      const SECTOR_SIZE = 100000;

      const targetSectorX = Math.floor(Number(p.x || 0) / SECTOR_SIZE);
      const targetSectorY = Math.floor(Number(p.y || 0) / SECTOR_SIZE);
      const targetSectorZ = Math.floor(Number(p.z || 0) / SECTOR_SIZE);

      const validPayload = {
        planetId: myPlanetId,
        targetSectorX,
        targetSectorY,
        targetSectorZ,
      };

      const ack = executeWarp(world, validPayload);

      if (ack.ok) {
        publishWorldEvents(io, world, [ack.event]);
      }

      if (typeof callback === "function") {
        callback(ack);
      }
    });
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

  // 정적 데이터를 추출하여 sector:joined 패킷에 함께 전송
  const staticPlanets = planets.map((planet) => {
    const p = planet as any;
    const numericId = world.getNumericPlanetId(planet.id) || 0;
    
    return {
      id: numericId,
      name: p.name || planet.id || `Planet-${numericId}`,
      colorHex: p.colorHex || "#ffffff",
      planetType: p.planetType || "rocky",
      constellationId: Number(p.constellationId) || numericId,
      // 추후 위성 데이터가 추가될 배열 공간
      satellites: p.satellites || [] 
    };
  });

  socket.emit("sector:joined", { 
    room: newRoom, 
    sector,
    staticPlanets 
  });

  // 구역 입장 직후 동적 패킷(좌표, 속도) 최초 1회 전송
  const packet = encodeWorldUpdatePacket(
    planets,
    Date.now(),
    (planetId) => world.getNumericPlanetId(planetId),
  );
  socket.emit("world:update", packet);
}