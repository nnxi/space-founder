import type { SectorIndices } from "./sector";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// 행성의 외형 타입을 결정하는 리터럴 타입 추가
export type PlanetType = "rocky" | "gaseous" | "icy";

export interface Planet {
  id: string;
  position: Vec3;
  velocity: Vec3;
  warpAuthorized: boolean;
  homeSector?: SectorIndices;
  radius: number;
  constellationId: number;
  planetType: PlanetType;
  colorHex: string;
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