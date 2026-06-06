import { config } from "../config";
import type { Planet, Vec3 } from "../types/planet";
import type { SectorIndices } from "../types/sector";
import { isValidSectorIndex } from "./sector-geometry";

export function getSectorIndices(position: Vec3, sectorSize = config.sectorSize): SectorIndices {
  return {
    x: Math.floor(position.x / sectorSize),
    y: Math.floor(position.y / sectorSize),
    z: Math.floor(position.z / sectorSize),
  };
}

export function getSectorRoomId(sector: SectorIndices): string {
  return `sector_${sector.x}_${sector.y}_${sector.z}`;
}

export function getSectorRoomIdFromPosition(position: Vec3): string {
  return getSectorRoomId(getSectorIndices(position));
}

// 공간 해시 그리드: 행성의 위치를 기반으로 소켓 룸 분배 연산을 O(1)로 최적화
export class SpatialGrid {
  private readonly grid = new Map<string, Map<string, Planet>>();
  private readonly planetRooms = new Map<string, string>();

  updatePlanet(planet: Planet): void {
    const newRoomId = getSectorRoomIdFromPosition(planet.position);
    const oldRoomId = this.planetRooms.get(planet.id);

    if (oldRoomId === newRoomId) {
      return;
    }

    if (oldRoomId) {
      const oldRoom = this.grid.get(oldRoomId);
      if (oldRoom) {
        oldRoom.delete(planet.id);
        if (oldRoom.size === 0) {
          this.grid.delete(oldRoomId);
        }
      }
    }

    let newRoom = this.grid.get(newRoomId);
    if (!newRoom) {
      newRoom = new Map<string, Planet>();
      this.grid.set(newRoomId, newRoom);
    }

    newRoom.set(planet.id, planet);
    this.planetRooms.set(planet.id, newRoomId);
  }

  removePlanet(planetId: string): void {
    const roomId = this.planetRooms.get(planetId);
    if (roomId) {
      const room = this.grid.get(roomId);
      if (room) {
        room.delete(planetId);
        if (room.size === 0) {
          this.grid.delete(roomId);
        }
      }
      this.planetRooms.delete(planetId);
    }
  }

  getPlanetsInRoom(roomId: string): Planet[] {
    const room = this.grid.get(roomId);
    return room ? Array.from(room.values()) : [];
  }

  getAllRooms(): Map<string, Planet[]> {
    const result = new Map<string, Planet[]>();
    for (const [roomId, roomMap] of this.grid.entries()) {
      result.set(roomId, Array.from(roomMap.values()));
    }
    return result;
  }

  clear(): void {
    this.grid.clear();
    this.planetRooms.clear();
  }
}

export function isValidSectorIndices(value: unknown): value is SectorIndices {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    isValidSectorIndex(candidate.x) &&
    isValidSectorIndex(candidate.y) &&
    isValidSectorIndex(candidate.z)
  );
}

export function isValidVec3(value: unknown): value is Vec3 {
  if (typeof value !== "object" || value === null) return false;

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.x === "number" &&
    typeof candidate.y === "number" &&
    typeof candidate.z === "number" &&
    Number.isFinite(candidate.x) &&
    Number.isFinite(candidate.y) &&
    Number.isFinite(candidate.z)
  );
}