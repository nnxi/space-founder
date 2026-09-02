import { Server, type Socket } from "socket.io";
import type { Server as HttpServer } from "node:http";
import type { WorldEngine } from "../engine/world";
import { config } from "../config";
import { encodeWorldUpdatePacket } from "../protocol/world-packet";
import type { WorldEvent } from "../types/planet";
import type { SectorIndices } from "../types/sector";
import { getSectorRoomId } from "../utils/sector";
import * as jwt from "jsonwebtoken";
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
  SocketData & { 
    myPlanetId?: number | null; 
    userId?: string;
    subscribedSectors?: Set<string>; 
  }
>;

type SpaceSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData & { 
    myPlanetId?: number | null; 
    userId?: string;
    subscribedSectors?: Set<string>; 
  }
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

  // JWT 토큰 검증 및 행성 ID 세션 매핑
  io.use(async (socket, next) => {
    try {
      let token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error("Authentication token is missing."));
      }

      if (typeof token === "string" && token.startsWith("Bearer ")) {
        token = token.split(" ")[1];
      }

      let userId: string;

      const decoded = jwt.verify(token, config.jwtSecretKey!) as JwtPayload;
      socket.data.userId = decoded.userId;

      const supabase = getSupabaseClient();
      const { data: planetRecord, error: dbError } = await supabase
        .from("user_planets")
        .select("id")
        .eq("user_id", socket.data.userId)
        .maybeSingle();

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

    socket.data.subscribedSectors = new Set<string>();

    if (myPlanetNumericId !== null && myPlanetNumericId !== undefined) {
      let currentSector = { x: 0, y: 0, z: 0 };

      const myPlanetIdString = world.getPlanetIdByNumericId(myPlanetNumericId);

      if (myPlanetIdString) {
        const myPlanet = world.getPlanet(myPlanetIdString);
        if (myPlanet && myPlanet.chunkIndex) {
          currentSector = { ...myPlanet.chunkIndex };
          
          myPlanet.isOnline = true;
        } else {
          console.warn(`[Init Warning] Planet instance missing for ID string: ${myPlanetIdString}`);
        }
      } else {
        console.warn(`[Init Warning] Could not resolve string ID for numeric ID: ${myPlanetNumericId}`);
      }

      socket.emit("player:init", { 
        myPlanetId: myPlanetNumericId,
        currentSector: currentSector
      });

      socket.on("disconnect", () => {
        if (myPlanetIdString) {
          const p = world.getPlanet(myPlanetIdString);
          if (p) {
            p.isOnline = false;
          }
        }
      });
    }

    // [중요] 비정상 종료 시에도 메모리 누수를 방지하기 위한 GC 로직
    socket.on("disconnecting", () => {
      for (const roomKey of socket.rooms) {
        if (roomKey === socket.id) continue;
        
        const room = io.sockets.adapter.rooms.get(roomKey);
        // 이 소켓이 나가면 0명이 될 예정인 방의 절차적 행성 정리
        if (room && room.size === 1) {
          world.clearProceduralPlanets(roomKey);
        }
      }
    });

    socket.on("sector:subscribe_grid", (sectors: SectorIndices[]) => {
      if (!Array.isArray(sectors)) return;
      void updateSectorSubscriptions(socket, sectors, world);
    });

    socket.on("camera:track_me", (_, callback) => {
      const myPlanetNumericId = socket.data.myPlanetId;

      if (myPlanetNumericId === null || myPlanetNumericId === undefined) {
        callback?.({ ok: false, error: "No planet assigned to user." });
        return;
      }

      const myPlanetIdString = world.getPlanetIdByNumericId(myPlanetNumericId);

      if (!myPlanetIdString) {
        callback?.({ ok: false, error: "Planet not found in world." });
        return;
      }

      const planet = world.getPlanet(myPlanetIdString);
      if (!planet) {
        callback?.({ ok: false, error: "Planet instance missing." });
        return;
      }

      callback?.({
        ok: true,
        chunkIndex: planet.chunkIndex,
        localPosition: planet.localPosition,
      });
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
  const resolveNumericId = (planetId: string) => world.getNumericPlanetId(planetId);

  for (const [roomId, planets] of groupedPlanets.entries()) {
    if (!roomId) continue;
    
    // [중요] 물리 틱 업데이트 패킷 최적화: 이동하는 유저 행성만 필터링
    const movingPlanets = planets.filter(p => p.role !== "default");
    
    if (movingPlanets.length === 0) continue;

    const packet = encodeWorldUpdatePacket(movingPlanets, timestamp, resolveNumericId);
    io.to(roomId).emit("world:update", packet);
  }
}

export function handleTickEvents(
  io: SpaceSocketServer,
  _world: WorldEngine,
  events: WorldEvent[],
): void {
  if (events.length === 0) return;
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
  const resolveNumericId = (planetId: string) => world.getNumericPlanetId(planetId);

  for (const roomId of affectedRooms) {
    if (!roomId) continue;
    
    const planets = world.getPlanetsInRoom(roomId);
    if (planets.length === 0) continue;

    // [중요] 이벤트 영향을 받은 룸 업데이트 시에도 정지된 절차적 행성은 전송 제외
    const movingPlanets = planets.filter(p => p.role !== "default");
    
    if (movingPlanets.length === 0) continue;

    const packet = encodeWorldUpdatePacket(movingPlanets, timestamp, resolveNumericId);
    io.to(roomId).emit("world:update", packet);
  }
}

async function updateSectorSubscriptions(
  socket: SpaceSocket,
  requestedSectors: SectorIndices[],
  world: WorldEngine,
): Promise<void> {
  const currentSubscribed = socket.data.subscribedSectors || new Set<string>();
  const newSubscribed = new Set<string>();

  for (const sector of requestedSectors) {
    const normalizedSector: SectorIndices = {
      x: typeof sector?.x === "string" ? parseInt(sector.x, 10) : Number(sector?.x || 0),
      y: typeof sector?.y === "string" ? parseInt(sector.y, 10) : Number(sector?.y || 0),
      z: typeof sector?.z === "string" ? parseInt(sector.z, 10) : Number(sector?.z || 0),
    };

    if (isNaN(normalizedSector.x) || isNaN(normalizedSector.y) || isNaN(normalizedSector.z)) {
      continue;
    }

    const roomKey = getSectorRoomId(normalizedSector);
    newSubscribed.add(roomKey);

    if (!currentSubscribed.has(roomKey)) {
      await socket.join(roomKey);

      const planets = world.getOrGeneratePlanetsInSector(roomKey, normalizedSector);
      
      const staticPlanets = planets.map((planet) => {
        const p = planet as any;
        const numericId = world.getNumericPlanetId(planet.id) || 0;
        
        return {
          planetId: numericId,
          planetName: p.name || planet.id || `Planet-${numericId}`,
          userType: p.role || "default",
          username: p.username || "Space Explorer",
          colorHex: p.colorHex || "#ffffff",
          planetType: p.planetType || "rocky",
          constellationId: Number(p.constellationId) || numericId,
          satellites: p.satellites || [],
          chunkIndex: p.chunkIndex,
          localPosition: p.localPosition
        };
      });

      socket.emit("sector:joined", { 
        room: roomKey, 
        sector: normalizedSector,
        staticPlanets 
      });

      // 방 진입 시 최초 1회는 이동 행성들의 위치를 보정해 주기 위해 필터링 후 패킷 전송
      const movingPlanets = planets.filter(p => p.role !== "default");
      if (movingPlanets.length > 0) {
        const packet = encodeWorldUpdatePacket(
          movingPlanets,
          Date.now(),
          (planetId) => world.getNumericPlanetId(planetId),
        );
        socket.emit("world:update", packet);
      }
    }
  }

  for (const roomKey of currentSubscribed) {
    if (!newSubscribed.has(roomKey)) {
      await socket.leave(roomKey);

      const room = socket.nsp.adapter.rooms.get(roomKey);
      if (!room || room.size === 0) {
        world.clearProceduralPlanets(roomKey);
      }
    }
  }

  socket.data.subscribedSectors = newSubscribed;
}