import type { SectorIndices } from "./sector";
import type { WarpRequest, WorldEvent } from "./planet";

export interface ClientToServerEvents {
  "sector:join": (sector: SectorIndices) => void;
  "sector:update": (sector: SectorIndices) => void;
  "planet:warp": (
    payload: WarpRequest,
    callback: (response: WarpAck) => void,
  ) => void;
}

export interface WarpAck {
  ok: boolean;
  error?: string;
  event?: WorldEvent;
}

export interface PlayerInitPayload {
  myPlanetId: number;
}

export interface ServerToClientEvents {
  "player:init": (payload: PlayerInitPayload) => void;
  "sector:joined": (payload: {
    room: string;
    sector: SectorIndices;
  }) => void;
  "world:update": (payload: Buffer) => void;
  "world:event": (payload: WorldEvent) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  sectorRoom: string | null;
}
