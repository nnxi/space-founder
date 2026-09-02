import { config } from "../config";
import { PlanetStore } from "./store";
import { processPhysicsTick } from "./physics";
import type { Planet, PlanetType, WarpRequest, WorldEvent } from "../types/planet";
import { getConstellationId } from "../utils/constellation";
import type { SectorIndices } from "../types/sector";

export interface HydratablePlanet {
  numericId: number;
  planet: Planet;
}

export interface PlanetPersistenceAdapter {
  persistPlanet(planet: Planet, numericId: number): void;
}

export type TickCallback = (
  planets: ReadonlyMap<string, Planet>,
  events: WorldEvent[],
) => void;

const TICK_INTERVAL_SEC = config.physicsTickIntervalMs / 1000;
const CORE_SECTOR: SectorIndices = { x: 0, y: 0, z: 0 };
const PLAYER_SUMMON_POSITION = { x: 500, y: 500, z: 500 };

export class WorldEngine {
  private readonly store = new PlanetStore();
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private persistence: PlanetPersistenceAdapter | null = null;

  setPersistenceAdapter(adapter: PlanetPersistenceAdapter): void {
    this.persistence = adapter;
  }

  clearProceduralPlanets(roomId: string): void {
    this.store.clearProceduralPlanetsInRoom(roomId);
  }

  // DB에 저장된 유저 데이터만 로드 (기존 NASA 행성 분산 로직 제거)
  hydrate(records: HydratablePlanet[]): void {
    this.store.clear();

    for (const { numericId, planet } of records) {
      const p = planet as any;
      
      const copy: Planet = {
        ...planet,
        chunkIndex: { ...planet.chunkIndex },
        localPosition: { ...planet.localPosition },
        velocity: { ...planet.velocity },
        satellites: p.satellites ? [...p.satellites] : [] 
      } as Planet;

      this.store.setPlanet(copy, numericId);
    }
  }

  start(onAfterTick?: TickCallback): void {
    if (this.tickTimer) return;

    this.tickTimer = setInterval(() => {
      const events = processPhysicsTick(this.store, TICK_INTERVAL_SEC, this.persistence);
      onAfterTick?.(this.store.getAllPlanets(), events);
    }, config.physicsTickIntervalMs);
  }

  stop(): void {
    if (!this.tickTimer) return;

    clearInterval(this.tickTimer);
    this.tickTimer = null;
  }

  getPlanets(): ReadonlyMap<string, Planet> {
    return this.store.getAllPlanets();
  }

  getPlanet(planetId: string): Planet | undefined {
    return this.store.getPlanet(planetId);
  }

  getNumericPlanetId(planetId: string): number {
    const numericId = this.store.getNumericId(planetId);
    if (numericId === undefined) {
      throw new Error(`Unknown planet id: ${planetId}`);
    }
    return numericId;
  }

  // 역할 분기 제거에 따른 파라미터 무효화 처리
  getPlanetIdByNumericId(numericPlanetId: number, _role?: string): string | undefined {
    return this.store.getPlanetIdByNumeric(numericPlanetId);
  }

  getPlanetsInRoom(roomId: string): Planet[] {
    return this.store.getPlanetsInRoom(roomId);
  }

  private generateAstronomicalName(rng: () => number): string {
    const prefixes = ["Kepler", "Gliese", "JWT", "NGC", "HD", "LHS", "TRAPPIST", "K2"];
    const prefix = prefixes[Math.floor(rng() * prefixes.length)];
    const number = Math.floor(rng() * 900) + 100; // 100 ~ 999
    const suffixChars = "bcdef";
    const hasSuffix = rng() > 0.5;
    const suffix = hasSuffix ? suffixChars[Math.floor(rng() * suffixChars.length)] : "";
    
    return `${prefix}-${number}${suffix}`;
  }

