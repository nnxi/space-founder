import { Server, type Socket } from "socket.io";
import type { Server as HttpServer } from "node:http";
import { executeWarp } from "../api/warp";
import type { WorldEngine } from "../engine/world";
import { config } from "../config";
import { encodeWorldUpdatePacket } from "../protocol/world-packet";
import type { WorldEvent } from "../types/planet";
import type { SectorIndices } from "../types/sector";
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from "../types/socket-events";
import {
  filterPlanetsInSector,
  getSectorRoomId,
  groupPlanetsBySectorRoom,
  isValidSectorIndices,
} from "../utils/sector";

export type SpaceSocketServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

type SpaceSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
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

  // 백엔드 물리 WorldEngine의 주기에 맞춰 모든 청크 룸에 실시간 스냅샷 패킷 스트리밍 바인딩
  world.start((_, events) => {
    // 매 틱마다 변경된 행성들의 좌표 데이터를 전용 소켓 룸으로 실시간 밀어내기
    broadcastSectorUpdates(io, world);
    
    if (events.length > 0) {
      emitWorldEvents(io, events);
    }
  });

  io.on("connection", (socket) => {
    socket.data.sectorRoom = null;
    socket.emit("player:init", { myPlanetId: 1 });

    const handleSectorJoin = (sector: SectorIndices): void => {
      // 프론트엔드에서 넘어온 페이로드 정수 안전 타입 캐스팅 가드
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
      const myPlanetId = world.getPlanetIdByNumericId(1);
      if (!myPlanetId) return;

      const event = world.warpPlanet({
        planetId: myPlanetId,
        targetSectorX: targetSector.x,
        targetSectorY: targetSector.y,
        targetSectorZ: targetSector.z,
      });

      publishWorldEvents(io, world, [event]);
    });

    // TS 타입 검사 우회를 위해 any 캐스팅 사용
    (socket as any).on("camera:track_me", () => {
      // 1. 내 1번 행성의 ID와 물리적 데이터 가져오기
      const myPlanetId = world.getPlanetIdByNumericId(1);
      if (!myPlanetId) return;
      
      const myPlanet = world.getPlanet(myPlanetId);
      if (myPlanet && myPlanet.homeSector) {
        // 2. 내 행성이 위치한 청크 룸으로 소켓 세션을 즉시 이동
        void joinSectorRoom(socket, myPlanet.homeSector, world);
      }
    });

    socket.on("planet:warp", (payload, callback) => {
      const ack = executeWarp(world, payload);

      if (ack.ok) {
        publishWorldEvents(io, world, [ack.event]);
      }

      callback(ack);
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
  const groupedPlanets = groupPlanetsBySectorRoom(world.getPlanets());
  const timestamp = Date.now();
  const resolveNumericId = (planetId: string) =>
    world.getNumericPlanetId(planetId);

  for (const [roomId, planets] of groupedPlanets) {
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
    const sector = parseSectorFromRoomId(roomId);
    
    if (isNaN(sector.x) || isNaN(sector.y) || isNaN(sector.z)) {
      continue;
    }

    const planets = filterPlanetsInSector(world.getPlanets(), sector);
    const packet = encodeWorldUpdatePacket(planets, timestamp, resolveNumericId);
    io.to(roomId).emit("world:update", packet);
  }
}

function parseSectorFromRoomId(roomId: string): SectorIndices {
  if (!roomId || !roomId.includes("_")) {
    return { x: 0, y: 0, z: 0 };
  }
  
  const parts = roomId.split("_");
  return {
    x: Number(parts[1] || 0),
    y: Number(parts[2] || 0),
    z: Number(parts[3] || 0),
  };
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

  socket.emit("sector:joined", { room: newRoom, sector });

  const planets = filterPlanetsInSector(world.getPlanets(), sector);
  const packet = encodeWorldUpdatePacket(
    planets,
    Date.now(),
    (planetId) => world.getNumericPlanetId(planetId),
  );
  socket.emit("world:update", packet);
}