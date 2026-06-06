import type { SectorIndices } from "./sector";
import type { Vec3, WarpRequest, WorldEvent } from "./planet";

export interface ClientToServerEvents {
  "sector:update": (position: Vec3) => void;
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

export interface ServerToClientEvents {
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
