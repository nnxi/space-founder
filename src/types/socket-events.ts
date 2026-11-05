import type { SectorIndices } from "./sector";
import type {
  PlanetRole,
  PlanetType,
  Satellite,
  Vec3,
  WorldEvent,
} from "./planet";

export interface TrackMeAck {
  ok: boolean;
  error?: string;
  chunkIndex?: SectorIndices;
  localPosition?: Vec3;
}

export interface StaticPlanetInfo {
  planetId: number;
  planetName: string;
  userType: PlanetRole;
  username: string;
  colorHex: string;
  planetType: PlanetType;
  constellationId: number;
  satellites: Satellite[];
  chunkIndex: SectorIndices;
  localPosition: Vec3;
}

export interface ClientToServerEvents {
  "sector:subscribe_grid": (sectors: SectorIndices[]) => void;
  "sector:unsubscribe_grid": (sectors: SectorIndices[]) => void;
  "camera:track_me": (
    payload?: { planetId?: number },
    callback?: (response: TrackMeAck) => void
  ) => void;
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
    staticPlanets: StaticPlanetInfo[];
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