  // 섹터 구독 시 호출: 행성이 없으면 시드 기반으로 절차적 생성
  getOrGeneratePlanetsInSector(roomId: string, sector: SectorIndices): Planet[] {
    const existingPlanets = this.store.getPlanetsInRoom(roomId);
    const hasProceduralPlanets = existingPlanets.some(p => p.role === "default");

    if (!hasProceduralPlanets) {
      const seed = this.getSectorSeed(sector.x, sector.y, sector.z);
      const rng = this.random(seed);
      
      // 1. 밀도 감소: 기존 0~3개(rng() * 4)에서 0~2개(rng() * 3)로 최대치 하향
      const planetCount = Math.floor(rng() * 3); 

      for (let i = 0; i < planetCount; i++) {
        const proceduralPlanet: Planet = {
          id: `proc_${roomId}_${i}`,
          chunkIndex: { ...sector },
          localPosition: {
            x: rng() * config.sectorSize,
            y: rng() * config.sectorSize,
            z: rng() * config.sectorSize,
          },
          velocity: { x: 0, y: 0, z: 0 },
          constellationId: getConstellationId(sector)
        } as Planet;

        proceduralPlanet.role = "default";
        proceduralPlanet.planetType = this.getRandomPlanetType(rng);
        proceduralPlanet.colorHex = this.getRandomColor(rng);
        
        // 2. 무작위 천체 이름 할당
        // (주의: Planet 타입 정의에 planetName 필드가 없다면 추가해야 합니다)
        proceduralPlanet.name = this.generateAstronomicalName(rng);
        
        // 유저의 DB 식별자와 충돌을 방지하기 위해 음수 ID 할당
        const dummyNumericId = -(Math.abs(seed % 1000000) * 10 + i + 1);
        
        this.store.setPlanet(proceduralPlanet, dummyNumericId);
        existingPlanets.push(proceduralPlanet);
      }
    }

    return existingPlanets;
  }

  // 3차원 섹터 좌표를 단일 정수 해시 시드로 변환
  private getSectorSeed(x: number, y: number, z: number): number {
    let hash = 17;
    hash = Math.imul(hash, 31) + x;
    hash = Math.imul(hash, 31) + y;
    hash = Math.imul(hash, 31) + z;
    return hash;
  }

  // 결정론적 난수 생성기 (PRNG)
  private random(seed: number): () => number {
    let t = seed += 0x6D2B79F5;
    return () => {
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  private getRandomPlanetType(rng: () => number): PlanetType {
    const value = rng();

    // 확률 구간 설정 (총합 1.0)
    if (value < 0.25) return "rocky";
    if (value < 0.50) return "icy";
    if (value < 0.75) return "gaseous";
    if (value < 0.875) return "lava";
    return "star";
  }

  private getRandomColor(rng: () => number): string {
    const r = Math.floor(rng() * 256).toString(16).padStart(2, '0');
    const g = Math.floor(rng() * 256).toString(16).padStart(2, '0');
    const b = Math.floor(rng() * 256).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }

  getAllRooms(): Map<string, Planet[]> {
    return this.store.getAllRooms();
  }

  summonPlanetByNumericId(numericPlanetId: number): WorldEvent {
    const planetId = this.getPlanetIdByNumericId(numericPlanetId);
    if (!planetId) throw new Error(`Unknown numeric id: ${numericPlanetId}`);

    const planet = this.getPlanet(planetId);
    if (!planet) throw new Error(`Planet not found: ${planetId}`);

    const fromSector = { ...planet.chunkIndex };

    planet.chunkIndex = { ...CORE_SECTOR };
    planet.localPosition = { ...PLAYER_SUMMON_POSITION };
    planet.velocity = { x: 0, y: 0, z: 0 };
    planet.constellationId = getConstellationId(CORE_SECTOR);

    this.persistPlanet(planet);

    return {
      type: "warp",
      planetId: planet.id,
      fromSector,
      toSector: CORE_SECTOR,
    };
  }

  warpPlanetByNumericId(numericPlanetId: number): WorldEvent {
    const planetId = this.getPlanetIdByNumericId(numericPlanetId);
    if (!planetId) throw new Error(`Unknown numeric id: ${numericPlanetId}`);

    const planet = this.getPlanet(planetId);
    if (!planet) throw new Error(`Planet not found: ${planetId}`);

    const sector = { ...planet.chunkIndex };

    this.persistPlanet(planet);

    return {
      type: "warp",
      planetId: planet.id,
      fromSector: sector,
      toSector: sector,
    };
  }

  warpPlanet(request: WarpRequest): WorldEvent {
    const planet = this.getPlanet(request.planetId);
    if (!planet) throw new Error(`Unknown planet id: ${request.planetId}`);

    const fromSector = { ...planet.chunkIndex };
    const targetSector: SectorIndices = {
      x: request.targetSectorX,
      y: request.targetSectorY,
      z: request.targetSectorZ,
    };

    planet.chunkIndex = { ...targetSector };
    planet.localPosition = {
      x: Math.random() * config.sectorSize,
      y: Math.random() * config.sectorSize,
      z: Math.random() * config.sectorSize,
    };
    planet.constellationId = getConstellationId(targetSector);

    this.persistPlanet(planet);

    return {
      type: "warp",
      planetId: planet.id,
      fromSector,
      toSector: targetSector,
    };
  }

  private persistPlanet(planet: Planet): void {
    if (!this.persistence) return;
    this.persistence.persistPlanet(planet, this.getNumericPlanetId(planet.id));
  }
}