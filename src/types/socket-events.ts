import type { SectorIndices } from "./sector";
import type { WarpRequest, WorldEvent } from "./planet";

// 새로 추가된 카메라 트래킹 응답 타입
export interface TrackMeAck {
  ok: boolean;
  error?: string;
  position?: { x: number; y: number; z: number };
}

export interface ClientToServerEvents {
  "sector:join": (sector: SectorIndices) => void;
  "sector:update": (sector: SectorIndices) => void;
  "planet:warp": (
    payload: WarpRequest,
    callback: (response: WarpAck) => void,
  ) => void;
  
  // 💡 누락되었던 프론트엔드 호출 이벤트 추가
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
      id: number;
      name: string;
      colorHex: string;
      planetType: string;
      constellationId: number;
      satellites: any[]; // 나중에 위성 타입이 구체화되면 변경할 수 있도록 any[] 처리
    }[];
  }) => void;
  "world:update": (payload: Buffer) => void;
  "world:event": (payload: WorldEvent) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  sectorRoom: string | null;
  // 💡 기존 index.ts에서 강제로 병합하던 유저 세션 데이터 추가
  myPlanetId?: number | null; 
}