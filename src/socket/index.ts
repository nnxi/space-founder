import { Server, type Socket } from "socket.io";
import type { Server as HttpServer } from "node:http";
import { parseWarpPayload } from "../api/warp";
import type { WorldEngine } from "../engine/world";
import { config } from "../config";
import { encodeWorldUpdatePacket } from "../protocol/world-packet";
import type { Vec3, WorldEvent } from "../types/planet";
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
  WarpAck,
} from "../types/socket-events";
import {
  filterPlanetsInSector,
  getSectorIndices,
  getSectorRoomId,
  getSectorRoomIdFromPosition,
  groupPlanetsBySectorRoom,
  isValidVec3,
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

  io.on("connection", (socket) => {
    socket.data.sectorRoom = null;

    socket.on("sector:update", (position) => {
      if (!isValidVec3(position)) {
        return;
      }

      void switchSector(socket, position, world);
    });

    socket.on("planet:warp", (payload, callback) => {
      const ack = executeWarp(world, payload);

      if (ack.ok && ack.event) {
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

    io.to(fromRoom).to(toRoom).emit("world:event", event);
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
    const sector = parseSectorFromRoomId(roomId);
    const planets = filterPlanetsInSector(world.getPlanets(), sector);
    const packet = encodeWorldUpdatePacket(planets, timestamp, resolveNumericId);
    io.to(roomId).emit("world:update", packet);
  }
}

function parseSectorFromRoomId(roomId: string): {
  x: number;
  y: number;
  z: number;
} {
  const [, sx, sy, sz] = roomId.split("_");

  return {
    x: Number(sx),
    y: Number(sy),
    z: Number(sz),
  };
}

async function switchSector(
  socket: SpaceSocket,
  position: Vec3,
  world: WorldEngine,
): Promise<void> {
  const newRoom = getSectorRoomIdFromPosition(position);
  const previousRoom = socket.data.sectorRoom;

  if (previousRoom === newRoom) {
    return;
  }

  if (previousRoom) {
    await socket.leave(previousRoom);
  }

  await socket.join(newRoom);
  socket.data.sectorRoom = newRoom;

  const sector = getSectorIndices(position);
  socket.emit("sector:joined", { room: newRoom, sector });

  const planets = filterPlanetsInSector(world.getPlanets(), sector);
  const packet = encodeWorldUpdatePacket(
    planets,
    Date.now(),
    (planetId) => world.getNumericPlanetId(planetId),
  );
  socket.emit("world:update", packet);
}

function executeWarp(
  world: WorldEngine,
  payload: unknown,
): WarpAck {
  const warpRequest = parseWarpPayload(payload);

  if (!warpRequest) {
    return { ok: false, error: "Invalid warp payload" };
  }

  try {
    const event = world.warpPlanet(warpRequest);
    return { ok: true, event };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Warp transaction failed";

    return { ok: false, error: message };
  }
}
