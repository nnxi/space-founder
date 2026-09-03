import type { SectorIndices } from "./sector";
import type { WarpRequest, WorldEvent, Vec3 } from "./planet";

export interface TrackMeAck {
  ok: boolean;
  error?: string;
  chunkIndex?: SectorIndices;
  localPosition?: Vec3;
}

export interface ClientToServerEvents {
  "sector:subscribe_grid": (sectors: SectorIndices[]) => void;
  "sector:unsubscribe_grid": (sectors: SectorIndices[]) => void;
  "planet:warp": (
    payload: WarpRequest,
    callback: (response: WarpAck) => void,
  ) => void;
  "cheat:summon_me": (targetSector: SectorIndices) => void;
  "camera:track_me": (
    payload?: { planetId?: number },
    callback?: (response: TrackMeAck) => void
  ) => void;
}

export interface WarpAck {
  ok: boolean;
  error?: string;
  event?: WorldEvent;
}

export interface PlayerInitPayload {
  myPlanetId: number;
  currentSector?: {
    x: number;
    y: number;
    z: number;
  };
}

export interface ServerToClientEvents {
  "player:init": (payload: PlayerInitPayload) => void;
  "sector:joined": (payload: {
    room: string;
    sector: SectorIndices;
    staticPlanets: {
      planetId: number;
      planetName: string;
      userType: string;
      username: string;
      colorHex: string;
      planetType: string;
      constellationId: number;
      satellites: any[];
    }[];
  }) => void;
  "world:update": (payload: Buffer) => void;
  "world:event": (payload: WorldEvent) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  userId?: string;
  myPlanetId?: number | null; 
  subscribedSectors?: Set<string>;
}