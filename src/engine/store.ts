import type { Planet } from "../types/planet";
import type { SectorIndices } from "../types/sector";
import { SpatialGrid } from "../utils/sector";

// 행성 데이터와 공간 해시 그리드를 통합 관리하는 상태 저장소
export class PlanetStore {
  private readonly planets = new Map<string, Planet>();
  private readonly idToNumeric = new Map<string, number>();
  
  // 숫자 ID 기반 조회를 위한 단일 맵 (분기 처리 제거)
  private readonly numericToId = new Map<number, string>();
  
  private readonly grid = new SpatialGrid();

  // 물리 연산 대상(접속 중인 유저 행성) 목록: 틱 루프는 전체 Map 대신 이 Set만 순회
  private readonly activePlanetIds = new Set<string>();

  clear(): void {
    this.planets.clear();
    this.idToNumeric.clear();
    this.numericToId.clear();
    this.activePlanetIds.clear();
    this.grid.clear();
  }

  activate(planetId: string): void {
    if (this.planets.has(planetId)) this.activePlanetIds.add(planetId);
  }

  getActivePlanetIds(): ReadonlySet<string> {
    return this.activePlanetIds;
  }

  setPlanet(planet: Planet, numericId: number): void {
    planet.satellites ??= [];

    this.planets.set(planet.id, planet);
    this.idToNumeric.set(planet.id, numericId);
    this.numericToId.set(numericId, planet.id);

    this.grid.updatePlanet(planet);
  }

  removePlanet(planetId: string): void {
    const planet = this.planets.get(planetId);
    if (!planet) return;

    this.planets.delete(planetId);
    this.activePlanetIds.delete(planetId);
    
    const numericId = this.idToNumeric.get(planetId);
    if (numericId !== undefined) {
      this.numericToId.delete(numericId);
    }
    
    this.idToNumeric.delete(planetId);
    this.grid.removePlanet(planetId);
  }

  // 룸이 비었을 때 절차적(default) 행성만 메모리에서 삭제
  clearProceduralPlanetsInRoom(roomId: string): void {
    const planetsInRoom = this.grid.getPlanetsInRoom(roomId);
    for (const planet of planetsInRoom) {
      if (planet.role === "default") {
        this.removePlanet(planet.id);
      }
    }
  }

  updateGrid(planet: Planet): void {
    this.grid.updatePlanet(planet);
  }

  getPlanet(planetId: string): Planet | undefined {
    return this.planets.get(planetId);
  }

  getAllPlanets(): ReadonlyMap<string, Planet> {
    return this.planets;
  }

  getNumericId(planetId: string): number | undefined {
    return this.idToNumeric.get(planetId);
  }

  // 역할 분기 없이 숫자 ID로 바로 조회
  getPlanetIdByNumeric(numericId: number): string | undefined {
    return this.numericToId.get(numericId);
  }

  getPlanetsInRoom(roomId: string): Planet[] {
    return this.grid.getPlanetsInRoom(roomId);
  }

  getPlanetsNear(center: SectorIndices): Planet[] {
    return this.grid.getPlanetsNear(center);
  }

  getAllRooms(): Map<string, Planet[]> {
    return this.grid.getAllRooms();
  }
}