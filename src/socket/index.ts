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
  StaticPlanetInfo,
} from "../types/socket-events";

const getUserRoomId = (numericPlanetId: number) => `user_${numericPlanetId}`;

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

      // 내 행성만 DB에서 로드해 메모리에 올림 (없으면 관전자)
      socket.data.myPlanetId = await world.loadUserPlanet(decoded.userId);

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
          console.log(`[Debug] Planet ID ${myPlanetNumericId} chunkIndex:`, myPlanet.chunkIndex);
          currentSector = { ...myPlanet.chunkIndex };
        } else {
          console.warn(`[Init Warning] Planet instance missing for ID string: ${myPlanetIdString}`);
        }
      } else {
        console.warn(`[Init Warning] Could not resolve string ID for numeric ID: ${myPlanetNumericId}`);
      }

      // 다중 탭 대비: 같은 유저의 마지막 소켓이 끊길 때만 행성을 내림
      void socket.join(getUserRoomId(myPlanetNumericId));

      socket.emit("player:init", { 
        myPlanetId: myPlanetNumericId,
        currentSector: currentSector
      });
    }

    // 정상/비정상(브라우저 종료, ping timeout) 종료 모두 disconnect로 들어옴
    socket.on("disconnect", () => {
      for (const roomKey of socket.data.subscribedSectors ?? []) {
        world.releaseSector(roomKey);
      }
      socket.data.subscribedSectors?.clear();

      if (
        myPlanetNumericId !== null &&
        myPlanetNumericId !== undefined &&
        !io.sockets.adapter.rooms.has(getUserRoomId(myPlanetNumericId))
      ) {
        world.unloadUserPlanet(myPlanetNumericId);
      }
    });

    // 클라이언트의 명시적인 구독 요청 처리
    socket.on("sector:subscribe_grid", (sectors: SectorIndices[]) => {
      if (!Array.isArray(sectors)) return;
      handleSubscribeSectors(socket, sectors, world);
    });

    // 클라이언트의 명시적인 구독 해제 요청 처리
    socket.on("sector:unsubscribe_grid", (sectors: SectorIndices[]) => {
      if (!Array.isArray(sectors)) return;
      handleUnsubscribeSectors(socket, sectors, world);
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

    const movingPlanets = planets.filter(p => p.role !== "default");
    if (movingPlanets.length === 0) continue;

    const packet = encodeWorldUpdatePacket(movingPlanets, timestamp, resolveNumericId);
    io.to(roomId).emit("world:update", packet);
  }
}

// 구독/해제는 await 없이 동기로 처리: 구독 집합 갱신과 refcount 증감이 한 틱에 끝나 순서 역전이 없음
function handleSubscribeSectors(
  socket: SpaceSocket,
  requestedSectors: SectorIndices[],
  world: WorldEngine,
): void {
  if (!socket.data.subscribedSectors) {
    socket.data.subscribedSectors = new Set<string>();
  }

  for (const sector of requestedSectors) {
    const normalizedSector: SectorIndices = {
      x: typeof sector?.x === "string" ? parseInt(sector.x, 10) : Number(sector?.x || 0),
      y: typeof sector?.y === "string" ? parseInt(sector.y, 10) : Number(sector?.y || 0),
      z: typeof sector?.z === "string" ? parseInt(sector.z, 10) : Number(sector?.z || 0),
    };

    if (isNaN(normalizedSector.x) || isNaN(normalizedSector.y) || isNaN(normalizedSector.z)) continue;

    const roomKey = getSectorRoomId(normalizedSector);

    if (socket.data.subscribedSectors.has(roomKey)) continue;

    socket.data.subscribedSectors.add(roomKey);
    void socket.join(roomKey);

    const planets = world.acquireSector(roomKey, normalizedSector);
    
    const staticPlanets: StaticPlanetInfo[] = planets.map((planet) => {
      const numericId = world.getNumericPlanetId(planet.id) || 0;
      
      return {
        planetId: numericId,
        planetName: planet.name || planet.id || `Planet-${numericId}`,
        userType: planet.role,
        username: planet.username,
        colorHex: planet.colorHex,
        planetType: planet.planetType,
        constellationId: Number(planet.constellationId) || numericId,
        satellites: planet.satellites ?? [],
        chunkIndex: planet.chunkIndex,
        localPosition: planet.localPosition
      };
    });

    socket.emit("sector:joined", { 
      room: roomKey, 
      sector: normalizedSector,
      staticPlanets 
    });

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

// 새롭게 추가된 구독 해제 함수
function handleUnsubscribeSectors(
  socket: SpaceSocket,
  requestedSectors: SectorIndices[],
  world: WorldEngine,
): void {
  if (!socket.data.subscribedSectors) return;

  for (const sector of requestedSectors) {
    const normalizedSector: SectorIndices = {
      x: typeof sector?.x === "string" ? parseInt(sector.x, 10) : Number(sector?.x || 0),
      y: typeof sector?.y === "string" ? parseInt(sector.y, 10) : Number(sector?.y || 0),
      z: typeof sector?.z === "string" ? parseInt(sector.z, 10) : Number(sector?.z || 0),
    };

    if (isNaN(normalizedSector.x) || isNaN(normalizedSector.y) || isNaN(normalizedSector.z)) continue;

    const roomKey = getSectorRoomId(normalizedSector);

    if (socket.data.subscribedSectors.has(roomKey)) {
      socket.data.subscribedSectors.delete(roomKey);
      void socket.leave(roomKey);
      world.releaseSector(roomKey);
    }
  }
}