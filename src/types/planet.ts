import type { SectorIndices } from "./sector";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Planet {
  id: string;
  position: Vec3;
  velocity: Vec3;
  warpAuthorized: boolean;
  homeSector: SectorIndices;
  constellationId: number;
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
