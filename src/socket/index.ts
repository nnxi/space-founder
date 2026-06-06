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
      const myPlanetId = world.getPlanetIdByNumericId(1);
      if (!myPlanetId) return;
      
      const myPlanet = world.getPlanet(myPlanetId);
      
      // 정적인 homeSector 대신 현재 실시간 절대 좌표를 기반으로 실제 섹터 계산
      if (myPlanet && myPlanet.position) {
        const SECTOR_SIZE = 100000;
        const realSector = {
          x: Math.floor(myPlanet.position.x / SECTOR_SIZE),
          y: Math.floor(myPlanet.position.y / SECTOR_SIZE),
          z: Math.floor(myPlanet.position.z / SECTOR_SIZE),
        };

        void joinSectorRoom(socket, realSector, world);
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
  // 엔진의 공간 해시 그리드에서 룸별로 정렬된 캐시 데이터를 O(1)로 가져옴
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
    
    // 섹터 파싱 후 배열 풀스캔을 제거하고 엔진 캐시에서 바로 조회
    const planets = world.getPlanetsInRoom(roomId);
    
    // 방에 행성이 없으면 패킷 송신 생략
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

  socket.emit("sector:joined", { room: newRoom, sector });

  // 방 입장 시 초기 데이터 역시 그리드 캐시에서 즉시 반환
  const planets = world.getPlanetsInRoom(newRoom);
  const packet = encodeWorldUpdatePacket(
    planets,
    Date.now(),
    (planetId) => world.getNumericPlanetId(planetId),
  );
  socket.emit("world:update", packet);
}