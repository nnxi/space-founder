import type { SectorIndices } from "./sector";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type UserPlanetType = "rocky" | "gaseous" | "icy";

// 절차적 천체를 모두 포함하는 확장 타입
export type PlanetType = UserPlanetType | "lava" | "star";

// 행성의 역할을 명확히 구분
export type PlanetRole = "user" | "default";

// 위성 데이터 인터페이스 정의
export interface Satellite {
  id: number;
  orbit_radius: number;
  orbit_speed: number;
  orbit_inclination: number;
}

export interface Planet {
  // 기본 식별 정보
  id: string;
  name?: string;
  userId?: string;
  
  // 공간 및 물리 정보
  chunkIndex: SectorIndices;
  localPosition: Vec3;
  velocity: Vec3;
  homeSector?: SectorIndices;
  
  // 렌더링 및 메타데이터
  radius: number;
  constellationId: number;
  planetType: PlanetType;
  colorHex: string;
  username: string;
  
  // 상태 및 하위 객체
  role: PlanetRole;
  isOnline?: boolean;
  satellites?: Satellite[];
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