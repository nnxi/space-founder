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
  loadUserPlanet(userId: string): Promise<HydratablePlanet | null>;
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

  // 섹터별 구독자 수. 0 -> 1에서 절차적 행성 생성, 1 -> 0에서 메모리 해제
  private readonly sectorRefCounts = new Map<string, number>();

  setPersistenceAdapter(adapter: PlanetPersistenceAdapter): void {
    this.persistence = adapter;
  }

  // 단일 행성을 월드에 추가 (월드 전체를 다시 로드하지 않음)
  addPlanet(planet: Planet, numericId: number): void {
    this.store.setPlanet(planet, numericId);
  }

  // 소켓 접속 시: 내 행성만 DB에서 로드해 메모리에 올리고 물리 연산 대상으로 활성화
  async loadUserPlanet(userId: string): Promise<number | null> {
    const record = await this.persistence?.loadUserPlanet(userId);
    if (!record) return null;

    // 이미 메모리에 있으면(다중 탭, 생성 직후 접속) 재사용
    if (!this.store.getPlanetIdByNumeric(record.numericId)) {
      this.addPlanet(record.planet, record.numericId);
    }

    const planetId = this.store.getPlanetIdByNumeric(record.numericId)!;
    this.store.activate(planetId);
    return record.numericId;
  }

  // 소켓 완전 해제 시: 마지막 위치를 저장하고 메모리에서 내림
  unloadUserPlanet(numericId: number): void {
    const planetId = this.store.getPlanetIdByNumeric(numericId);
    const planet = planetId && this.store.getPlanet(planetId);
    if (!planet) return;

    this.persistPlanet(planet);
    this.store.removePlanet(planet.id);
  }

  start(onAfterTick?: TickCallback): void {
    if (this.tickTimer) return;

    this.tickTimer = setInterval(() => {
      const events = processPhysicsTick(this.store, TICK_INTERVAL_SEC);
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

  // 섹터 구독 시 호출(소켓당 섹터 1회): 첫 구독자일 때만 시드 기반으로 절차적 생성
  acquireSector(roomId: string, sector: SectorIndices): Planet[] {
    const count = this.sectorRefCounts.get(roomId) ?? 0;
    this.sectorRefCounts.set(roomId, count + 1);

    if (count === 0) {
      this.generateProceduralPlanets(roomId, sector);
    }

    return this.store.getPlanetsInRoom(roomId);
  }

  // 섹터 구독 해제 시 호출: 마지막 구독자가 나가면 절차적 행성을 메모리에서 내림
  releaseSector(roomId: string): void {
    const count = this.sectorRefCounts.get(roomId);
    if (count === undefined) return;

    if (count > 1) {
      this.sectorRefCounts.set(roomId, count - 1);
      return;
    }

    this.sectorRefCounts.delete(roomId);
    this.store.clearProceduralPlanetsInRoom(roomId);
  }

  private generateProceduralPlanets(roomId: string, sector: SectorIndices): void {
    const seed = this.getSectorSeed(sector.x, sector.y, sector.z);
    const rng = this.random(seed);
    
    // 1. 밀도 감소: 기존 0~3개(rng() * 4)에서 0~2개(rng() * 3)로 최대치 하향
    const planetCount = Math.floor(rng() * 3); 

    for (let i = 0; i < planetCount; i++) {
      // 객체 리터럴은 위에서 아래로 평가되므로 rng 호출 순서(위치→타입→색→이름)를 바꾸면 시드 결과가 달라짐
      const proceduralPlanet: Planet = {
        id: `proc_${roomId}_${i}`,
        chunkIndex: { ...sector },
        localPosition: {
          x: rng() * config.sectorSize,
          y: rng() * config.sectorSize,
          z: rng() * config.sectorSize,
        },
        velocity: { x: 0, y: 0, z: 0 },
        constellationId: getConstellationId(sector),
        radius: 1.0,
        planetType: this.getRandomPlanetType(rng),
        colorHex: this.getRandomColor(rng),
        name: this.generateAstronomicalName(rng),
        username: "Space Explorer",
        role: "default",
        satellites: [],
      };
      
      // 유저의 DB 식별자와 충돌을 방지하기 위해 음수 ID 할당
      const dummyNumericId = -(Math.abs(seed % 1000000) * 10 + i + 1);
      
      this.store.setPlanet(proceduralPlanet, dummyNumericId);
    }
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
    if (value < 0.27) return "rocky";
    if (value < 0.54) return "icy";
    if (value < 0.81) return "gaseous";
    if (value < 0.92) return "lava";
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