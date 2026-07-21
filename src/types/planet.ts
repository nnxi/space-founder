import type { SectorIndices } from "./sector";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// 행성의 외형 타입을 결정하는 리터럴 타입
export type PlanetType = "rocky" | "gaseous" | "icy";

export interface Planet {
  id: string;
  
  // 절대 좌표(position) 대신 청크 인덱스와 로컬 좌표 사용
  chunkIndex: SectorIndices;
  localPosition: Vec3;
  velocity: Vec3;
  
  warpAuthorized: boolean;
  homeSector?: SectorIndices;
  radius: number;
  constellationId: number;
  planetType: PlanetType;
  colorHex: string;
  username: string;
}

export interface WarpRequest {
  planetId: string;
  targetSectorX: number;
  targetSectorY: number;
  targetSectorZ: number;
}

export type WorldEventType = "rebirth" | "warp";

export interface WorldEvent {
  type: WorldEventType;
  planetId: string;
  fromSector: SectorIndices;
  toSector: SectorIndices;
}